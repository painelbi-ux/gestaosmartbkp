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

export type MrpScenarioType = 'REAL' | 'SIMULADO';
export type MrpRunStatus =
  | 'AGUARDANDO_PROCESSAMENTO'
  | 'PROCESSANDO'
  | 'PROCESSADO'
  | 'ERRO';

export interface MrpRun {
  id: number;
  uid: string;
  nome: string;
  observacoes?: string | null;
  scenario_type: MrpScenarioType;
  scenario_file_name?: string | null;
  status: MrpRunStatus;
  created_at: string;
  processed_at?: string | null;
  created_by_login?: string | null;
  processed_by_login?: string | null;
  error_message?: string | null;
  snapshot_rows_count?: number;
}

export interface MrpScenarioRowPayload {
  id_pedido: string;
  previsao_nova: string;
}

export async function listMrpRuns(): Promise<{ data: MrpRun[] }> {
  return apiJson<{ data: MrpRun[] }>('/api/mrp/runs');
}

export async function createMrpRun(payload: {
  nome: string;
  observacoes?: string;
  scenario_type: MrpScenarioType;
  scenario_file_name?: string;
  scenario_rows?: MrpScenarioRowPayload[];
  process_now?: boolean;
}): Promise<{ data: MrpRun }> {
  return apiJson<{ data: MrpRun }>('/api/mrp/runs', {
    method: 'POST',
    body: payload,
  });
}

export async function processMrpRun(id: number): Promise<{ data: MrpRun }> {
  return apiJson<{ data: MrpRun }>(`/api/mrp/runs/${id}/process`, {
    method: 'POST',
    body: {},
  });
}

export async function deleteMrpRun(id: number): Promise<{ success: boolean }> {
  return apiJson<{ success: boolean }>(`/api/mrp/runs/${id}`, {
    method: 'DELETE',
  });
}

export async function getMrpRun(id: number): Promise<{ data: MrpRun }> {
  return apiJson<{ data: MrpRun }>(`/api/mrp/runs/${id}`);
}

export async function getMrpRunRows(id: number): Promise<{ data: MrpRow[] }> {
  return apiJson<{ data: MrpRow[] }>(`/api/mrp/runs/${id}/rows`);
}
