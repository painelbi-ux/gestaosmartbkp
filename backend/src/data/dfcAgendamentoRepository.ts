/**
 * DFC — agendamentos financeiros efetivos (Nomus, somente leitura).
 * Filtro por data de baixa; agregação por conta e dia ou mês.
 */

import { getNomusPool } from '../config/nomusDb.js';
import {
  montarFragmentoFiltroPrioridade,
  type DfcPrioridadeFilterResolvido,
} from './dfcPrioridadeFilter.js';
import type { DfcTipoRefLancamento } from './dfcPrioridadeConstantes.js';

export type DfcAgendamentoGranularidade = 'dia' | 'mes';

export interface DfcAgendamentoLinha {
  idContaFinanceiro: number;
  periodo: string;
  valor: number;
}

const SQL_PG_JOIN = `
LEFT JOIN (
  SELECT idAgendamentoPagamento, MAX(l.dataLancamento) AS dataLancamento, SUM(l.valor) AS valorpago
  FROM lancamentofinanceiro l
  WHERE idAgendamentoPagamento IS NOT NULL
  GROUP BY idAgendamentoPagamento
) pg ON pg.idAgendamentoPagamento = af.id
`.trim();

const SQL_BASE_FROM = `
FROM agendamentofinanceiro af
LEFT JOIN pessoa pe ON pe.id = af.idPessoa
LEFT JOIN contafinanceiro cf ON cf.id = af.idContaFinanceiro
LEFT JOIN (
  SELECT DISTINCT idAgendamentoPagamento
  FROM lancamentofinanceiro l
  WHERE idAgendamentoPagamento IS NOT NULL
) sn ON sn.idAgendamentoPagamento = af.id
${SQL_PG_JOIN}
`.trim();

function buildSqlWhereEfetivoPg(idEmpresas: number[]): string {
  const inClause = idEmpresas.map(() => '?').join(', ');
  return `
WHERE DATE(pg.dataLancamento) BETWEEN ? AND ?
  AND af.discriminador = 'P'
  AND af.idEmpresa IN (${inClause})
  AND af.idPedidoCompra IS NULL
  AND af.dataBaixa IS NOT NULL
  AND af.idContaFinanceiro IS NOT NULL
  AND CASE
    WHEN (sn.idAgendamentoPagamento IS NULL AND DATE(af.dataBaixa) IS NOT NULL) THEN 'Sem Numerario'
    ELSE 'Efetiva'
  END = 'Efetiva'
`.trim();
}

const SQL_VALOR_BAIXADO_EXPR = `
CASE
  WHEN (pg.valorpago IS NULL OR pg.valorpago = 0) THEN
    CASE WHEN (af.valorBaixado IS NULL OR af.valorBaixado = 0) THEN af.saldoBaixar ELSE af.valorBaixado END
  ELSE pg.valorpago
END
`.trim();

function buildSqlAgregado(
  granularidade: DfcAgendamentoGranularidade,
  idEmpresas: number[],
  filtroSqlPrioridade: string
): string {
  const fmt = granularidade === 'mes' ? "'%Y-%m'" : "'%Y-%m-%d'";
  return `
SELECT
  af.idContaFinanceiro AS idContaFinanceiro,
  DATE_FORMAT(pg.dataLancamento, ${fmt}) AS periodo,
  SUM((${SQL_VALOR_BAIXADO_EXPR})) AS valor
${SQL_BASE_FROM}
${buildSqlWhereEfetivoPg(idEmpresas)}
${filtroSqlPrioridade}
GROUP BY af.idContaFinanceiro, DATE_FORMAT(pg.dataLancamento, ${fmt})
ORDER BY periodo, idContaFinanceiro
`.trim();
}

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
  /** Universo do campo `id`: 'A' = agendamentofinanceiro.id, 'L' = lancamentofinanceiro.id. */
  tipoRef: DfcTipoRefLancamento;
  /** idEmpresa Nomus desta linha (para chave da prioridade). */
  idEmpresa: number;
  /** idContaFinanceiro Nomus (para chave da prioridade pelo plano de contas). */
  idContaFinanceiro: number | null;
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
 * Lançamentos no intervalo, opcionalmente filtrados a um bucket (mês ou dia) por data de lançamento do pagamento (pg).
 * `periodoBucket`: YYYY-MM (mensal) ou YYYY-MM-DD (diário); omitir para todo o intervalo.
 */
export async function queryDfcAgendamentosDetalhe(params: {
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

  let periodClause = '';
  const args: unknown[] = [dataBaixaInicio, dataBaixaFim, ...idEmpresas];
  if (periodoBucket) {
    if (granularidade === 'mes') {
      periodClause = ' AND DATE_FORMAT(pg.dataLancamento, \'%Y-%m\') = ?';
    } else {
      periodClause = ' AND DATE(pg.dataLancamento) = ?';
    }
  }
  const placeholders = ids.map(() => '?').join(', ');
  args.push(...ids);
  if (periodoBucket) args.push(periodoBucket);

  const filtroFrag = filtroPrioridade
    ? montarFragmentoFiltroPrioridade(filtroPrioridade, 'af')
    : { sql: '', args: [] };
  args.push(...filtroFrag.args);

  const sql = `
SELECT
  af.id AS id,
  af.idEmpresa AS idEmpresa,
  af.idContaFinanceiro AS idContaFinanceiro,
  af.descricaoLancamento AS descricaoLancamento,
  pe.nome AS nome,
  DATE(af.dataVencimento) AS dataVencimento,
  DATE(pg.dataLancamento) AS dataBaixa,
  (${SQL_VALOR_BAIXADO_EXPR}) AS valorBaixado
${SQL_BASE_FROM}
${buildSqlWhereEfetivoPg(idEmpresas)}
  AND af.idContaFinanceiro IN (${placeholders})
  ${periodClause}
  ${filtroFrag.sql}
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
      tipoRef: 'A',
      idEmpresa: toInt(r.idEmpresa ?? r['idEmpresa']),
      idContaFinanceiro: r.idContaFinanceiro != null ? toInt(r.idContaFinanceiro) : null,
    }));
    return { detalhes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcAgendamentoRepository] queryDfcAgendamentosDetalhe:', msg);
    return { detalhes: [], erro: msg };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJEÇÃO FUTURA — Pagamentos (P) não baixados, bucket por dataVencimento
// ─────────────────────────────────────────────────────────────────────────────

function buildSqlProjPgAgregado(
  granularidade: DfcAgendamentoGranularidade,
  idEmpresas: number[],
  filtroSqlPrioridade: string
): string {
  const fmt = granularidade === 'mes' ? "'%Y-%m'" : "'%Y-%m-%d'";
  const inClause = idEmpresas.map(() => '?').join(', ');
  return `
SELECT
  af.idContaFinanceiro AS idContaFinanceiro,
  DATE_FORMAT(af.dataVencimento, ${fmt}) AS periodo,
  SUM(af.saldoBaixar) AS valor
FROM agendamentofinanceiro af
WHERE DATE(af.dataVencimento) BETWEEN ? AND ?
  AND af.discriminador = 'P'
  AND af.idEmpresa IN (${inClause})
  AND af.idPedidoCompra IS NULL
  AND af.dataBaixa IS NULL
  AND af.saldoBaixar > 0
  AND af.idContaFinanceiro IS NOT NULL
  ${filtroSqlPrioridade}
GROUP BY af.idContaFinanceiro, DATE_FORMAT(af.dataVencimento, ${fmt})
ORDER BY periodo, idContaFinanceiro
`.trim();
}

/**
 * Projeção futura: pagamentos (P) NÃO baixados, bucket por dataVencimento, valor = saldoBaixar.
 */
export async function queryDfcAgendamentosProjecao(params: {
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
  const sql = buildSqlProjPgAgregado(granularidade, idEmpresas, filtroFrag.sql);
  const args = [dataVencimentoInicio, dataVencimentoFim, ...idEmpresas, ...filtroFrag.args];

  try {
    const [rows] = (await pool.query(sql, args)) as [Record<string, unknown>[], unknown];
    const linhas: DfcAgendamentoLinha[] = (Array.isArray(rows) ? rows : []).map((r) => {
      const periodoRaw = r.periodo ?? r['periodo'];
      let periodo = '';
      if (periodoRaw instanceof Date) {
        const d = periodoRaw;
        if (granularidade === 'mes') {
          periodo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        } else {
          periodo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
    console.error('[dfcAgendamentoRepository] queryDfcAgendamentosProjecao:', msg);
    return { linhas: [], erro: msg };
  }
}

/**
 * Detalhe de projeção futura: pagamentos (P) NÃO baixados por dataVencimento.
 */
export async function queryDfcAgendamentosProjecaoDetalhe(params: {
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

  const placeholders = ids.map(() => '?').join(', ');
  const empInClause = idEmpresas.map(() => '?').join(', ');
  const args: unknown[] = [dataVencimentoInicio, dataVencimentoFim, ...idEmpresas, ...ids];

  let periodClause = '';
  if (periodoBucket) {
    if (granularidade === 'mes') {
      periodClause = " AND DATE_FORMAT(af.dataVencimento, '%Y-%m') = ?";
    } else {
      periodClause = ' AND DATE(af.dataVencimento) = ?';
    }
    args.push(periodoBucket);
  }

  const filtroFrag = filtroPrioridade
    ? montarFragmentoFiltroPrioridade(filtroPrioridade, 'af')
    : { sql: '', args: [] };
  args.push(...filtroFrag.args);

  const sql = `
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
LEFT JOIN pessoa pe ON pe.id = af.idPessoa
WHERE DATE(af.dataVencimento) BETWEEN ? AND ?
  AND af.discriminador = 'P'
  AND af.idEmpresa IN (${empInClause})
  AND af.idPedidoCompra IS NULL
  AND af.dataBaixa IS NULL
  AND af.saldoBaixar > 0
  AND af.idContaFinanceiro IN (${placeholders})
  ${periodClause}
  ${filtroFrag.sql}
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
      dataBaixa: null,
      valorBaixado: toNum(r.valorBaixado ?? r['valorBaixado']),
      tipoRef: 'A',
      idEmpresa: toInt(r.idEmpresa ?? r['idEmpresa']),
      idContaFinanceiro: r.idContaFinanceiro != null ? toInt(r.idContaFinanceiro) : null,
    }));
    return { detalhes };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcAgendamentoRepository] queryDfcAgendamentosProjecaoDetalhe:', msg);
    return { detalhes: [], erro: msg };
  }
}

/** Despesas de pagamento em aberto — alinhado aos KPIs vencidos/a vencer a pagar (agendamento P). */
export type DfcDespesaPagamentoSituacao = 'vencido' | 'a_vencer';

export interface DfcDespesaPagamentoEmAbertoRow {
  situacao: DfcDespesaPagamentoSituacao;
  id: number;
  idEmpresa: number;
  idContaFinanceiro: number | null;
  descricaoLancamento: string | null;
  nome: string | null;
  dataVencimento: string | null;
  saldoBaixar: number;
}

/**
 * Agendamentos (P) não baixados em aberto, no intervalo das datas da DFC:
 * - **vencido**: mesmo critério de `dfcKpisRepository` `sqlVencidosPagar` (vencimento no intervalo,
 *   vencimento &lt; LEAST(dataFim, CURDATE()), saldoBaixar &gt; 0, sem baixa…).
 * - **a_vencer**: mesmo critério de `sqlAVencerPagar` (entre GREATEST(dataInicio,CURDATE()) e dataFim…).
 *
 * Opcionalmente filtra contas (`idsContaFinanceiro` ou único legado `idContaFinanceiro`) e favorecidos (`nomesFornecedor` ⇔ TRIM(pe.nome)).
 */
export async function queryDfcDespesasPagamentoEmAberto(params: {
  dataInicio: string;
  dataFim: string;
  idEmpresas: number[];
  idContaFinanceiro?: number | null;
  idsContaFinanceiro?: number[];
  nomesFornecedor?: string[];
}): Promise<{ linhas: DfcDespesaPagamentoEmAbertoRow[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { linhas: [], erro: 'NOMUS_DB_URL não configurado' };

  const { dataInicio, dataFim, idEmpresas } = params;
  const mergedContaIds: number[] = [
    ...(params.idsContaFinanceiro ?? []).map((n) => Math.trunc(Number(n))),
  ];
  if (
    params.idContaFinanceiro != null &&
    Number.isFinite(params.idContaFinanceiro) &&
    params.idContaFinanceiro > 0
  ) {
    mergedContaIds.push(Math.trunc(params.idContaFinanceiro));
  }
  const idsConta = [...new Set(mergedContaIds.filter((n) => Number.isFinite(n) && n > 0))];

  const nomesFornecedor = [
    ...new Set((params.nomesFornecedor ?? []).map((s) => s.trim()).filter(Boolean)),
  ];

  const empInClause = idEmpresas.map(() => '?').join(', ');
  const contaClause =
    idsConta.length > 0 ? ` AND af.idContaFinanceiro IN (${idsConta.map(() => '?').join(', ')}) ` : '';
  const fornecedorClause =
    nomesFornecedor.length > 0 ? ` AND TRIM(pe.nome) IN (${nomesFornecedor.map(() => '?').join(', ')}) ` : '';

  const pushFiltros = (branchArgs: unknown[]) => {
    branchArgs.push(...idsConta, ...nomesFornecedor);
  };

  const sql = `
SELECT u.situacao, u.id, u.idEmpresa, u.idContaFinanceiro, u.descricaoLancamento, u.nome,
       u.dataVencimento, u.saldoBaixar
FROM (
  SELECT
    'vencido' AS situacao,
    af.id AS id,
    af.idEmpresa AS idEmpresa,
    af.idContaFinanceiro AS idContaFinanceiro,
    af.descricaoLancamento AS descricaoLancamento,
    pe.nome AS nome,
    DATE(af.dataVencimento) AS dataVencimento,
    af.saldoBaixar AS saldoBaixar
  FROM agendamentofinanceiro af
  LEFT JOIN pessoa pe ON pe.id = af.idPessoa
  WHERE DATE(af.dataVencimento) BETWEEN ? AND ?
    AND DATE(af.dataVencimento) < LEAST(?, CURDATE())
    AND af.dataBaixa IS NULL
    AND af.saldoBaixar > 0
    AND af.idEmpresa IN (${empInClause})
    AND af.idPedidoCompra IS NULL
    AND af.discriminador = 'P'
    AND af.idContaFinanceiro IS NOT NULL
    ${contaClause}${fornecedorClause}

  UNION ALL

  SELECT
    'a_vencer' AS situacao,
    af.id AS id,
    af.idEmpresa AS idEmpresa,
    af.idContaFinanceiro AS idContaFinanceiro,
    af.descricaoLancamento AS descricaoLancamento,
    pe.nome AS nome,
    DATE(af.dataVencimento) AS dataVencimento,
    af.saldoBaixar AS saldoBaixar
  FROM agendamentofinanceiro af
  LEFT JOIN pessoa pe ON pe.id = af.idPessoa
  WHERE DATE(af.dataVencimento) BETWEEN GREATEST(?, CURDATE()) AND ?
    AND af.dataBaixa IS NULL
    AND af.saldoBaixar > 0
    AND af.idEmpresa IN (${empInClause})
    AND af.idPedidoCompra IS NULL
    AND af.discriminador = 'P'
    AND af.idContaFinanceiro IS NOT NULL
    ${contaClause}${fornecedorClause}
) u
ORDER BY FIELD(u.situacao, 'vencido', 'a_vencer'), u.dataVencimento ASC, u.id DESC
LIMIT 2000
`.trim();

  const argsBranch1: unknown[] = [dataInicio, dataFim, dataFim, ...idEmpresas];
  pushFiltros(argsBranch1);
  const argsBranch2: unknown[] = [dataInicio, dataFim, ...idEmpresas];
  pushFiltros(argsBranch2);
  const args: unknown[] = [...argsBranch1, ...argsBranch2];

  try {
    const [rows] = (await pool.query(sql, args)) as [Record<string, unknown>[], unknown];
    const list = Array.isArray(rows) ? rows : [];
    const linhas: DfcDespesaPagamentoEmAbertoRow[] = list.map((r) => {
      const sit = r.situacao ?? r['situacao'];
      const situacao: DfcDespesaPagamentoSituacao =
        sit === 'a_vencer' ? 'a_vencer' : 'vencido';
      return {
        situacao,
        id: toInt(r.id ?? r['id']),
        idEmpresa: toInt(r.idEmpresa ?? r['idEmpresa']),
        idContaFinanceiro: r.idContaFinanceiro != null ? toInt(r.idContaFinanceiro) : null,
        descricaoLancamento: r.descricaoLancamento != null ? String(r.descricaoLancamento) : null,
        nome: r.nome != null ? String(r.nome) : null,
        dataVencimento: formatYmdFromSqlDate(r.dataVencimento ?? r['dataVencimento']),
        saldoBaixar: toNum(r.saldoBaixar ?? r['saldoBaixar']),
      };
    });
    return { linhas };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcAgendamentoRepository] queryDfcDespesasPagamentoEmAberto:', msg);
    return { linhas: [], erro: msg };
  }
}

/** Favorecidos (`pessoa`) distintos entre despesas P em aberto no intervalo (vencidas + a vencer), mesmo universo do KPI da DFC. */
export async function queryDfcDespesasPagamentoFornecedorOpcoes(params: {
  dataInicio: string;
  dataFim: string;
  idEmpresas: number[];
}): Promise<{ nomes: string[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { nomes: [], erro: 'NOMUS_DB_URL não configurado' };

  const { dataInicio, dataFim, idEmpresas } = params;
  if (idEmpresas.length === 0) return { nomes: [] };

  const empInClause = idEmpresas.map(() => '?').join(', ');

  const sql = `
SELECT DISTINCT TRIM(pe.nome) AS nome
FROM agendamentofinanceiro af
LEFT JOIN pessoa pe ON pe.id = af.idPessoa
WHERE (
    (
      DATE(af.dataVencimento) BETWEEN ? AND ?
      AND DATE(af.dataVencimento) < LEAST(?, CURDATE())
    )
    OR (
      DATE(af.dataVencimento) BETWEEN GREATEST(?, CURDATE()) AND ?
    )
  )
  AND af.dataBaixa IS NULL
  AND af.saldoBaixar > 0
  AND af.idEmpresa IN (${empInClause})
  AND af.idPedidoCompra IS NULL
  AND af.discriminador = 'P'
  AND af.idContaFinanceiro IS NOT NULL
  AND pe.nome IS NOT NULL
  AND TRIM(pe.nome) <> ''
ORDER BY nome
LIMIT 800
`.trim();

  const args: unknown[] = [dataInicio, dataFim, dataFim, dataInicio, dataFim, ...idEmpresas];

  try {
    const [rows] = (await pool.query(sql, args)) as [Record<string, unknown>[], unknown];
    const list = Array.isArray(rows) ? rows : [];
    const nomes = list.map((r) => String(r.nome ?? r['nome'] ?? '').trim()).filter(Boolean);
    return { nomes: [...new Set(nomes)] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcAgendamentoRepository] queryDfcDespesasPagamentoFornecedorOpcoes:', msg);
    return { nomes: [], erro: msg };
  }
}

export async function queryDfcAgendamentosEfetivos(params: {
  dataBaixaInicio: string;
  dataBaixaFim: string;
  granularidade: DfcAgendamentoGranularidade;
  idEmpresas: number[];
  filtroPrioridade?: DfcPrioridadeFilterResolvido;
}): Promise<{ linhas: DfcAgendamentoLinha[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { linhas: [], erro: 'NOMUS_DB_URL não configurado' };

  const { dataBaixaInicio, dataBaixaFim, granularidade, idEmpresas, filtroPrioridade } = params;
  const filtroFrag = filtroPrioridade
    ? montarFragmentoFiltroPrioridade(filtroPrioridade, 'af')
    : { sql: '', args: [] };
  const sql = buildSqlAgregado(granularidade, idEmpresas, filtroFrag.sql);
  const args = [dataBaixaInicio, dataBaixaFim, ...idEmpresas, ...filtroFrag.args];

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
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          periodo = `${y}-${m}-${day}`;
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
