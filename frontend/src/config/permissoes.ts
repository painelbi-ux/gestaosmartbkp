/**
 * Códigos de permissão (espelho do backend).
 * Por menu: .ver = apenas visualizar; .editar = todas as funcionalidades.
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
