/**
 * MPP: dados do Nomus (MySQL). Query em backend/src/data/mppQuery.sql.
 * Enriquece com Data Previsão (data do último ajuste por item/pedido) do SQLite (Gestão de Pedidos).
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

/** Última data_ajuste por id_pedido (SQLite – Gestão de Pedidos). */
async function obterUltimaDataAjustePorIdPedido(ids: string[]): Promise<Map<string, string>> {
  const idsNorm = [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (idsNorm.length === 0) return new Map();
  const list = await prisma.pedidoPrevisaoAjuste.findMany({
    where: { id_pedido: { in: idsNorm } },
    select: { id_pedido: true, data_ajuste: true },
    orderBy: [{ data_ajuste: 'desc' }, { id: 'desc' }],
  });
  const map = new Map<string, string>();
  for (const r of list) {
    const key = String(r.id_pedido ?? '').trim();
    if (!key || map.has(key)) continue;
    const d = r.data_ajuste instanceof Date ? r.data_ajuste : new Date(r.data_ajuste);
    map.set(key, d.toISOString().slice(0, 10));
  }
  return map;
}

/** GET /api/mpp — lista dados MPP do Nomus + Data Previsão (último ajuste por item/pedido) */
export async function getMpp(_req: Request, res: Response): Promise<void> {
  const pool = getNomusPool();
  if (!pool || !isNomusEnabled()) {
    res.status(503).json({ error: 'ERP (Nomus) não configurado.', data: [] });
    return;
  }

  try {
    const sql = getMppSql();
    const [rows] = await pool.query(sql);
    const raw = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    const idChaves = raw.map((r) => String(r.idChave ?? r.idchave ?? '').trim()).filter(Boolean);
    const dataAjustePorId = await obterUltimaDataAjustePorIdPedido(idChaves);
    const data = raw.map((r) => {
      const idChave = String(r.idChave ?? r.idchave ?? '').trim();
      const dataPrevisao = dataAjustePorId.get(idChave) ?? null;
      return { ...r, dataPrevisao };
    });
    res.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[mppController] getMpp:', msg);
    res.status(503).json({ error: 'Erro ao consultar MPP no ERP.', data: [] });
  }
}
