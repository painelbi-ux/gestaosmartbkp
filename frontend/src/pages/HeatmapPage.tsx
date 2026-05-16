import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import CardsResumoFinanceiro from '../components/CardsResumoFinanceiro';
import GaugeIndicador from '../components/GaugeIndicador';
import MapaMunicipios, { mapaMunicipioChave } from '../components/MapaMunicipios';
import FiltroPedidos, { defaultFiltros, type FiltrosPedidosState } from '../components/FiltroPedidos';
import {
  obterResumoFinanceiro,
  obterResumoStatusPorTipoF,
  type ResumoFinanceiro,
  type ResumoStatusPorTipoF,
  type FiltrosPedidos,
  type MapaMunicipioItem,
} from '../api/pedidos';
import { loadFiltrosHeatmap, saveFiltrosHeatmap } from '../utils/persistFiltros';
import HeatmapRoteirizadorPanel from '../components/HeatmapRoteirizadorPanel';
import {
  obterMatrizDistanciasKm,
  PONTO_RETORNO_TERESINA,
  resolverRoteiroDeposito,
  type RoteiroCoord,
  type RoteiroResultado,
} from '../utils/heatmapRoteirizador';

const HEATMAP_MAP_HEIGHT_STORAGE_KEY = 'heatmap_map_pane_height_px';
const HEATMAP_MAP_HEIGHT_MIN = 220;
const HEATMAP_MAP_HEIGHT_MAX_CAP = 2400;

function readStoredMapPaneHeight(): number | null {
  try {
    const raw = localStorage.getItem(HEATMAP_MAP_HEIGHT_STORAGE_KEY);
    if (raw == null || raw === '') return null;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return null;
    return Math.min(HEATMAP_MAP_HEIGHT_MAX_CAP, Math.max(HEATMAP_MAP_HEIGHT_MIN, n));
  } catch {
    return null;
  }
}

function clampMapPaneHeight(px: number): number {
  const max = Math.min(
    HEATMAP_MAP_HEIGHT_MAX_CAP,
    typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.94) : HEATMAP_MAP_HEIGHT_MAX_CAP
  );
  return Math.min(max, Math.max(HEATMAP_MAP_HEIGHT_MIN, Math.round(px)));
}

export default function HeatmapPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapColumnRef = useRef<HTMLDivElement>(null);
  const mapResizeDragRef = useRef<{ startY: number; baseH: number } | null>(null);
  const [filtros, setFiltros] = useState<FiltrosPedidosState>(() =>
    loadFiltrosHeatmap(defaultFiltros) as FiltrosPedidosState
  );
  const [resumoFinanceiro, setResumoFinanceiro] = useState<ResumoFinanceiro | null>(null);
  const [loading, setLoading] = useState(true);
  const [resumoStatusTipoF, setResumoStatusTipoF] = useState<ResumoStatusPorTipoF | null>(null);
  const [loadingStatusTipoF, setLoadingStatusTipoF] = useState(true);
  const [mostrarFiltros, setMostrarFiltros] = useState(true);
  const [mostrarCards, setMostrarCards] = useState(true);
  const [telaCheia, setTelaCheia] = useState(false);
  /** Altura explícita (px) do bloco do mapa; `null` = preencher o espaço disponível (flex). */
  const [mapPaneHeightPx, setMapPaneHeightPx] = useState<number | null>(readStoredMapPaneHeight);
  const [modoRoteirizador, setModoRoteirizador] = useState(false);
  const [roteirizadorChaves, setRoteirizadorChaves] = useState<Set<string>>(() => new Set());
  const [mapaItens, setMapaItens] = useState<MapaMunicipioItem[]>([]);
  const [roteiroResultado, setRoteiroResultado] = useState<RoteiroResultado | null>(null);
  const [roteiroLoading, setRoteiroLoading] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await obterResumoFinanceiro(filtros as FiltrosPedidos);
      setResumoFinanceiro(r);
    } catch {
      setResumoFinanceiro(null);
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  const carregarStatusTipoF = useCallback(async () => {
    setLoadingStatusTipoF(true);
    try {
      const r = await obterResumoStatusPorTipoF(filtros as FiltrosPedidos);
      setResumoStatusTipoF(r);
    } catch {
      setResumoStatusTipoF(null);
    } finally {
      setLoadingStatusTipoF(false);
    }
  }, [filtros]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    carregarStatusTipoF();
  }, [carregarStatusTipoF]);

  useEffect(() => {
    saveFiltrosHeatmap(filtros);
  }, [filtros]);

  const aplicarFiltros = useCallback(() => {
    carregar();
    carregarStatusTipoF();
  }, [carregar, carregarStatusTipoF]);

  const limparFiltros = useCallback(() => {
    setFiltros(defaultFiltros);
    saveFiltrosHeatmap(defaultFiltros);
  }, []);

  const onMapaItensCarregados = useCallback((itens: MapaMunicipioItem[]) => {
    setMapaItens(itens);
  }, []);

  const alternarModoRoteirizador = useCallback(() => {
    setModoRoteirizador((ativo) => {
      if (ativo) {
        setRoteirizadorChaves(new Set());
        setRoteiroResultado(null);
        return false;
      }
      return true;
    });
  }, []);

  const alternarTelaCheia = useCallback(async () => {
    const el = rootRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* navegador pode negar fullscreen */
    }
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      setTelaCheia(document.fullscreenElement === rootRef.current);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const MAX_CIDADES_ROTEIRO = 22;

  useEffect(() => {
    if (!modoRoteirizador) return;
    setRoteirizadorChaves((prev) => {
      const valid = new Set(mapaItens.map((it, i) => mapaMunicipioChave(it, i)));
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (valid.has(k)) next.add(k);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [mapaItens, modoRoteirizador]);

  const selecionadosOrdenados = useMemo(() => {
    const list = mapaItens.filter((it, i) => roteirizadorChaves.has(mapaMunicipioChave(it, i)));
    return [...list].sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR'));
  }, [mapaItens, roteirizadorChaves]);

  const coordsRoteiro = useMemo((): RoteiroCoord[] | null => {
    if (selecionadosOrdenados.length === 0) return null;
    return [
      {
        lat: PONTO_RETORNO_TERESINA.lat,
        lng: PONTO_RETORNO_TERESINA.lng,
        label: PONTO_RETORNO_TERESINA.label,
      },
      ...selecionadosOrdenados.map((c) => ({
        lat: c.lat,
        lng: c.lng,
        label: `${c.municipio}${c.uf ? `, ${c.uf}` : ''}`,
      })),
    ];
  }, [selecionadosOrdenados]);

  useEffect(() => {
    if (!coordsRoteiro || coordsRoteiro.length < 2) {
      setRoteiroResultado(null);
      setRoteiroLoading(false);
      return;
    }
    const ac = new AbortController();
    const tid = window.setTimeout(() => {
      void (async () => {
        setRoteiroLoading(true);
        try {
          const { matrixKm, usouOsrm } = await obterMatrizDistanciasKm(coordsRoteiro, ac.signal);
          if (ac.signal.aborted) return;
          const r = resolverRoteiroDeposito(coordsRoteiro, matrixKm, usouOsrm);
          setRoteiroResultado(r);
        } catch {
          if (!ac.signal.aborted) setRoteiroResultado(null);
        } finally {
          if (!ac.signal.aborted) setRoteiroLoading(false);
        }
      })();
    }, 400);
    return () => {
      ac.abort();
      window.clearTimeout(tid);
    };
  }, [coordsRoteiro]);

  const rotaPolyline = useMemo((): [number, number][] | undefined => {
    if (!roteiroResultado || !coordsRoteiro || coordsRoteiro.length < 2) return undefined;
    const idxs = [0, ...roteiroResultado.ordemIndices, 0];
    return idxs.map((i) => [coordsRoteiro[i]!.lat, coordsRoteiro[i]!.lng] as [number, number]);
  }, [roteiroResultado, coordsRoteiro]);

  const toggleRoteirizadorChave = useCallback((chave: string) => {
    setRoteirizadorChaves((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else if (next.size >= MAX_CIDADES_ROTEIRO) return prev;
      else next.add(chave);
      return next;
    });
  }, []);

  const limparRoteiro = useCallback(() => {
    setRoteirizadorChaves(new Set());
    setRoteiroResultado(null);
  }, []);

  const layoutToken = `${mostrarFiltros}-${mostrarCards}-${telaCheia}|mapH:${mapPaneHeightPx ?? 'auto'}|rot:${modoRoteirizador ? roteirizadorChaves.size : 0}:${roteiroResultado?.totalKm ?? 0}`;
  const rootClass = telaCheia
    ? 'h-screen box-border overflow-hidden bg-slate-50 dark:bg-slate-900 p-4 flex flex-col gap-4'
    : 'flex min-h-0 w-full flex-1 flex-col gap-6';
  /** Piso de altura para mapa + medidores: com filtros e KPIs no topo, o flex-1 sozinho deixava o mapa espremido. */
  const areaPrincipalMinH = telaCheia
    ? ''
    : mostrarFiltros && mostrarCards
      ? 'min-h-[min(720px,58svh)]'
      : mostrarFiltros || mostrarCards
        ? 'min-h-[min(640px,52svh)]'
        : 'min-h-[min(560px,48svh)]';
  const areaPrincipalClass = telaCheia
    ? `flex-1 min-h-0 flex flex-col items-stretch gap-6 ${mostrarCards ? 'xl:flex-row' : ''}`
    : `flex min-h-0 flex-1 basis-0 flex-col gap-6 ${mostrarCards ? 'lg:flex-row' : ''} ${areaPrincipalMinH}`.trim();
  const mapaWrapperClass = mostrarCards
    ? telaCheia
      ? 'min-h-0 h-full'
      : 'flex min-h-0 flex-1 flex-col'
    : telaCheia
      ? 'h-full min-h-0'
      : 'flex min-h-0 flex-1 flex-col';

  return (
    <div
      ref={rootRef}
      className={rootClass}
    >
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Heatmap</h2>
        <button
          type="button"
          onClick={() => setMostrarFiltros((v) => !v)}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
          title={mostrarFiltros ? 'Ocultar filtros' : 'Exibir filtros'}
          aria-label={mostrarFiltros ? 'Ocultar filtros' : 'Exibir filtros'}
          aria-pressed={mostrarFiltros}
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
        <button
          type="button"
          onClick={() => setMostrarCards((v) => !v)}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
          title={mostrarCards ? 'Ocultar cards e indicadores' : 'Exibir cards e indicadores'}
          aria-label={mostrarCards ? 'Ocultar cards e indicadores' : 'Exibir cards e indicadores'}
          aria-pressed={mostrarCards}
        >
          {mostrarCards ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="7" height="18" rx="1" />
              <rect x="12" y="3" width="9" height="5" rx="1" />
              <rect x="12" y="10" width="9" height="4" rx="1" />
              <rect x="12" y="16" width="9" height="5" rx="1" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="3" width="7" height="18" rx="1" />
              <rect x="12" y="3" width="9" height="5" rx="1" />
              <rect x="12" y="10" width="9" height="4" rx="1" />
              <rect x="12" y="16" width="9" height="5" rx="1" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={alternarTelaCheia}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
          title={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
          aria-label={telaCheia ? 'Sair da tela cheia' : 'Visualizar em tela cheia'}
          aria-pressed={telaCheia}
        >
          {telaCheia ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={alternarModoRoteirizador}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
            modoRoteirizador
              ? 'border-primary-600 bg-primary-600 text-white hover:bg-primary-700'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'
          }`}
          title={modoRoteirizador ? 'Desligar roteirizador' : 'Planejar rota: selecionar cidades no mapa'}
          aria-pressed={modoRoteirizador}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM13 13h2v2h-2zM17 13h2v2h-2zM13 17h2v2h-2zM17 17h2v2h-2z" />
          </svg>
          Roteirizador
        </button>
      </div>
      {mostrarFiltros && (
        <div className="shrink-0">
          <FiltroPedidos
            filtros={filtros}
            onChange={setFiltros}
            onAplicar={aplicarFiltros}
            onLimpar={limparFiltros}
          />
        </div>
      )}
      {mostrarCards && (
        <div className="shrink-0">
          <CardsResumoFinanceiro resumo={resumoFinanceiro} loading={loading} />
        </div>
      )}
      <div className={areaPrincipalClass}>
        {mostrarCards && (
          <div className={`flex flex-col gap-4 w-full ${telaCheia ? 'xl:w-[280px]' : 'lg:w-[280px]'} shrink-0`}>
            <GaugeIndicador
              title="Retirada"
              value={resumoStatusTipoF?.retirada.percentual ?? 0}
              loading={loadingStatusTipoF}
            />
            <GaugeIndicador
              title="Entrega Grande Teresina"
              value={resumoStatusTipoF?.entregaGrandeTeresina.percentual ?? 0}
              loading={loadingStatusTipoF}
            />
            <GaugeIndicador
              title="Carradas"
              value={resumoStatusTipoF?.carradas.percentual ?? 0}
              loading={loadingStatusTipoF}
            />
          </div>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          {modoRoteirizador && (
            <HeatmapRoteirizadorPanel
              loading={roteiroLoading}
              resultado={roteiroResultado}
              selecionados={selecionadosOrdenados}
              onRemover={toggleRoteirizadorChave}
              onLimpar={limparRoteiro}
            />
          )}
        <div
          ref={mapColumnRef}
          className={`flex flex-col rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 ${mapaWrapperClass} ${
            mapPaneHeightPx != null && mostrarCards ? (telaCheia ? 'xl:self-start' : 'lg:self-start') : ''
          }`}
        >
          <div
            className={`min-h-0 flex flex-col overflow-hidden ${mapPaneHeightPx != null ? 'shrink-0' : 'flex-1'}`}
            style={
              mapPaneHeightPx != null
                ? { height: mapPaneHeightPx, minHeight: HEATMAP_MAP_HEIGHT_MIN }
                : undefined
            }
          >
            <MapaMunicipios
              filtros={filtros as FiltrosPedidos}
              layoutToken={layoutToken}
              onItensCarregados={onMapaItensCarregados}
              roteirizadorAtivo={modoRoteirizador}
              roteirizadorChaves={roteirizadorChaves}
              onRoteirizadorToggleChave={toggleRoteirizadorChave}
              rotaPolyline={modoRoteirizador ? rotaPolyline : undefined}
            />
          </div>
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Redimensionar área do mapa"
            title="Arraste para ajustar a altura do mapa. Duplo clique para voltar ao tamanho automático."
            className="group flex h-3 shrink-0 cursor-ns-resize touch-none select-none items-center justify-center border-t border-slate-200 bg-slate-100 hover:bg-slate-200/90 dark:border-slate-600 dark:bg-slate-800/90 dark:hover:bg-slate-700/90"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              const col = mapColumnRef.current;
              if (!col) return;
              const inner = col.firstElementChild as HTMLElement | null;
              const measured = inner
                ? Math.round(inner.getBoundingClientRect().height)
                : Math.round(col.getBoundingClientRect().height - 12);
              const baseH = clampMapPaneHeight(mapPaneHeightPx ?? measured);
              setMapPaneHeightPx(baseH);
              mapResizeDragRef.current = { startY: e.clientY, baseH };
              (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = mapResizeDragRef.current;
              if (!d) return;
              const next = clampMapPaneHeight(d.baseH + (e.clientY - d.startY));
              setMapPaneHeightPx(next);
            }}
            onPointerUp={(e) => {
              mapResizeDragRef.current = null;
              try {
                (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
              } catch {
                /* já liberado */
              }
              setMapPaneHeightPx((h) => {
                if (h != null) {
                  try {
                    localStorage.setItem(HEATMAP_MAP_HEIGHT_STORAGE_KEY, String(h));
                  } catch {
                    /* quota / modo privado */
                  }
                }
                return h;
              });
            }}
            onPointerCancel={(e) => {
              mapResizeDragRef.current = null;
              try {
                (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
              } catch {
                /* */
              }
            }}
            onDoubleClick={(e) => {
              e.preventDefault();
              mapResizeDragRef.current = null;
              setMapPaneHeightPx(null);
              try {
                localStorage.removeItem(HEATMAP_MAP_HEIGHT_STORAGE_KEY);
              } catch {
                /* */
              }
            }}
          >
            <span
              className="pointer-events-none h-1 w-14 rounded-full bg-slate-400/90 group-hover:bg-primary-500 dark:bg-slate-500 group-hover:dark:bg-primary-400"
              aria-hidden
            />
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
