import { useEffect, useState, useCallback } from 'react';
import { getMrp, type MrpRow } from '../../api/mrp';

const COLUNAS: { key: keyof MrpRow; label: string; integer?: boolean }[] = [
  { key: 'codigocomponente', label: 'Código' },
  { key: 'componente', label: 'Componente' },
  { key: 'unidademedida', label: 'UM' },
  { key: 'estoqueSeguranca', label: 'Est. Segurança', integer: true },
  { key: 'coleta', label: 'Coleta' },
  { key: 'itemcritico', label: 'Item Crítico' },
  { key: 'estoque', label: 'Estoque', integer: true },
  { key: 'CM', label: 'CM', integer: true },
  { key: 'pcPendentesAL', label: 'PC Pendentes AL', integer: true },
  { key: 'quantidade', label: 'Quantidade', integer: true },
  { key: 'dataNecessidade', label: 'Data Necessidade' },
  { key: 'saldoaReceber', label: 'Saldo a Receber', integer: true },
  { key: 'dataEntrega', label: 'Data Entrega' },
];

function celula(val: unknown, asInteger?: boolean): string {
  if (val == null) return '—';
  if (asInteger) {
    const n = Number(val);
    if (Number.isNaN(n)) return '—';
    return String(Math.round(n));
  }
  if (typeof val === 'object') return String(val);
  return String(val);
}

export default function MRPPage() {
  const [data, setData] = useState<MrpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filterCodigo, setFilterCodigo] = useState('');
  const [filterComponente, setFilterComponente] = useState('');
  const [filterColeta, setFilterColeta] = useState('');
  const [filterItemCritico, setFilterItemCritico] = useState<string>(''); // '' = Todos, 'Sim', 'Não'

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await getMrp();
      setData(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setData([]);
      setErro(e instanceof Error ? e.message : 'Erro ao carregar MRP.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filteredData = data.filter((row) => {
    const cod = (row.codigocomponente ?? '').toString().toLowerCase();
    const comp = (row.componente ?? '').toString().toLowerCase();
    const col = (row.coleta ?? '').toString().toLowerCase();
    const termCod = filterCodigo.trim().toLowerCase();
    const termComp = filterComponente.trim().toLowerCase();
    const termCol = filterColeta.trim().toLowerCase();
    if (termCod && !cod.includes(termCod)) return false;
    if (termComp && !comp.includes(termComp)) return false;
    if (termCol && !col.includes(termCol)) return false;
    if (filterItemCritico === 'Sim' && (row.itemcritico ?? '').toString().toLowerCase() !== 'sim') return false;
    if (filterItemCritico === 'Não' && (row.itemcritico ?? '').toString().toLowerCase() === 'sim') return false;
    return true;
  });

  const temFiltros =
    filterCodigo.trim() !== '' ||
    filterComponente.trim() !== '' ||
    filterColeta.trim() !== '' ||
    filterItemCritico !== '';

  const limparFiltros = () => {
    setFilterCodigo('');
    setFilterComponente('');
    setFilterColeta('');
    setFilterItemCritico('');
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
              Gerando MRP...
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
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">MRP</h1>
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-amber-800 dark:text-amber-200">{erro}</p>
          <button
            type="button"
            onClick={carregar}
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
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">MRP</h1>
        <button
          type="button"
          onClick={carregar}
          className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
        >
          Atualizar
        </button>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 min-w-[140px]">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Código</span>
            <input
              type="text"
              placeholder="Filtrar por código..."
              value={filterCodigo}
              onChange={(e) => setFilterCodigo(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1 min-w-[200px] flex-1 max-w-[280px]">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Componente</span>
            <input
              type="text"
              placeholder="Filtrar por componente..."
              value={filterComponente}
              onChange={(e) => setFilterComponente(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1 min-w-[160px]">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Coleta</span>
            <input
              type="text"
              placeholder="Filtrar por coleta..."
              value={filterColeta}
              onChange={(e) => setFilterColeta(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1 min-w-[120px]">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Item Crítico</span>
            <select
              value={filterItemCritico}
              onChange={(e) => setFilterItemCritico(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Todos</option>
              <option value="Sim">Sim</option>
              <option value="Não">Não</option>
            </select>
          </label>
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
        {temFiltros && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Exibindo {filteredData.length} de {data.length} registro(s)
          </p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[900px]">
            <thead className="bg-primary-600 text-white">
              <tr>
                {COLUNAS.map((col) => (
                  <th key={col.key} className="py-3 px-4 font-semibold whitespace-nowrap">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-200 divide-y divide-slate-200 dark:divide-slate-600">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={COLUNAS.length} className="py-8 px-4 text-center text-slate-500 dark:text-slate-400">
                    {data.length === 0
                      ? 'Nenhum registro encontrado.'
                      : 'Nenhum registro encontrado com os filtros aplicados.'}
                  </td>
                </tr>
              ) : (
                filteredData.map((row, idx) => (
                  <tr key={row.idComponente != null ? `${row.idComponente}-${idx}` : idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    {COLUNAS.map((col) => (
                      <td key={col.key} className="py-2 px-4">
                        {celula(row[col.key], col.integer)}
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
