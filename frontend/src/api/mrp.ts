import { apiFetch, apiJson } from './client';

export interface MrpRow {
  idComponente?: number | null;
  codigocomponente?: string | null;
  componente?: string | null;
  unidademedida?: string | null;
  estoqueSeguranca?: number | string | null;
  coleta?: string | null;
  itemcritico?: string | null;
  estoque?: number | string | null;
  CM?: number | string | null;
  pcPendentesAL?: number | string | null;
  quantidade?: number | string | null;
  dataNecessidade?: string | null;
  saldoaReceber?: number | string | null;
  dataEntrega?: string | null;
  /** Preenchido só no front quando o horizonte está carregado (primeiro dia com necessidade > 0). */
  dataRuptura?: string | null;
  /** Preenchido só no front com o status derivado do horizonte e dos campos da linha. */
  statusHorizonte?: string | null;
  /** Preenchido só no front a partir do status e da necessidade acumulada no horizonte. */
  qtdeAComprar?: string | null;
  /** Somatório MPP: todas as «Qtde total componente (no dia)» do resumo, sem filtro de datas (via API dedicada). */
  empenhoTotal?: string | null;
  /** Somatório do consumo (coluna Consumo) em todos os dias do horizonte. */
  empenhoHorizonte?: string | null;
}

export interface MrpResponse {
  data: MrpRow[];
}

export async function getMrp(): Promise<MrpResponse> {
  return apiJson<MrpResponse>('/api/mrp');
}

export interface MrpHorizonteCelula {
  data: string;
  consumo: number;
  saldoEstoque: number;
  entrada: number;
  necessidade: number;
}

export interface MrpHorizonteLinha {
  codigo: string;
  componente: string;
  dias: MrpHorizonteCelula[];
}

export interface MrpHorizonteResponse {
  dataInicio: string;
  dataFim: string;
  datas: string[];
  linhas: MrpHorizonteLinha[];
}

export interface MrpMppQtdeTotalPorComponenteResponse {
  totais: Record<string, number>;
  limitHit?: boolean;
  error?: string;
  detail?: string;
}

/** Soma de «Qtde total componente (no dia)» no MPP por código, sem filtros de grade (não exige aba MPP aberta). */
export async function getMrpMppQtdeTotalPorComponente(): Promise<MrpMppQtdeTotalPorComponenteResponse> {
  return apiJson<MrpMppQtdeTotalPorComponenteResponse>('/api/mrp/mpp-qtde-total-por-componente');
}

export async function getMrpHorizonte(horizonteFim: string): Promise<MrpHorizonteResponse> {
  const qs = new URLSearchParams({ horizonte_fim: horizonteFim.trim() });
  const res = await apiFetch(`/api/mrp/horizonte?${qs}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new Error([body.error, body.detail].filter(Boolean).join(' — ') || 'Erro ao carregar horizonte');
  }
  return res.json() as Promise<MrpHorizonteResponse>;
}
