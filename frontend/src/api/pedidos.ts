import { apiFetch, apiJson } from './client';

export interface Pedido {
  id_pedido: string;
  cliente: string;
  produto: string;
  qtd: number;
  previsao_entrega: string;
  previsao_entrega_atualizada: string;
  /** Penúltimo registro do histórico (previsão antes da última alteração). Exibido como "Previsão anterior". */
  previsao_anterior?: string;
  [key: string]: unknown;
}

export interface Resumo {
  total: number;
  entregaHoje: number;
  atrasados: number;
  leadTimeMedioDias: number | null;
  /** Soma do Valor Pendente Real de todos os pedidos do resumo (para % no gráfico). */
  totalValorPendenteReal?: number;
  /** Soma do Valor Pendente Real apenas dos pedidos atrasados. */
  atrasadosValorPendenteReal?: number;
}

export interface ObservacaoResumo {
  observacao: string;
  quantidade: number;
}

export interface MotivoResumo {
  motivo: string;
  quantidade: number;
}

export interface FiltrosPedidos {
  cliente?: string;
  observacoes?: string;
  pd?: string;
  cod?: string;
  data_emissao_ini?: string;
  data_emissao_fim?: string;
  data_entrega_ini?: string;
  data_entrega_fim?: string;
  data_previsao_anterior_ini?: string;
  data_previsao_anterior_fim?: string;
  data_ini?: string;
  data_fim?: string;
  atrasados?: boolean;
  grupo_produto?: string;
  setor_producao?: string;
  uf?: string;
  municipio_entrega?: string;
  motivo?: string;
  vendedor?: string;
  tipo_f?: string;
  status?: string;
  metodo?: string;
  forma_pagamento?: string;
  descricao_produto?: string;
  a_vista?: string;
  requisicao_loja?: string;
  page?: number;
  limit?: number;
  /** Níveis de classificação para ordenar todos os registros no servidor antes da paginação. */
  sort_levels?: { id: string; dir: 'asc' | 'desc' }[];
}

export interface ListaPedidosResponse {
  data: Pedido[];
  total: number;
  /** Mensagem quando a conexão com o ERP (Nomus) falhou. */
  erroConexao?: string;
}

export async function listarPedidos(filtros: FiltrosPedidos = {}): Promise<ListaPedidosResponse> {
  const params = new URLSearchParams();
  if (filtros.cliente) params.set('cliente', filtros.cliente);
  if (filtros.observacoes) params.set('observacoes', filtros.observacoes);
  if (filtros.pd) params.set('pd', filtros.pd);
  if (filtros.cod) params.set('cod', filtros.cod);
  if (filtros.data_emissao_ini) params.set('data_emissao_ini', filtros.data_emissao_ini);
  if (filtros.data_emissao_fim) params.set('data_emissao_fim', filtros.data_emissao_fim);
  if (filtros.data_entrega_ini) params.set('data_entrega_ini', filtros.data_entrega_ini);
  if (filtros.data_entrega_fim) params.set('data_entrega_fim', filtros.data_entrega_fim);
  if (filtros.data_previsao_anterior_ini) params.set('data_previsao_anterior_ini', filtros.data_previsao_anterior_ini);
  if (filtros.data_previsao_anterior_fim) params.set('data_previsao_anterior_fim', filtros.data_previsao_anterior_fim);
  if (filtros.data_ini) params.set('data_ini', filtros.data_ini);
  if (filtros.data_fim) params.set('data_fim', filtros.data_fim);
  if (filtros.atrasados === true) params.set('atrasados', 'true');
  if (filtros.grupo_produto) params.set('grupo_produto', filtros.grupo_produto);
  if (filtros.setor_producao) params.set('setor_producao', filtros.setor_producao);
  if (filtros.uf) params.set('uf', filtros.uf);
  if (filtros.municipio_entrega) params.set('municipio_entrega', filtros.municipio_entrega);
  if (filtros.motivo) params.set('motivo', filtros.motivo);
  if (filtros.vendedor) params.set('vendedor', filtros.vendedor);
  if (filtros.tipo_f) params.set('tipo_f', filtros.tipo_f);
  if (filtros.status) params.set('status', filtros.status);
  if (filtros.metodo) params.set('metodo', filtros.metodo);
  if (filtros.forma_pagamento) params.set('forma_pagamento', filtros.forma_pagamento);
  if (filtros.descricao_produto) params.set('descricao_produto', filtros.descricao_produto);
  if (filtros.a_vista) params.set('a_vista', filtros.a_vista);
  if (filtros.requisicao_loja) params.set('requisicao_loja', filtros.requisicao_loja);
  if (filtros.page != null) params.set('page', String(filtros.page));
  if (filtros.limit != null) params.set('limit', String(filtros.limit));
  if (Array.isArray(filtros.sort_levels) && filtros.sort_levels.length > 0) {
    params.set('sort_levels', JSON.stringify(filtros.sort_levels));
  }
  const qs = params.toString();
  return apiJson<ListaPedidosResponse>(`/api/pedidos${qs ? `?${qs}` : ''}`);
}

/** Lista pedidos com entrega na data informada (para tooltip do dashboard). */
export async function listarPedidosPorDataEntrega(data: string): Promise<Pedido[]> {
  const res = await listarPedidos({
    data_ini: data,
    data_fim: data,
    limit: 100,
    page: 1,
  });
  return res.data ?? [];
}

/** Lista todos os pedidos (sem paginação) para exportação XLSX. */
export async function listarPedidosExport(filtros: Omit<FiltrosPedidos, 'page' | 'limit'> = {}): Promise<ListaPedidosResponse> {
  const params = new URLSearchParams();
  if (filtros.cliente) params.set('cliente', filtros.cliente);
  if (filtros.observacoes) params.set('observacoes', filtros.observacoes);
  if (filtros.pd) params.set('pd', filtros.pd);
  if (filtros.cod) params.set('cod', filtros.cod);
  if (filtros.data_emissao_ini) params.set('data_emissao_ini', filtros.data_emissao_ini);
  if (filtros.data_emissao_fim) params.set('data_emissao_fim', filtros.data_emissao_fim);
  if (filtros.data_entrega_ini) params.set('data_entrega_ini', filtros.data_entrega_ini);
  if (filtros.data_entrega_fim) params.set('data_entrega_fim', filtros.data_entrega_fim);
  if (filtros.data_previsao_anterior_ini) params.set('data_previsao_anterior_ini', filtros.data_previsao_anterior_ini);
  if (filtros.data_previsao_anterior_fim) params.set('data_previsao_anterior_fim', filtros.data_previsao_anterior_fim);
  if (filtros.data_ini) params.set('data_ini', filtros.data_ini);
  if (filtros.data_fim) params.set('data_fim', filtros.data_fim);
  if (filtros.atrasados === true) params.set('atrasados', 'true');
  if (filtros.grupo_produto) params.set('grupo_produto', filtros.grupo_produto);
  if (filtros.setor_producao) params.set('setor_producao', filtros.setor_producao);
  if (filtros.uf) params.set('uf', filtros.uf);
  if (filtros.municipio_entrega) params.set('municipio_entrega', filtros.municipio_entrega);
  if (filtros.motivo) params.set('motivo', filtros.motivo);
  if (filtros.vendedor) params.set('vendedor', filtros.vendedor);
  if (filtros.tipo_f) params.set('tipo_f', filtros.tipo_f);
  if (filtros.status) params.set('status', filtros.status);
  if (filtros.metodo) params.set('metodo', filtros.metodo);
  if (filtros.forma_pagamento) params.set('forma_pagamento', filtros.forma_pagamento);
  if (filtros.descricao_produto) params.set('descricao_produto', filtros.descricao_produto);
  if (filtros.a_vista) params.set('a_vista', filtros.a_vista);
  if (filtros.requisicao_loja) params.set('requisicao_loja', filtros.requisicao_loja);
  const qs = params.toString();
  return apiJson<ListaPedidosResponse>(`/api/pedidos/export${qs ? `?${qs}` : ''}`);
}

/** Resumo global ou filtrado por rota (observacoes). */
export async function obterResumo(observacoes?: string): Promise<Resumo> {
  const qs = observacoes ? `?observacoes=${encodeURIComponent(observacoes)}` : '';
  return apiJson<Resumo>(`/api/pedidos/resumo${qs}`);
}

export interface ResumoFinanceiro {
  quantidadePedidos: number;
  saldoFaturarPrazo: number;
  valorAdiantamento: number;
  saldoFaturar: number;
}

/** Resumo financeiro para os 4 cards. Aceita filtros (heatmap). */
export async function obterResumoFinanceiro(filtros: FiltrosPedidos = {}): Promise<ResumoFinanceiro> {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && k !== 'page' && k !== 'limit') params.set(k, String(v));
  });
  const qs = params.toString();
  return apiJson<ResumoFinanceiro>(`/api/pedidos/resumo-financeiro${qs ? `?${qs}` : ''}`);
}

export interface ResumoFinanceiroGradeCondicao {
  condicao: string;
  porData: Record<string, number>;
  total: number;
}

export interface ResumoFinanceiroGradeRota {
  rota: string;
  condicoes: ResumoFinanceiroGradeCondicao[];
  totalPorData: Record<string, number>;
  totalGeral: number;
}

export interface ResumoFinanceiroGradeResponse {
  datas: string[];
  rotas: ResumoFinanceiroGradeRota[];
  erroConexao?: string;
}

/** Grade do Resumo Financeiro (Rota x Condição x datas + Total Geral). Mesmos filtros de pedidos; data_ini/data_fim = período das colunas (padrão: semana corrente). */
export async function getResumoFinanceiroGrade(
  filtros: FiltrosPedidos & { data_ini?: string; data_fim?: string } = {}
): Promise<ResumoFinanceiroGradeResponse> {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && k !== 'page' && k !== 'limit') params.set(k, String(v));
  });
  const qs = params.toString();
  return apiJson<ResumoFinanceiroGradeResponse>(
    `/api/pedidos/resumo-financeiro-grade${qs ? `?${qs}` : ''}`
  );
}

export async function obterResumoObservacoes(): Promise<ObservacaoResumo[]> {
  return apiJson<ObservacaoResumo[]>('/api/pedidos/observacoes-resumo');
}

export interface FiltrosOpcoes {
  rotas: string[];
  categorias: string[];
  status: string[];
  metodos: string[];
  ufs: string[];
  municipios: string[];
  formasPagamento: string[];
  gruposProduto: string[];
  pds: string[];
  setores: string[];
  vendedores: string[];
  clientes: string[];
  codigos: string[];
}

export async function obterFiltrosOpcoes(): Promise<FiltrosOpcoes> {
  return apiJson<FiltrosOpcoes>('/api/pedidos/filtros-opcoes');
}

export async function obterResumoMotivos(): Promise<MotivoResumo[]> {
  return apiJson<MotivoResumo[]>('/api/pedidos/resumo-motivos');
}

export interface ResumoStatusPorTipoFItem {
  total: number;
  emDia: number;
  percentual: number;
}

export interface ResumoStatusPorTipoF {
  retirada: ResumoStatusPorTipoFItem;
  entregaGrandeTeresina: ResumoStatusPorTipoFItem;
  carradas: ResumoStatusPorTipoFItem;
}

/** Resumo % Em dia por TipoF. Aceita filtros (heatmap). */
export async function obterResumoStatusPorTipoF(filtros: FiltrosPedidos = {}): Promise<ResumoStatusPorTipoF> {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && k !== 'page' && k !== 'limit') params.set(k, String(v));
  });
  const qs = params.toString();
  return apiJson<ResumoStatusPorTipoF>(`/api/pedidos/resumo-status-tipof${qs ? `?${qs}` : ''}`);
}

export interface TooltipDetalheRow {
  rm: string;
  rota: string;
  dataEmissao: string;
  pedido: string;
  municipio: string;
  aVista: string;
  valorPendente: number;
  codigo: string;
  produto: string;
}

export type CorBolhaMapa = 'vermelho' | 'verde' | 'amarelo' | 'roxo' | 'preto';

export interface MapaMunicipioItem {
  /** Chave no formato Município,UF,Brasil (ex.: Teresina,PI,Brasil). */
  chave: string;
  municipio: string;
  uf: string;
  valorPendente: number;
  lat: number;
  lng: number;
  detalhes: TooltipDetalheRow[];
  cor: CorBolhaMapa;
}

export interface MapaMunicipiosResponse {
  itens: MapaMunicipioItem[];
  semCoordenadas: { chave: string; municipio: string; uf: string; valorPendente: number }[];
}

/** Mapa por município. Aceita filtros (heatmap). */
export async function obterMapaMunicipios(filtros: FiltrosPedidos = {}): Promise<MapaMunicipiosResponse> {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && k !== 'page' && k !== 'limit') params.set(k, String(v));
  });
  const qs = params.toString();
  return apiJson<MapaMunicipiosResponse>(`/api/pedidos/mapa-municipios${qs ? `?${qs}` : ''}`);
}

export interface HistoricoItem {
  id: number;
  id_pedido: string;
  previsao_nova: string;
  motivo: string;
  observacao?: string | null;
  usuario: string;
  data_ajuste: string;
}

export async function obterHistorico(idPedido: string): Promise<HistoricoItem[]> {
  return apiJson<HistoricoItem[]>(`/api/pedidos/${encodeURIComponent(idPedido)}/historico`);
}

/** Verifica quais dos id_pedidos informados têm PD (número do pedido) no Sycro. Usado para bloquear importação. */
export async function checkPedidosEmSycro(id_pedidos: string[]): Promise<{ pd_em_sycro: string[] }> {
  return apiJson<{ pd_em_sycro: string[] }>('/api/pedidos/check-sycro', {
    method: 'POST',
    body: { id_pedidos },
  });
}

export async function ajustarPrevisao(
  idPedido: string,
  payload: { previsao_nova: string; motivo: string; observacao?: string | null }
): Promise<Pedido> {
  const res = await apiFetch(`/api/pedidos/${encodeURIComponent(idPedido)}/ajustar-previsao`, {
    method: 'POST',
    body: payload,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Erro ao ajustar previsão');
  }
  return res.json();
}

export type AjustePrevisaoLoteItem = {
  id_pedido: string;
  previsao_nova: string;
  motivo: string;
  /** Observação do ajuste (coluna Observação no export/import). Armazenada e exibida no histórico. */
  observacao?: string | null;
  /** Enviado pelo import: previsão atual (coluna Previsão) para validar data divergente. */
  previsao_atual?: string;
  /** Enviado pelo import: rota/carrada (coluna Observacoes) para validar mesma data por carrada. */
  rota?: string;
};

export type AjustePrevisaoLoteResultado = {
  ok: number;
  erros: Array<{ id_pedido: string; erro: string }>;
};

/** Ajusta previsão de vários pedidos em uma única requisição (evita 429 na importação). */
export async function ajustarPrevisaoLote(ajustes: AjustePrevisaoLoteItem[]): Promise<AjustePrevisaoLoteResultado> {
  const res = await apiFetch('/api/pedidos/ajustar-previsao-lote', {
    method: 'POST',
    body: { ajustes },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Erro ao ajustar previsão em lote');
  }
  return res.json();
}

/** Remove todos os registros de alteração de pedidos (apenas master; exige senha). */
export async function limparHistorico(senha: string): Promise<{ deleted: number }> {
  const res = await apiFetch('/api/pedidos/limpar-historico', { method: 'POST', body: { senha } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? 'Erro ao limpar histórico');
  }
  return res.json();
}
