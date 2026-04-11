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
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
var __dirname = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig(function (_a) {
    var _b;
    var mode = _a.mode;
    var env = loadEnv(mode, __dirname, '');
    var disableHmr = env.VITE_DISABLE_HMR === 'true';
    var hmrClientPort = env.VITE_HMR_CLIENT_PORT ? parseInt(env.VITE_HMR_CLIENT_PORT, 10) : undefined;
    var devOrigin = ((_b = env.VITE_DEV_ORIGIN) === null || _b === void 0 ? void 0 : _b.trim()) || undefined;
    var server = {
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
                    proxy.on('error', function (_err, _req, res) {
                        var now = Date.now();
                        if (now - lastApiLog >= API_LOG_INTERVAL_MS) {
                            lastApiLog = now;
                            console.warn('[proxy /api] Backend inacessível (porta 4000). Confira se o backend está rodando.');
                        }
                        if (res && !res.headersSent)
                            res
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
                configure: function (proxy) {
                    var lastAuthLog = 0;
                    var AUTH_LOG_INTERVAL_MS = 15000;
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
                    proxy.on('error', function (_err, _req, res) {
                        var now = Date.now();
                        if (now - lastAuthLog >= AUTH_LOG_INTERVAL_MS) {
                            lastAuthLog = now;
                            console.warn('[proxy /auth] Backend inacessível (porta 4000). Confira se o backend está rodando.');
                        }
                        if (res && !res.headersSent)
                            res
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
    };
    // Acesso http://dominio/ (NAT WAN:80 -> Vite:5173): o browser pensa que está na 80, mas o HMR
    // tenta ws na 5173 (fechada no router) → página em branco. Desative HMR ou use VITE_HMR_CLIENT_PORT=80.
    if (disableHmr) {
        server.hmr = false;
    }
    else if (hmrClientPort) {
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
        server: server,
    };
});
