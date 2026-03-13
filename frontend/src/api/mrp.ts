import { apiJson } from './client';

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
}

export interface MrpResponse {
  data: MrpRow[];
}

export async function getMrp(): Promise<MrpResponse> {
  return apiJson<MrpResponse>('/api/mrp');
}
