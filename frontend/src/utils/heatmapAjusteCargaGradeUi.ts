import type { TooltipDetalheRow } from '../api/pedidos';
import {
  chaveExclusaoItem,
  getPendenteConsiderar,
  getQtdePendenteReal,
} from './heatmapRoteiroSimulacao';
import type { AjustesQtdeSimulacao } from './heatmapRoteiroSimulacao';

export const COL_WIDTH_STORAGE_KEY = 'heatmap_ajuste_carga_col_widths_v1';
export const EDIT_COL_PENDENTE = 'pendenteConsiderar';

export const DEFAULT_COL_WIDTHS: Record<string, number> = {
  rm: 44,
  rota: 128,
  dataEmissao: 76,
  pedido: 68,
  codigo: 60,
  produto: 112,
  qtdePendenteReal: 80,
  pendenteConsiderar: 96,
  valorPendente: 88,
};

const MIN_COL_W = 40;
const MAX_COL_W = 420;

export function readColWidths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(COL_WIDTH_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COL_WIDTHS };
    const p = JSON.parse(raw) as Record<string, number>;
    const out = { ...DEFAULT_COL_WIDTHS };
    for (const k of Object.keys(DEFAULT_COL_WIDTHS)) {
      const w = p[k];
      if (typeof w === 'number' && Number.isFinite(w)) {
        out[k] = Math.min(MAX_COL_W, Math.max(MIN_COL_W, Math.round(w)));
      }
    }
    return out;
  } catch {
    return { ...DEFAULT_COL_WIDTHS };
  }
}

export function persistColWidths(widths: Record<string, number>): void {
  try {
    localStorage.setItem(COL_WIDTH_STORAGE_KEY, JSON.stringify(widths));
  } catch {
    /* quota / privado */
  }
}

export function clampColWidth(w: number): number {
  return Math.min(MAX_COL_W, Math.max(MIN_COL_W, Math.round(w)));
}

export function escapeSelectorAttr(s: string): string {
  return typeof window.CSS?.escape === 'function'
    ? window.CSS.escape(s)
    : s.replace(/[^\w-]/g, (c) => `\\${c}`);
}

export function focusPendenteInput(rowKey: string): void {
  const el = document.querySelector<HTMLInputElement>(
    `[data-editinput][data-rowkey="${escapeSelectorAttr(rowKey)}"][data-colkey="${EDIT_COL_PENDENTE}"]`
  );
  if (el && !el.disabled) {
    el.focus();
    el.select();
  }
}

/** Valor exibido no input quando não está em edição local. */
export function formatQtdeParaInput(qtde: number): string {
  if (!Number.isFinite(qtde) || qtde <= 0) return '';
  if (Math.abs(qtde - Math.round(qtde)) < 1e-6) return String(Math.round(qtde));
  return String(qtde);
}

export function parseQtdeDigitada(raw: string): { ok: true; value: number } | { ok: false } {
  const trimmed = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (trimmed === '') return { ok: true, value: 0 };
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: Math.max(0, n) };
}

export type CommitPendenteResult =
  | { type: 'none' }
  | { type: 'exclude'; exKey: string }
  | { type: 'set'; exKey: string; qtde: number }
  | { type: 'clear_adjust'; exKey: string }
  | { type: 'include'; exKey: string };

export function avaliarCommitPendenteConsiderar(
  raw: string,
  exKey: string,
  qtdeReal: number,
  excluida: boolean
): CommitPendenteResult[] {
  const parsed = parseQtdeDigitada(raw);
  if (!parsed.ok) return [{ type: 'none' }];

  const actions: CommitPendenteResult[] = [];
  const isZeroOrEmpty = parsed.value <= 0;

  if (isZeroOrEmpty) {
    actions.push({ type: 'clear_adjust', exKey });
    if (!excluida) actions.push({ type: 'exclude', exKey });
    return actions;
  }

  if (Math.abs(parsed.value - qtdeReal) < 1e-9) {
    actions.push({ type: 'clear_adjust', exKey });
  } else {
    actions.push({ type: 'set', exKey, qtde: parsed.value });
  }
  if (excluida) actions.push({ type: 'include', exKey });
  return actions;
}

export function qtdeConsolidada(
  row: TooltipDetalheRow,
  municipioChave: string,
  ajustes: AjustesQtdeSimulacao
): number {
  return getPendenteConsiderar(row, municipioChave, ajustes);
}

export function rowKeyFromExKey(exKey: string): string {
  return exKey;
}

export function exKeyFromRow(municipioChave: string, row: TooltipDetalheRow): string {
  return chaveExclusaoItem(municipioChave, row);
}
