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
  idEmpresa: number;
  erro?: string;
}

export async function fetchDfcAgendamentosEfetivos(params: {
  dataInicio: string;
  dataFim: string;
  granularidade: 'dia' | 'mes';
  idEmpresa?: number;
}): Promise<DfcAgendamentosEfetivosResponse> {
  const sp = new URLSearchParams();
  sp.set('dataInicio', params.dataInicio);
  sp.set('dataFim', params.dataFim);
  sp.set('granularidade', params.granularidade);
  if (params.idEmpresa != null) sp.set('idEmpresa', String(params.idEmpresa));
  const res = await apiFetch(`/api/financeiro/dfc/agendamentos-efetivos?${sp.toString()}`);
  const body = (await res.json().catch(() => ({}))) as DfcAgendamentosEfetivosResponse & { error?: string };
  if (!res.ok) {
    return {
      linhas: [],
      granularidade: params.granularidade,
      dataInicio: params.dataInicio,
      dataFim: params.dataFim,
      idEmpresa: params.idEmpresa ?? 1,
      erro: body.error ?? body.erro ?? res.statusText,
    };
  }
  return {
    linhas: Array.isArray(body.linhas) ? body.linhas : [],
    granularidade: body.granularidade === 'dia' ? 'dia' : 'mes',
    dataInicio: body.dataInicio ?? params.dataInicio,
    dataFim: body.dataFim ?? params.dataFim,
    idEmpresa: body.idEmpresa ?? params.idEmpresa ?? 1,
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

export async function fetchDfcAgendamentosDetalhe(params: {
  dataInicio: string;
  dataFim: string;
  granularidade: 'dia' | 'mes';
  ids: number[];
  /** Se omitido, retorna lançamentos de todo o intervalo (ex.: coluna Total). */
  periodo?: string;
  idEmpresa?: number;
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
  if (params.idEmpresa != null) sp.set('idEmpresa', String(params.idEmpresa));
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
