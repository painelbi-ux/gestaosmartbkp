import { apiFetch, getApiBase, setCsrfToken, setAuthToken, notifySessionCleared } from './client';

export interface LoginResponse {
  ok: boolean;
  login: string;
  csrf_token: string;
  token?: string;
  must_change_password?: boolean;
}

const TOKEN_KEY = 'gestor_token';

const HINT = ' Na pasta raiz execute: npm run dev';

export async function login(loginUser: string, senha: string): Promise<LoginResponse> {
  let res: Response;
  try {
    res = await apiFetch('/auth/login', {
      method: 'POST',
      body: { login: loginUser, senha },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('fetch') ||
      msg.includes('Failed') ||
      msg.includes('Network') ||
      msg.includes('CONNECTION_REFUSED') ||
      msg.includes('Connection refused')
    ) {
      throw new Error('Não foi possível conectar ao servidor.' + HINT);
    }
    throw err;
  }
  const text = await res.text();
  if (!res.ok) {
    let body: { error?: string } = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      if (res.status >= 500 || res.status === 503) {
        throw new Error('Servidor indisponível. Tente novamente.' + HINT);
      }
    }
    const msg = body.error;
    // 503 = serviço indisponível (backend não quebra com 500)
    if (res.status === 503) {
      throw new Error((msg ?? 'Servidor temporariamente indisponível.') + HINT);
    }
    if (res.status >= 500) {
      throw new Error((msg ?? 'Erro no servidor. Tente novamente.') + HINT);
    }
    throw new Error(msg ?? 'Login ou senha inválidos.');
  }
  const data = JSON.parse(text) as LoginResponse;
  if (data.csrf_token) setCsrfToken(data.csrf_token);
  if (data.token) {
    sessionStorage.setItem(TOKEN_KEY, data.token);
    setAuthToken(data.token);
  }
  return data;
}

const PING_RETRIES = 3;
const PING_DELAY_MS = 800;
const PING_TIMEOUT_MS = 5000;

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal && typeof (AbortSignal as { timeout?: (ms: number) => AbortSignal }).timeout === 'function') {
    return (AbortSignal as { timeout: (ms: number) => AbortSignal }).timeout(ms);
  }
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  (c.signal as AbortSignal & { _clear?: () => void })._clear = () => clearTimeout(t);
  return c.signal;
}

/** Verifica se o backend está respondendo (para mostrar aviso na tela de login). Com retry para evitar "offline" por falha momentânea. */
export async function pingServer(): Promise<boolean> {
  const base = getApiBase();
  const url = `${base}/auth/ping`;
  for (let i = 0; i < PING_RETRIES; i++) {
    try {
      const signal = timeoutSignal(PING_TIMEOUT_MS);
      const res = await fetch(url, { method: 'GET', credentials: 'include', signal });
      if (res.ok) return true;
    } catch {
      // falha de rede ou timeout
    }
    if (i < PING_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, PING_DELAY_MS));
    }
  }
  return false;
}

export async function logout(): Promise<void> {
  sessionStorage.removeItem(TOKEN_KEY);
  setAuthToken(null);
  notifySessionCleared();
  await apiFetch('/auth/logout', { method: 'POST' });
}

export async function checkAuth(): Promise<boolean> {
  const res = await apiFetch('/api/me', { method: 'GET' });
  return res.ok;
}

export interface MeResponse {
  login: string;
  nome: string | null;
  grupo: string | null;
  isCommercialTeam?: boolean;
  mustChangePassword?: boolean;
  permissoes: string[];
  /** Rota (pathname) para abrir após login quando definida no grupo do usuário. */
  telaInicialPath?: string | null;
}

export async function getMe(): Promise<MeResponse> {
  const res = await apiFetch('/api/me');
  if (!res.ok) {
    if (res.status === 401) throw new Error('Não autorizado');
    throw new Error(`Falha ao carregar usuário (${res.status})`);
  }
  return res.json();
}

export async function changeMyPassword(payload: {
  senhaAtual: string;
  novaSenha: string;
  confirmarNovaSenha: string;
}): Promise<void> {
  const res = await apiFetch('/api/me/change-password', {
    method: 'POST',
    body: payload,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Erro ao alterar senha.' }));
    throw new Error((err as { error?: string }).error ?? 'Erro ao alterar senha.');
  }
}
