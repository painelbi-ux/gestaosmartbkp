import type { TooltipDetalheRow } from '../api/pedidos';
import { compareRowsBySortLevels, type SortLevel } from '../hooks/useGradeFiltrosExcel';
import {
  getPendenteConsiderar,
  itemEstaExcluido,
  labelRotaParada,
  valorVendaEfetivoLinha,
  type AjustesQtdeSimulacao,
  type SelecionadoComChave,
} from './heatmapRoteiroSimulacao';
import type { RoteiroResultado } from './heatmapRoteirizador';
import { fmtBrlRoteiro } from './heatmapRoteiroRelatorio';
import { formatQtdeParaInput } from './heatmapAjusteCargaGradeUi';

/** Classificação padrão ao abrir o modal Ajustar carga. */
export const SORT_DEFAULT_MODAL_CARGA: SortLevel[] = [
  { id: 'rota', dir: 'asc' },
  { id: 'dataEmissao', dir: 'asc' },
  { id: 'pedido', dir: 'asc' },
  { id: 'produto', dir: 'asc' },
];

/** Classificação dos itens no PDF (por cidade). */
export const SORT_PDF_ITENS_CIDADE: SortLevel[] = [
  { id: 'dataEmissao', dir: 'asc' },
  { id: 'pedido', dir: 'asc' },
  { id: 'produto', dir: 'asc' },
];

function formatDataPdf(iso: string): string {
  const s = (iso ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s || '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatPedidoPdf(pedido: string | undefined): string {
  return pedido ? `PD ${String(pedido).replace(/^PD\s*/i, '').trim()}` : '—';
}

function pedidoNumeroSort(row: TooltipDetalheRow): number {
  const raw = String(row.pedido ?? '').replace(/^PD\s*/i, '').trim();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : 0;
}

export function valueForSortCargaRow(row: TooltipDetalheRow, colId: string): string | number {
  switch (colId) {
    case 'dataEmissao':
      return (row.dataEmissao ?? '').trim() || '';
    case 'pedido':
      return pedidoNumeroSort(row);
    case 'produto':
      return (row.produto ?? '').trim().toLowerCase();
    case 'rota':
      return (row.rota ?? '').trim().toLowerCase();
    default:
      return '';
  }
}

export function ordenarItensCarga<T extends TooltipDetalheRow>(rows: T[], levels: SortLevel[]): T[] {
  if (levels.length === 0) return rows;
  return [...rows].sort((a, b) => compareRowsBySortLevels(a, b, levels, valueForSortCargaRow));
}

export type SecaoCargaPdf = {
  seqParada: number;
  labelCidade: string;
  municipioChave: string;
  itens: TooltipDetalheRow[];
};

/** Cidades na ordem de entrega; itens incluídos na simulação (sem checkbox excluído). */
export function montarSecoesCargaPdf(
  selecionados: SelecionadoComChave[],
  resultado: RoteiroResultado,
  exclusoes: ReadonlySet<string>,
  ajustes?: AjustesQtdeSimulacao
): SecaoCargaPdf[] {
  const porLabel = new Map<string, SelecionadoComChave>();
  for (const s of selecionados) {
    porLabel.set(labelRotaParada(s.item), s);
  }

  const secoes: SecaoCargaPdf[] = [];
  resultado.pernas.forEach((perna, idx) => {
    const sel = porLabel.get(perna.para);
    if (!sel) return;
    const detalhes = sel.item.detalhes ?? [];
    const incluidos = detalhes.filter((row) => !itemEstaExcluido(sel.chave, row, exclusoes));
    const itens = ordenarItensCarga(incluidos, SORT_PDF_ITENS_CIDADE);
    if (itens.length === 0) return;
    secoes.push({
      seqParada: idx + 1,
      labelCidade: perna.para,
      municipioChave: sel.chave,
      itens,
    });
  });
  return secoes;
}

export type LinhaTabelaCargaPdf = string[];

export function linhaTabelaCargaPdf(
  row: TooltipDetalheRow,
  municipioChave: string,
  ajustes?: AjustesQtdeSimulacao
): LinhaTabelaCargaPdf {
  const qtde = getPendenteConsiderar(row, municipioChave, ajustes);
  return [
    formatDataPdf(row.dataEmissao ?? ''),
    formatPedidoPdf(row.pedido),
    row.codigo || '—',
    row.produto || '—',
    qtde > 0 ? formatQtdeParaInput(qtde) : '0',
    fmtBrlRoteiro(valorVendaEfetivoLinha(row, municipioChave, ajustes)),
  ];
}

export function totalValorSecaoCargaPdf(
  sec: SecaoCargaPdf,
  ajustes?: AjustesQtdeSimulacao
): number {
  return sec.itens.reduce(
    (s, row) => s + valorVendaEfetivoLinha(row, sec.municipioChave, ajustes),
    0
  );
}

export function linhaTotalSecaoCargaPdf(
  sec: SecaoCargaPdf,
  ajustes?: AjustesQtdeSimulacao
): LinhaTabelaCargaPdf {
  return ['', '', '', 'Total', '', fmtBrlRoteiro(totalValorSecaoCargaPdf(sec, ajustes))];
}

export type LinhaConsolidadoProdutoPdf = {
  codigo: string;
  descricao: string;
  qtde: number;
};

/** Soma qtde considerada por código de produto em todas as paradas. */
export function consolidarProdutosCargaPdf(
  secoes: SecaoCargaPdf[],
  ajustes?: AjustesQtdeSimulacao
): LinhaConsolidadoProdutoPdf[] {
  const map = new Map<string, LinhaConsolidadoProdutoPdf>();
  for (const sec of secoes) {
    for (const row of sec.itens) {
      const codigo = (row.codigo ?? '').trim() || '—';
      const descricao = (row.produto ?? '').trim() || '—';
      const qtde = getPendenteConsiderar(row, sec.municipioChave, ajustes);
      const prev = map.get(codigo);
      if (prev) prev.qtde += qtde;
      else map.set(codigo, { codigo, descricao, qtde });
    }
  }
  return [...map.values()].sort((a, b) =>
    a.descricao.localeCompare(b.descricao, 'pt-BR', { sensitivity: 'base' })
  );
}

export const HEAD_CARGA_PDF = [
  'Emissão',
  'PD',
  'Cód.',
  'Descrição',
  'Qtde considerada',
  'Valor',
];

export const HEAD_CONSOLIDADO_PRODUTO_PDF = ['Cód.', 'Descrição', 'Qtde considerada'];
