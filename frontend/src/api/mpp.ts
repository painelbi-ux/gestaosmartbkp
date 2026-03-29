import { apiJson } from './client';

export type MppRow = Record<string, unknown>;

export interface MppResponse {
  data: MppRow[];
  page: number;
  pageSize: number;
  total?: number;
  hasMore: boolean;
  /** true se o ERP devolveu o teto de linhas — o resumo pode estar incompleto. */
  limitHit?: boolean;
}

export interface MppFiltros {
  page?: number;
  pageSize?: number;
  codigo_pedido?: string;
  codigo_produto?: string;
  cliente?: string;
  segmentacao?: string;
  codigo_componente?: string;
  componente?: string;
  apenas_com_previsao?: boolean;
}

function appendMppFiltrosQuery(qs: URLSearchParams, params?: Pick<MppFiltros, 'codigo_pedido' | 'codigo_produto' | 'cliente' | 'segmentacao' | 'codigo_componente' | 'componente' | 'apenas_com_previsao'>): void {
  if (params?.codigo_pedido?.trim()) qs.set('codigo_pedido', params.codigo_pedido.trim());
  if (params?.codigo_produto?.trim()) qs.set('codigo_produto', params.codigo_produto.trim());
  if (params?.cliente?.trim()) qs.set('cliente', params.cliente.trim());
  if (params?.segmentacao?.trim()) qs.set('segmentacao', params.segmentacao.trim());
  if (params?.codigo_componente?.trim()) qs.set('codigo_componente', params.codigo_componente.trim());
  if (params?.componente?.trim()) qs.set('componente', params.componente.trim());
  if (params?.apenas_com_previsao === true) qs.set('apenas_com_previsao', '1');
}

export async function getMpp(params?: MppFiltros): Promise<MppResponse> {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 200;
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  appendMppFiltrosQuery(qs, params);
  return apiJson<MppResponse>(`/api/mpp?${qs}`);
}

export interface MppExportResponse {
  data: MppRow[];
  total: number;
  limitHit?: boolean;
}

/** Todas as linhas MPP com os mesmos filtros da grade (sem paginação). */
export async function getMppExport(params?: Omit<MppFiltros, 'page' | 'pageSize'>): Promise<MppExportResponse> {
  const qs = new URLSearchParams();
  appendMppFiltrosQuery(qs, params);
  return apiJson<MppExportResponse>(`/api/mpp/export?${qs}`);
}
