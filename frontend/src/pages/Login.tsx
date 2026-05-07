import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, checkAuth, pingServer, getMe } from '../api/auth';
import { getStoredToken } from '../api/client';
import { z } from 'zod';
import { useAuth } from '../contexts/AuthContext';

const loginSchema = z.object({
  login: z.string().min(1, 'Login é obrigatório'),
  senha: z.string().min(1, 'Senha é obrigatória'),
});

/** Cores do padrão visual Só Aço: fundo azul escuro (opaco/mate) e branco. */
const BRAND = {
  bg: '#0a1122',
  card: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.12)',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.75)',
  inputBg: 'rgba(255,255,255,0.08)',
  inputBorder: 'rgba(255,255,255,0.2)',
  focusRing: 'rgba(255,255,255,0.35)',
  primary: '#3b82f6',
  primaryHover: '#2563eb',
};

export default function Login() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [loginUser, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showCard, setShowCard] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  // Ping rápido: aviso "servidor offline" aparece cedo; retries cobrem backend que sobe logo após `npm run dev`.
  const PING_INITIAL_DELAY_MS = 600;
  useEffect(() => {
    const t = setTimeout(() => {
      pingServer().then(setServerOnline);
    }, PING_INITIAL_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Quando estiver "offline", reverificar a cada 15s (evita enxurrada de erros no console)
  useEffect(() => {
    if (serverOnline !== false) return;
    const t = setInterval(() => {
      pingServer().then((ok) => {
        if (ok) setServerOnline(true);
      });
    }, 15000);
    return () => clearInterval(t);
  }, [serverOnline]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setCheckingAuth(false);
      return;
    }
    checkAuth()
      .then((ok) => {
        if (ok) navigate('/', { replace: true });
      })
      .catch(() => {})
      .finally(() => setCheckingAuth(false));
  }, [navigate]);

  // Animação: container aparece aos poucos após a tela carregar
  useEffect(() => {
    if (!checkingAuth) {
      const t = setTimeout(() => setShowCard(true), 80);
      return () => clearTimeout(t);
    }
  }, [checkingAuth]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const parsed = loginSchema.safeParse({ login: loginUser, senha });
    if (!parsed.success) {
      setError(parsed.error.flatten().formErrors.join(' ') || 'Preencha login e senha.');
      return;
    }
    setLoading(true);
    try {
      const data = await login(parsed.data.login, parsed.data.senha);
      if (data.token) {
        try {
          await getMe();
        } catch {
          // segue para a tela inicial neutra mesmo quando /api/me falhar momentaneamente
        }
        await refreshUser();
        navigate('/', { replace: true });
      } else {
        setError('Login ok, mas token não retornado. Tente novamente.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha no login.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: BRAND.bg }}
      >
        <p style={{ color: BRAND.textMuted }}>Carregando...</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: BRAND.bg }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-8 shadow-2xl transition-all duration-[1.2s] ease-out"
        style={{
          backgroundColor: BRAND.card,
          border: `1px solid ${BRAND.border}`,
          opacity: showCard ? 1 : 0,
          transform: showCard ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
        }}
      >
        <div className="flex flex-col items-center mb-6 [&_img]:outline-none [&_img]:border-0">
          <img
            src="/logo-soaco.png"
            alt="Só Aço"
            className="w-full max-w-[220px] h-auto mb-6 block border-0 outline-none"
            style={{ border: 'none', outline: 'none', boxShadow: 'none' }}
          />
          <h1
            className="text-2xl font-bold text-center"
            style={{ color: BRAND.text }}
          >
            Gestão Smart 2.0
          </h1>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              className="block text-sm mb-1"
              style={{ color: BRAND.textMuted }}
            >
              Usuário
            </label>
            <input
              type="text"
              value={loginUser}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="username"
              className="w-full rounded-lg px-3 py-2.5 transition focus:outline-none focus:ring-2"
              style={{
                background: BRAND.inputBg,
                border: `1px solid ${BRAND.inputBorder}`,
                color: BRAND.text,
              }}
              placeholder="Login"
              onFocus={(e) => {
                e.target.style.borderColor = BRAND.focusRing;
                e.target.style.boxShadow = `0 0 0 2px ${BRAND.focusRing}`;
              }}
              onBlur={(e) => {
                e.target.style.borderColor = BRAND.inputBorder;
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>
          <div className="mb-6">
            <label
              className="block text-sm mb-1"
              style={{ color: BRAND.textMuted }}
            >
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg px-3 py-2.5 transition focus:outline-none focus:ring-2"
              style={{
                background: BRAND.inputBg,
                border: `1px solid ${BRAND.inputBorder}`,
                color: BRAND.text,
              }}
              placeholder="Senha"
              onFocus={(e) => {
                e.target.style.borderColor = BRAND.focusRing;
                e.target.style.boxShadow = `0 0 0 2px ${BRAND.focusRing}`;
              }}
              onBlur={(e) => {
                e.target.style.borderColor = BRAND.inputBorder;
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>
          {serverOnline === false && (
            <p className="text-amber-400 text-sm mb-4 text-center">
              Servidor offline. Na pasta raiz execute: <code className="bg-black/20 px-1 rounded">npm run dev</code>
            </p>
          )}
          {error && (
            <p className="text-amber-400 text-sm mb-4 text-center">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-white font-medium transition disabled:opacity-50 hover:opacity-95"
            style={{
              background: BRAND.primary,
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
