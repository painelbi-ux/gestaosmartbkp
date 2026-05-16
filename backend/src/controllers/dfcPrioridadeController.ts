/**
 * DFC — endpoints CRUD da priorização de pagamento (plano de contas + lançamento).
 * Todas as rotas requerem `financeiro.ver` (configurado no Router).
 */

import type { Request, Response } from 'express';
import {
  DFC_PRIORIDADE_LABEL,
  DFC_PRIORIDADES_VALIDAS,
  ehDfcPrioridadeValida,
  ehTipoRefValido,
  type DfcPrioridade,
  type DfcTipoRefLancamento,
} from '../data/dfcPrioridadeConstantes.js';
import {
  deletePrioridadeConta,
  deletePrioridadeContaLote,
  deletePrioridadeLancamento,
  deletePrioridadeLancamentoLote,
  listarPrioridadesConta,
  listarPrioridadesLancamento,
  upsertPrioridadeConta,
  upsertPrioridadeContaLote,
  upsertPrioridadeLancamento,
  upsertPrioridadeLancamentoLote,
} from '../data/dfcPrioridadeRepository.js';

function parseIdEmpresasQuery(q: Request['query']): number[] {
  const raw = String(q.idEmpresas ?? q.idEmpresa ?? '').trim();
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((s) => Math.trunc(Number(s)))
        .filter((n) => Number.isFinite(n) && n > 0)
    ),
  ];
}

function parsePrioridadesQuery(q: Request['query']): DfcPrioridade[] {
  const raw = String(q.prioridades ?? q.prioridade ?? '').trim();
  if (!raw) return [];
  const arr = raw
    .split(/[,;\s]+/)
    .map((s) => Math.trunc(Number(s)))
    .filter((n) => Number.isFinite(n));
  return [...new Set(arr.filter(ehDfcPrioridadeValida))];
}

export function getOpcoesPrioridade(_req: Request, res: Response): void {
  res.json({
    opcoes: DFC_PRIORIDADES_VALIDAS.map((p) => ({
      valor: p,
      rotulo: DFC_PRIORIDADE_LABEL[p],
    })),
  });
}

// ── Plano de contas ─────────────────────────────────────────────────────────

export async function listPrioridadesConta(req: Request, res: Response): Promise<void> {
  const idEmpresas = parseIdEmpresasQuery(req.query);
  const prioridades = parsePrioridadesQuery(req.query);
  try {
    const linhas = await listarPrioridadesConta({ idEmpresas, prioridades });
    res.json({ linhas });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcPrioridadeController] listPrioridadesConta:', msg);
    res.status(503).json({ erro: msg });
  }
}

export async function putPrioridadeConta(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as {
    idEmpresa?: unknown;
    idContaFinanceiro?: unknown;
    prioridade?: unknown;
    observacao?: unknown;
  };
  const idEmpresa = Math.trunc(Number(body.idEmpresa));
  const idContaFinanceiro = Math.trunc(Number(body.idContaFinanceiro));
  const prioridade = Math.trunc(Number(body.prioridade));
  const observacao =
    typeof body.observacao === 'string' && body.observacao.trim().length > 0
      ? body.observacao.trim().slice(0, 500)
      : null;

  if (!Number.isFinite(idEmpresa) || idEmpresa <= 0) {
    res.status(400).json({ erro: 'idEmpresa inválido.' });
    return;
  }
  if (!Number.isFinite(idContaFinanceiro) || idContaFinanceiro <= 0) {
    res.status(400).json({ erro: 'idContaFinanceiro inválido.' });
    return;
  }
  if (!ehDfcPrioridadeValida(prioridade)) {
    res.status(400).json({ erro: 'prioridade deve ser 1, 2, 3 ou 4.' });
    return;
  }

  const usuario = req.user?.login ?? 'desconhecido';
  try {
    const linha = await upsertPrioridadeConta({
      idEmpresa,
      idContaFinanceiro,
      prioridade,
      observacao,
      usuario,
    });
    res.json({ linha });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcPrioridadeController] putPrioridadeConta:', msg);
    res.status(503).json({ erro: msg });
  }
}

export async function deletePrioridadeContaCtrl(req: Request, res: Response): Promise<void> {
  const idEmpresa = Math.trunc(Number(req.params.idEmpresa));
  const idContaFinanceiro = Math.trunc(Number(req.params.idContaFinanceiro));
  if (!Number.isFinite(idEmpresa) || idEmpresa <= 0 || !Number.isFinite(idContaFinanceiro) || idContaFinanceiro <= 0) {
    res.status(400).json({ erro: 'idEmpresa/idContaFinanceiro inválidos.' });
    return;
  }
  try {
    const ok = await deletePrioridadeConta(idEmpresa, idContaFinanceiro);
    res.json({ removido: ok });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcPrioridadeController] deletePrioridadeConta:', msg);
    res.status(503).json({ erro: msg });
  }
}

export async function postPrioridadeContaLote(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as {
    itens?: unknown;
    prioridade?: unknown;
    observacao?: unknown;
    /** Quando true, em vez de classificar remove a classificação dos itens informados. */
    remover?: unknown;
  };
  const remover = body.remover === true;
  const prioridade = Math.trunc(Number(body.prioridade));
  const observacao =
    typeof body.observacao === 'string' && body.observacao.trim().length > 0
      ? body.observacao.trim().slice(0, 500)
      : null;

  if (!Array.isArray(body.itens) || body.itens.length === 0) {
    res.status(400).json({ erro: 'itens deve ser um array não vazio.' });
    return;
  }

  if (!remover && !ehDfcPrioridadeValida(prioridade)) {
    res.status(400).json({ erro: 'prioridade deve ser 1, 2, 3 ou 4.' });
    return;
  }

  const itens: Array<{ idEmpresa: number; idContaFinanceiro: number }> = [];
  for (const raw of body.itens) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as { idEmpresa?: unknown; idContaFinanceiro?: unknown };
    const idEmpresa = Math.trunc(Number(r.idEmpresa));
    const idContaFinanceiro = Math.trunc(Number(r.idContaFinanceiro));
    if (Number.isFinite(idEmpresa) && idEmpresa > 0 && Number.isFinite(idContaFinanceiro) && idContaFinanceiro > 0) {
      itens.push({ idEmpresa, idContaFinanceiro });
    }
  }
  if (itens.length === 0) {
    res.status(400).json({ erro: 'Nenhum item válido informado.' });
    return;
  }

  const usuario = req.user?.login ?? 'desconhecido';
  try {
    if (remover) {
      const n = await deletePrioridadeContaLote({ itens });
      res.json({ removidos: n });
    } else {
      const n = await upsertPrioridadeContaLote({
        itens,
        prioridade: prioridade as DfcPrioridade,
        observacao,
        usuario,
      });
      res.json({ atualizados: n });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcPrioridadeController] postPrioridadeContaLote:', msg);
    res.status(503).json({ erro: msg });
  }
}

// ── Lançamento (agendamento ou lançamento direto) ──────────────────────────

export async function listPrioridadesLancamento(req: Request, res: Response): Promise<void> {
  const idEmpresas = parseIdEmpresasQuery(req.query);
  const prioridades = parsePrioridadesQuery(req.query);
  const tipoRefRaw = String(req.query.tipoRef ?? '').trim();
  const tipoRef = ehTipoRefValido(tipoRefRaw) ? (tipoRefRaw as DfcTipoRefLancamento) : undefined;
  const idsRefRaw = String(req.query.idsRef ?? '').trim();
  const idsRef = idsRefRaw
    ? [
        ...new Set(
          idsRefRaw
            .split(/[,;\s]+/)
            .map((s) => Math.trunc(Number(s)))
            .filter((n) => Number.isFinite(n) && n > 0)
        ),
      ]
    : undefined;
  const idsContaRaw = String(req.query.idsContaFinanceiro ?? '').trim();
  const idsContaFinanceiro = idsContaRaw
    ? [
        ...new Set(
          idsContaRaw
            .split(/[,;\s]+/)
            .map((s) => Math.trunc(Number(s)))
            .filter((n) => Number.isFinite(n) && n > 0)
        ),
      ]
    : undefined;

  try {
    const linhas = await listarPrioridadesLancamento({
      idEmpresas,
      tipoRef,
      idsRef,
      prioridades,
      idsContaFinanceiro,
    });
    res.json({ linhas });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcPrioridadeController] listPrioridadesLancamento:', msg);
    res.status(503).json({ erro: msg });
  }
}

export async function putPrioridadeLancamento(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as {
    idEmpresa?: unknown;
    tipoRef?: unknown;
    idRef?: unknown;
    idContaFinanceiro?: unknown;
    prioridade?: unknown;
    observacao?: unknown;
  };
  const idEmpresa = Math.trunc(Number(body.idEmpresa));
  const idRef = Math.trunc(Number(body.idRef));
  const prioridade = Math.trunc(Number(body.prioridade));
  const tipoRef = body.tipoRef;
  const idContaFinanceiroRaw = Number(body.idContaFinanceiro);
  const idContaFinanceiro = Number.isFinite(idContaFinanceiroRaw) && idContaFinanceiroRaw > 0
    ? Math.trunc(idContaFinanceiroRaw)
    : null;
  const observacao =
    typeof body.observacao === 'string' && body.observacao.trim().length > 0
      ? body.observacao.trim().slice(0, 500)
      : null;

  if (!Number.isFinite(idEmpresa) || idEmpresa <= 0) {
    res.status(400).json({ erro: 'idEmpresa inválido.' });
    return;
  }
  if (!ehTipoRefValido(tipoRef)) {
    res.status(400).json({ erro: 'tipoRef deve ser "A" (agendamento) ou "L" (lançamento direto).' });
    return;
  }
  if (!Number.isFinite(idRef) || idRef <= 0) {
    res.status(400).json({ erro: 'idRef inválido.' });
    return;
  }
  if (!ehDfcPrioridadeValida(prioridade)) {
    res.status(400).json({ erro: 'prioridade deve ser 1, 2, 3 ou 4.' });
    return;
  }

  const usuario = req.user?.login ?? 'desconhecido';
  try {
    const linha = await upsertPrioridadeLancamento({
      idEmpresa,
      tipoRef,
      idRef,
      idContaFinanceiro,
      prioridade,
      observacao,
      usuario,
    });
    res.json({ linha });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcPrioridadeController] putPrioridadeLancamento:', msg);
    res.status(503).json({ erro: msg });
  }
}

export async function deletePrioridadeLancamentoCtrl(req: Request, res: Response): Promise<void> {
  const idEmpresa = Math.trunc(Number(req.params.idEmpresa));
  const tipoRef = req.params.tipoRef;
  const idRef = Math.trunc(Number(req.params.idRef));
  if (!Number.isFinite(idEmpresa) || idEmpresa <= 0 || !ehTipoRefValido(tipoRef) || !Number.isFinite(idRef) || idRef <= 0) {
    res.status(400).json({ erro: 'Parâmetros inválidos.' });
    return;
  }
  try {
    const ok = await deletePrioridadeLancamento(idEmpresa, tipoRef as DfcTipoRefLancamento, idRef);
    res.json({ removido: ok });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcPrioridadeController] deletePrioridadeLancamento:', msg);
    res.status(503).json({ erro: msg });
  }
}

export async function postPrioridadeLancamentoLote(req: Request, res: Response): Promise<void> {
  const body = (req.body ?? {}) as {
    itens?: unknown;
    prioridade?: unknown;
    observacao?: unknown;
    remover?: unknown;
  };
  const remover = body.remover === true;
  const prioridade = Math.trunc(Number(body.prioridade));
  const observacao =
    typeof body.observacao === 'string' && body.observacao.trim().length > 0
      ? body.observacao.trim().slice(0, 500)
      : null;

  if (!Array.isArray(body.itens) || body.itens.length === 0) {
    res.status(400).json({ erro: 'itens deve ser um array não vazio.' });
    return;
  }
  if (!remover && !ehDfcPrioridadeValida(prioridade)) {
    res.status(400).json({ erro: 'prioridade deve ser 1, 2, 3 ou 4.' });
    return;
  }

  const itens: Array<{ idEmpresa: number; tipoRef: DfcTipoRefLancamento; idRef: number; idContaFinanceiro?: number | null }> = [];
  for (const raw of body.itens) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as { idEmpresa?: unknown; tipoRef?: unknown; idRef?: unknown; idContaFinanceiro?: unknown };
    const idEmpresa = Math.trunc(Number(r.idEmpresa));
    const idRef = Math.trunc(Number(r.idRef));
    const idContaRaw = Number(r.idContaFinanceiro);
    const idContaFinanceiro =
      Number.isFinite(idContaRaw) && idContaRaw > 0 ? Math.trunc(idContaRaw) : null;
    if (
      Number.isFinite(idEmpresa) &&
      idEmpresa > 0 &&
      ehTipoRefValido(r.tipoRef) &&
      Number.isFinite(idRef) &&
      idRef > 0
    ) {
      itens.push({ idEmpresa, tipoRef: r.tipoRef as DfcTipoRefLancamento, idRef, idContaFinanceiro });
    }
  }
  if (itens.length === 0) {
    res.status(400).json({ erro: 'Nenhum item válido informado.' });
    return;
  }

  const usuario = req.user?.login ?? 'desconhecido';
  try {
    if (remover) {
      const n = await deletePrioridadeLancamentoLote({ itens });
      res.json({ removidos: n });
    } else {
      const n = await upsertPrioridadeLancamentoLote({
        itens,
        prioridade: prioridade as DfcPrioridade,
        observacao,
        usuario,
      });
      res.json({ atualizados: n });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[dfcPrioridadeController] postPrioridadeLancamentoLote:', msg);
    res.status(503).json({ erro: msg });
  }
}
