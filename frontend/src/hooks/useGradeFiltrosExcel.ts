import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

export type SortDir = 'asc' | 'desc';
export type SortLevel = { id: string; dir: SortDir };
export type ExcelFilterDraft = { search: string; selected: string[] };
type SortState = { key: string; direction: SortDir } | null;

const FILTER_SEP = '\u0001';

export type UseGradeFiltrosExcelOptions<T> = {
  rows: T[];
  columnIds: string[];
  getCellText: (row: T, columnId: string) => string;
  valueForSort?: (row: T, columnId: string) => string | number;
  defaultSortLevels?: SortLevel[];
};

export function compareRowsBySortLevels<T>(
  a: T,
  b: T,
  levels: SortLevel[],
  getSortValue: (row: T, columnId: string) => string | number
): number {
  for (const level of levels) {
    const av = getSortValue(a, level.id);
    const bv = getSortValue(b, level.id);
    let cmp = 0;
    if (typeof av === 'number' && typeof bv === 'number') {
      cmp = av - bv;
    } else {
      cmp = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' });
    }
    if (cmp !== 0) return level.dir === 'asc' ? cmp : -cmp;
  }
  return 0;
}

export function useGradeFiltrosExcel<T>({
  rows,
  columnIds,
  getCellText,
  valueForSort,
  defaultSortLevels = [],
}: UseGradeFiltrosExcelOptions<T>) {
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [excelFilterDrafts, setExcelFilterDrafts] = useState<Record<string, ExcelFilterDraft>>({});
  const [colunaFiltroAberta, setColunaFiltroAberta] = useState<string | null>(null);
  const [filtroAbertoRect, setFiltroAbertoRect] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const [sortState, setSortState] = useState<SortState>(null);
  const [sortLevels, setSortLevels] = useState<SortLevel[]>(defaultSortLevels);
  const filtroDropdownRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const getSortValue = useCallback(
    (row: T, columnId: string) => (valueForSort ? valueForSort(row, columnId) : getCellText(row, columnId)),
    [getCellText, valueForSort]
  );

  const valoresUnicosPorColuna = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const colId of columnIds) {
      const values = new Set<string>();
      for (const row of rows) {
        values.add(getCellText(row, colId));
      }
      out[colId] = [...values].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
    }
    return out;
  }, [rows, columnIds, getCellText]);

  const setFiltroColuna = useCallback((key: string, value: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  }, []);

  const abrirFiltroExcel = useCallback(
    (key: string, e: MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setColunaFiltroAberta((prev) => {
        if (prev === key) {
          setFiltroAbertoRect(null);
          return null;
        }
        const valores = valoresUnicosPorColuna[key] ?? [];
        const filtroAtual = columnFilters[key];
        setExcelFilterDrafts((drafts) => ({
          ...drafts,
          [key]: {
            search: '',
            selected: filtroAtual ? filtroAtual.split(FILTER_SEP) : valores,
          },
        }));
        setFiltroAbertoRect({ top: rect.bottom + 4, left: rect.left, width: 288 });
        return key;
      });
    },
    [columnFilters, valoresUnicosPorColuna]
  );

  const fecharFiltroExcel = useCallback(() => {
    setColunaFiltroAberta(null);
    setFiltroAbertoRect(null);
  }, []);

  const aplicarFiltroExcel = useCallback(
    (key: string) => {
      const draft = excelFilterDrafts[key];
      const valores = valoresUnicosPorColuna[key] ?? [];
      if (!draft || draft.selected.length === valores.length) setFiltroColuna(key, '');
      else setFiltroColuna(key, draft.selected.join(FILTER_SEP));
      fecharFiltroExcel();
    },
    [excelFilterDrafts, valoresUnicosPorColuna, setFiltroColuna, fecharFiltroExcel]
  );

  useEffect(() => {
    if (!colunaFiltroAberta) return;
    const handle = (e: MouseEvent) => {
      if (filtroDropdownRef.current && !filtroDropdownRef.current.contains(e.target as Node)) {
        fecharFiltroExcel();
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [colunaFiltroAberta, fecharFiltroExcel]);

  useEffect(() => {
    if (!colunaFiltroAberta) return;
    const el = tableScrollRef.current;
    if (!el) return;
    const handle = () => fecharFiltroExcel();
    el.addEventListener('scroll', handle, { passive: true });
    return () => el.removeEventListener('scroll', handle);
  }, [colunaFiltroAberta, fecharFiltroExcel]);

  const deferredColumnFilters = useDeferredValue(columnFilters);

  const rowsFiltradas = useMemo(() => {
    const filtrosColuna = Object.entries(deferredColumnFilters).filter(([, v]) => v.trim());
    if (filtrosColuna.length === 0) return rows;
    return rows.filter((row) => {
      for (const [key, value] of filtrosColuna) {
        const cellText = getCellText(row, key);
        const selected = value.split(FILTER_SEP).filter(Boolean);
        if (selected.length > 1 || value.includes(FILTER_SEP)) {
          if (!selected.includes(cellText)) return false;
        } else if (!cellText.toLowerCase().includes(value.trim().toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [rows, deferredColumnFilters, getCellText]);

  const levelsToUse = useMemo((): SortLevel[] => {
    if (sortLevels.length > 0) return sortLevels;
    if (sortState) return [{ id: sortState.key, dir: sortState.direction }];
    if (defaultSortLevels.length > 0) return defaultSortLevels;
    return [];
  }, [sortLevels, sortState, defaultSortLevels]);

  const rowsExibidas = useMemo(() => {
    if (levelsToUse.length === 0) return rowsFiltradas;
    return [...rowsFiltradas].sort((a, b) => compareRowsBySortLevels(a, b, levelsToUse, getSortValue));
  }, [rowsFiltradas, levelsToUse, getSortValue]);

  const temFiltrosOuOrdem = useMemo(
    () => Object.keys(columnFilters).length > 0 || sortState != null || sortLevels.length > 0,
    [columnFilters, sortState, sortLevels]
  );

  const limparFiltrosGrade = useCallback(() => {
    setColumnFilters({});
    setExcelFilterDrafts({});
    setSortState(null);
    setSortLevels(defaultSortLevels);
    fecharFiltroExcel();
  }, [defaultSortLevels, fecharFiltroExcel]);

  const colunaComFiltroAtivo = useCallback(
    (colId: string) => Boolean(columnFilters[colId]) || sortState?.key === colId || sortLevels.some((l) => l.id === colId),
    [columnFilters, sortState, sortLevels]
  );

  return {
    rowsExibidas,
    tableScrollRef,
    filtroDropdownRef,
    columnFilters,
    excelFilterDrafts,
    setExcelFilterDrafts,
    colunaFiltroAberta,
    filtroAbertoRect,
    valoresUnicosPorColuna,
    sortState,
    setSortState,
    sortLevels,
    setSortLevels,
    abrirFiltroExcel,
    fecharFiltroExcel,
    aplicarFiltroExcel,
    temFiltrosOuOrdem,
    limparFiltrosGrade,
    colunaComFiltroAtivo,
  };
}
