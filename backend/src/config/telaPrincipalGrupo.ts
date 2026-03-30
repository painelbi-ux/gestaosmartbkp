import { PERMISSOES, type CodigoPermissao } from './permissoes.js';

/** Valores persistidos em `GrupoUsuario.telaPrincipalInicial`. */
export const TELA_PRINCIPAL_KEYS = [
  'gerenciador_pedidos',
  'dash_mrp',
  'programacao_setorial',
  'comunicacao_pd',
  'heatmap',
  'dashboard_compras',
  'coleta_precos',
  'precificacao',
  'resumo_financeiro',
] as const;

export type TelaPrincipalKey = (typeof TELA_PRINCIPAL_KEYS)[number];

export const TELA_PRINCIPAL_MAP: Record<
  TelaPrincipalKey,
  { path: string; label: string; requiredAny: CodigoPermissao[] }
> = {
  gerenciador_pedidos: {
    path: '/pedidos',
    label: 'Gerenciador de pedidos',
    requiredAny: [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  },
  dash_mrp: {
    path: '/pedidos/mrp-dashboard',
    label: 'Dash MRP',
    requiredAny: [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  },
  programacao_setorial: {
    path: '/pedidos/programacao-setorial',
    label: 'Programação setorial',
    requiredAny: [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  },
  comunicacao_pd: {
    path: '/pedidos/sycroorder',
    label: 'Comunicação PD',
    requiredAny: [
      PERMISSOES.COMUNICACAO_TELA_VER,
      PERMISSOES.COMUNICACAO_TOTAL,
      PERMISSOES.COMUNICACAO_VER,
      PERMISSOES.PEDIDOS_VER,
    ],
  },
  heatmap: {
    path: '/heatmap',
    label: 'HeatMap',
    requiredAny: [PERMISSOES.HEATMAP_VER],
  },
  dashboard_compras: {
    path: '/compras/dashboard',
    label: 'Dashboard compras',
    requiredAny: [PERMISSOES.COMPRAS_VER],
  },
  coleta_precos: {
    path: '/compras/coletas-precos',
    label: 'Coleta de preços',
    requiredAny: [PERMISSOES.COMPRAS_VER],
  },
  precificacao: {
    path: '/engenharia/precificacao',
    label: 'Precificação',
    requiredAny: [PERMISSOES.PRECIFICACAO_VER],
  },
  resumo_financeiro: {
    path: '/financeiro/resumo',
    label: 'Resumo financeiro',
    requiredAny: [PERMISSOES.FINANCEIRO_VER],
  },
};

export function isTelaPrincipalKey(v: string): v is TelaPrincipalKey {
  return (TELA_PRINCIPAL_KEYS as readonly string[]).includes(v);
}

/**
 * Valida se as permissões do grupo permitem a tela escolhida.
 */
export function validarTelaPrincipalParaPermissoesGrupo(
  telaKey: string | null | undefined,
  grupoPermissoes: string[]
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (telaKey == null || telaKey === '') return { ok: true, value: null };
  if (!isTelaPrincipalKey(telaKey)) {
    return { ok: false, error: 'Tela principal inválida.' };
  }
  const cfg = TELA_PRINCIPAL_MAP[telaKey];
  const tem = cfg.requiredAny.some((p) => grupoPermissoes.includes(p));
  if (!tem) {
    return {
      ok: false,
      error: `Não é possível usar "${cfg.label}" como tela inicial: o grupo não possui permissão para acessar essa área. Marque as permissões necessárias ou escolha outra opção.`,
    };
  }
  return { ok: true, value: telaKey };
}

/**
 * Resolve a rota inicial para o usuário, com base na chave do grupo e nas permissões efetivas já calculadas.
 */
export function resolveTelaInicialPathParaUsuario(
  telaKey: string | null | undefined,
  permissoesEfetivas: string[]
): string | null {
  if (telaKey == null || telaKey === '') return null;
  if (!isTelaPrincipalKey(telaKey)) return null;
  const cfg = TELA_PRINCIPAL_MAP[telaKey];
  if (!cfg.requiredAny.some((p) => permissoesEfetivas.includes(p))) return null;
  return cfg.path;
}
