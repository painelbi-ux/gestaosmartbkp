import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useOnSincronizado } from '../../hooks/useOnSincronizado';
import { listarColetasPrecos, type ColetaPrecosListItem } from '../../api/compras';

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

export default function ComprasDashboardPage() {
  const [coletas, setColetas] = useState<ColetaPrecosListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await listarColetasPrecos();
      setColetas(Array.isArray(res.data) ? res.data : []);
      if (res.error) setErro(res.error);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar coletas.');
      setColetas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useOnSincronizado(carregar);

  const contagem = agregarPorStatus(coletas);
  const total = coletas.length;
  const tempoMedioDias = tempoMedioDiasAteFinalizacao(coletas);
  const tempoMedioAprovacaoDias = tempoMedioDiasEmAprovacao(coletas);
  const tempoMedioPorUsuario = tempoMedioDiasPorUsuario(coletas);
  const coletasComFinalizacao = coletas.filter((c) => c.dataFinalizacao && c.dataCriacao).length;
  const coletasComAprovacao = coletas.filter((c) => c.dataFinalizacao && c.dataEnvioAprovacao).length;
  const maxDiasChart = tempoMedioPorUsuario.length > 0 ? Math.max(...tempoMedioPorUsuario.map((x) => x.dias), 0.1) : 1;
  const BAR_CHART_HEIGHT = 100;
  const BAR_COLORS = ['bg-blue-600', 'bg-emerald-600', 'bg-amber-500', 'bg-violet-500', 'bg-rose-500'];

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Dashboard Compras - Só Aço</h2>
        <section>
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-4">Quantidade de Coletas por Status</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-slate-200 dark:bg-slate-800 rounded-xl p-5 animate-pulse">
                <div className="h-4 bg-slate-300 dark:bg-slate-700 rounded w-3/4 mb-3" />
                <div className="h-8 bg-slate-300 dark:bg-slate-700 rounded w-1/2" />
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Dashboard Compras - Só Aço</h2>
        <Link
          to="/compras/coletas-precos"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition"
        >
          Ver Coletas de Preços
        </Link>
      </div>

      {erro && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">
          {erro}
        </div>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-4">Tempo médio em cotação</h3>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 p-5 shadow-sm">
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
              Abertura → Finalização
            </p>
            <p className="text-2xl font-bold text-primary-600 dark:text-primary-400 mt-1">
              {tempoMedioDias != null ? formatarTempoMedio(tempoMedioDias) : '—'}
            </p>
            {tempoMedioDias != null && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Baseado em {coletasComFinalizacao} coleta{coletasComFinalizacao !== 1 ? 's' : ''} finalizada{coletasComFinalizacao !== 1 ? 's' : ''}
              </p>
            )}
            {tempoMedioDias == null && coletas.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Finalize coletas para ver o tempo médio
              </p>
            )}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-4">Tempo médio em aprovação</h3>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 p-5 shadow-sm">
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
              Envio para aprovação → Finalização
            </p>
            <p className="text-2xl font-bold text-primary-600 dark:text-primary-400 mt-1">
              {tempoMedioAprovacaoDias != null ? formatarTempoMedio(tempoMedioAprovacaoDias) : '—'}
            </p>
            {tempoMedioAprovacaoDias != null && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Baseado em {coletasComAprovacao} coleta{coletasComAprovacao !== 1 ? 's' : ''} finalizada{coletasComAprovacao !== 1 ? 's' : ''}
              </p>
            )}
            {tempoMedioAprovacaoDias == null && coletas.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Finalize coletas (após enviar para aprovação) para ver o tempo médio
              </p>
            )}
          </div>
        </div>
      </section>

      {tempoMedioPorUsuario.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">Tempo médio de coleta por usuário</h3>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 p-3 shadow-sm max-w-2xl">
            <p className="text-slate-500 dark:text-slate-400 text-xs font-medium mb-2">
              Abertura → Finalização (apenas coletas finalizadas)
            </p>
            <div
              className="flex items-end gap-3"
              style={{ height: BAR_CHART_HEIGHT + 44 }}
            >
              {tempoMedioPorUsuario.map(({ usuario, dias, quantidade }, index) => {
                const barHeightPx = Math.min(
                  BAR_CHART_HEIGHT,
                  Math.max(6, Math.round((dias / maxDiasChart) * BAR_CHART_HEIGHT))
                );
                const barColor = BAR_COLORS[index % BAR_COLORS.length];
                return (
                  <div key={usuario} className="flex flex-col items-center shrink-0" style={{ width: 52 }}>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums mb-1">
                      {formatarTempoMedio(dias)}
                    </span>
                    <div
                      className={`w-8 rounded-t flex-shrink-0 ${barColor} border-0`}
                      style={{ height: barHeightPx, minHeight: 6 }}
                      title={`${formatarTempoMedio(dias)} (${quantidade} coleta${quantidade !== 1 ? 's' : ''})`}
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-300 font-medium truncate w-full text-center mt-1.5" title={usuario}>
                      {usuario}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-4">Quantidade de Coletas por Status</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <Link
            to="/compras/coletas-precos"
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 p-5 shadow-sm hover:shadow-md transition text-left"
          >
            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Total</p>
            <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 mt-1">{total}</p>
          </Link>
          {STATUS_ORDEM.map((status) => {
            const style = CARD_STYLES[status] ?? CARD_STYLES['Enviado para Financeiro'];
            const count = contagem[status] ?? 0;
            return (
              <Link
                key={status}
                to={`/compras/coletas-precos?status=${encodeURIComponent(status)}`}
                className={`rounded-xl border ${style.border} ${style.bg} p-5 shadow-sm hover:shadow-md transition text-left`}
              >
                <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">{status}</p>
                <p className={`text-2xl font-bold mt-1 ${style.text}`}>{count}</p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
