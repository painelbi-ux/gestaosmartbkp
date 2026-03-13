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
}

export async function getSycroOrderPedidosErp(filtros?: {
  cliente?: string;
  data_emissao_ini?: string;
  data_emissao_fim?: string;
}): Promise<SycroOrderPedidoErp[]> {
  const params = new URLSearchParams();
  if (filtros?.cliente) params.set('cliente', filtros.cliente);
  if (filtros?.data_emissao_ini) params.set('data_emissao_ini', filtros.data_emissao_ini);
  if (filtros?.data_emissao_fim) params.set('data_emissao_fim', filtros.data_emissao_fim);
  const qs = params.toString();
  return apiJson<SycroOrderPedidoErp[]>(`/api/sycroorder/pedidos-erp${qs ? `?${qs}` : ''}`);
}

export async function getSycroOrderOrders(): Promise<SycroOrderOrder[]> {
  return apiJson<SycroOrderOrder[]>('/api/sycroorder/orders');
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
    observation?: string;
    is_urgent?: boolean;
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
