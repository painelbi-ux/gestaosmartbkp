import { apiFetch } from './client';
import type { DfcPrioridade, DfcTipoRefLancamento } from './dfcPrioridade';

export interface DfcAgendamentoLinha {
  idContaFinanceiro: number;
  periodo: string;
  valor: number;
}

export interface DfcAgendamentosEfetivosResponse {
  linhas: DfcAgendamentoLinha[];
  granularidade: 'dia' | 'mes';
  dataInicio: string;
  dataFim: string;
  idEmpresas: number[];
  erro?: string;
}

export async function fetchDfcAgendamentosEfetivos(params: {
  dataInicio: string;
  dataFim: string;
  granularidade: 'dia' | 'mes';
  idEmpresas?: number[];
  prioridades?: DfcPrioridade[];
}): Promise<DfcAgendamentosEfetivosResponse> {
  const sp = new URLSearchParams();
  sp.set('dataInicio', params.dataInicio);
  sp.set('dataFim', params.dataFim);
  sp.set('granularidade', params.granularidade);
  const emps = params.idEmpresas ?? [1, 2];
  if (emps.length > 0) sp.set('idEmpresas', emps.join(','));
  if (params.prioridades && params.prioridades.length > 0) {
    sp.set('prioridades', params.prioridades.join(','));
  }
  const res = await apiFetch(`/api/financeiro/dfc/agendamentos-efetivos?${sp.toString()}`);
  const body = (await res.json().catch(() => ({}))) as DfcAgendamentosEfetivosResponse & { error?: string };
  if (!res.ok) {
    return {
      linhas: [],
      granularidade: params.granularidade,
      dataInicio: params.dataInicio,
      dataFim: params.dataFim,
      idEmpresas: emps,
      erro: body.error ?? body.erro ?? res.statusText,
    };
  }
  return {
    linhas: Array.isArray(body.linhas) ? body.linhas : [],
    granularidade: body.granularidade === 'dia' ? 'dia' : 'mes',
    dataInicio: body.dataInicio ?? params.dataInicio,
    dataFim: body.dataFim ?? params.dataFim,
    idEmpresas: Array.isArray(body.idEmpresas) ? body.idEmpresas : emps,
    erro: body.erro,
  };
}

export interface DfcAgendamentoDetalheLinha {
  id: number;
  descricaoLancamento: string | null;
  nome: string | null;
  dataVencimento: string | null;
  dataBaixa: string | null;
  valorBaixado: number;
  /** Universo do `id`: 'A' = agendamentofinanceiro.id ; 'L' = lancamentofinanceiro.id. */
  tipoRef: DfcTipoRefLancamento;
  /** idEmpresa Nomus desta linha (chave para a prioridade). */
  idEmpresa: number;
  /** idContaFinanceiro Nomus (chave para a prioridade pelo plano de contas). */
  idContaFinanceiro: number | null;
}

export interface DfcKpis {
  recebimentos: number;
  pagamentos: number;
  vencidosPagar: number;
  vencidosReceber: number;
  aVencerPagar: number;
  aVencerReceber: number;
  saldoBancario: number;
  idEmpresas?: number[];
  erro?: string;
}

export async function fetchDfcKpis(params: {
  dataInicio: string;
  dataFim: string;
  idEmpresas?: number[];
  prioridades?: DfcPrioridade[];
}): Promise<DfcKpis> {
  const sp = new URLSearchParams();
  sp.set('dataInicio', params.dataInicio);
  sp.set('dataFim', params.dataFim);
  const emps = params.idEmpresas ?? [1, 2];
  sp.set('idEmpresas', emps.join(','));
  if (params.prioridades && params.prioridades.length > 0) {
    sp.set('prioridades', params.prioridades.join(','));
  }
  const res = await apiFetch(`/api/financeiro/dfc/kpis?${sp.toString()}`);
  const body = (await res.json().catch(() => ({}))) as DfcKpis & { error?: string };
  if (!res.ok) {
    return {
      recebimentos: 0, pagamentos: 0, vencidosPagar: 0, vencidosReceber: 0,
      aVencerPagar: 0, aVencerReceber: 0, saldoBancario: 0,
      erro: body.error ?? body.erro ?? res.statusText,
    };
  }
  return {
    recebimentos: body.recebimentos ?? 0,
    pagamentos: body.pagamentos ?? 0,
    vencidosPagar: body.vencidosPagar ?? 0,
    vencidosReceber: body.vencidosReceber ?? 0,
    aVencerPagar: body.aVencerPagar ?? 0,
    aVencerReceber: body.aVencerReceber ?? 0,
    saldoBancario: body.saldoBancario ?? 0,
    idEmpresas: body.idEmpresas,
    erro: body.erro,
  };
}

/** Despesas (agendamento P) em aberto no Nomus — critérios alinhados aos KPIs Vencidos / A vencer a pagar. */
export type DfcDespesaPagamentoSituacaoApi = 'vencido' | 'a_vencer';

export interface DfcDespesaPagamentoEmAbertoLinha {
  situacao: DfcDespesaPagamentoSituacaoApi;
  id: number;
  idEmpresa: number;
  idContaFinanceiro: number | null;
  descricaoLancamento: string | null;
  nome: string | null;
  dataVencimento: string | null;
  saldoBaixar: number;
}

export async function fetchDfcDespesasPagamentoFornecedorOpcoes(params: {
  dataInicio: string;
  dataFim: string;
  idEmpresas?: number[];
}): Promise<{ nomes: string[]; erro?: string }> {
  const sp = new URLSearchParams();
  sp.set('dataInicio', params.dataInicio);
  sp.set('dataFim', params.dataFim);
  const emps = params.idEmpresas ?? [1, 2];
  sp.set('idEmpresas', emps.join(','));
  const res = await apiFetch(`/api/financeiro/dfc/despesas-em-aberto-fornecedor-opcoes?${sp.toString()}`);
  const body = (await res.json().catch(() => ({}))) as {
    nomes?: string[];
    erro?: string;
    error?: string;
  };
  if (!res.ok) {
    return { nomes: [], erro: body.error ?? body.erro ?? res.statusText };
  }
  return {
    nomes: Array.isArray(body.nomes) ? body.nomes : [],
    erro: body.erro,
  };
}

export async function fetchDfcDespesasPagamentoEmAberto(params: {
  dataInicio: string;
  dataFim: string;
  idEmpresas?: number[];
  /** Legado — preferir `idsContaFinanceiro`. */
  idContaFinanceiro?: number;
  idsContaFinanceiro?: number[];
  nomesFornecedor?: string[];
}): Promise<{
  linhas: DfcDespesaPagamentoEmAbertoLinha[];
  erro?: string;
}> {
  const sp = new URLSearchParams();
  sp.set('dataInicio', params.dataInicio);
  sp.set('dataFim', params.dataFim);
  const emps = params.idEmpresas ?? [1, 2];
  sp.set('idEmpresas', emps.join(','));
  const idsMulti = params.idsContaFinanceiro?.filter((n) => n > 0) ?? [];
  if (idsMulti.length > 0) {
    sp.set('idsContaFinanceiro', idsMulti.join(','));
  } else if (params.idContaFinanceiro != null && params.idContaFinanceiro > 0) {
    sp.set('idContaFinanceiro', String(params.idContaFinanceiro));
  }
  for (const n of params.nomesFornecedor ?? []) {
    if (n.trim()) sp.append('fornecedor', n.trim());
  }
  const res = await apiFetch(`/api/financeiro/dfc/despesas-pagamento-em-aberto?${sp.toString()}`);
  const body = (await res.json().catch(() => ({}))) as {
    linhas?: DfcDespesaPagamentoEmAbertoLinha[];
    erro?: string;
    error?: string;
  };
  if (!res.ok) {
    return {
      linhas: [],
      erro: body.error ?? body.erro ?? res.statusText,
    };
  }
  return {
    linhas: Array.isArray(body.linhas) ? body.linhas : [],
    erro: body.erro,
  };
}

export async function fetchDfcAgendamentosDetalhe(params: {
  dataInicio: string;
  dataFim: string;
  granularidade: 'dia' | 'mes';
  ids: number[];
  /** Se omitido, retorna lançamentos de todo o intervalo (ex.: coluna Total). */
  periodo?: string;
  idEmpresas?: number[];
  prioridades?: DfcPrioridade[];
  signal?: AbortSignal;
}): Promise<{
  detalhes: DfcAgendamentoDetalheLinha[];
  truncado?: boolean;
  erro?: string;
}> {
  const sp = new URLSearchParams();
  sp.set('dataInicio', params.dataInicio);
  sp.set('dataFim', params.dataFim);
  sp.set('granularidade', params.granularidade);
  sp.set('ids', params.ids.filter((n) => n > 0).join(','));
  if (params.periodo) sp.set('periodo', params.periodo);
  const detEmps = params.idEmpresas ?? [1, 2];
  if (detEmps.length > 0) sp.set('idEmpresas', detEmps.join(','));
  if (params.prioridades && params.prioridades.length > 0) {
    sp.set('prioridades', params.prioridades.join(','));
  }
  const res = await apiFetch(`/api/financeiro/dfc/agendamentos-efetivos-detalhe?${sp.toString()}`, {
    signal: params.signal,
  });
  const body = (await res.json().catch(() => ({}))) as {
    detalhes?: DfcAgendamentoDetalheLinha[];
    truncado?: boolean;
    erro?: string;
    error?: string;
  };
  if (!res.ok) {
    return {
      detalhes: [],
      erro: body.error ?? body.erro ?? res.statusText,
    };
  }
  return {
    detalhes: Array.isArray(body.detalhes) ? body.detalhes : [],
    truncado: body.truncado === true,
    erro: body.erro,
  };
}
