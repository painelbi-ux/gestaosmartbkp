import { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from 'react';
import { useOnSincronizado } from '../../hooks/useOnSincronizado';
import {
  listarRessupAlmoxRegistroPreview,
  obterOpcoesFiltroColetas,
  gravarRessupAlmoxAnalise,
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
  { key: 'qtdeEmp', label: 'Qtde Emp' },
  { key: 'cm', label: 'CM' },
  { key: 'dataSolicit', label: 'Data Solicit.' },
  { key: 'dataNecess', label: 'Data Necess.' },
  { key: 'qtdSolicit', label: 'Qtd Solicit.' },
  { key: 'qtdAprov', label: 'Qtd Aprov' },
  { key: 'estoqAtual', label: 'Estoq Atual' },
  { key: 'qtdeUltComp', label: 'Qtde Ultm Comp' },
  { key: 'dataUltEntrada', label: 'Data Ult Entrada' },
  { key: 'precoAnt', label: 'Preço Ant' },
  { key: 'estSeg', label: 'Est Seg' },
  { key: 'pcPend', label: 'PC Pend' },
  { key: 'agPag', label: 'Ag Pag' },
  { key: 'itemCritico', label: 'Item crítico' },
  { key: 'coleta', label: 'Coleta' },
  { key: 'saldoProjetado', label: 'Saldo projetado' },
] as const;

type ColKey = (typeof COL_DEFS)[number]['key'];

type ExcelFilterDraft = { search: string; selected: string[] };

type SortState = { key: ColKey; direction: 'asc' | 'desc' } | null;

const STORAGE_COL_OCULTAS = 'ressupAlmox.colunasOcultas.v1';

const BTN_PRIMARY =
  'px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm transition shrink-0';

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

function getRessupCell(row: Record<string, unknown>, key: ColKey): string {
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
    case 'qtdAprov':
      return fmtNum(
        getRowValue(row, ['Qtde Aprovada', 'qtde aprovada', 'Qtd Confirmada', 'qtd confirmada'])
      );
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

function valueForSort(row: Record<string, unknown>, key: ColKey): string | number {
  const s = getRessupCell(row, key);
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
  const [sortState, setSortState] = useState<SortState>(null);

  const [gravandoAnalise, setGravandoAnalise] = useState(false);
  const [feedbackGravacao, setFeedbackGravacao] = useState<{ ok: boolean; msg: string } | null>(null);
  /** Popover de filtros ao clicar em "Nova análise". */
  const [filtrosPopoverAberto, setFiltrosPopoverAberto] = useState(false);
  /** Exibe a grade após o primeiro "Filtrar" válido. */
  const [mostrarGradeAnalise, setMostrarGradeAnalise] = useState(false);
  /** Recarrega a lista do histórico (ex.: após gravar análise). */
  const [historicoVersao, setHistoricoVersao] = useState(0);
  /** Modal só para visualizar um snapshot (detalhe). */
  const [detalheModalOpen, setDetalheModalOpen] = useState(false);
  const [historicoLista, setHistoricoLista] = useState<RessupAlmoxAnaliseListItem[]>([]);
  const [historicoCarregando, setHistoricoCarregando] = useState(false);
  const [historicoErro, setHistoricoErro] = useState<string | null>(null);
  const [historicoDetalheId, setHistoricoDetalheId] = useState<number | null>(null);
  const [historicoDetalheCarregando, setHistoricoDetalheCarregando] = useState(false);
  const [historicoDetalheErro, setHistoricoDetalheErro] = useState<string | null>(null);
  const [historicoDetalhePayload, setHistoricoDetalhePayload] = useState<RessupAlmoxAnalisePayloadV1 | null>(null);
  const [historicoDetalheMeta, setHistoricoDetalheMeta] = useState<{
    createdAt: string;
    usuarioLogin: string;
    resumoFiltros: string | null;
  } | null>(null);
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
    const onDown = (e: MouseEvent) => {
      if (novaAnaliseWrapRef.current?.contains(e.target as Node)) return;
      setFiltrosPopoverAberto(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFiltrosPopoverAberto(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
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

  const chavesValidas = useMemo(() => new Set(COL_DEFS.map((c) => c.key)), []);

  useEffect(() => {
    const ocultasValidas = colunasOcultas.filter((k) => chavesValidas.has(k));
    if (ocultasValidas.length >= COL_DEFS.length) ocultasValidas.pop();
    if (ocultasValidas.length !== colunasOcultas.length || ocultasValidas.some((k, i) => k !== colunasOcultas[i])) {
      setColunasOcultas(ocultasValidas);
    }
  }, [chavesValidas, colunasOcultas]);

  const colunasVisiveisLista = useMemo(
    () => COL_DEFS.filter((c) => !colunasOcultas.includes(c.key)),
    [colunasOcultas]
  );

  const colunasOcultasLista = useMemo(
    () => COL_DEFS.filter((c) => colunasOcultas.includes(c.key)),
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

  const valoresUnicosPorColuna = useMemo(() => {
    const out: Partial<Record<ColKey, string[]>> = {};
    for (const col of colunasVisiveisLista) {
      const values = new Set<string>();
      for (const row of linhas) values.add(getRessupCell(row, col.key));
      out[col.key] = [...values].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' }));
    }
    return out;
  }, [colunasVisiveisLista, linhas]);

  const abrirFiltroExcel = (key: ColKey) => {
    setColunaFiltroAberta((prev) => {
      if (prev === key) return null;
      const valores = valoresUnicosPorColuna[key] ?? [];
      const filtroAtual = columnFilters[key];
      setExcelFilterDrafts((drafts) => ({
        ...drafts,
        [key]: {
          search: '',
          selected: filtroAtual ? filtroAtual.split('\u0001') : valores,
        },
      }));
      return key;
    });
  };

  const aplicarFiltroExcel = (key: ColKey) => {
    const draft = excelFilterDrafts[key];
    const valores = valoresUnicosPorColuna[key] ?? [];
    if (!draft || draft.selected.length === valores.length) setFiltroColuna(key, '');
    else setFiltroColuna(key, draft.selected.join('\u0001'));
    setColunaFiltroAberta(null);
  };

  const deferredColumnFilters = useDeferredValue(columnFilters);

  const linhasFiltradas = useMemo(() => {
    const filtrosColuna = Object.entries(deferredColumnFilters)
      .map(([key, value]) => [key, value.trim().toLowerCase()] as const)
      .filter(([, value]) => value);
    return linhas.filter((row) => {
      for (const [key, value] of filtrosColuna) {
        const colKey = key as ColKey;
        const cellText = getRessupCell(row, colKey);
        const selected = value.split('\u0001').filter(Boolean);
        if (selected.length > 1 || value.includes('\u0001')) {
          if (!selected.includes(cellText)) return false;
        } else if (!cellText.toLowerCase().includes(value)) return false;
      }
      return true;
    });
  }, [linhas, deferredColumnFilters]);

  const linhasOrdenadas = useMemo(() => {
    if (!sortState) return linhasFiltradas;
    const dir = sortState.direction === 'asc' ? 1 : -1;
    return [...linhasFiltradas].sort((a, b) => {
      const av = valueForSort(a, sortState.key);
      const bv = valueForSort(b, sortState.key);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
    });
  }, [linhasFiltradas, sortState]);

  const temFiltrosGrade =
    Object.keys(columnFilters).length > 0 || sortState != null || colunasOcultas.length > 0;

  const limparFiltrosGrade = () => {
    setColumnFilters({});
    setExcelFilterDrafts({});
    setSortState(null);
    setColunaFiltroAberta(null);
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
    setLoading(true);
    setErroApi(null);
    setMsgLista(null);
    setLinhas([]);
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
        setLinhas(r.data);
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
    const displayRows: Record<string, string>[] = linhasOrdenadas.map((row) => {
      const o: Record<string, string> = {};
      for (const c of COL_DEFS) o[c.key] = getRessupCell(row, c.key);
      return o;
    });
    const rawRows: Record<string, unknown>[] = linhasOrdenadas.map(
      (row) => JSON.parse(JSON.stringify(row)) as Record<string, unknown>
    );
    const payload: RessupAlmoxAnalisePayloadV1 = {
      version: 1,
      columnDefs,
      displayRows,
      rawRows,
      aplicado,
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
        setFeedbackGravacao({
          ok: true,
          msg: `Análise gravada com sucesso (registro nº ${r.id ?? '?'}).`,
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
  ]);

  const fecharDetalheModal = useCallback(() => {
    detalheHistoricoReqRef.current += 1;
    setHistoricoDetalheCarregando(false);
    setDetalheModalOpen(false);
    setHistoricoDetalheId(null);
    setHistoricoDetalhePayload(null);
    setHistoricoDetalheMeta(null);
    setHistoricoDetalheErro(null);
  }, []);

  const abrirDetalheHistorico = useCallback(async (id: number) => {
    const req = ++detalheHistoricoReqRef.current;
    setHistoricoDetalheErro(null);
    setHistoricoDetalheId(id);
    setDetalheModalOpen(true);
    setHistoricoDetalheCarregando(true);
    setHistoricoDetalhePayload(null);
    setHistoricoDetalheMeta(null);
    try {
      const r = await obterRessupAlmoxAnalise(id);
      if (req !== detalheHistoricoReqRef.current) return;
      if (r.error) {
        setHistoricoDetalheErro(r.error);
        return;
      }
      setHistoricoDetalheMeta({
        createdAt: r.createdAt,
        usuarioLogin: r.usuarioLogin,
        resumoFiltros: r.resumoFiltros,
      });
      setHistoricoDetalhePayload(r.payload);
    } catch (e) {
      if (req !== detalheHistoricoReqRef.current) return;
      setHistoricoDetalheErro(e instanceof Error ? e.message : String(e));
    } finally {
      if (req === detalheHistoricoReqRef.current) setHistoricoDetalheCarregando(false);
    }
  }, []);

  const colSpanGrade = Math.max(1, colunasVisiveisLista.length);

  const overlayPrincipalAtivo = loading || gravandoAnalise || opcoesCarregando;
  const overlayPrincipalMsg = gravandoAnalise
    ? 'Gravando análise…'
    : loading
      ? 'Consultando Nomus (produtos e registro da coleta)…'
      : opcoesCarregando
        ? 'Carregando opções de filtro…'
        : 'Carregando informações...';

  const historicoListaOverlayAtivo = historicoCarregando;
  const detalheModalOverlayAtivo = historicoDetalheCarregando;

  return (
    <div className="relative flex flex-col flex-1 min-h-0 p-4 max-w-[1920px] mx-auto w-full">
      <CarregandoInformacoesOverlay show={overlayPrincipalAtivo} mensagem={overlayPrincipalMsg} mode="viewport" />

      <>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between shrink-0">
          <div>
            <p className="text-xs font-medium text-primary-600 dark:text-primary-400 uppercase tracking-wide">PCP</p>
            <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Ressup Almox</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Histórico de análises gravadas no sistema.</p>
          </div>
          <div ref={novaAnaliseWrapRef} className="relative shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setFiltrosPopoverAberto((o) => !o)}
              className={BTN_PRIMARY}
              aria-expanded={filtrosPopoverAberto}
              aria-haspopup="dialog"
            >
              Nova análise
            </button>
            {filtrosPopoverAberto && (
              <div
                className="absolute right-0 top-full z-[55] mt-2 w-[min(100vw-2rem,56rem)] max-h-[min(85vh,560px)] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-600 dark:bg-slate-800 dark:shadow-black/40"
                role="dialog"
                aria-label="Filtros — nova análise"
              >
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                  Filtros
                </p>
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
            )}
          </div>
        </div>

          <div className="relative flex-1 min-h-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 p-4 shadow-sm overflow-auto">
            <CarregandoInformacoesOverlay
              show={historicoListaOverlayAtivo}
              mensagem="Carregando informações..."
              mode="contained"
              className="rounded-xl"
            />
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
                    <th className="py-2 px-2 font-semibold text-slate-700 dark:text-slate-200">Usuário</th>
                    <th className="py-2 px-2 font-semibold text-slate-700 dark:text-slate-200">Qtde de linhas</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoLista.map((h) => (
                    <tr
                      key={h.id}
                      tabIndex={0}
                      className="border-b border-slate-100 dark:border-slate-700 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
                      title="Clique para ver o snapshot gravado"
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
                      <td className="py-2 px-2 text-slate-800 dark:text-slate-200">{h.usuarioLogin}</td>
                      <td className="py-2 px-2 text-slate-800 dark:text-slate-200">{h.linhaCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

      {mostrarGradeAnalise && (
      <div className="mt-6 flex flex-col flex-1 min-h-0 gap-2 border-t border-slate-200 dark:border-slate-700 pt-4">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide shrink-0">
          Análise atual
        </p>
        {erroApi && (
          <p className="text-sm text-red-700 dark:text-red-300 shrink-0" role="alert">
            {erroApi}
          </p>
        )}
      <div className="flex flex-col flex-1 min-h-0 gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={limparFiltrosGrade} className={BTN_PRIMARY} title="Limpar filtros e ordenação da grade (mantém dados carregados)">
              Limpar filtros da grade
            </button>
            <button
              type="button"
              onClick={() => void gravarSnapshotAnalise()}
              disabled={gravandoAnalise || linhasOrdenadas.length === 0 || aplicado == null}
              className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 font-medium text-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
              title="Grava no banco local um snapshot das linhas exibidas (ordem e células atuais) e dos dados brutos do Nomus"
            >
              Gravar análise
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
          <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
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
                            onClick={() => abrirFiltroExcel(col.key)}
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
                      {colunaFiltroAberta === col.key && (
                        <div className="absolute left-1 top-full z-50 mt-1 w-72 rounded-lg border border-slate-300 bg-white p-2 text-slate-800 shadow-xl dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
                          <button
                            type="button"
                            onClick={() => {
                              setSortState({ key: col.key, direction: 'asc' });
                              setColunaFiltroAberta(null);
                            }}
                            className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            A↧ Classificar de A a Z
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSortState({ key: col.key, direction: 'desc' });
                              setColunaFiltroAberta(null);
                            }}
                            className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            Z↧ Classificar de Z a A
                          </button>
                          <div className="my-2 border-t border-slate-200 dark:border-slate-600" />
                          <input
                            type="text"
                            value={excelFilterDrafts[col.key]?.search ?? ''}
                            onChange={(e) =>
                              setExcelFilterDrafts((prev) => ({
                                ...prev,
                                [col.key]: {
                                  search: e.target.value,
                                  selected: prev[col.key]?.selected ?? (valoresUnicosPorColuna[col.key] ?? []),
                                },
                              }))
                            }
                            placeholder="Pesquisar"
                            className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                            autoFocus
                          />
                          <div className="mt-2 max-h-44 overflow-auto rounded border border-slate-200 p-1 dark:border-slate-600">
                            {(() => {
                              const valores = valoresUnicosPorColuna[col.key] ?? [];
                              const draft = excelFilterDrafts[col.key] ?? { search: '', selected: valores };
                              const visiveis = valores.filter((v) =>
                                v.toLowerCase().includes(draft.search.trim().toLowerCase())
                              );
                              const todosVisiveisSelecionados = visiveis.every((v) => draft.selected.includes(v));
                              const toggle = (value: string, checked: boolean) => {
                                setExcelFilterDrafts((prev) => {
                                  const atual = prev[col.key] ?? { search: '', selected: valores };
                                  const set = new Set(atual.selected);
                                  if (checked) set.add(value);
                                  else set.delete(value);
                                  return { ...prev, [col.key]: { ...atual, selected: [...set] } };
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
                                          const atual = prev[col.key] ?? { search: '', selected: valores };
                                          const set = new Set(atual.selected);
                                          for (const v of visiveis) {
                                            if (checked) set.add(v);
                                            else set.delete(v);
                                          }
                                          return { ...prev, [col.key]: { ...atual, selected: [...set] } };
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
                                      <span className="truncate" title={value}>
                                        {value}
                                      </span>
                                    </label>
                                  ))}
                                </>
                              );
                            })()}
                          </div>
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => aplicarFiltroExcel(col.key)}
                              className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                            >
                              OK
                            </button>
                            <button
                              type="button"
                              onClick={() => setColunaFiltroAberta(null)}
                              className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
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
                    const idProduto = Number(getRowValue(row, ['Id Produto', 'id produto', 'idProduto']) ?? 0);
                    const idSol = getRowValue(row, ['Id Solicitação', 'Id Solicitacao', 'id solicitacao']);
                    const key = `${idProduto}-${String(idSol ?? idx)}-${idx}`;
                    return (
                      <tr key={key} className="hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        {colunasVisiveisLista.map((col) => (
                          <td
                            key={col.key}
                            className="border border-slate-200 dark:border-slate-600 px-1 py-1 align-top text-xs break-words dark:text-slate-200"
                          >
                            {getRessupCell(row, col.key)}
                          </td>
                        ))}
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

      {detalheModalOpen && historicoDetalheId != null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
          onClick={fecharDetalheModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ressup-historico-detalhe-titulo"
        >
          <div
            className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-600">
              <h2 id="ressup-historico-detalhe-titulo" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Análise #{historicoDetalheId}
              </h2>
              <button
                type="button"
                onClick={fecharDetalheModal}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Fechar
              </button>
            </div>
            <div className="relative min-h-0 flex-1 overflow-auto p-4">
              <CarregandoInformacoesOverlay
                show={detalheModalOverlayAtivo}
                mensagem="Carregando snapshot…"
                mode="contained"
              />
              {historicoDetalheErro && (
                <p className="mb-3 text-sm text-red-600 dark:text-red-300">{historicoDetalheErro}</p>
              )}
              {!historicoDetalheCarregando && historicoDetalheMeta && (
                <div className="mb-4 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                  <p>
                    <span className="font-medium">Data:</span> {fmtIsoDataHora(historicoDetalheMeta.createdAt)}
                  </p>
                  <p>
                    <span className="font-medium">Usuário:</span> {historicoDetalheMeta.usuarioLogin}
                  </p>
                </div>
              )}
              {!historicoDetalheCarregando && historicoDetalhePayload && (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
                  <table className="w-full text-xs border-collapse min-w-[900px]">
                    <thead className="bg-primary-600 text-white">
                      <tr>
                        {historicoDetalhePayload.columnDefs.map((c) => (
                          <th
                            key={c.key}
                            className="border border-primary-500/40 px-1 py-1.5 font-semibold text-center whitespace-normal break-words"
                          >
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {historicoDetalhePayload.displayRows.map((dr, i) => (
                        <tr key={i} className="border-b border-slate-200 dark:border-slate-600">
                          {historicoDetalhePayload.columnDefs.map((c) => (
                            <td
                              key={c.key}
                              className="border border-slate-200 px-1 py-1 align-top break-words text-slate-800 dark:text-slate-200 dark:border-slate-600"
                            >
                              {dr[c.key] ?? '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!historicoDetalheCarregando && !historicoDetalhePayload && !historicoDetalheErro && (
                <p className="text-sm text-amber-700 dark:text-amber-300">Snapshot sem dados legíveis.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
