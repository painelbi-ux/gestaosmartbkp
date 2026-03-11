import { useEffect, useState, useCallback, Fragment } from 'react';
import FiltroPedidos, { type FiltrosPedidosState } from '../../components/FiltroPedidos';
import FiltroDatasPopover from '../../components/FiltroDatasPopover';
import {
  getResumoFinanceiroGrade,
  type ResumoFinanceiroGradeResponse,
  type ResumoFinanceiroGradeRota,
} from '../../api/pedidos';
import { loadFiltrosPedidos, saveFiltrosPedidos } from '../../utils/persistFiltros';

const filtrosIniciais: FiltrosPedidosState = {
  cliente: '',
  observacoes: '',
  pd: '',
  cod: '',
  data_emissao_ini: '',
  data_emissao_fim: '',
  data_entrega_ini: '',
  data_entrega_fim: '',
  data_previsao_anterior_ini: '',
  data_previsao_anterior_fim: '',
  data_previsao_ini: '',
  data_previsao_fim: '',
  atrasados: false,
  grupo_produto: '',
  setor_producao: '',
  uf: '',
  municipio_entrega: '',
  motivo: '',
  vendedor: '',
  tipo_f: '',
  status: '',
  metodo: '',
};

function formatDataCol(iso: string): string {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

function formatValor(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ResumoFinanceiroPage() {
  const [grade, setGrade] = useState<ResumoFinanceiroGradeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState<FiltrosPedidosState>(() =>
    loadFiltrosPedidos(filtrosIniciais)
  );
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [mostrarFiltros, setMostrarFiltros] = useState(true);

  const carregarGrade = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | undefined> = {
        cliente: filtros.cliente || undefined,
        observacoes: filtros.observacoes || undefined,
        pd: filtros.pd || undefined,
        cod: filtros.cod || undefined,
        data_emissao_ini: filtros.data_emissao_ini || undefined,
        data_emissao_fim: filtros.data_emissao_fim || undefined,
        data_entrega_ini: filtros.data_entrega_ini || undefined,
        data_entrega_fim: filtros.data_entrega_fim || undefined,
        data_previsao_anterior_ini: filtros.data_previsao_anterior_ini || undefined,
        data_previsao_anterior_fim: filtros.data_previsao_anterior_fim || undefined,
        data_ini: filtros.data_previsao_ini || undefined,
        data_fim: filtros.data_previsao_fim || undefined,
        atrasados: filtros.atrasados ? 'true' : undefined,
        grupo_produto: filtros.grupo_produto || undefined,
        setor_producao: filtros.setor_producao || undefined,
        uf: filtros.uf || undefined,
        municipio_entrega: filtros.municipio_entrega || undefined,
        motivo: filtros.motivo || undefined,
        vendedor: filtros.vendedor || undefined,
        tipo_f: filtros.tipo_f || undefined,
        status: filtros.status || undefined,
        metodo: filtros.metodo || undefined,
      };
      const res = await getResumoFinanceiroGrade(params);
      setGrade(res);
    } catch {
      setGrade({ datas: [], rotas: [], erroConexao: 'Erro ao carregar' });
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    carregarGrade();
  }, [carregarGrade]);

  useEffect(() => {
    saveFiltrosPedidos(filtros);
  }, [filtros]);

  const aplicarFiltros = () => carregarGrade();
  const limparFiltros = () => {
    setFiltros(filtrosIniciais);
    saveFiltrosPedidos(filtrosIniciais);
  };

  const toggleRota = (rota: string) => {
    setExpandidas((prev) => {
      const next = new Set(prev);
      if (next.has(rota)) next.delete(rota);
      else next.add(rota);
      return next;
    });
  };

  const datas = grade?.datas ?? [];
  const rotas = grade?.rotas ?? [];
  const totalGeralGeral =
    rotas.length > 0
      ? rotas.reduce((s, r) => s + r.totalGeral, 0)
      : 0;
  const totalPorDataGeral: Record<string, number> = {};
  for (const d of datas) {
    totalPorDataGeral[d] = rotas.reduce((s, r) => s + (r.totalPorData[d] ?? 0), 0);
  }

  return (
    <div className="space-y-6 w-full min-w-0 flex flex-col" style={{ width: '100%', maxWidth: '100%' }}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          Resumo Financeiro
        </h2>
        <button
          type="button"
          onClick={() => setMostrarFiltros((v) => !v)}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
          title={mostrarFiltros ? 'Ocultar filtros' : 'Exibir filtros'}
          aria-label={mostrarFiltros ? 'Ocultar filtros' : 'Exibir filtros'}
        >
          {mostrarFiltros ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>

      {mostrarFiltros && (
        <>
          <FiltroPedidos
            filtros={filtros}
            onChange={setFiltros}
            onAplicar={aplicarFiltros}
            onLimpar={limparFiltros}
          />
          <div className="flex flex-wrap items-center gap-2">
            <FiltroDatasPopover
              filtros={filtros}
              onChange={(updates) => setFiltros((prev) => ({ ...prev, ...updates }))}
            />
            <button
              type="button"
              onClick={aplicarFiltros}
              className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm transition shrink-0"
            >
              Filtrar
            </button>
          </div>
        </>
      )}

      {grade?.erroConexao && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium">Falha ao carregar dados.</p>
          <p className="mt-1 font-mono text-xs break-all">{grade.erroConexao}</p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden min-w-0">
        {loading ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
            Carregando...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-primary-600 text-white">
                  <th className="text-left py-3 px-4 font-semibold whitespace-nowrap w-0">
                    Rótulos de Linha
                  </th>
                  {datas.map((d) => (
                    <th
                      key={d}
                      className="text-right py-3 px-3 font-semibold whitespace-nowrap"
                      scope="col"
                    >
                      {formatDataCol(d)}
                    </th>
                  ))}
                  <th className="text-right py-3 px-4 font-semibold whitespace-nowrap">
                    Total Geral
                  </th>
                </tr>
              </thead>
              <tbody className="text-slate-700 dark:text-slate-200">
                {rotas.map((rotaRow: ResumoFinanceiroGradeRota) => {
                  const expandida = expandidas.has(rotaRow.rota);
                  return (
                    <Fragment key={rotaRow.rota}>
                      <tr
                        className="border-t border-slate-200 dark:border-slate-600/70 bg-blue-50 dark:bg-blue-900/25 text-slate-800 dark:text-slate-200"
                      >
                        <td className="py-2 px-4 font-medium">
                          <button
                            type="button"
                            onClick={() => toggleRota(rotaRow.rota)}
                            className="inline-flex items-center gap-1.5 text-left hover:text-primary-600 dark:hover:text-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                            aria-expanded={expandida}
                          >
                            <span
                              className="inline-block w-5 h-5 flex items-center justify-center text-slate-500"
                              aria-hidden
                            >
                              {expandida ? '−' : '+'}
                            </span>
                            {rotaRow.rota}
                          </button>
                        </td>
                        {datas.map((d) => (
                          <td key={d} className="py-2 px-3 text-right tabular-nums">
                            {formatValor(rotaRow.totalPorData[d] ?? 0)}
                          </td>
                        ))}
                        <td className="py-2 px-4 text-right font-medium tabular-nums">
                          {formatValor(rotaRow.totalGeral)}
                        </td>
                      </tr>
                      {expandida &&
                        rotaRow.condicoes.map((cond) => (
                          <tr
                            key={`${rotaRow.rota}-${cond.condicao}`}
                            className="border-t border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-800/80"
                          >
                            <td className="py-1.5 pl-10 pr-4 text-slate-700 dark:text-slate-200">
                              {cond.condicao}
                            </td>
                            {datas.map((d) => (
                              <td key={d} className="py-1.5 px-3 text-right tabular-nums">
                                {formatValor(cond.porData[d] ?? 0)}
                              </td>
                            ))}
                            <td className="py-1.5 px-4 text-right tabular-nums">
                              {formatValor(cond.total)}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
                {rotas.length > 0 && (
                  <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-100/80 dark:bg-slate-700/50 font-semibold">
                    <td className="py-3 px-4">Total Geral</td>
                    {datas.map((d) => (
                      <td key={d} className="py-3 px-3 text-right tabular-nums">
                        {formatValor(totalPorDataGeral[d] ?? 0)}
                      </td>
                    ))}
                    <td className="py-3 px-4 text-right tabular-nums">
                      {formatValor(totalGeralGeral)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!loading && rotas.length === 0 && !grade?.erroConexao && (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
            Nenhum dado no período. Ajuste os filtros ou o período (Previsão entre).
          </div>
        )}
      </div>
    </div>
  );
}
