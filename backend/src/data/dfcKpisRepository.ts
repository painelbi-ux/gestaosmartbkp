/**
 * DFC — KPIs financeiros para os cards de resumo:
 * Recebimentos, Pagamentos, Vencidos, A Vencer, Saldo Bancário.
 */

import { getNomusPool } from '../config/nomusDb.js';

export interface DfcKpis {
  recebimentos: number;
  pagamentos: number;
  vencidosPagar: number;
  vencidosReceber: number;
  aVencerPagar: number;
  aVencerReceber: number;
  saldoBancario: number;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Gera cláusula IN dinâmica e retorna o fragmento SQL + args para idEmpresa. */
function empresaIn(ids: number[]): { clause: string; args: number[] } {
  return { clause: ids.map(() => '?').join(', '), args: ids };
}

export async function queryDfcKpis(params: {
  dataInicio: string;
  dataFim: string;
  idEmpresas: number[];
}): Promise<{ kpis: DfcKpis; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) {
    return {
      kpis: { recebimentos: 0, pagamentos: 0, vencidosPagar: 0, vencidosReceber: 0, aVencerPagar: 0, aVencerReceber: 0, saldoBancario: 0 },
      erro: 'NOMUS_DB_URL não configurado',
    };
  }

  const { dataInicio, dataFim, idEmpresas } = params;
  const { clause: empIn, args: empArgs } = empresaIn(idEmpresas);

  // ── Recebimentos: R agendamentos recebidos + standalone LR no período ───────
  const sqlRecebimentos = `
SELECT COALESCE(SUM(u.valor), 0) AS total
FROM (
  SELECT lf.valor
  FROM agendamentofinanceiro af
  INNER JOIN lancamentofinanceiro lf
    ON COALESCE(lf.idAgendamentoPagamento, lf.idAgendamentoRecebimento) = af.id
  WHERE DATE(lf.dataLancamento) BETWEEN ? AND ?
    AND af.idEmpresa IN (${empIn})
    AND af.discriminador = 'R'
  UNION ALL
  SELECT lf.valor
  FROM lancamentofinanceiro lf
  LEFT JOIN agendamentofinanceiro af
    ON COALESCE(lf.idAgendamentoPagamento, lf.idAgendamentoRecebimento) = af.id
  WHERE DATE(lf.dataLancamento) BETWEEN ? AND ?
    AND lf.idEmpresa IN (${empIn})
    AND lf.discriminador = 'LR'
    AND af.id IS NULL
) u
`.trim();

  // ── Pagamentos: P agendamentos pagos (via pg) + standalone LP no período ────
  const sqlPagamentos = `
SELECT COALESCE(SUM(u.valor), 0) AS total
FROM (
  SELECT
    CASE
      WHEN (pg.valorpago IS NULL OR pg.valorpago = 0) THEN
        CASE WHEN (af.valorBaixado IS NULL OR af.valorBaixado = 0) THEN af.saldoBaixar ELSE af.valorBaixado END
      ELSE pg.valorpago
    END AS valor
  FROM agendamentofinanceiro af
  LEFT JOIN (
    SELECT idAgendamentoPagamento, MAX(l.dataLancamento) AS dataLancamento, SUM(l.valor) AS valorpago
    FROM lancamentofinanceiro l
    WHERE idAgendamentoPagamento IS NOT NULL
    GROUP BY idAgendamentoPagamento
  ) pg ON pg.idAgendamentoPagamento = af.id
  WHERE DATE(pg.dataLancamento) BETWEEN ? AND ?
    AND af.discriminador = 'P'
    AND af.idEmpresa IN (${empIn})
    AND af.idPedidoCompra IS NULL
    AND af.dataBaixa IS NOT NULL
  UNION ALL
  SELECT lf.valor
  FROM lancamentofinanceiro lf
  WHERE DATE(lf.dataLancamento) BETWEEN ? AND ?
    AND lf.idEmpresa IN (${empIn})
    AND lf.discriminador = 'LP'
    AND lf.idAgendamentoPagamento IS NULL
) u
`.trim();

  // ── Vencidos a pagar (P) — passado da data de vencimento, não baixados ──────
  const sqlVencidosPagar = `
SELECT COALESCE(SUM(af.saldoBaixar), 0) AS total
FROM agendamentofinanceiro af
WHERE DATE(af.dataVencimento) < CURDATE()
  AND af.dataBaixa IS NULL
  AND af.saldoBaixar > 0
  AND af.idEmpresa IN (${empIn})
  AND af.idPedidoCompra IS NULL
  AND af.discriminador = 'P'
`.trim();

  // ── Vencidos a receber (R) — passado da data de vencimento, não baixados ────
  const sqlVencidosReceber = `
SELECT COALESCE(SUM(af.saldoBaixar), 0) AS total
FROM agendamentofinanceiro af
WHERE DATE(af.dataVencimento) < CURDATE()
  AND af.dataBaixa IS NULL
  AND af.saldoBaixar > 0
  AND af.idEmpresa IN (${empIn})
  AND af.discriminador = 'R'
`.trim();

  // ── A Vencer a pagar (P) — próximos 30 dias, não baixados ──────────────────
  const sqlAVencerPagar = `
SELECT COALESCE(SUM(af.saldoBaixar), 0) AS total
FROM agendamentofinanceiro af
WHERE DATE(af.dataVencimento) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
  AND af.dataBaixa IS NULL
  AND af.saldoBaixar > 0
  AND af.idEmpresa IN (${empIn})
  AND af.idPedidoCompra IS NULL
  AND af.discriminador = 'P'
`.trim();

  // ── A Vencer a receber (R) — próximos 30 dias, não baixados ────────────────
  const sqlAVencerReceber = `
SELECT COALESCE(SUM(af.saldoBaixar), 0) AS total
FROM agendamentofinanceiro af
WHERE DATE(af.dataVencimento) BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
  AND af.dataBaixa IS NULL
  AND af.saldoBaixar > 0
  AND af.idEmpresa IN (${empIn})
  AND af.discriminador = 'R'
`.trim();

  // ── Saldo Bancário: acumulado de LR (crédito) - LP (débito) até hoje ────────
  const sqlSaldo = `
SELECT
  COALESCE(SUM(CASE WHEN lf.discriminador = 'LR' THEN lf.valor ELSE 0 END), 0) -
  COALESCE(SUM(CASE WHEN lf.discriminador = 'LP' THEN lf.valor ELSE 0 END), 0) AS saldo
FROM lancamentofinanceiro lf
WHERE DATE(lf.dataLancamento) <= CURDATE()
  AND lf.idEmpresa IN (${empIn})
  AND lf.discriminador IN ('LR', 'LP')
`.trim();

  try {
    const [
      [rowsRec],
      [rowsPag],
      [rowsVencP],
      [rowsVencR],
      [rowsAVP],
      [rowsAVR],
      [rowsSaldo],
    ] = await Promise.all([
      pool.query(sqlRecebimentos, [dataInicio, dataFim, ...empArgs, dataInicio, dataFim, ...empArgs]),
      pool.query(sqlPagamentos, [dataInicio, dataFim, ...empArgs, dataInicio, dataFim, ...empArgs]),
      pool.query(sqlVencidosPagar, empArgs),
      pool.query(sqlVencidosReceber, empArgs),
      pool.query(sqlAVencerPagar, empArgs),
      pool.query(sqlAVencerReceber, empArgs),
      pool.query(sqlSaldo, empArgs),
    ]) as [[Record<string, unknown>[], unknown], [Record<string, unknown>[], unknown], [Record<string, unknown>[], unknown], [Record<string, unknown>[], unknown], [Record<string, unknown>[], unknown], [Record<string, unknown>[], unknown], [Record<string, unknown>[], unknown]];

    const kpis: DfcKpis = {
      recebimentos: toNum(Array.isArray(rowsRec) && rowsRec[0] ? rowsRec[0].total : 0),
      pagamentos: toNum(Array.isArray(rowsPag) && rowsPag[0] ? rowsPag[0].total : 0),
      vencidosPagar: toNum(Array.isArray(rowsVencP) && rowsVencP[0] ? rowsVencP[0].total : 0),
      vencidosReceber: toNum(Array.isArray(rowsVencR) && rowsVencR[0] ? rowsVencR[0].total : 0),
      aVencerPagar: toNum(Array.isArray(rowsAVP) && rowsAVP[0] ? rowsAVP[0].total : 0),
      aVencerReceber: toNum(Array.isArray(rowsAVR) && rowsAVR[0] ? rowsAVR[0].total : 0),
      saldoBancario: toNum(Array.isArray(rowsSaldo) && rowsSaldo[0] ? (rowsSaldo[0].saldo ?? rowsSaldo[0].total) : 0),
    };

    return { kpis };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcKpisRepository] queryDfcKpis:', msg);
    return {
      kpis: { recebimentos: 0, pagamentos: 0, vencidosPagar: 0, vencidosReceber: 0, aVencerPagar: 0, aVencerReceber: 0, saldoBancario: 0 },
      erro: msg,
    };
  }
}
