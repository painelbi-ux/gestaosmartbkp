import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5180, // interno; --port 5173 no script dev:frontend:externo
    host: '0.0.0.0', // escuta em todas as interfaces (interno 5180 + externo 5173)
    strictPort: true, // falha se a porta estiver em uso (predev libera antes)
    // true = qualquer Host (domínio, IP público, LAN) — necessário para http://gsmartsoaco.com.br:5173
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
        timeout: 120000,
        selfHandleResponse: true, // reescreve 500→503 antes de enviar ao cliente
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
          proxy.on('error', (err, _req, res) => {
            const now = Date.now();
            if (now - lastApiLog >= API_LOG_INTERVAL_MS) {
              lastApiLog = now;
              console.warn('[proxy /api] Backend inacessível (porta 4000). Confira se o backend está rodando.');
            }
            if (res && !(res as import('http').ServerResponse).headersSent) (res as import('http').ServerResponse).writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Servidor indisponível.' }));
          });
        },
      },
      '/auth': {
        target: 'http://127.0.0.1:4000',
        changeOrigin: true,
        secure: false,
        timeout: 120000,
        selfHandleResponse: true, // reescreve 500→503 antes de enviar ao cliente
        configure: (proxy) => {
          let lastAuthLog = 0;
          const AUTH_LOG_INTERVAL_MS = 15000;
          proxy.on('proxyRes', (proxyRes, req, res) => {
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
          proxy.on('error', (err, _req, res) => {
            const now = Date.now();
            if (now - lastAuthLog >= AUTH_LOG_INTERVAL_MS) {
              lastAuthLog = now;
              console.warn('[proxy /auth] Backend inacessível (porta 4000). Confira se o backend está rodando.');
            }
            if (res && !(res as import('http').ServerResponse).headersSent) (res as import('http').ServerResponse).writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Servidor indisponível.' }));
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
  },
});
