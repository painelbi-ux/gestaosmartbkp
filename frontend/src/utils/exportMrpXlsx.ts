/**
 * Exportação da grade MRP para XLSX: mesmas colunas visíveis, filtros aplicados,
 * horizonte (Consumo / Saldo Estoque / Entrada / Necessidade) quando carregado.
 * Números e datas no estilo usado no app (pt-BR / dd/mm/aaaa).
 */
import { Workbook } from 'exceljs';
import type { MrpHorizonteLinha, MrpHorizonteResponse, MrpRow } from '../api/mrp';
import {
  codigoChave,
  empenhoHorizonteUltimoDiaNum,
  numCampoMRP,
  parseDataMRP,
  primeiraDataRupturaParaRow,
  qtdeAComprarHorizonte,
  qtdeAComprarHorizonteValor,
  saldosENecessidadesHorizonte,
  statusHorizonteParaLinha,
} from './mrpHorizonteDerivados';

const DATE_FMT = 'dd/mm/yyyy';
const NUM_DEC2 = '#,##0.00';
const NUM_INT = '#,##0';

export type MrpExportColumn = {
  key: keyof MrpRow;
  label: string;
  integer?: boolean;
};

function colLetter(col: number): string {
  let s = '';
  let c = col;
  while (c >= 0) {
    s = String.fromCharCode((c % 26) + 65) + s;
    c = Math.floor(c / 26) - 1;
  }
  return s;
}

function formatIsoParaBr(iso: string): string {
  const s = iso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return iso;
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

/** Serial Excel (só data, meia-noite local). */
function toExcelDateSerial(value: Date): number {
  const localMidnight = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const excelEpoch = new Date(1899, 11, 30);
  return Math.round((localMidnight.getTime() - excelEpoch.getTime()) / (24 * 60 * 60 * 1000));
}

function excelDateFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const s = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return toExcelDateSerial(new Date(y, m - 1, d));
}

function excelDateFromField(val: unknown): number | null {
  const iso = parseDataMRP(val);
  return excelDateFromIso(iso);
}

function celulaSimples(val: unknown, asInteger?: boolean): string {
  if (val == null) return '—';
  if (asInteger) {
    const n = Number(val);
    if (Number.isNaN(n)) return '—';
    return String(Math.round(n));
  }
  if (typeof val === 'object') return String(val);
  return String(val);
}

function horizonteCalcParaRow(row: MrpRow, linhaH: MrpHorizonteLinha | undefined) {
  if (!linhaH?.dias?.length) return null;
  const saldo0 = numCampoMRP(row.estoque);
  return saldosENecessidadesHorizonte(linhaH.dias, { saldoInicialPrimeiroDia: saldo0 });
}

function fixedColumnCell(
  row: MrpRow,
  col: MrpExportColumn,
  linhaH: MrpHorizonteLinha | undefined,
  empenhoMppNum: number | undefined
): { value: string | number | null; numFmt?: string } {
  const hc = horizonteCalcParaRow(row, linhaH);
  const isoRup = linhaH ? primeiraDataRupturaParaRow(linhaH, row) : null;

  const statusTxt = statusHorizonteParaLinha(row, linhaH, linhaH ? isoRup : undefined);
  const qtdeTxt = qtdeAComprarHorizonte(statusTxt, linhaH, hc?.nAcum);
  const empenhoTotalNum = empenhoMppNum != null && Number.isFinite(empenhoMppNum) ? empenhoMppNum : null;
  const empenhoHorizNum = linhaH ? empenhoHorizonteUltimoDiaNum(linhaH) : null;

  const k = col.key;

  if (k === 'dataRuptura') {
    if (!isoRup) return { value: '—' };
    const serial = excelDateFromIso(isoRup);
    if (serial == null) return { value: formatIsoParaBr(isoRup) };
    return { value: serial, numFmt: DATE_FMT };
  }

  if (k === 'statusHorizonte') return { value: statusTxt };

  if (k === 'qtdeAComprar') {
    if (qtdeTxt === '—') return { value: '—' };
    const n = qtdeAComprarHorizonteValor(statusTxt, linhaH, hc?.nAcum);
    if (n == null || !Number.isFinite(n)) return { value: qtdeTxt };
    return { value: n, numFmt: NUM_DEC2 };
  }

  if (k === 'empenhoTotal') {
    if (empenhoTotalNum == null) return { value: '—' };
    return { value: empenhoTotalNum, numFmt: NUM_DEC2 };
  }

  if (k === 'empenhoHorizonte') {
    if (empenhoHorizNum == null) return { value: '—' };
    return { value: empenhoHorizNum, numFmt: NUM_DEC2 };
  }

  if (k === 'dataNecessidade' || k === 'dataEntrega') {
    const serial = excelDateFromField(row[k]);
    if (serial != null) return { value: serial, numFmt: DATE_FMT };
    return { value: celulaSimples(row[k], false) };
  }

  if (col.integer) {
    const raw = row[k];
    if (raw == null || raw === '') return { value: '—' };
    const n = numCampoMRP(raw);
    if (!Number.isFinite(n)) return { value: '—' };
    return { value: Math.round(n), numFmt: NUM_INT };
  }

  return { value: celulaSimples(row[k], false) };
}

export async function downloadMrpXlsx(
  params: {
    rows: MrpRow[];
    columns: MrpExportColumn[];
    horizonte: MrpHorizonteResponse | null;
    horizontePorCodigo: Map<string, MrpHorizonteLinha>;
    mppQtdePorCodigo: Record<string, number>;
  },
  filename: string
): Promise<void> {
  const { rows, columns, horizonte, horizontePorCodigo, mppQtdePorCodigo } = params;
  const temHorizonte = Boolean(horizonte && horizonte.datas.length > 0);
  const datas = temHorizonte ? horizonte!.datas : [];

  const wb = new Workbook();
  const ws = wb.addWorksheet('MRP', {
    views: [{ state: 'frozen', ySplit: temHorizonte ? 2 : 1 }],
  });

  const nFix = columns.length;
  const nHorizCols = temHorizonte ? datas.length * 4 : 0;

  const headerRows = temHorizonte ? 2 : 1;
  const dataStartRow = headerRows + 1;

  let c = 0;
  for (; c < nFix; c++) {
    const col = columns[c];
    const L = colLetter(c);
    if (temHorizonte) {
      ws.mergeCells(`${L}1:${L}2`);
    }
    const cell = ws.getCell(1, c + 1);
    cell.value = col.label;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  }

  if (temHorizonte) {
    for (let di = 0; di < datas.length; di++) {
      const d = datas[di];
      const c0 = nFix + di * 4;
      const L0 = colLetter(c0);
      const L3 = colLetter(c0 + 3);
      ws.mergeCells(`${L0}1:${L3}1`);
      const h = ws.getCell(1, c0 + 1);
      h.value = formatIsoParaBr(d);
      h.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      h.alignment = { horizontal: 'center', vertical: 'middle' };
      h.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD97706' },
      };

      const sub = ['Consumo', 'Saldo Estoque', 'Entrada', 'Necessidade'];
      for (let j = 0; j < 4; j++) {
        const cell = ws.getCell(2, c0 + j + 1);
        cell.value = sub[j];
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF59E0B' },
        };
      }
    }
  }

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const r = dataStartRow + ri;
    const chave = codigoChave(row);
    const linhaH = chave ? horizontePorCodigo.get(chave) : undefined;
    const empenhoMpp = chave ? mppQtdePorCodigo[chave.trim()] : undefined;

    for (let ci = 0; ci < columns.length; ci++) {
      const col = columns[ci];
      const out = fixedColumnCell(row, col, linhaH, empenhoMpp);
      const cell = ws.getCell(r, ci + 1);
      cell.value = out.value === null ? '' : out.value;
      if (out.numFmt) cell.numFmt = out.numFmt;
    }

    if (temHorizonte) {
      const hcRow = horizonteCalcParaRow(row, linhaH);
      const saldosEf = hcRow?.saldosEf ?? [];
      const nAcum = hcRow?.nAcum ?? [];

      for (let di = 0; di < datas.length; di++) {
        const base = nFix + di * 4;
        const L0 = colLetter(base);
        const L3 = colLetter(base + 3);
        if (!linhaH) {
          ws.mergeCells(`${L0}${r}:${L3}${r}`);
          const mc = ws.getCell(r, base + 1);
          mc.value = '—';
          mc.alignment = { horizontal: 'center', vertical: 'middle' };
          continue;
        }
        const cel = linhaH.dias[di];
        if (cel) {
          const nVal = nAcum[di] ?? 0;
          ws.getCell(r, base + 1).value = cel.consumo;
          ws.getCell(r, base + 1).numFmt = NUM_DEC2;
          ws.getCell(r, base + 2).value = saldosEf[di] ?? 0;
          ws.getCell(r, base + 2).numFmt = NUM_DEC2;
          ws.getCell(r, base + 3).value = cel.entrada;
          ws.getCell(r, base + 3).numFmt = NUM_DEC2;
          ws.getCell(r, base + 4).value = nVal;
          ws.getCell(r, base + 4).numFmt = NUM_DEC2;
        } else {
          for (let j = 0; j < 4; j++) {
            const cell = ws.getCell(r, base + j + 1);
            cell.value = 0;
            cell.numFmt = NUM_DEC2;
          }
        }
      }
    }
  }

  for (let i = 0; i < nFix + nHorizCols; i++) {
    ws.getColumn(i + 1).width = i < nFix ? 16 : 14;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
