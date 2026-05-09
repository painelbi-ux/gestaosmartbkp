import { PERMISSOES } from '../config/permissoes';
import type { CodigoPermissao } from '../config/permissoes';
import { PERMISSOES_ROTA_SUPORTE_CHAMADOS } from './suportePermissoes';

export const ROTA_PERMISSAO: Record<string, CodigoPermissao[]> = {
  '/pedidos': [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  '/pedidos/programacao-setorial': [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  '/pedidos/sycroorder': [PERMISSOES.COMUNICACAO_TELA_VER, PERMISSOES.COMUNICACAO_TOTAL, PERMISSOES.COMUNICACAO_VER, PERMISSOES.PEDIDOS_VER],
  '/suporte': PERMISSOES_ROTA_SUPORTE_CHAMADOS,
  '/suporte/configuracao': [PERMISSOES.SUPORTE_CONFIGURAR],
  '/pedidos/mrp': [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  '/pedidos/mrp-produtos-em-processo': [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  '/pedidos/mrp-dashboard': [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  '/pedidos/mpp': [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  '/pedidos/ressup-almox': [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  '/heatmap': [PERMISSOES.HEATMAP_VER],
  '/compras': [PERMISSOES.COMPRAS_VER],
  '/compras/dashboard': [PERMISSOES.COMPRAS_VER],
  '/compras/coletas-precos': [PERMISSOES.COMPRAS_VER],
  '/engenharia': [PERMISSOES.PRECIFICACAO_VER],
  '/engenharia/precificacao': [PERMISSOES.PRECIFICACAO_VER],
  '/financeiro': [PERMISSOES.FINANCEIRO_VER],
  '/financeiro/resumo': [PERMISSOES.FINANCEIRO_VER],
  '/financeiro/dfc': [PERMISSOES.FINANCEIRO_VER],
  '/financeiro/painel-financeiro-comercial': [PERMISSOES.FINANCEIRO_VER],
  '/financeiro/renegociacao-contratos': [PERMISSOES.FINANCEIRO_VER],
  '/relatorios': [PERMISSOES.RELATORIOS_VER],
  '/integracao': [PERMISSOES.INTEGRACAO_VER],
  '/integracao/alteracao-data-entrega-compra': [PERMISSOES.INTEGRACAO_VER],
  '/integracao/faturamento-diario': [PERMISSOES.INTEGRACAO_VER],
  '/usuarios': [PERMISSOES.USUARIOS_TELA_VER, PERMISSOES.USUARIOS_TOTAL, PERMISSOES.GRUPOS_TELA_VER, PERMISSOES.GRUPOS_TOTAL, PERMISSOES.USUARIOS_GERENCIAR],
  '/situacao-api': [PERMISSOES.DASHBOARD_VER],
  '/whatsapp': [PERMISSOES.USUARIOS_GERENCIAR],
};

export const ROTAS_APENAS_MASTER = ['/situacao-api', '/whatsapp'];

export const ROTAS_ORDEM = [
  '/pedidos',
  '/pedidos/programacao-setorial',
  '/pedidos/sycroorder',
  '/suporte',
  '/suporte/configuracao',
  '/pedidos/mrp-dashboard',
  '/pedidos/mrp',
  '/pedidos/mrp-produtos-em-processo',
  '/pedidos/mpp',
  '/pedidos/ressup-almox',
  '/heatmap',
  '/compras',
  '/compras/dashboard',
  '/compras/coletas-precos',
  '/engenharia',
  '/engenharia/precificacao',
  '/financeiro',
  '/financeiro/resumo',
  '/financeiro/dfc',
  '/financeiro/painel-financeiro-comercial',
  '/financeiro/renegociacao-contratos',
  '/relatorios',
  '/integracao',
  '/integracao/alteracao-data-entrega-compra',
  '/integracao/faturamento-diario',
  '/usuarios',
  '/situacao-api',
  '/whatsapp',
] as const;

export function primeiraRotaPermitida(hasPermission: (codigo: CodigoPermissao) => boolean, isMaster = false): string | null {
  for (const path of ROTAS_ORDEM) {
    if (ROTAS_APENAS_MASTER.includes(path) && !isMaster) continue;
    const perms = ROTA_PERMISSAO[path];
    if (perms && perms.some((p) => hasPermission(p))) return path;
  }
  return null;
}

export function primeiraRotaPermitidaPorPermissoes(permissoes: string[], isMaster = false): string | null {
  const hasPermission = (codigo: CodigoPermissao) => isMaster || permissoes.includes(codigo);
  return primeiraRotaPermitida(hasPermission, isMaster);
}
