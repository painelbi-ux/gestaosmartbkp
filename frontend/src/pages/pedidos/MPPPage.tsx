import { useEffect, useState, useCallback } from 'react';
import { getMpp, type MppRow } from '../../api/mpp';

const COLUNAS: { key: string; label: string; integer?: boolean; decimal?: number; lastColumn?: boolean }[] = [
  { key: 'Codigo_pedido', label: 'Código pedido' },
  { key: 'Codigo_produto', label: 'Código produto' },
  { key: 'codigoComponente', label: 'Cód. componente' },
  { key: 'componente', label: 'Componente' },
  { key: 'unidademedida', label: 'UM' },
  { key: 'Quantidade', label: 'Qtde Pedido', decimal: 3 },
  { key: 'qtd', label: 'Qtd Unitária do Componente', decimal: 3 },
  { key: 'qtdTotalComponente', label: 'Qtd Total do Componente', decimal: 3 },
  { key: 'qtdAcumulado', label: 'Quantidade Acumulada', decimal: 3 },
  { key: 'Estoque_PA', label: 'Estoque PA', decimal: 3 },
  { key: 'Estoque_MP_PA', label: 'Estoque MP PA', decimal: 3 },
  { key: 'dataPrevisao', label: 'Data de Previsão', lastColumn: true },
];

function formatCell(val: unknown, opts?: { integer?: boolean; decimal?: number }): string {
  if (val == null) return '—';
  if (opts?.integer) {
    const n = Number(val);
    if (Number.isNaN(n)) return '—';
    return String(Math.round(n));
  }
  if (typeof opts?.decimal === 'number') {
    const n = Number(val);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: opts.decimal, maximumFractionDigits: opts.decimal });
  }
  if (val instanceof Date) return val.toLocaleDateString('pt-BR');
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    if (d && m && y) return `${d}/${m}/${y}`;
  }
  if (typeof val === 'object') return String(val);
  return s;
}

const PAGE_SIZE = 200;

/** Cache da última carga: ao voltar na aba, restaura sem nova requisição. Só recarrega ao clicar em Atualizar. */
let mppCache: { data: MppRow[]; page: number; total?: number; hasMore: boolean } | null = null;

export default function MPPPage() {
  const [data, setData] = useState<MppRow[]>(() => mppCache?.data ?? []);
  const [page, setPage] = useState(() => mppCache?.page ?? 1);
  const [total, setTotal] = useState<number | undefined>(() => mppCache?.total);
  const [hasMore, setHasMore] = useState(() => mppCache?.hasMore ?? false);
  const [loading, setLoading] = useState(() => !mppCache);
  const [erro, setErro] = useState<string | null>(null);
  const [filterCodigoPedido, setFilterCodigoPedido] = useState('');
  const [filterCodigoProduto, setFilterCodigoProduto] = useState('');
  const [filterCliente, setFilterCliente] = useState('');
  const [filterSegmentacao, setFilterSegmentacao] = useState('');
  const [filterCodigoComponente, setFilterCodigoComponente] = useState('');
  const [filterComponente, setFilterComponente] = useState('');
  const [apenasComPrevisao, setApenasComPrevisao] = useState(false);

  const getFiltros = () => ({
    codigo_pedido: filterCodigoPedido.trim() || undefined,
    codigo_produto: filterCodigoProduto.trim() || undefined,
    cliente: filterCliente.trim() || undefined,
    segmentacao: filterSegmentacao.trim() || undefined,
    codigo_componente: filterCodigoComponente.trim() || undefined,
    componente: filterComponente.trim() || undefined,
    apenas_com_previsao: apenasComPrevisao || undefined,
  });

  const carregar = useCallback(
    async (
      pagina: number,
      filtros?: { codigo_pedido?: string; codigo_produto?: string; cliente?: string; segmentacao?: string; codigo_componente?: string; componente?: string; apenas_com_previsao?: boolean }
    ) => {
    setLoading(true);
    setErro(null);
    const f = filtros ?? getFiltros();
    try {
      const res = await getMpp({ page: pagina, pageSize: PAGE_SIZE, ...f });
      const newData = Array.isArray(res.data) ? res.data : [];
      setData(newData);
      setHasMore(res.hasMore ?? false);
      setTotal(res.total);
      setPage(res.page ?? pagina);
      mppCache = { data: newData, page: res.page ?? pagina, total: res.total, hasMore: res.hasMore ?? false };
    } catch (e) {
      setData([]);
      setErro(e instanceof Error ? e.message : 'Erro ao carregar MPP.');
    } finally {
      setLoading(false);
    }
  },
    []
  );

  useEffect(() => {
    if (mppCache) {
      setData(mppCache.data);
      setPage(mppCache.page);
      setTotal(mppCache.total);
      setHasMore(mppCache.hasMore);
      setLoading(false);
    } else {
      carregar(1, getFiltros());
    }
  }, []);

  const irParaPagina = (novaPagina: number) => {
    if (novaPagina < 1) return;
    setPage(novaPagina);
    carregar(novaPagina, getFiltros());
  };

  const aplicarFiltros = () => {
    setPage(1);
    carregar(1, getFiltros());
  };

  const temFiltros =
    filterCodigoPedido.trim() !== '' ||
    filterCodigoProduto.trim() !== '' ||
    filterCliente.trim() !== '' ||
    filterSegmentacao.trim() !== '' ||
    filterCodigoComponente.trim() !== '' ||
    filterComponente.trim() !== '' ||
    apenasComPrevisao;

  const limparFiltros = () => {
    setFilterCodigoPedido('');
    setFilterCodigoProduto('');
    setFilterCliente('');
    setFilterSegmentacao('');
    setFilterCodigoComponente('');
    setFilterComponente('');
    setApenasComPrevisao(false);
    setPage(1);
    carregar(1, {});
  };

  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 p-6">
        <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 min-h-[320px]">
          <div className="flex flex-col items-center gap-6">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-4 border-primary-200 dark:border-primary-800" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary-600 animate-spin" />
            </div>
            <p className="text-lg font-medium text-slate-700 dark:text-slate-300 animate-pulse">
              Gerando MPP...
            </p>
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-primary-500 animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 rounded-full bg-primary-500 animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-primary-500 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">MPP</h1>
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-amber-800 dark:text-amber-200">{erro}</p>
          <button
            type="button"
            onClick={() => irParaPagina(1)}
            className="mt-3 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">MPP</h1>
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-2" aria-label="Paginação">
            <button
              type="button"
              onClick={() => irParaPagina(page - 1)}
              disabled={page <= 1 || loading}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="text-sm text-slate-600 dark:text-slate-400 min-w-[100px] text-center">
              Página {page}
            </span>
            <button
              type="button"
              onClick={() => irParaPagina(page + 1)}
              disabled={!hasMore || loading}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Próxima
            </button>
          </nav>
          <button
            type="button"
            onClick={() => irParaPagina(1)}
            disabled={loading}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            Atualizar
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 min-w-[140px]">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Código pedido</span>
            <input
              type="text"
              placeholder="Filtrar..."
              value={filterCodigoPedido}
              onChange={(e) => setFilterCodigoPedido(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1 min-w-[180px]">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Cliente</span>
            <input
              type="text"
              placeholder="Filtrar..."
              value={filterCliente}
              onChange={(e) => setFilterCliente(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1 min-w-[160px]">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Segmentação</span>
            <input
              type="text"
              placeholder="Filtrar..."
              value={filterSegmentacao}
              onChange={(e) => setFilterSegmentacao(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1 min-w-[180px]">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Código produto</span>
            <input
              type="text"
              placeholder="Filtrar..."
              value={filterCodigoProduto}
              onChange={(e) => setFilterCodigoProduto(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1 min-w-[140px]">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Cód. componente</span>
            <input
              type="text"
              placeholder="Filtrar..."
              value={filterCodigoComponente}
              onChange={(e) => setFilterCodigoComponente(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1 min-w-[180px]">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Descrição componente</span>
            <input
              type="text"
              placeholder="Filtrar..."
              value={filterComponente}
              onChange={(e) => setFilterComponente(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={apenasComPrevisao}
              onChange={(e) => setApenasComPrevisao(e.target.checked)}
              className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Apenas com Data de Previsão</span>
          </label>
          <button
            type="button"
            onClick={aplicarFiltros}
            className="text-sm px-3 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            title="Pesquisar em todas as páginas"
          >
            Filtrar
          </button>
          {temFiltros && (
            <button
              type="button"
              onClick={limparFiltros}
              className="text-sm px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              title="Limpar todos os filtros"
            >
              Limpar filtros
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {typeof total === 'number'
            ? `${data.length} de ${total} registro(s) nesta página${hasMore ? ' — use Anterior/Próxima para mais' : ''}`
            : temFiltros
              ? 'Filtros aplicados. Use Anterior/Próxima para navegar.'
              : `${data.length} registro(s) nesta página${hasMore ? ' — use Anterior/Próxima para mais' : ''}`}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[1200px]">
            <thead className="bg-primary-600 text-white">
              <tr>
                {COLUNAS.map((col) => (
                  <th
                    key={col.key}
                    className={`py-3 px-4 font-semibold whitespace-nowrap ${col.lastColumn ? 'sticky right-0 bg-primary-600 shadow-[-4px_0_8px_rgba(0,0,0,0.15)]' : ''}`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-200 divide-y divide-slate-200 dark:divide-slate-600">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={COLUNAS.length} className="py-8 px-4 text-center text-slate-500 dark:text-slate-400">
                    {temFiltros
                      ? 'Nenhum registro encontrado com os filtros aplicados.'
                      : 'Nenhum registro encontrado.'}
                  </td>
                </tr>
              ) : (
                data.map((row, idx) => (
                  <tr key={(row.idChave ?? row.idchave ?? idx) as string} className="group hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    {COLUNAS.map((col) => (
                      <td
                        key={col.key}
                        className={`py-2 px-4 ${col.lastColumn ? 'sticky right-0 bg-white dark:bg-slate-800 shadow-[-4px_0_8px_rgba(0,0,0,0.08)] group-hover:bg-slate-50 dark:group-hover:bg-slate-700/50' : ''}`}
                      >
                        {formatCell(
                          col.key === 'dataPrevisao' ? (row.dataPrevisao ?? row.DataPrevisao) : col.key === 'qtdAcumulado' ? row.qtdAcumulado : row[col.key],
                          { integer: col.integer, decimal: col.decimal }
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
