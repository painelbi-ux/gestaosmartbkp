/**
 * PC — saldo a receber por produto (itens pedido de compra, Nomus).
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import type { Pool } from 'mysql2/promise';
import { getNomusPool, isNomusEnabled } from '../config/nomusDb.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = 'pcSaldoReceber.sql';

function resolvePcSqlPath(): string {
  const candidates = [
    join(__dirname, '..', 'data', SQL_FILE),
    join(process.cwd(), 'src', 'data', SQL_FILE),
    join(process.cwd(), 'dist', 'data', SQL_FILE),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`Arquivo ${SQL_FILE} não encontrado.`);
}

/** Sem cache: evita HMR/tsx manter texto antigo com placeholder não substituído. */
function getPcSaldoSqlTemplate(): string {
  return readFileSync(resolvePcSqlPath(), 'utf-8').trim().replace(/\r\n/g, '\n');
}

const PC_SQL_MARKER = '/*PC_EXTRA_WHERE*/';

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;

export type PcSaldoFiltros = {
  codigoProduto: string;
  dataEntregaIni: string;
  dataEntregaFim: string;
};

function parsePcFiltros(req: Request): PcSaldoFiltros {
  return {
    codigoProduto: typeof req.query.codigo_produto === 'string' ? req.query.codigo_produto.trim() : '',
    dataEntregaIni: typeof req.query.data_entrega_ini === 'string' ? req.query.data_entrega_ini.trim() : '',
    dataEntregaFim: typeof req.query.data_entrega_fim === 'string' ? req.query.data_entrega_fim.trim() : '',
  };
}

function isoDateOnly(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/** Condições extras (AND ...) e parâmetros, para listagem e COUNT. */
function buildPcExtraWhere(f: PcSaldoFiltros): { extraWhere: string; params: (string | number)[] } {
  const extra: string[] = [];
  const params: (string | number)[] = [];

  if (f.codigoProduto) {
    extra.push('TRIM(pd.nome) LIKE ?');
    params.push(`%${f.codigoProduto}%`);
  }
  if (f.dataEntregaIni && isoDateOnly(f.dataEntregaIni)) {
    extra.push('(i.dataEntrega IS NOT NULL AND CAST(i.dataEntrega AS DATE) >= ?)');
    params.push(f.dataEntregaIni);
  }
  if (f.dataEntregaFim && isoDateOnly(f.dataEntregaFim)) {
    extra.push('(i.dataEntrega IS NOT NULL AND CAST(i.dataEntrega AS DATE) <= ?)');
    params.push(f.dataEntregaFim);
  }

  const extraWhere = extra.length > 0 ? `AND ${extra.join(' AND ')}` : '';
  return { extraWhere, params };
}

/** SQL principal (GROUP BY + HAVING + colunas agregadas), sem ORDER/LIMIT. */
function buildPcSaldoBody(f: PcSaldoFiltros): { sql: string; params: (string | number)[] } {
  const { extraWhere, params } = buildPcExtraWhere(f);
  const injection = extraWhere ? ` ${extraWhere}` : '';
  const tpl = getPcSaldoSqlTemplate();
  if (!tpl.includes(PC_SQL_MARKER)) {
    throw new Error(`Marcador ${PC_SQL_MARKER} ausente em ${SQL_FILE}`);
  }
  const sql = tpl.replace(PC_SQL_MARKER, injection);
  return { sql, params };
}

/**
 * COUNT de produtos distintos — subconsulta só com GROUP BY/HAVING (evita aninhar o SELECT completo,
 * que em alguns servidores MySQL falha com erros de otimização).
 */
function buildPcSaldoCountSql(extraWhere: string): string {
  return `
SELECT COUNT(*) AS c FROM (
  SELECT pd.id
  FROM itempedidocompra i
  INNER JOIN produto pd ON pd.id = i.idProduto
  WHERE i.status IN (2, 3, 4)
  ${extraWhere}
  GROUP BY pd.id, pd.nome
  HAVING COALESCE(SUM(COALESCE(i.qtde, 0) - COALESCE(i.qtdeAtendida, 0)), 0) > 0
) AS subq
`.trim();
}

function rowToJson(r: Record<string, unknown>): Record<string, unknown> {
  const raw = r as Record<string, unknown>;
  const dataEntrega = raw.dataEntrega ?? raw.dataentrega;
  let dataEntregaIso: string | null = null;
  if (dataEntrega instanceof Date && !Number.isNaN(dataEntrega.getTime())) {
    dataEntregaIso = dataEntrega.toISOString().slice(0, 10);
  } else if (dataEntrega != null && String(dataEntrega).trim()) {
    const s = String(dataEntrega).trim();
    dataEntregaIso = /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
  }
  const saldoRaw = raw.saldoaReceber ?? raw.saldoareceber;
  const saldo = Number(saldoRaw);
  const codigo =
    raw.codigoProduto ?? raw.codigoproduto ?? raw.CodigoProduto ?? null;
  return {
    codigoProduto: codigo != null ? String(codigo) : null,
    dataEntrega: dataEntregaIso,
    saldoaReceber: Number.isFinite(saldo) ? saldo : 0,
  };
}

export async function listarPcSaldoReceber(
  pool: Pool,
  f: PcSaldoFiltros,
  page: number,
  pageSize: number
): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const { extraWhere, params } = buildPcExtraWhere(f);
  const countSql = buildPcSaldoCountSql(extraWhere);
  const [countRows] = await pool.query(countSql, params);

  const { sql: body } = buildPcSaldoBody(f);
  const countArr = Array.isArray(countRows) ? countRows : [];
  const countRow = (countArr[0] ?? {}) as Record<string, unknown>;
  const total = Number(countRow.c ?? countRow.C) || 0;

  const offset = (page - 1) * pageSize;
  const listSql = `${body}\nORDER BY pd.nome ASC\nLIMIT ? OFFSET ?`;
  const listParams = [...params, pageSize, offset];
  const [rows] = await pool.query(listSql, listParams);
  const raw = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  return { data: raw.map(rowToJson), total };
}

/** Todas as linhas PC (sem paginação) — uso interno MRP horizonte. */
export async function listarPcSaldoReceberTodos(
  pool: Pool,
  f: PcSaldoFiltros
): Promise<Record<string, unknown>[]> {
  const { sql: body, params } = buildPcSaldoBody(f);
  const listSql = `${body}\nORDER BY pd.nome ASC`;
  const [rows] = await pool.query(listSql, params);
  const raw = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  return raw.map(rowToJson);
}

export async function getPcSaldoReceber(req: Request, res: Response): Promise<void> {
  const pool = getNomusPool();
  if (!pool || !isNomusEnabled()) {
    res.status(503).json({ error: 'ERP (Nomus) não configurado.', data: [], total: 0 });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query.page ?? 1), 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(String(req.query.pageSize ?? DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );
  const filtros = parsePcFiltros(req);

  try {
    const { data, total } = await listarPcSaldoReceber(pool, filtros, page, pageSize);
    const hasMore = page * pageSize < total;
    res.json({ data, page, pageSize, total, hasMore });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
    console.error('[pcSaldoReceberController] getPcSaldoReceber:', code, msg);
    res.status(503).json({
      error: 'Erro ao consultar saldo a receber (PC).',
      detail: msg,
      data: [],
      total: 0,
    });
  }
}
