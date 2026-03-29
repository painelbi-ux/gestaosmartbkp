import type { MrpHorizonteLinha, MrpRow } from '../api/mrp';

export type CelDiaHorizonteCalc = { consumo: number; saldoEstoque: number; entrada: number };

export function fmtNum2(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function codigoChave(row: MrpRow): string {
  return String(row.codigocomponente ?? '').trim();
}

/**
 * Um único passe: saldo efetivo exibido/calculado + necessidade acumulada por dia.
 * - Dia 0: saldo = valor de `saldoEstoque` da célula se > 0, senão 0.
 * - Dias seguintes: saldo = max(0, saldo do dia anterior − consumo do dia anterior + entrada do dia anterior).
 */
export function saldosENecessidadesHorizonte(dias: CelDiaHorizonteCalc[]): {
  saldosEf: number[];
  nAcum: number[];
} {
  const saldosEf: number[] = [];
  const nAcum: number[] = [];
  let nAnterior = 0;
  for (let i = 0; i < dias.length; i++) {
    const cel = dias[i];
    let s: number;
    if (i === 0) {
      const rawS = Number(cel.saldoEstoque);
      const rawOk = Number.isFinite(rawS) ? rawS : 0;
      s = rawOk > 0 ? rawOk : 0;
    } else {
      const prevS = saldosEf[i - 1] ?? 0;
      const prevC = Number(dias[i - 1].consumo);
      const consumoAnterior = Number.isFinite(prevC) ? prevC : 0;
      const prevE = Number(dias[i - 1].entrada);
      const entradaAnterior = Number.isFinite(prevE) ? prevE : 0;
      s = Math.max(0, prevS - consumoAnterior + entradaAnterior);
    }
    saldosEf.push(s);

    const consumo = Number(cel.consumo);
    const entrada = Number(cel.entrada);
    const c = Number.isFinite(consumo) ? consumo : 0;
    const e = Number.isFinite(entrada) ? entrada : 0;
    const bruto = c - (e + s) + nAnterior;
    const n = bruto <= 0 ? 0 : bruto;
    nAcum.push(n);
    nAnterior = n;
  }
  return { saldosEf, nAcum };
}

export function saldosEstoqueEfetivosHorizonte(dias: CelDiaHorizonteCalc[]): number[] {
  return saldosENecessidadesHorizonte(dias).saldosEf;
}

export function necessidadesAcumuladasHorizonte(dias: CelDiaHorizonteCalc[]): number[] {
  return saldosENecessidadesHorizonte(dias).nAcum;
}

export function primeiroIndiceRupturaDeNAcum(nAcum: number[]): number {
  for (let i = 0; i < nAcum.length; i++) {
    if (nAcum[i] > 0) return i;
  }
  return -1;
}

export function primeiroIndiceRupturaAcumulada(linha: MrpHorizonteLinha | undefined): number {
  if (!linha?.dias?.length) return -1;
  return primeiroIndiceRupturaDeNAcum(necessidadesAcumuladasHorizonte(linha.dias));
}

export function primeiraDataRuptura(linha: MrpHorizonteLinha | undefined): string | null {
  const i = primeiroIndiceRupturaAcumulada(linha);
  if (i < 0 || !linha?.dias?.[i]) return null;
  return linha.dias[i].data;
}

export function parseDataMRP(val: unknown): string | null {
  if (val == null) return null;
  const raw = String(val).trim();
  if (!raw) return null;
  const s = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
  if (br) {
    const d = br[1].padStart(2, '0');
    const m = br[2].padStart(2, '0');
    return `${br[3]}-${m}-${d}`;
  }
  return null;
}

export function temValorNumericoPositivo(val: unknown): boolean {
  if (val == null || val === '') return false;
  const n = Number(val);
  return Number.isFinite(n) && n > 0;
}

/**
 * Status da linha com horizonte carregado. Ordem: Sem PC/SC → Sem PC → Antes/Depois do PC.
 * `isoRupturaCache`: se informado (inclui `null`), evita recalcular a primeira data de ruptura.
 */
export function statusHorizonteParaLinha(
  row: MrpRow,
  linhaH: MrpHorizonteLinha | undefined,
  isoRupturaCache?: string | null
): string {
  if (!linhaH?.dias?.length) return '—';

  const isoRuptura = isoRupturaCache !== undefined ? isoRupturaCache : primeiraDataRuptura(linhaH);
  if (!isoRuptura) return 'Abastecido';

  const isoEntrega = parseDataMRP(row.dataEntrega);
  const pcLiberado = temValorNumericoPositivo(row.saldoaReceber);
  const qtdeSolicitada = temValorNumericoPositivo(row.quantidade);

  if (!pcLiberado && !qtdeSolicitada) return 'Ruptura Sem PC/SC';

  if (!pcLiberado && qtdeSolicitada) return 'Ruptura Sem PC';

  if (pcLiberado) {
    if (!isoEntrega) return 'Abastecido';
    if (isoRuptura < isoEntrega) return 'Ruptura Antes do PC';
    if (isoRuptura > isoEntrega) return 'Ruptura Depois do PC';
    return 'Ruptura Antes do PC';
  }

  return 'Abastecido';
}

export function qtdeAComprarHorizonte(
  status: string,
  linhaH: MrpHorizonteLinha | undefined,
  nAcumCache?: number[]
): string {
  if (status === '—' || !linhaH?.dias?.length) return '—';
  if (status === 'Abastecido' || status === 'Ruptura Depois do PC') return '—';

  const acum =
    nAcumCache && nAcumCache.length === linhaH.dias.length
      ? nAcumCache
      : necessidadesAcumuladasHorizonte(linhaH.dias);

  if (status === 'Ruptura Antes do PC') {
    const i = primeiroIndiceRupturaDeNAcum(acum);
    if (i <= 0) return '—';
    return fmtNum2(acum[i - 1]);
  }

  if (status === 'Ruptura Sem PC' || status === 'Ruptura Sem PC/SC') {
    return fmtNum2(acum[acum.length - 1]);
  }

  return '—';
}

/** Valor numérico para agregações (mesma regra de `qtdeAComprarHorizonte`). */
export function qtdeAComprarHorizonteValor(
  status: string,
  linhaH: MrpHorizonteLinha | undefined,
  nAcumCache?: number[]
): number | null {
  if (status === '—' || !linhaH?.dias?.length) return null;
  if (status === 'Abastecido' || status === 'Ruptura Depois do PC') return null;

  const acum =
    nAcumCache && nAcumCache.length === linhaH.dias.length
      ? nAcumCache
      : necessidadesAcumuladasHorizonte(linhaH.dias);

  if (status === 'Ruptura Antes do PC') {
    const i = primeiroIndiceRupturaDeNAcum(acum);
    if (i <= 0) return null;
    return acum[i - 1];
  }

  if (status === 'Ruptura Sem PC' || status === 'Ruptura Sem PC/SC') {
    return acum[acum.length - 1] ?? null;
  }

  return null;
}

export function empenhoTotalHorizonte(linha: MrpHorizonteLinha | undefined): string {
  if (!linha?.dias?.length) return '—';
  let sum = 0;
  for (const cel of linha.dias) {
    const c = Number(cel.consumo);
    if (Number.isFinite(c)) sum += c;
  }
  return fmtNum2(sum);
}

export function empenhoTotalHorizonteNum(linha: MrpHorizonteLinha | undefined): number {
  if (!linha?.dias?.length) return 0;
  let sum = 0;
  for (const cel of linha.dias) {
    const c = Number(cel.consumo);
    if (Number.isFinite(c)) sum += c;
  }
  return sum;
}

/** Coluna «Empenho horizonte»: somatório do consumo (MPP) em todos os dias do horizonte. */
export function empenhoHorizonteUltimoDia(linha: MrpHorizonteLinha | undefined): string {
  return empenhoTotalHorizonte(linha);
}

/** Mesmo somatório de consumo que `empenhoHorizonteUltimoDia` (valor numérico). `nAcumCache` ignorado. */
export function empenhoHorizonteUltimoDiaNum(
  linha: MrpHorizonteLinha | undefined,
  _nAcumCache?: number[]
): number {
  return empenhoTotalHorizonteNum(linha);
}
