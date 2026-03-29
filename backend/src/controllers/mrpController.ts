/**
 * MRP: dados do Nomus (MySQL). Query em backend/src/data/mrpQuery.sql.
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import { getNomusPool, isNomusEnabled } from '../config/nomusDb.js';
import { computarHorizonteProducao } from '../services/mrpHorizonteService.js';
import { somarQtdeTotalComponenteMppPorCodigoSemFiltro } from './mppController.js';

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

/**
 * GET /api/mrp/mpp-qtde-total-por-componente
 * Soma de «Qtde total componente (no dia)» no resumo MPP, por código, sem filtros de grade/datas.
 */
export async function getMrpMppQtdeTotalPorComponente(_req: Request, res: Response): Promise<void> {
  const pool = getNomusPool();
  if (!pool || !isNomusEnabled()) {
    res.status(503).json({ error: 'ERP (Nomus) não configurado.', totais: {}, limitHit: false });
    return;
  }
  try {
    const { totais, limitHit } = await somarQtdeTotalComponenteMppPorCodigoSemFiltro(pool);
    res.json({ totais, limitHit });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[mrpController] getMrpMppQtdeTotalPorComponente:', msg);
    res.status(503).json({
      error: 'Erro ao somar quantidades MPP por componente.',
      detail: msg,
      totais: {},
      limitHit: false,
    });
  }
}

/**
 * GET /api/mrp/horizonte?horizonte_fim=YYYY-MM-DD
 * Cruza MPP (consumo) e PC (entrada); saldo acumulado por dia. Não depende das abas MPP/PC no frontend.
 */
export async function getMrpHorizonte(req: Request, res: Response): Promise<void> {
  const pool = getNomusPool();
  if (!pool || !isNomusEnabled()) {
    res.status(503).json({ error: 'ERP (Nomus) não configurado.' });
    return;
  }

  const fim = typeof req.query.horizonte_fim === 'string' ? req.query.horizonte_fim.trim() : '';
  if (!fim) {
    res.status(400).json({ error: 'Informe horizonte_fim (YYYY-MM-DD).' });
    return;
  }

  try {
    const result = await computarHorizonteProducao(pool, fim);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result.data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[mrpController] getMrpHorizonte:', msg);
    res.status(503).json({ error: 'Erro ao montar horizonte de produção.', detail: msg });
  }
}
