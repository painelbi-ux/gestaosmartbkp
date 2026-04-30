/**
 * Diretrizes comerciais (parcelas após faturamento) + entrada configurável.
 * Retirada “fábrica” = classificação Observacoes === '1-Retirada na So Aço'.
 * Condição de pagamento: extrai dias numéricos do nome cadastrado no Nomus;
 * compara o prazo médio das parcelas ao pacote da faixa (média cadastro ≤ média referência).
 *
 * À vista: em qualquer valor dispensa exigência de % de entrada; prazos de pacote não se aplicam.
 * Acima do limite da faixa 1 (mínimo para parcelamento) também segue assim. Até esse limite (inclusive)
 * → exige condição à vista; parcelamento não permitido.
 */

export type FaixaTicket = 'ate_3000' | 'entre_3001_10000' | 'acima_10000';

export interface PoliticaComercialParams {
  /** Limite superior (R$) da primeira faixa de ticket. */
  limiteFaixa1Reais: number;
  /** Limite superior (R$) da segunda faixa (acima disso = terceira faixa). */
  limiteFaixa2Reais: number;
  diasParcelasFaixa1: number[];
  diasParcelasFaixa2: number[];
  diasParcelasFaixa3: number[];
  /** Entrada alvo em fração (ex.: 0.3 = 30%). */
  pctEntradaAlvo: number;
  /** Tolerância em pontos percentuais em fração (ex.: 0.035 = ±3,5 p.p.). */
  pctEntradaTolerancia: number;
  /** Prazo mínimo (dias) aceito ao extrair números do nome da condição. */
  diasCondicaoMin: number;
  /** Prazo máximo (dias) aceito ao extrair números do nome da condição. */
  diasCondicaoMax: number;
}

export const DEFAULT_POLITICA_COMERCIAL: PoliticaComercialParams = {
  limiteFaixa1Reais: 3000,
  limiteFaixa2Reais: 10000,
  diasParcelasFaixa1: [20, 30, 40],
  diasParcelasFaixa2: [30, 45, 60],
  diasParcelasFaixa3: [30, 45, 60, 75],
  pctEntradaAlvo: 0.3,
  pctEntradaTolerancia: 0.035,
  diasCondicaoMin: 8,
  /** Teto para ler dias no nome da condição (ex.: parcelas 210…300); evita ruído de quantidades fora de prazo. */
  diasCondicaoMax: 365,
};

/** Faixas de valor total do pedido (R$), conforme política. */
export function faixaTicket(total: number, politica: PoliticaComercialParams = DEFAULT_POLITICA_COMERCIAL): FaixaTicket {
  if (total <= politica.limiteFaixa1Reais) return 'ate_3000';
  if (total <= politica.limiteFaixa2Reais) return 'entre_3001_10000';
  return 'acima_10000';
}

export function labelFaixa(
  f: FaixaTicket,
  politica: PoliticaComercialParams = DEFAULT_POLITICA_COMERCIAL
): string {
  const f1 = politica.limiteFaixa1Reais;
  const f2 = politica.limiteFaixa2Reais;
  const fmt = (n: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);
  switch (f) {
    case 'ate_3000':
      return `Até ${fmt(f1)}`;
    case 'entre_3001_10000':
      return `${fmt(f1 + 1)} – ${fmt(f2)}`;
    default:
      return `Acima de ${fmt(f2)}`;
  }
}

/** Dias esperados para o saldo (parcelas), ordenados, conforme faixa de ticket. */
export function diasEsperadosParcelas(
  total: number,
  politica: PoliticaComercialParams = DEFAULT_POLITICA_COMERCIAL
): number[] {
  if (total <= politica.limiteFaixa1Reais) return [...politica.diasParcelasFaixa1];
  if (total <= politica.limiteFaixa2Reais) return [...politica.diasParcelasFaixa2];
  return [...politica.diasParcelasFaixa3];
}

export function isFormaCartao(forma: string): boolean {
  return /^cart/i.test(String(forma ?? '').trim());
}

export function isCondicaoAVista(nomeCondicao: string): boolean {
  const t = String(nomeCondicao ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (/VISTA|A VISTA|AVISTA|0\s*\+\s*0|SEM\s+PARCELA/i.test(t)) return true;
  if (/\b0\s*\/\s*0\b/.test(t)) return true;
  return false;
}

/**
 * Extrai possíveis dias de vencimento do texto da condição (ex.: "30+45+60", "30 / 45 / 60 DIAS").
 * Ignora números fora do intervalo configurado (evita ano, quantidade, etc.).
 */
export function extrairDiasDaCondicao(
  nomeCondicao: string,
  politica: PoliticaComercialParams = DEFAULT_POLITICA_COMERCIAL
): number[] {
  const t = String(nomeCondicao ?? '');
  const found: number[] = [];
  const re = /\b(\d{2,3})\b/g;
  let m: RegExpExecArray | null;
  const minN = politica.diasCondicaoMin;
  const maxN = politica.diasCondicaoMax;
  while ((m = re.exec(t)) !== null) {
    const n = parseInt(m[1], 10);
    if (n >= minN && n <= maxN) found.push(n);
  }
  return [...new Set(found)].sort((a, b) => a - b);
}

export function arraysDiasIguais(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

/** Média aritmética dos dias de parcela (saldo). Array vazio → 0. */
export function mediaPrazoDias(dias: number[]): number {
  if (!dias.length) return 0;
  return dias.reduce((s, d) => s + d, 0) / dias.length;
}

/**
 * Conforme se o prazo médio do cadastro é ≤ ao da política (referência).
 * Igual ou abaixo → conforme; acima → não conforme.
 */
export function prazoMedioParcelasConforme(obtidos: number[], esperados: number[]): boolean {
  if (!obtidos.length || !esperados.length) return false;
  const mObtidos = mediaPrazoDias(obtidos);
  const mRef = mediaPrazoDias(esperados);
  return mObtidos <= mRef + 1e-9;
}

export function pctEntradaOk(
  pct: number,
  politica: PoliticaComercialParams = DEFAULT_POLITICA_COMERCIAL
): boolean {
  const alvo = politica.pctEntradaAlvo;
  const tol = politica.pctEntradaTolerancia;
  return pct >= alvo - tol && pct <= alvo + tol;
}

/** Retirada na fábrica (Só Aço) — critério único acordado. */
export function isRetiradaSoAco(observacoes: string): boolean {
  return String(observacoes ?? '').trim() === '1-Retirada na So Aço';
}

export type StatusConformidade = 'ok' | 'alerta' | 'nao_conforme' | 'excluido_politica';

export interface AnaliseConformidadePedido {
  entradaOk: boolean;
  prazosOk: boolean;
  prazosIndeterminados: boolean;
  retiradaSoAco: boolean;
  motivos: string[];
  status: StatusConformidade;
}

export function analisarConformidade(
  input: {
    totalPedido: number;
    somaEntrada: number;
    formaPagamento: string;
    nomeCondicao: string;
    observacoesTipicas: string;
  },
  politica: PoliticaComercialParams = DEFAULT_POLITICA_COMERCIAL
): AnaliseConformidadePedido {
  const motivos: string[] = [];
  const cartao = isFormaCartao(input.formaPagamento);
  const aVista = isCondicaoAVista(input.nomeCondicao);
  const retiradaSoAco = isRetiradaSoAco(input.observacoesTipicas);

  if (cartao) {
    return {
      entradaOk: true,
      prazosOk: true,
      prazosIndeterminados: false,
      retiradaSoAco,
      motivos: ['Cartão: política de parcelas/entrada da tabela não se aplica da mesma forma.'],
      status: 'excluido_politica',
    };
  }

  const total = input.totalPedido;
  const lim1 = politica.limiteFaixa1Reais;
  const pctEntrada = total > 0 ? input.somaEntrada / total : 0;
  /** Condição à vista: não exige percentual mínimo de entrada (política de parcelas não se aplica ao saldo). */
  const entradaOk = total <= 0 ? false : aVista ? true : pctEntradaOk(pctEntrada, politica);

  if (!entradaOk && total > 0) {
    motivos.push(
      `Entrada ${(pctEntrada * 100).toFixed(1)}% — esperado ~${(politica.pctEntradaAlvo * 100).toFixed(0)}% do total (tolerância ±${(politica.pctEntradaTolerancia * 100).toFixed(1)} p.p.).`
    );
  }

  const esperados = diasEsperadosParcelas(total, politica);
  const obtidos = extrairDiasDaCondicao(input.nomeCondicao, politica);
  let prazosIndeterminados = obtidos.length === 0 && !aVista;
  let prazosOk = true;

  const fmtLim1 = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(lim1);

  if (total > 0 && total <= lim1 && !aVista) {
    prazosOk = false;
    prazosIndeterminados = false;
    motivos.push(
      `Até ${fmtLim1} a política exige condição de pagamento à vista (sem parcelamento após faturamento).`
    );
  } else if (aVista) {
    prazosOk = true;
  } else if (prazosIndeterminados) {
    prazosOk = false;
    motivos.push(
      'Não foi possível inferir os dias de parcelas pelo nome da condição — cadastre números explícitos (ex.: 30+45+60) no Nomus.'
    );
  } else if (!prazoMedioParcelasConforme(obtidos, esperados)) {
    prazosOk = false;
    const mCad = mediaPrazoDias(obtidos);
    const mRef = mediaPrazoDias(esperados);
    const fx = faixaTicket(total, politica);
    motivos.push(
      `Prazo médio do saldo: cadastro ${mCad.toFixed(1)} dias (parcelas [${obtidos.join(', ')}]) acima do referencial ${mRef.toFixed(1)} dias (pacote [${esperados.join(', ')}] para ${labelFaixa(fx, politica)}).`
    );
  }

  if (retiradaSoAco) {
    motivos.push(
      'Retirada Só Aço: conferir no ERP desconto ~4% previsto na política (não validado pelo valor líquido aqui).'
    );
  }

  let status: StatusConformidade = 'ok';
  if (total > 0 && total <= lim1 && !aVista) status = 'nao_conforme';
  else if (!entradaOk && total > 0) status = 'nao_conforme';
  else if (!aVista && obtidos.length > 0 && !prazoMedioParcelasConforme(obtidos, esperados)) status = 'nao_conforme';
  else if (!aVista && prazosIndeterminados) status = 'alerta';

  return {
    entradaOk,
    prazosOk: aVista ? true : prazosOk,
    prazosIndeterminados,
    retiradaSoAco,
    motivos,
    status,
  };
}
