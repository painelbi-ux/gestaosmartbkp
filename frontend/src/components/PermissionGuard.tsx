import { useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ReactNode } from 'react';
import { ROTA_PERMISSAO, ROTAS_APENAS_MASTER, primeiraRotaPermitida } from '../utils/routePermission';
import { getStoredToken } from '../api/client';

export default function PermissionGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { hasPermission, isMaster, login } = useAuth();
  const pathname = location.pathname.replace(/\/$/, '') || '/';
  const hasToken = !!getStoredToken();

  // Durante revalidação após restart (token existe, perfil ainda carregando), evita falso "Sem acesso".
  if (hasToken && !login) return <>{children}</>;

  if (ROTAS_APENAS_MASTER.includes(pathname) && !isMaster) {
    const redirect = primeiraRotaPermitida(hasPermission, isMaster);
    if (redirect != null && redirect !== pathname) return <Navigate to={redirect} replace />;
    return <Navigate to="/sem-acesso" replace />;
  }

  const permsNecessarias = ROTA_PERMISSAO[pathname];
  if (permsNecessarias && !permsNecessarias.some((p) => hasPermission(p))) {
    const redirect = primeiraRotaPermitida(hasPermission, isMaster);
    if (redirect != null && redirect !== pathname) return <Navigate to={redirect} replace />;
    if (pathname !== '/sem-acesso') return <Navigate to="/sem-acesso" replace />;
  }
  return <>{children}</>;
}
