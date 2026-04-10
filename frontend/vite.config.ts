import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import type { UserConfig } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const disableHmr = env.VITE_DISABLE_HMR === 'true';
  const hmrClientPort = env.VITE_HMR_CLIENT_PORT ? parseInt(env.VITE_HMR_CLIENT_PORT, 10) : undefined;
  const devOrigin = env.VITE_DEV_ORIGIN?.trim() || undefined;

  const server: NonNullable<UserConfig['server']> = {
    port: 5180, // interno; externos: npm run dev:frontend:5173 | :5174 | :5051
    host: '0.0.0.0',
    strictPort: true,
    // true = qualquer Host — http://gsmartsoaco.com.br:5173 (ou :5174 :5051)
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
        timeout: 120000,
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            const clientRes = res as import('http').ServerResponse;
            const status = proxyRes.statusCode === 500 ? 503 : proxyRes.statusCode;
            const headers = { ...proxyRes.headers };
            const setCookie = headers['set-cookie'];
            if (Array.isArray(setCookie)) {
              headers['set-cookie'] = setCookie.map((c: string) =>
                c.replace(/;\s*Domain=[^;]+/i, '')
              );
            }
            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('end', () => {
              const body = Buffer.concat(chunks);
              if (!clientRes.headersSent) {
                clientRes.writeHead(status, headers);
                clientRes.end(body);
              }
            });
          });
          let lastApiLog = 0;
          const API_LOG_INTERVAL_MS = 15000;
          proxy.on('error', (_err, _req, res) => {
            const now = Date.now();
            if (now - lastApiLog >= API_LOG_INTERVAL_MS) {
              lastApiLog = now;
              console.warn('[proxy /api] Backend inacessível (porta 4000). Confira se o backend está rodando.');
            }
            if (res && !(res as import('http').ServerResponse).headersSent)
              (res as import('http').ServerResponse)
                .writeHead(503, { 'Content-Type': 'application/json' })
                .end(JSON.stringify({ error: 'Servidor indisponível.' }));
          });
        },
      },
      '/auth': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
        timeout: 120000,
        selfHandleResponse: true,
        configure: (proxy) => {
          let lastAuthLog = 0;
          const AUTH_LOG_INTERVAL_MS = 15000;
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            const clientRes = res as import('http').ServerResponse;
            const status = proxyRes.statusCode === 500 ? 503 : proxyRes.statusCode;
            const headers = { ...proxyRes.headers };
            const setCookie = headers['set-cookie'];
            if (Array.isArray(setCookie)) {
              headers['set-cookie'] = setCookie.map((c: string) =>
                c.replace(/;\s*Domain=[^;]+/i, '')
              );
            }
            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('end', () => {
              const body = Buffer.concat(chunks);
              if (!clientRes.headersSent) {
                clientRes.writeHead(status, headers);
                clientRes.end(body);
              }
            });
          });
          proxy.on('error', (_err, _req, res) => {
            const now = Date.now();
            if (now - lastAuthLog >= AUTH_LOG_INTERVAL_MS) {
              lastAuthLog = now;
              console.warn('[proxy /auth] Backend inacessível (porta 4000). Confira se o backend está rodando.');
            }
            if (res && !(res as import('http').ServerResponse).headersSent)
              (res as import('http').ServerResponse)
                .writeHead(503, { 'Content-Type': 'application/json' })
                .end(JSON.stringify({ error: 'Servidor indisponível.' }));
          });
        },
      },
      '/health': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        timeout: 10000,
        selfHandleResponse: true,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            const clientRes = res as import('http').ServerResponse;
            const status = proxyRes.statusCode === 500 ? 503 : (proxyRes.statusCode ?? 200);
            const headers = { ...proxyRes.headers };
            const chunks: Buffer[] = [];
            proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on('end', () => {
              const body = Buffer.concat(chunks);
              if (!clientRes.headersSent) {
                clientRes.writeHead(status, headers);
                clientRes.end(body);
              }
            });
          });
          proxy.on('error', (_err, _req, res) => {
            if (res && !(res as import('http').ServerResponse).headersSent) {
              (res as import('http').ServerResponse)
                .writeHead(503, { 'Content-Type': 'application/json' })
                .end(JSON.stringify({ ok: false, error: 'Backend indisponível.' }));
            }
          });
        },
      },
    },
  };

  // Acesso http://dominio/ (NAT WAN:80 -> Vite:5173): o browser pensa que está na 80, mas o HMR
  // tenta ws na 5173 (fechada no router) → página em branco. Desative HMR ou use VITE_HMR_CLIENT_PORT=80.
  if (disableHmr) {
    server.hmr = false;
  } else if (hmrClientPort) {
    server.hmr = { clientPort: hmrClientPort };
  }

  if (devOrigin) {
    server.origin = devOrigin;
  }

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server,
  };
});
