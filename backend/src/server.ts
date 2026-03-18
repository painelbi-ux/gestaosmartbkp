import './load-dotenv.js';
// Garante que NENHUM 500 saia do processo (patch no Node antes do Express)
import http from 'http';
const origWriteHead = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (
  this: http.ServerResponse,
  statusCode: number,
  ...args: unknown[]
) {
  if (statusCode === 500) statusCode = 503;
  return (origWriteHead as (...a: unknown[]) => unknown).apply(this, [statusCode, ...args]) as ReturnType<typeof origWriteHead>;
};

import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';
import { loadEnv } from './config/env.js';
import { prisma } from './config/prisma.js';
import app, { BUILD_ID } from './app.js';
import { iniciarCronFaturamentoDiario } from './scheduler/faturamentoDiarioCron.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

// Evita que o processo caia silenciosamente por erros não tratados
function setupProcessHandlers(): void {
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err?.message ?? err);
    if (err && typeof (err as NodeJS.ErrnoException).stack !== 'undefined') {
      console.error((err as Error).stack);
    }
    setTimeout(() => process.exit(1), 500);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[unhandledRejection]', reason);
    setTimeout(() => process.exit(1), 500);
  });
}
setupProcessHandlers();

async function ensureDbReady(): Promise<void> {
  try {
    await execAsync('npx prisma migrate deploy', { cwd: backendRoot });
  } catch (e) {
    console.warn('[startup] Migrate deploy falhou (pode ser normal na primeira vez):', (e as Error)?.message ?? e);
  }
  const userCount = await prisma.usuario.count().catch(() => 0);
  if (userCount === 0) {
    console.log('[startup] Nenhum usuário na base; executando seed (master/123, admin/admin123)...');
    try {
      await execAsync('npx tsx prisma/seed.ts', { cwd: backendRoot });
    } catch (e) {
      console.error('[startup] Erro ao executar seed:', (e as Error)?.message ?? e);
    }
  }
}

function main(): void {
  let env;
  try {
    env = loadEnv();
  } catch (e) {
    console.error('[startup] Erro ao carregar .env:', (e as Error)?.message ?? e);
    process.exit(1);
  }

  // No dev via raiz (npm run dev), run-backend-loop passa APP_PORT=4000; load-dotenv usa override:false para não sobrescrever
  const port = env.APP_PORT;
  if (process.env.NODE_ENV !== 'production' && port !== 4000) {
    console.warn(`[startup] Backend na porta ${port}. Proxy e wait-on esperam 4000 — use APP_PORT=4000 ou rode "npm run dev" na raiz.`);
  }
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor rodando em http://0.0.0.0:${port} (acessível na rede)`);
    console.log(`Build: ${BUILD_ID} - confira em http://localhost:${port}/health`);
    // Migrations/seed em segundo plano para não bloquear o callback de listen
    ensureDbReady()
      .then(() => {
        console.log('[startup] Banco verificado.');
        iniciarCronFaturamentoDiario();
      })
      .catch((e) => {
        console.warn('[startup] ensureDbReady falhou (servidor já no ar):', (e as Error)?.message ?? e);
      });
  });

  // Evita que conexões idle sejam fechadas e causem "servidor offline" após tempo
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error('[startup] Erro ao subir servidor:', err.message);
    if (err.code === 'EADDRINUSE') {
      console.error(`Porta ${port} já está em uso. Encerre o processo que a usa ou use outra porta.`);
    }
    process.exit(1);
  });
}

main();
