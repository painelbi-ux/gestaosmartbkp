/**
 * Horizonte de produção MRP: cruza resumo MPP (qtde total no dia + estoque início do dia) e PC (entrada),
 * Necessidade = Consumo − (Saldo Estoque + Entrada). Independente das abas no browser.
 */

import type { Pool } from 'mysql2/promise';
import {
  FETCH_LIMIT_MPP_HORIZONTE,
  listarMppDadosFiltrados,
  MPP_FILTROS_VAZIOS,
  mppDiaIsoDataPrevisao,
} from '../controllers/mppController.js';
import { listarPcSaldoReceberTodos } from '../controllers/pcSaldoReceberController.js';

const MAX_DIAS_HORIZONTE = 400;

function isoDateOnlyValid(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Números vindos do ERP / JSON (string com vírgula ou ponto). */
function numHorizonte(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/\s/g, '');
  if (!s) return 0;
  let n = Number(s);
  if (Number.isFinite(n)) return n;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
    n = Number(s);
  }
  return Number.isFinite(n) ? n : 0;
}

function hojeIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addOneDayIso(iso: string): string {
  const [y, mo, da] = iso.split('-').map(Number);
  const dt = new Date(y, mo - 1, da);
  dt.setDate(dt.getDate() + 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function enumerateDaysInclusive(inicioIso: string, fimIso: string): string[] {
  if (inicioIso > fimIso) return [];
  const out: string[] = [];
  let cur = inicioIso;
  let guard = 0;
  while (cur <= fimIso && guard++ < MAX_DIAS_HORIZONTE + 5) {
    out.push(cur);
    if (cur === fimIso) break;
    cur = addOneDayIso(cur);
  }
  return out;
}

export type MrpHorizonteCelula = {
  data: string;
  /** Qtde total componente (no dia) — MPP */
  consumo: number;
  /** Estoque total disponível início do dia — MPP */
  saldoEstoque: number;
  /** Saldo a receber — PC na data de entrega */
  entrada: number;
  /** max(0, Consumo − (Saldo Estoque + Entrada)) */
  necessidade: number;
};

export type MrpHorizonteLinha = {
  codigo: string;
  componente: string;
  dias: MrpHorizonteCelula[];
};

export type MrpHorizonteResultado = {
  dataInicio: string;
  dataFim: string;
  datas: string[];
  linhas: MrpHorizonteLinha[];
};

export async function computarHorizonteProducao(
  pool: Pool,
  horizonteFimIso: string
): Promise<{ ok: true; data: MrpHorizonteResultado } | { ok: false; error: string }> {
  if (!isoDateOnlyValid(horizonteFimIso)) {
    return { ok: false, error: 'Parâmetro horizonte_fim deve ser YYYY-MM-DD.' };
  }

  const hoje = hojeIsoLocal();
  if (horizonteFimIso < hoje) {
    return { ok: false, error: 'Horizonte de Produção deve ser maior ou igual à data de hoje.' };
  }

  const datas = enumerateDaysInclusive(hoje, horizonteFimIso);
  if (datas.length === 0) {
    return { ok: false, error: 'Intervalo de datas inválido.' };
  }
  if (datas.length > MAX_DIAS_HORIZONTE) {
    return {
      ok: false,
      error: `Horizonte máximo de ${MAX_DIAS_HORIZONTE} dias. Reduza o intervalo.`,
    };
  }

  const setDias = new Set(datas);

  const [mppRows, pcRows] = await Promise.all([
    listarMppDadosFiltrados(pool, MPP_FILTROS_VAZIOS, { rawFetchLimit: FETCH_LIMIT_MPP_HORIZONTE }),
    listarPcSaldoReceberTodos(pool, {
      codigoProduto: '',
      dataEntregaIni: hoje,
      dataEntregaFim: horizonteFimIso,
    }),
  ]);

  type AggMppDia = { consumo: number; saldoEstoque: number };
  const mppPorCodDia = new Map<string, Map<string, AggMppDia>>();
  const componentePorCod = new Map<string, string>();

  for (const row of mppRows) {
    const cod = String(row.codigoComponente ?? '').trim();
    if (!cod) continue;
    const dia = mppDiaIsoDataPrevisao(row.dataPrevisao);
    if (!dia || !isoDateOnlyValid(dia) || !setDias.has(dia)) continue;
    const q = numHorizonte(row.qtdeTotalComponente);
    const est = numHorizonte(row.estoqueMPPA);
    if (!mppPorCodDia.has(cod)) mppPorCodDia.set(cod, new Map());
    const m = mppPorCodDia.get(cod)!;
    const prev = m.get(dia);
    if (prev) {
      m.set(dia, { consumo: prev.consumo + q, saldoEstoque: prev.saldoEstoque });
    } else {
      m.set(dia, { consumo: q, saldoEstoque: est });
    }
    const comp = String(row.componente ?? '').trim();
    if (comp && (!componentePorCod.has(cod) || comp.length > (componentePorCod.get(cod) ?? '').length)) {
      componentePorCod.set(cod, comp);
    }
  }

  const entradaPorCodDia = new Map<string, Map<string, number>>();

  for (const row of pcRows) {
    const cod = String(row.codigoProduto ?? '').trim();
    if (!cod) continue;
    const dia = mppDiaIsoDataPrevisao(row.dataEntrega);
    if (!dia || !isoDateOnlyValid(dia) || !setDias.has(dia)) continue;
    const ent = numHorizonte(row.saldoaReceber);
    if (!entradaPorCodDia.has(cod)) entradaPorCodDia.set(cod, new Map());
    const m = entradaPorCodDia.get(cod)!;
    m.set(dia, (m.get(dia) ?? 0) + ent);
  }

  const codigos = new Set<string>([...mppPorCodDia.keys(), ...entradaPorCodDia.keys()]);
  const codigosOrdenados = [...codigos].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const linhas: MrpHorizonteLinha[] = [];

  for (const cod of codigosOrdenados) {
    const dias: MrpHorizonteCelula[] = [];
    const mapMpp = mppPorCodDia.get(cod);
    const mapE = entradaPorCodDia.get(cod);

    for (const d of datas) {
      const agg = mapMpp?.get(d);
      const consumo = agg?.consumo ?? 0;
      const saldoEstoque = agg?.saldoEstoque ?? 0;
      const entrada = mapE?.get(d) ?? 0;
      const necessidade = Math.max(0, consumo - (saldoEstoque + entrada));
      dias.push({ data: d, consumo, saldoEstoque, entrada, necessidade });
    }

    linhas.push({
      codigo: cod,
      componente: componentePorCod.get(cod) ?? '',
      dias,
    });
  }

  return {
    ok: true,
    data: {
      dataInicio: hoje,
      dataFim: horizonteFimIso,
      datas,
      linhas,
    },
  };
}
