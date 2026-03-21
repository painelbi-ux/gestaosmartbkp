import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PERMISSOES } from '../config/permissoes';
import type { CodigoPermissao } from '../config/permissoes';
import type { ReactNode } from 'react';

const ROTA_PERMISSAO: Record<string, CodigoPermissao[]> = {
  '/': [PERMISSOES.DASHBOARD_VER],
  '/pedidos': [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  '/pedidos/programacao-setorial': [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  '/pedidos/sycroorder': [PERMISSOES.COMUNICACAO_TELA_VER, PERMISSOES.COMUNICACAO_TOTAL, PERMISSOES.COMUNICACAO_VER, PERMISSOES.PEDIDOS_VER],
  '/pedidos/mrp': [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  '/pedidos/mpp': [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  '/heatmap': [PERMISSOES.HEATMAP_VER],
  '/compras': [PERMISSOES.COMPRAS_VER],
  '/compras/dashboard': [PERMISSOES.COMPRAS_VER],
  '/compras/coletas-precos': [PERMISSOES.COMPRAS_VER],
  '/engenharia': [PERMISSOES.PRECIFICACAO_VER],
  '/engenharia/precificacao': [PERMISSOES.PRECIFICACAO_VER],
  '/financeiro': [PERMISSOES.FINANCEIRO_VER],
  '/financeiro/resumo': [PERMISSOES.FINANCEIRO_VER],
  '/relatorios': [PERMISSOES.RELATORIOS_VER],
  '/integracao': [PERMISSOES.INTEGRACAO_VER],
  '/integracao/alteracao-data-entrega-compra': [PERMISSOES.INTEGRACAO_VER],
  '/integracao/faturamento-diario': [PERMISSOES.INTEGRACAO_VER],
  '/usuarios': [PERMISSOES.USUARIOS_TELA_VER, PERMISSOES.USUARIOS_TOTAL, PERMISSOES.GRUPOS_TELA_VER, PERMISSOES.GRUPOS_TOTAL, PERMISSOES.USUARIOS_GERENCIAR],
  '/situacao-api': [PERMISSOES.DASHBOARD_VER],
  '/whatsapp': [PERMISSOES.USUARIOS_GERENCIAR],
};

/** Rotas que só o master pode acessar (menu já escondido para não-master). */
const ROTAS_APENAS_MASTER = ['/situacao-api', '/whatsapp'];

const ROTAS_ORDEM = [
  '/',
  '/pedidos',
  '/pedidos/programacao-setorial',
  '/pedidos/sycroorder',
  '/pedidos/mrp',
  '/pedidos/mpp',
  '/heatmap',
  '/compras',
  '/compras/dashboard',
  '/compras/coletas-precos',
  '/engenharia',
  '/engenharia/precificacao',
  '/financeiro',
  '/financeiro/resumo',
  '/relatorios',
  '/integracao',
  '/integracao/alteracao-data-entrega-compra',
  '/integracao/faturamento-diario',
  '/usuarios',
  '/situacao-api',
  '/whatsapp',
];

function primeiraRotaPermitida(hasPermission: (codigo: string) => boolean): string | null {
  for (const path of ROTAS_ORDEM) {
    const perms = ROTA_PERMISSAO[path];
    if (perms && perms.some((p) => hasPermission(p as CodigoPermissao))) return path;
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

  const permsNecessarias = ROTA_PERMISSAO[pathname];
  if (permsNecessarias && !permsNecessarias.some((p) => hasPermission(p as CodigoPermissao))) {
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
