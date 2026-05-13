/**
 * DFC — lancamentofinanceiro com discriminador LP (sem vínculo de agendamento), por dataLancamento.
 * Soma com agendamentos efetivos na API de grade/detalhe.
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

function buildSqlWhereLp(idEmpresas: number[]): string {
  const inClause = idEmpresas.map(() => '?').join(', ');
  return `
FROM lancamentofinanceiro lf
LEFT JOIN pessoa pe ON pe.id = lf.idPessoa
LEFT JOIN contafinanceiro cf ON cf.id = lf.idContaFinanceiro
WHERE DATE(lf.dataLancamento) BETWEEN ? AND ?
  AND lf.idEmpresa IN (${inClause})
  AND lf.discriminador = 'LP'
  AND lf.idAgendamentoPagamento IS NULL
  AND lf.idContaFinanceiro IS NOT NULL
`.trim();
}

function buildSqlAgregLp(granularidade: DfcAgendamentoGranularidade, idEmpresas: number[]): string {
  const fmt = granularidade === 'mes' ? "'%Y-%m'" : "'%Y-%m-%d'";
  return `
SELECT
  lf.idContaFinanceiro AS idContaFinanceiro,
  DATE_FORMAT(lf.dataLancamento, ${fmt}) AS periodo,
  SUM(lf.valor) AS valor
${buildSqlWhereLp(idEmpresas)}
GROUP BY lf.idContaFinanceiro, DATE_FORMAT(lf.dataLancamento, ${fmt})
ORDER BY periodo, idContaFinanceiro
`.trim();
}

/**
 * Soma de lf.valor por idContaFinanceiro e bucket (mês/dia) por dataLancamento.
 */
export async function queryDfcLancamentosLpAgrupado(params: {
  dataLancamentoInicio: string;
  dataLancamentoFim: string;
  granularidade: DfcAgendamentoGranularidade;
  idEmpresas: number[];
}): Promise<{ linhas: DfcAgendamentoLinha[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { linhas: [], erro: 'NOMUS_DB_URL não configurado' };
  const { dataLancamentoInicio, dataLancamentoFim, granularidade, idEmpresas } = params;
  const sql = buildSqlAgregLp(granularidade, idEmpresas);
  const args = [dataLancamentoInicio, dataLancamentoFim, ...idEmpresas];

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
    console.error('[dfcLancamentoLpRepository] queryDfcLancamentosLpAgrupado:', msg);
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

/**
 * Linhas de LP para o mesmo detalhe do modal (alinhado a DfcAgendamentoDetalheRow; data baixa = dataLancamento).
 */
export async function queryDfcLancamentosLpDetalhe(params: {
  dataLancamentoInicio: string;
  dataLancamentoFim: string;
  granularidade: DfcAgendamentoGranularidade;
  idEmpresas: number[];
  idsContaFinanceiro: number[];
  periodoBucket?: string | null;
}): Promise<{ detalhes: DfcAgendamentoDetalheRow[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { detalhes: [], erro: 'NOMUS_DB_URL não configurado' };

  const { dataLancamentoInicio, dataLancamentoFim, granularidade, idEmpresas, idsContaFinanceiro, periodoBucket } = params;
  const ids = [...new Set(idsContaFinanceiro.filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length === 0) return { detalhes: [] };

  let periodClause = '';
  if (periodoBucket) {
    if (granularidade === 'mes') {
      periodClause = " AND DATE_FORMAT(lf.dataLancamento, '%Y-%m') = ?";
    } else {
      periodClause = ' AND DATE(lf.dataLancamento) = ?';
    }
  }
  const placeholders = ids.map(() => '?').join(', ');
  const args: unknown[] = [dataLancamentoInicio, dataLancamentoFim, ...idEmpresas];
  args.push(...ids);
  if (periodoBucket) args.push(periodoBucket);

  const sql = `
SELECT
  lf.id AS id,
  lf.descricao AS descricaoLancamento,
  pe.nome AS nome,
  DATE(lf.dataCompetencia) AS dataVencimento,
  DATE(lf.dataLancamento) AS dataBaixa,
  lf.valor AS valorBaixado
${buildSqlWhereLp(idEmpresas)}
  AND lf.idContaFinanceiro IN (${placeholders})
  ${periodClause}
ORDER BY valorBaixado DESC, lf.id DESC
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
      dataBaixa: formatYmdFromSqlDate(r.dataBaixa ?? r['dataBaixa']),
      valorBaixado: toNum(r.valorBaixado ?? r['valorBaixado']),
    }));
    return { detalhes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcLancamentoLpRepository] queryDfcLancamentosLpDetalhe:', msg);
    return { detalhes: [], erro: msg };
  }
}

/**
 * Soma agregado agendamento + agregado LP (mesma chave idContaFinanceiro + periodo).
 */
export function mergeDfcAgregadoLinhas(
  a: DfcAgendamentoLinha[],
  b: DfcAgendamentoLinha[]
): DfcAgendamentoLinha[] {
  const byConta = new Map<number, Map<string, number>>();
  function add(rows: DfcAgendamentoLinha[]) {
    for (const { idContaFinanceiro, periodo, valor } of rows) {
      if (!byConta.has(idContaFinanceiro)) byConta.set(idContaFinanceiro, new Map());
      const p = byConta.get(idContaFinanceiro)!;
      p.set(periodo, (p.get(periodo) ?? 0) + valor);
    }
  }
  add(a);
  add(b);
  const out: DfcAgendamentoLinha[] = [];
  for (const [id, periods] of byConta) {
    for (const [periodo, valor] of periods) {
      out.push({ idContaFinanceiro: id, periodo, valor });
    }
  }
  return out;
}

const MAX_DETALHE = 2000;

/** Une detalhe agendamento + detalhe LP, ordena por valor e respeita limite. */
export function mergeDfcDetalheOrdenado(
  a: DfcAgendamentoDetalheRow[],
  b: DfcAgendamentoDetalheRow[]
): { detalhes: DfcAgendamentoDetalheRow[]; truncado: boolean } {
  return mergeDfcDetalheOrdenadoMany([a, b]);
}

/** Une vários conjuntos de detalhe (ex.: P + LP + receitas R/LR), ordena e aplica um único limite. */
export function mergeDfcDetalheOrdenadoMany(
  parts: DfcAgendamentoDetalheRow[][]
): { detalhes: DfcAgendamentoDetalheRow[]; truncado: boolean } {
  const m = parts.flat().sort((u, v) => v.valorBaixado - u.valorBaixado);
  return {
    detalhes: m.slice(0, MAX_DETALHE),
    truncado: m.length > MAX_DETALHE,
  };
}
