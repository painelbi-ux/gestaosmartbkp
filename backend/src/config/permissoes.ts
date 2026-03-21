/**
 * Códigos de permissão do sistema.
 * Para cada menu: .ver = apenas visualizar; .editar (ou .gerenciar) = todas as funcionalidades.
 */
export const PERMISSOES = {
  DASHBOARD_VER: 'dashboard.ver',
  PEDIDOS_VER: 'pedidos.ver',
  PEDIDOS_EDITAR: 'pedidos.editar',
  COMUNICACAO_VER: 'comunicacao.ver',
  HEATMAP_VER: 'heatmap.ver',
  COMPRAS_VER: 'compras.ver',
  COMPRAS_EDITAR: 'compras.editar',
  PRECIFICACAO_VER: 'precificacao.ver',
  PRECIFICACAO_GERAR: 'precificacao.gerar',
  RELATORIOS_VER: 'relatorios.ver',
  INTEGRACAO_VER: 'integracao.ver',
  INTEGRACAO_EDITAR: 'integracao.editar',
  FINANCEIRO_VER: 'financeiro.ver',

  // --- Novos códigos (enforcement real) ---
  // PCP (Gerenciador de Pedidos)
  PCP_VER_TELA: 'pcp.ver',
  PCP_EXPORTAR_XLSX: 'pcp.exportar_xlsx',
  PCP_EXPORTAR_GRADE: 'pcp.exportar_grade',
  PCP_IMPORTAR_XLSX: 'pcp.importar_xlsx',
  PCP_AJUSTAR_PREVISAO: 'pcp.ajustar_previsao',
  PCP_MOTIVO_CRIAR: 'pcp.motivo.criar',
  PCP_MOTIVO_EDITAR: 'pcp.motivo.editar',
  PCP_MOTIVO_EXCLUIR: 'pcp.motivo.excluir',
  PCP_TOTAL: 'pcp.total',

  // Usuários / Grupos de usuários
  USUARIOS_TELA_VER: 'usuarios.tela.ver',
  USUARIOS_CRIAR: 'usuarios.criar',
  USUARIOS_EDITAR: 'usuarios.editar',
  USUARIOS_SENHA_ALTERAR: 'usuarios.senha.alterar',
  USUARIOS_INATIVAR: 'usuarios.inativar',
  USUARIOS_EXCLUIR: 'usuarios.excluir',
  USUARIOS_TOTAL: 'usuarios.total',

  GRUPOS_TELA_VER: 'grupos.tela.ver',
  GRUPOS_CRIAR: 'grupos.criar',
  GRUPOS_EDITAR: 'grupos.editar',
  GRUPOS_INATIVAR: 'grupos.inativar',
  GRUPOS_EXCLUIR: 'grupos.excluir',
  GRUPOS_TOTAL: 'grupos.total',

  // COMUNICAÇÃO INTERNA (Comunicação PD)
  COMUNICACAO_TELA_VER: 'comunicacao.tela.ver',
  COMUNICACAO_NOVO_PEDIDO: 'comunicacao.novo_pedido',
  COMUNICACAO_HISTORICO_VER: 'comunicacao.historico.ver',
  COMUNICACAO_ATUALIZAR_CARD: 'comunicacao.atualizar_card',
  COMUNICACAO_TOTAL: 'comunicacao.total',

  // Permissão legado (mantida para compatibilidade)
  USUARIOS_GERENCIAR: 'usuarios.gerenciar',
} as const;

export type CodigoPermissao = (typeof PERMISSOES)[keyof typeof PERMISSOES];

export const TODAS_PERMISSOES: CodigoPermissao[] = [
  PERMISSOES.DASHBOARD_VER,
  PERMISSOES.PEDIDOS_VER,
  PERMISSOES.PEDIDOS_EDITAR,
  PERMISSOES.COMUNICACAO_VER,
  PERMISSOES.HEATMAP_VER,
  PERMISSOES.COMPRAS_VER,
  PERMISSOES.COMPRAS_EDITAR,
  PERMISSOES.PRECIFICACAO_VER,
  PERMISSOES.PRECIFICACAO_GERAR,
  PERMISSOES.RELATORIOS_VER,
  PERMISSOES.INTEGRACAO_VER,
  PERMISSOES.INTEGRACAO_EDITAR,
  PERMISSOES.FINANCEIRO_VER,

  // PCP
  PERMISSOES.PCP_VER_TELA,
  PERMISSOES.PCP_EXPORTAR_XLSX,
  PERMISSOES.PCP_EXPORTAR_GRADE,
  PERMISSOES.PCP_IMPORTAR_XLSX,
  PERMISSOES.PCP_AJUSTAR_PREVISAO,
  PERMISSOES.PCP_MOTIVO_CRIAR,
  PERMISSOES.PCP_MOTIVO_EDITAR,
  PERMISSOES.PCP_MOTIVO_EXCLUIR,
  PERMISSOES.PCP_TOTAL,

  // Usuários / Grupos
  PERMISSOES.USUARIOS_TELA_VER,
  PERMISSOES.USUARIOS_CRIAR,
  PERMISSOES.USUARIOS_EDITAR,
  PERMISSOES.USUARIOS_SENHA_ALTERAR,
  PERMISSOES.USUARIOS_INATIVAR,
  PERMISSOES.USUARIOS_EXCLUIR,
  PERMISSOES.USUARIOS_TOTAL,
  PERMISSOES.GRUPOS_TELA_VER,
  PERMISSOES.GRUPOS_CRIAR,
  PERMISSOES.GRUPOS_EDITAR,
  PERMISSOES.GRUPOS_INATIVAR,
  PERMISSOES.GRUPOS_EXCLUIR,
  PERMISSOES.GRUPOS_TOTAL,

  // Comunicação PD
  PERMISSOES.COMUNICACAO_TELA_VER,
  PERMISSOES.COMUNICACAO_NOVO_PEDIDO,
  PERMISSOES.COMUNICACAO_HISTORICO_VER,
  PERMISSOES.COMUNICACAO_ATUALIZAR_CARD,
  PERMISSOES.COMUNICACAO_TOTAL,

  // legado
  PERMISSOES.USUARIOS_GERENCIAR,
];

export const LABELS_PERMISSOES: Record<CodigoPermissao, string> = {
  [PERMISSOES.DASHBOARD_VER]: 'Ver Dashboard',
  [PERMISSOES.PEDIDOS_VER]: 'Ver Comunicação interna (Comunicação PD) e Pedidos',
  [PERMISSOES.PEDIDOS_EDITAR]: 'Editar previsões (MRP/MPP) e Comunicação PD',
  [PERMISSOES.COMUNICACAO_VER]: 'Ver Comunicação interna (Comunicação PD)',
  [PERMISSOES.HEATMAP_VER]: 'Ver Heatmap',
  [PERMISSOES.COMPRAS_VER]: 'Ver Compras (Coletas de preços)',
  [PERMISSOES.COMPRAS_EDITAR]: 'Todas as funcionalidades (Compras)',
  [PERMISSOES.PRECIFICACAO_VER]: 'Visualizar Precificação',
  [PERMISSOES.PRECIFICACAO_GERAR]: 'Gerar precificação',
  [PERMISSOES.RELATORIOS_VER]: 'Ver Relatórios',
  [PERMISSOES.INTEGRACAO_VER]: 'Ver Integração',
  [PERMISSOES.INTEGRACAO_EDITAR]: 'Todas as funcionalidades (Integração)',
  [PERMISSOES.FINANCEIRO_VER]: 'Ver Financeiro',

  // PCP
  [PERMISSOES.PCP_VER_TELA]: 'Visualizar tela de gerenciador de pedidos',
  [PERMISSOES.PCP_EXPORTAR_XLSX]: 'exportar xlsx',
  [PERMISSOES.PCP_EXPORTAR_GRADE]: 'exportar grade',
  [PERMISSOES.PCP_IMPORTAR_XLSX]: 'importar xlsx',
  [PERMISSOES.PCP_AJUSTAR_PREVISAO]: 'Ajustar previsão',
  [PERMISSOES.PCP_MOTIVO_EDITAR]: 'Editar motivo',
  [PERMISSOES.PCP_MOTIVO_EXCLUIR]: 'Excluir motivo',
  [PERMISSOES.PCP_MOTIVO_CRIAR]: 'Criar novo motivo',
  [PERMISSOES.PCP_TOTAL]: 'Permissão total',

  // Usuários
  [PERMISSOES.USUARIOS_TELA_VER]: 'Visualizar tela de usuários',
  [PERMISSOES.USUARIOS_CRIAR]: 'Criar usuário',
  [PERMISSOES.USUARIOS_EDITAR]: 'Editar usuário',
  [PERMISSOES.USUARIOS_SENHA_ALTERAR]: 'Alterar senha de usuário',
  [PERMISSOES.USUARIOS_INATIVAR]: 'Inativar usuário',
  [PERMISSOES.USUARIOS_EXCLUIR]: 'Excluir usuário',
  [PERMISSOES.USUARIOS_TOTAL]: 'Permissão total',

  // Grupos
  [PERMISSOES.GRUPOS_TELA_VER]: 'Visualizar tela de grupos de usuários',
  [PERMISSOES.GRUPOS_CRIAR]: 'Criar grupos de usuários',
  [PERMISSOES.GRUPOS_EDITAR]: 'Editar grupos de usuários',
  [PERMISSOES.GRUPOS_INATIVAR]: 'Inativar grupos de usuários',
  [PERMISSOES.GRUPOS_EXCLUIR]: 'Excluir grupos de usuários',
  [PERMISSOES.GRUPOS_TOTAL]: 'Permissão total',

  // Comunicação PD
  [PERMISSOES.COMUNICACAO_TELA_VER]: 'Visualizar tela de Comunicação PD',
  [PERMISSOES.COMUNICACAO_NOVO_PEDIDO]: 'Adicionar novo pedido (novo card)',
  [PERMISSOES.COMUNICACAO_HISTORICO_VER]: 'Ver histórico',
  [PERMISSOES.COMUNICACAO_ATUALIZAR_CARD]: 'Atualizar card',
  [PERMISSOES.COMUNICACAO_TOTAL]: 'Permissão total',

  // legado
  [PERMISSOES.USUARIOS_GERENCIAR]: 'Gerenciar usuários e grupos',
};
