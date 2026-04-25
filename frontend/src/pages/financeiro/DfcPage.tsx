import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ArvoreContasDfc from './dfc/ArvoreContasDfc';
import { fetchDfcAgendamentosEfetivos, type DfcAgendamentoLinha } from '../../api/financeiro';
import { listarPeriodosDfc } from './dfc/dfcPeriodos';

function hojeLocalYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inicioAnoLocalYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

function diffDaysInclusiveYmd(a: string, b: string): number | null {
  const parse = (s: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const da = parse(a);
  const db = parse(b);
  if (!da || !db || db < da) return null;
  const ms = 86400000;
  return Math.floor((db.getTime() - da.getTime()) / ms) + 1;
}

function montarValoresPorConta(linhas: DfcAgendamentoLinha[]): Record<number, Record<string, number>> {
  const m: Record<number, Record<string, number>> = {};
  for (const L of linhas) {
    const id = L.idContaFinanceiro;
    if (!m[id]) m[id] = {};
    m[id][L.periodo] = (m[id][L.periodo] ?? 0) + L.valor;
  }
  return m;
}

function fullscreenElementActive(): Element | null {
  const d = document as Document & {
    webkitFullscreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? d.msFullscreenElement ?? null;
}

async function requestFullscreenEl(el: HTMLElement): Promise<void> {
  const anyEl = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    msRequestFullscreen?: () => Promise<void> | void;
  };
  if (el.requestFullscreen) await el.requestFullscreen();
  else if (anyEl.webkitRequestFullscreen) await Promise.resolve(anyEl.webkitRequestFullscreen());
  else if (anyEl.msRequestFullscreen) await Promise.resolve(anyEl.msRequestFullscreen());
}

async function exitFullscreenDoc(): Promise<void> {
  const anyDoc = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    msExitFullscreen?: () => Promise<void> | void;
  };
  if (document.exitFullscreen) await document.exitFullscreen();
  else if (anyDoc.webkitExitFullscreen) await Promise.resolve(anyDoc.webkitExitFullscreen());
  else if (anyDoc.msExitFullscreen) await Promise.resolve(anyDoc.msExitFullscreen());
}

export default function DfcPage() {
  const dfcShellRef = useRef<HTMLDivElement>(null);
  const [telaCheia, setTelaCheia] = useState(false);

  const [dataInicio, setDataInicio] = useState(inicioAnoLocalYmd);
  const [dataFim, setDataFim] = useState(hojeLocalYmd);
  const [granularidade, setGranularidade] = useState<'dia' | 'mes'>('mes');
  const [periodos, setPeriodos] = useState<string[]>(() => listarPeriodosDfc(inicioAnoLocalYmd(), hojeLocalYmd(), 'mes'));
  const [valoresPorConta, setValoresPorConta] = useState<Record<number, Record<string, number>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const diasNoIntervalo = useMemo(() => diffDaysInclusiveYmd(dataInicio, dataFim), [dataInicio, dataFim]);
  const bloqueioDiario = granularidade === 'dia' && diasNoIntervalo != null && diasNoIntervalo > 120;

  const carregar = useCallback(async () => {
    if (bloqueioDiario) {
      setError('No modo diário o intervalo máximo é 120 dias. Reduza o período ou use visão mensal.');
      return;
    }
    setLoading(true);
    setError(null);
    const per = listarPeriodosDfc(dataInicio, dataFim, granularidade);
    setPeriodos(per);
    try {
      const res = await fetchDfcAgendamentosEfetivos({
        dataInicio,
        dataFim,
        granularidade,
        idEmpresa: 1,
      });
      if (res.erro) {
        setValoresPorConta({});
        setError(res.erro);
        return;
      }
      setValoresPorConta(montarValoresPorConta(res.linhas));
      if (res.linhas.length === 0 && !res.erro) {
        setError(null);
      }
    } catch (e) {
      setValoresPorConta({});
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, granularidade, bloqueioDiario]);

  // Carga inicial (ano corrente → hoje); demais alterações: botão Aplicar.
  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem
  }, []);

  useEffect(() => {
    const sync = () => {
      const el = fullscreenElementActive();
      setTelaCheia(el != null && el === dfcShellRef.current);
    };
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync as EventListener);
    };
  }, []);

  const alternarTelaCheia = useCallback(async () => {
    const shell = dfcShellRef.current;
    if (!shell) return;
    try {
      if (fullscreenElementActive() === shell) {
        await exitFullscreenDoc();
      } else {
        await requestFullscreenEl(shell);
      }
    } catch {
      /* API indisponível ou recusada */
    }
  }, []);

  return (
    <div
      ref={dfcShellRef}
      className={`w-full min-w-0 flex flex-col gap-6 min-h-0 [:fullscreen]:h-screen [:fullscreen]:max-h-screen [:fullscreen]:overflow-hidden [:fullscreen]:box-border [:fullscreen]:bg-slate-50 [:fullscreen]:p-4 dark:[:fullscreen]:bg-slate-950`}
    >
      <div className="flex items-start justify-between gap-3 shrink-0">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 min-w-0 pr-2">
          DFC — Demonstração dos Fluxos de Caixa
        </h2>
        <button
          type="button"
          onClick={() => void alternarTelaCheia()}
          className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
          title={telaCheia ? 'Sair da tela inteira' : 'Ver em tela inteira'}
          aria-label={telaCheia ? 'Sair da tela inteira' : 'Ver em tela inteira'}
        >
          {telaCheia ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7M4 10V4h6M20 14v6h-6"
              />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
              />
            </svg>
          )}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4 flex flex-wrap items-end gap-4 w-full shrink-0">
        <div className="flex flex-wrap items-end gap-4 min-w-0 flex-1">
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Data baixa (início)
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-800 dark:text-slate-100"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              Data baixa (fim)
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm text-slate-800 dark:text-slate-100"
              />
            </label>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Agrupar por</span>
            <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden">
              <button
                type="button"
                onClick={() => setGranularidade('mes')}
                className={`px-3 py-1.5 text-xs font-medium transition ${
                  granularidade === 'mes'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                Mês
              </button>
              <button
                type="button"
                onClick={() => setGranularidade('dia')}
                className={`px-3 py-1.5 text-xs font-medium border-l border-slate-300 dark:border-slate-600 transition ${
                  granularidade === 'dia'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                Dia
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={loading || bloqueioDiario}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {loading ? 'Carregando…' : 'Aplicar'}
          </button>
        </div>
        <div className="flex items-end shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={loading || bloqueioDiario}
            title="Recarregar os dados da DFC com os mesmos filtros"
            className="px-4 py-2 rounded-lg text-sm font-medium border border-primary-600 text-primary-700 bg-white hover:bg-primary-50 dark:bg-slate-800 dark:text-primary-300 dark:border-primary-500 dark:hover:bg-primary-900/25 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Atualizar
          </button>
        </div>
        {bloqueioDiario ? (
          <p className="text-xs text-amber-700 dark:text-amber-300 w-full basis-full">
            Intervalo maior que 120 dias: use visão mensal ou encurte as datas.
          </p>
        ) : null}
      </div>

      <div className={`min-h-0 w-full ${telaCheia ? 'flex-1 flex flex-col' : ''}`}>
        <ArvoreContasDfc
          periodos={periodos}
          valoresPorConta={valoresPorConta}
          granularidade={granularidade}
          dataInicio={dataInicio}
          dataFim={dataFim}
          idEmpresa={1}
          loading={loading}
          error={error}
          telaCheia={telaCheia}
        />
      </div>
    </div>
  );
}
