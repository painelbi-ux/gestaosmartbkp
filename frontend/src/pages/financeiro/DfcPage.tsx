import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLayoutFoco } from '../../contexts/LayoutFocoContext';
import ArvoreContasDfc from './dfc/ArvoreContasDfc';
import { fetchDfcAgendamentosEfetivos, fetchDfcKpis, type DfcAgendamentoLinha, type DfcKpis } from '../../api/financeiro';
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

function fmtBrl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const KPIS_ZERO: DfcKpis = {
  recebimentos: 0, pagamentos: 0,
  vencidosPagar: 0, vencidosReceber: 0,
  aVencerPagar: 0, aVencerReceber: 0,
  saldoBancario: 0,
};


export default function DfcPage() {
  const dfcShellRef = useRef<HTMLDivElement>(null);
  const { modoFoco, alternarModoFoco, sairModoFoco } = useLayoutFoco();

  // Restaura o header ao sair da página DFC
  useEffect(() => {
    return () => sairModoFoco();
  }, [sairModoFoco]);

  const [dataInicio, setDataInicio] = useState(inicioAnoLocalYmd);
  const [dataFim, setDataFim] = useState(hojeLocalYmd);
  const [granularidade, setGranularidade] = useState<'dia' | 'mes'>('mes');
  const [periodos, setPeriodos] = useState<string[]>(() => listarPeriodosDfc(inicioAnoLocalYmd(), hojeLocalYmd(), 'mes'));
  const [valoresPorConta, setValoresPorConta] = useState<Record<number, Record<string, number>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtroPlanoContas, setFiltroPlanoContas] = useState('');
  const [idEmpresas, setIdEmpresas] = useState<number[]>([1, 2]);
  const [kpis, setKpis] = useState<DfcKpis>(KPIS_ZERO);
  const [loadingKpis, setLoadingKpis] = useState(false);

  const diasNoIntervalo = useMemo(() => diffDaysInclusiveYmd(dataInicio, dataFim), [dataInicio, dataFim]);
  const bloqueioDiario = granularidade === 'dia' && diasNoIntervalo != null && diasNoIntervalo > 120;

  const carregar = useCallback(async () => {
    if (bloqueioDiario) {
      setError('No modo diário o intervalo máximo é 120 dias. Reduza o período ou use visão mensal.');
      return;
    }
    setLoading(true);
    setLoadingKpis(true);
    setError(null);
    const per = listarPeriodosDfc(dataInicio, dataFim, granularidade);
    setPeriodos(per);

    void fetchDfcKpis({ dataInicio, dataFim, idEmpresas }).then((k) => {
      setKpis(k);
    }).catch(() => { /* silencioso */ }).finally(() => setLoadingKpis(false));

    try {
      const res = await fetchDfcAgendamentosEfetivos({
        dataInicio,
        dataFim,
        granularidade,
        idEmpresas,
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
  }, [dataInicio, dataFim, granularidade, bloqueioDiario, idEmpresas]);

  // Carga inicial (ano corrente → hoje); demais alterações: botão Aplicar.
  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem
  }, []);


  return (
    <div
      ref={dfcShellRef}
      className="w-full min-w-0 flex flex-col gap-6 min-h-0"
    >
      <div className="flex items-start justify-between gap-3 shrink-0">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 min-w-0 pr-2">
          DFC — Demonstração dos Fluxos de Caixa
        </h2>
        <button
          type="button"
          onClick={alternarModoFoco}
          className={`shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-lg border transition ${
            modoFoco
              ? 'border-primary-400 bg-primary-50 text-primary-700 hover:bg-primary-100 dark:border-primary-500 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
          }`}
          title={modoFoco ? 'Restaurar menu (Esc)' : 'Ocultar menu — modo foco'}
          aria-label={modoFoco ? 'Restaurar menu' : 'Ocultar menu — modo foco'}
        >
          {modoFoco ? (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Faixa de filtros ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 flex flex-wrap items-center gap-3 w-full shrink-0 shadow-sm">
        <div className="flex flex-wrap items-end gap-3 min-w-0 flex-1">
          {/* Datas */}
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Início</span>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-2.5 py-1.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Fim</span>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-2.5 py-1.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </label>
          </div>

          {/* Agrupar por */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Agrupar por</span>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden bg-slate-50 dark:bg-slate-700">
              {(['mes', 'dia'] as const).map((g, i) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGranularidade(g)}
                  className={`px-3.5 py-1.5 text-xs font-semibold transition ${
                    i > 0 ? 'border-l border-slate-200 dark:border-slate-600' : ''
                  } ${
                    granularidade === g
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                  }`}
                >
                  {g === 'mes' ? 'Mês' : 'Dia'}
                </button>
              ))}
            </div>
          </div>

          {/* Empresa */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Empresa</span>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden bg-slate-50 dark:bg-slate-700">
              {([
                { label: 'Só Aço', ids: [1] },
                { label: 'Só Móveis', ids: [2] },
                { label: 'Ambas', ids: [1, 2] },
              ] as { label: string; ids: number[] }[]).map((opt, i) => {
                const ativo =
                  idEmpresas.length === opt.ids.length &&
                  opt.ids.every((id) => idEmpresas.includes(id));
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setIdEmpresas(opt.ids)}
                    className={`px-3.5 py-1.5 text-xs font-semibold transition ${
                      i > 0 ? 'border-l border-slate-200 dark:border-slate-600' : ''
                    } ${
                      ativo
                        ? 'bg-primary-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Plano de contas */}
          <label className="flex flex-col gap-0.5 min-w-[12rem] flex-1 max-w-sm">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Plano de contas</span>
            <input
              type="search"
              value={filtroPlanoContas}
              onChange={(e) => setFiltroPlanoContas(e.target.value)}
              placeholder="Filtrar por nome, código ou id…"
              autoComplete="off"
              className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-2.5 py-1.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-400 w-full"
              aria-label="Filtrar plano de contas na DFC"
            />
          </label>

          {/* Botão Aplicar */}
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={loading || bloqueioDiario}
            className="self-end px-5 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
          >
            {loading ? 'Carregando…' : 'Aplicar'}
          </button>
        </div>
        <div className="flex items-end shrink-0 ml-auto gap-2">
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={loading || bloqueioDiario}
            title="Recarregar os dados da DFC com os mesmos filtros"
            className="self-end px-4 py-2 rounded-lg text-sm font-semibold border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Atualizar
          </button>
        </div>
        {bloqueioDiario ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-300 w-full basis-full mt-0.5">
            ⚠ Intervalo maior que 120 dias: use visão mensal ou encurte as datas.
          </p>
        ) : null}
      </div>

      {/* ── Cards KPI ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">

        {/* Recebimentos */}
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-3 min-w-0 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="shrink-0 h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
              <svg className="h-4 w-4 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
              </svg>
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-tight">Recebimentos</span>
          </div>
          {loadingKpis ? (
            <span className="h-7 w-28 rounded-md bg-slate-200 dark:bg-slate-700 animate-pulse block" />
          ) : (
            <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums leading-tight truncate">
              {fmtBrl(kpis.recebimentos)}
            </span>
          )}
          <span className="text-[11px] text-slate-400 dark:text-slate-500 -mt-1">no período selecionado</span>
        </div>

        {/* Pagamentos */}
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-3 min-w-0 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="shrink-0 h-9 w-9 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center">
              <svg className="h-4 w-4 text-rose-600 dark:text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
              </svg>
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-tight">Pagamentos</span>
          </div>
          {loadingKpis ? (
            <span className="h-7 w-28 rounded-md bg-slate-200 dark:bg-slate-700 animate-pulse block" />
          ) : (
            <span className="text-lg font-bold text-rose-600 dark:text-rose-400 tabular-nums leading-tight truncate">
              {fmtBrl(kpis.pagamentos)}
            </span>
          )}
          <span className="text-[11px] text-slate-400 dark:text-slate-500 -mt-1">no período selecionado</span>
        </div>

        {/* Vencidos */}
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-3 min-w-0 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="shrink-0 h-9 w-9 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center">
              <svg className="h-4 w-4 text-orange-600 dark:text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-tight">Vencidos</span>
          </div>
          {loadingKpis ? (
            <span className="h-7 w-28 rounded-md bg-slate-200 dark:bg-slate-700 animate-pulse block" />
          ) : (
            <span className="text-lg font-bold text-orange-600 dark:text-orange-400 tabular-nums leading-tight truncate">
              {fmtBrl(kpis.vencidosPagar + kpis.vencidosReceber)}
            </span>
          )}
          {!loadingKpis && (
            <div className="flex flex-col text-[11px] text-slate-400 dark:text-slate-500 -mt-1 leading-snug">
              <span>Pagar: {fmtBrl(kpis.vencidosPagar)}</span>
              <span>Receber: {fmtBrl(kpis.vencidosReceber)}</span>
            </div>
          )}
        </div>

        {/* A Vencer */}
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-3 min-w-0 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="shrink-0 h-9 w-9 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
              <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-tight">A Vencer</span>
          </div>
          {loadingKpis ? (
            <span className="h-7 w-28 rounded-md bg-slate-200 dark:bg-slate-700 animate-pulse block" />
          ) : (
            <span className="text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums leading-tight truncate">
              {fmtBrl(kpis.aVencerPagar + kpis.aVencerReceber)}
            </span>
          )}
          {!loadingKpis && (
            <div className="flex flex-col text-[11px] text-slate-400 dark:text-slate-500 -mt-1 leading-snug">
              <span>Pagar: {fmtBrl(kpis.aVencerPagar)}</span>
              <span>Receber: {fmtBrl(kpis.aVencerReceber)}</span>
            </div>
          )}
        </div>

        {/* Saldo Bancário */}
        <div className="rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-3 min-w-0 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className={`shrink-0 h-9 w-9 rounded-full flex items-center justify-center ${
              kpis.saldoBancario >= 0 ? 'bg-sky-100 dark:bg-sky-900/50' : 'bg-red-100 dark:bg-red-900/50'
            }`}>
              <svg className={`h-4 w-4 ${kpis.saldoBancario >= 0 ? 'text-sky-600 dark:text-sky-400' : 'text-red-600 dark:text-red-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
              </svg>
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-tight">Saldo Bancário</span>
          </div>
          {loadingKpis ? (
            <span className="h-7 w-28 rounded-md bg-slate-200 dark:bg-slate-700 animate-pulse block" />
          ) : (
            <span className={`text-lg font-bold tabular-nums leading-tight truncate ${
              kpis.saldoBancario >= 0 ? 'text-sky-600 dark:text-sky-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {fmtBrl(kpis.saldoBancario)}
            </span>
          )}
          <span className="text-[11px] text-slate-400 dark:text-slate-500 -mt-1">acumulado até hoje</span>
        </div>

      </div>

      <div className={`min-h-0 w-full ${modoFoco ? 'flex-1 flex flex-col' : ''}`}>
        <ArvoreContasDfc
          periodos={periodos}
          valoresPorConta={valoresPorConta}
          granularidade={granularidade}
          dataInicio={dataInicio}
          dataFim={dataFim}
          idEmpresas={idEmpresas}
          loading={loading}
          error={error}
          telaCheia={modoFoco}
          filtroPlanoContas={filtroPlanoContas}
        />
      </div>
    </div>
  );
}
