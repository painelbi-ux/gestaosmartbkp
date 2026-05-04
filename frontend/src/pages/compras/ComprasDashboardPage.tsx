import { useEffect, useState, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useOnSincronizado } from '../../hooks/useOnSincronizado';
import {
  listarColetasPrecos,
  obterOpcoesFiltroColetas,
  obterSerieErrosVinculoOperacionalDashboard,
  type ColetaPrecosListItem,
} from '../../api/compras';
import MultiSelectWithSearch from '../../components/MultiSelectWithSearch';

const STATUS_ORDEM = ['Em cotação', 'Em Aprovação', 'Rejeitada', 'Finalizada', 'Enviado para Financeiro'] as const;

function agregarPorStatus(coletas: ColetaPrecosListItem[]): Record<string, number> {
  const contagem: Record<string, number> = {
    'Em cotação': 0,
    'Em Aprovação': 0,
    Rejeitada: 0,
    Finalizada: 0,
    'Enviado para Financeiro': 0,
  };
  for (const c of coletas) {
    const s = c.status ?? 'Em cotação';
    contagem[s] = (contagem[s] ?? 0) + 1;
  }
  return contagem;
}

/** Tempo médio em dias (abertura → finalização). Só considera coletas com dataFinalizacao. */
function tempoMedioDiasAteFinalizacao(coletas: ColetaPrecosListItem[]): number | null {
  const comFinalizacao = coletas.filter(
    (c): c is ColetaPrecosListItem & { dataFinalizacao: string; dataCriacao: string } =>
      !!c.dataFinalizacao && !!c.dataCriacao
  );
  if (comFinalizacao.length === 0) return null;
  const totalMs = comFinalizacao.reduce((acc, c) => {
    const fim = new Date(c.dataFinalizacao).getTime();
    const ini = new Date(c.dataCriacao).getTime();
    return acc + (fim - ini);
  }, 0);
  return totalMs / comFinalizacao.length / (24 * 60 * 60 * 1000);
}

/** Tempo médio em dias em que a coleta ficou em aprovação (dataEnvioAprovacao → dataFinalizacao). Só considera coletas finalizadas com dataEnvioAprovacao. */
function tempoMedioDiasEmAprovacao(coletas: ColetaPrecosListItem[]): number | null {
  const comAprovacao = coletas.filter(
    (c): c is ColetaPrecosListItem & { dataFinalizacao: string; dataEnvioAprovacao: string } =>
      !!c.dataFinalizacao && !!c.dataEnvioAprovacao
  );
  if (comAprovacao.length === 0) return null;
  const totalMs = comAprovacao.reduce((acc, c) => {
    const fim = new Date(c.dataFinalizacao).getTime();
    const ini = new Date(c.dataEnvioAprovacao).getTime();
    return acc + Math.max(0, fim - ini);
  }, 0);
  return totalMs / comAprovacao.length / (24 * 60 * 60 * 1000);
}

/** Tempo médio de coleta (dias, abertura → finalização) por usuário. Só considera coletas com dataFinalizacao. */
function tempoMedioDiasPorUsuario(coletas: ColetaPrecosListItem[]): { usuario: string; dias: number; quantidade: number }[] {
  const comFinalizacao = coletas.filter(
    (c): c is ColetaPrecosListItem & { dataFinalizacao: string; dataCriacao: string; usuarioCriacao: string } =>
      !!c.dataFinalizacao && !!c.dataCriacao && !!c.usuarioCriacao
  );
  if (comFinalizacao.length === 0) return [];
  const porUsuario: Record<string, { totalMs: number; count: number }> = {};
  for (const c of comFinalizacao) {
    const u = (c.usuarioCriacao ?? '').trim() || '—';
    if (!porUsuario[u]) porUsuario[u] = { totalMs: 0, count: 0 };
    const fim = new Date(c.dataFinalizacao).getTime();
    const ini = new Date(c.dataCriacao).getTime();
    porUsuario[u].totalMs += fim - ini;
    porUsuario[u].count += 1;
  }
  return Object.entries(porUsuario).map(([usuario, { totalMs, count }]) => ({
    usuario,
    dias: totalMs / count / (24 * 60 * 60 * 1000),
    quantidade: count,
  })).sort((a, b) => b.dias - a.dias);
}

function formatarTempoMedio(dias: number): string {
  if (dias < 1) {
    const horas = Math.round(dias * 24);
    if (horas < 60) return `${horas} h`;
    const d = Math.floor(horas / 24);
    const h = horas % 24;
    return h > 0 ? `${d} d ${h} h` : `${d} dia${d !== 1 ? 's' : ''}`;
  }
  const d = Math.floor(dias);
  const h = Math.round((dias - d) * 24);
  if (h === 0) return `${d} dia${d !== 1 ? 's' : ''}`;
  return `${d} d ${h} h`;
}

const STATUS_BAR_FILL: Record<string, string> = {
  'Em cotação': 'bg-amber-400 dark:bg-amber-500',
  'Em Aprovação': 'bg-blue-500 dark:bg-blue-400',
  Rejeitada: 'bg-red-500 dark:bg-red-400',
  Finalizada: 'bg-emerald-500 dark:bg-emerald-400',
  'Enviado para Financeiro': 'bg-slate-500 dark:bg-slate-400',
};

const CARD_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  'Em cotação': {
    bg: 'bg-amber-50 dark:bg-amber-900/20',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800',
  },
  'Em Aprovação': {
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800',
  },
  Rejeitada: {
    bg: 'bg-red-50 dark:bg-red-900/20',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-800',
  },
  Finalizada: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
  'Enviado para Financeiro': {
    bg: 'bg-slate-100 dark:bg-slate-800/50',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-600',
  },
};

/** Série mensal: registros de preço e qtd de coletas criadas (proxy de evolução da atividade de preços). */
function agregarPorMesCriacao(coletas: ColetaPrecosListItem[]): { key: string; label: string; registros: number; coletas: number }[] {
  const map = new Map<string, { registros: number; coletas: number }>();
  for (const c of coletas) {
    const d = new Date(c.dataCriacao);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const prev = map.get(key) ?? { registros: 0, coletas: 0 };
    prev.registros += c.qtdRegistros ?? 0;
    prev.coletas += 1;
    map.set(key, prev);
  }
  const sorted = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const slice = sorted.slice(-12);
  return slice.map(([key, v]) => ({
    key,
    label: new Date(`${key}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
    registros: v.registros,
    coletas: v.coletas,
  }));
}

function contarColetasCriadasEntre(coletas: ColetaPrecosListItem[], inicioMs: number, fimMs: number): number {
  return coletas.filter((c) => {
    const t = new Date(c.dataCriacao).getTime();
    return t >= inicioMs && t < fimMs;
  }).length;
}

/** Taxa de aprovação: finalizadas + enviadas ao financeiro ÷ (essas + rejeitadas), quando há decisão. */
function taxaAprovacaoPercent(contagem: Record<string, number>): number | null {
  const fin = (contagem.Finalizada ?? 0) + (contagem['Enviado para Financeiro'] ?? 0);
  const rej = contagem.Rejeitada ?? 0;
  const denom = fin + rej;
  if (denom === 0) return null;
  return Math.round((fin / denom) * 1000) / 10;
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

function EvolutionPriceChart({ series }: { series: { key: string; label: string; registros: number; coletas: number }[] }) {
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
  const maxR = Math.max(1, ...series.map((s) => s.registros));
  const n = Math.max(1, series.length);
  const points = series.map((s, i) => {
    const x = padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = padT + innerH - (s.registros / maxR) * innerH;
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
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Evolução de lançamentos de preço</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Volume de registros de preço por mês (criação da coleta) — indicador de intensidade da coleta
          </p>
        </div>
      </div>
      {series.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-12 text-center flex-1 flex items-center justify-center">Sem dados no período filtrado.</p>
      ) : (
        <div
          ref={chartWrapRef}
          className="relative w-full min-h-[200px] flex-1 min-w-0 flex flex-col justify-end"
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height="auto"
            className="block w-full shrink-0"
            role="img"
            aria-label="Gráfico de evolução de registros de preço"
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="evFill" x1="0" y1="0" x2="0" y2="1">
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
            {areaD && <path d={areaD} fill="url(#evFill)" />}
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
              {points[hover].registros} registro{points[hover].registros !== 1 ? 's' : ''} · {points[hover].coletas} coleta
              {points[hover].coletas !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EvolutionErroOperacionalChart({ series }: { series: { key: string; label: string; count: number }[] }) {
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
  const maxR = Math.max(1, ...series.map((s) => s.count));
  const n = Math.max(1, series.length);
  const points = series.map((s, i) => {
    const x = padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = padT + innerH - (s.count / maxR) * innerH;
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
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Erros operacionais (vínculo)</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Finalizações em que o pedido/cotação foi registrado como erro operacional (data do registro). Respeita o filtro de datas acima quando preenchido; caso contrário, últimos 12 meses.
          </p>
        </div>
      </div>
      {series.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400 py-12 text-center flex-1 flex items-center justify-center">
          Nenhum registro de erro operacional no período.
        </p>
      ) : (
        <div ref={chartWrapRef} className="relative w-full min-h-[200px] flex-1 min-w-0 flex flex-col justify-end">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height="auto"
            className="block w-full shrink-0"
            role="img"
            aria-label="Gráfico de erros operacionais de vínculo"
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="evErroFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(217 119 6)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="rgb(217 119 6)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = padT + innerH * (1 - t);
              return (
                <line key={t} x1={padL} y1={y} x2={padL + innerW} y2={y} stroke="currentColor" strokeOpacity={0.08} className="text-slate-400" />
              );
            })}
            {areaD && <path d={areaD} fill="url(#evErroFill)" />}
            {pathD && (
              <path
                d={pathD}
                fill="none"
                stroke="rgb(217 119 6)"
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
                  stroke="rgb(217 119 6)"
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
              {points[hover].count} registro{points[hover].count !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBarsInteractive({
  contagem,
  total,
}: {
  contagem: Record<string, number>;
  total: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm h-full flex flex-col min-h-[280px] min-w-0">
      <div className="flex items-center justify-between gap-2 mb-1 shrink-0">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Distribuição das coletas</h3>
        <Link to="/compras/coletas-precos" className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">
          Abrir coletas
        </Link>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 shrink-0">Proporção por status (passe o mouse para destacar).</p>
      {total === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center flex-1 flex items-center justify-center">Sem coletas no filtro atual.</p>
      ) : (
        <div className="space-y-3 flex-1 min-h-0">
          {STATUS_ORDEM.map((status) => {
            const n = contagem[status] ?? 0;
            const pct = total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
            const active = hover === status || hover === null;
            return (
              <Link
                key={status}
                to={`/compras/coletas-precos?status=${encodeURIComponent(status)}`}
                className="block group"
                onMouseEnter={() => setHover(status)}
                onMouseLeave={() => setHover(null)}
              >
                <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  <span className={active ? '' : 'opacity-40'}>{status}</span>
                  <span className="tabular-nums">
                    {n} <span className="text-slate-400 font-normal">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${STATUS_BAR_FILL[status] ?? 'bg-slate-400'} opacity-90 group-hover:opacity-100 group-hover:brightness-110`}
                    style={{ width: `${pct}%`, minWidth: n > 0 ? '4px' : 0 }}
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GaugeAprovacao({ percent }: { percent: number | null }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const p = percent != null ? (percent / 100) * c : 0;
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm flex flex-col items-center">
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100 self-start w-full mb-1">Metas operacionais</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 self-start w-full mb-4">Indicadores derivados dos dados filtrados.</p>
      <div className="relative" style={{ width: 140, height: 140 }}>
        <svg width={140} height={140} viewBox="0 0 120 120" className="-rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-slate-100 dark:text-slate-700" />
          {percent != null && (
            <circle
              cx="60"
              cy="60"
              r={r}
              fill="none"
              stroke="url(#gaugeGrad)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${p} ${c}`}
              className="transition-all duration-700 ease-out"
            />
          )}
          <defs>
            <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="rgb(16 185 129)" />
              <stop offset="100%" stopColor="rgb(37 99 235)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pt-2">
          <span className="text-3xl font-bold text-slate-900 dark:text-slate-50 tabular-nums">
            {percent != null ? `${percent}%` : '—'}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 text-center leading-tight mt-0.5 px-2">
            Taxa de aprovação
          </span>
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-2 max-w-xs">
        Finalizadas + Enviado p/ Financeiro ÷ (essas + Rejeitadas), quando já houve decisão.
      </p>
    </div>
  );
}

function filtrarColetas(
  coletas: ColetaPrecosListItem[],
  filterStatus: string,
  filterNomeColeta: string,
  filterCriadoPor: string,
  filterDataInicio: string,
  filterDataFim: string,
  filterCodigo: string,
  filterDescricao: string
): ColetaPrecosListItem[] {
  const codigosSelecionados = filterCodigo.split(',').map((s) => s.trim()).filter(Boolean);
  const descricoesSelecionadas = filterDescricao.split(',').map((s) => s.trim()).filter(Boolean);
  return coletas.filter((c) => {
    const statusColeta = c.status ?? 'Em cotação';
    if (filterStatus && statusColeta !== filterStatus) return false;
    if (filterNomeColeta.trim()) {
      const term = filterNomeColeta.trim().toLowerCase();
      const nomesColeta = c.nomesColeta ?? [];
      const matchNomeColeta = nomesColeta.some((n) => n.toLowerCase().includes(term));
      const display = `Coleta #${c.id} (${c.qtdItens} itens, ${c.qtdRegistros} registros)`;
      const matchDisplay = display.toLowerCase().includes(term) || String(c.id).includes(term);
      if (!matchNomeColeta && !matchDisplay) return false;
    }
    if (filterCriadoPor.trim()) {
      const criado = (c.usuarioCriacao ?? '').toLowerCase();
      if (!criado.includes(filterCriadoPor.trim().toLowerCase())) return false;
    }
    if (filterDataInicio || filterDataFim) {
      const data = new Date(c.dataCriacao).getTime();
      if (filterDataInicio && data < new Date(filterDataInicio + 'T00:00:00').getTime()) return false;
      if (filterDataFim && data > new Date(filterDataFim + 'T23:59:59').getTime()) return false;
    }
    if (codigosSelecionados.length > 0) {
      const codigosColeta = c.codigosProduto ?? [];
      if (!codigosSelecionados.some((cod) => codigosColeta.includes(cod))) return false;
    }
    if (descricoesSelecionadas.length > 0) {
      const descricoesColeta = c.descricoesProduto ?? [];
      if (!descricoesSelecionadas.some((desc) => descricoesColeta.includes(desc))) return false;
    }
    return true;
  });
}

export default function ComprasDashboardPage() {
  const [searchParams] = useSearchParams();
  const statusFromUrl = searchParams.get('status') ?? '';
  const [coletas, setColetas] = useState<ColetaPrecosListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState(statusFromUrl);
  const [filterNomeColeta, setFilterNomeColeta] = useState('');
  const [filterCriadoPor, setFilterCriadoPor] = useState('');
  const [filterDataInicio, setFilterDataInicio] = useState('');
  const [filterDataFim, setFilterDataFim] = useState('');
  const [filterCodigo, setFilterCodigo] = useState('');
  const [filterDescricao, setFilterDescricao] = useState('');
  const [opcoesFiltro, setOpcoesFiltro] = useState<{ codigos: string[]; descricoes: string[]; coletas: string[] }>({
    codigos: [],
    descricoes: [],
    coletas: [],
  });
  const [serieErrosVinculoOperacional, setSerieErrosVinculoOperacional] = useState<{ key: string; label: string; count: number }[]>([]);

  useEffect(() => {
    setFilterStatus(statusFromUrl);
  }, [statusFromUrl]);

  useEffect(() => {
    obterOpcoesFiltroColetas()
      .then((r) =>
        setOpcoesFiltro({ codigos: r.codigos ?? [], descricoes: r.descricoes ?? [], coletas: r.coletas ?? [] })
      )
      .catch(() => setOpcoesFiltro({ codigos: [], descricoes: [], coletas: [] }));
  }, []);

  const coletasFiltradas = useMemo(
    () =>
      filtrarColetas(
        coletas,
        filterStatus,
        filterNomeColeta,
        filterCriadoPor,
        filterDataInicio,
        filterDataFim,
        filterCodigo,
        filterDescricao
      ),
    [coletas, filterStatus, filterNomeColeta, filterCriadoPor, filterDataInicio, filterDataFim, filterCodigo, filterDescricao]
  );

  const temAlgumFiltro =
    !!filterStatus ||
    filterNomeColeta.trim() !== '' ||
    filterCriadoPor.trim() !== '' ||
    filterDataInicio !== '' ||
    filterDataFim !== '' ||
    filterCodigo.trim() !== '' ||
    filterDescricao.trim() !== '';

  const limparTodosFiltros = () => {
    setFilterStatus('');
    setFilterNomeColeta('');
    setFilterCriadoPor('');
    setFilterDataInicio('');
    setFilterDataFim('');
    setFilterCodigo('');
    setFilterDescricao('');
  };

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [res, errosRes] = await Promise.all([
        listarColetasPrecos(),
        obterSerieErrosVinculoOperacionalDashboard({
          dataInicio: filterDataInicio || undefined,
          dataFim: filterDataFim || undefined,
        }),
      ]);
      setColetas(Array.isArray(res.data) ? res.data : []);
      if (res.error) setErro(res.error);
      setSerieErrosVinculoOperacional(errosRes.series ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar coletas.');
      setColetas([]);
    } finally {
      setLoading(false);
    }
  }, [filterDataInicio, filterDataFim]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useOnSincronizado(carregar);

  const contagem = agregarPorStatus(coletasFiltradas);
  const total = coletasFiltradas.length;
  const tempoMedioDias = tempoMedioDiasAteFinalizacao(coletasFiltradas);
  const tempoMedioAprovacaoDias = tempoMedioDiasEmAprovacao(coletasFiltradas);
  const tempoMedioPorUsuario = tempoMedioDiasPorUsuario(coletasFiltradas);
  const coletasComFinalizacao = coletasFiltradas.filter((c) => c.dataFinalizacao && c.dataCriacao).length;
  const coletasComAprovacao = coletasFiltradas.filter((c) => c.dataFinalizacao && c.dataEnvioAprovacao).length;
  const maxDiasChart = tempoMedioPorUsuario.length > 0 ? Math.max(...tempoMedioPorUsuario.map((x) => x.dias), 0.1) : 1;
  const BAR_CHART_HEIGHT = 100;
  const BAR_COLORS = ['bg-blue-600', 'bg-emerald-600', 'bg-amber-500', 'bg-violet-500', 'bg-rose-500'];

  const serieMensal = useMemo(() => agregarPorMesCriacao(coletasFiltradas), [coletasFiltradas]);
  const sumRegistros = useMemo(() => coletasFiltradas.reduce((a, c) => a + (c.qtdRegistros ?? 0), 0), [coletasFiltradas]);
  const sumItens = useMemo(() => coletasFiltradas.reduce((a, c) => a + (c.qtdItens ?? 0), 0), [coletasFiltradas]);
  const coletasComPreco = useMemo(() => coletasFiltradas.filter((c) => (c.qtdRegistros ?? 0) > 0).length, [coletasFiltradas]);
  const pctColetasComPreco = total > 0 ? Math.round((coletasComPreco / total) * 1000) / 10 : 0;
  const intensidadePreco = sumItens > 0 ? Math.round((sumRegistros / sumItens) * 100) / 100 : 0;
  const trendNovasColetas = useMemo(() => {
    const fim = Date.now();
    const ult = contarColetasCriadasEntre(coletasFiltradas, fim - 7 * 86400000, fim);
    const prev = contarColetasCriadasEntre(coletasFiltradas, fim - 14 * 86400000, fim - 7 * 86400000);
    if (prev > 0) return Math.round(((ult - prev) / prev) * 100);
    if (ult > 0) return 100;
    return 0;
  }, [coletasFiltradas]);
  const taxaApr = taxaAprovacaoPercent(contagem);
  const emCotacao = contagem['Em cotação'] ?? 0;
  const emAprov = contagem['Em Aprovação'] ?? 0;
  const ativasPipeline = emCotacao + emAprov;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Dashboard Compras - Só Aço</h2>
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
        <div className="grid lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 h-64 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
          <div className="lg:col-span-2 h-64 rounded-xl bg-slate-200 dark:bg-slate-800 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50 tracking-tight">Dashboard Compras - Só Aço</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Indicadores de coletas, preços e fluxo de aprovação</p>
        </div>
        <Link
          to="/compras/coletas-precos"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold shadow-md shadow-primary-600/25 hover:shadow-lg transition-all"
        >
          Ver Coletas de Preços
        </Link>
      </div>

      {erro && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">
          {erro}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-600 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm min-w-[140px]"
            >
              <option value="">Todos</option>
              <option value="Em cotação">Em cotação</option>
              <option value="Em Aprovação">Em Aprovação</option>
              <option value="Rejeitada">Rejeitada</option>
              <option value="Finalizada">Finalizada</option>
              <option value="Enviado para Financeiro">Enviado para Financeiro</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Nome da coleta</label>
            <input
              type="text"
              placeholder="Ex.: 123, RESFRIADO ou A DEFINIR"
              value={filterNomeColeta}
              onChange={(e) => setFilterNomeColeta(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm min-w-[140px]"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Criada por</label>
            <input
              type="text"
              placeholder="Usuário"
              value={filterCriadoPor}
              onChange={(e) => setFilterCriadoPor(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm min-w-[140px]"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Data de criação (de)</label>
            <input
              type="date"
              value={filterDataInicio}
              onChange={(e) => setFilterDataInicio(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Data de criação (até)</label>
            <input
              type="date"
              value={filterDataFim}
              onChange={(e) => setFilterDataFim(e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <MultiSelectWithSearch
            label="Código do Produto"
            placeholder="Todos"
            options={opcoesFiltro.codigos}
            value={filterCodigo}
            onChange={(v) => setFilterCodigo(v.split(',').map((s) => s.trim()).filter(Boolean).join(', '))}
            labelClass="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            inputClass="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent"
            minWidth="180px"
            optionLabel="códigos"
          />
          <MultiSelectWithSearch
            label="Descrição do Produto"
            placeholder="Todas"
            options={opcoesFiltro.descricoes}
            value={filterDescricao}
            onChange={(v) => setFilterDescricao(v.split(',').map((s) => s.trim()).filter(Boolean).join(', '))}
            labelClass="block text-xs text-slate-500 dark:text-slate-400 mb-1"
            inputClass="w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent"
            minWidth="200px"
            optionLabel="descrições"
          />
          {temAlgumFiltro && (
            <button
              type="button"
              onClick={limparTodosFiltros}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-sm font-medium transition shrink-0"
              title="Limpar todos os filtros"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              Limpar filtros
            </button>
          )}
        </div>
        {temAlgumFiltro && (
          <div className="px-4 py-2 text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-800/40">
            Exibindo métricas para <strong className="text-slate-700 dark:text-slate-300">{coletasFiltradas.length}</strong> de{' '}
            <strong className="text-slate-700 dark:text-slate-300">{coletas.length}</strong> coleta{coletas.length !== 1 ? 's' : ''}.
          </div>
        )}
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          accentBar="bg-blue-600"
          iconWrap="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
            </svg>
          }
          value={total}
          title="Coletas no escopo"
          footer={`${sumRegistros.toLocaleString('pt-BR')} registros de preço · ${sumItens.toLocaleString('pt-BR')} itens · média ${intensidadePreco} reg./item`}
        />
        <KPICard
          accentBar="bg-amber-500"
          iconWrap="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
            </svg>
          }
          value={ativasPipeline}
          title="Coletas em andamento"
          footer={`${emCotacao} em cotação · ${emAprov} em aprovação · pipeline ativo`}
          badge={
            trendNovasColetas !== 0 ? (
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                  trendNovasColetas > 0
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200'
                }`}
              >
                {trendNovasColetas > 0 ? '↑' : '↓'} {Math.abs(trendNovasColetas)}% <span className="font-normal opacity-80">7d</span>
              </span>
            ) : (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">estável</span>
            )
          }
        />
        <KPICard
          accentBar="bg-teal-500"
          iconWrap="bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
          value={`${pctColetasComPreco}%`}
          title="Cobertura de preços"
          footer={`${coletasComPreco} de ${total || 0} coleta${total !== 1 ? 's' : ''} com ao menos 1 registro salvo`}
        />
        <KPICard
          accentBar="bg-violet-600"
          iconWrap="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          }
          value={tempoMedioDias != null ? formatarTempoMedio(tempoMedioDias) : '—'}
          title="Tempo médio do ciclo"
          footer={
            tempoMedioDias != null
              ? `Abertura → finalização · ${coletasComFinalizacao} coleta${coletasComFinalizacao !== 1 ? 's' : ''}`
              : 'Finalize coletas para calcular o ciclo completo'
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-stretch">
        <div className="min-w-0 w-full lg:row-span-2 min-h-0">
          <EvolutionPriceChart series={serieMensal} />
        </div>
        <div className="min-w-0">
          <GaugeAprovacao percent={taxaApr} />
        </div>
        <div className="min-w-0 flex flex-col">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm h-full flex flex-col min-h-0">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Tempos do processo</h4>
            <div className="space-y-3 text-sm flex-1">
              <div className="flex justify-between gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
                <span className="text-slate-500 dark:text-slate-400">Em aprovação → finalização</span>
                <span className="font-bold text-primary-600 dark:text-primary-400 tabular-nums">
                  {tempoMedioAprovacaoDias != null ? formatarTempoMedio(tempoMedioAprovacaoDias) : '—'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tempoMedioAprovacaoDias != null
                  ? `Baseado em ${coletasComAprovacao} coleta${coletasComAprovacao !== 1 ? 's' : ''} com envio e fim registrados.`
                  : 'Envie para aprovação e finalize para medir esta etapa.'}
              </p>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex flex-col min-h-0">
          <StatusBarsInteractive contagem={contagem} total={total} />
        </div>
        <div className="min-w-0 flex flex-col min-h-0">
          {tempoMedioPorUsuario.length > 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm h-full flex flex-col min-h-[280px]">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1 shrink-0">Tempo médio por comprador</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 shrink-0">Abertura → finalização (coletas finalizadas). Passe o mouse nas barras.</p>
              <div className="flex flex-1 items-end gap-3 overflow-x-auto pb-1 min-h-0" style={{ minHeight: BAR_CHART_HEIGHT + 44 }}>
                {tempoMedioPorUsuario.map(({ usuario, dias, quantidade }, index) => {
                  const barHeightPx = Math.min(
                    BAR_CHART_HEIGHT,
                    Math.max(6, Math.round((dias / maxDiasChart) * BAR_CHART_HEIGHT))
                  );
                  const barColor = BAR_COLORS[index % BAR_COLORS.length];
                  return (
                    <div key={usuario} className="flex flex-col items-center shrink-0 group" style={{ width: 56 }}>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {formatarTempoMedio(dias)}
                      </span>
                      <div
                        className={`w-9 rounded-t flex-shrink-0 ${barColor} transition-transform duration-200 group-hover:scale-105 origin-bottom cursor-default shadow-sm`}
                        style={{ height: barHeightPx, minHeight: 6 }}
                        title={`${formatarTempoMedio(dias)} · ${quantidade} coleta${quantidade !== 1 ? 's' : ''}`}
                      />
                      <span className="text-[10px] text-slate-600 dark:text-slate-300 font-medium truncate w-full text-center mt-1.5" title={usuario}>
                        {usuario}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/30 p-8 text-center text-sm text-slate-500 dark:text-slate-400 h-full flex flex-col items-center justify-center min-h-[280px]">
              Sem ranking por usuário (nenhuma coleta finalizada no filtro).
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 w-full">
        <EvolutionErroOperacionalChart series={serieErrosVinculoOperacional} />
      </div>

      <section>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Atalhos por status</h3>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/compras/coletas-precos"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm font-medium text-slate-700 dark:text-slate-200 hover:border-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition"
          >
            Todas ({total})
          </Link>
          {STATUS_ORDEM.map((status) => {
            const style = CARD_STYLES[status];
            const count = contagem[status] ?? 0;
            return (
              <Link
                key={status}
                to={`/compras/coletas-precos?status=${encodeURIComponent(status)}`}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition hover:scale-[1.02] ${style.border} ${style.bg} ${style.text}`}
              >
                {status} <span className="tabular-nums opacity-80">({count})</span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
