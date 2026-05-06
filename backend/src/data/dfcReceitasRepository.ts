/**
 * DFC — receitas: agendamentos (discriminador R) com baixa em lancamentofinanceiro
 * + lançamentos LR sem agendamento. Bucket e valor: DATE(lf.dataLancamento), lf.valor.
 */

import { getNomusPool } from '../config/nomusDb.js';
import type { DfcAgendamentoDetalheRow, DfcAgendamentoLinha, DfcAgendamentoGranularidade } from './dfcAgendamentoRepository.js';

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function formatYmdFromRow(periodoRaw: unknown, granularidade: DfcAgendamentoGranularidade): string {
  if (periodoRaw instanceof Date) {
    const d = periodoRaw;
    if (granularidade === 'mes') {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  if (granularidade === 'mes' && periodoRaw != null && String(periodoRaw).includes('-')) {
    return String(periodoRaw).slice(0, 7);
  }
  return String(periodoRaw ?? '').slice(0, 10);
}

/** Exclusão alinhada ao SQL de negócio (descontado antecipado em comentários). */
const SQL_TD_DESCONTO = `
LEFT JOIN (
  SELECT DISTINCT lf_td.idAgendamentoRecebimento AS idAgRec,
    CASE WHEN lf_td.comentarios LIKE '%DESCONTADO -%' THEN 'DESCONTADO ANTECI' ELSE NULL END AS comentarios
  FROM lancamentofinanceiro lf_td
  WHERE lf_td.idAgendamentoRecebimento IS NOT NULL
    AND lf_td.comentarios LIKE '%DESCONTADO -%'
) td ON td.idAgRec = af.id
`.trim();

function sqlAgregadoUnion(granularidade: DfcAgendamentoGranularidade): string {
  const periodoExpr =
    granularidade === 'mes'
      ? "DATE_FORMAT(lf.dataLancamento, '%Y-%m')"
      : "DATE_FORMAT(lf.dataLancamento, '%Y-%m-%d')";
  return `
SELECT u.idContaFinanceiro, u.periodo, SUM(u.valor) AS valor
FROM (
  SELECT
    af.idContaFinanceiro AS idContaFinanceiro,
    ${periodoExpr} AS periodo,
    lf.valor AS valor
  FROM agendamentofinanceiro af
  INNER JOIN lancamentofinanceiro lf
    ON COALESCE(lf.idAgendamentoPagamento, lf.idAgendamentoRecebimento) = af.id
  ${SQL_TD_DESCONTO}
  WHERE DATE(lf.dataLancamento) BETWEEN ? AND ?
    AND af.idEmpresa = ?
    AND af.discriminador = 'R'
    AND af.idContaFinanceiro IS NOT NULL
    AND (COALESCE(td.comentarios, af.comentarios, '') NOT LIKE '%DESCONTADO ANTECI%')
  UNION ALL
  SELECT
    lf.idContaFinanceiro AS idContaFinanceiro,
    ${periodoExpr} AS periodo,
    lf.valor AS valor
  FROM lancamentofinanceiro lf
  LEFT JOIN agendamentofinanceiro af
    ON COALESCE(lf.idAgendamentoPagamento, lf.idAgendamentoRecebimento) = af.id
  WHERE DATE(lf.dataLancamento) BETWEEN ? AND ?
    AND lf.idEmpresa = ?
    AND lf.discriminador = 'LR'
    AND af.id IS NULL
    AND lf.idContaFinanceiro IS NOT NULL
) u
GROUP BY u.idContaFinanceiro, u.periodo
ORDER BY u.periodo, u.idContaFinanceiro
`.trim();
}

/**
 * Soma receitas (R + baixa em LF, e LR sem agendamento) por idContaFinanceiro e período (data de lançamento = data de baixa).
 */
export async function queryDfcReceitasAgrupado(params: {
  dataBaixaInicio: string;
  dataBaixaFim: string;
  granularidade: DfcAgendamentoGranularidade;
  idEmpresa: number;
}): Promise<{ linhas: DfcAgendamentoLinha[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { linhas: [], erro: 'NOMUS_DB_URL não configurado' };

  const { dataBaixaInicio, dataBaixaFim, granularidade, idEmpresa } = params;
  const sql = sqlAgregadoUnion(granularidade);
  const args = [dataBaixaInicio, dataBaixaFim, idEmpresa, dataBaixaInicio, dataBaixaFim, idEmpresa];

  try {
    const [rows] = (await pool.query(sql, args)) as [Record<string, unknown>[], unknown];
    const linhas: DfcAgendamentoLinha[] = (Array.isArray(rows) ? rows : []).map((r) => {
      const periodoRaw = r.periodo ?? r['periodo'];
      return {
        idContaFinanceiro: toInt(r.idContaFinanceiro ?? r['idContaFinanceiro']),
        periodo: formatYmdFromRow(periodoRaw, granularidade),
        valor: toNum(r.valor ?? r['valor']),
      };
    });
    return { linhas };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcReceitasRepository] queryDfcReceitasAgrupado:', msg);
    return { linhas: [], erro: msg };
  }
}

function formatYmdFromSqlDate(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s || null;
}

function periodClauseLf(
  granularidade: DfcAgendamentoGranularidade,
  periodoBucket: string | null | undefined
): { sql: string; extraArg: string | null } {
  if (!periodoBucket) return { sql: '', extraArg: null };
  if (granularidade === 'mes') {
    return { sql: " AND DATE_FORMAT(lf.dataLancamento, '%Y-%m') = ?", extraArg: periodoBucket };
  }
  return { sql: ' AND DATE(lf.dataLancamento) = ?', extraArg: periodoBucket };
}

/** Detalhe — agendamentos R com linha de LF (valor / data de baixa = dataLancamento). */
async function queryDfcReceitasDetalheR(params: {
  dataBaixaInicio: string;
  dataBaixaFim: string;
  granularidade: DfcAgendamentoGranularidade;
  idEmpresa: number;
  idsContaFinanceiro: number[];
  periodoBucket?: string | null;
}): Promise<{ detalhes: DfcAgendamentoDetalheRow[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { detalhes: [], erro: 'NOMUS_DB_URL não configurado' };

  const { dataBaixaInicio, dataBaixaFim, granularidade, idEmpresa, idsContaFinanceiro, periodoBucket } = params;
  const ids = [...new Set(idsContaFinanceiro.filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return { detalhes: [] };

  const { sql: pClause, extraArg } = periodClauseLf(granularidade, periodoBucket);
  const placeholders = ids.map(() => '?').join(', ');
  const args: unknown[] = [dataBaixaInicio, dataBaixaFim, idEmpresa];
  args.push(...ids);
  if (extraArg != null) args.push(extraArg);

  const sql = `
SELECT
  lf.id AS id,
  af.descricaoLancamento AS descricaoLancamento,
  pe.nome AS nome,
  DATE(COALESCE(af.dataVencimento, lf.dataLancamento)) AS dataVencimento,
  DATE(lf.dataLancamento) AS dataBaixa,
  lf.valor AS valorBaixado
FROM agendamentofinanceiro af
INNER JOIN lancamentofinanceiro lf
  ON COALESCE(lf.idAgendamentoPagamento, lf.idAgendamentoRecebimento) = af.id
LEFT JOIN pessoa pe ON pe.id = COALESCE(af.idPessoa, lf.idPessoa)
${SQL_TD_DESCONTO}
WHERE DATE(lf.dataLancamento) BETWEEN ? AND ?
  AND af.idEmpresa = ?
  AND af.discriminador = 'R'
  AND af.idContaFinanceiro IN (${placeholders})
  AND (COALESCE(td.comentarios, af.comentarios, '') NOT LIKE '%DESCONTADO ANTECI%')
  ${pClause}
ORDER BY valorBaixado DESC, lf.id DESC
`.trim();

  try {
    const [rows] = await pool.query(sql, args);
    const list = Array.isArray(rows) ? rows : [];
    const detalhes: DfcAgendamentoDetalheRow[] = list.map((r: Record<string, unknown>) => ({
      id: toInt(r.id ?? r['id']),
      descricaoLancamento: r.descricaoLancamento != null ? String(r.descricaoLancamento) : null,
      nome: r.nome != null ? String(r.nome) : null,
      dataVencimento: formatYmdFromSqlDate(r.dataVencimento ?? r['dataVencimento']),
      dataBaixa: formatYmdFromSqlDate(r.dataBaixa ?? r['dataBaixa']),
      valorBaixado: toNum(r.valorBaixado ?? r['valorBaixado']),
    }));
    return { detalhes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcReceitasRepository] queryDfcReceitasDetalheR:', msg);
    return { detalhes: [], erro: msg };
  }
}

/** Detalhe — LR sem vínculo com agendamento. */
async function queryDfcReceitasDetalheLr(params: {
  dataBaixaInicio: string;
  dataBaixaFim: string;
  granularidade: DfcAgendamentoGranularidade;
  idEmpresa: number;
  idsContaFinanceiro: number[];
  periodoBucket?: string | null;
}): Promise<{ detalhes: DfcAgendamentoDetalheRow[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { detalhes: [], erro: 'NOMUS_DB_URL não configurado' };

  const { dataBaixaInicio, dataBaixaFim, granularidade, idEmpresa, idsContaFinanceiro, periodoBucket } = params;
  const ids = [...new Set(idsContaFinanceiro.filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return { detalhes: [] };

  const { sql: pClause, extraArg } = periodClauseLf(granularidade, periodoBucket);
  const placeholders = ids.map(() => '?').join(', ');
  const args: unknown[] = [dataBaixaInicio, dataBaixaFim, idEmpresa];
  args.push(...ids);
  if (extraArg != null) args.push(extraArg);

  const sql = `
SELECT
  lf.id AS id,
  lf.descricao AS descricaoLancamento,
  pe.nome AS nome,
  DATE(lf.dataCompetencia) AS dataVencimento,
  DATE(lf.dataLancamento) AS dataBaixa,
  lf.valor AS valorBaixado
FROM lancamentofinanceiro lf
LEFT JOIN pessoa pe ON pe.id = lf.idPessoa
LEFT JOIN agendamentofinanceiro af
  ON COALESCE(lf.idAgendamentoPagamento, lf.idAgendamentoRecebimento) = af.id
WHERE DATE(lf.dataLancamento) BETWEEN ? AND ?
  AND lf.idEmpresa = ?
  AND lf.discriminador = 'LR'
  AND af.id IS NULL
  AND lf.idContaFinanceiro IN (${placeholders})
  ${pClause}
ORDER BY valorBaixado DESC, lf.id DESC
`.trim();

  try {
    const [rows] = await pool.query(sql, args);
    const list = Array.isArray(rows) ? rows : [];
    const detalhes: DfcAgendamentoDetalheRow[] = list.map((r: Record<string, unknown>) => ({
      id: toInt(r.id ?? r['id']),
      descricaoLancamento: r.descricaoLancamento != null ? String(r.descricaoLancamento) : null,
      nome: r.nome != null ? String(r.nome) : null,
      dataVencimento: formatYmdFromSqlDate(r.dataVencimento ?? r['dataVencimento']),
      dataBaixa: formatYmdFromSqlDate(r.dataBaixa ?? r['dataBaixa']),
      valorBaixado: toNum(r.valorBaixado ?? r['valorBaixado']),
    }));
    return { detalhes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcReceitasRepository] queryDfcReceitasDetalheLr:', msg);
    return { detalhes: [], erro: msg };
  }
}

export async function queryDfcReceitasDetalhe(params: {
  dataBaixaInicio: string;
  dataBaixaFim: string;
  granularidade: DfcAgendamentoGranularidade;
  idEmpresa: number;
  idsContaFinanceiro: number[];
  periodoBucket?: string | null;
}): Promise<{ detalhes: DfcAgendamentoDetalheRow[]; erro?: string }> {
  const r1 = await queryDfcReceitasDetalheR(params);
  const r2 = await queryDfcReceitasDetalheLr(params);
  if (r1.erro) console.error('[dfcReceitasRepository] queryDfcReceitasDetalhe R:', r1.erro);
  if (r2.erro) console.error('[dfcReceitasRepository] queryDfcReceitasDetalhe LR:', r2.erro);
  if (r1.erro && r2.erro) return { detalhes: [], erro: r1.erro };
  return {
    detalhes: [...(r1.erro ? [] : r1.detalhes), ...(r2.erro ? [] : r2.detalhes)],
  };
}
