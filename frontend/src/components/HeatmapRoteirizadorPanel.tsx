import type { MapaMunicipioItem } from '../api/pedidos';
import type { RoteiroResultado } from '../utils/heatmapRoteirizador';

function fmtKm(km: number): string {
  return `${km.toFixed(1)} km`;
}

function fmtH(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm > 0 ? `${hh} h ${mm} min` : `${hh} h`;
}

const nivelBadge: Record<RoteiroResultado['insight']['nivel'], string> = {
  ok: 'bg-emerald-600/90 text-white',
  atencao: 'bg-amber-500/95 text-slate-900',
  pesado: 'bg-red-600/90 text-white',
};

const nivelLabel: Record<RoteiroResultado['insight']['nivel'], string> = {
  ok: 'Viável',
  atencao: 'Atenção',
  pesado: 'Pesado',
};

export default function HeatmapRoteirizadorPanel({
  loading,
  resultado,
  selecionados,
  onRemover,
  onLimpar,
}: {
  loading: boolean;
  resultado: RoteiroResultado | null;
  selecionados: MapaMunicipioItem[];
  onRemover: (chave: string) => void;
  onLimpar: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm dark:border-slate-600 dark:bg-slate-800/95">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-600">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Roteirizador</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Clique nas bolhas no mapa para incluir ou remover cidades (até 22). A rota parte de Teresina, visita todas na melhor ordem
            encontrada (vizinho mais próximo + 2-opt) e retorna a Teresina.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            disabled={selecionados.length === 0}
            onClick={onLimpar}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-500 dark:text-slate-300 dark:hover:bg-slate-700/50"
          >
            Limpar
          </button>
        </div>
      </div>

      {selecionados.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {selecionados.map((c) => (
            <button
              key={c.chave}
              type="button"
              onClick={() => onRemover(c.chave)}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary-300 bg-primary-50 px-2 py-0.5 text-xs text-primary-900 hover:bg-primary-100 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-100 dark:hover:bg-primary-900/60"
              title="Clique para remover"
            >
              <span className="truncate">
                {c.municipio}
                {c.uf ? `/${c.uf}` : ''}
              </span>
              <span aria-hidden className="text-primary-600 dark:text-primary-300">
                ×
              </span>
            </button>
          ))}
        </div>
      )}

      {loading && <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">Calculando rota…</p>}

      {!loading && selecionados.length === 0 && (
        <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma cidade selecionada.</p>
      )}

      {!loading && selecionados.length === 1 && (
        <p className="mt-4 text-sm text-amber-800 dark:text-amber-200">
          Selecione ao menos <strong>duas</strong> cidades para formar uma rota entre paradas (ida e volta a Teresina com uma parada
          intermediária já é útil para estimar perna).
        </p>
      )}

      {!loading && resultado && selecionados.length >= 2 && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${nivelBadge[resultado.insight.nivel]}`}>
              {nivelLabel[resultado.insight.nivel]}
            </span>
            <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{resultado.insight.titulo}</span>
          </div>
          <ul className="list-inside list-disc space-y-1 text-xs text-slate-600 dark:text-slate-300">
            {resultado.insight.linhas.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Total (estrada)</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-100">{fmtKm(resultado.totalKm)}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Tempo (~50 km/h)</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-100">{fmtH(resultado.horasEstimadas)}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Média km/parada</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-100">{fmtKm(resultado.insight.kmPorParada)}</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Rota / linha reta</dt>
              <dd className="font-semibold text-slate-800 dark:text-slate-100">{resultado.insight.fatorVsLinhaReta.toFixed(2)}×</dd>
            </div>
          </dl>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Sequência</h4>
            <ol className="mt-2 space-y-1.5 text-sm text-slate-800 dark:text-slate-100">
              {resultado.pernas.map((p, idx) => (
                <li key={idx} className="flex flex-wrap gap-x-2 border-l-2 border-primary-400 pl-2 dark:border-primary-500">
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{idx + 1}.</span>
                  <span>
                    {p.de} → {p.para}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">({fmtKm(p.distanciaKm)})</span>
                </li>
              ))}
              <li className="flex flex-wrap gap-x-2 border-l-2 border-emerald-500 pl-2 dark:border-emerald-400">
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{resultado.pernas.length + 1}.</span>
                <span>Retorno à base (Teresina)</span>
                <span className="text-slate-500 dark:text-slate-400">({fmtKm(resultado.retornoKm)})</span>
              </li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
