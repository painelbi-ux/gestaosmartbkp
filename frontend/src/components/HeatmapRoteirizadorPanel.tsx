import { useMemo } from 'react';
import type { RoteiroResultado } from '../utils/heatmapRoteirizador';
import { labelTeresinaBase } from '../utils/heatmapTeresinaBase';
import {
  fmtBrlRoteiro,
  fmtKmRoteiro,
  totalVendaSelecionados,
  totalExcluidoRoteiro,
  totalVendaRoteiroOriginal,
  vendaPorLabelSelecionados,
  contagemExclusoesMunicipio,
  type SelecionadoComChave,
} from '../utils/heatmapRoteiroRelatorio';

export type { SelecionadoComChave } from '../utils/heatmapRoteiroRelatorio';

export default function HeatmapRoteirizadorPanel({
  loading,
  resultado,
  selecionados,
  exclusoesSimulacao,
  ajustesQtdeSimulacao,
  onRemover,
  onLimpar,
  onFechar,
  onSalvarPdf,
  salvandoPdf,
  onAjustarCarga,
  onRestaurarSimulacao,
}: {
  loading: boolean;
  resultado: RoteiroResultado | null;
  selecionados: SelecionadoComChave[];
  exclusoesSimulacao: ReadonlySet<string>;
  ajustesQtdeSimulacao?: ReadonlyMap<string, number>;
  onRemover: (chave: string) => void;
  onLimpar: () => void;
  onFechar: () => void;
  onSalvarPdf?: () => void;
  salvandoPdf?: boolean;
  onAjustarCarga: (chave: string) => void;
  onRestaurarSimulacao: () => void;
}) {
  const temSimulacao = exclusoesSimulacao.size > 0 || (ajustesQtdeSimulacao?.size ?? 0) > 0;
  const vendaPorLabelParada = useMemo(
    () => vendaPorLabelSelecionados(selecionados, exclusoesSimulacao, ajustesQtdeSimulacao),
    [selecionados, exclusoesSimulacao, ajustesQtdeSimulacao]
  );
  const totalVendaSimulada = useMemo(
    () => totalVendaSelecionados(selecionados, exclusoesSimulacao, ajustesQtdeSimulacao),
    [selecionados, exclusoesSimulacao, ajustesQtdeSimulacao]
  );
  const totalOriginal = useMemo(() => totalVendaRoteiroOriginal(selecionados), [selecionados]);
  const totalExcluido = useMemo(
    () => totalExcluidoRoteiro(selecionados, exclusoesSimulacao, ajustesQtdeSimulacao),
    [selecionados, exclusoesSimulacao, ajustesQtdeSimulacao]
  );

  return (
    <div
      className="max-h-[min(70vh,28rem)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-2xl dark:border-slate-600 dark:bg-slate-800"
      role="dialog"
      aria-label="Resultado da roteirização"
    >
      <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2 dark:border-slate-600">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100">Roteirização</h3>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {temSimulacao && (
            <button
              type="button"
              onClick={onRestaurarSimulacao}
              className="rounded px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-900/30"
              title="Incluir novamente todos os itens excluídos da simulação"
            >
              Restaurar sim.
            </button>
          )}
          {onSalvarPdf && (
            <button
              type="button"
              disabled={!!salvandoPdf || loading || !resultado || selecionados.length < 1}
              onClick={() => void onSalvarPdf()}
              className="rounded px-2 py-0.5 text-xs font-medium text-primary-700 hover:bg-primary-50 disabled:opacity-40 dark:text-primary-300 dark:hover:bg-primary-900/40"
            >
              {salvandoPdf ? 'PDF…' : 'Salvar PDF'}
            </button>
          )}
          <button
            type="button"
            disabled={selecionados.length === 0}
            onClick={onLimpar}
            className="rounded px-2 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700/80"
          >
            Limpar
          </button>
          <button
            type="button"
            onClick={onFechar}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-slate-400 bg-slate-200 text-base font-bold leading-none text-slate-800 shadow-sm hover:bg-slate-300 dark:border-slate-500 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500"
            aria-label="Fechar painel"
            title="Fechar"
          >
            ×
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <span className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-sky-400 bg-sky-50 pl-2 pr-2 text-xs text-sky-900 dark:border-sky-600 dark:bg-sky-900/40 dark:text-sky-100">
          <span className="truncate py-0.5">{labelTeresinaBase()} (base)</span>
        </span>
        {selecionados.map(({ item: c, chave }) => {
          const nExc = contagemExclusoesMunicipio(c.detalhes ?? [], chave, exclusoesSimulacao);
          return (
            <span
              key={chave}
              className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-primary-300 bg-primary-50 pl-2 pr-0.5 text-xs text-primary-900 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-100"
            >
              <span className="truncate py-0.5">
                {c.municipio}
                {c.uf ? `/${c.uf}` : ''}
                {nExc > 0 && (
                  <span className="ml-1 rounded bg-amber-200/90 px-1 text-[10px] font-semibold text-amber-900 dark:bg-amber-800/60 dark:text-amber-100">
                    −{nExc}
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onAjustarCarga(chave)}
                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-primary-700 hover:bg-primary-100 dark:text-primary-200 dark:hover:bg-primary-800/50"
                title="Ajustar carga desta cidade"
              >
                Carga
              </button>
              <button
                type="button"
                onClick={() => onRemover(chave)}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-primary-600 hover:bg-primary-100 dark:text-primary-300 dark:hover:bg-primary-800/50"
                title="Remover da seleção"
                aria-label="Remover da seleção"
              >
                ×
              </button>
            </span>
          );
        })}
      </div>

      {loading && <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">Calculando rota…</p>}

      {!loading && selecionados.length < 1 && (
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
          <strong>Teresina/PI</strong> é a base fixa. Mantenha <strong>Ctrl</strong> pressionado e clique em{' '}
          <strong>uma</strong> bolha no mapa; em seguida use o botão <strong>Roteirizar</strong>.
        </p>
      )}

      {!loading && selecionados.length >= 1 && !resultado && (
        <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">Não foi possível obter a rota. Tente de novo.</p>
      )}

      {!loading && resultado && selecionados.length >= 1 && (
        <div className="mt-3 space-y-3">
          <dl className="text-[11px]">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">
                {temSimulacao ? 'Total (carga simulada)' : 'Total'}
              </dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-100">
                {fmtKmRoteiro(resultado.totalKm)} <span className="text-slate-400 dark:text-slate-500">|</span>{' '}
                {fmtBrlRoteiro(totalVendaSimulada)}
              </dd>
              {temSimulacao && (
                <dd className="mt-0.5 text-[10px] font-normal text-slate-500 dark:text-slate-400">
                  Era {fmtBrlRoteiro(totalOriginal)} · excluído {fmtBrlRoteiro(totalExcluido)}
                </dd>
              )}
            </div>
          </dl>

          <div>
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sequência</h4>
            <ol className="mt-1 space-y-1.5 text-xs text-slate-800 dark:text-slate-100">
              {resultado.pernas.map((p, idx) => {
                const venda = vendaPorLabelParada.get(p.para) ?? 0;
                const sel = selecionados.find((s) => `${s.item.municipio}${s.item.uf ? `, ${s.item.uf}` : ''}` === p.para);
                const nExc = sel
                  ? contagemExclusoesMunicipio(sel.item.detalhes ?? [], sel.chave, exclusoesSimulacao)
                  : 0;
                return (
                  <li key={idx} className="border-l-2 border-primary-400 pl-1.5 dark:border-primary-500">
                    <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                      <span className="font-mono text-[10px] font-semibold text-primary-700 dark:text-primary-300">
                        {idx + 1}.
                      </span>
                      <span className="font-semibold">{p.para}</span>
                      {sel && (
                        <button
                          type="button"
                          onClick={() => onAjustarCarga(sel.chave)}
                          className="text-[10px] font-medium text-primary-600 underline-offset-2 hover:underline dark:text-primary-400"
                        >
                          ajustar
                        </button>
                      )}
                      <span className="text-slate-500 dark:text-slate-400">({fmtKmRoteiro(p.distanciaKm)})</span>
                      <span className="text-slate-500 dark:text-slate-400">|</span>
                      <span className="font-medium text-slate-700 dark:text-slate-200">{fmtBrlRoteiro(venda)}</span>
                      {nExc > 0 && (
                        <span className="text-[10px] text-amber-700 dark:text-amber-300">
                          (−{nExc} ite{nExc > 1 ? 'ns' : 'm'})
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
              <li className="border-l-2 border-emerald-500 pl-1.5 dark:border-emerald-400">
                <div className="flex flex-wrap items-baseline gap-x-1">
                  <span className="font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">↩</span>
                  <span className="font-semibold">Retorno Teresina, PI</span>
                  <span className="text-slate-500 dark:text-slate-400">({fmtKmRoteiro(resultado.retornoKm)})</span>
                </div>
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
