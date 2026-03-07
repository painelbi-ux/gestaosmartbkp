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
import { csrfProtect } from './middleware/csrf.js';

const app = express();

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
  express.json()(req, res, (err: unknown) => {
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

// Em produção, serve o frontend estático (após build)
if (process.env.NODE_ENV === 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
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
