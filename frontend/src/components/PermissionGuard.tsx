import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PERMISSOES } from '../config/permissoes';
import type { ReactNode } from 'react';

const ROTA_PERMISSAO: Record<string, string> = {
  '/': PERMISSOES.DASHBOARD_VER,
  '/pedidos': PERMISSOES.PEDIDOS_VER,
  '/pedidos/sycroorder': PERMISSOES.PEDIDOS_VER,
  '/pedidos/mrp': PERMISSOES.PEDIDOS_VER,
  '/pedidos/mpp': PERMISSOES.PEDIDOS_VER,
  '/heatmap': PERMISSOES.HEATMAP_VER,
  '/compras': PERMISSOES.COMPRAS_VER,
  '/compras/dashboard': PERMISSOES.COMPRAS_VER,
  '/compras/coletas-precos': PERMISSOES.COMPRAS_VER,
  '/engenharia': PERMISSOES.PRECIFICACAO_VER,
  '/engenharia/precificacao': PERMISSOES.PRECIFICACAO_VER,
  '/financeiro': PERMISSOES.FINANCEIRO_VER,
  '/financeiro/resumo': PERMISSOES.FINANCEIRO_VER,
  '/relatorios': PERMISSOES.RELATORIOS_VER,
  '/integracao': PERMISSOES.INTEGRACAO_VER,
  '/integracao/alteracao-data-entrega-compra': PERMISSOES.INTEGRACAO_VER,
  '/usuarios': PERMISSOES.USUARIOS_GERENCIAR,
  '/situacao-api': PERMISSOES.DASHBOARD_VER,
  '/whatsapp': PERMISSOES.USUARIOS_GERENCIAR,
};

/** Rotas que só o master pode acessar (menu já escondido para não-master). */
const ROTAS_APENAS_MASTER = ['/situacao-api', '/whatsapp'];

const ROTAS_ORDEM = ['/', '/pedidos', '/pedidos/sycroorder', '/pedidos/mrp', '/pedidos/mpp', '/heatmap', '/compras', '/compras/dashboard', '/compras/coletas-precos', '/engenharia', '/engenharia/precificacao', '/financeiro', '/financeiro/resumo', '/relatorios', '/integracao', '/integracao/alteracao-data-entrega-compra', '/usuarios', '/situacao-api', '/whatsapp'];

function primeiraRotaPermitida(hasPermission: (codigo: string) => boolean): string | null {
  for (const path of ROTAS_ORDEM) {
    const perm = ROTA_PERMISSAO[path];
    if (perm && hasPermission(perm as keyof typeof PERMISSOES)) return path;
  }
  return null;
}

export default function PermissionGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { hasPermission, isMaster } = useAuth();
  const pathname = location.pathname.replace(/\/$/, '') || '/';

  if (ROTAS_APENAS_MASTER.includes(pathname) && !isMaster) {
    const redirect = primeiraRotaPermitida(hasPermission);
    if (redirect != null) return <Navigate to={redirect} replace />;
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-8 text-center">
        <p className="text-amber-800 dark:text-amber-200 font-medium">
          Apenas o usuário master pode acessar esta página.
        </p>
      </div>
    );
  }

  const permNecessaria = ROTA_PERMISSAO[pathname];
  if (permNecessaria && !hasPermission(permNecessaria as keyof typeof PERMISSOES)) {
    const redirect = primeiraRotaPermitida(hasPermission);
    if (redirect != null) return <Navigate to={redirect} replace />;
    return (
      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-8 text-center">
        <p className="text-amber-800 dark:text-amber-200 font-medium">
          Você não tem permissão para acessar nenhum módulo. Contate o administrador.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
