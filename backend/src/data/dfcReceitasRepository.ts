/**
 * DFC — receitas: agendamentos (discriminador R) com baixa em lancamentofinanceiro
 * + lançamentos LR sem agendamento. Bucket e valor: DATE(lf.dataLancamento), lf.valor.
 */

import { getNomusPool } from '../config/nomusDb.js';
import type { DfcAgendamentoDetalheRow, DfcAgendamentoLinha, DfcAgendamentoGranularidade } from './dfcAgendamentoRepository.js';
import {
  montarFragmentoFiltroPrioridade,
  type DfcPrioridadeFilterResolvido,
} from './dfcPrioridadeFilter.js';

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

function sqlAgregadoUnion(
  granularidade: DfcAgendamentoGranularidade,
  idEmpresas: number[],
  filtroSqlAfLf: string,
  filtroSqlLf: string
): string {
  const periodoExpr =
    granularidade === 'mes'
      ? "DATE_FORMAT(lf.dataLancamento, '%Y-%m')"
      : "DATE_FORMAT(lf.dataLancamento, '%Y-%m-%d')";
  const inClause = idEmpresas.map(() => '?').join(', ');
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
    AND af.idEmpresa IN (${inClause})
    AND af.discriminador = 'R'
    AND af.idContaFinanceiro IS NOT NULL
    AND (COALESCE(td.comentarios, af.comentarios, '') NOT LIKE '%DESCONTADO ANTECI%')
    ${filtroSqlAfLf}
  UNION ALL
  SELECT
    lf.idContaFinanceiro AS idContaFinanceiro,
    ${periodoExpr} AS periodo,
    lf.valor AS valor
  FROM lancamentofinanceiro lf
  LEFT JOIN agendamentofinanceiro af
    ON COALESCE(lf.idAgendamentoPagamento, lf.idAgendamentoRecebimento) = af.id
  WHERE DATE(lf.dataLancamento) BETWEEN ? AND ?
    AND lf.idEmpresa IN (${inClause})
    AND lf.discriminador = 'LR'
    AND af.id IS NULL
    AND lf.idContaFinanceiro IS NOT NULL
    ${filtroSqlLf}
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
  idEmpresas: number[];
  filtroPrioridade?: DfcPrioridadeFilterResolvido;
}): Promise<{ linhas: DfcAgendamentoLinha[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { linhas: [], erro: 'NOMUS_DB_URL não configurado' };

  const { dataBaixaInicio, dataBaixaFim, granularidade, idEmpresas, filtroPrioridade } = params;
  const fragAfLf = filtroPrioridade
    ? montarFragmentoFiltroPrioridade(filtroPrioridade, 'af_lf')
    : { sql: '', args: [] };
  const fragLf = filtroPrioridade
    ? montarFragmentoFiltroPrioridade(filtroPrioridade, 'lf')
    : { sql: '', args: [] };
  const sql = sqlAgregadoUnion(granularidade, idEmpresas, fragAfLf.sql, fragLf.sql);
  const args = [
    dataBaixaInicio, dataBaixaFim, ...idEmpresas, ...fragAfLf.args,
    dataBaixaInicio, dataBaixaFim, ...idEmpresas, ...fragLf.args,
  ];

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
  idEmpresas: number[];
  idsContaFinanceiro: number[];
  periodoBucket?: string | null;
  filtroPrioridade?: DfcPrioridadeFilterResolvido;
}): Promise<{ detalhes: DfcAgendamentoDetalheRow[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { detalhes: [], erro: 'NOMUS_DB_URL não configurado' };

  const { dataBaixaInicio, dataBaixaFim, granularidade, idEmpresas, idsContaFinanceiro, periodoBucket, filtroPrioridade } = params;
  const ids = [...new Set(idsContaFinanceiro.filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return { detalhes: [] };

  const { sql: pClause, extraArg } = periodClauseLf(granularidade, periodoBucket);
  const empInClause = idEmpresas.map(() => '?').join(', ');
  const placeholders = ids.map(() => '?').join(', ');
  const args: unknown[] = [dataBaixaInicio, dataBaixaFim, ...idEmpresas];
  args.push(...ids);
  if (extraArg != null) args.push(extraArg);

  const filtroFrag = filtroPrioridade
    ? montarFragmentoFiltroPrioridade(filtroPrioridade, 'af_lf')
    : { sql: '', args: [] };
  args.push(...filtroFrag.args);

  const sql = `
SELECT
  lf.id AS id,
  af.idEmpresa AS idEmpresa,
  af.idContaFinanceiro AS idContaFinanceiro,
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
  AND af.idEmpresa IN (${empInClause})
  AND af.discriminador = 'R'
  AND af.idContaFinanceiro IN (${placeholders})
  AND (COALESCE(td.comentarios, af.comentarios, '') NOT LIKE '%DESCONTADO ANTECI%')
  ${pClause}
  ${filtroFrag.sql}
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
      tipoRef: 'L',
      idEmpresa: toInt(r.idEmpresa ?? r['idEmpresa']),
      idContaFinanceiro: r.idContaFinanceiro != null ? toInt(r.idContaFinanceiro) : null,
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
  idEmpresas: number[];
  idsContaFinanceiro: number[];
  periodoBucket?: string | null;
  filtroPrioridade?: DfcPrioridadeFilterResolvido;
}): Promise<{ detalhes: DfcAgendamentoDetalheRow[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { detalhes: [], erro: 'NOMUS_DB_URL não configurado' };

  const { dataBaixaInicio, dataBaixaFim, granularidade, idEmpresas, idsContaFinanceiro, periodoBucket, filtroPrioridade } = params;
  const ids = [...new Set(idsContaFinanceiro.filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return { detalhes: [] };

  const { sql: pClause, extraArg } = periodClauseLf(granularidade, periodoBucket);
  const empInClause = idEmpresas.map(() => '?').join(', ');
  const placeholders = ids.map(() => '?').join(', ');
  const args: unknown[] = [dataBaixaInicio, dataBaixaFim, ...idEmpresas];
  args.push(...ids);
  if (extraArg != null) args.push(extraArg);

  const filtroFrag = filtroPrioridade
    ? montarFragmentoFiltroPrioridade(filtroPrioridade, 'lf')
    : { sql: '', args: [] };
  args.push(...filtroFrag.args);

  const sql = `
SELECT
  lf.id AS id,
  lf.idEmpresa AS idEmpresa,
  lf.idContaFinanceiro AS idContaFinanceiro,
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
  AND lf.idEmpresa IN (${empInClause})
  AND lf.discriminador = 'LR'
  AND af.id IS NULL
  AND lf.idContaFinanceiro IN (${placeholders})
  ${pClause}
  ${filtroFrag.sql}
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
      tipoRef: 'L',
      idEmpresa: toInt(r.idEmpresa ?? r['idEmpresa']),
      idContaFinanceiro: r.idContaFinanceiro != null ? toInt(r.idContaFinanceiro) : null,
    }));
    return { detalhes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcReceitasRepository] queryDfcReceitasDetalheLr:', msg);
    return { detalhes: [], erro: msg };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJEÇÃO FUTURA — Receitas (R) não baixadas, bucket por dataVencimento
// ─────────────────────────────────────────────────────────────────────────────

function sqlReceitasProjecaoAgregado(
  granularidade: DfcAgendamentoGranularidade,
  idEmpresas: number[],
  filtroSqlPrioridade: string
): string {
  const periodoExpr =
    granularidade === 'mes'
      ? "DATE_FORMAT(af.dataVencimento, '%Y-%m')"
      : "DATE_FORMAT(af.dataVencimento, '%Y-%m-%d')";
  const inClause = idEmpresas.map(() => '?').join(', ');
  return `
SELECT u.idContaFinanceiro, u.periodo, SUM(u.valor) AS valor
FROM (
  SELECT
    af.idContaFinanceiro AS idContaFinanceiro,
    ${periodoExpr} AS periodo,
    af.saldoBaixar AS valor
  FROM agendamentofinanceiro af
  LEFT JOIN parcelapagamento pp ON pp.id = af.idParcelaDocumentoSaida
  WHERE DATE(af.dataVencimento) BETWEEN ? AND ?
    AND af.discriminador = 'R'
    AND af.saldoBaixar > 0
    AND af.idEmpresa IN (${inClause})
    AND af.idContaFinanceiro IS NOT NULL
    AND (pp.geraAdiantamento = 1 OR pp.geraAdiantamento IS NULL)
    ${filtroSqlPrioridade}
  UNION ALL
  SELECT
    af.idContaFinanceiro AS idContaFinanceiro,
    ${periodoExpr} AS periodo,
    af.saldoBaixar AS valor
  FROM agendamentofinanceiro af
  LEFT JOIN parcelapagamento pp ON pp.id = af.idParcelaDocumentoSaida
  WHERE DATE(af.dataVencimento) BETWEEN ? AND ?
    AND af.discriminador = 'R'
    AND af.saldoBaixar > 0
    AND af.idEmpresa IN (${inClause})
    AND af.idContaFinanceiro IS NOT NULL
    AND af.idDocumentoSaida IS NOT NULL
    ${filtroSqlPrioridade}
) u
GROUP BY u.idContaFinanceiro, u.periodo
ORDER BY u.periodo, u.idContaFinanceiro
`.trim();
}

/**
 * Projeção futura: receitas (R) NÃO baixadas, bucket por dataVencimento, valor = saldoBaixar.
 */
export async function queryDfcReceitasProjecao(params: {
  dataVencimentoInicio: string;
  dataVencimentoFim: string;
  granularidade: DfcAgendamentoGranularidade;
  idEmpresas: number[];
  filtroPrioridade?: DfcPrioridadeFilterResolvido;
}): Promise<{ linhas: DfcAgendamentoLinha[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { linhas: [], erro: 'NOMUS_DB_URL não configurado' };

  const { dataVencimentoInicio, dataVencimentoFim, granularidade, idEmpresas, filtroPrioridade } = params;
  const filtroFrag = filtroPrioridade
    ? montarFragmentoFiltroPrioridade(filtroPrioridade, 'af')
    : { sql: '', args: [] };
  const sql = sqlReceitasProjecaoAgregado(granularidade, idEmpresas, filtroFrag.sql);
  const args = [
    dataVencimentoInicio, dataVencimentoFim, ...idEmpresas, ...filtroFrag.args,
    dataVencimentoInicio, dataVencimentoFim, ...idEmpresas, ...filtroFrag.args,
  ];

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
    console.error('[dfcReceitasRepository] queryDfcReceitasProjecao:', msg);
    return { linhas: [], erro: msg };
  }
}

/**
 * Detalhe de projeção futura: receitas (R) NÃO baixadas por dataVencimento.
 */
export async function queryDfcReceitasProjecaoDetalhe(params: {
  dataVencimentoInicio: string;
  dataVencimentoFim: string;
  granularidade: DfcAgendamentoGranularidade;
  idEmpresas: number[];
  idsContaFinanceiro: number[];
  periodoBucket?: string | null;
  filtroPrioridade?: DfcPrioridadeFilterResolvido;
}): Promise<{ detalhes: DfcAgendamentoDetalheRow[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { detalhes: [], erro: 'NOMUS_DB_URL não configurado' };

  const { dataVencimentoInicio, dataVencimentoFim, granularidade, idEmpresas, idsContaFinanceiro, periodoBucket, filtroPrioridade } = params;
  const ids = [...new Set(idsContaFinanceiro.filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return { detalhes: [] };

  const empInClause = idEmpresas.map(() => '?').join(', ');
  const placeholders = ids.map(() => '?').join(', ');

  let periodClause = '';
  if (periodoBucket) {
    if (granularidade === 'mes') {
      periodClause = " AND DATE_FORMAT(af.dataVencimento, '%Y-%m') = ?";
    } else {
      periodClause = ' AND DATE(af.dataVencimento) = ?';
    }
  }

  const filtroFrag = filtroPrioridade
    ? montarFragmentoFiltroPrioridade(filtroPrioridade, 'af')
    : { sql: '', args: [] };

  const argsBranch: unknown[] = [dataVencimentoInicio, dataVencimentoFim, ...idEmpresas, ...ids];
  if (periodoBucket) argsBranch.push(periodoBucket);
  argsBranch.push(...filtroFrag.args);
  const args: unknown[] = [...argsBranch, ...argsBranch];

  const sql = `
SELECT u.id, u.idEmpresa, u.idContaFinanceiro, u.descricaoLancamento, u.nome, u.dataVencimento, u.dataBaixa, u.valorBaixado
FROM (
  SELECT
    af.id AS id,
    af.idEmpresa AS idEmpresa,
    af.idContaFinanceiro AS idContaFinanceiro,
    af.descricaoLancamento AS descricaoLancamento,
    pe.nome AS nome,
    DATE(af.dataVencimento) AS dataVencimento,
    NULL AS dataBaixa,
    af.saldoBaixar AS valorBaixado
  FROM agendamentofinanceiro af
  LEFT JOIN parcelapagamento pp ON pp.id = af.idParcelaDocumentoSaida
  LEFT JOIN pessoa pe ON pe.id = af.idPessoa
  WHERE DATE(af.dataVencimento) BETWEEN ? AND ?
    AND af.discriminador = 'R'
    AND af.idEmpresa IN (${empInClause})
    AND af.saldoBaixar > 0
    AND af.idContaFinanceiro IN (${placeholders})
    AND (pp.geraAdiantamento = 1 OR pp.geraAdiantamento IS NULL)
    ${periodClause}
    ${filtroFrag.sql}
  UNION ALL
  SELECT
    af.id AS id,
    af.idEmpresa AS idEmpresa,
    af.idContaFinanceiro AS idContaFinanceiro,
    af.descricaoLancamento AS descricaoLancamento,
    pe.nome AS nome,
    DATE(af.dataVencimento) AS dataVencimento,
    NULL AS dataBaixa,
    af.saldoBaixar AS valorBaixado
  FROM agendamentofinanceiro af
  LEFT JOIN parcelapagamento pp ON pp.id = af.idParcelaDocumentoSaida
  LEFT JOIN pessoa pe ON pe.id = af.idPessoa
  WHERE DATE(af.dataVencimento) BETWEEN ? AND ?
    AND af.discriminador = 'R'
    AND af.idEmpresa IN (${empInClause})
    AND af.saldoBaixar > 0
    AND af.idContaFinanceiro IN (${placeholders})
    AND af.idDocumentoSaida IS NOT NULL
    ${periodClause}
    ${filtroFrag.sql}
) u
ORDER BY u.valorBaixado DESC, u.id DESC
LIMIT 2000
`.trim();

  try {
    const [rows] = await pool.query(sql, args);
    const list = Array.isArray(rows) ? rows : [];
    const detalhes: DfcAgendamentoDetalheRow[] = list.map((r: Record<string, unknown>) => ({
      id: toInt(r.id ?? r['id']),
      descricaoLancamento: r.descricaoLancamento != null ? String(r.descricaoLancamento) : null,
      nome: r.nome != null ? String(r.nome) : null,
      dataVencimento: formatYmdFromSqlDate(r.dataVencimento ?? r['dataVencimento']),
      dataBaixa: null,
      valorBaixado: toNum(r.valorBaixado ?? r['valorBaixado']),
      tipoRef: 'A',
      idEmpresa: toInt(r.idEmpresa ?? r['idEmpresa']),
      idContaFinanceiro: r.idContaFinanceiro != null ? toInt(r.idContaFinanceiro) : null,
    }));
    return { detalhes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcReceitasRepository] queryDfcReceitasProjecaoDetalhe:', msg);
    return { detalhes: [], erro: msg };
  }
}

export async function queryDfcReceitasDetalhe(params: {
  dataBaixaInicio: string;
  dataBaixaFim: string;
  granularidade: DfcAgendamentoGranularidade;
  idEmpresas: number[];
  idsContaFinanceiro: number[];
  periodoBucket?: string | null;
  filtroPrioridade?: DfcPrioridadeFilterResolvido;
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
