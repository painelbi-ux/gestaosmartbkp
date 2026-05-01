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
import { prisma } from '../config/prisma.js';
import {
  buildMrpSnapshotRows,
  persistMrpSnapshotRows,
  type MrpScenarioRow,
} from '../services/mrpSnapshotService.js';
import { computarHorizonteCenarioSimulado } from '../services/mrpHorizonteCenarioSimuladoService.js';

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

/**
 * GET /api/mrp/runs/:id/horizonte?horizonte_fim=YYYY-MM-DD
 * Horizonte restrito ao cenário simulado (consumo = BOM × qtd do arquivo na data de Nova previsão).
 */
export async function getMrpRunHorizonte(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }

  try {
    const run = await prisma.mrpRun.findUnique({ where: { id } });
    if (!run) {
      res.status(404).json({ error: 'MRP não encontrado.' });
      return;
    }
    if (run.status !== 'PROCESSADO') {
      res.status(400).json({
        error: 'Processe o MRP antes de consultar o horizonte salvo.',
      });
      return;
    }
    if (!run.horizonte_json) {
      res.status(404).json({ error: 'Horizonte não foi salvo no processamento deste MRP.' });
      return;
    }
    res.json(JSON.parse(run.horizonte_json));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[mrpController] getMrpRunHorizonte:', msg);
    res.status(503).json({ error: 'Erro ao carregar horizonte salvo do MRP.', detail: msg });
  }
}

type MrpRunStatus =
  | 'AGUARDANDO_PROCESSAMENTO'
  | 'PROCESSANDO'
  | 'PROCESSADO'
  | 'ERRO';

function isMrpRunStatus(value: string): value is MrpRunStatus {
  return (
    value === 'AGUARDANDO_PROCESSAMENTO' ||
    value === 'PROCESSANDO' ||
    value === 'PROCESSADO' ||
    value === 'ERRO'
  );
}

function isIsoDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseScenarioRows(raw: unknown): MrpScenarioRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: MrpScenarioRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const id_pedido = String(rec.id_pedido ?? '').trim();
    const previsao_nova = String(rec.previsao_nova ?? '').trim();
    if (!id_pedido || !previsao_nova) continue;
    const codRaw = rec.cod_produto ?? rec.codProduto;
    const cod_produto =
      codRaw != null && String(codRaw).trim() ? String(codRaw).trim() : undefined;
    let qtde_pendente: number | undefined;
    const qtRaw = rec.qtde_pendente ?? rec.qtdePendente;
    if (qtRaw != null && qtRaw !== '') {
      const n = Number(qtRaw);
      if (Number.isFinite(n)) qtde_pendente = n;
    }
    rows.push({
      id_pedido,
      previsao_nova,
      cod_produto: cod_produto ?? undefined,
      qtde_pendente,
    });
  }
  return rows;
}

function runToResponse(run: {
  id: number;
  uid: string;
  nome: string;
  observacoes: string | null;
  scenario_type: string;
  scenario_file_name: string | null;
  horizonte_fim?: string | null;
  status: string;
  created_at: Date;
  processed_at: Date | null;
  created_by_login: string | null;
  processed_by_login: string | null;
  error_message: string | null;
  _count?: { rows: number };
}) {
  return {
    id: run.id,
    uid: run.uid,
    nome: run.nome,
    observacoes: run.observacoes,
    scenario_type: run.scenario_type,
    scenario_file_name: run.scenario_file_name,
    horizonte_fim: run.horizonte_fim ?? null,
    status: run.status,
    created_at: run.created_at,
    processed_at: run.processed_at,
    created_by_login: run.created_by_login,
    processed_by_login: run.processed_by_login,
    error_message: run.error_message,
    snapshot_rows_count: run._count?.rows ?? undefined,
  };
}

async function processMrpRunInternal(runId: number, login: string): Promise<void> {
  const run = await prisma.mrpRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error('MRP não encontrado.');
  if (run.status === 'PROCESSADO') return;
  if (!run.horizonte_fim || !isIsoDateOnly(run.horizonte_fim)) {
    throw new Error('Data final do horizonte não informada para este MRP.');
  }
  const pool = getNomusPool();
  if (!pool || !isNomusEnabled()) {
    throw new Error('ERP (Nomus) não configurado.');
  }

  const usuario = await prisma.usuario.findUnique({
    where: { login },
    select: { id: true, login: true },
  });

  await prisma.mrpRun.update({
    where: { id: runId },
    data: {
      status: 'PROCESSANDO',
      error_message: null,
      processed_by_user_id: usuario?.id ?? null,
      processed_by_login: usuario?.login ?? login,
    },
  });

  try {
    const scenarioRows = parseScenarioRows(run.scenario_payload_json ? JSON.parse(run.scenario_payload_json) : []);
    const rows = await buildMrpSnapshotRows({
      scenarioType: run.scenario_type === 'SIMULADO' ? 'SIMULADO' : 'REAL',
      scenarioRows,
    });
    const horizonteResult =
      run.scenario_type === 'SIMULADO'
        ? await computarHorizonteCenarioSimulado(pool, run.horizonte_fim, scenarioRows)
        : await computarHorizonteProducao(pool, run.horizonte_fim);
    if (!horizonteResult.ok) {
      throw new Error(horizonteResult.error);
    }
    await prisma.$transaction(async (tx) => {
      await tx.mrpSnapshotRow.deleteMany({ where: { run_id: runId } });
      await tx.mrpRun.update({
        where: { id: runId },
        data: {
          status: 'PROCESSANDO',
          error_message: null,
        },
      });
    });
    await persistMrpSnapshotRows(runId, rows);
    await prisma.mrpRun.update({
      where: { id: runId },
      data: {
        status: 'PROCESSADO',
        processed_at: new Date(),
        error_message: null,
        horizonte_json: JSON.stringify(horizonteResult.data),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.mrpRun.update({
      where: { id: runId },
      data: {
        status: 'ERRO',
        error_message: msg,
      },
    });
    throw err;
  }
}

/** GET /api/mrp/runs */
export async function listMrpRuns(_req: Request, res: Response): Promise<void> {
  try {
    const runs = await prisma.mrpRun.findMany({
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { rows: true } } },
    });
    res.json({ data: runs.map(runToResponse) });
  } catch (err) {
    res.status(503).json({ error: 'Erro ao listar MRPs processados.' });
  }
}

/** POST /api/mrp/runs */
export async function createMrpRun(req: Request, res: Response): Promise<void> {
  const login = req.user?.login ?? 'anon';
  const {
    nome,
    observacoes,
    scenario_type,
    scenario_file_name,
    horizonte_fim,
    scenario_rows,
  } = (req.body ?? {}) as {
    nome?: string;
    observacoes?: string;
    scenario_type?: string;
    scenario_file_name?: string;
    horizonte_fim?: string;
    scenario_rows?: unknown;
  };

  const nomeTrim = String(nome ?? '').trim();
  const nomeAuto = `MRP ${new Date().toLocaleDateString('pt-BR')}`;
  const tipo = String(scenario_type ?? 'REAL').trim().toUpperCase();
  if (tipo !== 'REAL' && tipo !== 'SIMULADO') {
    res.status(400).json({ error: 'scenario_type deve ser REAL ou SIMULADO.' });
    return;
  }
  const horizonteFim = String(horizonte_fim ?? '').trim();
  if (!horizonteFim || !isIsoDateOnly(horizonteFim)) {
    res.status(400).json({ error: 'Informe a data do horizonte no formato YYYY-MM-DD.' });
    return;
  }
  const rows = parseScenarioRows(scenario_rows);
  if (tipo === 'SIMULADO' && rows.length === 0) {
    res.status(400).json({ error: 'No cenário simulado, informe o arquivo de cenário com ao menos uma linha válida.' });
    return;
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { login },
      select: { id: true, login: true },
    });
    const created = await prisma.mrpRun.create({
      data: {
        nome: nomeTrim || nomeAuto,
        observacoes: observacoes != null && String(observacoes).trim() ? String(observacoes).trim() : null,
        scenario_type: tipo,
        scenario_file_name: scenario_file_name ? String(scenario_file_name).trim() : null,
        horizonte_fim: horizonteFim,
        scenario_payload_json: tipo === 'SIMULADO' ? JSON.stringify(rows) : null,
        status: 'AGUARDANDO_PROCESSAMENTO',
        created_by_user_id: usuario?.id ?? null,
        created_by_login: usuario?.login ?? login,
      },
    });

    const reloaded = await prisma.mrpRun.findUnique({
      where: { id: created.id },
      include: { _count: { select: { rows: true } } },
    });
    res.json({ data: reloaded ? runToResponse(reloaded) : runToResponse(created as any) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: msg || 'Erro ao criar MRP.' });
  }
}

/** POST /api/mrp/runs/:id/process */
export async function processMrpRun(req: Request, res: Response): Promise<void> {
  const login = req.user?.login ?? 'anon';
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  try {
    await processMrpRunInternal(id, login);
    const run = await prisma.mrpRun.findUnique({
      where: { id },
      include: { _count: { select: { rows: true } } },
    });
    if (!run) {
      res.status(404).json({ error: 'MRP não encontrado.' });
      return;
    }
    res.json({ data: runToResponse(run) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(503).json({ error: msg || 'Erro ao processar MRP.' });
  }
}

/** DELETE /api/mrp/runs/:id */
export async function deleteMrpRun(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  try {
    await prisma.mrpRun.delete({ where: { id } });
    res.json({ success: true });
  } catch {
    res.status(503).json({ error: 'Erro ao excluir registro de MRP.' });
  }
}

/** GET /api/mrp/runs/:id */
export async function getMrpRun(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  try {
    const run = await prisma.mrpRun.findUnique({
      where: { id },
      include: { _count: { select: { rows: true } } },
    });
    if (!run) {
      res.status(404).json({ error: 'MRP não encontrado.' });
      return;
    }
    const status = String(run.status ?? '').trim();
    if (!isMrpRunStatus(status)) {
      run.status = 'ERRO';
    }
    res.json({ data: runToResponse(run) });
  } catch {
    res.status(503).json({ error: 'Erro ao carregar metadados do MRP.' });
  }
}

/** GET /api/mrp/runs/:id/rows */
export async function getMrpRunRows(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  try {
    const rows = await prisma.mrpSnapshotRow.findMany({
      where: { run_id: id },
      orderBy: { id: 'asc' },
      select: { row_json: true },
    });
    const data = rows.map((r) => {
      try {
        return JSON.parse(r.row_json) as Record<string, unknown>;
      } catch {
        return {};
      }
    });
    res.json({ data });
  } catch {
    res.status(503).json({ error: 'Erro ao carregar snapshot do MRP.' });
  }
}
