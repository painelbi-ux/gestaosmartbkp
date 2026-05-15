import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { Pedido, HistoricoItem } from '../api/pedidos';
import { obterHistorico } from '../api/pedidos';
import { MensagemSemRegistros } from './MensagemSemRegistros';

type SortDir = 'asc' | 'desc';

/** Colunas: ordem com 4 datas (mesma sequência do Excel) entre Saldo a Faturar Real e Status. */
const COLUMNS: Array<{
  id: string;
  label: string;
  keys?: string[];
  getValue?: (p: Pedido) => string | number | unknown;
}> = [
  { id: 'observacoes', label: 'Rota', keys: ['Observacoes', 'Observacoes ', 'Observações'] },
  { id: 'pd', label: 'Pedido', keys: ['PD'] },
  { id: 'cliente', label: 'Cliente', keys: ['Cliente'] },
  { id: 'cod', label: 'Código', keys: ['Cod'] },
  { id: 'descricao', label: 'Descrição do produto', keys: ['Descricao do produto'] },
  { id: 'setor_producao', label: 'Setor de produção', keys: ['Setor de Producao', 'Setor de produção'] },
  { id: 'stauts', label: 'Status (ERP)', keys: ['Stauts', 'Status'] },
  { id: 'uf', label: 'UF', keys: ['UF'] },
  { id: 'municipio', label: 'Município de entrega', keys: ['Municipio de entrega'] },
  { id: 'qtde_pendente_real', label: 'Qtde Pendente Real', keys: ['Qtde Pendente Real'] },
  { id: 'valor_pendente_real', label: 'Saldo a Faturar Real', keys: ['Saldo a Faturar Real', 'Valor Pendente Real'] },
  { id: 'emissao', label: 'Emissão', keys: ['Emissao', 'emissao'] },
  { id: 'data_original', label: 'Data original', keys: ['Data de entrega', 'dataParametro'] },
  { id: 'previsao_anterior', label: 'Previsão anterior', getValue: (p) => p.previsao_anterior ?? p.previsao_entrega },
  { id: 'previsao_atual', label: 'Previsão atual', getValue: (p) => p.previsao_entrega_atualizada ?? p.previsao_entrega },
  { id: 'status', label: 'Status', keys: [] },
  { id: 'historico', label: 'Histórico', keys: [] },
  { id: 'acao', label: 'Ação', keys: [] },
];

/** Colunas que entram no subtotal do rodapé (soma dos valores filtrados). */
const SUBTOTAL_COLUMN_IDS = ['valor_pendente_real', 'qtde_pendente_real'];

/** Formata data sem mudar o dia por causa do fuso (ex.: 25/02 não vira 24/02). */
function formatDate(value: string | Date): string {
  if (value == null) return '-';
  const s = typeof value === 'string' ? value : value.toISOString?.() ?? '';
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR');
}

/** Formata número: inteiro para qtde, 2 decimais para valor. */
function formatNum(colId: string, value: unknown): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  if (colId === 'valor_pendente_real') {
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (colId === 'qtde_pendente_real') {
    return Math.round(n).toLocaleString('pt-BR');
  }
  return String(value);
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR');
}

interface TabelaPedidosProps {
  pedidos: Pedido[];
  loading?: boolean;
  onAjustar?: (pedido: Pedido) => void;
  /** Quando definido, exibe coluna de seleção para reprogramação em lote. */
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  /** Classificação personalizada: níveis (coluna + asc/desc) definidos no popup "Classificar". A grade é ordenada por estes níveis. */
  sortLevels?: { id: string; dir: SortDir }[] | null;
  /** Quando definido, o clique no cabeçalho da coluna atualiza a classificação (primeiro nível) em vez de só estado local. */
  onSortLevelsChange?: (levels: { id: string; dir: SortDir }[]) => void;
}

function getField(row: Pedido, keys: string[]): string {
  for (const k of keys) {
    const v = row[k as keyof Pedido];
    if (v != null && String(v).length > 0) return String(v);
  }
  return '';
}

function compareSort(a: string | number | unknown, b: string | number | unknown): number {
  const da = typeof a === 'string' ? new Date(a).getTime() : NaN;
  const db = typeof b === 'string' ? new Date(b).getTime() : NaN;
  if (!Number.isNaN(da) && !Number.isNaN(db)) return da - db;
  const sa = a == null ? '' : String(a);
  const sb = b == null ? '' : String(b);
  return sa.localeCompare(sb, undefined, { numeric: true });
}

const DATE_COLUMN_IDS = ['emissao', 'data_original', 'previsao_anterior', 'previsao_atual'];

/** Ordem de classificação padrão: 1.Previsão atual (mais antigo→novo), 2.Observações, 3.PD, 4.Descrição. */
export const SORT_LEVELS_DEFAULT: { id: string; dir: SortDir }[] = [
  { id: 'previsao_atual', dir: 'asc' },
  { id: 'observacoes', dir: 'asc' },
  { id: 'pd', dir: 'asc' },
  { id: 'descricao', dir: 'asc' },
];

/** Colunas que podem ser usadas na classificação (todas exceto Histórico e Ação). */
export const COLUMNS_SORTABLE = COLUMNS.filter(
  (c) => (c.keys?.length || c.getValue) && !['historico', 'acao'].includes(c.id)
).map((c) => ({ id: c.id, label: c.label }));

export type SortLevel = { id: string; dir: SortDir };

function getSortValue(p: Pedido, colId: string): string | number {
  const col = COLUMNS.find((c) => c.id === colId);
  if (!col) return '';
  const raw = col.getValue ? col.getValue(p) : getField(p, col.keys ?? []);
  if (raw == null || raw === '') return DATE_COLUMN_IDS.includes(colId) ? Number.MAX_SAFE_INTEGER : '';
  if (DATE_COLUMN_IDS.includes(colId)) {
    const d = typeof raw === 'string' ? new Date(raw) : raw;
    return Number.isNaN((d as Date).getTime()) ? Number.MAX_SAFE_INTEGER : (d as Date).getTime();
  }
  return String(raw);
}

function comparePedidos(a: Pedido, b: Pedido, levels: { id: string; dir: SortDir }[]): number {
  for (const { id, dir } of levels) {
    const va = getSortValue(a, id);
    const vb = getSortValue(b, id);
    let cmp: number;
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb;
    } else {
      cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
    }
    if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
  }
  return 0;
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function normIdPedido(p: { id_pedido?: string | number }): string {
  const v = p.id_pedido;
  if (v == null) return '';
  return String(v).trim();
}

export default function TabelaPedidos({ pedidos = [], loading, onAjustar, selectedIds, onSelectionChange, sortLevels, onSortLevelsChange }: TabelaPedidosProps) {
  const lista = Array.isArray(pedidos) ? pedidos : [];
  const showSelection = Boolean(onSelectionChange);
  const [sortBy, setSortBy] = useState<string | null>('previsao_atual');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [historicoPedidoId, setHistoricoPedidoId] = useState<string | null>(null);
  const [historicoPedido, setHistoricoPedido] = useState<Pedido | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [historicoError, setHistoricoError] = useState<string | null>(null);

  const historicoOrdenado = useMemo(() => {
    return [...historico].sort((a, b) => {
      const ta = new Date(a.data_ajuste).getTime();
      const tb = new Date(b.data_ajuste).getTime();
      if (tb !== ta) return tb - ta;
      return (b.id ?? 0) - (a.id ?? 0);
    });
  }, [historico]);

  const toggleSelectAll = useCallback(() => {
    if (!onSelectionChange || selectedIds == null) return;
    const allSelected = lista.length > 0 && lista.every((p) => selectedIds.has(normIdPedido(p)));
    const next = new Set(selectedIds);
    if (allSelected) {
      lista.forEach((p) => next.delete(normIdPedido(p)));
    } else {
      lista.forEach((p) => next.add(normIdPedido(p)));
    }
    onSelectionChange(next);
  }, [lista, selectedIds, onSelectionChange]);

  const toggleSelectOne = useCallback(
    (id: string) => {
      if (!onSelectionChange || selectedIds == null) return;
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange]
  );

  const headerCheckRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    const el = headerCheckRef.current;
    if (!el) return;
    const some = lista.length > 0 && lista.some((p) => selectedIds?.has(normIdPedido(p)));
    const all = lista.length > 0 && lista.every((p) => selectedIds?.has(normIdPedido(p)));
    el.indeterminate = some && !all;
  }, [lista, selectedIds]);

  const toggleSort = useCallback(
    (colId: string) => {
      const useCustomLevels = Array.isArray(sortLevels) && sortLevels.length > 0 && onSortLevelsChange;
      if (useCustomLevels) {
        const currentFirst = sortLevels[0];
        const newDir =
          currentFirst?.id === colId
            ? currentFirst.dir === 'asc'
              ? ('desc' as SortDir)
              : ('asc' as SortDir)
            : ('asc' as SortDir);
        const rest = sortLevels.filter((l) => l.id !== colId);
        onSortLevelsChange([{ id: colId, dir: newDir }, ...rest]);
        return;
      }
      setSortBy((prev) => {
        if (prev === colId) {
          setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
          return colId;
        }
        setSortDir('asc');
        return colId;
      });
    },
    [sortLevels, onSortLevelsChange]
  );

  // Classificação: níveis de ordenação do popup "Classificar" (ou padrão). A grade é exibida nesta ordem.
  const levelsToUse = useMemo((): { id: string; dir: SortDir }[] => {
    if (Array.isArray(sortLevels) && sortLevels.length > 0) {
      return sortLevels.map((l) => ({ id: l.id, dir: l.dir }));
    }
    if (sortBy && sortDir) {
      return [
        { id: sortBy, dir: sortDir },
        ...SORT_LEVELS_DEFAULT.filter((l) => l.id !== sortBy).map((l) => ({ id: l.id, dir: 'asc' as SortDir })),
      ];
    }
    return SORT_LEVELS_DEFAULT;
  }, [sortLevels, sortBy, sortDir]);

  const sortedList = useMemo(() => {
    return [...lista].sort((a, b) => comparePedidos(a, b, levelsToUse));
  }, [lista, levelsToUse]);

  /** Para o cabeçalho: quando a classificação personalizada está ativa, mostrar o primeiro nível. */
  const effectiveSortBy = (Array.isArray(sortLevels) && sortLevels.length > 0 ? levelsToUse[0]?.id : sortBy) ?? null;
  const effectiveSortDir = (Array.isArray(sortLevels) && sortLevels.length > 0 ? levelsToUse[0]?.dir : sortDir) ?? 'asc';

  const subtotais = useMemo(() => {
    const out: Record<string, number> = {};
    for (const colId of SUBTOTAL_COLUMN_IDS) {
      out[colId] = 0;
    }
    for (const p of sortedList) {
      for (const colId of SUBTOTAL_COLUMN_IDS) {
        const col = COLUMNS.find((c) => c.id === colId);
        if (!col) continue;
        const raw = col.getValue ? col.getValue(p) : getField(p, col.keys ?? []);
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isNaN(n)) out[colId] += n;
      }
    }
    return out;
  }, [sortedList]);

  const onVerHistorico = useCallback(async (pedido: Pedido) => {
    const idPedido = pedido.id_pedido;
    setHistoricoPedidoId(idPedido);
    setHistoricoPedido(pedido);
    setHistoricoError(null);
    setLoadingHistorico(true);
    try {
      const data = await obterHistorico(idPedido);
      setHistorico(data);
    } catch (e) {
      setHistoricoError(e instanceof Error ? e.message : 'Erro ao carregar histórico.');
      setHistorico([]);
    } finally {
      setLoadingHistorico(false);
    }
  }, []);

  const fecharModalHistorico = useCallback(() => {
    setHistoricoPedidoId(null);
    setHistoricoPedido(null);
    setHistorico([]);
    setHistoricoError(null);
  }, []);
  if (loading) {
    return (
      <div className="tabela-pedidos-outer min-w-0 w-full flex-1 flex flex-col overflow-hidden" style={{ width: '100%', minWidth: 0 }}>
        <div className="tabela-pedidos-scroll overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 block min-w-0" style={{ width: '100%', maxWidth: '100%' }}>
          <table className="w-full text-left text-sm min-w-[800px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-600">
                {showSelection && (
                  <th className="p-3 w-10 text-slate-500 dark:text-slate-400 font-medium">
                    <span className="sr-only">Seleção</span>
                  </th>
                )}
                {COLUMNS.map((col) => (
                  <th key={col.id} className="p-3 text-slate-500 dark:text-slate-400 font-medium">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={COLUMNS.length + (showSelection ? 1 : 0)} className="p-8 text-center text-slate-500 dark:text-slate-400">
                  Carregando...
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (pedidos.length === 0) {
    return (
      <div className="tabela-pedidos-outer min-w-0 w-full flex-1 flex flex-col overflow-hidden" style={{ width: '100%', minWidth: 0 }}>
        <div className="w-full p-4">
          <MensagemSemRegistros />
        </div>
      </div>
    );
  }

  const mostraOverlayAtualizando = loading && lista.length > 0;

  return (
    <>
    <div className="tabela-pedidos-outer min-w-0 w-full flex-1 flex flex-col overflow-hidden" style={{ width: '100%', minWidth: 0 }}>
      <div
        className="tabela-pedidos-scroll relative overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/50 bg-white dark:bg-slate-800/50 block min-w-0"
        style={{ width: '100%', maxWidth: '100%' }}
      >
        {mostraOverlayAtualizando && (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/90 dark:bg-slate-800/90 backdrop-blur-[2px]"
            style={{ animation: 'fadeIn 0.2s ease-out' }}
            aria-live="polite"
            aria-busy="true"
          >
            <div className="flex flex-col items-center gap-2 text-primary-600 dark:text-primary-400">
              <span className="inline-block w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium">Atualizando...</span>
            </div>
          </div>
        )}
        <table className="w-full min-w-[800px] text-left text-sm" style={{ width: '100%' }}>
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-600">
            {showSelection && (
              <th className="p-3 w-10 text-slate-500 dark:text-slate-400 font-medium">
                <label className="flex items-center justify-center cursor-pointer">
                  <input
                    ref={headerCheckRef}
                    type="checkbox"
                    checked={lista.length > 0 && lista.every((p) => selectedIds?.has(normIdPedido(p)))}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-300 dark:border-slate-500 text-primary-600 focus:ring-primary-500"
                    aria-label="Selecionar todos da página"
                  />
                </label>
              </th>
            )}
            {COLUMNS.map((col) => {
              const sortable = col.keys?.length || col.getValue;
              const isActive = effectiveSortBy === col.id;
              return (
                <th
                  key={col.id}
                  className={`p-3 text-slate-500 dark:text-slate-400 font-medium ${col.id === 'historico' ? 'w-10' : ''} ${sortable ? 'cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/50' : ''}`}
                  onClick={sortable ? () => toggleSort(col.id) : undefined}
                  role={sortable ? 'button' : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortable && isActive && (
                      <span className="text-primary-600" aria-hidden>{effectiveSortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedList.map((p) => (
            <tr key={p.id_pedido} className="border-b border-slate-200 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
              {showSelection && (
                <td className="p-3 w-10">
                  <label className="flex items-center justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds?.has(normIdPedido(p)) ?? false}
                      onChange={() => toggleSelectOne(normIdPedido(p))}
                      className="rounded border-slate-300 dark:border-slate-500 text-primary-600 focus:ring-primary-500"
                      aria-label={`Selecionar pedido ${normIdPedido(p)}`}
                    />
                  </label>
                </td>
              )}
              {COLUMNS.map((col) => {
                if (col.id === 'status') {
                  const status = (p['Status'] ?? p['StatusPedido'] ?? p['statusPedido']) as string | undefined;
                  const texto = status?.trim() || '—';
                  const atrasado = texto.toLowerCase() === 'atrasado';
                  return (
                    <td key={col.id} className="p-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                          atrasado ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}
                      >
                        {texto === 'Em dia' ? 'No prazo' : texto}
                      </span>
                    </td>
                  );
                }
                if (col.id === 'historico') {
                  return (
                    <td key={col.id} className="p-3">
                      <button
                        type="button"
                        onClick={() => onVerHistorico(p)}
                        className="rounded p-1.5 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600/50 hover:text-slate-700 dark:hover:text-slate-200 transition"
                        title="Ver histórico de alterações"
                        aria-label="Ver histórico"
                      >
                        <ClockIcon />
                      </button>
                    </td>
                  );
                }
                if (col.id === 'acao') {
                  return (
                    <td key={col.id} className="p-3">
                      {onAjustar ? (
                        <button
                          type="button"
                          onClick={() => onAjustar(p)}
                          className="rounded-lg bg-primary-600/80 hover:bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition whitespace-nowrap"
                        >
                          Ajustar previsão
                        </button>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  );
                }
                const raw = col.getValue ? col.getValue(p) : getField(p, col.keys ?? []);
                const isDate = DATE_COLUMN_IDS.includes(col.id);
                const isNum = ['valor_pendente_real', 'qtde_pendente_real'].includes(col.id);
                const display = isDate ? formatDate(raw as string) : isNum ? formatNum(col.id, raw) : (raw == null || String(raw) === '' ? '—' : String(raw));
                // Badges na coluna "Previsão atual":
                //  - Override por rota: o ajuste vale apenas nesta carrada (cinza, informativo).
                //  - Carrada migrada: existem ajustes por rota em carradas que não aparecem mais (âmbar, atenção).
                if (col.id === 'previsao_atual') {
                  const isOverride = p.origem_ultimo_ajuste === 'override';
                  const migrada = Array.isArray(p.carrada_migrada) ? p.carrada_migrada : null;
                  const migradaTitle = migrada && migrada.length > 0
                    ? `Este pedido tem ajustes em rotas que não aparecem mais:\n${migrada.map((m) => `  • ${m.rota} → ${formatDate(m.previsao)}`).join('\n')}\nRevise a previsão para a nova carrada.`
                    : '';
                  return (
                    <td key={col.id} className={`p-3 text-slate-700 dark:text-slate-200 ${isNum ? 'text-right tabular-nums' : ''}`}>
                      <span className="inline-flex items-center gap-1.5">
                        <span>{display}</span>
                        {isOverride && (
                          <span
                            className="inline-flex items-center rounded-full bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-300"
                            title="Ajuste aplicado apenas nesta rota (override). Outras rotas mantêm a previsão base."
                          >
                            rota
                          </span>
                        )}
                        {migrada && migrada.length > 0 && (
                          <span
                            role="img"
                            aria-label="Carrada migrada"
                            title={migradaTitle}
                            className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                          </span>
                        )}
                      </span>
                    </td>
                  );
                }
                return (
                  <td key={col.id} className={`p-3 text-slate-700 dark:text-slate-200 ${isNum ? 'text-right tabular-nums' : ''}`}>
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700/60 font-medium">
            {showSelection && <td className="p-3 w-10" />}
            {COLUMNS.map((col) => {
              if (col.id === 'observacoes') {
                return (
                  <td key={col.id} className="p-3 text-slate-700 dark:text-slate-200">
                    Subtotal
                  </td>
                );
              }
              if (SUBTOTAL_COLUMN_IDS.includes(col.id)) {
                const total = subtotais[col.id] ?? 0;
                const display = formatNum(col.id, total);
                return (
                  <td key={col.id} className="p-3 text-slate-700 dark:text-slate-200 text-right tabular-nums">
                    {display}
                  </td>
                );
              }
              return <td key={col.id} className="p-3" />;
            })}
          </tr>
        </tfoot>
      </table>
      </div>
    </div>

    {historicoPedidoId != null && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onClick={fecharModalHistorico}
        onKeyDown={(e) => e.key === 'Escape' && fecharModalHistorico()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-historico-title"
      >
        <div
          className="w-full max-w-lg max-h-[80vh] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-600 p-4">
            <h2 id="modal-historico-title" className="text-slate-800 dark:text-slate-100">
              <span className="block text-lg font-semibold">Histórico de alterações</span>
              {historicoPedido ? (() => {
                const pd = getField(historicoPedido, ['PD']);
                const cod = getField(historicoPedido, ['Cod']);
                const cliente = getField(historicoPedido, ['Cliente', 'cliente']) || (historicoPedido.cliente && String(historicoPedido.cliente).trim()) || '';
                const parts = [];
                if (pd) parts.push(`Pedido: ${pd}`);
                if (cod) parts.push(`Código: ${cod}`);
                if (cliente) parts.push(`Cliente: ${cliente}`);
                if (!parts.length) return <span className="text-sm font-normal">{historicoPedidoId}</span>;
                return (
                  <span className="block text-sm font-normal mt-0.5 space-y-0.5">
                    {parts.map((p, i) => (
                      <span key={i} className="block">{p}</span>
                    ))}
                  </span>
                );
              })() : <span className="text-sm font-normal">{historicoPedidoId}</span>}
            </h2>
            <button
              type="button"
              onClick={fecharModalHistorico}
              className="rounded p-1 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Fechar"
            >
              <span className="text-xl leading-none">×</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {loadingHistorico && (
              <p className="text-slate-500 dark:text-slate-400 text-center py-4">Carregando...</p>
            )}
            {historicoError && (
              <p className="text-amber-400 text-center py-4">{historicoError}</p>
            )}
            {!loadingHistorico && !historicoError && historico.length === 0 && (
              <p className="text-slate-500 dark:text-slate-400 text-center py-4">Nenhuma alteração registrada.</p>
            )}
            {!loadingHistorico && historicoOrdenado.length > 0 && (
              <ul className="space-y-3">
                {historicoOrdenado.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 p-3 text-sm"
                  >
                    <div className="flex justify-between text-slate-600 dark:text-slate-300">
                      <span>{formatDateTime(item.data_ajuste)}</span>
                      <span className="text-slate-500 dark:text-slate-400">{item.usuario}</span>
                    </div>
                    <div className="mt-1 text-slate-700 dark:text-slate-200">
                      Nova previsão: <strong>{formatDate(item.previsao_nova)}</strong>
                    </div>
                    {item.motivo && (
                      <div className="mt-1 text-slate-500 dark:text-slate-400">Motivo: {item.motivo}</div>
                    )}
                    {item.observacao && (
                      <div className="mt-1 text-slate-500 dark:text-slate-400">Observação: {item.observacao}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
