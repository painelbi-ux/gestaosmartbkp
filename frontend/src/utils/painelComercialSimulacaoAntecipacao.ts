/**
 * Simulação antecipação — mesmos vencimentos (faturamento + prazos da condição) e custos fixos.
 * - `baseDiasParaVp: 'emissao'` (cen. I): dias no VP = emissão → vencimento.
 * - `baseDiasParaVp: 'faturamento'` (cen. II): dias no VP = data faturamento → vencimento (= 30, 60, … da condição).
 * VP = valorParcela / (1 + taxaMensal) ^ (dias/30); deságio = parcela − VP.
 */

export const DIAS_ANTECIPACAO_FATURAMENTO_PADRAO = 60;

export type LinhaSimulacaoAntecipacao = {
  indice: number;
  diasCondicao: number;
  vencimento: Date;
  valorParcela: number;
  diferencaDias: number;
  prazoMeses: number;
  valorPresente: number;
  desagio: number;
};

export type ResultadoSimulacaoAntecipacao = {
  emissao: Date;
  dataFaturamento: Date;
  diasAteFaturamento: number;
  totalPedido: number;
  somaEntrada: number;
  valorAPrazo: number;
  parcelas: number;
  valorParcela: number;
  taxaMensal: number;
  taxaEmissaoBoletosTotal: number;
  valorTac: number;
  valorTed: number;
  linhas: LinhaSimulacaoAntecipacao[];
  somaValorPresente: number;
  somaDesagioParcelas: number;
  /** Boletos (soma) + TAC + TED — deduzidos do valor líquido. */
  totalCustosFixos: number;
  /** Valor presente das parcelas menos custos fixos (boletos, TAC, TED). */
  valorLiquidoAntecipado: number;
  /**
   * Face a prazo vs líquido: (valorAPrazo − valorLiquidoAntecipado) / valorAPrazo × 100.
   * Inclui deságio por taxa + custos de boleto, TAC e TED.
   */
  pctDescontoTotalOperacao: number | null;
};

export function parseDataIsoLocal(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd ?? '').trim().slice(0, 10));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt;
}

export function addDiasCorridos(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/** Diferença em dias corridos (data A − data B). */
export function diffDiasCorridos(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ua - ub) / 86400000);
}

export function formatDataBr(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Cen. I: dias emissão→vencimento. Cen. II: dias data faturamento→vencimento (= prazos 30, 60, …). */
export type BaseDiasParaVpSimulacao = 'emissao' | 'faturamento';

export type ParamsSimulacaoAntecipacao = {
  emissaoYmd: string;
  diasCondicao: number[];
  totalPedido: number;
  somaEntrada: number;
  /** Taxa efetiva mensal, ex.: 0.02 = 2% a.m. (célula H9 da planilha). */
  taxaMensal: number;
  diasAteFaturamento?: number;
  /** Soma R$ emissão de boletos (planilha: 4 × 5,5). */
  taxaEmissaoBoletosTotal?: number;
  valorTac?: number;
  valorTed?: number;
  /** Default `emissao` (cenário I). */
  baseDiasParaVp?: BaseDiasParaVpSimulacao;
};

/**
 * Retorna `null` se emissão inválida ou não houver parcelas (condição sem dias).
 */
export function simularAntecipacaoDataFaturamento(p: ParamsSimulacaoAntecipacao): ResultadoSimulacaoAntecipacao | null {
  const emissao = parseDataIsoLocal(p.emissaoYmd);
  if (!emissao) return null;

  const diasFat = p.diasAteFaturamento ?? DIAS_ANTECIPACAO_FATURAMENTO_PADRAO;
  const dataFaturamento = addDiasCorridos(emissao, diasFat);

  const diasOrd = [...p.diasCondicao].filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => a - b);
  if (diasOrd.length === 0) return null;

  const totalPedido = Math.max(0, Number(p.totalPedido) || 0);
  const somaEntrada = Math.max(0, Number(p.somaEntrada) || 0);
  const valorAPrazo = Math.max(0, totalPedido - somaEntrada);
  const parcelas = diasOrd.length;
  const valorParcela = parcelas > 0 ? valorAPrazo / parcelas : 0;

  const taxaMensal = Math.max(0, Number(p.taxaMensal) || 0);
  const taxaEmissaoBoletosTotal = Math.max(0, Number(p.taxaEmissaoBoletosTotal ?? 0));
  const valorTac = Math.max(0, Number(p.valorTac ?? 0));
  const valorTed = Math.max(0, Number(p.valorTed ?? 0));

  const baseRef: Date = p.baseDiasParaVp === 'faturamento' ? dataFaturamento : emissao;

  const linhas: LinhaSimulacaoAntecipacao[] = diasOrd.map((dias, indice) => {
    const vencimento = addDiasCorridos(dataFaturamento, dias);
    const diferencaDias = diffDiasCorridos(vencimento, baseRef);
    const prazoMeses = diferencaDias / 30;
    const valorPresente =
      taxaMensal >= 0 && prazoMeses >= 0
        ? valorParcela / Math.pow(1 + taxaMensal, prazoMeses)
        : valorParcela;
    const desagio = valorParcela - valorPresente;
    return {
      indice: indice + 1,
      diasCondicao: dias,
      vencimento,
      valorParcela,
      diferencaDias,
      prazoMeses,
      valorPresente,
      desagio,
    };
  });

  const somaValorPresente = linhas.reduce((s, r) => s + r.valorPresente, 0);
  const somaDesagioParcelas = linhas.reduce((s, r) => s + r.desagio, 0);
  const totalCustosFixos = taxaEmissaoBoletosTotal + valorTac + valorTed;
  const valorLiquidoAntecipado = somaValorPresente - totalCustosFixos;
  const pctDescontoTotalOperacao =
    valorAPrazo > 0 ? ((valorAPrazo - valorLiquidoAntecipado) / valorAPrazo) * 100 : null;

  return {
    emissao,
    dataFaturamento,
    diasAteFaturamento: diasFat,
    totalPedido,
    somaEntrada,
    valorAPrazo,
    parcelas,
    valorParcela,
    taxaMensal,
    taxaEmissaoBoletosTotal,
    valorTac,
    valorTed,
    linhas,
    somaValorPresente,
    somaDesagioParcelas,
    totalCustosFixos,
    valorLiquidoAntecipado,
    pctDescontoTotalOperacao,
  };
}
