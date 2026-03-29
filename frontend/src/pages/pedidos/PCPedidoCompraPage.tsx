import { useEffect, useState } from 'react';
import { getPcSaldo, type PcSaldoFiltros, type PcSaldoRow } from '../../api/pcSaldo';
import { useAuth } from '../../contexts/AuthContext';
import { PERMISSOES } from '../../config/permissoes';

const PAGE_SIZE = 100;

const labelClass = 'block text-xs text-slate-500 dark:text-slate-400 mb-1';
const inputClass =
  'w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent';
const btnPrimaryClass =
  'px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm transition shrink-0';

function formatCell(val: unknown, opts?: { decimal?: number }): string {
  if (val == null) return '—';
  if (typeof opts?.decimal === 'number') {
    const n = Number(val);
    if (Number.isNaN(n)) return '—';
    return n.toLocaleString('pt-BR', { minimumFractionDigits: opts.decimal, maximumFractionDigits: opts.decimal });
  }
  const s = String(val);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-');
    if (d && m && y) return `${d}/${m}/${y}`;
  }
  return s;
}

export default function PCPedidoCompraPage() {
  const { hasPermission } = useAuth();
  const podeVer =
    hasPermission(PERMISSOES.PCP_VER_TELA) ||
    hasPermission(PERMISSOES.PCP_TOTAL) ||
    hasPermission(PERMISSOES.PEDIDOS_VER);

  const [data, setData] = useState<PcSaldoRow[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filterCodigo, setFilterCodigo] = useState('');
  const [filterDataIni, setFilterDataIni] = useState('');
  const [filterDataFim, setFilterDataFim] = useState('');

  const filtrosDoEstado = (): Pick<PcSaldoFiltros, 'codigo_produto' | 'data_entrega_ini' | 'data_entrega_fim'> => ({
    codigo_produto: filterCodigo.trim() || undefined,
    data_entrega_ini: filterDataIni.trim() || undefined,
    data_entrega_fim: filterDataFim.trim() || undefined,
  });

  async function carregarPagina(
    pagina: number,
    filtrosQuery?: Pick<PcSaldoFiltros, 'codigo_produto' | 'data_entrega_ini' | 'data_entrega_fim'>
  ) {
    setLoading(true);
    setErro(null);
    const f = filtrosQuery ?? filtrosDoEstado();
    try {
      const res = await getPcSaldo({ page: pagina, pageSize: PAGE_SIZE, ...f });
      setData(Array.isArray(res.data) ? res.data : []);
      setTotal(res.total ?? 0);
      setHasMore(res.hasMore ?? false);
      setPage(res.page ?? pagina);
    } catch (e) {
      setData([]);
      setErro(e instanceof Error ? e.message : 'Erro ao carregar PC.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (podeVer) void carregarPagina(1, {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial sem filtros
  }, [podeVer]);

  const aplicarFiltros = () => {
    setPage(1);
    void carregarPagina(1, filtrosDoEstado());
  };

  const limparFiltros = () => {
    setFilterCodigo('');
    setFilterDataIni('');
    setFilterDataFim('');
    setPage(1);
    void carregarPagina(1, {});
  };

  const temFiltros = filterCodigo.trim() !== '' || filterDataIni.trim() !== '' || filterDataFim.trim() !== '';

  const irParaPagina = (nova: number) => {
    if (nova < 1) return;
    void carregarPagina(nova, filtrosDoEstado());
  };

  if (!podeVer) {
    return (
      <div className="p-6">
        <p className="text-slate-600 dark:text-slate-400">Sem permissão para acessar esta tela.</p>
      </div>
    );
  }

  if (loading && data.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0 p-6">
        <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 min-h-[320px]">
          <p className="text-lg font-medium text-slate-700 dark:text-slate-300">Carregando PC…</p>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">PC</h1>
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-amber-800 dark:text-amber-200">{erro}</p>
          <button
            type="button"
            onClick={() => void carregarPagina(1, filtrosDoEstado())}
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
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">PC</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => irParaPagina(page - 1)}
            disabled={page <= 1 || loading}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            Anterior
          </button>
          <span className="text-sm text-slate-600 dark:text-slate-400 min-w-[120px] text-center">
            Página {page}
          </span>
          <button
            type="button"
            onClick={() => irParaPagina(page + 1)}
            disabled={!hasMore || loading}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            Próxima
          </button>
          <button
            type="button"
            onClick={() => void carregarPagina(1, filtrosDoEstado())}
            disabled={loading}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            Atualizar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 p-4 mb-4 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50">
        <label className="flex flex-col min-w-[160px]">
          <span className={labelClass}>Código do produto</span>
          <input
            type="text"
            placeholder="Filtrar por nome/código…"
            value={filterCodigo}
            onChange={(e) => setFilterCodigo(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col min-w-[150px]">
          <span className={labelClass}>Data entrega (de)</span>
          <input
            type="date"
            value={filterDataIni}
            onChange={(e) => setFilterDataIni(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col min-w-[150px]">
          <span className={labelClass}>Data entrega (até)</span>
          <input
            type="date"
            value={filterDataFim}
            onChange={(e) => setFilterDataFim(e.target.value)}
            className={inputClass}
          />
        </label>
        <button type="button" onClick={aplicarFiltros} className={btnPrimaryClass}>
          Filtrar
        </button>
        {temFiltros && (
          <button type="button" onClick={limparFiltros} className={btnPrimaryClass} title="Limpar todos os filtros">
            Limpar filtros
          </button>
        )}
      </div>

      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Saldo a receber por produto (itens de pedido de compra em status 2, 3 ou 4). Filtro de datas aplica-se à data de entrega dos itens.{' '}
        {total > 0 ? `${data.length} de ${total} produto(s) nesta página${hasMore ? ' — use Anterior/Próxima' : ''}` : 'Nenhum registro.'}
      </p>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[640px]">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">Código produto</th>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">Data entrega</th>
                <th className="py-3 px-4 font-semibold whitespace-nowrap">Saldo a receber</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-200 divide-y divide-slate-200 dark:divide-slate-600">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-8 px-4 text-center text-slate-500 dark:text-slate-400">
                    {temFiltros ? 'Nenhum registro com os filtros aplicados.' : 'Nenhum registro.'}
                  </td>
                </tr>
              ) : (
                data.map((row, idx) => (
                  <tr key={`${row.codigoProduto ?? ''}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="py-2 px-4">{formatCell(row.codigoProduto)}</td>
                    <td className="py-2 px-4">{formatCell(row.dataEntrega)}</td>
                    <td className="py-2 px-4">{formatCell(row.saldoaReceber, { decimal: 3 })}</td>
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
