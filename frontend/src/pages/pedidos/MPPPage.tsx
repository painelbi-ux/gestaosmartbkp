import { useEffect, useState, useCallback } from 'react';
import { getMpp, type MppRow } from '../../api/mpp';

const COLUNAS: { key: string; label: string; integer?: boolean; decimal?: number }[] = [
  { key: 'idChave', label: 'Chave' },
  { key: 'Codigo_pedido', label: 'Código pedido' },
  { key: 'Codigo_produto', label: 'Código produto' },
  { key: 'DataEmissao', label: 'Data Emissão' },
  { key: 'Quantidade', label: 'Quantidade', integer: true },
  { key: 'Valor total com desconto', label: 'Valor total c/ desconto', decimal: 2 },
  { key: 'StatusPedido', label: 'Status' },
  { key: 'REQUISITADO', label: 'Requisitado' },
  { key: 'MetodoEntrega', label: 'Método entrega' },
  { key: 'Cliente', label: 'Cliente' },
  { key: 'UF', label: 'UF' },
  { key: 'Municipios', label: 'Municípios' },
  { key: 'Regiao', label: 'Região' },
  { key: 'Codigo romaneio', label: 'Cód. romaneio' },
  { key: 'Rota', label: 'Rota' },
  { key: 'OBS_Romaneio', label: 'OBS Romaneio' },
  { key: 'Retirada_loja_fabrica', label: 'Retirada loja/fábrica' },
  { key: 'Segmentacao_carradas', label: 'Segmentação' },
  { key: 'dataEntrega', label: 'Data entrega' },
  { key: 'codigoComponente', label: 'Cód. componente' },
  { key: 'componente', label: 'Componente' },
  { key: 'unidademedida', label: 'UM' },
  { key: 'qtd', label: 'Qtd', integer: true },
  { key: 'qtdTotalComponente', label: 'Qtd total componente', integer: true },
  { key: 'dataPrevisao', label: 'Data Previsão' },
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

export default function MPPPage() {
  const [data, setData] = useState<MppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filterCodigoPedido, setFilterCodigoPedido] = useState('');
  const [filterCliente, setFilterCliente] = useState('');
  const [filterSegmentacao, setFilterSegmentacao] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await getMpp();
      setData(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setData([]);
      setErro(e instanceof Error ? e.message : 'Erro ao carregar MPP.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const filteredData = data.filter((row) => {
    const codPed = (row.Codigo_pedido ?? '').toString().toLowerCase();
    const cliente = (row.Cliente ?? '').toString().toLowerCase();
    const seg = (row.Segmentacao_carradas ?? '').toString().toLowerCase();
    if (filterCodigoPedido.trim() && !codPed.includes(filterCodigoPedido.trim().toLowerCase())) return false;
    if (filterCliente.trim() && !cliente.includes(filterCliente.trim().toLowerCase())) return false;
    if (filterSegmentacao.trim() && !seg.includes(filterSegmentacao.trim().toLowerCase())) return false;
    return true;
  });

  const temFiltros =
    filterCodigoPedido.trim() !== '' || filterCliente.trim() !== '' || filterSegmentacao.trim() !== '';

  const limparFiltros = () => {
    setFilterCodigoPedido('');
    setFilterCliente('');
    setFilterSegmentacao('');
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
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">MPP</h1>
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
          <table className="w-full text-sm text-left min-w-[1200px]">
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
                  <tr key={(row.idChave ?? idx) as string} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    {COLUNAS.map((col) => (
                      <td key={col.key} className="py-2 px-4">
                        {formatCell(row[col.key], {
                          integer: col.integer,
                          decimal: col.decimal,
                        })}
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
