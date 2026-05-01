import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getMrpProdutosProcesso,
  type MrpProdutosProcessoParams,
  type MrpProdutoProcessoRow,
} from '../../api/mrpProdutosProcesso';

const FILTER_INPUT_CLASS =
  'w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent min-h-[2.5rem]';
const FILTER_LABEL_CLASS = 'block text-xs text-slate-500 dark:text-slate-400 mb-1';
const BTN_PRIMARY_CLASS =
  'px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm transition shrink-0';

function formatNumber(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '-';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

function formatDateTime(value?: string): string {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('pt-BR');
}

export default function MRPProdutosEmProcessoPage() {
  const [rows, setRows] = useState<MrpProdutoProcessoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [filtroCodigoPai, setFiltroCodigoPai] = useState('');
  const [filtroDescricaoPai, setFiltroDescricaoPai] = useState('');
  const [filtroCodigoProduto, setFiltroCodigoProduto] = useState('');
  const [filtroDescricaoProduto, setFiltroDescricaoProduto] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState('');

  const carregar = useCallback(async (filtros?: MrpProdutosProcessoParams) => {
    setLoading(true);
    setErro(null);
    try {
      const res = await getMrpProdutosProcesso(
        filtros ?? {
          codigo_pai: filtroCodigoPai,
          descricao_pai: filtroDescricaoPai,
          codigo_produto: filtroCodigoProduto,
          descricao_produto: filtroDescricaoProduto,
          origem: filtroOrigem,
        }
      );
      setRows(Array.isArray(res.data) ? res.data : []);
      setSource(res.source ?? '');
      setUpdatedAt(res.updatedAt ?? '');
    } catch (e) {
      setRows([]);
      setErro(e instanceof Error ? e.message : 'Erro ao carregar produtos em processo.');
    } finally {
      setLoading(false);
    }
  }, [filtroCodigoPai, filtroDescricaoPai, filtroCodigoProduto, filtroDescricaoProduto, filtroOrigem]);

  useEffect(() => {
    void carregar();
  }, []);

  const temFiltros = useMemo(
    () =>
      filtroCodigoPai.trim() !== '' ||
      filtroDescricaoPai.trim() !== '' ||
      filtroCodigoProduto.trim() !== '' ||
      filtroDescricaoProduto.trim() !== '' ||
      filtroOrigem.trim() !== '',
    [filtroCodigoPai, filtroDescricaoPai, filtroCodigoProduto, filtroDescricaoProduto, filtroOrigem]
  );

  const limparFiltros = () => {
    setFiltroCodigoPai('');
    setFiltroDescricaoPai('');
    setFiltroCodigoProduto('');
    setFiltroDescricaoProduto('');
    setFiltroOrigem('');
    void carregar({});
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-primary-600 dark:text-primary-400">PCP</p>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
            MRP - Produtos em Processo
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Base carregada do arquivo {source || 'Excel'}.
            {updatedAt ? ` Atualizado em ${formatDateTime(updatedAt)}.` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void carregar()}
          disabled={loading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {erro && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          {erro}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700/50 dark:bg-slate-800/50">
        <div className="shrink-0 min-w-[150px]">
          <label className={FILTER_LABEL_CLASS}>Código PAI</label>
          <input
            value={filtroCodigoPai}
            onChange={(e) => setFiltroCodigoPai(e.target.value)}
            placeholder="Filtrar..."
            className={FILTER_INPUT_CLASS}
          />
        </div>
        <div className="shrink-0 min-w-[230px]">
          <label className={FILTER_LABEL_CLASS}>Descrição PAI</label>
          <input
            value={filtroDescricaoPai}
            onChange={(e) => setFiltroDescricaoPai(e.target.value)}
            placeholder="Filtrar..."
            className={FILTER_INPUT_CLASS}
          />
        </div>
        <div className="shrink-0 min-w-[170px]">
          <label className={FILTER_LABEL_CLASS}>Código produto</label>
          <input
            value={filtroCodigoProduto}
            onChange={(e) => setFiltroCodigoProduto(e.target.value)}
            placeholder="Filtrar..."
            className={FILTER_INPUT_CLASS}
          />
        </div>
        <div className="shrink-0 min-w-[240px]">
          <label className={FILTER_LABEL_CLASS}>Descrição produto</label>
          <input
            value={filtroDescricaoProduto}
            onChange={(e) => setFiltroDescricaoProduto(e.target.value)}
            placeholder="Filtrar..."
            className={FILTER_INPUT_CLASS}
          />
        </div>
        <div className="shrink-0 min-w-[145px]">
          <label className={FILTER_LABEL_CLASS}>Origem</label>
          <input
            value={filtroOrigem}
            onChange={(e) => setFiltroOrigem(e.target.value)}
            placeholder="Filtrar..."
            className={FILTER_INPUT_CLASS}
          />
        </div>
        <button type="button" onClick={() => void carregar()} disabled={loading} className={BTN_PRIMARY_CLASS}>
          Filtrar
        </button>
        <button
          type="button"
          onClick={limparFiltros}
          disabled={!temFiltros && !loading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Limpar filtros
        </button>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        Exibindo {rows.length} registro(s){temFiltros ? ' com filtros aplicados' : ''}.
      </p>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="max-h-[72vh] overflow-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
            <thead className="sticky top-0 z-20 bg-primary-600 text-white">
              <tr>
                <th className="border border-primary-500/40 px-3 py-3 font-semibold">Código PAI</th>
                <th className="border border-primary-500/40 px-3 py-3 font-semibold">Descrição PAI</th>
                <th className="border border-primary-500/40 px-3 py-3 font-semibold">Código produto</th>
                <th className="border border-primary-500/40 px-3 py-3 font-semibold">Descrição produto</th>
                <th className="border border-primary-500/40 px-3 py-3 text-right font-semibold">Qtde utilizada</th>
                <th className="border border-primary-500/40 px-3 py-3 font-semibold">Origem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-700 dark:divide-slate-600 dark:text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                    <td className="whitespace-nowrap px-3 py-2">{row.codigoProdutoPai || '-'}</td>
                    <td className="max-w-[22rem] truncate px-3 py-2" title={row.descricaoProdutoPai}>
                      {row.descricaoProdutoPai || '-'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{row.codigoProduto || '-'}</td>
                    <td className="max-w-[28rem] truncate px-3 py-2" title={row.descricaoProduto}>
                      {row.descricaoProduto || '-'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                      {formatNumber(row.qtdeUtilizada)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{row.origem || '-'}</td>
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
