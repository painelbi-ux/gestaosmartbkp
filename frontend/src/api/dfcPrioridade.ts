/**
 * Cliente das APIs de classificação de prioridade DFC (plano de contas + lançamento).
 */

import { apiFetch } from './client';

export const DFC_PRIORIDADES = [1, 2, 3, 4] as const;
export type DfcPrioridade = (typeof DFC_PRIORIDADES)[number];
export type DfcTipoRefLancamento = 'A' | 'L';

export const DFC_PRIORIDADE_LABEL: Record<DfcPrioridade, string> = {
  1: 'Pagamento Prioritário',
  2: 'Reprogramar Vencimento +30 dias',
  3: 'Reprogramar Vencimento Indefinido',
  4: 'Não realizar pagamento',
};

export const DFC_PRIORIDADE_LABEL_CURTO: Record<DfcPrioridade, string> = {
  1: 'Prioritário',
  2: 'Reprog. 30d',
  3: 'Reprog. indef.',
  4: 'Não pagar',
};

export const DFC_PRIORIDADE_CHIP: Record<DfcPrioridade, string> = {
  1: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700',
  2: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700',
  3: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-700',
  4: 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/40 dark:text-rose-200 dark:border-rose-700',
};

export interface DfcPrioridadeContaLinha {
  idEmpresa: number;
  idContaFinanceiro: number;
  prioridade: DfcPrioridade;
  observacao: string | null;
  usuario: string;
  atualizadoEm: string;
}

export interface DfcPrioridadeLancamentoLinha {
  idEmpresa: number;
  tipoRef: DfcTipoRefLancamento;
  idRef: number;
  idContaFinanceiro: number | null;
  prioridade: DfcPrioridade;
  observacao: string | null;
  usuario: string;
  atualizadoEm: string;
}

export async function listarPrioridadesConta(params?: {
  idEmpresas?: number[];
  prioridades?: DfcPrioridade[];
}): Promise<{ linhas: DfcPrioridadeContaLinha[]; erro?: string }> {
  const sp = new URLSearchParams();
  if (params?.idEmpresas && params.idEmpresas.length > 0) sp.set('idEmpresas', params.idEmpresas.join(','));
  if (params?.prioridades && params.prioridades.length > 0) sp.set('prioridades', params.prioridades.join(','));
  const qs = sp.toString();
  const res = await apiFetch(`/api/financeiro/dfc/prioridades/contas${qs ? `?${qs}` : ''}`);
  const body = (await res.json().catch(() => ({}))) as { linhas?: DfcPrioridadeContaLinha[]; erro?: string; error?: string };
  if (!res.ok) return { linhas: [], erro: body.error ?? body.erro ?? res.statusText };
  return { linhas: Array.isArray(body.linhas) ? body.linhas : [] };
}

export async function salvarPrioridadeConta(input: {
  idEmpresa: number;
  idContaFinanceiro: number;
  prioridade: DfcPrioridade;
  observacao?: string | null;
}): Promise<{ ok: boolean; erro?: string; linha?: DfcPrioridadeContaLinha }> {
  const res = await apiFetch('/api/financeiro/dfc/prioridades/contas', {
    method: 'PUT',
    body: input,
  });
  const body = (await res.json().catch(() => ({}))) as { linha?: DfcPrioridadeContaLinha; erro?: string; error?: string };
  if (!res.ok) return { ok: false, erro: body.error ?? body.erro ?? res.statusText };
  return { ok: true, linha: body.linha };
}

export async function removerPrioridadeConta(idEmpresa: number, idContaFinanceiro: number): Promise<{ ok: boolean; erro?: string }> {
  const res = await apiFetch(`/api/financeiro/dfc/prioridades/contas/${idEmpresa}/${idContaFinanceiro}`, {
    method: 'DELETE',
  });
  const body = (await res.json().catch(() => ({}))) as { removido?: boolean; erro?: string; error?: string };
  if (!res.ok) return { ok: false, erro: body.error ?? body.erro ?? res.statusText };
  return { ok: body.removido !== false };
}

export async function aplicarPrioridadeContasLote(input: {
  itens: Array<{ idEmpresa: number; idContaFinanceiro: number }>;
  prioridade?: DfcPrioridade;
  observacao?: string | null;
  remover?: boolean;
}): Promise<{ ok: boolean; erro?: string; afetados: number }> {
  const res = await apiFetch('/api/financeiro/dfc/prioridades/contas/lote', {
    method: 'POST',
    body: input,
  });
  const body = (await res.json().catch(() => ({}))) as {
    atualizados?: number;
    removidos?: number;
    erro?: string;
    error?: string;
  };
  if (!res.ok) return { ok: false, erro: body.error ?? body.erro ?? res.statusText, afetados: 0 };
  return { ok: true, afetados: input.remover ? (body.removidos ?? 0) : (body.atualizados ?? 0) };
}

export async function listarPrioridadesLancamento(params?: {
  idEmpresas?: number[];
  tipoRef?: DfcTipoRefLancamento;
  idsRef?: number[];
  prioridades?: DfcPrioridade[];
  idsContaFinanceiro?: number[];
}): Promise<{ linhas: DfcPrioridadeLancamentoLinha[]; erro?: string }> {
  const sp = new URLSearchParams();
  if (params?.idEmpresas && params.idEmpresas.length > 0) sp.set('idEmpresas', params.idEmpresas.join(','));
  if (params?.tipoRef) sp.set('tipoRef', params.tipoRef);
  if (params?.idsRef && params.idsRef.length > 0) sp.set('idsRef', params.idsRef.join(','));
  if (params?.prioridades && params.prioridades.length > 0) sp.set('prioridades', params.prioridades.join(','));
  if (params?.idsContaFinanceiro && params.idsContaFinanceiro.length > 0) {
    sp.set('idsContaFinanceiro', params.idsContaFinanceiro.join(','));
  }
  const qs = sp.toString();
  const res = await apiFetch(`/api/financeiro/dfc/prioridades/lancamentos${qs ? `?${qs}` : ''}`);
  const body = (await res.json().catch(() => ({}))) as { linhas?: DfcPrioridadeLancamentoLinha[]; erro?: string; error?: string };
  if (!res.ok) return { linhas: [], erro: body.error ?? body.erro ?? res.statusText };
  return { linhas: Array.isArray(body.linhas) ? body.linhas : [] };
}

export async function salvarPrioridadeLancamento(input: {
  idEmpresa: number;
  tipoRef: DfcTipoRefLancamento;
  idRef: number;
  idContaFinanceiro?: number | null;
  prioridade: DfcPrioridade;
  observacao?: string | null;
}): Promise<{ ok: boolean; erro?: string; linha?: DfcPrioridadeLancamentoLinha }> {
  const res = await apiFetch('/api/financeiro/dfc/prioridades/lancamentos', {
    method: 'PUT',
    body: input,
  });
  const body = (await res.json().catch(() => ({}))) as { linha?: DfcPrioridadeLancamentoLinha; erro?: string; error?: string };
  if (!res.ok) return { ok: false, erro: body.error ?? body.erro ?? res.statusText };
  return { ok: true, linha: body.linha };
}

export async function removerPrioridadeLancamento(idEmpresa: number, tipoRef: DfcTipoRefLancamento, idRef: number): Promise<{ ok: boolean; erro?: string }> {
  const res = await apiFetch(`/api/financeiro/dfc/prioridades/lancamentos/${idEmpresa}/${tipoRef}/${idRef}`, {
    method: 'DELETE',
  });
  const body = (await res.json().catch(() => ({}))) as { removido?: boolean; erro?: string; error?: string };
  if (!res.ok) return { ok: false, erro: body.error ?? body.erro ?? res.statusText };
  return { ok: body.removido !== false };
}

export async function aplicarPrioridadeLancamentosLote(input: {
  itens: Array<{ idEmpresa: number; tipoRef: DfcTipoRefLancamento; idRef: number; idContaFinanceiro?: number | null }>;
  prioridade?: DfcPrioridade;
  observacao?: string | null;
  remover?: boolean;
}): Promise<{ ok: boolean; erro?: string; afetados: number }> {
  const res = await apiFetch('/api/financeiro/dfc/prioridades/lancamentos/lote', {
    method: 'POST',
    body: input,
  });
  const body = (await res.json().catch(() => ({}))) as {
    atualizados?: number;
    removidos?: number;
    erro?: string;
    error?: string;
  };
  if (!res.ok) return { ok: false, erro: body.error ?? body.erro ?? res.statusText, afetados: 0 };
  return { ok: true, afetados: input.remover ? (body.removidos ?? 0) : (body.atualizados ?? 0) };
}
