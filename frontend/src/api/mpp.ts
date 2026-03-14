import { apiJson } from './client';

export type MppRow = Record<string, unknown>;

export interface MppResponse {
  data: MppRow[];
  page: number;
  pageSize: number;
  total?: number;
  hasMore: boolean;
}

export interface MppFiltros {
  page?: number;
  pageSize?: number;
  codigo_pedido?: string;
  cliente?: string;
  segmentacao?: string;
  codigo_componente?: string;
  componente?: string;
  apenas_com_previsao?: boolean;
}

export async function getMpp(params?: MppFiltros): Promise<MppResponse> {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 200;
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (params?.codigo_pedido?.trim()) qs.set('codigo_pedido', params.codigo_pedido.trim());
  if (params?.cliente?.trim()) qs.set('cliente', params.cliente.trim());
  if (params?.segmentacao?.trim()) qs.set('segmentacao', params.segmentacao.trim());
  if (params?.codigo_componente?.trim()) qs.set('codigo_componente', params.codigo_componente.trim());
  if (params?.componente?.trim()) qs.set('componente', params.componente.trim());
  if (params?.apenas_com_previsao === true) qs.set('apenas_com_previsao', '1');
  return apiJson<MppResponse>(`/api/mpp?${qs}`);
}
