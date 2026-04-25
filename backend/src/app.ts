import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { prisma } from './config/prisma.js';
import authRoutes from './routes/authRoutes.js';
import pedidosRoutes from './routes/pedidosRoutes.js';
import motivosSugestaoRoutes from './routes/motivosSugestaoRoutes.js';
import usuariosRoutes from './routes/usuariosRoutes.js';
import gruposRoutes from './routes/gruposRoutes.js';
import relatoriosRoutes from './routes/relatoriosRoutes.js';
import meRoutes from './routes/meRoutes.js';
import statusRoutes from './routes/statusRoutes.js';
import evolutionRoutes from './routes/evolutionRoutes.js';
import comprasRoutes from './routes/comprasRoutes.js';
import integracaoRoutes from './routes/integracaoRoutes.js';
import motivosAlteracaoDataEntregaCompraRoutes from './routes/motivosAlteracaoDataEntregaCompraRoutes.js';
import engenhariaRoutes from './routes/engenhariaRoutes.js';
import sycroorderRoutes from './routes/sycroorderRoutes.js';
import mrpRoutes from './routes/mrpRoutes.js';
import mppRoutes from './routes/mppRoutes.js';
import pcRoutes from './routes/pcRoutes.js';
import programacaoSetorialRoutes from './routes/programacaoSetorialRoutes.js';
import financeiroRoutes from './routes/financeiroRoutes.js';
import { csrfProtect } from './middleware/csrf.js';

const app = express();

const __dirnameApp = path.dirname(fileURLToPath(import.meta.url));
const backendRootApp = path.join(__dirnameApp, '..');

// Atrás de nginx/IIS com HTTPS (TRUST_PROXY=true no .env) — necessário para req.secure e cookies corretos
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// Let's Encrypt HTTP-01: win-acme com --webroot = backend/var (arquivos em var/.well-known/acme-challenge/).
const acmeWellKnownRoot = path.join(backendRootApp, 'var', '.well-known');
fs.mkdirSync(path.join(acmeWellKnownRoot, 'acme-challenge'), { recursive: true });
app.use(
  '/.well-known',
  express.static(acmeWellKnownRoot, { dotfiles: 'allow', index: false, maxAge: 0 })
);

// Só ative no .env após HTTPS na 443 estar OK (senão redireciona para um site que ainda não responde em TLS).
if (process.env.FORCE_HTTPS_REDIRECT === 'true') {
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/.well-known')) return next();
    if (req.secure) return next();
    const host = (req.headers.host || '').split(':')[0];
    if (!host) return next();
    return res.redirect(301, `https://${host}${req.originalUrl || '/'}`);
  });
}

// Garante que nenhuma rota devolva 500 (evita "Internal Server Error" no frontend)
app.use((_req: express.Request, res: express.Response, next: express.NextFunction) => {
  const origStatus = res.status.bind(res);
  res.status = function (code: number | undefined) {
    if (code === 500) code = 503;
    return origStatus(code as number);
  };
  const origWriteHead = res.writeHead.bind(res);
  res.writeHead = function (this: express.Response, statusCode: number, ...args: unknown[]) {
    if (statusCode === 500) statusCode = 503;
    return origWriteHead(statusCode, ...args);
  };
  // Intercepta atribuição direta a statusCode (ex.: handler de erro padrão do Express)
  let statusCodeValue = (res as express.Response & { statusCode: number }).statusCode;
  Object.defineProperty(res, 'statusCode', {
    get() {
      return statusCodeValue;
    },
    set(v: number) {
      statusCodeValue = v === 500 ? 503 : v;
    },
    enumerable: true,
    configurable: true,
  });
  // Última linha de defesa: ao enviar a resposta, se status for 500 vira 503
  const origEnd = res.end.bind(res);
  (res.end as (chunk?: unknown, encoding?: unknown, cb?: unknown) => express.Response) = function (...args: unknown[]) {
    if (statusCodeValue === 500) statusCodeValue = 503;
    return origEnd(...(args as Parameters<typeof origEnd>));
  };
  // Intercepta res.send/res.json (Express usa statusCode ao enviar)
  const origSend = res.send.bind(res);
  res.send = function (body?: unknown) {
    if (statusCodeValue === 500) statusCodeValue = 503;
    return origSend(body);
  };
  next();
});

// CORS: permite qualquer origem (acesso interno e externo). Reflete a origem para credentials.
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
  })
);

// GET /auth/ping — só CORS (sem cookieParser/body/csrf) para nunca dar 500
app.get('/auth/ping', (_req: express.Request, res: express.Response) => {
  try {
    if (!res.headersSent) res.status(200).json({ ok: true, msg: 'Backend OK' });
  } catch {
    if (!res.headersSent) res.status(503).json({ error: 'Serviço indisponível.' });
  }
});

app.use(cookieParser());

// Body JSON: em erro de parsing definimos req.body = {} (nunca repassar erro)
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Aumentamos o limite para suportar uploads de importação (arquivos de pedidos em lote).
  express.json({ limit: '1mb' })(req, res, (err: unknown) => {
    if (err) (req as express.Request & { body?: unknown }).body = {};
    next();
  });
});
app.use(csrfProtect);

// Rotas públicas (login, logout, csrf)
app.use('/auth', authRoutes);

// Rotas protegidas (API)
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/motivos-sugestao', motivosSugestaoRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/grupos', gruposRoutes);
app.use('/api/relatorios', relatoriosRoutes);
app.use('/api/me', meRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/evolution', evolutionRoutes);
app.use('/api/compras', comprasRoutes);
app.use('/api/integracao', integracaoRoutes);
app.use('/api/integracao/motivos-alteracao-data-entrega-compra', motivosAlteracaoDataEntregaCompraRoutes);
app.use('/api/engenharia', engenhariaRoutes);
app.use('/api/sycroorder', sycroorderRoutes);
app.use('/api/mrp', mrpRoutes);
app.use('/api/mpp', mppRoutes);
app.use('/api/pc', pcRoutes);
app.use('/api/programacao-setorial', programacaoSetorialRoutes);
app.use('/api/financeiro', financeiroRoutes);

// Header em todas as respostas para conferir na outra máquina se está rodando o build novo
export const BUILD_ID = 'pedidos-no-csrf-v1';
app.use((_req, res, next) => {
  res.setHeader('X-Build', BUILD_ID);
  next();
});

// Health (inclui teste do banco para diagnóstico)
app.get('/health', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  let db: 'ok' | 'erro' = 'ok';
  try {
    await prisma.usuario.count();
  } catch (e) {
    db = 'erro';
    console.error('[health] Banco falhou:', (e as Error)?.message);
  }
  res.json({ ok: true, build: BUILD_ID, db });
});

// Frontend estático (build em backend/public). Também com "npm run dev" na raiz: NODE_ENV pode vir
// como development do processo pai e o .env não sobrescreve (override:false) — o site no domínio :80→:4000 ficaria sem SPA.
const publicDir = path.join(backendRootApp, 'public');
const spaIndex = path.join(publicDir, 'index.html');
if (fs.existsSync(spaIndex)) {
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => {
    res.sendFile(spaIndex);
  });
}

// Tratamento global de erros (503 para não quebrar frontend com "500 Internal Server Error")
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('[Express] Erro não tratado:', msg);
  try {
    if (!res.headersSent) {
      res.status(503).json({ error: 'Serviço temporariamente indisponível. Tente novamente.' });
    }
  } catch (e) {
    console.error('[Express] Erro ao enviar resposta de erro:', (e as Error)?.message);
  }
});

export default app;
