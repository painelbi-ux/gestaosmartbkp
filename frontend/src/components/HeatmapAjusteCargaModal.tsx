import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import {
  obterDetalhesMapaMunicipio,
  type FiltrosPedidos,
  type MapaMunicipioItem,
  type TooltipDetalheRow,
} from '../api/pedidos';
import {
  chaveExclusaoItem,
  getPendenteConsiderar,
  getQtdePendenteReal,
  itemEstaExcluido,
  totalVendaMunicipioOriginal,
  totalVendaMunicipioSimulado,
  valorExcluidoMunicipio,
  valorVendaEfetivoLinha,
  type AjustesQtdeSimulacao,
} from '../utils/heatmapRoteiroSimulacao';
import { fmtBrlRoteiro } from '../utils/heatmapRoteiroRelatorio';
import { useGradeFiltrosExcel } from '../hooks/useGradeFiltrosExcel';
import { SORT_DEFAULT_MODAL_CARGA, valueForSortCargaRow } from '../utils/heatmapRoteiroCargaSort';
import GradeFiltroExcelPortal from './grade/GradeFiltroExcelPortal';
import ModalClassificarGrade, { type ColunaClassificavel } from './grade/ModalClassificarGrade';
import PendenteConsiderarInput from './heatmap/PendenteConsiderarInput';
import {
  clampColWidth,
  focusPendenteInput,
  persistColWidths,
  readColWidths,
  type CommitPendenteResult,
} from '../utils/heatmapAjusteCargaGradeUi';

const MODAL_SIZE_STORAGE_KEY = 'heatmap_ajuste_carga_modal_size';
const MODAL_DEFAULT_W = 1040;
const MODAL_DEFAULT_H = 600;
const MODAL_ASPECT = MODAL_DEFAULT_W / MODAL_DEFAULT_H;
const MODAL_MIN_W = 480;

function readModalSize(): { w: number; h: number } {
  try {
    const raw = localStorage.getItem(MODAL_SIZE_STORAGE_KEY);
    if (!raw) return { w: MODAL_DEFAULT_W, h: MODAL_DEFAULT_H };
    const p = JSON.parse(raw) as { w?: number; h?: number };
    return clampModalSize(p.w ?? MODAL_DEFAULT_W);
  } catch {
    return { w: MODAL_DEFAULT_W, h: MODAL_DEFAULT_H };
  }
}

function clampModalSize(w: number): { w: number; h: number } {
  const maxW = typeof window !== 'undefined' ? Math.min(window.innerWidth * 0.95, 1400) : 1400;
  const maxH = typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.9, 920) : 920;
  let nw = Math.max(MODAL_MIN_W, Math.min(maxW, w));
  let nh = nw / MODAL_ASPECT;
  if (nh > maxH) {
    nh = maxH;
    nw = nh * MODAL_ASPECT;
  }
  const minH = MODAL_MIN_W / MODAL_ASPECT;
  if (nh < minH) {
    nh = minH;
    nw = nh * MODAL_ASPECT;
  }
  return { w: Math.round(nw), h: Math.round(nh) };
}

const COLUNAS_GRADE: ColunaClassificavel[] = [
  { id: 'rm', label: 'RM' },
  { id: 'rota', label: 'Carrada' },
  { id: 'dataEmissao', label: 'Emissão' },
  { id: 'pedido', label: 'PD' },
  { id: 'codigo', label: 'Cód.' },
  { id: 'produto', label: 'Descrição' },
  { id: 'qtdePendenteReal', label: 'Pendente Real' },
  { id: 'pendenteConsiderar', label: 'Pendente Considerar' },
  { id: 'valorPendente', label: 'Venda' },
];

const COLUNAS_NUMERICAS = new Set(['qtdePendenteReal', 'pendenteConsiderar', 'valorPendente']);

/** Cabeçalhos com rótulo longo: quebram linha ao estreitar a coluna. */
const COLUNAS_CABECALHO_QUEBRA = new Set(['qtdePendenteReal', 'pendenteConsiderar']);

const COLUNA_IDS = COLUNAS_GRADE.map((c) => c.id);

function formatDataExibicao(iso: string): string {
  const s = (iso ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s || '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatPedido(pedido: string | undefined): string {
  return pedido ? `PD ${String(pedido).replace(/^PD\s*/i, '').trim()}` : '—';
}

function formatQtde(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n));
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

function criarGetCellText(municipioChave: string, ajustes: AjustesQtdeSimulacao) {
  return (row: TooltipDetalheRow, colId: string): string => {
    switch (colId) {
      case 'rm':
        return row.rm || '—';
      case 'rota':
        return row.rota || '—';
      case 'pedido':
        return formatPedido(row.pedido);
      case 'codigo':
        return row.codigo || '—';
      case 'produto':
        return row.produto || '—';
      case 'dataEmissao':
        return formatDataExibicao(row.dataEmissao ?? '');
      case 'qtdePendenteReal':
        return formatQtde(getQtdePendenteReal(row));
      case 'pendenteConsiderar':
        return formatQtde(getPendenteConsiderar(row, municipioChave, ajustes));
      case 'valorPendente':
        return fmtBrlRoteiro(valorVendaEfetivoLinha(row, municipioChave, ajustes));
      default:
        return '—';
    }
  };
}

function criarValueForSort(municipioChave: string, ajustes: AjustesQtdeSimulacao) {
  const getCellText = criarGetCellText(municipioChave, ajustes);
  return (row: TooltipDetalheRow, colId: string): string | number => {
    if (colId === 'valorPendente') return valorVendaEfetivoLinha(row, municipioChave, ajustes);
    if (colId === 'qtdePendenteReal') return getQtdePendenteReal(row);
    if (colId === 'pendenteConsiderar') return getPendenteConsiderar(row, municipioChave, ajustes);
    if (colId === 'rota' || colId === 'dataEmissao' || colId === 'pedido' || colId === 'produto') {
      return valueForSortCargaRow(row, colId);
    }
    return getCellText(row, colId).toLowerCase();
  };
}

function GradeTh({
  label,
  colId,
  ativo,
  onAbrirFiltro,
  alignRight,
  widthPx,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerEnd,
}: {
  label: string;
  colId: string;
  ativo: boolean;
  onAbrirFiltro: (colId: string, e: React.MouseEvent<HTMLButtonElement>) => void;
  alignRight?: boolean;
  widthPx: number;
  onResizePointerDown: (colId: string, e: React.PointerEvent<HTMLSpanElement>) => void;
  onResizePointerMove: (e: React.PointerEvent<HTMLSpanElement>) => void;
  onResizePointerEnd: (e: React.PointerEvent<HTMLSpanElement>) => void;
}) {
  const cabecalhoQuebra = COLUNAS_CABECALHO_QUEBRA.has(colId);
  const labelClass = cabecalhoQuebra
    ? `min-w-0 flex-1 break-words hyphens-auto whitespace-normal text-[10px] leading-snug sm:text-[11px] ${
        alignRight ? 'text-right' : 'text-left'
      }`
    : `min-w-0 flex-1 truncate text-[10px] leading-tight sm:text-[11px]`;

  return (
    <th
      style={{ width: widthPx, minWidth: widthPx, maxWidth: widthPx }}
      className={`relative border border-slate-600/80 bg-slate-700 py-2 px-1 font-semibold text-white align-top ${
        alignRight ? 'text-right' : 'text-left'
      }`}
    >
      <div
        className={`flex min-w-0 gap-1 pr-1 ${cabecalhoQuebra ? 'items-start' : 'items-center'} ${
          alignRight ? 'justify-end' : ''
        }`}
      >
        <span className={labelClass} title={cabecalhoQuebra ? undefined : label}>
          {label}
        </span>
        <button
          type="button"
          onClick={(e) => onAbrirFiltro(colId, e)}
          className={`shrink-0 rounded border border-white/25 px-1 py-0.5 text-[9px] leading-none hover:bg-white/15 ${
            ativo ? 'text-amber-200' : 'text-white/90'
          }`}
          title="Classificar e filtrar"
          aria-label={`Classificar e filtrar ${label}`}
        >
          ▾
        </button>
      </div>
      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Redimensionar coluna ${label}`}
        title="Arraste para ajustar a largura da coluna"
        className="absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-sky-400/70 active:bg-sky-400"
        onPointerDown={(e) => onResizePointerDown(colId, e)}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerEnd}
        onPointerCancel={onResizePointerEnd}
      />
    </th>
  );
}

export default function HeatmapAjusteCargaModal({
  open,
  municipioChave,
  item,
  filtros,
  exclusoes,
  ajustesQtde,
  onToggleLinha,
  onDefinirInclusaoLinhas,
  onAjustarQtdeItem,
  onRestaurarCidade,
  onDetalhesCarregados,
  onClose,
}: {
  open: boolean;
  municipioChave: string;
  item: MapaMunicipioItem;
  filtros: FiltrosPedidos;
  exclusoes: ReadonlySet<string>;
  ajustesQtde: AjustesQtdeSimulacao;
  onToggleLinha: (exclusaoKey: string) => void;
  /** `incluir`: true remove da exclusão; false adiciona à exclusão. */
  onDefinirInclusaoLinhas: (exclusaoKeys: string[], incluir: boolean) => void;
  onAjustarQtdeItem: (exclusaoKey: string, qtde: number) => void;
  onRestaurarCidade: (municipioChave: string) => void;
  onDetalhesCarregados: (chave: string, detalhes: TooltipDetalheRow[]) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState<TooltipDetalheRow[]>(item.detalhes ?? []);
  const [modalClassificarOpen, setModalClassificarOpen] = useState(false);
  const [modalSize, setModalSize] = useState(readModalSize);
  const masterCheckRef = useRef<HTMLInputElement>(null);
  const resizeDragRef = useRef<{ startX: number; startY: number; baseW: number; baseH: number } | null>(null);
  const colResizeRef = useRef<{ colId: string; startX: number; startW: number } | null>(null);
  const [colWidths, setColWidths] = useState(readColWidths);

  useEffect(() => {
    if (!open) return;
    setDetalhes(item.detalhes ?? []);
    setErro(null);
    let cancelled = false;
    setLoading(true);
    void obterDetalhesMapaMunicipio(filtros, municipioChave)
      .then((r) => {
        if (cancelled) return;
        setDetalhes(r.detalhes);
        onDetalhesCarregados(municipioChave, r.detalhes);
      })
      .catch(() => {
        if (!cancelled) setErro('Não foi possível carregar todos os itens. Exibindo amostra do mapa.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, municipioChave, filtros, onDetalhesCarregados]);

  const getCellText = useMemo(
    () => criarGetCellText(municipioChave, ajustesQtde),
    [municipioChave, ajustesQtde]
  );
  const valueForSort = useMemo(
    () => criarValueForSort(municipioChave, ajustesQtde),
    [municipioChave, ajustesQtde]
  );

  const grade = useGradeFiltrosExcel({
    rows: detalhes,
    columnIds: COLUNA_IDS,
    getCellText,
    valueForSort,
    defaultSortLevels: SORT_DEFAULT_MODAL_CARGA,
  });

  const limparGradeRef = useRef(grade.limparFiltrosGrade);
  limparGradeRef.current = grade.limparFiltrosGrade;
  useEffect(() => {
    if (!open) return;
    setModalClassificarOpen(false);
    limparGradeRef.current();
  }, [municipioChave, open]);

  /** Linhas após filtros/ordem da grade — totais do cabeçalho seguem o que está visível. */
  const detalhesVisiveis = grade.rowsExibidas;

  const totalOriginal = useMemo(
    () => totalVendaMunicipioOriginal(detalhesVisiveis),
    [detalhesVisiveis]
  );
  const totalSimulado = useMemo(
    () => totalVendaMunicipioSimulado(detalhesVisiveis, municipioChave, exclusoes, ajustesQtde),
    [detalhesVisiveis, municipioChave, exclusoes, ajustesQtde]
  );
  const totalExcluido = useMemo(
    () => valorExcluidoMunicipio(detalhesVisiveis, municipioChave, exclusoes, ajustesQtde),
    [detalhesVisiveis, municipioChave, exclusoes, ajustesQtde]
  );

  const haFiltroColunaGrade = Object.keys(grade.columnFilters).length > 0;

  const temAjusteNestaCidade = useMemo(() => {
    const prefix = `${municipioChave}::`;
    for (const k of ajustesQtde.keys()) {
      if (k.startsWith(prefix)) return true;
    }
    return false;
  }, [ajustesQtde, municipioChave]);

  const exKeysVisiveis = useMemo(
    () => grade.rowsExibidas.map((row) => chaveExclusaoItem(municipioChave, row)),
    [grade.rowsExibidas, municipioChave]
  );

  const estadoMaster = useMemo(() => {
    const n = grade.rowsExibidas.length;
    if (n === 0) {
      return { todasIncluidas: true, algumaIncluida: false };
    }
    let incluidas = 0;
    for (const row of grade.rowsExibidas) {
      if (!itemEstaExcluido(municipioChave, row, exclusoes)) incluidas++;
    }
    return {
      todasIncluidas: incluidas === n,
      algumaIncluida: incluidas > 0,
    };
  }, [grade.rowsExibidas, municipioChave, exclusoes]);

  useEffect(() => {
    const el = masterCheckRef.current;
    if (!el) return;
    const { todasIncluidas, algumaIncluida } = estadoMaster;
    el.indeterminate = algumaIncluida && !todasIncluidas;
  }, [estadoMaster]);

  const handleMasterInclusao = useCallback(() => {
    if (exKeysVisiveis.length === 0) return;
    onDefinirInclusaoLinhas(exKeysVisiveis, !estadoMaster.todasIncluidas);
  }, [exKeysVisiveis, estadoMaster.todasIncluidas, onDefinirInclusaoLinhas]);

  const aplicarCommitPendente = useCallback(
    (actions: CommitPendenteResult[]) => {
      for (const a of actions) {
        if (a.type === 'none') continue;
        if (a.type === 'exclude') onDefinirInclusaoLinhas([a.exKey], false);
        else if (a.type === 'include') onDefinirInclusaoLinhas([a.exKey], true);
        else if (a.type === 'clear_adjust') onAjustarQtdeItem(a.exKey, -1);
        else if (a.type === 'set') onAjustarQtdeItem(a.exKey, a.qtde);
      }
    },
    [onAjustarQtdeItem, onDefinirInclusaoLinhas]
  );

  const navegarParaLinhaPendente = useCallback(
    (targetIdx: number) => {
      const row = grade.rowsExibidas[targetIdx];
      if (!row) return;
      focusPendenteInput(chaveExclusaoItem(municipioChave, row));
    },
    [grade.rowsExibidas, municipioChave]
  );

  const onColResizePointerDown = useCallback(
    (colId: string, e: React.PointerEvent<HTMLSpanElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      colResizeRef.current = {
        colId,
        startX: e.clientX,
        startW: colWidths[colId] ?? 80,
      };
    },
    [colWidths]
  );

  const onColResizePointerMove = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    const d = colResizeRef.current;
    if (!d) return;
    const nw = clampColWidth(d.startW + (e.clientX - d.startX));
    setColWidths((prev) => ({ ...prev, [d.colId]: nw }));
  }, []);

  const onColResizePointerEnd = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    if (!colResizeRef.current) return;
    colResizeRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
    setColWidths((w) => {
      persistColWidths(w);
      return w;
    });
  }, []);

  const persistirModalSize = useCallback((size: { w: number; h: number }) => {
    try {
      localStorage.setItem(MODAL_SIZE_STORAGE_KEY, JSON.stringify(size));
    } catch {
      /* quota / privado */
    }
  }, []);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      resizeDragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseW: modalSize.w,
        baseH: modalSize.h,
      };
    },
    [modalSize]
  );

  const onResizePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = resizeDragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const scale = Math.max((d.baseW + dx) / d.baseW, (d.baseH + dy) / d.baseH);
    setModalSize(clampModalSize(d.baseW * scale));
  }, []);

  const onResizePointerEnd = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!resizeDragRef.current) return;
      resizeDragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* */
      }
      setModalSize((s) => {
        persistirModalSize(s);
        return s;
      });
    },
    [persistirModalSize]
  );

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/40 p-3"
        role="presentation"
        onClick={onClose}
      >
        <div
          className="relative flex max-h-[calc(100vh-1.5rem)] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-600 dark:bg-slate-800"
          style={{ width: modalSize.w, height: modalSize.h }}
          role="dialog"
          aria-label={`Ajustar carga — ${item.municipio}`}
          onClick={(e: MouseEvent) => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-600">
            <div>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Ajustar carga — {item.municipio}
                {item.uf ? `/${item.uf}` : ''}
              </h3>
              <p className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-200">
                Carga simulada: {fmtBrlRoteiro(totalSimulado)}
                {haFiltroColunaGrade && detalhesVisiveis.length < detalhes.length && (
                  <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
                    ({detalhesVisiveis.length} de {detalhes.length} itens na grade)
                  </span>
                )}
                {totalExcluido > 0.005 && (
                  <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
                    (era {fmtBrlRoteiro(totalOriginal)} · excl. {fmtBrlRoteiro(totalExcluido)})
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-700"
              aria-label="Fechar"
            >
              ×
            </button>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2 dark:border-slate-700">
            <button
              type="button"
              disabled={totalExcluido <= 0.005 && !temAjusteNestaCidade}
              onClick={() => onRestaurarCidade(municipioChave)}
              className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-700/80"
            >
              Restaurar tudo nesta cidade
            </button>
            <button
              type="button"
              onClick={() => setModalClassificarOpen(true)}
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
            >
              Classificação personalizada
            </button>
            {grade.temFiltrosOuOrdem && (
              <button
                type="button"
                onClick={grade.limparFiltrosGrade}
                className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100"
              >
                Limpar filtros e ordem
              </button>
            )}
            {!loading && (
              <span className="ml-auto text-[10px] text-slate-500 dark:text-slate-400">
                {grade.rowsExibidas.length} de {detalhes.length} ite{detalhes.length !== 1 ? 'ns' : 'm'}
              </span>
            )}
          </div>

          {loading && (
            <p className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">Carregando itens…</p>
          )}
          {erro && !loading && <p className="px-4 py-1 text-xs text-amber-700 dark:text-amber-300">{erro}</p>}

          {!loading && (
            <div ref={grade.tableScrollRef} className="min-h-0 flex-1 overflow-auto overscroll-contain px-2 pb-3">
              <table className="w-full table-fixed border-collapse text-xs">
                <colgroup>
                  <col style={{ width: 36 }} />
                  {COLUNAS_GRADE.map((col) => (
                    <col key={col.id} style={{ width: colWidths[col.id] ?? 80 }} />
                  ))}
                </colgroup>
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="w-9 border border-slate-600/80 bg-slate-700 py-2 text-center align-middle">
                      <input
                        ref={masterCheckRef}
                        type="checkbox"
                        checked={estadoMaster.todasIncluidas && exKeysVisiveis.length > 0}
                        disabled={exKeysVisiveis.length === 0}
                        onChange={handleMasterInclusao}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600 disabled:opacity-40"
                        title={
                          exKeysVisiveis.length === 0
                            ? 'Nenhuma linha visível'
                            : estadoMaster.todasIncluidas
                              ? 'Desmarcar todas as linhas visíveis'
                              : 'Marcar todas as linhas visíveis'
                        }
                        aria-label={
                          exKeysVisiveis.length === 0
                            ? 'Selecionar linhas visíveis'
                            : estadoMaster.todasIncluidas
                              ? 'Desmarcar todas as linhas visíveis'
                              : 'Marcar todas as linhas visíveis'
                        }
                      />
                    </th>
                    {COLUNAS_GRADE.map((col) => (
                      <GradeTh
                        key={col.id}
                        colId={col.id}
                        label={col.label}
                        ativo={grade.colunaComFiltroAtivo(col.id)}
                        onAbrirFiltro={grade.abrirFiltroExcel}
                        alignRight={COLUNAS_NUMERICAS.has(col.id)}
                        widthPx={colWidths[col.id] ?? 80}
                        onResizePointerDown={onColResizePointerDown}
                        onResizePointerMove={onColResizePointerMove}
                        onResizePointerEnd={onColResizePointerEnd}
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grade.rowsExibidas.map((row, rowIdx) => {
                    const exKey = chaveExclusaoItem(municipioChave, row);
                    const excluida = itemEstaExcluido(municipioChave, row, exclusoes);
                    return (
                      <tr
                        key={`${exKey}-${rowIdx}`}
                        className={`border-b border-slate-100 dark:border-slate-700/80 ${
                          excluida
                            ? 'bg-slate-100/80 opacity-60 dark:bg-slate-900/50'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'
                        }`}
                      >
                        <td className="py-1.5 pl-2">
                          <input
                            type="checkbox"
                            checked={!excluida}
                            onChange={() => onToggleLinha(exKey)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600"
                            title={excluida ? 'Incluir na simulação' : 'Excluir da simulação'}
                            aria-label={excluida ? 'Incluir na simulação' : 'Excluir da simulação'}
                          />
                        </td>
                        {COLUNAS_GRADE.map((col) => {
                          const vendaEfetiva = valorVendaEfetivoLinha(row, municipioChave, ajustesQtde);
                          const qtdeReal = getQtdePendenteReal(row);
                          const cellMuted = excluida
                            ? 'text-slate-400 line-through dark:text-slate-500'
                            : 'text-slate-700 dark:text-slate-200';
                          if (col.id === 'pendenteConsiderar') {
                            return (
                              <td
                                key={col.id}
                                className="overflow-hidden py-1 pr-1 text-right"
                                style={{ width: colWidths[col.id] }}
                              >
                                <PendenteConsiderarInput
                                  exKey={exKey}
                                  row={row}
                                  rowIdx={rowIdx}
                                  municipioChave={municipioChave}
                                  ajustesQtde={ajustesQtde}
                                  excluida={excluida}
                                  onAplicarCommit={aplicarCommitPendente}
                                  onNavigateToRow={navegarParaLinhaPendente}
                                />
                              </td>
                            );
                          }
                          if (col.id === 'qtdePendenteReal') {
                            return (
                              <td
                                key={col.id}
                                className={`py-1.5 pr-2 text-right tabular-nums ${cellMuted}`}
                              >
                                {formatQtde(qtdeReal)}
                              </td>
                            );
                          }
                          if (col.id === 'valorPendente') {
                            return (
                              <td
                                key={col.id}
                                className={`py-1.5 pr-2 text-right font-medium tabular-nums ${
                                  excluida
                                    ? 'text-slate-400 line-through dark:text-slate-500'
                                    : 'text-slate-800 dark:text-slate-100'
                                }`}
                              >
                                {fmtBrlRoteiro(vendaEfetiva)}
                              </td>
                            );
                          }
                          if (col.id === 'rota') {
                            return (
                              <td
                                key={col.id}
                                className={`max-w-[140px] truncate py-1.5 pr-1 ${cellMuted}`}
                                title={row.rota}
                              >
                                {row.rota || '—'}
                              </td>
                            );
                          }
                          if (col.id === 'codigo') {
                            return (
                              <td
                                key={col.id}
                                className={`max-w-[72px] truncate py-1.5 pr-1 font-mono text-[10px] ${cellMuted}`}
                                title={row.codigo}
                              >
                                {row.codigo || '—'}
                              </td>
                            );
                          }
                          if (col.id === 'produto') {
                            return (
                              <td
                                key={col.id}
                                className={`max-w-[120px] truncate py-1.5 pr-1 ${cellMuted}`}
                                title={row.produto}
                              >
                                {row.produto || '—'}
                              </td>
                            );
                          }
                          return (
                            <td key={col.id} className={`py-1.5 pr-1 ${cellMuted}`}>
                              {getCellText(row, col.id)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {grade.rowsExibidas.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-500">
                  {detalhes.length === 0 ? 'Nenhum item para este município.' : 'Nenhum item corresponde aos filtros.'}
                </p>
              )}
            </div>
          )}
          <button
            type="button"
            aria-label="Redimensionar modal"
            title="Arraste para redimensionar (proporcional)"
            className="absolute bottom-0 right-0 z-20 h-5 w-5 cursor-se-resize touch-none rounded-br-xl border-l border-t border-slate-300/80 bg-slate-200/90 hover:bg-slate-300 dark:border-slate-500 dark:bg-slate-600/90 dark:hover:bg-slate-500"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerEnd}
            onPointerCancel={onResizePointerEnd}
          >
            <span className="sr-only">Redimensionar</span>
            <svg className="pointer-events-none absolute bottom-0.5 right-0.5 h-3 w-3 text-slate-500 dark:text-slate-300" viewBox="0 0 12 12" aria-hidden>
              <path fill="currentColor" d="M12 12H8V10h2V8h2v4zM10 8H8V6h2V4h2v4zM6 6H4V4h2V2h2v4z" />
            </svg>
          </button>
        </div>
      </div>

      {grade.colunaFiltroAberta && grade.filtroAbertoRect && (
        <GradeFiltroExcelPortal
          colunaAberta={grade.colunaFiltroAberta}
          rect={grade.filtroAbertoRect}
          dropdownRef={grade.filtroDropdownRef}
          excelFilterDrafts={grade.excelFilterDrafts}
          setExcelFilterDrafts={grade.setExcelFilterDrafts}
          valoresUnicosPorColuna={grade.valoresUnicosPorColuna}
          onSortAsc={(colId) => {
            grade.setSortState({ key: colId, direction: 'asc' });
            grade.setSortLevels([]);
            grade.fecharFiltroExcel();
          }}
          onSortDesc={(colId) => {
            grade.setSortState({ key: colId, direction: 'desc' });
            grade.setSortLevels([]);
            grade.fecharFiltroExcel();
          }}
          onAplicar={grade.aplicarFiltroExcel}
          onCancelar={grade.fecharFiltroExcel}
        />
      )}

      <ModalClassificarGrade
        open={modalClassificarOpen}
        onClose={() => setModalClassificarOpen(false)}
        colunas={COLUNAS_GRADE}
        initialLevels={grade.sortLevels.length > 0 ? grade.sortLevels : SORT_DEFAULT_MODAL_CARGA}
        onApply={(levels) => {
          grade.setSortLevels(levels);
          grade.setSortState(null);
        }}
      />
    </>
  );
}


