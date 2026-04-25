/**
 * DFC — agendamentos financeiros efetivos (Nomus, somente leitura).
 * Filtro por data de baixa; agregação por conta e dia ou mês.
 */

import { getNomusPool } from '../config/nomusDb.js';

export type DfcAgendamentoGranularidade = 'dia' | 'mes';

export interface DfcAgendamentoLinha {
  idContaFinanceiro: number;
  periodo: string;
  valor: number;
}

const SQL_BASE_FROM = `
FROM agendamentofinanceiro af
LEFT JOIN pessoa pe ON pe.id = af.idPessoa
LEFT JOIN contafinanceiro cf ON cf.id = af.idContaFinanceiro
LEFT JOIN (
  SELECT DISTINCT idAgendamentoPagamento
  FROM lancamentofinanceiro l
  WHERE idAgendamentoPagamento IS NOT NULL
) sn ON sn.idAgendamentoPagamento = af.id
LEFT JOIN (
  SELECT idAgendamentoPagamento, SUM(valor) AS valorpago
  FROM lancamentofinanceiro l
  WHERE idAgendamentoPagamento IS NOT NULL
  GROUP BY idAgendamentoPagamento
) pg ON pg.idAgendamentoPagamento = af.id
WHERE DATE(af.dataBaixa) BETWEEN ? AND ?
  AND af.discriminador = 'P'
  AND af.idEmpresa = ?
  AND af.idPedidoCompra IS NULL
  AND af.dataBaixa IS NOT NULL
  AND af.idContaFinanceiro IS NOT NULL
  AND CASE
    WHEN (sn.idAgendamentoPagamento IS NULL AND DATE(af.dataBaixa) IS NOT NULL) THEN 'Sem Numerario'
    ELSE 'Efetiva'
  END = 'Efetiva'
`.trim();

const SQL_VALOR_BAIXADO_EXPR = `
CASE
  WHEN (pg.valorpago IS NULL OR pg.valorpago = 0) THEN
    CASE WHEN (af.valorBaixado IS NULL OR af.valorBaixado = 0) THEN af.saldoBaixar ELSE af.valorBaixado END
  ELSE pg.valorpago
END
`.trim();

const SQL_AGREGADO_DIA = `
SELECT
  af.idContaFinanceiro AS idContaFinanceiro,
  DATE(af.dataBaixa) AS periodo,
  SUM((${SQL_VALOR_BAIXADO_EXPR})) AS valor
${SQL_BASE_FROM}
GROUP BY af.idContaFinanceiro, DATE(af.dataBaixa)
ORDER BY periodo, idContaFinanceiro
`.trim();

const SQL_AGREGADO_MES = `
SELECT
  af.idContaFinanceiro AS idContaFinanceiro,
  DATE_FORMAT(af.dataBaixa, '%Y-%m') AS periodo,
  SUM((${SQL_VALOR_BAIXADO_EXPR})) AS valor
${SQL_BASE_FROM}
GROUP BY af.idContaFinanceiro, DATE_FORMAT(af.dataBaixa, '%Y-%m')
ORDER BY periodo, idContaFinanceiro
`.trim();

function toNum(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Linha detalhada para tooltip (campos alinhados ao Nomus). */
export interface DfcAgendamentoDetalheRow {
  id: number;
  descricaoLancamento: string | null;
  nome: string | null;
  dataVencimento: string | null;
  dataBaixa: string | null;
  valorBaixado: number;
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
 * Lançamentos no intervalo, opcionalmente filtrados a um bucket (mês ou dia) por data de baixa.
 * `periodoBucket`: YYYY-MM (mensal) ou YYYY-MM-DD (diário); omitir para todo o intervalo.
 */
export async function queryDfcAgendamentosDetalhe(params: {
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

  let periodClause = '';
  const args: unknown[] = [dataBaixaInicio, dataBaixaFim, idEmpresa];
  if (periodoBucket) {
    if (granularidade === 'mes') {
      periodClause = ' AND DATE_FORMAT(af.dataBaixa, \'%Y-%m\') = ?';
    } else {
      periodClause = ' AND DATE(af.dataBaixa) = ?';
    }
  }
  const placeholders = ids.map(() => '?').join(', ');
  args.push(...ids);
  // Ordem dos ? no SQL: … IN (ids…) e depois o filtro de período — o valor do mês/dia deve ir por último.
  if (periodoBucket) args.push(periodoBucket);

  const sql = `
SELECT
  af.id AS id,
  af.descricaoLancamento AS descricaoLancamento,
  pe.nome AS nome,
  DATE(af.dataVencimento) AS dataVencimento,
  DATE(af.dataBaixa) AS dataBaixa,
  (${SQL_VALOR_BAIXADO_EXPR}) AS valorBaixado
${SQL_BASE_FROM}
  AND af.idContaFinanceiro IN (${placeholders})
  ${periodClause}
ORDER BY valorBaixado DESC, af.id DESC
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
    console.error('[dfcAgendamentoRepository] queryDfcAgendamentosDetalhe:', msg);
    return { detalhes: [], erro: msg };
  }
}

export async function queryDfcAgendamentosEfetivos(params: {
  dataBaixaInicio: string;
  dataBaixaFim: string;
  granularidade: DfcAgendamentoGranularidade;
  idEmpresa: number;
}): Promise<{ linhas: DfcAgendamentoLinha[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { linhas: [], erro: 'NOMUS_DB_URL não configurado' };

  const { dataBaixaInicio, dataBaixaFim, granularidade, idEmpresa } = params;
  const sql = granularidade === 'mes' ? SQL_AGREGADO_MES : SQL_AGREGADO_DIA;
  const args = [dataBaixaInicio, dataBaixaFim, idEmpresa];

  try {
    const [rows] = (await pool.query(sql, args)) as [Record<string, unknown>[], unknown];
    const linhas: DfcAgendamentoLinha[] = (Array.isArray(rows) ? rows : []).map((r) => {
      const periodoRaw = r.periodo ?? r['periodo'];
      let periodo = '';
      if (periodoRaw instanceof Date) {
        const d = periodoRaw;
        if (granularidade === 'mes') {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          periodo = `${y}-${m}`;
        } else {
          periodo = d.toISOString().slice(0, 10);
        }
      } else if (granularidade === 'mes' && periodoRaw != null && String(periodoRaw).includes('-')) {
        periodo = String(periodoRaw).slice(0, 7);
      } else {
        periodo = String(periodoRaw ?? '').slice(0, 10);
      }
      return {
        idContaFinanceiro: toInt(r.idContaFinanceiro ?? r['idContaFinanceiro']),
        periodo,
        valor: toNum(r.valor ?? r['valor']),
      };
    });
    return { linhas };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcAgendamentoRepository] queryDfcAgendamentosEfetivos:', msg);
    return { linhas: [], erro: msg };
  }
}
