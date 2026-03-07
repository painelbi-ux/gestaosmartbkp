/**
 * Códigos de permissão do sistema.
 * Para cada menu: .ver = apenas visualizar; .editar (ou .gerenciar) = todas as funcionalidades.
 */
export const PERMISSOES = {
  DASHBOARD_VER: 'dashboard.ver',
  PEDIDOS_VER: 'pedidos.ver',
  PEDIDOS_EDITAR: 'pedidos.editar',
  HEATMAP_VER: 'heatmap.ver',
  COMPRAS_VER: 'compras.ver',
  COMPRAS_EDITAR: 'compras.editar',
  PRECIFICACAO_VER: 'precificacao.ver',
  RELATORIOS_VER: 'relatorios.ver',
  INTEGRACAO_VER: 'integracao.ver',
  INTEGRACAO_EDITAR: 'integracao.editar',
  USUARIOS_GERENCIAR: 'usuarios.gerenciar',
} as const;

export type CodigoPermissao = (typeof PERMISSOES)[keyof typeof PERMISSOES];

export const TODAS_PERMISSOES: CodigoPermissao[] = [
  PERMISSOES.DASHBOARD_VER,
  PERMISSOES.PEDIDOS_VER,
  PERMISSOES.PEDIDOS_EDITAR,
  PERMISSOES.HEATMAP_VER,
  PERMISSOES.COMPRAS_VER,
  PERMISSOES.COMPRAS_EDITAR,
  PERMISSOES.PRECIFICACAO_VER,
  PERMISSOES.RELATORIOS_VER,
  PERMISSOES.INTEGRACAO_VER,
  PERMISSOES.INTEGRACAO_EDITAR,
  PERMISSOES.USUARIOS_GERENCIAR,
];

export const LABELS_PERMISSOES: Record<CodigoPermissao, string> = {
  [PERMISSOES.DASHBOARD_VER]: 'Ver Dashboard',
  [PERMISSOES.PEDIDOS_VER]: 'Ver Pedidos',
  [PERMISSOES.PEDIDOS_EDITAR]: 'Editar previsões / Exportar / Importar',
  [PERMISSOES.HEATMAP_VER]: 'Ver Heatmap',
  [PERMISSOES.COMPRAS_VER]: 'Ver Compras (Coletas de preços)',
  [PERMISSOES.COMPRAS_EDITAR]: 'Todas as funcionalidades (Compras)',
  [PERMISSOES.PRECIFICACAO_VER]: 'Ver Precificação',
  [PERMISSOES.RELATORIOS_VER]: 'Ver Relatórios',
  [PERMISSOES.INTEGRACAO_VER]: 'Ver Integração',
  [PERMISSOES.INTEGRACAO_EDITAR]: 'Todas as funcionalidades (Integração)',
  [PERMISSOES.USUARIOS_GERENCIAR]: 'Gerenciar usuários e grupos',
};
