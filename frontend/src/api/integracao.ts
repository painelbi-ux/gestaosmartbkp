import { apiFetch, apiJson } from './client';

export interface FiltrosPedidoCompraDataEntrega {
  data_emissao_ini?: string;
  data_emissao_fim?: string;
  data_entrega_ini?: string;
  data_entrega_fim?: string;
  pedido?: string;
  fornecedor?: string;
  codigo_produto?: string;
  descricao_produto?: string;
}

export interface RowPedidoCompraDataEntrega {
  idItemPedidoCompra: number;
  Pedido: string;
  DataEmissao: string;
  CodigoProduto: string;
  DescricaoProduto: string;
  Fornecedor: string;
  DataEntrega: string;
}

export interface FiltrosOpcoesPedidoCompra {
  pedidos: string[];
  fornecedores: string[];
  codigosProduto: string[];
  descricoesProduto: string[];
}

export async function listarPedidoCompraDataEntrega(
  filtros: FiltrosPedidoCompraDataEntrega = {}
): Promise<{ data: RowPedidoCompraDataEntrega[] }> {
  const params = new URLSearchParams();
  if (filtros.data_emissao_ini) params.set('data_emissao_ini', filtros.data_emissao_ini);
  if (filtros.data_emissao_fim) params.set('data_emissao_fim', filtros.data_emissao_fim);
  if (filtros.data_entrega_ini) params.set('data_entrega_ini', filtros.data_entrega_ini);
  if (filtros.data_entrega_fim) params.set('data_entrega_fim', filtros.data_entrega_fim);
  if (filtros.pedido) params.set('pedido', filtros.pedido);
  if (filtros.fornecedor) params.set('fornecedor', filtros.fornecedor);
  if (filtros.codigo_produto) params.set('codigo_produto', filtros.codigo_produto);
  if (filtros.descricao_produto) params.set('descricao_produto', filtros.descricao_produto);
  const qs = params.toString();
  const res = await apiJson<{ data: RowPedidoCompraDataEntrega[]; error?: string }>(
    `/api/integracao/pedido-compra-data-entrega${qs ? `?${qs}` : ''}`
  );
  if (res.error) throw new Error(res.error);
  return { data: res.data ?? [] };
}

export async function obterFiltrosOpcoesPedidoCompra(): Promise<FiltrosOpcoesPedidoCompra> {
  const res = await apiJson<FiltrosOpcoesPedidoCompra & { error?: string }>(
    '/api/integracao/pedido-compra-data-entrega/filtros-opcoes'
  );
  if (res.error) throw new Error(res.error);
  return {
    pedidos: res.pedidos ?? [],
    fornecedores: res.fornecedores ?? [],
    codigosProduto: res.codigosProduto ?? [],
    descricoesProduto: res.descricoesProduto ?? [],
  };
}

/**
 * Altera a data de entrega de um item de pedido de compra (UPDATE no Nomus e histórico no projeto).
 */
export async function atualizarDataEntregaItemPedidoCompra(
  idItemPedidoCompra: number,
  payload: {
    dataEntrega: string;
    dataEntregaAnterior?: string;
    motivo: string;
    observacao?: string | null;
  }
): Promise<void> {
  const { dataEntrega, dataEntregaAnterior, motivo, observacao } = payload;
  const res = await apiFetch(`/api/integracao/pedido-compra-data-entrega/item/${idItemPedidoCompra}`, {
    method: 'PATCH',
    body: { dataEntrega, dataEntregaAnterior, motivo, observacao: observacao ?? undefined },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? `Erro ${res.status}`);
  }
}

export interface HistoricoAlteracaoDataEntregaItem {
  id: number;
  dataEntregaAnterior: string;
  dataEntregaNova: string;
  motivo: string;
  observacao: string | null;
  usuario: string;
  dataAlteracao: string;
}

export async function listarHistoricoAlteracaoDataEntregaCompra(
  idItemPedidoCompra: number
): Promise<HistoricoAlteracaoDataEntregaItem[]> {
  const res = await apiJson<{ data: HistoricoAlteracaoDataEntregaItem[]; error?: string }>(
    `/api/integracao/pedido-compra-data-entrega/item/${idItemPedidoCompra}/historico`
  );
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

// --- Consulta Ticket (id, cliente, vendedor, municipio, UF) ---

export interface TicketItem {
  id: number;
  titulo: string | null;
}

export interface TicketDetalhe {
  id: number;
  titulo: string | null;
  cliente: string | null;
  vendedorrep: string | null;
  municipio: string | null;
  UF: string | null;
  datacriacao: string | null;
  tipopessoa: string | null;
}

export async function listarTickets(): Promise<TicketItem[]> {
  const res = await apiJson<{ data: TicketItem[]; error?: string }>('/api/integracao/tickets');
  if (res.error) throw new Error(res.error);
  return res.data ?? [];
}

export async function obterTicketPorId(id: number): Promise<TicketDetalhe | null> {
  const res = await apiFetch(`/api/integracao/tickets/${id}`);
  if (!res.ok) {
    if (res.status === 404) return null;
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Erro ao carregar ticket');
  }
  return res.json();
}

// --- Faturamento Diário (mensagem WhatsApp) ---

export async function getMensagemFaturamentoDiario(): Promise<{ mensagem: string; dados?: unknown }> {
  const res = await apiFetch('/api/integracao/faturamento-diario/mensagem');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Erro ao carregar mensagem');
  return { mensagem: (body as { mensagem: string }).mensagem ?? '', dados: (body as { dados?: unknown }).dados };
}

export async function enviarFaturamentoDiario(numero: string): Promise<{ ok: boolean; mensagem?: string }> {
  const res = await apiFetch('/api/integracao/faturamento-diario/enviar', {
    method: 'POST',
    body: { numero },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Erro ao enviar');
  return body as { ok: boolean; mensagem?: string };
}
