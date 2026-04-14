/**
 * Watchdog: a cada intervalo testa /auth/ping e login.
 * Se falhar (não 2xx ou conexão recusada), mata o processo na porta 4000
 * para o run-backend-loop reiniciar o backend.
 */
const INTERVAL_MS = 25 * 1000; // 25 segundos
const API_BASE = 'http://127.0.0.1:4000';
const PING_URL = `${API_BASE}/auth/ping`;
const LOGIN_URL = `${API_BASE}/auth/login`;
const PORT = 4000;
const MAX_CONSECUTIVE_FAILURES = 3;
let consecutiveFailures = 0;

function killPort(port) {
  const { execSync } = require('child_process');
  const isWin = process.platform === 'win32';
  try {
    if (isWin) {
      execSync(
        `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`,
        { stdio: 'inherit' }
      );
    } else {
      const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
      if (pids) execSync(`kill -9 ${pids}`, { stdio: 'inherit' });
    }
    console.warn(`[watchdog] Porta ${port} liberada. Backend será reiniciado pelo run-backend-loop.`);
  } catch (e) {
    // nada na porta ou já morreu
  }
}

function timeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

async function checkPing() {
  try {
    const res = await fetch(PING_URL, { method: 'GET', signal: timeoutSignal(8000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function checkLogin() {
  try {
    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'master', senha: '123' }),
      signal: timeoutSignal(10000),
    });
    // 200 = OK, 401 = credenciais inválidas (servidor está OK)
    if (res.ok || res.status === 401) return true;
    // 5xx ou outro erro = servidor com problema
    if (res.status >= 500) return false;
    return true;
  } catch {
    return false;
  }
}

async function runCheck() {
  const pingOk = await checkPing();
  if (!pingOk) {
    consecutiveFailures += 1;
    console.warn(`[watchdog] /auth/ping falhou (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}).`);
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.warn('[watchdog] Falhas consecutivas no ping. Reiniciando backend...');
      killPort(PORT);
      consecutiveFailures = 0;
    }
    return;
  }

  const loginOk = await checkLogin();
  if (!loginOk) {
    consecutiveFailures += 1;
    console.warn(`[watchdog] Login de teste falhou (5xx) (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}).`);
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.warn('[watchdog] Falhas consecutivas no login de teste. Reiniciando backend...');
      killPort(PORT);
      consecutiveFailures = 0;
    }
    return;
  }

  if (consecutiveFailures > 0) {
    console.log('[watchdog] Backend respondeu novamente. Zerando contador de falhas.');
  }
  consecutiveFailures = 0;
}

function main() {
  const FIRST_CHECK_DELAY_MS = 20 * 1000; // primeiro check após cold start (backend sobe em paralelo com o Vite)
  console.log('[watchdog] Ativo: testando ping e login a cada', INTERVAL_MS / 1000, 's. Falha = reinicia backend.');
  setTimeout(() => {
    runCheck();
    setInterval(runCheck, INTERVAL_MS);
  }, FIRST_CHECK_DELAY_MS);
}

main();
