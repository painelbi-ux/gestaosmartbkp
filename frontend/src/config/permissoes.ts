/**
 * Códigos de permissão (espelho do backend).
 * Por menu: .ver = apenas visualizar; .editar = todas as funcionalidades.
 */
export const PERMISSOES = {
  DASHBOARD_VER: 'dashboard.ver',
  PEDIDOS_VER: 'pedidos.ver',
  PEDIDOS_EDITAR: 'pedidos.editar',
  COMUNICACAO_VER: 'comunicacao.ver',
  HEATMAP_VER: 'heatmap.ver',
  COMPRAS_VER: 'compras.ver',
  COMPRAS_EDITAR: 'compras.editar',
  COMPRAS_VINCULO_FINALIZACAO_AMPLIADO: 'compras.vinculo_finalizacao.ampliado',
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

  // Comunicação PD
  COMUNICACAO_TELA_VER: 'comunicacao.tela.ver',
  COMUNICACAO_NOVO_PEDIDO: 'comunicacao.novo_pedido',
  COMUNICACAO_HISTORICO_VER: 'comunicacao.historico.ver',
  COMUNICACAO_ATUALIZAR_CARD: 'comunicacao.atualizar_card',
  COMUNICACAO_EDITAR_RESPONSAVEL_CARD: 'comunicacao.editar_responsavel_card',
  COMUNICACAO_TAG_CONTROLAR: 'comunicacao.tag.controlar',
  COMUNICACAO_TAG_VISUALIZAR: 'comunicacao.tag.visualizar',
  COMUNICACAO_COMENTARIOS_PERMITIR_MENCAO: 'comunicacao.comentarios.permitir_mencao',
  COMUNICACAO_TOTAL: 'comunicacao.total',

  // Suporte (chamados internos)
  SUPORTE_CHAMADOS_VER: 'suporte.chamados.ver',
  SUPORTE_CHAMADOS_CRIAR: 'suporte.chamados.criar',
  SUPORTE_CHAMADOS_RESPONDER: 'suporte.chamados.responder',
  SUPORTE_CHAMADOS_VER_TODOS: 'suporte.chamados.ver_todos',
  SUPORTE_CHAMADOS_ALTERAR_STATUS: 'suporte.chamados.alterar_status',
  SUPORTE_CONFIGURAR: 'suporte.configurar',

  // legado (mantido por compatibilidade)
  USUARIOS_GERENCIAR: 'usuarios.gerenciar',
} as const;

export type CodigoPermissao = (typeof PERMISSOES)[keyof typeof PERMISSOES];
