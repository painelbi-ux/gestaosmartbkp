import { apiFetch } from './client';

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
}): Promise<DfcAgendamentosEfetivosResponse> {
  const sp = new URLSearchParams();
  sp.set('dataInicio', params.dataInicio);
  sp.set('dataFim', params.dataFim);
  sp.set('granularidade', params.granularidade);
  const emps = params.idEmpresas ?? [1, 2];
  if (emps.length > 0) sp.set('idEmpresas', emps.join(','));
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
}): Promise<DfcKpis> {
  const sp = new URLSearchParams();
  sp.set('dataInicio', params.dataInicio);
  sp.set('dataFim', params.dataFim);
  const emps = params.idEmpresas ?? [1, 2];
  sp.set('idEmpresas', emps.join(','));
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

export async function fetchDfcAgendamentosDetalhe(params: {
  dataInicio: string;
  dataFim: string;
  granularidade: 'dia' | 'mes';
  ids: number[];
  /** Se omitido, retorna lançamentos de todo o intervalo (ex.: coluna Total). */
  periodo?: string;
  idEmpresas?: number[];
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
