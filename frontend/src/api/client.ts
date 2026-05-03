/**
 * Cliente API com credenciais (cookies + Bearer token) e CSRF.
 * Sem VITE_API_URL: usa a mesma origem (5180 ou 5173/5174/5051); o proxy encaminha /api e /auth para a 4000.
 * Com VITE_API_URL: usa a URL definida (ex: http://10.80.1.187:4000).
 *
 * Se VITE_API_URL for http://localhost:4000 (ou 127.0.0.1) mas a página estiver em http://IP:5180,
 * o browser trataria "localhost" como o PC do usuário — falha de rede. Nesse caso retornamos base
 * vazia para usar o proxy do Vite no servidor (que fala com 127.0.0.1:4000 na máquina certa).
 */
export function getApiBase(): string {
  const raw =
    typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
      ? String(import.meta.env.VITE_API_URL).trim().replace(/\/$/, '')
      : '';
  if (!raw) return '';
  if (typeof window === 'undefined') return raw;
  try {
    const u = new URL(raw);
    const backendIsLoopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    const pageHost = window.location.hostname;
    const pageIsLan = pageHost !== 'localhost' && pageHost !== '127.0.0.1';
    if (backendIsLoopback && pageIsLan) return '';
  } catch {
    return raw;
  }
  return raw;
}
const TOKEN_KEY = 'gestor_token';

/** Disparado quando o token é limpo (logout ou 401); a app volta ao login na raiz `/` sem recarregar a página. */
export const SESSION_CLEARED_EVENT = 'gestor:session-cleared';

export function notifySessionCleared(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SESSION_CLEARED_EVENT));
}

let csrfToken: string | null = null;
let authToken: string | null = null;

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getStoredToken(): string | null {
  if (authToken) return authToken;
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const base = getApiBase();
  const res = await fetch(`${base}/auth/csrf`, { credentials: 'include' });
  if (!res.ok) throw new Error('Falha ao obter CSRF');
  const data = await res.json();
  csrfToken = data.csrf_token ?? null;
  return csrfToken!;
}

export async function apiFetch(
  path: string,
  options: RequestInit & { method?: string; body?: unknown } = {}
): Promise<Response> {
  const { method = 'GET', body, ...rest } = options;
  const headers: HeadersInit = {
    ...((rest.headers as Record<string, string>) ?? {}),
  };
  const isAuthRoute = path.startsWith('/auth/login') || path.startsWith('/auth/logout');
  // Envia o JWT no header para garantir que a API aceite (evita problema de cookie no proxy)
  const token = getStoredToken();
  if (token && !isAuthRoute) headers['Authorization'] = `Bearer ${token}`;
  if (body && method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET' && !isAuthRoute) {
    const csrf = await getCsrfToken();
    if (csrf) headers['x-csrf-token'] = csrf;
  }
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, {
    ...rest,
    method,
    credentials: 'include',
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  // Se não autorizado, limpa token e manda para login (só se não estiver já na página de login — evita loop)
  if (res.status === 401) {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
      setAuthToken(null);
    } catch {}
    notifySessionCleared();
  }
  return res;
}

export async function apiJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Erro na requisição');
  }
  return res.json();
}
