import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {

  fetchPainelComercial,

  formatEmissaoPainelBr,

  type PainelComercialDashboard,

  type StatusConformidadePainel,

  type PainelComercialPedido,

} from '../../api/painelComercial';

import PainelComercialPedidoDetalheModal from './PainelComercialPedidoDetalheModal';
import PoliticaComercialPainelModal from './PoliticaComercialPainelModal';



function hojeYmd(): string {

  const d = new Date();

  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

}



function inicioAnoYmd(): string {

  const d = new Date();

  return `${d.getFullYear()}-01-01`;

}



const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const pctFmt = (n: number) => `${n.toFixed(1)}%`;

type EmpresaPainelFiltro = 'todos' | 1 | 2;



function labelMesCurto(ym: string): string {

  const d = new Date(`${ym}-01T12:00:00`);

  if (Number.isNaN(d.getTime())) return ym;

  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

}



function labelStatus(s: StatusConformidadePainel): string {

  switch (s) {

    case 'ok':

      return 'Conforme';

    case 'alerta':

      return 'Alerta';

    case 'nao_conforme':

      return 'Não conforme';

    default:

      return 'Excluído (cartão)';

  }

}



function badgeClass(s: StatusConformidadePainel): string {

  switch (s) {

    case 'ok':

      return 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200';

    case 'alerta':

      return 'border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200';

    case 'nao_conforme':

      return 'border border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200';

    default:

      return 'border border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300';

  }

}



const STATUS_ORDEM_PAINEL: StatusConformidadePainel[] = ['ok', 'alerta', 'nao_conforme', 'excluido_politica'];



const STATUS_BAR_FILL_PAINEL: Record<StatusConformidadePainel, string> = {

  ok: 'bg-emerald-500 dark:bg-emerald-400',

  alerta: 'bg-amber-400 dark:bg-amber-500',

  nao_conforme: 'bg-rose-500 dark:bg-rose-400',

  excluido_politica: 'bg-slate-400 dark:bg-slate-500',

};



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



function conformidadeMensalSeries(

  porMes: PainelComercialDashboard['porMes']

): { key: string; label: string; pct: number; total: number; ok: number; analisadosNoMes: number }[] {

  return porMes.map((m) => {

    const analisadosNoMes = m.ok + m.alerta + m.naoConforme;

    const pct = analisadosNoMes > 0 ? Math.round((m.ok / analisadosNoMes) * 1000) / 10 : 0;

    return {

      key: m.mes,

      label: labelMesCurto(m.mes),

      pct,

      total: m.total,

      ok: m.ok,

      analisadosNoMes,

    };

  });

}



function ConformidadeMensalChart({ series }: { series: ReturnType<typeof conformidadeMensalSeries> }) {

  const [hover, setHover] = useState<number | null>(null);

  const chartWrapRef = useRef<HTMLDivElement>(null);

  const [W, setW] = useState(560);

  const H = 200;

  const padL = 44;

  const padR = 16;

  const padT = 16;

  const padB = 36;



  useEffect(() => {

    const el = chartWrapRef.current;

    if (!el) return;

    const ro = new ResizeObserver((entries) => {

      const w = entries[0]?.contentRect.width;

      if (w != null && w > 0) setW(Math.max(260, Math.floor(w)));

    });

    ro.observe(el);

    return () => ro.disconnect();

  }, [series.length]);



  const innerW = W - padL - padR;

  const innerH = H - padT - padB;

  const maxY = 100;

  const n = Math.max(1, series.length);

  const points = series.map((s, i) => {

    const x = padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);

    const y = padT + innerH - (s.pct / maxY) * innerH;

    return { x, y, ...s };

  });

  const pathD =

    points.length === 0

      ? ''

      : points.length === 1

        ? `M ${points[0].x} ${points[0].y}`

        : `M ${points.map((p) => `${p.x} ${p.y}`).join(' L ')}`;

  const areaD =

    pathD && points.length > 0

      ? `${pathD} L ${points[points.length - 1].x} ${padT + innerH} L ${points[0].x} ${padT + innerH} Z`

      : '';



  return (

    <div className="relative flex h-full min-h-0 w-full min-w-0 flex-col rounded-xl border border-slate-200 dark:border-slate-700 bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-800 dark:to-slate-900/50 p-4 shadow-sm">

      <div className="mb-2 shrink-0 flex items-start justify-between gap-2">

        <div className="min-w-0">

          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Conformidade por mês</h3>

          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">

            % conforme entre pedidos analisados pela política em cada mês (emissão)

          </p>

        </div>

      </div>

      {series.length === 0 ? (

        <p className="text-sm text-slate-500 dark:text-slate-400 py-12 text-center flex-1 flex items-center justify-center">

          Nenhum mês com pedidos no período.

        </p>

      ) : (

        <div ref={chartWrapRef} className="relative w-full min-h-[200px] flex-1 min-w-0 flex flex-col justify-end">

          <svg

            viewBox={`0 0 ${W} ${H}`}

            width="100%"

            height="auto"

            className="block w-full shrink-0"

            role="img"

            aria-label="Gráfico de conformidade mensal"

            onMouseLeave={() => setHover(null)}

          >

            <defs>

              <linearGradient id="painelComercialEvFill" x1="0" y1="0" x2="0" y2="1">

                <stop offset="0%" stopColor="rgb(37 99 235)" stopOpacity="0.25" />

                <stop offset="100%" stopColor="rgb(37 99 235)" stopOpacity="0" />

              </linearGradient>

            </defs>

            {[0, 0.25, 0.5, 0.75, 1].map((t) => {

              const y = padT + innerH * (1 - t);

              return (

                <line key={t} x1={padL} y1={y} x2={padL + innerW} y2={y} stroke="currentColor" strokeOpacity={0.08} className="text-slate-400" />

              );

            })}

            {areaD && <path d={areaD} fill="url(#painelComercialEvFill)" />}

            {pathD && (

              <path

                d={pathD}

                fill="none"

                stroke="rgb(37 99 235)"

                strokeWidth={2.5}

                strokeLinecap="round"

                strokeLinejoin="round"

                className="drop-shadow-sm"

              />

            )}

            {points.map((p, i) => (

              <g key={p.key}>

                <circle

                  cx={p.x}

                  cy={p.y}

                  r={hover === i ? 8 : 5}

                  fill="white"

                  stroke="rgb(37 99 235)"

                  strokeWidth={2}

                  className="cursor-pointer transition-all duration-150"

                  onMouseEnter={() => setHover(i)}

                />

                <text

                  x={p.x}

                  y={H - 8}

                  textAnchor="middle"

                  className="fill-slate-500 dark:fill-slate-400 text-[10px] font-medium"

                  style={{ fontSize: 10 }}

                >

                  {p.label}

                </text>

              </g>

            ))}

          </svg>

          {hover != null && points[hover] && (

            <div className="absolute left-1/2 top-8 -translate-x-1/2 z-10 px-3 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs shadow-xl pointer-events-none whitespace-nowrap">

              <strong>{points[hover].label}</strong>

              <br />

              {pctFmt(points[hover].pct)} · {points[hover].ok} conforme de {points[hover].analisadosNoMes} analisados · {points[hover].total} pedidos no mês

            </div>

          )}

        </div>

      )}

    </div>

  );

}



function GaugeConformidadePainel({ percent }: { percent: number }) {

  const r = 52;

  const c = 2 * Math.PI * r;

  const p = (Math.min(100, Math.max(0, percent)) / 100) * c;

  return (

    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm flex flex-col items-center h-full min-h-[280px]">

      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 self-start w-full mb-1">Conformidade global</h3>

      <p className="text-xs text-slate-500 dark:text-slate-400 self-start w-full mb-4">

        Pedidos analisados pela política no período filtrado.

      </p>

      <div className="relative flex-1 flex items-center justify-center" style={{ width: 140, height: 140 }}>

        <svg width={140} height={140} viewBox="0 0 120 120" className="-rotate-90 shrink-0">

          <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-slate-100 dark:text-slate-700" />

          <circle

            cx="60"

            cy="60"

            r={r}

            fill="none"

            stroke="url(#painelGaugeGrad)"

            strokeWidth="10"

            strokeLinecap="round"

            strokeDasharray={`${p} ${c}`}

            className="transition-all duration-700 ease-out"

          />

          <defs>

            <linearGradient id="painelGaugeGrad" x1="0" y1="0" x2="1" y2="1">

              <stop offset="0%" stopColor="rgb(16 185 129)" />

              <stop offset="100%" stopColor="rgb(37 99 235)" />

            </linearGradient>

          </defs>

        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pt-2">

          <span className="text-3xl font-bold text-slate-900 dark:text-slate-50 tabular-nums">{pctFmt(percent)}</span>

          <span className="text-[11px] text-slate-500 dark:text-slate-400 text-center leading-tight mt-0.5 px-2">Taxa de conformidade</span>

        </div>

      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2 max-w-xs">

        Conformes entre pedidos elegíveis (exclui pagamento em cartão da política).

      </p>

    </div>

  );

}



function DistribuicaoStatusPainel({

  contagem,

  total,

}: {

  contagem: Record<StatusConformidadePainel, number>;

  total: number;

}) {

  const [hover, setHover] = useState<StatusConformidadePainel | null>(null);

  return (

    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm h-full flex flex-col min-h-[280px] min-w-0">

      <div className="flex items-center justify-between gap-2 mb-1 shrink-0">

        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Distribuição por status</h3>

      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 shrink-0">Proporção no período (passe o mouse para destacar).</p>

      {total === 0 ? (

        <p className="text-sm text-slate-500 py-6 text-center flex-1 flex items-center justify-center">Sem pedidos no período.</p>

      ) : (

        <div className="space-y-3 flex-1 min-h-0">

          {STATUS_ORDEM_PAINEL.map((status) => {

            const n = contagem[status] ?? 0;

            const pct = total > 0 ? Math.round((n / total) * 1000) / 10 : 0;

            const active = hover === status || hover === null;

            return (

              <div

                key={status}

                className="block group"

                onMouseEnter={() => setHover(status)}

                onMouseLeave={() => setHover(null)}

              >

                <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">

                  <span className={active ? '' : 'opacity-40'}>{labelStatus(status)}</span>

                  <span className="tabular-nums">

                    {n} <span className="text-slate-400 font-normal">({pct}%)</span>

                  </span>

                </div>

                <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">

                  <div

                    className={`h-full rounded-full transition-all duration-500 ${STATUS_BAR_FILL_PAINEL[status]} opacity-90 group-hover:opacity-100 group-hover:brightness-110`}

                    style={{ width: `${pct}%`, minWidth: n > 0 ? '4px' : 0 }}

                  />

                </div>

              </div>

            );

          })}

        </div>

      )}

    </div>

  );

}



/** Barra única: trilho neutro + preenchimento primary */

function MetricBar({

  label,

  sublabel,

  value,

  max,

  showValue,

}: {

  label: string;

  sublabel?: string;

  value: number;

  max: number;

  showValue?: string;

}) {

  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  return (

    <div className="group">

      <div className="mb-1 flex justify-between text-xs font-medium text-slate-600 dark:text-slate-300 gap-2">

        <span className="min-w-0 truncate" title={label}>

          {label}

        </span>

        <span className="tabular-nums shrink-0">{showValue ?? String(value)}</span>

      </div>

      {sublabel ? <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1 truncate">{sublabel}</p> : null}

      <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">

        <div

          className="h-full rounded-full bg-primary-600 transition-[width] duration-500 ease-out dark:bg-primary-600 opacity-90 group-hover:opacity-100"

          style={{ width: `${pct}%`, minWidth: value > 0 ? '4px' : 0 }}

        />

      </div>

    </div>

  );

}



/** Recorrência mensal — segmentos semânticos */

function BarraStatusMes({

  ok,

  alerta,

  naoConforme,

  excluido,

}: {

  ok: number;

  alerta: number;

  naoConforme: number;

  excluido: number;

}) {

  const t = ok + alerta + naoConforme + excluido || 1;

  const seg = [

    { v: ok, className: 'bg-emerald-500 dark:bg-emerald-600', label: 'Conforme' },

    { v: alerta, className: 'bg-amber-400 dark:bg-amber-500', label: 'Alerta' },

    { v: naoConforme, className: 'bg-rose-500 dark:bg-rose-600', label: 'Não conforme' },

    { v: excluido, className: 'bg-slate-300 dark:bg-slate-600', label: 'Excluído' },

  ].filter((s) => s.v > 0);

  return (

    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">

      {seg.map((s, i) => (

        <div

          key={i}

          className={`h-full ${s.className} first:rounded-l-full last:rounded-r-full`}

          style={{ width: `${(s.v / t) * 100}%` }}

          title={`${s.label}: ${s.v}`}

        />

      ))}

    </div>

  );

}



export default function PainelFinanceiroComercialPage() {

  const [dataInicio, setDataInicio] = useState(inicioAnoYmd);

  const [dataFim, setDataFim] = useState(hojeYmd);

  /** Período efetivamente aplicado na consulta (só muda ao clicar em "Aplicar período"). */
  const [dataInicioAplicada, setDataInicioAplicada] = useState(inicioAnoYmd);

  const [dataFimAplicada, setDataFimAplicada] = useState(hojeYmd);

  const [empresaFiltro, setEmpresaFiltro] = useState<EmpresaPainelFiltro>('todos');

  const [dash, setDash] = useState<PainelComercialDashboard | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [filtroStatus, setFiltroStatus] = useState<StatusConformidadePainel | 'todos'>('todos');

  const [filtroFormaPagamento, setFiltroFormaPagamento] = useState('');

  const [filtroCondicaoPagamento, setFiltroCondicaoPagamento] = useState('');

  const [filtroCliente, setFiltroCliente] = useState('');

  const [filtroPedido, setFiltroPedido] = useState('');

  const [pedidoModal, setPedidoModal] = useState<PainelComercialPedido | null>(null);

  const [politicaModalOpen, setPoliticaModalOpen] = useState(false);



  const carregar = useCallback(async () => {

    setLoading(true);

    setError(null);

    try {

      const r = await fetchPainelComercial({
        dataInicio: dataInicioAplicada,
        dataFim: dataFimAplicada,
        empresaId: empresaFiltro,
      });

      if (r.erro) {

        setDash(null);

        setError(r.erro);

        return;

      }

      setDash(r);

    } catch (e) {

      setDash(null);

      setError(e instanceof Error ? e.message : 'Erro ao carregar.');

    } finally {

      setLoading(false);

    }

  }, [dataInicioAplicada, dataFimAplicada, empresaFiltro]);

  const aplicarPeriodo = useCallback(() => {

    if (dataInicio === dataInicioAplicada && dataFim === dataFimAplicada) {

      void carregar();

      return;

    }

    setDataInicioAplicada(dataInicio);

    setDataFimAplicada(dataFim);

  }, [carregar, dataInicio, dataFim, dataInicioAplicada, dataFimAplicada]);



  useEffect(() => {

    void carregar();

  }, [carregar]);



  const pedidosFiltrados = useMemo(() => {

    if (!dash?.pedidos) return [];

    const qPed = filtroPedido.trim().toLowerCase();

    const qCli = filtroCliente.trim().toLowerCase();

    const qForma = filtroFormaPagamento.trim().toLowerCase();

    const qCond = filtroCondicaoPagamento.trim().toLowerCase();

    return dash.pedidos.filter((p) => {

      if (filtroStatus !== 'todos' && p.status !== filtroStatus) return false;

      if (qForma && !p.formaPagamento.toLowerCase().includes(qForma)) return false;

      if (qCond && !p.condicaoPagamento.toLowerCase().includes(qCond)) return false;

      if (qCli && !p.cliente.toLowerCase().includes(qCli)) return false;

      if (qPed) {

        const pdLower = p.pd.toLowerCase();

        if (!pdLower.includes(qPed)) {

          const soDigitosPed = qPed.replace(/\D/g, '');

          const soDigitosPd = p.pd.replace(/\D/g, '');

          if (!soDigitosPed || !soDigitosPd.includes(soDigitosPed)) return false;

        }

      }

      return true;

    });

  }, [dash, filtroStatus, filtroFormaPagamento, filtroCondicaoPagamento, filtroCliente, filtroPedido]);



  const serieConformidadeMes = useMemo(

    () => (dash ? conformidadeMensalSeries(dash.porMes) : []),

    [dash]

  );



  const contagemStatus = useMemo(() => {

    const o: Record<StatusConformidadePainel, number> = {

      ok: 0,

      alerta: 0,

      nao_conforme: 0,

      excluido_politica: 0,

    };

    if (!dash?.pedidos) return o;

    for (const p of dash.pedidos) {

      o[p.status] += 1;

    }

    return o;

  }, [dash]);



  const temFiltrosLista =

    filtroStatus !== 'todos' ||

    filtroFormaPagamento.trim() !== '' ||

    filtroCondicaoPagamento.trim() !== '' ||

    filtroCliente.trim() !== '' ||

    filtroPedido.trim() !== '';



  const limparFiltrosLista = useCallback(() => {

    setFiltroStatus('todos');

    setFiltroFormaPagamento('');

    setFiltroCondicaoPagamento('');

    setFiltroCliente('');

    setFiltroPedido('');

  }, []);



  const inputClass =

    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:focus:border-primary-500 dark:focus:ring-primary-500/25';



  if (loading && !dash && !error) {

    return (

      <div className="space-y-6 pb-10">

        <div className="flex flex-wrap items-center justify-between gap-4">

          <div>

            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Painel Financeiro-Comercial</h2>

            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Carregando indicadores…</p>

          </div>

          <div className="h-10 w-48 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />

        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">

          {[1, 2, 3, 4, 5].map((i) => (

            <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 animate-pulse">

              <div className="h-10 w-10 bg-slate-200 dark:bg-slate-700 rounded-xl mb-4" />

              <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-2" />

              <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />

            </div>

          ))}

        </div>

        <div className="grid lg:grid-cols-5 gap-4">

          <div className="lg:col-span-3 h-64 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />

          <div className="lg:col-span-2 h-64 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />

        </div>

      </div>

    );

  }



  return (

    <div className="w-full min-w-0 flex flex-col space-y-6 pb-10">

      <div className="flex flex-wrap items-center justify-between gap-4">

        <div className="min-w-0">

          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Painel Financeiro-Comercial</h2>

        </div>

      </div>



      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden">

        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-600 flex flex-col gap-4">

          <div className="flex flex-wrap items-end gap-4">

            <div>

              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Emissão (de)</label>

              <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className={inputClass} />

            </div>

            <div>

              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Emissão (até)</label>

              <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className={inputClass} />

            </div>

            <div>

              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Empresa</label>

              <select
                value={String(empresaFiltro)}
                onChange={(e) => {
                  const v = e.target.value;
                  setEmpresaFiltro(v === '1' ? 1 : v === '2' ? 2 : 'todos');
                }}
                className={`${inputClass} min-w-[10rem]`}
              >
                <option value="todos">Todas</option>
                <option value="1">Só Aço</option>
                <option value="2">Só Móveis</option>
              </select>

            </div>

            <button

              type="button"

              onClick={aplicarPeriodo}

              disabled={loading}

              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold shadow-md shadow-primary-600/25 transition-all"

            >

              {loading ? 'Carregando…' : 'Aplicar período'}

            </button>

            <button

              type="button"

              onClick={() => setPoliticaModalOpen(true)}

              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold dark:border-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-100 transition-all"

            >

              Política comercial

            </button>

          </div>

          <div className="flex flex-wrap items-end gap-3">

            <div>

              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Status</label>

              <select

                value={filtroStatus}

                onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}

                className={`${inputClass} min-w-[11rem]`}

              >

                <option value="todos">Todos os status</option>

                <option value="ok">Conforme</option>

                <option value="alerta">Alerta</option>

                <option value="nao_conforme">Não conforme</option>

                <option value="excluido_politica">Excluído (cartão)</option>

              </select>

            </div>

            <div className="min-w-[9rem] flex-1 max-w-[14rem]">

              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Forma de pagamento</label>

              <input

                type="search"

                placeholder="Ex.: Boleto"

                value={filtroFormaPagamento}

                onChange={(e) => setFiltroFormaPagamento(e.target.value)}

                className={`${inputClass} w-full min-w-0`}

              />

            </div>

            <div className="min-w-[9rem] flex-1 max-w-[18rem]">

              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Condição de pagamento</label>

              <input

                type="search"

                placeholder="Trecho da condição"

                value={filtroCondicaoPagamento}

                onChange={(e) => setFiltroCondicaoPagamento(e.target.value)}

                className={`${inputClass} w-full min-w-0`}

              />

            </div>

            <div className="min-w-[9rem] flex-1 max-w-[16rem]">

              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Cliente</label>

              <input

                type="search"

                placeholder="Nome do cliente"

                value={filtroCliente}

                onChange={(e) => setFiltroCliente(e.target.value)}

                className={`${inputClass} w-full min-w-0`}

              />

            </div>

            <div className="min-w-[7rem] max-w-[12rem]">

              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Pedido</label>

              <input

                type="search"

                placeholder="PD ou número"

                value={filtroPedido}

                onChange={(e) => setFiltroPedido(e.target.value)}

                className={`${inputClass} w-full min-w-0`}

              />

            </div>

            {temFiltrosLista ? (

              <button

                type="button"

                onClick={limparFiltrosLista}

                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-sm font-medium transition shrink-0"

                title="Limpar filtros da lista"

              >

                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>

                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />

                  <line x1="10" y1="11" x2="10" y2="17" />

                  <line x1="14" y1="11" x2="14" y2="17" />

                </svg>

                Limpar filtros

              </button>

            ) : null}

          </div>

        </div>

      </div>



      {error ? (

        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">

          {error}

        </div>

      ) : null}



      {dash && !error ? (

        <div className="relative flex flex-col gap-6">

          {loading ? (

            <div className="pointer-events-none absolute inset-0 z-10 rounded-xl bg-white/55 backdrop-blur-[2px] dark:bg-slate-950/45" />

          ) : null}



          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">

            <KPICard

              accentBar="bg-blue-600"

              iconWrap="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300"

              icon={

                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">

                  <path d="M3 3v18h18" />

                  <path d="M18 17V9" />

                  <path d="M13 17V5" />

                  <path d="M8 17v-3" />

                </svg>

              }

              value={dash.totalPedidos}

              title="Pedidos no período"

              footer={`${dash.pedidosAnalisados} na política · ${dash.pedidosExcluidosPolitica} exclusão cartão`}

            />

            <KPICard

              accentBar="bg-emerald-500"

              iconWrap="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"

              icon={

                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">

                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />

                  <polyline points="22 4 12 14.01 9 11.01" />

                </svg>

              }

              value={pctFmt(dash.pctConformes)}

              title="Taxa de conformidade"

              footer={`Alerta ${pctFmt(dash.pctAlertas)} · Não conf. ${pctFmt(dash.pctNaoConformes)}`}

            />

            <KPICard

              accentBar="bg-teal-500"

              iconWrap="bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300"

              icon={

                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">

                  <line x1="12" y1="1" x2="12" y2="23" />

                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />

                </svg>

              }

              value={brl.format(dash.ticketMedio)}

              title="Ticket médio"

              footer={`Política: ${brl.format(dash.ticketMedioAnalisados)}`}

            />

            <KPICard

              accentBar="bg-violet-600"

              iconWrap="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"

              icon={

                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">

                  <rect x="3" y="3" width="7" height="7" />

                  <rect x="14" y="3" width="7" height="7" />

                  <rect x="14" y="14" width="7" height="7" />

                  <rect x="3" y="14" width="7" height="7" />

                </svg>

              }

              value={dash.pedidosAnalisados}

              title="Pedidos na política"

              footer={`Base para prazos e parcelamento · exclusões cartão: ${dash.pedidosExcluidosPolitica}`}

            />

            <KPICard

              accentBar="bg-amber-500"

              iconWrap="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200"

              icon={

                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">

                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />

                  <line x1="16" y1="2" x2="16" y2="6" />

                  <line x1="8" y1="2" x2="8" y2="6" />

                  <line x1="3" y1="10" x2="21" y2="10" />

                </svg>

              }

              value={

                dash.prazoMedioVendasAPrazoDias != null

                  ? `${dash.prazoMedioVendasAPrazoDias.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} dias`

                  : '—'

              }

              title="Prazo médio (a prazo)"

              footer={`Média do prazo do saldo nos pedidos com parcelas na condição · ${dash.pedidosVendasAPrazoComPrazoCadastrado} pedido${dash.pedidosVendasAPrazoComPrazoCadastrado !== 1 ? 's' : ''} (sem cartão e sem à vista)`}

            />

          </div>



          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-stretch">

            <div className="min-w-0 w-full lg:row-span-2 min-h-0">

              <ConformidadeMensalChart series={serieConformidadeMes} />

            </div>

            <div className="min-w-0">

              <GaugeConformidadePainel percent={dash.pctConformes} />

            </div>

            <div className="min-w-0 flex flex-col">

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm h-full flex flex-col min-h-[280px]">

                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Resumo da política</h4>

                <div className="space-y-3 text-sm flex-1">

                  <div className="flex justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">

                    <span className="text-slate-500 dark:text-slate-400">Pedidos analisados</span>

                    <span className="font-bold text-primary-600 dark:text-primary-400 tabular-nums">{dash.pedidosAnalisados}</span>

                  </div>

                  <div className="flex justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">

                    <span className="text-slate-500 dark:text-slate-400">Excluídos (cartão)</span>

                    <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">{dash.pedidosExcluidosPolitica}</span>

                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400">

                    A taxa global no gauge usa apenas pedidos elegíveis à política no intervalo de emissão.

                  </p>

                </div>

              </div>

            </div>

            <div className="min-w-0 flex flex-col min-h-0">

              <DistribuicaoStatusPainel contagem={contagemStatus} total={dash.totalPedidos} />

            </div>

            <div className="min-w-0 flex flex-col min-h-0">

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm h-full min-h-[280px] flex flex-col">

                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1">Faixa de ticket</h3>

                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">% conforme entre pedidos elegíveis por faixa de valor.</p>

                <div className="space-y-4 flex-1 overflow-y-auto min-h-0">

                  {dash.porFaixa.map((f) => (

                    <MetricBar

                      key={f.faixa}

                      label={f.label}

                      sublabel={`${f.pedidos} pedidos`}

                      value={f.pctOk}

                      max={100}

                      showValue={pctFmt(f.pctOk)}

                    />

                  ))}

                </div>

              </div>

            </div>

          </div>



          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm">

            <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Recorrência por mês</h3>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">Emissão do pedido — proporção de status por barra.</p>

            {dash.porMes.length === 0 ? (

              <p className="py-6 text-center text-sm text-slate-500">Nenhum pedido no período.</p>

            ) : (

              <div className="space-y-4">

                {dash.porMes.map((m) => (

                  <div key={m.mes} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">

                    <span className="w-24 shrink-0 font-sans tabular-nums text-[13px] font-semibold text-slate-700 dark:text-slate-200">{m.mes}</span>

                    <div className="min-w-0 flex-1 space-y-1.5">

                      <BarraStatusMes ok={m.ok} alerta={m.alerta} naoConforme={m.naoConforme} excluido={m.excluido} />

                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">

                        <span>{m.total} pedidos</span>

                        <span className="text-emerald-600 dark:text-emerald-400">{m.ok} ok</span>

                        <span className="text-amber-700 dark:text-amber-400">{m.alerta} alerta</span>

                        <span className="text-rose-700 dark:text-rose-400">{m.naoConforme} não conf.</span>

                        {m.excluido > 0 ? <span className="text-slate-500">{m.excluido} excl.</span> : null}

                      </div>

                    </div>

                  </div>

                ))}

              </div>

            )}

          </div>



          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm overflow-hidden">

            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-600">

              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Detalhe por pedido</h3>

              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">

                {temFiltrosLista ? (

                  <>

                    Exibindo <strong className="text-slate-700 dark:text-slate-300">{pedidosFiltrados.length}</strong> de{' '}

                    <strong className="text-slate-700 dark:text-slate-300">{dash.pedidos.length}</strong> pedido

                    {dash.pedidos.length !== 1 ? 's' : ''} no período ·{' '}

                  </>

                ) : (

                  <>

                    {dash.pedidos.length} pedido{dash.pedidos.length !== 1 ? 's' : ''} no período ·{' '}

                  </>

                )}

                use o ícone de visualização para abrir detalhe e itens

              </p>

            </div>

            <div className="overflow-x-auto">

              <table className="w-full min-w-[920px] text-sm text-left">

                <thead className="bg-primary-600 text-white">

                  <tr>

                    <th className="py-3 px-3 font-semibold w-14 text-center" aria-label="Ver detalhe" />

                    <th className="py-3 px-4 font-semibold">PD</th>

                    <th className="py-3 px-4 font-semibold">Cliente</th>

                    <th className="py-3 px-4 font-semibold">Emissão</th>

                    <th className="py-3 px-4 font-semibold text-right">Total</th>

                    <th className="py-3 px-4 font-semibold text-right">Entrada</th>

                    <th className="py-3 px-4 font-semibold text-right">% Ent.</th>

                    <th className="py-3 px-4 font-semibold">Forma</th>

                    <th className="min-w-[200px] py-3 px-4 font-semibold">Prazos (cadastro → esperado)</th>

                    <th className="py-3 px-4 font-semibold">Status</th>

                  </tr>

                </thead>

                <tbody className="text-slate-700 dark:text-slate-200">

                  {pedidosFiltrados.map((p) => (

                    <tr

                      key={p.pd}

                      className="border-t border-slate-200 dark:border-slate-700 odd:bg-white even:bg-slate-50/90 dark:odd:bg-slate-900/30 dark:even:bg-slate-800/20 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors"

                    >

                      <td className="py-3 px-3 align-middle text-center">

                        <button

                          type="button"

                          className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-slate-600 dark:text-slate-300 hover:bg-primary-50 hover:border-primary-400 hover:text-primary-700 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition"

                          title={p.pdId ? 'Ver detalhe e itens do pedido' : 'Id interno indisponível'}

                          onClick={(e) => {

                            e.stopPropagation();

                            setPedidoModal(p);

                          }}

                          disabled={!p.pdId}

                        >

                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>

                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />

                            <circle cx="12" cy="12" r="3" />

                          </svg>

                        </button>

                      </td>

                      <td className="py-3 px-4 align-middle font-sans text-sm font-semibold tabular-nums text-primary-700 dark:text-primary-400">

                        {p.pd}

                      </td>

                      <td className="max-w-[200px] truncate py-3 px-4 align-middle" title={p.cliente}>

                        {p.cliente}

                      </td>

                      <td className="whitespace-nowrap py-3 px-4 align-middle tabular-nums text-slate-600 dark:text-slate-400">

                        {formatEmissaoPainelBr(p.emissao)}

                      </td>

                      <td className="py-3 px-4 align-middle text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">

                        {brl.format(p.totalPedido)}

                      </td>

                      <td className="py-3 px-4 align-middle text-right tabular-nums text-slate-700 dark:text-slate-300">

                        {brl.format(p.somaEntrada)}

                      </td>

                      <td className="py-3 px-4 align-middle text-right tabular-nums text-slate-700 dark:text-slate-300">

                        {pctFmt(p.pctEntrada * 100)}

                      </td>

                      <td className="max-w-[130px] truncate py-3 px-4 align-middle text-slate-700 dark:text-slate-300" title={p.formaPagamento}>

                        {p.formaPagamento}

                      </td>

                      <td className="max-w-[260px] py-3 px-4 align-middle text-xs leading-snug text-slate-700 dark:text-slate-300">

                        <span className="font-medium">{p.periodicidadeLabel}</span>

                        <span className="block text-[11px] text-slate-500 dark:text-slate-500">Esperado: {p.diasEsperados}</span>

                      </td>

                      <td className="py-3 px-4 align-middle whitespace-nowrap">

                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${badgeClass(p.status)}`}>

                          {labelStatus(p.status)}

                        </span>

                        {p.retiradaSoAco ? (

                          <span

                            className="ml-1.5 inline-flex rounded border border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-medium uppercase text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"

                            title="Retirada Só Aço — conferir desconto"

                          >

                            RSA

                          </span>

                        ) : null}

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          </div>

        {pedidoModal ? (
          <PainelComercialPedidoDetalheModal pedido={pedidoModal} onClose={() => setPedidoModal(null)} />
        ) : null}

        <PoliticaComercialPainelModal
          open={politicaModalOpen}
          onClose={() => setPoliticaModalOpen(false)}
          onSaved={() => void carregar()}
        />

        </div>

      ) : null}

    </div>

  );

}

