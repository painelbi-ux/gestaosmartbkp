/**
 * Exportação da grade MPP para XLSX (mesmas colunas exibidas na tela).
 */
import * as XLSX from 'xlsx';
import type { MppRow } from '../api/mpp';

export type MppExportColumn = { key: string; label: string; integer?: boolean; decimal?: number };

function formatPrevisaoExport(raw: unknown): string {
  if (raw == null || raw === '') return '';
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    if (d && m && y) return `${d}/${m}/${y}`;
  }
  return s;
}

function cellValue(row: MppRow, col: MppExportColumn): string | number {
  let raw: unknown;
  if (col.key === 'dataPrevisao') raw = row.dataPrevisao ?? row.DataPrevisao;
  else raw = row[col.key];

  if (raw == null || raw === '') return '';

  if (col.key === 'dataPrevisao') return formatPrevisaoExport(raw);

  if (typeof col.decimal === 'number') {
    const n = Number(raw);
    return Number.isNaN(n) ? '' : n;
  }
  if (col.integer) {
    const n = Number(raw);
    return Number.isNaN(n) ? '' : Math.round(n);
  }

  return String(raw);
}

export function downloadMppGradeXlsx(rows: MppRow[], columns: MppExportColumn[], filename: string): void {
  const header = columns.map((c) => c.label);
  const body = rows.map((row) => columns.map((col) => cellValue(row, col)));
  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'MPP');
  XLSX.writeFile(wb, filename);
}
