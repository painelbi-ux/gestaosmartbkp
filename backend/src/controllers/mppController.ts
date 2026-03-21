/**
 * MPP: dados do Nomus (MySQL). Query em backend/src/data/mppQuery.sql.
 * Data de Previsão: última previsão feita no Gestor de Pedidos (previsao_nova); se não houver ajuste, fica sem data.
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import { getNomusPool, isNomusEnabled } from '../config/nomusDb.js';
import { prisma } from '../config/prisma.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = 'mppQuery.sql';

function resolveSqlPath(): string {
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

let sqlCache: string | null = null;

function getMppSql(): string {
  if (sqlCache) return sqlCache;
  sqlCache = readFileSync(resolveSqlPath(), 'utf-8').trim();
  return sqlCache;
}

/**
 * Gera chave alternativa sem romaneio: idChave é "deId-pedidoId-produtoId";
 * o Gestor pode ter gravado como "0000000-pedidoId-produtoId". Retorna essa chave para fallback.
 */
function idChaveParaFallback(idChave: string): string | null {
  const s = String(idChave ?? '').trim();
  const parts = s.split('-');
  if (parts.length < 3) return null;
  return '0000000-' + parts.slice(1).join('-');
}

/** Última previsão (previsao_nova) por id_pedido – Gestor de Pedidos. Considera também chave 0000000-pedidoId-produtoId quando o ajuste foi gravado sem romaneio. */
async function obterUltimaPrevisaoPorIdPedido(ids: string[]): Promise<Map<string, string>> {
  const idsNorm = [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (idsNorm.length === 0) return new Map();
  const fallbacks = idsNorm.map(idChaveParaFallback).filter((x): x is string => x != null);
  const todosIds = [...new Set([...idsNorm, ...fallbacks])];
  const list = await prisma.pedidoPrevisaoAjuste.findMany({
    where: { id_pedido: { in: todosIds } },
    select: { id_pedido: true, previsao_nova: true, data_ajuste: true },
    orderBy: [{ data_ajuste: 'desc' }, { id: 'desc' }],
  });
  const map = new Map<string, string>();
  for (const r of list) {
    const key = String(r.id_pedido ?? '').trim();
    if (!key || map.has(key)) continue;
    const d = r.previsao_nova instanceof Date ? r.previsao_nova : new Date(r.previsao_nova);
    if (!Number.isNaN(d.getTime())) map.set(key, d.toISOString().slice(0, 10));
  }
  return map;
}

/** Retorna data de previsão para um idChave do MPP: tenta idChave exato e depois 0000000-pedidoId-produtoId. */
function getDataPrevisaoForRow(
  idChave: string,
  ultimaPrevisaoPorId: Map<string, string>
): string | null {
  const key = String(idChave ?? '').trim();
  if (!key) return null;
  const exact = ultimaPrevisaoPorId.get(key);
  if (exact) return exact;
  const fallback = idChaveParaFallback(key);
  return fallback ? ultimaPrevisaoPorId.get(fallback) ?? null : null;
}

const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 500;
/** Máximo de linhas buscadas do ERP para ordenar por Data de Previsão e calcular acumulado em memória. */
const FETCH_LIMIT_FOR_SORT = 10000;

function parseBool(val: unknown): boolean {
  if (val === true || val === 'true' || val === '1') return true;
  return false;
}

/** Ordena por Data de Previsão (mais antigo primeiro); sem data vai para o final. */
function sortByDataPrevisao<T extends { dataPrevisao?: string | null }>(arr: T[]): void {
  arr.sort((a, b) => {
    const da = (a.dataPrevisao ?? '').trim();
    const db = (b.dataPrevisao ?? '').trim();
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.localeCompare(db);
  });
}

/** Preenche qtdAcumulado: soma acumulada de qtdTotalComponente por componente, só para linhas com dataPrevisão (ordem já por data). */
function fillQtdAcumulado(rows: Record<string, unknown>[]): void {
  const sumByComponent = new Map<string, number>();
  for (const row of rows) {
    const dp = (row.dataPrevisao ?? '').trim();
    if (!dp) {
      row.qtdAcumulado = null;
      continue;
    }
    const comp = String(row.codigoComponente ?? '').trim();
    const qtd = Number(row.qtdTotalComponente) || 0;
    const prev = sumByComponent.get(comp) ?? 0;
    const acum = prev + qtd;
    sumByComponent.set(comp, acum);
    row.qtdAcumulado = acum;
  }
}

/**
 * Estoque_MP_PA = Estoque_PA x Qtd Unitária do Componente (`qtd` no SQL).
 * Mantém 0 quando não houver valores.
 */
function fillEstoqueMPPA(rows: Record<string, unknown>[]): void {
  for (const row of rows) {
    const estoquePA = Number(row.Estoque_PA) || 0;
    const qtdUnit = Number(row.qtd) || 0;
    row.Estoque_MP_PA = estoquePA * qtdUnit;
  }
}

/** GET /api/mpp — lista dados MPP do Nomus + Data Previsão (paginado). Ordenação por Data de Previsão (mais antigo primeiro); acumulado só considera linhas com data. */
export async function getMpp(req: Request, res: Response): Promise<void> {
  const pool = getNomusPool();
  if (!pool || !isNomusEnabled()) {
    res.status(503).json({ error: 'ERP (Nomus) não configurado.', data: [] });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query.page ?? 1), 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(String(req.query.pageSize ?? DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );
  const offset = (page - 1) * pageSize;
  const apenasComPrevisao = parseBool(req.query.apenas_com_previsao);

  const codigoPedido = typeof req.query.codigo_pedido === 'string' ? req.query.codigo_pedido.trim() : '';
  const codigoProduto = typeof req.query.codigo_produto === 'string' ? req.query.codigo_produto.trim() : '';
  const cliente = typeof req.query.cliente === 'string' ? req.query.cliente.trim() : '';
  const segmentacao = typeof req.query.segmentacao === 'string' ? req.query.segmentacao.trim() : '';
  const codigoComponente = typeof req.query.codigo_componente === 'string' ? req.query.codigo_componente.trim() : '';
  const componente = typeof req.query.componente === 'string' ? req.query.componente.trim() : '';

  try {
    const sqlBase = getMppSql();
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (codigoPedido) {
      conditions.push('`Codigo_pedido` LIKE ?');
      params.push(`%${codigoPedido}%`);
    }
    if (codigoProduto) {
      // Qualifica o alias do subquery e faz TRIM para evitar divergencias por espaços no ERP.
      conditions.push('TRIM(mpp_sub.`Codigo_produto`) LIKE ?');
      params.push(`%${codigoProduto}%`);
    }
    if (cliente) {
      conditions.push('`Cliente` LIKE ?');
      params.push(`%${cliente}%`);
    }
    if (segmentacao) {
      conditions.push('`Segmentacao_carradas` LIKE ?');
      params.push(`%${segmentacao}%`);
    }
    if (codigoComponente) {
      conditions.push('`codigoComponente` LIKE ?');
      params.push(`%${codigoComponente}%`);
    }
    if (componente) {
      conditions.push('`componente` LIKE ?');
      params.push(`%${componente}%`);
    }

    const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM (${sqlBase}) AS mpp_sub${whereClause} LIMIT ? OFFSET ?`;
    params.push(FETCH_LIMIT_FOR_SORT, 0);

    const [rows] = await pool.query(sql, params);
    const raw = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    const idChaves = raw.map((r) => String(r.idChave ?? r.idchave ?? '').trim()).filter(Boolean);
    let ultimaPrevisaoPorId = new Map<string, string>();
    try {
      ultimaPrevisaoPorId = await obterUltimaPrevisaoPorIdPedido(idChaves);
    } catch (e) {
      console.warn('[mppController] obterUltimaPrevisaoPorIdPedido falhou:', (e as Error)?.message);
    }
    let data = raw.map((r) => {
      const idChave = String(r.idChave ?? r.idchave ?? '').trim();
      const dataPrevisao = getDataPrevisaoForRow(idChave, ultimaPrevisaoPorId);
      const linha = typeof r === 'object' && r !== null ? { ...(r as object) } : {};
      return { ...linha, dataPrevisao } as Record<string, unknown>;
    });

    sortByDataPrevisao(data);
    if (apenasComPrevisao) {
      data = data.filter((r) => (r.dataPrevisao ?? '').trim() !== '');
    }
    fillQtdAcumulado(data);
    fillEstoqueMPPA(data);

    const total = data.length;
    const pageData = data.slice(offset, offset + pageSize);
    const hasMore = offset + pageData.length < total;

    res.json({ data: pageData, page, pageSize, total, hasMore });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[mppController] getMpp:', msg);
    res.status(503).json({ error: 'Erro ao consultar MPP no ERP.', data: [] });
  }
}
