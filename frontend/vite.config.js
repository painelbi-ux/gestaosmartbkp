var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
        // Acesso externo: permitir qualquer host (evita "Invalid Host header" ao acessar por IP)
        allowedHosts: true,
        proxy: {
            '/api': {
                target: 'http://127.0.0.1:4000',
                changeOrigin: true,
                secure: false,
                timeout: 120000,
                selfHandleResponse: true, // reescreve 500→503 antes de enviar ao cliente
                configure: function (proxy) {
                    proxy.on('proxyRes', function (proxyRes, _req, res) {
                        var clientRes = res;
                        var status = proxyRes.statusCode === 500 ? 503 : proxyRes.statusCode;
                        var headers = __assign({}, proxyRes.headers);
                        var setCookie = headers['set-cookie'];
                        if (Array.isArray(setCookie)) {
                            headers['set-cookie'] = setCookie.map(function (c) {
                                return c.replace(/;\s*Domain=[^;]+/i, '');
                            });
                        }
                        var chunks = [];
                        proxyRes.on('data', function (chunk) { return chunks.push(chunk); });
                        proxyRes.on('end', function () {
                            var body = Buffer.concat(chunks);
                            if (!clientRes.headersSent) {
                                clientRes.writeHead(status, headers);
                                clientRes.end(body);
                            }
                        });
                    });
                    var lastApiLog = 0;
                    var API_LOG_INTERVAL_MS = 15000;
                    proxy.on('error', function (err, _req, res) {
                        var now = Date.now();
                        if (now - lastApiLog >= API_LOG_INTERVAL_MS) {
                            lastApiLog = now;
                            console.warn('[proxy /api] Backend inacessível (porta 4000). Confira se o backend está rodando.');
                        }
                        if (res && !res.headersSent)
                            res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Servidor indisponível.' }));
                    });
                },
            },
            '/auth': {
                target: 'http://127.0.0.1:4000',
                changeOrigin: true,
                secure: false,
                timeout: 120000,
                selfHandleResponse: true, // reescreve 500→503 antes de enviar ao cliente
                configure: function (proxy) {
                    var lastAuthLog = 0;
                    var AUTH_LOG_INTERVAL_MS = 15000;
                    proxy.on('proxyRes', function (proxyRes, req, res) {
                        var clientRes = res;
                        var status = proxyRes.statusCode === 500 ? 503 : proxyRes.statusCode;
                        var headers = __assign({}, proxyRes.headers);
                        var setCookie = headers['set-cookie'];
                        if (Array.isArray(setCookie)) {
                            headers['set-cookie'] = setCookie.map(function (c) {
                                return c.replace(/;\s*Domain=[^;]+/i, '');
                            });
                        }
                        var chunks = [];
                        proxyRes.on('data', function (chunk) { return chunks.push(chunk); });
                        proxyRes.on('end', function () {
                            var body = Buffer.concat(chunks);
                            if (!clientRes.headersSent) {
                                clientRes.writeHead(status, headers);
                                clientRes.end(body);
                            }
                        });
                    });
                    proxy.on('error', function (err, _req, res) {
                        var now = Date.now();
                        if (now - lastAuthLog >= AUTH_LOG_INTERVAL_MS) {
                            lastAuthLog = now;
                            console.warn('[proxy /auth] Backend inacessível (porta 4000). Confira se o backend está rodando.');
                        }
                        if (res && !res.headersSent)
                            res.writeHead(503, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Servidor indisponível.' }));
                    });
                },
            },
            '/health': {
                target: 'http://127.0.0.1:4000',
                changeOrigin: true,
                timeout: 10000,
                selfHandleResponse: true,
                configure: function (proxy) {
                    proxy.on('proxyRes', function (proxyRes, _req, res) {
                        var _a;
                        var clientRes = res;
                        var status = proxyRes.statusCode === 500 ? 503 : ((_a = proxyRes.statusCode) !== null && _a !== void 0 ? _a : 200);
                        var headers = __assign({}, proxyRes.headers);
                        var chunks = [];
                        proxyRes.on('data', function (chunk) { return chunks.push(chunk); });
                        proxyRes.on('end', function () {
                            var body = Buffer.concat(chunks);
                            if (!clientRes.headersSent) {
                                clientRes.writeHead(status, headers);
                                clientRes.end(body);
                            }
                        });
                    });
                    proxy.on('error', function (_err, _req, res) {
                        if (res && !res.headersSent) {
                            res
                                .writeHead(503, { 'Content-Type': 'application/json' })
                                .end(JSON.stringify({ ok: false, error: 'Backend indisponível.' }));
                        }
                    });
                },
            },
        },
    },
});
