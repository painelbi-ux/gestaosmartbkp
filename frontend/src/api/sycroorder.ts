import { apiJson } from './client';

export interface SycroOrderOrder {
  id: number;
  order_number: string;
  delivery_method: string;
  current_promised_date: string;
  /** Data original (Gerenciador de Pedidos): campo "Data de entrega" */
  data_original?: string | null;
  /** Previsão atual (Gerenciador de Pedidos): previsao_entrega_atualizada || previsao_entrega */
  previsao_atual?: string | null;
  /** Nome do cliente no ERP */
  cliente_name?: string | null;
  /** Nome do vendedor/representante no ERP (Vendedor/Representante) */
  vendedor_name?: string | null;
  /** Resumo por carrada/rota do card (previsão atual e códigos). */
  carradas_info?: Array<{
    rota: string;
    previsao_atual: string | null;
    codigos: string[];
  }>;
  /** TAG de disponibilidade (Comunicação PD) */
  tag_disponivel?: boolean;
  /** Último comentário pede retorno de outro participante. */
  aguarda_resposta_pendente?: boolean;
  /** Nomes exibidos em “Aguarda resposta de …”. */
  aguarda_resposta_de_label?: string | null;
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
  /** Usuario.id marcado na criação como responsável adicional */
  responsible_user_id?: number | null;
  /** Login (minúsculo) do responsável adicional */
  responsible_user_login?: string | null;
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
  /** Motivo do ajuste de previsão (Gerenciador), quando aplicável. */
  motivo?: string | null;
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
  /** Previsão atual efetiva (Gerenciador de Pedidos). */
  previsao_atual?: string | null;
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

/** Usuários que podem ser marcados como responsáveis adicionais (permissão de atualizar card). */
export async function getSycroOrderUsersResponsavel(): Promise<Array<{ id: number; login: string; nome: string | null }>> {
  return apiJson<Array<{ id: number; login: string; nome: string | null }>>('/api/sycroorder/users-responsavel');
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
  /** Quando informado, cria o card referenciando apenas estes itens (id_pedido do ERP). */
  id_pedidos?: string[];
  /** Opcional: um usuário com permissão de atualizar card. */
  responsible_user_id?: number;
  /** Obrigatório se houver comentário inicial: se o card aguarda retorno. */
  aguarda_resposta?: boolean;
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
    /** Replica motivo/observação e nova previsão para todos os itens da mesma rota/carrada no Gerenciador (rotas "ROTA ..."). */
    replicate_carrada?: boolean;
    /** Atualiza TAG de disponibilidade (DISPONÍVEL / NÃO DISPONÍVEL). */
    tag_disponivel?: boolean;
    /** Obrigatório com comentário: false = respondido; true = aguarda retorno. */
    aguarda_resposta?: boolean;
  }
): Promise<{ success: boolean }> {
  return apiJson<{ success: boolean }>(`/api/sycroorder/orders/${id}`, {
    method: 'PATCH',
    body,
  });
}

/** Altera somente o segundo responsável do card. */
export async function setSycroOrderResponsible(
  orderId: number,
  body: { responsible_user_id: number }
): Promise<{ success: boolean }> {
  return apiJson<{ success: boolean }>(`/api/sycroorder/orders/${orderId}/responsavel`, {
    method: 'PATCH',
    body,
  });
}

/** Ativa/desativa a TAG DISPONÍVEL (aciona histórico). */
export async function setSycroOrderTagDisponivel(orderId: number, available: boolean): Promise<{ success: boolean; tag_disponivel: boolean }> {
  return apiJson<{ success: boolean; tag_disponivel: boolean }>(`/api/sycroorder/orders/${orderId}/tag-disponivel`, {
    method: 'PUT',
    body: { available },
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

/** Marca uma notificação individual como lida/não lida */
export async function setSycroOrderNotificationRead(notificationId: number, body: { read: boolean }): Promise<{ success: boolean; read: boolean }> {
  return apiJson<{ success: boolean; read: boolean }>(`/api/sycroorder/notifications/${notificationId}/read`, {
    method: 'PATCH',
    body,
  });
}

/** Busca usuários por login (autocomplete de menções no comentário). */
export async function searchSycroOrderUsers(query: string): Promise<Array<{ login: string; nome: string | null }>> {
  const qs = new URLSearchParams();
  qs.set('query', query);
  return apiJson<Array<{ login: string; nome: string | null }>>(`/api/sycroorder/users?${qs.toString()}`);
}

/** Marca card como lido (true) ou não lido (false) para o usuário atual */
export async function setSycroOrderRead(orderId: number, read: boolean): Promise<{ success: boolean }> {
  return apiJson<{ success: boolean }>(`/api/sycroorder/orders/${orderId}/read`, {
    method: 'PUT',
    body: { read },
  });
}
