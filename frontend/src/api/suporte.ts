import { apiFetch, apiJson } from './client';

export type TicketStatus = string;
export type TicketPriority = string;

export type SupportCatalogItem = {
  id: number;
  kind: 'status' | 'prioridade' | 'tipo';
  code: string;
  label: string;
  active: boolean;
  sortOrder: number;
  blocksUserReply: boolean;
};

/** Corpo do PUT /catalog: `id` 0 = linha nova; `code` é gerido só no servidor. */
export type SupportCatalogSaveItem = Pick<
  SupportCatalogItem,
  'kind' | 'label' | 'active' | 'sortOrder' | 'blocksUserReply'
> & { id: number };

export type SupportAttachmentInput = {
  fileName: string;
  mimeType: string;
  contentBase64: string;
  sizeBytes: number;
};

export type SupportTicketListItem = {
  id: number;
  ticketNumber: string;
  tipo: string;
  titulo: string;
  status: TicketStatus;
  prioridade: TicketPriority;
  createdAt: string;
  updatedAt: string;
  ownerLogin: string;
  /** Nome do usuário que abriu o chamado (quando preenchido no cadastro). */
  ownerNome: string | null;
  /** Notificações não lidas neste chamado (mensagem, status, etc.). */
  unreadUpdates: number;
  /** Estado individual de leitura para o usuário atual (master). */
  readByMe: boolean;
};

export type SupportTicketDetail = {
  id: number;
  ticketNumber: string;
  ownerLogin: string;
  ownerNome: string | null;
  tipo: string;
  titulo: string;
  descricao: string;
  categoria: string | null;
  prioridade: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  lastStatusChangeAt: string;
  lastStatusChangeBy: string | null;
  customFields: Record<string, unknown>;
  openingAttachments: Array<{
    id: number;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
  }>;
  messages: Array<{
    id: number;
    authorLogin: string;
    authorNome: string | null;
    authorType: 'usuario' | 'master';
    mensagem: string;
    createdAt: string;
    attachments: Array<{
      id: number;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      url: string;
    }>;
  }>;
  statusHistory: Array<{
    id: number;
    fromStatus: string | null;
    toStatus: string;
    changedBy: string;
    changedAt: string;
  }>;
};

export async function listSupportCatalog(): Promise<SupportCatalogItem[]> {
  const r = await apiJson<{ data: SupportCatalogItem[] }>('/api/suporte/catalog');
  return r.data ?? [];
}

export async function saveSupportCatalog(items: SupportCatalogSaveItem[]): Promise<void> {
  const res = await apiFetch('/api/suporte/catalog', {
    method: 'PUT',
    body: { items },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Não foi possível salvar o catálogo.' }));
    throw new Error((err as { error?: string }).error ?? 'Não foi possível salvar o catálogo.');
  }
}

export async function listSupportTickets(params?: {
  status?: string;
  prioridade?: string;
  tipo?: string;
  usuario?: string;
  search?: string;
  sortBy?: 'createdAt' | 'prioridade';
  sortDir?: 'asc' | 'desc';
}): Promise<SupportTicketListItem[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.prioridade) qs.set('prioridade', params.prioridade);
  if (params?.tipo) qs.set('tipo', params.tipo);
  if (params?.usuario) qs.set('usuario', params.usuario);
  if (params?.search) qs.set('search', params.search);
  if (params?.sortBy) qs.set('sortBy', params.sortBy);
  if (params?.sortDir) qs.set('sortDir', params.sortDir);
  const query = qs.toString();
  const r = await apiJson<{ data: SupportTicketListItem[] }>(`/api/suporte/tickets${query ? `?${query}` : ''}`);
  return (r.data ?? []).map((row) => ({
    ...row,
    ownerNome: row.ownerNome ?? null,
    unreadUpdates: row.unreadUpdates ?? 0,
    readByMe: !!row.readByMe,
  }));
}

/** Total de atualizações em chamados ainda não “vistas” (abrir o detalhe zera as daquele chamado). */
export async function getSupportUnreadCount(): Promise<number> {
  const r = await apiJson<{ count: number }>('/api/suporte/notifications/unread-count');
  return Number(r.count ?? 0);
}

export async function createSupportTicket(payload: {
  tipo: string;
  titulo: string;
  descricao: string;
  categoria?: string;
  prioridade: TicketPriority;
  attachments?: SupportAttachmentInput[];
}): Promise<{ id: number; ticketNumber: string }> {
  const res = await apiFetch('/api/suporte/tickets', { method: 'POST', body: payload });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Não foi possível abrir o chamado.');
  return body as { id: number; ticketNumber: string };
}

export async function getSupportTicket(id: number): Promise<SupportTicketDetail> {
  const r = await apiJson<{ data: SupportTicketDetail }>(`/api/suporte/tickets/${id}`);
  return r.data;
}

export async function createSupportMessage(
  ticketId: number,
  payload: { mensagem: string; attachments?: SupportAttachmentInput[] }
): Promise<void> {
  const res = await apiFetch(`/api/suporte/tickets/${ticketId}/messages`, { method: 'POST', body: payload });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Não foi possível enviar mensagem.' }));
    throw new Error((err as { error?: string }).error ?? 'Não foi possível enviar mensagem.');
  }
}

export async function updateSupportStatus(ticketId: number, status: string): Promise<void> {
  const res = await apiFetch(`/api/suporte/tickets/${ticketId}/status`, {
    method: 'PATCH',
    body: { status },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Não foi possível alterar status.' }));
    throw new Error((err as { error?: string }).error ?? 'Não foi possível alterar status.');
  }
}

/** Marca o chamado como lido (true) ou não lido (false) para o usuário master atual. */
export async function setSupportTicketRead(ticketId: number, read: boolean): Promise<void> {
  const res = await apiFetch(`/api/suporte/tickets/${ticketId}/read`, {
    method: 'PUT',
    body: { read },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Não foi possível atualizar leitura.' }));
    throw new Error((err as { error?: string }).error ?? 'Não foi possível atualizar leitura.');
  }
}
