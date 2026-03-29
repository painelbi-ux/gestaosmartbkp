import { apiFetch } from './client';

export type PcSaldoRow = {
  codigoProduto: string | null;
  dataEntrega: string | null;
  saldoaReceber: number;
};

export interface PcSaldoResponse {
  data: PcSaldoRow[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface PcSaldoFiltros {
  page?: number;
  pageSize?: number;
  codigo_produto?: string;
  data_entrega_ini?: string;
  data_entrega_fim?: string;
}

export async function getPcSaldo(params?: PcSaldoFiltros): Promise<PcSaldoResponse> {
  const page = params?.page ?? 1;
  const pageSize = params?.pageSize ?? 100;
  const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (params?.codigo_produto?.trim()) qs.set('codigo_produto', params.codigo_produto.trim());
  if (params?.data_entrega_ini?.trim()) qs.set('data_entrega_ini', params.data_entrega_ini.trim());
  if (params?.data_entrega_fim?.trim()) qs.set('data_entrega_fim', params.data_entrega_fim.trim());
  const res = await apiFetch(`/api/pc?${qs}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    const msg = [body.error, body.detail].filter(Boolean).join(' — ') || 'Erro na requisição';
    throw new Error(msg);
  }
  return res.json() as Promise<PcSaldoResponse>;
}
