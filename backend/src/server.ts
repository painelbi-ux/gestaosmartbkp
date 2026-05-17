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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';
import { loadEnv } from './config/env.js';
import { prisma } from './config/prisma.js';
import app, { BUILD_ID } from './app.js';
import { iniciarCronFaturamentoDiario } from './scheduler/faturamentoDiarioCron.js';
import { backfillAguardaRespostaLabelsForPendingOrders } from './services/sycroOrderAguardaRespostaLabel.js';
import { ensureGrupoMaster } from './config/ensureGrupoMaster.js';

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
  try {
    await ensureGrupoMaster();
  } catch (e) {
    console.warn('[startup] ensureGrupoMaster:', (e as Error)?.message ?? e);
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
      .then(async () => {
        console.log('[startup] Banco verificado.');
        try {
          const r = await backfillAguardaRespostaLabelsForPendingOrders();
          if (r.updated > 0) {
            console.log(
              `[startup] SycroOrder: rótulos "aguarda resposta" recalculados em ${r.updated} de ${r.scanned} card(s) com pendência.`
            );
          }
        } catch (e) {
          console.warn('[startup] Backfill aguarda resposta SycroOrder:', (e as Error)?.message ?? e);
        }
        iniciarCronFaturamentoDiario();
      })
      .catch((e) => {
        console.warn('[startup] ensureDbReady falhou (servidor já no ar):', (e as Error)?.message ?? e);
      });
  });

  // Evita que conexões idle sejam fechadas e causem "servidor offline" após tempo
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  // Operações longas (Nomus / MRP) podem demorar vários minutos sem enviar bytes — padrão Node ~5 min corta a requisição ("Failed to fetch").
  server.requestTimeout = 0;

  server.on('error', (err: NodeJS.ErrnoException) => {
    console.error('[startup] Erro ao subir servidor:', err.message);
    if (err.code === 'EADDRINUSE') {
      console.error(`Porta ${port} já está em uso. Encerre o processo que a usa ou use outra porta.`);
    }
    process.exit(1);
  });

  startHttpsIfConfigured();
}

/** HTTPS direto no Node (sem nginx). PEM em deploy/ssl/ ou SSL_CERT_FILE / SSL_KEY_FILE; MikroTik: NAT TCP 443 → este host. */
function startHttpsIfConfigured(): void {
  const deploySsl = path.join(backendRoot, '..', 'deploy', 'ssl');
  const pairs: { cert: string; key: string }[] = [];
  if (process.env.SSL_CERT_FILE && process.env.SSL_KEY_FILE) {
    pairs.push({ cert: process.env.SSL_CERT_FILE, key: process.env.SSL_KEY_FILE });
  }
  pairs.push(
    { cert: path.join(deploySsl, 'fullchain.pem'), key: path.join(deploySsl, 'privkey.pem') },
    { cert: path.join(deploySsl, 'gsmartsoaco-chain.pem'), key: path.join(deploySsl, 'gsmartsoaco-key.pem') }
  );
  let certFile = '';
  let keyFile = '';
  for (const p of pairs) {
    if (fs.existsSync(p.cert) && fs.existsSync(p.key)) {
      certFile = p.cert;
      keyFile = p.key;
      break;
    }
  }
  if (!certFile || !keyFile) {
    console.log(
      '[startup] HTTPS não iniciado: defina SSL_CERT_FILE/SSL_KEY_FILE ou coloque PEM em deploy/ssl (ex.: fullchain.pem + privkey.pem; win-acme: gsmartsoaco-chain.pem + gsmartsoaco-key.pem).'
    );
    return;
  }
  const sslPort = Number(process.env.SSL_PORT || '443');
  let credentials: { cert: string; key: string };
  try {
    credentials = {
      cert: fs.readFileSync(certFile, 'utf8'),
      key: fs.readFileSync(keyFile, 'utf8'),
    };
  } catch (e) {
    console.error('[startup] Falha ao ler certificados SSL:', (e as Error).message);
    return;
  }
  const httpsServer = https.createServer(credentials, app);
  httpsServer.keepAliveTimeout = 65000;
  httpsServer.headersTimeout = 66000;
  httpsServer.requestTimeout = 0;
  httpsServer.listen(sslPort, '0.0.0.0', () => {
    console.log(`HTTPS em https://0.0.0.0:${sslPort} (domínio gsmartsoaco.com.br)`);
  });
  httpsServer.on('error', (err: NodeJS.ErrnoException) => {
    console.error('[startup] Erro ao subir HTTPS:', err.message);
    if (err.code === 'EACCES') {
      console.error('Porta 443 costuma exigir executar o Node como Administrador ou usar SSL_PORT=8443 + portproxy 443→8443.');
    }
  });
}

main();
