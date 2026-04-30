import { apiFetch } from './client';

export type StatusConformidadePainel = 'ok' | 'alerta' | 'nao_conforme' | 'excluido_politica';
export type FaixaTicketPainel = 'ate_3000' | 'entre_3001_10000' | 'acima_10000';

/** Data do painel em `YYYY-MM-DD` → exibição `dd/MM/yyyy`. */
export function formatEmissaoPainelBr(isoYmd: string | undefined | null): string {
  const s = String(isoYmd ?? '').trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s || '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Mesmo contrato do backend (`PoliticaComercialParams`). */
export interface PoliticaComercialPainel {
  limiteFaixa1Reais: number;
  limiteFaixa2Reais: number;
  diasParcelasFaixa1: number[];
  diasParcelasFaixa2: number[];
  diasParcelasFaixa3: number[];
  pctEntradaAlvo: number;
  pctEntradaTolerancia: number;
  diasCondicaoMin: number;
  diasCondicaoMax: number;
}

export interface PainelComercialItemPedido {
  idItemPedido: number;
  codigo: string;
  descricao: string;
  qtdePedida: number;
  qtdeAtendida: number;
  valorTotalComIpi: number;
  statusIp: number;
  tabelaPreco: string;
}

export interface PainelComercialPedido {
  pd: string;
  pdId: number;
  empresaId: number;
  cliente: string;
  emissao: string;
  tabelaPreco: string;
  totalPedido: number;
  somaEntrada: number;
  pctEntrada: number;
  formaPagamento: string;
  condicaoPagamento: string;
  metodoEntrega: string;
  observacoes: string;
  faixaTicket: FaixaTicketPainel;
  labelFaixa: string;
  diasCondicao: number[];
  diasEsperados: string;
  periodicidadeLabel: string;
  entradaOk: boolean;
  prazosOk: boolean;
  prazosIndeterminados: boolean;
  retiradaSoAco: boolean;
  status: StatusConformidadePainel;
  motivos: string[];
}

export interface PainelComercialDashboard {
  dataInicio: string;
  dataFim: string;
  totalPedidos: number;
  pedidosAnalisados: number;
  pedidosExcluidosPolitica: number;
  pctConformes: number;
  pctAlertas: number;
  pctNaoConformes: number;
  ticketMedio: number;
  ticketMedioAnalisados: number;
  prazoMedioVendasAPrazoDias: number | null;
  pedidosVendasAPrazoComPrazoCadastrado: number;
  porMes: { mes: string; total: number; ok: number; alerta: number; naoConforme: number; excluido: number }[];
  porForma: { forma: string; pedidos: number; pctOk: number }[];
  porCondicao: { condicao: string; pedidos: number }[];
  porFaixa: { faixa: FaixaTicketPainel; label: string; pedidos: number; pctOk: number }[];
  porEntradaFaixa: { faixa: string; pedidos: number }[];
  pedidos: PainelComercialPedido[];
  erro?: string;
  error?: string;
}

export async function fetchPainelComercialItensPedido(
  pdId: number,
  opts?: { signal?: AbortSignal }
): Promise<{ itens: PainelComercialItemPedido[]; erro?: string }> {
  const sp = new URLSearchParams();
  sp.set('pdId', String(pdId));
  const res = await apiFetch(`/api/financeiro/painel-comercial/itens-pedido?${sp.toString()}`, { signal: opts?.signal });
  const body = (await res.json().catch(() => ({}))) as {
    itens?: unknown[];
    error?: string;
    erro?: string;
  };
  if (!res.ok) {
    return { itens: [], erro: body.error ?? body.erro ?? res.statusText };
  }
  const raw = Array.isArray(body.itens) ? body.itens : [];
  const itens: PainelComercialItemPedido[] = raw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      idItemPedido: Number(r.idItemPedido) || 0,
      codigo: String(r.codigo ?? ''),
      descricao: String(r.descricao ?? ''),
      qtdePedida: Number(r.qtdePedida) || 0,
      qtdeAtendida: Number(r.qtdeAtendida) || 0,
      valorTotalComIpi: Number(r.valorTotalComIpi) || 0,
      statusIp: Number(r.statusIp) || 0,
      tabelaPreco: String(r.tabelaPreco ?? ''),
    };
  });
  return { itens };
}

function hojeYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inicioAnoYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

export async function fetchPainelComercial(params?: {
  dataInicio?: string;
  dataFim?: string;
  empresaId?: 'todos' | 1 | 2;
}): Promise<PainelComercialDashboard> {
  const dataInicio = params?.dataInicio ?? inicioAnoYmd();
  const dataFim = params?.dataFim ?? hojeYmd();
  const sp = new URLSearchParams();
  sp.set('dataInicio', dataInicio);
  sp.set('dataFim', dataFim);
  sp.set('empresaId', String(params?.empresaId ?? 'todos'));
  const res = await apiFetch(`/api/financeiro/painel-comercial?${sp.toString()}`);
  const body = (await res.json().catch(() => ({}))) as PainelComercialDashboard & { error?: string };
  if (!res.ok) {
    return {
      dataInicio,
      dataFim,
      totalPedidos: 0,
      pedidosAnalisados: 0,
      pedidosExcluidosPolitica: 0,
      pctConformes: 0,
      pctAlertas: 0,
      pctNaoConformes: 0,
      ticketMedio: 0,
      ticketMedioAnalisados: 0,
      prazoMedioVendasAPrazoDias: null,
      pedidosVendasAPrazoComPrazoCadastrado: 0,
      porMes: [],
      porForma: [],
      porCondicao: [],
      porFaixa: [],
      porEntradaFaixa: [],
      pedidos: [],
      erro: body.error ?? body.erro ?? res.statusText,
    };
  }
  return {
    ...body,
    prazoMedioVendasAPrazoDias:
      typeof body.prazoMedioVendasAPrazoDias === 'number' ? body.prazoMedioVendasAPrazoDias : null,
    pedidosVendasAPrazoComPrazoCadastrado:
      typeof body.pedidosVendasAPrazoComPrazoCadastrado === 'number'
        ? body.pedidosVendasAPrazoComPrazoCadastrado
        : 0,
    porMes: Array.isArray(body.porMes) ? body.porMes : [],
    porForma: Array.isArray(body.porForma) ? body.porForma : [],
    porCondicao: Array.isArray(body.porCondicao) ? body.porCondicao : [],
    porFaixa: Array.isArray(body.porFaixa) ? body.porFaixa : [],
    porEntradaFaixa: Array.isArray(body.porEntradaFaixa) ? body.porEntradaFaixa : [],
    pedidos: Array.isArray(body.pedidos) ? body.pedidos : [],
  };
}

export async function fetchPoliticaComercialPainel(): Promise<{
  politica: PoliticaComercialPainel;
  padraoSistema: PoliticaComercialPainel;
  erro?: string;
}> {
  const res = await apiFetch('/api/financeiro/painel-comercial/politica');
  const body = (await res.json().catch(() => ({}))) as {
    politica?: PoliticaComercialPainel;
    padraoSistema?: PoliticaComercialPainel;
    error?: string;
  };
  if (!res.ok) {
    return {
      politica: body.politica ?? ({} as PoliticaComercialPainel),
      padraoSistema: body.padraoSistema ?? ({} as PoliticaComercialPainel),
      erro: body.error ?? res.statusText,
    };
  }
  return {
    politica: body.politica as PoliticaComercialPainel,
    padraoSistema: (body.padraoSistema ?? body.politica) as PoliticaComercialPainel,
  };
}

export async function putPoliticaComercialPainel(
  politica: PoliticaComercialPainel
): Promise<{ politica: PoliticaComercialPainel; erro?: string }> {
  const res = await apiFetch('/api/financeiro/painel-comercial/politica', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(politica),
  });
  const body = (await res.json().catch(() => ({}))) as {
    politica?: PoliticaComercialPainel;
    error?: string;
  };
  if (!res.ok) {
    return { politica: politica, erro: body.error ?? res.statusText };
  }
  return { politica: (body.politica ?? politica) as PoliticaComercialPainel };
}
