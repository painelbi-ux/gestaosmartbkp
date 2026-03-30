import { PERMISSOES, type CodigoPermissao } from './permissoes';

/** Opções da lista "Tela principal ao iniciar" (valores persistidos no grupo). */
export const OPCOES_TELA_PRINCIPAL: { key: string; label: string; requiredAny: CodigoPermissao[] }[] = [
  {
    key: 'gerenciador_pedidos',
    label: 'Gerenciador de pedidos',
    requiredAny: [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  },
  {
    key: 'dash_mrp',
    label: 'Dash MRP',
    requiredAny: [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  },
  {
    key: 'programacao_setorial',
    label: 'Programação setorial',
    requiredAny: [PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER],
  },
  {
    key: 'comunicacao_pd',
    label: 'Comunicação PD',
    requiredAny: [
      PERMISSOES.COMUNICACAO_TELA_VER,
      PERMISSOES.COMUNICACAO_TOTAL,
      PERMISSOES.COMUNICACAO_VER,
      PERMISSOES.PEDIDOS_VER,
    ],
  },
  {
    key: 'heatmap',
    label: 'HeatMap',
    requiredAny: [PERMISSOES.HEATMAP_VER],
  },
  {
    key: 'dashboard_compras',
    label: 'Dashboard compras',
    requiredAny: [PERMISSOES.COMPRAS_VER],
  },
  {
    key: 'coleta_precos',
    label: 'Coleta de preços',
    requiredAny: [PERMISSOES.COMPRAS_VER],
  },
  {
    key: 'precificacao',
    label: 'Precificação',
    requiredAny: [PERMISSOES.PRECIFICACAO_VER],
  },
  {
    key: 'resumo_financeiro',
    label: 'Resumo financeiro',
    requiredAny: [PERMISSOES.FINANCEIRO_VER],
  },
];

/** Retorna mensagem de erro ou null se OK (espelha a validação do backend). */
export function mensagemSeTelaPrincipalInvalidaParaGrupo(
  telaKey: string,
  grupoPermissoes: string[]
): string | null {
  if (!telaKey) return null;
  const opt = OPCOES_TELA_PRINCIPAL.find((o) => o.key === telaKey);
  if (!opt) return 'Tela principal inválida.';
  const ok = opt.requiredAny.some((p) => grupoPermissoes.includes(p));
  if (!ok) {
    return `Não é possível usar "${opt.label}" como tela inicial: o grupo não possui permissão para acessar essa área. Marque as permissões necessárias ou escolha outra opção.`;
  }
  return null;
}
