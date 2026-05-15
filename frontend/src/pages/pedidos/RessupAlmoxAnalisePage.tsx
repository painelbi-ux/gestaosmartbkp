import { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { useOnSincronizado } from '../../hooks/useOnSincronizado';
import { useAuth } from '../../contexts/AuthContext';
import {
  listarRessupAlmoxRegistroPreview,
  obterOpcoesFiltroColetas,
  gravarRessupAlmoxAnalise,
  atualizarRessupAlmoxAnalise,
  processarRessupAlmoxAnalise,
  concluirRessupAlmoxAnalise,
  listarRessupAlmoxAnalises,
  obterRessupAlmoxAnalise,
  type RessupAlmoxAnalisePayloadV1,
  type RessupAlmoxAnaliseListItem,
} from '../../api/compras';
import MultiSelectWithSearch from '../../components/MultiSelectWithSearch';
import CarregandoInformacoesOverlay from '../../components/CarregandoInformacoesOverlay';

const COL_DEFS = [
  { key: 'codigo', label: 'Código' },
  { key: 'descricao', label: 'Descrição' },
  { key: 'undMedida', label: 'Und Medida' },
  { key: 'coleta', label: 'Coleta' },
  { key: 'itemCritico', label: 'Item crítico' },
  { key: 'qtdeEmp', label: 'Qtde Emp' },
  { key: 'cm', label: 'CM' },
  { key: 'dataSolicit', label: 'Data Solicit.' },
  { key: 'dataNecess', label: 'Data Necess.' },
  { key: 'qtdSolicit', label: 'Qtd Solicit.' },
  { key: 'qtdeSug', label: 'Qtde Sug' },
  { key: 'dataNecessSug', label: 'Data Necess Sug' },
  { key: 'qtdAprov', label: 'Qtd Aprov' },
  { key: 'dataNecessAprov', label: 'Data Necess Aprov' },
  { key: 'estoqAtual', label: 'Estoq Atual' },
  { key: 'qtdeUltComp', label: 'Qtde Ultm Comp' },
  { key: 'dataUltEntrada', label: 'Data Ult Entrada' },
  { key: 'precoAnt', label: 'Preço Ant' },
  { key: 'estSeg', label: 'Est Seg' },
  { key: 'pcPend', label: 'PC Pend' },
  { key: 'agPag', label: 'Ag Pag' },
  { key: 'saldoProjetado', label: 'Saldo projetado' },
] as const;

type ColKey = (typeof COL_DEFS)[number]['key'];

/** Colunas preenchidas pelo usuário na grade (gravadas no snapshot). */
const NUMERIC_INPUT_KEYS = new Set<ColKey>(['qtdeSug', 'qtdAprov']);
const DATE_INPUT_KEYS = new Set<ColKey>(['dataNecessSug', 'dataNecessAprov']);
const EDITABLE_KEYS = new Set<ColKey>([...NUMERIC_INPUT_KEYS, ...DATE_INPUT_KEYS]);

/**
 * Colunas que ficam ocultas SOMENTE na grade (visíveis via tooltip em outra célula),
 * mas continuam aparecendo no XLSX e no snapshot gravado.
 */
const GRADE_OCULTAS_COL_KEYS = new Set<ColKey>([
  'undMedida',
  'dataSolicit',
  'dataNecess',
  'dataUltEntrada',
  'precoAnt',
]);

const COL_DEFS_GRADE = COL_DEFS.filter((c) => !GRADE_OCULTAS_COL_KEYS.has(c.key));

type RowUserInputs = Partial<Record<ColKey, string>>;

type ExcelFilterDraft = { search: string; selected: string[] };

type SortState = { key: ColKey; direction: 'asc' | 'desc' } | null;

const STORAGE_COL_OCULTAS = 'ressupAlmox.colunasOcultas.v1';

const BTN_PRIMARY =
  'px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm transition shrink-0';

const BTN_SECONDARY =
  'px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-800 font-medium text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600';

function loadColunasOcultasStorage(): string[] {
  try {
    const s = sessionStorage.getItem(STORAGE_COL_OCULTAS);
    if (!s) return [];
    const p = JSON.parse(s) as unknown;
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function getRowValue(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(row, k)) return row[k];
  }
  const lower = keys[0].toLowerCase();
  const found = Object.keys(row).find((key) => key.toLowerCase() === lower);
  return found != null ? row[found] : undefined;
}

function fmtNum(v: unknown): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—';
}

function fmtData(v: unknown): string {
  if (v == null || v === '') return '—';
  try {
    const d = typeof v === 'string' ? new Date(v) : new Date(Number(v));
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return String(v);
  }
}

function fmtPreco(v: unknown): string {
  if (v == null || v === '') return '—';
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtSaldoProjetado(row: Record<string, unknown>): string {
  const est = Number(getRowValue(row, ['Saldo Estoque', 'Saldo de Estoque', 'saldo estoque']) ?? 0);
  const emp = Number(getRowValue(row, ['Qtde Empenhada', 'qtde empenhada']) ?? 0);
  const qLiv = Number(getRowValue(row, ['Qtd Liberada', 'qtd liberada']) ?? 0);
  const pc = Number(getRowValue(row, ['PC', 'pc']) ?? 0);
  const ag = Number(getRowValue(row, ['Ag Pag', 'ag pag']) ?? 0);
  if (![est, emp, qLiv, pc, ag].some((n) => Number.isFinite(n))) return '—';
  const n =
    (Number.isFinite(est) ? est : 0) -
    (Number.isFinite(emp) ? emp : 0) -
    (Number.isFinite(qLiv) ? qLiv : 0) +
    (Number.isFinite(pc) ? pc : 0) -
    (Number.isFinite(ag) ? ag : 0);
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtNumeroUsuario(v: string | null | undefined): string {
  const raw = (v ?? '').trim();
  if (!raw) return '—';
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

function fmtDataUsuario(v: string | null | undefined): string {
  const raw = (v ?? '').trim();
  if (!raw) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-');
    return `${d}/${m}/${y}`;
  }
  return raw;
}

function getRessupCell(
  row: Record<string, unknown>,
  key: ColKey,
  userInput?: RowUserInputs
): string {
  if (EDITABLE_KEYS.has(key)) {
    const raw = userInput?.[key];
    if (NUMERIC_INPUT_KEYS.has(key)) return fmtNumeroUsuario(raw);
    if (DATE_INPUT_KEYS.has(key)) return fmtDataUsuario(raw);
    return raw ?? '—';
  }
  switch (key) {
    case 'codigo':
      return String(getRowValue(row, ['Codigo do Produto', 'codigo do produto']) ?? '').trim() || '—';
    case 'descricao':
      return String(getRowValue(row, ['Descricao do Produto', 'descricao do produto']) ?? '').trim() || '—';
    case 'undMedida':
      return String(getRowValue(row, ['Unidade de Medida', 'unidade de medida']) ?? '').trim() || '—';
    case 'qtdeEmp':
      return fmtNum(getRowValue(row, ['Qtde Empenhada', 'qtde empenhada']));
    case 'cm':
      return fmtNum(getRowValue(row, ['Consumo Medio', 'consumo medio']));
    case 'dataSolicit':
      return fmtData(getRowValue(row, ['Data Solicitacao', 'data solicitacao']));
    case 'dataNecess':
      return fmtData(getRowValue(row, ['Data Necessidade', 'data necessidade']));
    case 'qtdSolicit':
      return fmtNum(getRowValue(row, ['Qtd Liberada', 'qtd liberada']));
    case 'estoqAtual':
      return fmtNum(getRowValue(row, ['Saldo Estoque', 'Saldo de Estoque', 'saldo estoque']));
    case 'qtdeUltComp':
      return fmtNum(getRowValue(row, ['Qtde Ult Compra', 'qtde ult compra']));
    case 'dataUltEntrada':
      return fmtData(getRowValue(row, ['Ultima Entrada', 'ultima entrada']));
    case 'precoAnt':
      return fmtPreco(getRowValue(row, ['Custo Unitario Compra', 'custo unitario compra']));
    case 'estSeg':
      return fmtNum(getRowValue(row, ['Estoque de Seguranca', 'estoque de seguranca']));
    case 'pcPend':
      return fmtNum(getRowValue(row, ['PC', 'pc']));
    case 'agPag':
      return fmtNum(getRowValue(row, ['Ag Pag', 'ag pag']));
    case 'itemCritico':
      return '—';
    case 'coleta':
      return String(getRowValue(row, ['Nome Coleta', 'nome coleta']) ?? '').trim() || '—';
    case 'saldoProjetado':
      return fmtSaldoProjetado(row);
    default:
      return '—';
  }
}

function fmtIsoDataHora(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function valueForSort(
  row: Record<string, unknown>,
  key: ColKey,
  userInput?: RowUserInputs
): string | number {
  const s = getRessupCell(row, key, userInput);
  if (s === '—') return '';
  const forNum = s.replace(/\s/g, '').replace(/R\$\s?/i, '').replace(/\./g, '').replace(',', '.');
  const n = Number(forNum);
  if (Number.isFinite(n) && /[\d]/.test(s)) return n;
  return s.toLowerCase();
}

const labelClass = 'block text-xs text-slate-500 dark:text-slate-400 mb-1';
const inputClass =
  'w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent min-h-[2.5rem]';

export default function RessupAlmoxAnalisePage() {
  const { login: authLogin } = useAuth();
  const [opcoesFiltro, setOpcoesFiltro] = useState<{ codigos: string[]; descricoes: string[]; coletas: string[] }>({
    codigos: [],
    descricoes: [],
    coletas: [],
  });
  const [filterCodigo, setFilterCodigo] = useState('');
  const [filterDescricao, setFilterDescricao] = useState('');
  const [filterColeta, setFilterColeta] = useState('');

  const [aplicado, setAplicado] = useState<{
    codigo: string;
    descricao: string;
    coleta: string;
  } | null>(null);
  const [msgFiltro, setMsgFiltro] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [erroApi, setErroApi] = useState<string | null>(null);
  const [msgLista, setMsgLista] = useState<string | null>(null);

  const [colunasOcultas, setColunasOcultas] = useState<string[]>(() => loadColunasOcultasStorage());
  const [colunasOcultasOpen, setColunasOcultasOpen] = useState(false);
  const colunasOcultasRef = useRef<HTMLDivElement>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [excelFilterDrafts, setExcelFilterDrafts] = useState<Record<string, ExcelFilterDraft>>({});
  const [colunaFiltroAberta, setColunaFiltroAberta] = useState<ColKey | null>(null);
  const [filtroAbertoRect, setFiltroAbertoRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const filtroDropdownRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [sortState, setSortState] = useState<SortState>(null);

  const [gravandoAnalise, setGravandoAnalise] = useState(false);
  const [salvandoAlteracoes, setSalvandoAlteracoes] = useState(false);
  const [processandoAnalise, setProcessandoAnalise] = useState(false);
  const [concluindoAnalise, setConcluindoAnalise] = useState(false);
  const [feedbackGravacao, setFeedbackGravacao] = useState<{ ok: boolean; msg: string } | null>(null);
  /** Valores digitados nas colunas editáveis (Qtde Sug, Data Necess Sug, Qtd Aprov, Data Necess Aprov), por __rowKey. */
  const [userInputs, setUserInputs] = useState<Record<string, RowUserInputs>>({});
  /** Popover de filtros ao clicar em "Nova análise". */
  const [filtrosPopoverAberto, setFiltrosPopoverAberto] = useState(false);
  /** Exibe a grade após o primeiro "Filtrar" válido. */
  const [mostrarGradeAnalise, setMostrarGradeAnalise] = useState(false);
  /** Recarrega a lista do histórico (ex.: após gravar análise). */
  const [historicoVersao, setHistoricoVersao] = useState(0);
  const [historicoLista, setHistoricoLista] = useState<RessupAlmoxAnaliseListItem[]>([]);
  const [historicoCarregando, setHistoricoCarregando] = useState(false);
  const [historicoErro, setHistoricoErro] = useState<string | null>(null);
  /** Quando preenchido, a grade exibe um snapshot gravado (modo "visualização do histórico"). */
  const [historicoVisualizado, setHistoricoVisualizado] = useState<{
    id: number;
    createdAt: string;
    usuarioLogin: string;
    resumoFiltros: string | null;
    status: 'em_processamento' | 'processado' | 'concluido';
    processadoAt: string | null;
    usuarioLoginProcessado: string | null;
    concluidoAt: string | null;
    usuarioLoginConcluido: string | null;
  } | null>(null);
  const [historicoDetalheCarregando, setHistoricoDetalheCarregando] = useState(false);
  const [historicoDetalheErro, setHistoricoDetalheErro] = useState<string | null>(null);
  const [opcoesCarregando, setOpcoesCarregando] = useState(false);
  const detalheHistoricoReqRef = useRef(0);
  const novaAnaliseWrapRef = useRef<HTMLDivElement>(null);

  const carregarOpcoes = useCallback(async () => {
    setOpcoesCarregando(true);
    try {
      const r = await obterOpcoesFiltroColetas();
      setOpcoesFiltro({
        codigos: r.codigos ?? [],
        descricoes: r.descricoes ?? [],
        coletas: r.coletas ?? [],
      });
    } catch {
      setOpcoesFiltro({ codigos: [], descricoes: [], coletas: [] });
    } finally {
      setOpcoesCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregarOpcoes();
  }, [carregarOpcoes]);

  useOnSincronizado(carregarOpcoes);

  useEffect(() => {
    let cancelled = false;
    setHistoricoCarregando(true);
    setHistoricoErro(null);
    void listarRessupAlmoxAnalises(100)
      .then((r) => {
        if (cancelled) return;
        setHistoricoLista(r.data);
        if (r.error) setHistoricoErro(r.error);
      })
      .catch((e) => {
        if (!cancelled) setHistoricoErro(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setHistoricoCarregando(false);
      });
    return () => {
      cancelled = true;
    };
  }, [historicoVersao]);

  useEffect(() => {
    if (!filtrosPopoverAberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFiltrosPopoverAberto(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [filtrosPopoverAberto]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_COL_OCULTAS, JSON.stringify(colunasOcultas));
    } catch {
      /* ignore */
    }
  }, [colunasOcultas]);

  useEffect(() => {
    if (!colunasOcultasOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (colunasOcultasRef.current && !colunasOcultasRef.current.contains(e.target as Node)) {
        setColunasOcultasOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [colunasOcultasOpen]);

  const chavesValidas = useMemo(() => new Set(COL_DEFS_GRADE.map((c) => c.key)), []);

  useEffect(() => {
    const ocultasValidas = colunasOcultas.filter((k) => chavesValidas.has(k));
    if (ocultasValidas.length >= COL_DEFS_GRADE.length) ocultasValidas.pop();
    if (ocultasValidas.length !== colunasOcultas.length || ocultasValidas.some((k, i) => k !== colunasOcultas[i])) {
      setColunasOcultas(ocultasValidas);
    }
  }, [chavesValidas, colunasOcultas]);

  const colunasVisiveisLista = useMemo(
    () => COL_DEFS_GRADE.filter((c) => !colunasOcultas.includes(c.key)),
    [colunasOcultas]
  );

  const colunasOcultasLista = useMemo(
    () => COL_DEFS_GRADE.filter((c) => colunasOcultas.includes(c.key)),
    [colunasOcultas]
  );

  const ocultarColuna = (key: ColKey) => {
    if (colunasVisiveisLista.length <= 1) return;
    setColunaFiltroAberta((prev) => (prev === key ? null : prev));
    setSortState((prev) => (prev?.key === key ? null : prev));
    setColumnFilters((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setExcelFilterDrafts((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setColunasOcultas((prev) => (prev.includes(key) ? prev : [...prev, key]));
  };

  const reexibirColuna = (key: ColKey) => {
    setColunasOcultas((prev) => prev.filter((k) => k !== key));
  };

  const reexibirTodasColunas = () => {
    setColunasOcultas([]);
    setColunasOcultasOpen(false);
  };

  const setFiltroColuna = (key: ColKey, value: string) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  };

  const getRowKey = useCallback((row: Record<string, unknown>, idx: number): string => {
    const k = row.__rowKey;
    return typeof k === 'string' && k ? k : `row-${idx}`;
  }, []);

  const setRowInput = useCallback((rowKey: string, col: ColKey, value: string) => {
    setUserInputs((prev) => {
      const current = prev[rowKey] ?? {};
      if ((current[col] ?? '') === value) return prev;
      const nextRow: RowUserInputs = { ...current, [col]: value };
      if (!value) delete nextRow[col];
      const next = { ...prev };
      if (Object.keys(nextRow).length === 0) delete next[rowKey];
      else next[rowKey] = nextRow;
      return next;
    });
  }, []);

  const valoresUnicosPorColuna = useMemo(() => {
    const out: Partial<Record<ColKey, string[]>> = {};
    for (const col of colunasVisiveisLista) {
      const values = new Set<string>();
      linhas.forEach((row, idx) => {
        const inputs = userInputs[getRowKey(row, idx)];
        values.add(getRessupCell(row, col.key, inputs));
      });
      out[col.key] = [...values].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
    }
    return out;
  }, [colunasVisiveisLista, linhas, userInputs, getRowKey]);

  const abrirFiltroExcel = (key: ColKey, e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
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
          selected: filtroAtual ? filtroAtual.split('\u0001') : valores,
        },
      }));
      setFiltroAbertoRect({ top: rect.bottom + 4, left: rect.left, width: 288 });
      return key;
    });
  };

  const fecharFiltroExcel = useCallback(() => {
    setColunaFiltroAberta(null);
    setFiltroAbertoRect(null);
  }, []);

  const aplicarFiltroExcel = (key: ColKey) => {
    const draft = excelFilterDrafts[key];
    const valores = valoresUnicosPorColuna[key] ?? [];
    if (!draft || draft.selected.length === valores.length) setFiltroColuna(key, '');
    else setFiltroColuna(key, draft.selected.join('\u0001'));
    fecharFiltroExcel();
  };

  // Fechar dropdown ao clicar fora
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

  // Fechar dropdown ao rolar a tabela
  useEffect(() => {
    if (!colunaFiltroAberta) return;
    const el = tableScrollRef.current;
    if (!el) return;
    const handle = () => fecharFiltroExcel();
    el.addEventListener('scroll', handle, { passive: true });
    return () => el.removeEventListener('scroll', handle);
  }, [colunaFiltroAberta, fecharFiltroExcel]);

  const deferredColumnFilters = useDeferredValue(columnFilters);

  const linhasFiltradas = useMemo(() => {
    const filtrosColuna = Object.entries(deferredColumnFilters)
      .map(([key, value]) => [key, value.trim().toLowerCase()] as const)
      .filter(([, value]) => value);
    return linhas.filter((row, idx) => {
      const inputs = userInputs[getRowKey(row, idx)];
      for (const [key, value] of filtrosColuna) {
        const colKey = key as ColKey;
        const cellText = getRessupCell(row, colKey, inputs);
        const selected = value.split('\u0001').filter(Boolean);
        if (selected.length > 1 || value.includes('\u0001')) {
          if (!selected.includes(cellText)) return false;
        } else if (!cellText.toLowerCase().includes(value)) return false;
      }
      return true;
    });
  }, [linhas, deferredColumnFilters, userInputs, getRowKey]);

  const linhasOrdenadas = useMemo(() => {
    if (!sortState) return linhasFiltradas;
    const dir = sortState.direction === 'asc' ? 1 : -1;
    return [...linhasFiltradas].sort((a, b) => {
      const ka = getRowKey(a, 0);
      const kb = getRowKey(b, 0);
      const av = valueForSort(a, sortState.key, userInputs[ka]);
      const bv = valueForSort(b, sortState.key, userInputs[kb]);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
    });
  }, [linhasFiltradas, sortState, userInputs, getRowKey]);

  const temFiltrosGrade =
    Object.keys(columnFilters).length > 0 || sortState != null || colunasOcultas.length > 0;

  /** Navega entre inputs editáveis com Enter (linha abaixo) e Shift+Enter (linha acima). */
  const handleInputEnterKey = useCallback((
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colKey: ColKey
  ) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const targetIdx = e.shiftKey ? rowIdx - 1 : rowIdx + 1;
    if (targetIdx < 0 || targetIdx >= linhasOrdenadas.length) return;
    const targetRow = linhasOrdenadas[targetIdx];
    const targetRowKey = getRowKey(targetRow, targetIdx);
    const escapeAttr = (s: string) =>
      typeof window.CSS?.escape === 'function'
        ? window.CSS.escape(s)
        : s.replace(/[^\w-]/g, (c) => `\\${c}`);
    const selector = `[data-editinput][data-rowkey="${escapeAttr(targetRowKey)}"][data-colkey="${colKey}"]`;
    const el = document.querySelector<HTMLInputElement>(selector);
    if (el) { el.focus(); el.select(); }
  }, [linhasOrdenadas, getRowKey]);

  const limparFiltrosGrade = () => {
    setColumnFilters({});
    setExcelFilterDrafts({});
    setSortState(null);
    setColunaFiltroAberta(null);
    setFiltroAbertoRect(null);
  };

  const handleFiltrar = async () => {
    const temCodigo = filterCodigo.trim() !== '';
    const temDescricao = filterDescricao.trim() !== '';
    const temColeta = filterColeta.trim() !== '';
    if (!temCodigo && !temDescricao && !temColeta) {
      setMsgFiltro(
        'Informe ao menos um filtro: Código do produto, Descrição do produto ou Nome da coleta.'
      );
      return;
    }
    setMsgFiltro(null);
    setMostrarGradeAnalise(true);
    setHistoricoVisualizado(null);
    setHistoricoDetalheErro(null);
    setLoading(true);
    setErroApi(null);
    setMsgLista(null);
    setLinhas([]);
    setUserInputs({});
    const coletaApi = filterColeta
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .join(', ');
    const aplicadoLocal = {
      codigo: filterCodigo.trim(),
      descricao: filterDescricao.trim(),
      coleta: coletaApi,
    };
    try {
      const r = await listarRessupAlmoxRegistroPreview({
        codigo: aplicadoLocal.codigo || undefined,
        descricao: aplicadoLocal.descricao || undefined,
        coleta: aplicadoLocal.coleta || undefined,
      });
      setAplicado(aplicadoLocal);
      if (r.error) {
        setErroApi(r.error);
        setLinhas([]);
      } else {
        setLinhas(
          r.data.map((row, idx) => ({ ...row, __rowKey: `row-${idx}` }))
        );
        if (r.message && r.data.length === 0) setMsgLista(r.message);
      }
    } catch (e) {
      setErroApi(e instanceof Error ? e.message : String(e));
      setLinhas([]);
    } finally {
      setLoading(false);
      setFiltrosPopoverAberto(false);
    }
  };

  const resumoFiltros =
    aplicado == null
      ? null
      : [
          aplicado.codigo && `Código: ${aplicado.codigo}`,
          aplicado.descricao && `Descrição: ${aplicado.descricao}`,
          aplicado.coleta && `Nome da coleta: ${aplicado.coleta}`,
        ]
          .filter(Boolean)
          .join(' · ');

  const gravarSnapshotAnalise = useCallback(async () => {
    if (!aplicado || linhasOrdenadas.length === 0) return;
    setGravandoAnalise(true);
    setFeedbackGravacao(null);
    const columnDefs = COL_DEFS.map((c) => ({ key: c.key, label: c.label }));
    const displayRows: Record<string, string>[] = linhasOrdenadas.map((row, idx) => {
      const inputs = userInputs[getRowKey(row, idx)];
      const o: Record<string, string> = {};
      for (const c of COL_DEFS) o[c.key] = getRessupCell(row, c.key, inputs);
      return o;
    });
    const rawRows: Record<string, unknown>[] = linhasOrdenadas.map(
      (row) => JSON.parse(JSON.stringify(row)) as Record<string, unknown>
    );
    const userInputsSnapshot: Record<string, RowUserInputs> = {};
    linhasOrdenadas.forEach((row, idx) => {
      const key = getRowKey(row, idx);
      const inputs = userInputs[key];
      if (inputs && Object.keys(inputs).length > 0) {
        userInputsSnapshot[key] = { ...inputs };
      }
    });
    const payload: RessupAlmoxAnalisePayloadV1 & { userInputs?: Record<string, RowUserInputs> } = {
      version: 1,
      columnDefs,
      displayRows,
      rawRows,
      aplicado,
      userInputs: userInputsSnapshot,
      savedUi: {
        colunasOcultas: [...colunasOcultas],
        columnFilters: { ...columnFilters },
        sort: sortState ? { key: sortState.key, direction: sortState.direction } : null,
      },
    };
    try {
      const r = await gravarRessupAlmoxAnalise({
        resumoFiltros: resumoFiltros ?? undefined,
        payload,
      });
      if (!r.ok) {
        setFeedbackGravacao({ ok: false, msg: r.error ?? 'Não foi possível gravar.' });
      } else {
        setHistoricoVersao((v) => v + 1);
        setHistoricoVisualizado({
          id: r.id!,
          createdAt: r.createdAt ?? new Date().toISOString(),
          usuarioLogin: r.usuarioLogin ?? authLogin ?? '',
          resumoFiltros: resumoFiltros ?? null,
          status: 'em_processamento',
          processadoAt: null,
          usuarioLoginProcessado: null,
          concluidoAt: null,
          usuarioLoginConcluido: null,
        });
        setFeedbackGravacao({
          ok: true,
          msg: `Análise gravada (nº ${r.id ?? '?'}) com status "Em processamento". Você pode editar os campos e salvar as alterações.`,
        });
      }
    } catch (e) {
      setFeedbackGravacao({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setGravandoAnalise(false);
    }
  }, [
    aplicado,
    linhasOrdenadas,
    resumoFiltros,
    colunasOcultas,
    columnFilters,
    sortState,
    userInputs,
    getRowKey,
    authLogin,
  ]);

  /** Atualiza o payload de uma análise em_processamento ou processado sem mudar o status. */
  const salvarAlteracoesAnalise = useCallback(async () => {
    if (!historicoVisualizado || historicoVisualizado.status === 'concluido') return;
    if (!aplicado || linhasOrdenadas.length === 0) return;
    setSalvandoAlteracoes(true);
    setFeedbackGravacao(null);
    const columnDefs = COL_DEFS.map((c) => ({ key: c.key, label: c.label }));
    const displayRows: Record<string, string>[] = linhasOrdenadas.map((row, idx) => {
      const inputs = userInputs[getRowKey(row, idx)];
      const o: Record<string, string> = {};
      for (const c of COL_DEFS) o[c.key] = getRessupCell(row, c.key, inputs);
      return o;
    });
    const rawRows: Record<string, unknown>[] = linhasOrdenadas.map(
      (row) => JSON.parse(JSON.stringify(row)) as Record<string, unknown>
    );
    const userInputsSnapshot: Record<string, RowUserInputs> = {};
    linhasOrdenadas.forEach((row, idx) => {
      const key = getRowKey(row, idx);
      const inputs = userInputs[key];
      if (inputs && Object.keys(inputs).length > 0) userInputsSnapshot[key] = { ...inputs };
    });
    const payload: RessupAlmoxAnalisePayloadV1 & { userInputs?: Record<string, RowUserInputs> } = {
      version: 1,
      columnDefs,
      displayRows,
      rawRows,
      aplicado,
      userInputs: userInputsSnapshot,
      savedUi: {
        colunasOcultas: [...colunasOcultas],
        columnFilters: { ...columnFilters },
        sort: sortState ? { key: sortState.key, direction: sortState.direction } : null,
      },
    };
    try {
      const r = await atualizarRessupAlmoxAnalise(historicoVisualizado.id, {
        resumoFiltros: resumoFiltros ?? undefined,
        payload,
      });
      if (!r.ok) {
        setFeedbackGravacao({ ok: false, msg: r.error ?? 'Não foi possível salvar as alterações.' });
      } else {
        setHistoricoVersao((v) => v + 1);
        setFeedbackGravacao({ ok: true, msg: 'Alterações salvas com sucesso.' });
      }
    } catch (e) {
      setFeedbackGravacao({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvandoAlteracoes(false);
    }
  }, [
    historicoVisualizado,
    aplicado,
    linhasOrdenadas,
    resumoFiltros,
    colunasOcultas,
    columnFilters,
    sortState,
    userInputs,
    getRowKey,
  ]);

  /** Muda o status de uma análise em_processamento para processado. */
  const processarAnalise = useCallback(async () => {
    if (!historicoVisualizado || historicoVisualizado.status !== 'em_processamento') return;
    setProcessandoAnalise(true);
    setFeedbackGravacao(null);
    try {
      const r = await processarRessupAlmoxAnalise(historicoVisualizado.id);
      if (!r.ok) {
        setFeedbackGravacao({ ok: false, msg: r.error ?? 'Não foi possível processar a análise.' });
      } else {
        const agora = new Date().toISOString();
        setHistoricoVisualizado((prev) =>
          prev
            ? {
                ...prev,
                status: 'processado',
                processadoAt: agora,
                usuarioLoginProcessado: authLogin ?? '',
              }
            : prev
        );
        setHistoricoVersao((v) => v + 1);
        setFeedbackGravacao({ ok: true, msg: 'Análise marcada como processada. A grade agora está somente leitura.' });
      }
    } catch (e) {
      setFeedbackGravacao({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setProcessandoAnalise(false);
    }
  }, [historicoVisualizado, authLogin]);

  /** Muda o status de uma análise processado para concluido. */
  const concluirAnalise = useCallback(async () => {
    if (!historicoVisualizado || historicoVisualizado.status !== 'processado') return;
    setConcluindoAnalise(true);
    setFeedbackGravacao(null);
    try {
      const r = await concluirRessupAlmoxAnalise(historicoVisualizado.id);
      if (!r.ok) {
        setFeedbackGravacao({ ok: false, msg: r.error ?? 'Não foi possível concluir a análise.' });
      } else {
        const agora = new Date().toISOString();
        setHistoricoVisualizado((prev) =>
          prev
            ? {
                ...prev,
                status: 'concluido',
                concluidoAt: agora,
                usuarioLoginConcluido: authLogin ?? '',
              }
            : prev
        );
        setHistoricoVersao((v) => v + 1);
        setFeedbackGravacao({ ok: true, msg: 'Análise concluída. A grade está totalmente bloqueada para edição.' });
      }
    } catch (e) {
      setFeedbackGravacao({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setConcluindoAnalise(false);
    }
  }, [historicoVisualizado, authLogin]);

  /**
   * Exporta as linhas filtradas/ordenadas para XLSX usando TODAS as colunas (mesmo as ocultas na grade),
   * respeitando apenas o que o usuário ocultou manualmente via o ícone de "olho".
   */
  const exportarExcel = useCallback(() => {
    if (linhasOrdenadas.length === 0) return;
    const colunasExport = COL_DEFS.filter((c) => !colunasOcultas.includes(c.key));
    const headers = colunasExport.map((c) => c.label);
    const rows = linhasOrdenadas.map((row, idx) => {
      const inputs = userInputs[getRowKey(row, idx)];
      return colunasExport.map((c) => {
        const cell = getRessupCell(row, c.key, inputs);
        return cell === '—' ? '' : cell;
      });
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ressup Almox');
    const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    XLSX.writeFile(wb, `ressup-almox-${ts}.xlsx`);
  }, [colunasOcultas, linhasOrdenadas, userInputs, getRowKey]);

  const fecharVisualizacaoHistorico = useCallback(() => {
    detalheHistoricoReqRef.current += 1;
    setHistoricoDetalheCarregando(false);
    setHistoricoDetalheErro(null);
    setHistoricoVisualizado(null);
    setMostrarGradeAnalise(false);
    setLinhas([]);
    setUserInputs({});
    setAplicado(null);
    setFeedbackGravacao(null);
    setColumnFilters({});
    setExcelFilterDrafts({});
    setSortState(null);
    setColunaFiltroAberta(null);
    setMsgLista(null);
    setErroApi(null);
  }, []);

  /**
   * Carrega um snapshot do histórico na MESMA grade usada durante a criação da análise:
   * hidrata `linhas` (rawRows), `aplicado`, `userInputs` e a UI persistida (colunas ocultas,
   * filtros por coluna e ordenação). Mantém a grade editável para que o usuário possa ajustar
   * e, se quiser, gravar como nova análise.
   */
  const abrirDetalheHistorico = useCallback(async (id: number) => {
    const req = ++detalheHistoricoReqRef.current;
    setHistoricoDetalheErro(null);
    setHistoricoDetalheCarregando(true);
    setFeedbackGravacao(null);
    setColunasOcultasOpen(false);
    try {
      const r = await obterRessupAlmoxAnalise(id);
      if (req !== detalheHistoricoReqRef.current) return;
      if (r.error) {
        setHistoricoDetalheErro(r.error);
        return;
      }
      const payload = r.payload;
      if (!payload) {
        setHistoricoDetalheErro('Snapshot sem dados legíveis.');
        return;
      }

      const rawRows = Array.isArray(payload.rawRows) ? payload.rawRows : [];
      const linhasHidr = rawRows.map((row, idx) => {
        const o: Record<string, unknown> = { ...(row as Record<string, unknown>) };
        const k = o.__rowKey;
        if (typeof k !== 'string' || !k) o.__rowKey = `row-${idx}`;
        return o;
      });

      const ui = payload.savedUi ?? null;
      const ocultasValidas = Array.isArray(ui?.colunasOcultas)
        ? ui!.colunasOcultas.filter((k) => chavesValidas.has(k as ColKey))
        : [];
      const filtrosUi = ui?.columnFilters && typeof ui.columnFilters === 'object'
        ? (ui.columnFilters as Record<string, string>)
        : {};
      const sortUi = ui?.sort ?? null;

      const inputsRaw = (payload as RessupAlmoxAnalisePayloadV1 & {
        userInputs?: Record<string, RowUserInputs>;
      }).userInputs;
      const inputs = inputsRaw && typeof inputsRaw === 'object' ? inputsRaw : {};

      setMostrarGradeAnalise(true);
      setLinhas(linhasHidr);
      setAplicado({
        codigo: payload.aplicado?.codigo ?? '',
        descricao: payload.aplicado?.descricao ?? '',
        coleta: payload.aplicado?.coleta ?? '',
      });
      setUserInputs(inputs);
      setColunasOcultas(ocultasValidas);
      setColumnFilters(filtrosUi);
      setExcelFilterDrafts({});
      setSortState(
        sortUi && typeof sortUi === 'object' && 'key' in sortUi
          ? { key: sortUi.key as ColKey, direction: sortUi.direction as 'asc' | 'desc' }
          : null
      );
      setColunaFiltroAberta(null);
      setMsgLista(null);
      setErroApi(null);
      setLoading(false);
      setFiltrosPopoverAberto(false);
      setHistoricoVisualizado({
        id: r.id,
        createdAt: r.createdAt,
        usuarioLogin: r.usuarioLogin,
        resumoFiltros: r.resumoFiltros,
        status: r.status,
        processadoAt: r.processadoAt,
        usuarioLoginProcessado: r.usuarioLoginProcessado,
        concluidoAt: r.concluidoAt,
        usuarioLoginConcluido: r.usuarioLoginConcluido,
      });
    } catch (e) {
      if (req !== detalheHistoricoReqRef.current) return;
      setHistoricoDetalheErro(e instanceof Error ? e.message : String(e));
    } finally {
      if (req === detalheHistoricoReqRef.current) setHistoricoDetalheCarregando(false);
    }
  }, [chavesValidas]);

  const colSpanGrade = Math.max(1, colunasVisiveisLista.length);

  /** Análise totalmente bloqueada para edição */
  const analiseReadOnly = historicoVisualizado?.status === 'concluido';
  /** Análise com edição restrita apenas às colunas de aprovação */
  const apenasAprovEditavel = historicoVisualizado?.status === 'processado';

  const overlayPrincipalAtivo =
    loading || gravandoAnalise || salvandoAlteracoes || processandoAnalise || concluindoAnalise || opcoesCarregando || historicoDetalheCarregando;
  const overlayPrincipalMsg = gravandoAnalise
    ? 'Gravando análise…'
    : salvandoAlteracoes
      ? 'Salvando alterações…'
      : processandoAnalise
        ? 'Processando análise…'
        : concluindoAnalise
          ? 'Concluindo análise…'
          : loading
            ? 'Consultando Nomus (produtos e registro da coleta)…'
            : historicoDetalheCarregando
              ? 'Carregando análise gravada…'
              : opcoesCarregando
                ? 'Carregando opções de filtro…'
                : 'Carregando informações...';

  const historicoListaOverlayAtivo = historicoCarregando;

  return (
    <div className="relative flex flex-col flex-1 min-h-0 p-3 max-w-[1920px] mx-auto w-full">
      <CarregandoInformacoesOverlay show={overlayPrincipalAtivo} mensagem={overlayPrincipalMsg} mode="viewport" />

      <>
        <div className="mb-2 flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between shrink-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div>
                <p className="text-xs font-medium text-primary-600 dark:text-primary-400 uppercase tracking-wide leading-none mb-0.5">PCP</p>
                <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100 leading-tight">Ressup Almox</h1>
              </div>
              {/* Badge de status inline com o título quando há análise aberta */}
              {mostrarGradeAnalise && historicoVisualizado && (
                <span className={`self-end mb-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  historicoVisualizado.status === 'concluido'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                    : historicoVisualizado.status === 'processado'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                }`}>
                  {historicoVisualizado.status === 'concluido' ? '✓ Concluído' : historicoVisualizado.status === 'processado' ? '◎ Processado' : '● Em processamento'}
                </span>
              )}
            </div>
            {/* Subtítulo compacto com metadados da análise */}
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-0">
              {mostrarGradeAnalise && historicoVisualizado ? (
                <>
                  <span><span className="font-medium">Criada em:</span> {fmtIsoDataHora(historicoVisualizado.createdAt)} por {historicoVisualizado.usuarioLogin}</span>
                  {historicoVisualizado.processadoAt && <span><span className="font-medium">Processada por:</span> {historicoVisualizado.usuarioLoginProcessado ?? '—'}</span>}
                  {historicoVisualizado.concluidoAt && <span><span className="font-medium">Concluída por:</span> {historicoVisualizado.usuarioLoginConcluido ?? '—'}</span>}
                  {historicoVisualizado.resumoFiltros && <span><span className="font-medium">Filtros:</span> {historicoVisualizado.resumoFiltros}</span>}
                </>
              ) : mostrarGradeAnalise ? (
                <span>Análise atual — ajuste, grave e exporte os dados do Nomus.</span>
              ) : (
                <span>Histórico de análises gravadas no sistema.</span>
              )}
            </p>
          </div>
          <div ref={novaAnaliseWrapRef} className="flex shrink-0 flex-wrap items-center gap-2 self-start">
            {mostrarGradeAnalise && (
              <button
                type="button"
                onClick={fecharVisualizacaoHistorico}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                title="Voltar para a lista de análises gravadas"
              >
                ← Voltar ao histórico
              </button>
            )}
            <button
              type="button"
              onClick={() => setFiltrosPopoverAberto((o) => !o)}
              className={BTN_PRIMARY}
              aria-expanded={filtrosPopoverAberto}
              aria-haspopup="dialog"
            >
              Nova análise
            </button>
          </div>
        </div>

        {filtrosPopoverAberto && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setFiltrosPopoverAberto(false)}
            role="presentation"
          >
            <div
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-600 dark:bg-slate-800 dark:shadow-black/40 overflow-auto"
              style={{
                resize: 'both',
                overflow: 'auto',
                width: 'min(calc(100vw - 2rem), 72rem)',
                height: 'min(calc(100vh - 4rem), 34rem)',
                minWidth: '20rem',
                minHeight: '16rem',
                maxWidth: 'calc(100vw - 2rem)',
                maxHeight: 'calc(100vh - 2rem)',
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Filtros — nova análise"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Filtros
                </p>
                <button
                  type="button"
                  onClick={() => setFiltrosPopoverAberto(false)}
                  className="ml-2 flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition-colors"
                  aria-label="Fechar painel de filtros"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-end">
                <MultiSelectWithSearch
                  label="Código do Produto"
                  placeholder="Todos"
                  options={opcoesFiltro.codigos}
                  value={filterCodigo}
                  onChange={(v) => setFilterCodigo(v.split(',').map((s) => s.trim()).filter(Boolean).join(', '))}
                  labelClass={labelClass}
                  inputClass={inputClass}
                  minWidth="180px"
                  optionLabel="códigos"
                />
                <MultiSelectWithSearch
                  label="Descrição do Produto"
                  placeholder="Todas"
                  options={opcoesFiltro.descricoes}
                  value={filterDescricao}
                  onChange={(v) => setFilterDescricao(v.split(',').map((s) => s.trim()).filter(Boolean).join(', '))}
                  labelClass={labelClass}
                  inputClass={inputClass}
                  minWidth="200px"
                  optionLabel="descrições"
                />
                <MultiSelectWithSearch
                  label="Nome da coleta"
                  placeholder="Todas"
                  options={opcoesFiltro.coletas}
                  value={filterColeta}
                  onChange={(v) => setFilterColeta(v.split(',').map((s) => s.trim()).filter(Boolean).join(', '))}
                  labelClass={labelClass}
                  inputClass={inputClass}
                  minWidth="200px"
                  optionLabel="coletas"
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleFiltrar()}
                  disabled={loading}
                  className="inline-flex items-center justify-center rounded-lg bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 px-4 py-2 text-sm font-medium hover:bg-slate-700 dark:hover:bg-slate-300 disabled:opacity-50"
                >
                  Filtrar
                </button>
              </div>
              {msgFiltro && (
                <p className="mt-3 text-sm text-amber-700 dark:text-amber-300" role="alert">
                  {msgFiltro}
                </p>
              )}
            </div>
          </div>
        )}

          {!mostrarGradeAnalise && (
            <div className="relative flex-1 min-h-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 p-4 shadow-sm overflow-auto">
              <CarregandoInformacoesOverlay
                show={historicoListaOverlayAtivo}
                mensagem="Carregando informações..."
                mode="contained"
                className="rounded-xl"
              />
              {/* Legenda dos status */}
              <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">● Em processamento</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">Criado, mas ainda sugerindo quantidades e datas.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">◎ Processado</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">Quantidades e datas sugeridas e gravadas, mas pendente análise.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">✓ Concluído</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">Quantidades e datas analisadas e concluídas.</span>
                </div>
              </div>
              {historicoErro && !historicoCarregando && (
                <p className="text-sm text-red-600 dark:text-red-300">{historicoErro}</p>
              )}
              {!historicoCarregando && !historicoErro && historicoLista.length === 0 && (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Nenhuma análise gravada ainda. Use <span className="font-medium">Nova análise</span> para consultar o Nomus e gravar um snapshot.
                </p>
              )}
              {!historicoCarregando && historicoLista.length > 0 && (
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-900/50">
                      <th className="py-2 px-2 font-semibold text-slate-700 dark:text-slate-200">Data</th>
                      <th className="py-2 px-2 font-semibold text-slate-700 dark:text-slate-200">Status</th>
                      <th className="py-2 px-2 font-semibold text-slate-700 dark:text-slate-200">Criado por</th>
                      <th className="py-2 px-2 font-semibold text-slate-700 dark:text-slate-200 text-center">Linhas</th>
                      <th className="py-2 px-2 font-semibold text-slate-700 dark:text-slate-200">Processado por</th>
                      <th className="py-2 px-2 font-semibold text-slate-700 dark:text-slate-200">Concluído por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicoLista.map((h) => {
                      const selecionada = historicoVisualizado?.id === h.id;
                      return (
                        <tr
                          key={h.id}
                          tabIndex={0}
                          aria-selected={selecionada}
                          className={`border-b border-slate-100 dark:border-slate-700 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 ${
                            selecionada
                              ? 'bg-primary-50 dark:bg-primary-900/30'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                          }`}
                          title="Clique para abrir esta análise na grade"
                          onClick={() => void abrirDetalheHistorico(h.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              void abrirDetalheHistorico(h.id);
                            }
                          }}
                        >
                          <td className="py-2 px-2 whitespace-nowrap text-slate-800 dark:text-slate-200">
                            {fmtIsoDataHora(h.createdAt)}
                          </td>
                          <td className="py-2 px-2 whitespace-nowrap">
                            {h.status === 'concluido' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                                ✓ Concluído
                              </span>
                            ) : h.status === 'processado' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                                ◎ Processado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                ● Em processamento
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-slate-800 dark:text-slate-200">{h.usuarioLogin}</td>
                          <td className="py-2 px-2 text-center text-slate-800 dark:text-slate-200">{h.linhaCount}</td>
                          <td className="py-2 px-2 text-slate-500 dark:text-slate-400">
                            {h.usuarioLoginProcessado ?? '—'}
                          </td>
                          <td className="py-2 px-2 text-slate-500 dark:text-slate-400">
                            {h.usuarioLoginConcluido ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

      {mostrarGradeAnalise && (
      <div className="flex flex-col flex-1 min-h-0 gap-1.5">
        {historicoDetalheErro && (
          <p className="text-sm text-red-700 dark:text-red-300 shrink-0" role="alert">
            {historicoDetalheErro}
          </p>
        )}
        {erroApi && (
          <p className="text-sm text-red-700 dark:text-red-300 shrink-0" role="alert">
            {erroApi}
          </p>
        )}
        <div className="flex flex-col flex-1 min-h-0 gap-1">
        <div className="flex flex-wrap items-center justify-between gap-1.5 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            {!analiseReadOnly && (
              <button type="button" onClick={limparFiltrosGrade} className={BTN_PRIMARY} title="Limpar filtros e ordenação da grade (mantém dados carregados)">
                Limpar filtros da grade
              </button>
            )}
            {/* Sem historicoVisualizado = análise nova → botão "Gravar análise" cria registro */}
            {!historicoVisualizado && (
              <button
                type="button"
                onClick={() => void gravarSnapshotAnalise()}
                disabled={gravandoAnalise || linhasOrdenadas.length === 0 || aplicado == null}
                className={BTN_SECONDARY}
                title="Grava no banco local um snapshot (status: em processamento) das linhas exibidas"
              >
                Gravar análise
              </button>
            )}
            {/* Em processamento ou processado → botão "Salvar alterações" atualiza payload existente */}
            {(historicoVisualizado?.status === 'em_processamento' || historicoVisualizado?.status === 'processado') && (
              <button
                type="button"
                onClick={() => void salvarAlteracoesAnalise()}
                disabled={salvandoAlteracoes || linhasOrdenadas.length === 0}
                className={BTN_SECONDARY}
                title="Salva as alterações dos campos editáveis"
              >
                Salvar alterações
              </button>
            )}
            {/* Em processamento → botão "Marcar como Processado" */}
            {historicoVisualizado?.status === 'em_processamento' && (
              <button
                type="button"
                onClick={() => void processarAnalise()}
                disabled={processandoAnalise}
                className="px-3 py-1.5 rounded-lg border border-blue-400 bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600"
                title="Marca como Processado — apenas Qtd Aprov e Data Necess Aprov ficam editáveis"
              >
                Marcar como Processado
              </button>
            )}
            {/* Processado → botão "Concluir análise" */}
            {historicoVisualizado?.status === 'processado' && (
              <button
                type="button"
                onClick={() => void concluirAnalise()}
                disabled={concluindoAnalise}
                className="px-3 py-1.5 rounded-lg border border-emerald-400 bg-emerald-600 text-white font-medium text-sm hover:bg-emerald-700 disabled:opacity-50 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                title="Conclui a análise — todos os campos ficam somente leitura"
              >
                Concluir análise
              </button>
            )}
            <button
              type="button"
              onClick={exportarExcel}
              disabled={linhasOrdenadas.length === 0}
              className="px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-800 font-medium text-sm hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200 dark:hover:bg-emerald-900/50"
              title="Exporta as colunas visíveis (com os valores digitados) para um arquivo XLSX"
            >
              Exportar Excel
            </button>
            {temFiltrosGrade && linhas.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Exibindo {linhasOrdenadas.length} de {linhas.length} linha(s) carregada(s)
              </p>
            )}
          </div>
          {colunasOcultasLista.length > 0 && (
            <div className="relative" ref={colunasOcultasRef}>
              <button
                type="button"
                onClick={() => setColunasOcultasOpen((o) => !o)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                aria-expanded={colunasOcultasOpen}
                aria-haspopup="true"
              >
                Colunas ocultas
                <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700 dark:bg-primary-900/40 dark:text-primary-200">
                  {colunasOcultasLista.length}
                </span>
              </button>
              {colunasOcultasOpen && (
                <div
                  className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-xl dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  role="dialog"
                  aria-label="Reexibir colunas ocultas"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-600">
                    <p className="text-sm font-semibold">Reexibir colunas</p>
                    <button
                      type="button"
                      onClick={reexibirTodasColunas}
                      className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-300"
                    >
                      Reexibir todas
                    </button>
                  </div>
                  <div className="mt-2 max-h-64 overflow-auto">
                    {colunasOcultasLista.map((col) => (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() => reexibirColuna(col.key)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                      >
                        <span className="truncate" title={col.label}>
                          {col.label}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-primary-600 dark:text-primary-300">Reexibir</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {feedbackGravacao && (
          <p
            className={`text-xs sm:text-sm shrink-0 ${feedbackGravacao.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}
            role="status"
          >
            {feedbackGravacao.msg}
          </p>
        )}

        <div className="flex-1 min-h-0 overflow-auto min-w-0 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
          <div ref={tableScrollRef} className="overflow-x-auto max-h-[calc(100vh-10rem)] overflow-y-auto">
            <table className="w-full text-sm text-left border-collapse min-w-[900px]">
              <thead className="sticky top-0 z-20">
                <tr className="bg-primary-600 text-white">
                  {colunasVisiveisLista.map((col) => (
                    <th
                      key={col.key}
                      className="relative py-2 px-1.5 font-semibold border border-primary-500/40 align-middle whitespace-normal break-words"
                    >
                      <div className="flex min-w-0 items-start justify-between gap-1">
                        <span className="min-w-0 flex-1 leading-tight text-[11px] sm:text-xs">{col.label}</span>
                        <span className="flex shrink-0 flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={(e) => abrirFiltroExcel(col.key, e)}
                            className={`rounded border border-white/25 px-1 py-0.5 text-[9px] leading-none hover:bg-white/15 ${
                              columnFilters[col.key] || sortState?.key === col.key ? 'text-amber-200' : 'text-white/90'
                            }`}
                            title="Classificar e filtrar"
                            aria-label={`Classificar e filtrar ${col.label}`}
                          >
                            ▾
                          </button>
                          <button
                            type="button"
                            onClick={() => ocultarColuna(col.key)}
                            disabled={colunasVisiveisLista.length <= 1}
                            className="inline-flex items-center justify-center rounded border border-white/25 px-1 py-0.5 text-white/80 hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                            title="Ocultar coluna"
                            aria-label={`Ocultar coluna ${col.label}`}
                          >
                            <svg className="h-2.5 w-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M3 3l18 18M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58M9.88 5.08A9.77 9.77 0 0112 4c5 0 8.27 4.11 9.54 6.06a1.75 1.75 0 010 1.88 16.2 16.2 0 01-2.1 2.64M6.1 6.1a16.46 16.46 0 00-3.64 3.96 1.75 1.75 0 000 1.88C3.73 13.89 7 18 12 18a9.77 9.77 0 004.17-.94"
                              />
                            </svg>
                          </button>
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-slate-200 divide-y divide-slate-200 dark:divide-slate-600">
                {aplicado == null && !loading && (
                  <tr>
                    <td
                      colSpan={colSpanGrade}
                      className="py-6 px-3 text-center text-slate-500 dark:text-slate-400 text-xs"
                    >
                      Abra <span className="font-medium">Nova análise</span>, defina os filtros (como em Coletas de Preços) e clique em Filtrar para carregar os itens.
                    </td>
                  </tr>
                )}
                {!loading && aplicado != null && linhas.length === 0 && !erroApi && (
                  <tr>
                    <td colSpan={colSpanGrade} className="py-6 px-3 text-center text-slate-600 dark:text-slate-300 text-xs">
                      {msgLista ??
                        `Filtros aplicados: ${resumoFiltros}. Nenhuma linha retornada para esses filtros no Nomus.`}
                    </td>
                  </tr>
                )}
                {!loading && aplicado != null && linhas.length > 0 && linhasOrdenadas.length === 0 && (
                  <tr>
                    <td colSpan={colSpanGrade} className="py-6 px-3 text-center text-slate-500 dark:text-slate-400 text-xs">
                      Nenhuma linha com os filtros da grade. Ajuste ou limpe os filtros por coluna.
                    </td>
                  </tr>
                )}
                {!loading &&
                  linhasOrdenadas.map((row, idx) => {
                    const rowKey = getRowKey(row, idx);
                    const inputs = userInputs[rowKey];
                    /** Tooltips concentram informações ocultas da grade em colunas-âncora. */
                    const tooltipCodigo = `Und Medida: ${getRessupCell(row, 'undMedida', inputs)}`;
                    const tooltipQtdSolicit =
                      `Data Solicit.: ${getRessupCell(row, 'dataSolicit', inputs)}\n` +
                      `Data Necess.: ${getRessupCell(row, 'dataNecess', inputs)}`;
                    const tooltipQtdeUltComp =
                      `Data Ult Entrada: ${getRessupCell(row, 'dataUltEntrada', inputs)}\n` +
                      `Preço Ant: ${getRessupCell(row, 'precoAnt', inputs)}`;
                    return (
                      <tr key={rowKey} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        {colunasVisiveisLista.map((col) => {
                          if (NUMERIC_INPUT_KEYS.has(col.key)) {
                            // qtdeSug: somente leitura quando processado ou concluido
                            // qtdAprov: somente leitura apenas quando concluido
                            const isReadOnly = analiseReadOnly || (apenasAprovEditavel && col.key === 'qtdeSug');
                            if (isReadOnly) {
                              return (
                                <td key={col.key} className="border border-slate-200 dark:border-slate-600 px-1 py-1 align-top text-xs break-words text-right dark:text-slate-200">
                                  {fmtNumeroUsuario(inputs?.[col.key])}
                                </td>
                              );
                            }
                            return (
                              <td
                                key={col.key}
                                className="border border-slate-200 dark:border-slate-600 px-1 py-1 align-top text-xs break-words dark:text-slate-200"
                              >
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step="any"
                                  min={0}
                                  value={inputs?.[col.key] ?? ''}
                                  onChange={(e) => setRowInput(rowKey, col.key, e.target.value)}
                                  onKeyDown={(e) => handleInputEnterKey(e, idx, col.key)}
                                  data-editinput
                                  data-rowkey={rowKey}
                                  data-colkey={col.key}
                                  className="w-full min-w-[5rem] rounded border border-slate-300 bg-white px-1.5 py-1 text-right text-xs text-slate-800 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100"
                                  placeholder="—"
                                  aria-label={col.label}
                                />
                              </td>
                            );
                          }
                          if (DATE_INPUT_KEYS.has(col.key)) {
                            // dataNecessSug: somente leitura quando processado ou concluido
                            // dataNecessAprov: somente leitura apenas quando concluido
                            const isReadOnly = analiseReadOnly || (apenasAprovEditavel && col.key === 'dataNecessSug');
                            if (isReadOnly) {
                              return (
                                <td key={col.key} className="border border-slate-200 dark:border-slate-600 px-1 py-1 align-top text-xs break-words dark:text-slate-200">
                                  {fmtDataUsuario(inputs?.[col.key])}
                                </td>
                              );
                            }
                            return (
                              <td
                                key={col.key}
                                className="border border-slate-200 dark:border-slate-600 px-1 py-1 align-top text-xs break-words dark:text-slate-200"
                              >
                                <input
                                  type="date"
                                  value={inputs?.[col.key] ?? ''}
                                  onChange={(e) => setRowInput(rowKey, col.key, e.target.value)}
                                  onKeyDown={(e) => handleInputEnterKey(e, idx, col.key)}
                                  data-editinput
                                  data-rowkey={rowKey}
                                  data-colkey={col.key}
                                  className="w-full min-w-[8rem] rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-800 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100"
                                  aria-label={col.label}
                                />
                              </td>
                            );
                          }
                          let tooltip: string | undefined;
                          if (col.key === 'codigo') tooltip = tooltipCodigo;
                          else if (col.key === 'qtdSolicit') tooltip = tooltipQtdSolicit;
                          else if (col.key === 'qtdeUltComp') tooltip = tooltipQtdeUltComp;
                          return (
                            <td
                              key={col.key}
                              title={tooltip}
                              className={`border border-slate-200 dark:border-slate-600 px-1 py-1 align-top text-xs break-words dark:text-slate-200 ${
                                tooltip ? 'cursor-help' : ''
                              }`}
                            >
                              {getRessupCell(row, col.key, inputs)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      </div>
      )}
        </>

      {/* Dropdown de filtro por coluna renderizado via portal fora do overflow da tabela */}
      {colunaFiltroAberta && filtroAbertoRect && createPortal(
        <div
          ref={filtroDropdownRef}
          style={{
            position: 'fixed',
            top: Math.min(filtroAbertoRect.top, window.innerHeight - 380),
            left: Math.max(4, Math.min(filtroAbertoRect.left, window.innerWidth - 296)),
            width: 288,
            zIndex: 9999,
          }}
          className="rounded-lg border border-slate-300 bg-white p-2 text-slate-800 shadow-2xl dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => { setSortState({ key: colunaFiltroAberta, direction: 'asc' }); fecharFiltroExcel(); }}
            className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            A↧ Classificar de A a Z
          </button>
          <button
            type="button"
            onClick={() => { setSortState({ key: colunaFiltroAberta, direction: 'desc' }); fecharFiltroExcel(); }}
            className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Z↧ Classificar de Z a A
          </button>
          <div className="my-2 border-t border-slate-200 dark:border-slate-600" />
          <input
            type="text"
            value={excelFilterDrafts[colunaFiltroAberta]?.search ?? ''}
            onChange={(e) =>
              setExcelFilterDrafts((prev) => ({
                ...prev,
                [colunaFiltroAberta]: {
                  search: e.target.value,
                  selected: prev[colunaFiltroAberta]?.selected ?? (valoresUnicosPorColuna[colunaFiltroAberta] ?? []),
                },
              }))
            }
            placeholder="Pesquisar"
            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
            autoFocus
          />
          <div className="mt-2 max-h-44 overflow-auto rounded border border-slate-200 p-1 dark:border-slate-600">
            {(() => {
              const key = colunaFiltroAberta;
              const valores = valoresUnicosPorColuna[key] ?? [];
              const draft = excelFilterDrafts[key] ?? { search: '', selected: valores };
              const visiveis = valores.filter((v) =>
                v.toLowerCase().includes(draft.search.trim().toLowerCase())
              );
              const todosVisiveisSelecionados = visiveis.every((v) => draft.selected.includes(v));
              const toggle = (value: string, checked: boolean) => {
                setExcelFilterDrafts((prev) => {
                  const atual = prev[key] ?? { search: '', selected: valores };
                  const set = new Set(atual.selected);
                  if (checked) set.add(value);
                  else set.delete(value);
                  return { ...prev, [key]: { ...atual, selected: [...set] } };
                });
              };
              return (
                <>
                  <label className="flex items-center gap-2 px-1 py-1 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={todosVisiveisSelecionados}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setExcelFilterDrafts((prev) => {
                          const atual = prev[key] ?? { search: '', selected: valores };
                          const set = new Set(atual.selected);
                          for (const v of visiveis) {
                            if (checked) set.add(v);
                            else set.delete(v);
                          }
                          return { ...prev, [key]: { ...atual, selected: [...set] } };
                        });
                      }}
                    />
                    (Selecionar Tudo)
                  </label>
                  {visiveis.map((value) => (
                    <label key={value} className="flex items-center gap-2 px-1 py-0.5 text-xs">
                      <input
                        type="checkbox"
                        checked={draft.selected.includes(value)}
                        onChange={(e) => toggle(value, e.target.checked)}
                      />
                      <span className="truncate" title={value}>{value}</span>
                    </label>
                  ))}
                </>
              );
            })()}
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => aplicarFiltroExcel(colunaFiltroAberta)}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              OK
            </button>
            <button
              type="button"
              onClick={fecharFiltroExcel}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              Cancelar
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
