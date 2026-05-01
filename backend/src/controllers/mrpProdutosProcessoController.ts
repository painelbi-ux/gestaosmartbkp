import path from 'path';
import fs from 'fs';
import type { Request, Response } from 'express';
import XLSX from 'xlsx';

type ProdutoProcessoRow = {
  id: number;
  codigoProdutoPai: string;
  descricaoProdutoPai: string;
  codigoProduto: string;
  descricaoProduto: string;
  qtdeUtilizada: number | null;
  origem: string;
};

type CacheExcel = {
  mtimeMs: number;
  data: ProdutoProcessoRow[];
};

const DEFAULT_EXCEL_PATH = 'C:/Users/Administrator/Desktop/Banco de dados camasi.xlsx';
let cache: CacheExcel | null = null;

function normalizarTexto(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function normalizarNumero(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = normalizarTexto(value).replace(/\./g, '').replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function resolverExcelPath(): string {
  const envPath = process.env.MRP_PRODUTOS_PROCESSO_XLSX?.trim();
  if (envPath) return envPath;
  return DEFAULT_EXCEL_PATH;
}

function lerExcel(): ProdutoProcessoRow[] {
  const excelPath = resolverExcelPath();
  if (!fs.existsSync(excelPath)) {
    throw new Error(`Arquivo Excel não encontrado: ${excelPath}`);
  }

  const stat = fs.statSync(excelPath);
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache.data;

  const wb = XLSX.readFile(excelPath, { cellDates: false });
  const sheetName = wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : null;
  if (!ws) throw new Error('A planilha não possui abas para leitura.');

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const data = rows
    .map((row, index) => ({
      id: index + 1,
      codigoProdutoPai: normalizarTexto(row['Código do produto PAI']),
      descricaoProdutoPai: normalizarTexto(row['Descrição do produto PAI']),
      codigoProduto: normalizarTexto(row['Código do produto']),
      descricaoProduto: normalizarTexto(row['Descrição do produto (Nomus)']),
      qtdeUtilizada: normalizarNumero(row['Qtde utilizada']),
      origem: normalizarTexto(row['Coluna2']),
    }))
    .filter(
      (row) =>
        row.codigoProdutoPai ||
        row.descricaoProdutoPai ||
        row.codigoProduto ||
        row.descricaoProduto ||
        row.qtdeUtilizada != null ||
        row.origem
    );

  cache = { mtimeMs: stat.mtimeMs, data };
  return data;
}

function contem(value: string, filtro: string): boolean {
  const f = filtro.trim().toLowerCase();
  if (!f) return true;
  return value.toLowerCase().includes(f);
}

export function getMrpProdutosProcesso(req: Request, res: Response): void {
  try {
    const allRows = lerExcel();
    const codigoPai = normalizarTexto(req.query.codigo_pai);
    const descricaoPai = normalizarTexto(req.query.descricao_pai);
    const codigoProduto = normalizarTexto(req.query.codigo_produto);
    const descricaoProduto = normalizarTexto(req.query.descricao_produto);
    const origem = normalizarTexto(req.query.origem);

    const filtered = allRows.filter(
      (row) =>
        contem(row.codigoProdutoPai, codigoPai) &&
        contem(row.descricaoProdutoPai, descricaoPai) &&
        contem(row.codigoProduto, codigoProduto) &&
        contem(row.descricaoProduto, descricaoProduto) &&
        contem(row.origem, origem)
    );

    res.json({
      data: filtered,
      total: filtered.length,
      source: path.basename(resolverExcelPath()),
      updatedAt: new Date(fs.statSync(resolverExcelPath()).mtimeMs).toISOString(),
    });
  } catch (e) {
    res.status(503).json({
      error: e instanceof Error ? e.message : 'Erro ao carregar produtos em processo.',
    });
  }
}
