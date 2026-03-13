/**
 * MRP: dados do Nomus (MySQL). Query em backend/src/data/mrpQuery.sql.
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import { getNomusPool, isNomusEnabled } from '../config/nomusDb.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = 'mrpQuery.sql';

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

function getMrpSql(): string {
  if (sqlCache) return sqlCache;
  sqlCache = readFileSync(resolveSqlPath(), 'utf-8').trim();
  return sqlCache;
}

/** GET /api/mrp — lista dados MRP do Nomus */
export async function getMrp(_req: Request, res: Response): Promise<void> {
  const pool = getNomusPool();
  if (!pool || !isNomusEnabled()) {
    res.status(503).json({ error: 'ERP (Nomus) não configurado.', data: [] });
    return;
  }

  try {
    const sql = getMrpSql();
    const [rows] = await pool.query(sql);
    const data = Array.isArray(rows) ? rows : [];
    res.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[mrpController] getMrp:', msg);
    res.status(503).json({ error: 'Erro ao consultar MRP no ERP.', data: [] });
  }
}
