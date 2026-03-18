import { apiJson } from './client';

export interface SycroOrderOrder {
  id: number;
  order_number: string;
  delivery_method: string;
  current_promised_date: string;
  status: 'PENDING' | 'FINISHED' | 'ESCALATED';
  is_urgent: number;
  created_by: number | null;
  creator_name: string | null;
  created_at: string;
  last_responder_name: string | null;
  last_response_at: string | null;
  /** Card está lido para o usuário atual */
  read_by_me?: boolean;
  /** Usuário atual pode responder (atualizar) o card; quando há responsável, só criador e josenildo */
  can_respond?: boolean;
}

export interface SycroOrderHistoryItem {
  id: number;
  order_id: number;
  user_id: number | null;
  user_name: string | null;
  action_type: string;
  previous_date: string | null;
  new_date: string | null;
  observation: string | null;
  created_at: string;
  /** Código do produto (Cod), preenchido quando o pedido tem mais de um item para identificar a qual item se refere o ajuste. */
  product_code?: string | null;
}

export interface SycroOrderNotification {
  id: number;
  user_id: number;
  message: string;
  order_id: number | null;
  is_read: number;
  created_at: string;
}

export interface SycroOrderPedidoErp {
  id: number;
  nome: string;
  cliente: string | null;
  dataEmissao: string;
  dataEntregaPadrao: string | null;
  /** Data original de entrega do pedido (Gerenciador de Pedidos). */
  dataOriginalEntrega: string | null;
  /** Rota / forma de entrega (Observacoes no Gerenciador). */
  rota: string | null;
}

export async function getSycroOrderPedidosErp(filtros?: {
  cliente?: string;
  data_emissao_ini?: string;
  data_emissao_fim?: string;
  /** Busca por número do pedido (ex.: PD 47015); traz também pedidos em cargas de anos anteriores. */
  nome?: string;
}): Promise<SycroOrderPedidoErp[]> {
  const params = new URLSearchParams();
  if (filtros?.cliente) params.set('cliente', filtros.cliente);
  if (filtros?.data_emissao_ini) params.set('data_emissao_ini', filtros.data_emissao_ini);
  if (filtros?.data_emissao_fim) params.set('data_emissao_fim', filtros.data_emissao_fim);
  if (filtros?.nome?.trim()) params.set('nome', filtros.nome.trim());
  const qs = params.toString();
  return apiJson<SycroOrderPedidoErp[]>(`/api/sycroorder/pedidos-erp${qs ? `?${qs}` : ''}`);
}

export async function getSycroOrderOrders(): Promise<SycroOrderOrder[]> {
  return apiJson<SycroOrderOrder[]>('/api/sycroorder/orders');
}

/** Números de pedido (PD) que existem no Sycro — usado para bloquear importação na gestão. */
export async function getSycroOrderOrderNumbers(): Promise<string[]> {
  return apiJson<string[]>('/api/sycroorder/order-numbers');
}

export async function createSycroOrderOrder(body: {
  order_number: string;
  delivery_method: string;
  promised_date: string;
  observation?: string;
  is_urgent?: boolean;
}): Promise<{ id: number }> {
  return apiJson<{ id: number }>('/api/sycroorder/orders', {
    method: 'POST',
    body,
  });
}

export async function updateSycroOrderOrder(
  id: number,
  body: {
    status?: 'PENDING' | 'FINISHED' | 'ESCALATED';
    new_date?: string;
    /** Comentário do usuário no card (diálogo) — exibido no histórico. */
    comentario?: string;
    /** Observação complementar ao motivo — enviada ao Gerenciador de Pedidos. */
    observacao?: string;
    is_urgent?: boolean;
    motivo?: string;
    /** Aplicar ajuste apenas a estes id_pedido (quando alteração não é para todos os itens). */
    id_pedidos?: string[];
  }
): Promise<{ success: boolean }> {
  return apiJson<{ success: boolean }>(`/api/sycroorder/orders/${id}`, {
    method: 'PATCH',
    body,
  });
}

export async function getSycroOrderHistory(orderId: number): Promise<SycroOrderHistoryItem[]> {
  return apiJson<SycroOrderHistoryItem[]>(`/api/sycroorder/orders/${orderId}/history`);
}

export async function getSycroOrderNotifications(): Promise<SycroOrderNotification[]> {
  return apiJson<SycroOrderNotification[]>('/api/sycroorder/notifications');
}

export async function markSycroOrderNotificationsRead(): Promise<{ success: boolean }> {
  return apiJson<{ success: boolean }>('/api/sycroorder/notifications/read', {
    method: 'POST',
  });
}

/** Marca card como lido (true) ou não lido (false) para o usuário atual */
export async function setSycroOrderRead(orderId: number, read: boolean): Promise<{ success: boolean }> {
  return apiJson<{ success: boolean }>(`/api/sycroorder/orders/${orderId}/read`, {
    method: 'PUT',
    body: { read },
  });
}
