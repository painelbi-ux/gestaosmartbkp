import { useCallback, useEffect, useMemo, useState, useDeferredValue, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  getMrp,
  getMrpHorizonte,
  getMrpMppQtdeTotalPorComponente,
  type MrpHorizonteLinha,
  type MrpHorizonteResponse,
  type MrpRow,
} from '../../api/mrp';
import {
  codigoChave,
  fmtNum2,
  saldosENecessidadesHorizonte,
  statusHorizonteParaLinha,
  qtdeAComprarHorizonteValor,
} from '../../utils/mrpHorizonteDerivados';

const STATUS_ORDER = [
  'Abastecido',
  'Ruptura Sem PC',
  'Ruptura Antes do PC',
  'Ruptura Depois do PC',
  'Ruptura Sem PC/SC',
  '—',
] as const;

const STATUS_BAR: Record<string, string> = {
  Abastecido: 'bg-emerald-500 dark:bg-emerald-600',
  'Ruptura Sem PC': 'bg-red-500 dark:bg-red-600',
  'Ruptura Antes do PC': 'bg-yellow-400 dark:bg-yellow-500',
  'Ruptura Depois do PC': 'bg-sky-400 dark:bg-sky-500',
  'Ruptura Sem PC/SC': 'bg-slate-900 dark:bg-slate-100',
  '—': 'bg-slate-300 dark:bg-slate-600',
};

function formatIsoParaBr(iso: string): string {
  const s = iso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return iso;
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function KPICard({
  accentBar,
  iconWrap,
  icon,
  value,
  title,
  footer,
  badge,
}: {
  accentBar: string;
  iconWrap: string;
  icon: ReactNode;
  value: ReactNode;
  title: string;
  footer: string;
  badge?: ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm hover:shadow-md hover:shadow-primary-500/10 dark:hover:shadow-primary-900/20 transition-all duration-300 hover:-translate-y-1">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentBar}`} aria-hidden />
      <div className="p-5 pl-6">
        <div className="flex justify-between items-start gap-2">
          <div className={`rounded-xl p-2.5 ${iconWrap}`}>{icon}</div>
          {badge}
        </div>
        <p className="text-3xl font-bold text-slate-900 dark:text-slate-50 mt-4 tabular-nums tracking-tight">{value}</p>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-1">{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">{footer}</p>
      </div>
    </div>
  );
}

function IconPackage() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

export default function DashboardMRPPage() {
  const [rows, setRows] = useState<MrpRow[]>([]);
  const [loadingMrp, setLoadingMrp] = useState(true);
  const [mrpErro, setMrpErro] = useState<string | null>(null);

  const [horizonte, setHorizonte] = useState<MrpHorizonteResponse | null>(null);
  const [horizonteLoading, setHorizonteLoading] = useState(false);
  const [horizonteErro, setHorizonteErro] = useState<string | null>(null);
  const [mppQtdePorCodigo, setMppQtdePorCodigo] = useState<Record<string, number>>({});
  const [mppQtdeLimitHit, setMppQtdeLimitHit] = useState(false);

  const [filterCodigo, setFilterCodigo] = useState('');
  const [filterComponente, setFilterComponente] = useState('');
  const [filterColeta, setFilterColeta] = useState('');
  const [filterItemCritico, setFilterItemCritico] = useState('');
  const [filterHorizonteFim, setFilterHorizonteFim] = useState('');

  const deferredCodigo = useDeferredValue(filterCodigo);
  const deferredComponente = useDeferredValue(filterComponente);
  const deferredColeta = useDeferredValue(filterColeta);

  const carregarMrp = useCallback(async () => {
    setLoadingMrp(true);
    setMrpErro(null);
    const [mrpOutcome, mppOutcome] = await Promise.allSettled([getMrp(), getMrpMppQtdeTotalPorComponente()]);
    if (mrpOutcome.status === 'fulfilled') {
      setRows(Array.isArray(mrpOutcome.value.data) ? mrpOutcome.value.data : []);
    } else {
      setRows([]);
      setMrpErro(
        mrpOutcome.reason instanceof Error ? mrpOutcome.reason.message : 'Erro ao carregar MRP.'
      );
    }
    if (mppOutcome.status === 'fulfilled') {
      const m = mppOutcome.value;
      setMppQtdePorCodigo(m.totais && typeof m.totais === 'object' ? { ...m.totais } : {});
      setMppQtdeLimitHit(Boolean(m.limitHit));
    } else {
      setMppQtdePorCodigo({});
      setMppQtdeLimitHit(false);
    }
    setLoadingMrp(false);
  }, []);

  const carregarHorizonte = useCallback(async () => {
    const fim = filterHorizonteFim.trim();
    if (!fim) {
      setHorizonteErro('Informe a data final do horizonte de produção.');
      return;
    }
    setHorizonteLoading(true);
    setHorizonteErro(null);
    try {
      const h = await getMrpHorizonte(fim);
      setHorizonte(h);
    } catch (e) {
      setHorizonte(null);
      setHorizonteErro(e instanceof Error ? e.message : 'Erro ao carregar horizonte.');
    } finally {
      setHorizonteLoading(false);
    }
  }, [filterHorizonteFim]);

  useEffect(() => {
    void carregarMrp();
  }, [carregarMrp]);

  const filteredRows = useMemo(() => {
    const termCod = deferredCodigo.trim().toLowerCase();
    const termComp = deferredComponente.trim().toLowerCase();
    const termCol = deferredColeta.trim().toLowerCase();
    return rows.filter((row) => {
      const cod = (row.codigocomponente ?? '').toString().toLowerCase();
      const comp = (row.componente ?? '').toString().toLowerCase();
      const col = (row.coleta ?? '').toString().toLowerCase();
      if (termCod && !cod.includes(termCod)) return false;
      if (termComp && !comp.includes(termComp)) return false;
      if (termCol && !col.includes(termCol)) return false;
      if (filterItemCritico === 'Sim' && (row.itemcritico ?? '').toString().toLowerCase() !== 'sim') return false;
      if (filterItemCritico === 'Não' && (row.itemcritico ?? '').toString().toLowerCase() === 'sim') return false;
      return true;
    });
  }, [rows, deferredCodigo, deferredComponente, deferredColeta, filterItemCritico]);

  const derivadosPorCodigo = useMemo(() => {
    const m = new Map<
      string,
      { nAcum: number[]; isoDataRuptura: string | null }
    >();
    if (!horizonte?.linhas) return m;
    for (const linha of horizonte.linhas) {
      const k = linha.codigo.trim();
      if (!k || m.has(k)) continue;
      const { nAcum } = saldosENecessidadesHorizonte(linha.dias);
      let isoDataRuptura: string | null = null;
      for (let i = 0; i < nAcum.length; i++) {
        if (nAcum[i] > 0) {
          isoDataRuptura = linha.dias[i].data;
          break;
        }
      }
      m.set(k, { nAcum, isoDataRuptura });
    }
    return m;
  }, [horizonte]);

  const horizontePorCodigo = useMemo(() => {
    const m = new Map<string, MrpHorizonteLinha>();
    if (!horizonte?.linhas) return m;
    for (const linha of horizonte.linhas) {
      const k = linha.codigo.trim();
      if (k && !m.has(k)) m.set(k, linha);
    }
    return m;
  }, [horizonte]);

  const temHorizonte = Boolean(horizonte && horizonte.datas.length > 0);

  const metricas = useMemo(() => {
    const statusCount: Record<string, number> = {};
    for (const s of STATUS_ORDER) statusCount[s] = 0;

    const codigosSemLinhaNoHorizonte = new Set<string>();
    let sumQtdeComprar = 0;
    let sumEmpenhoMpp = 0;
    let sumNecessidadeUltimo = 0;
    let criticosComRuptura = 0;
    let linhasComAlgumaRuptura = 0;

    const qtdeMaxPorCodigo = new Map<string, number>();
    const codigoJaSomouNecessidadeUltimo = new Set<string>();
    const codigosFiltroUnicos = new Set<string>();
    for (const row of filteredRows) {
      const k = codigoChave(row);
      if (k) codigosFiltroUnicos.add(k);
    }
    for (const k of codigosFiltroUnicos) {
      const v = mppQtdePorCodigo[k];
      if (v != null && Number.isFinite(v)) sumEmpenhoMpp += v;
    }

    for (const row of filteredRows) {
      const k = codigoChave(row);
      const linhaH = k ? horizontePorCodigo.get(k) : undefined;
      const dh = k ? derivadosPorCodigo.get(k) : undefined;

      if (temHorizonte && k && !linhaH?.dias?.length) {
        codigosSemLinhaNoHorizonte.add(k);
      }

      if (!temHorizonte) continue;

      const status = statusHorizonteParaLinha(row, linhaH, dh?.isoDataRuptura);
      statusCount[status] = (statusCount[status] ?? 0) + 1;

      const q = qtdeAComprarHorizonteValor(status, linhaH, dh?.nAcum);
      if (k && q != null && q > 0) {
        const prev = qtdeMaxPorCodigo.get(k) ?? 0;
        qtdeMaxPorCodigo.set(k, Math.max(prev, q));
      }

      if (linhaH && k && !codigoJaSomouNecessidadeUltimo.has(k)) {
        codigoJaSomouNecessidadeUltimo.add(k);
        const ultimoN = dh?.nAcum?.length ? (dh.nAcum[dh.nAcum.length - 1] ?? 0) : 0;
        sumNecessidadeUltimo += ultimoN;
      }

      const critico = (row.itemcritico ?? '').toString().toLowerCase() === 'sim';
      if (critico && status !== 'Abastecido' && status !== '—') {
        criticosComRuptura += 1;
      }
      if (status.startsWith('Ruptura')) linhasComAlgumaRuptura += 1;
    }

    for (const v of qtdeMaxPorCodigo.values()) {
      sumQtdeComprar += v;
    }

    const totalCriticos = filteredRows.filter((r) => (r.itemcritico ?? '').toString().toLowerCase() === 'sim').length;

    return {
      statusCount,
      semLinhaHorizonte: codigosSemLinhaNoHorizonte.size,
      sumQtdeComprar,
      sumEmpenhoMpp,
      sumNecessidadeUltimo,
      criticosComRuptura,
      linhasComAlgumaRuptura,
      totalCriticos,
    };
  }, [filteredRows, horizontePorCodigo, derivadosPorCodigo, temHorizonte, mppQtdePorCodigo]);

  const temAlgumFiltro =
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

  const nFiltered = filteredRows.length;
  const pctAbastecido =
    temHorizonte && nFiltered > 0
      ? Math.round(((metricas.statusCount['Abastecido'] ?? 0) / nFiltered) * 1000) / 10
      : null;

  if (loadingMrp) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Dashboard MRP</h2>
          <div className="h-10 w-48 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 animate-pulse">
              <div className="h-10 w-10 bg-slate-200 dark:bg-slate-700 rounded-xl mb-4" />
              <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-2" />
              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Dashboard MRP</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Indicadores do planejamento com base na grade MRP e no horizonte de eventos (mesma lógica da tela MRP)
          </p>
        </div>
        <Link
          to="/pedidos/mrp"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold shadow-md shadow-primary-600/25 hover:shadow-lg transition-all"
        >
          Ver grade MRP
        </Link>
      </div>

      {mppQtdeLimitHit && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">
          O somatório MPP (Empenho Total) pode estar incompleto: limite de linhas brutas no ERP.
        </div>
      )}

      {mrpErro && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 flex flex-wrap items-center gap-3">
          <span>{mrpErro}</span>
          <button
            type="button"
            onClick={() => void carregarMrp()}
            className="text-primary-700 dark:text-primary-300 font-semibold underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-600 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Código</label>
            <input
              type="text"
              value={filterCodigo}
              onChange={(e) => setFilterCodigo(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm w-36"
              placeholder="Filtrar…"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Componente</label>
            <input
              type="text"
              value={filterComponente}
              onChange={(e) => setFilterComponente(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm min-w-[10rem]"
              placeholder="Filtrar…"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Coleta</label>
            <input
              type="text"
              value={filterColeta}
              onChange={(e) => setFilterColeta(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm w-36"
              placeholder="Filtrar…"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Item crítico</label>
            <select
              value={filterItemCritico}
              onChange={(e) => setFilterItemCritico(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm min-w-[120px]"
            >
              <option value="">Todos</option>
              <option value="Sim">Sim</option>
              <option value="Não">Não</option>
            </select>
          </div>
          <div className="border-l border-slate-200 dark:border-slate-600 pl-4 ml-1">
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Data final do horizonte</label>
            <input
              type="date"
              value={filterHorizonteFim}
              onChange={(e) => setFilterHorizonteFim(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={() => void carregarMrp()}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-600"
            >
              Atualizar MRP
            </button>
            <button
              type="button"
              onClick={() => void carregarHorizonte()}
              disabled={horizonteLoading}
              className="rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white px-4 py-2 text-sm font-semibold shadow-sm"
            >
              {horizonteLoading ? 'Carregando…' : 'Carregar horizonte'}
            </button>
          </div>
          {temAlgumFiltro && (
            <button
              type="button"
              onClick={limparFiltros}
              className="text-sm text-primary-600 dark:text-primary-400 font-medium mb-0.5"
            >
              Limpar filtros da grade
            </button>
          )}
        </div>
        {horizonteErro && (
          <div className="px-4 py-2 text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 border-t border-red-100 dark:border-red-900/40">
            {horizonteErro}
          </div>
        )}
        {temHorizonte && horizonte && (
          <div className="px-4 py-2 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700/80 flex flex-wrap gap-x-4 gap-y-1">
            <span>
              Período: <strong className="text-slate-800 dark:text-slate-200">{formatIsoParaBr(horizonte.dataInicio)}</strong>
              {' → '}
              <strong className="text-slate-800 dark:text-slate-200">{formatIsoParaBr(horizonte.dataFim)}</strong>
            </span>
            <span>
              Dias no horizonte: <strong className="text-slate-800 dark:text-slate-200">{horizonte.datas.length}</strong>
            </span>
            <span>
              Linhas de evento (códigos): <strong className="text-slate-800 dark:text-slate-200">{horizonte.linhas.length}</strong>
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          accentBar="bg-slate-500"
          iconWrap="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
          icon={<IconPackage />}
          value={nFiltered.toLocaleString('pt-BR')}
          title="Itens na grade (filtrados)"
          footer="Linhas do MRP após aplicar código, componente, coleta e item crítico."
        />
        <KPICard
          accentBar="bg-amber-500"
          iconWrap="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
          icon={<IconAlert />}
          value={temHorizonte ? metricas.linhasComAlgumaRuptura.toLocaleString('pt-BR') : '—'}
          title="Linhas com ruptura"
          footer={
            temHorizonte
              ? 'Contagem de status que começam com “Ruptura” no horizonte carregado.'
              : 'Carregue o horizonte para ver rupturas por status.'
          }
          badge={
            temHorizonte && metricas.totalCriticos > 0 ? (
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200">
                {metricas.criticosComRuptura} críticos
              </span>
            ) : undefined
          }
        />
        <KPICard
          accentBar="bg-violet-500"
          iconWrap="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
          icon={<IconChart />}
          value={fmtNum2(metricas.sumEmpenhoMpp)}
          title="Empenho MPP (soma)"
          footer="Soma das «Qtde total componente (no dia)» no resumo MPP (todas as datas, sem filtro), uma vez por código — alinhado à coluna Empenho Total."
        />
        <KPICard
          accentBar="bg-emerald-500"
          iconWrap="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
          icon={<IconCalendar />}
          value={pctAbastecido != null ? `${pctAbastecido}%` : '—'}
          title="% abastecidos"
          footer="Share de linhas filtradas com status Abastecido (requer horizonte)."
        />
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Distribuição por status (horizonte)</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Mesmas categorias da coluna Status na grade MRP. Linhas sem linha de horizonte para o código aparecem como “—”.
          </p>
          {!temHorizonte ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
              Informe a data final e clique em Carregar horizonte para ver o gráfico.
            </p>
          ) : (
            <>
              <div className="h-4 rounded-full overflow-hidden flex bg-slate-100 dark:bg-slate-700">
                {STATUS_ORDER.map((s) => {
                  const c = metricas.statusCount[s] ?? 0;
                  if (c === 0) return null;
                  const pct = nFiltered > 0 ? (c / nFiltered) * 100 : 0;
                  return (
                    <div
                      key={s}
                      className={`${STATUS_BAR[s] ?? 'bg-slate-400'} transition-all`}
                      style={{ width: `${pct}%` }}
                      title={`${s}: ${c}`}
                    />
                  );
                })}
              </div>
              <ul className="mt-4 grid sm:grid-cols-2 gap-2 text-sm">
                {STATUS_ORDER.map((s) => {
                  const c = metricas.statusCount[s] ?? 0;
                  if (c === 0) return null;
                  return (
                    <li key={s} className="flex items-center gap-2">
                      <span className={`inline-block w-3 h-3 rounded-sm shrink-0 ${STATUS_BAR[s] ?? 'bg-slate-400'}`} />
                      <span className="text-slate-700 dark:text-slate-300">{s}</span>
                      <span className="tabular-nums font-semibold text-slate-900 dark:text-slate-100">{c}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm flex flex-col">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Resumo numérico</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Agregados sobre as linhas filtradas da grade.</p>
          <dl className="space-y-3 text-sm flex-1">
            <div className="flex justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
              <dt className="text-slate-600 dark:text-slate-400">Qtde a comprar (por código, máx.)</dt>
              <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {temHorizonte ? fmtNum2(metricas.sumQtdeComprar) : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
              <dt className="text-slate-600 dark:text-slate-400">Necessidade acumulada no último dia (por código)</dt>
              <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                {temHorizonte ? fmtNum2(metricas.sumNecessidadeUltimo) : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
              <dt className="text-slate-600 dark:text-slate-400">Códigos na grade sem linha no horizonte</dt>
              <dd className="font-semibold tabular-nums text-amber-700 dark:text-amber-300">
                {temHorizonte ? metricas.semLinhaHorizonte : '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-600 dark:text-slate-400">Itens críticos (filtrados)</dt>
              <dd className="font-semibold tabular-nums text-slate-900 dark:text-slate-50">{metricas.totalCriticos}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
