import { Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import { getStoredToken, SESSION_CLEARED_EVENT } from './api/client';
import { checkAuth } from './api/auth';

/** Autenticação na raiz `/`: visitante vê login; autenticado vê Layout (com Outlet interno para rotas filhas). */
export default function RootEntry() {
  const location = useLocation();
  const { login: ctxLogin } = useAuth();
  const [auth, setAuth] = useState<boolean | null>(null);

  useEffect(() => {
    const onSessionCleared = () => setAuth(false);
    window.addEventListener(SESSION_CLEARED_EVENT, onSessionCleared);
    return () => window.removeEventListener(SESSION_CLEARED_EVENT, onSessionCleared);
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      setAuth(true);
      return;
    }
    let cancelled = false;
    const AUTH_CHECK_MS = 10000;
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) setAuth(false);
    }, AUTH_CHECK_MS);
    checkAuth()
      .then((ok) => {
        if (!cancelled) setAuth(ok);
      })
      .catch(() => {
        if (!cancelled) setAuth(false);
      })
      .finally(() => {
        cancelled = true;
        window.clearTimeout(timeoutId);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    if (ctxLogin && getStoredToken()) setAuth(true);
  }, [ctxLogin]);

  if (auth === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <p className="text-slate-600 dark:text-slate-400">Carregando...</p>
      </div>
    );
  }
  if (!auth) {
    if (location.pathname !== '/') {
      return <Navigate to="/" replace />;
    }
    return <Login />;
  }
  return <Layout />;
}
