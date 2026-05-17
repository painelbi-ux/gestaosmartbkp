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
  type TooltipDetalheRow,
} from '../api/pedidos';
import { loadFiltrosHeatmap, saveFiltrosHeatmap } from '../utils/persistFiltros';
import HeatmapRoteirizadorPanel from '../components/HeatmapRoteirizadorPanel';
import HeatmapRoteiroWizardModal, { type RoteiroWizardStep } from '../components/HeatmapRoteiroWizardModal';
import HeatmapAjusteCargaModal from '../components/HeatmapAjusteCargaModal';
import {
  limparExclusoesMunicipio,
  limparAjustesQtdeMunicipio,
} from '../utils/heatmapRoteiroSimulacao';
import { isTeresinaMapaItem } from '../utils/heatmapTeresinaBase';
import RoteiroPdfMapaCaptura from '../components/RoteiroPdfMapaCaptura';
import { gerarPdfRoteiroHeatmap } from '../utils/exportHeatmapRoteiroPdf';
import {
  obterMatrizDistanciasKm,
  enriquecerRotaComGeometriaOsrm,
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
  const [roteirizadorChaves, setRoteirizadorChaves] = useState<Set<string>>(() => new Set());
  const [mapaItens, setMapaItens] = useState<MapaMunicipioItem[]>([]);
  const [roteiroResultado, setRoteiroResultado] = useState<RoteiroResultado | null>(null);
  const [roteiroLoading, setRoteiroLoading] = useState(false);
  const [roteiroPopoverAberto, setRoteiroPopoverAberto] = useState(false);
  const [roteiroWizard, setRoteiroWizard] = useState<RoteiroWizardStep | null>(null);
  /** Fluxo alternativo ativo (Ctrl manual ou filtros já aplicados). */
  const [roteiroModo, setRoteiroModo] = useState<'ctrl' | 'filtros' | null>(null);
  const roteiroAbortRef = useRef<AbortController | null>(null);
  const [pdfExportando, setPdfExportando] = useState(false);
  const [exclusoesSimulacao, setExclusoesSimulacao] = useState<Set<string>>(() => new Set());
  const [ajustesQtdeSimulacao, setAjustesQtdeSimulacao] = useState<Map<string, number>>(() => new Map());
  const [ajusteCargaChave, setAjusteCargaChave] = useState<string | null>(null);
  const [detalhesCompletos, setDetalhesCompletos] = useState<Map<string, TooltipDetalheRow[]>>(
    () => new Map()
  );
  const [pdfCaptura, setPdfCaptura] = useState<{
    key: number;
    polyline: [number, number][];
    paradas: { lat: number; lng: number; seq: number }[];
    resultado: RoteiroResultado;
    selecionados: { item: MapaMunicipioItem; chave: string }[];
    exclusoesSimulacao: Set<string>;
    ajustesQtdeSimulacao: Map<string, number>;
  } | null>(null);

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
    setExclusoesSimulacao(new Set());
    setAjustesQtdeSimulacao(new Map());
    setDetalhesCompletos(new Map());
    setAjusteCargaChave(null);
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
  }, [mapaItens]);

  const chaveTeresinaMapa = useMemo(() => {
    for (let i = 0; i < mapaItens.length; i++) {
      const it = mapaItens[i]!;
      if (isTeresinaMapaItem(it)) return mapaMunicipioChave(it, i);
    }
    return undefined;
  }, [mapaItens]);

  const selecionadosComChave = useMemo(() => {
    const out: { item: MapaMunicipioItem; chave: string }[] = [];
    mapaItens.forEach((it, i) => {
      if (isTeresinaMapaItem(it)) return;
      const chave = mapaMunicipioChave(it, i);
      if (roteirizadorChaves.has(chave)) out.push({ item: it, chave });
    });
    return out.sort((a, b) => a.item.chave.localeCompare(b.item.chave, 'pt-BR'));
  }, [mapaItens, roteirizadorChaves]);

  const selecionadosEnriquecidos = useMemo(
    () =>
      selecionadosComChave.map(({ item, chave }) => ({
        chave,
        item: {
          ...item,
          detalhes: detalhesCompletos.get(chave) ?? item.detalhes,
        },
      })),
    [selecionadosComChave, detalhesCompletos]
  );

  useEffect(() => {
    setExclusoesSimulacao((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const k of prev) {
        const muni = k.split('::')[0] ?? '';
        if (roteirizadorChaves.has(muni)) next.add(k);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [roteirizadorChaves]);

  const onDetalhesCarregados = useCallback((chave: string, detalhes: TooltipDetalheRow[]) => {
    setDetalhesCompletos((prev) => {
      const next = new Map(prev);
      next.set(chave, detalhes);
      return next;
    });
  }, []);

  const toggleExclusaoLinha = useCallback((exKey: string) => {
    setExclusoesSimulacao((prev) => {
      const next = new Set(prev);
      if (next.has(exKey)) next.delete(exKey);
      else next.add(exKey);
      return next;
    });
  }, []);

  const definirInclusaoLinhasSimulacao = useCallback((exKeys: string[], incluir: boolean) => {
    setExclusoesSimulacao((prev) => {
      const next = new Set(prev);
      for (const k of exKeys) {
        if (incluir) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }, []);

  const ajustarQtdeItemSimulacao = useCallback((exKey: string, qtde: number) => {
    setAjustesQtdeSimulacao((prev) => {
      const next = new Map(prev);
      if (!Number.isFinite(qtde) || qtde < 0) {
        next.delete(exKey);
        return next;
      }
      next.set(exKey, qtde);
      return next;
    });
  }, []);

  const restaurarCidadeSimulacao = useCallback((municipioChave: string) => {
    setExclusoesSimulacao((prev) => limparExclusoesMunicipio(prev, municipioChave));
    setAjustesQtdeSimulacao((prev) => limparAjustesQtdeMunicipio(prev, municipioChave));
  }, []);

  const restaurarSimulacaoToda = useCallback(() => {
    setExclusoesSimulacao(new Set());
    setAjustesQtdeSimulacao(new Map());
  }, []);

  const selecionadosOrdenados = useMemo(
    () => selecionadosComChave.map((x) => x.item),
    [selecionadosComChave]
  );

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
    setRoteiroResultado(null);
    roteiroAbortRef.current?.abort();
    roteiroAbortRef.current = null;
  }, [roteirizadorChaves]);

  useEffect(() => {
    return () => {
      roteiroAbortRef.current?.abort();
    };
  }, []);

  const rotaPolyline = useMemo((): [number, number][] | undefined => {
    if (!roteiroResultado || !coordsRoteiro || coordsRoteiro.length < 2) return undefined;
    if (roteiroResultado.mapaPolyline && roteiroResultado.mapaPolyline.length >= 2) {
      return roteiroResultado.mapaPolyline;
    }
    const idxs = [0, ...roteiroResultado.ordemIndices, 0];
    return idxs.map((i) => [coordsRoteiro[i]!.lat, coordsRoteiro[i]!.lng] as [number, number]);
  }, [roteiroResultado, coordsRoteiro]);

  /** Paradas numeradas só para o mapa do PDF (sem outras cidades). */
  const paradasPdfMapa = useMemo(() => {
    if (!roteiroResultado || !coordsRoteiro) return [];
    return roteiroResultado.ordemIndices
      .map((coordIdx, pos) => {
        const c = coordsRoteiro[coordIdx];
        if (!c) return null;
        return { lat: c.lat, lng: c.lng, seq: pos + 1 };
      })
      .filter((x): x is { lat: number; lng: number; seq: number } => x != null);
  }, [roteiroResultado, coordsRoteiro]);

  const paradasRoteiroMapa = useMemo(
    () => paradasPdfMapa.map((p) => ({ lat: p.lat, lng: p.lng })),
    [paradasPdfMapa]
  );

  const iniciarExportPdfRoteiro = useCallback(() => {
    if (!roteiroResultado || !rotaPolyline || rotaPolyline.length < 2 || pdfExportando) return;
    setPdfExportando(true);
    setPdfCaptura({
      key: Date.now(),
      polyline: rotaPolyline,
      paradas: paradasPdfMapa,
      resultado: roteiroResultado,
      selecionados: selecionadosEnriquecidos,
      exclusoesSimulacao: new Set(exclusoesSimulacao),
      ajustesQtdeSimulacao: new Map(ajustesQtdeSimulacao),
    });
  }, [
    roteiroResultado,
    rotaPolyline,
    paradasPdfMapa,
    selecionadosEnriquecidos,
    exclusoesSimulacao,
    ajustesQtdeSimulacao,
    pdfExportando,
  ]);

  /** Ordem de visita (1-based) por chave do município no mapa, após «Roteirizar». */
  const paradaSequenciaPorChave = useMemo(() => {
    if (!roteiroResultado || selecionadosComChave.length === 0) return undefined;
    const coordIdxPorChave = new Map<number, string>();
    selecionadosComChave.forEach((row, i) => {
      coordIdxPorChave.set(i + 1, row.chave);
    });
    const out = new Map<string, number>();
    roteiroResultado.ordemIndices.forEach((coordIdx, pos) => {
      const chave = coordIdxPorChave.get(coordIdx);
      if (chave) out.set(chave, pos + 1);
    });
    return out;
  }, [roteiroResultado, selecionadosComChave]);

  const toggleRoteirizadorChave = useCallback(
    (chave: string) => {
      if (chaveTeresinaMapa && chave === chaveTeresinaMapa) return;
      setRoteirizadorChaves((prev) => {
        const next = new Set(prev);
        if (next.has(chave)) next.delete(chave);
        else if (next.size >= MAX_CIDADES_ROTEIRO) return prev;
        else next.add(chave);
        return next;
      });
    },
    [chaveTeresinaMapa]
  );

  const itensMapaRoteiro = useMemo(() => {
    const out: { item: MapaMunicipioItem; chave: string }[] = [];
    mapaItens.forEach((it, i) => {
      if (isTeresinaMapaItem(it)) return;
      out.push({ item: it, chave: mapaMunicipioChave(it, i) });
    });
    return out;
  }, [mapaItens]);

  const cancelarRoteirizacao = useCallback(() => {
    roteiroAbortRef.current?.abort();
    roteiroAbortRef.current = null;
    setRoteiroLoading(false);
    setRoteiroWizard(null);
    setRoteiroModo(null);
    setRoteiroPopoverAberto(false);
    setRoteirizadorChaves(new Set());
    setRoteiroResultado(null);
    setExclusoesSimulacao(new Set());
    setAjustesQtdeSimulacao(new Map());
    setAjusteCargaChave(null);
  }, []);

  const limparRoteiro = useCallback(() => {
    roteiroAbortRef.current?.abort();
    roteiroAbortRef.current = null;
    setRoteiroLoading(false);
    setRoteiroWizard(null);
    setRoteiroModo(null);
    setRoteirizadorChaves(new Set());
    setRoteiroResultado(null);
    setExclusoesSimulacao(new Set());
    setAjustesQtdeSimulacao(new Map());
    setAjusteCargaChave(null);
  }, []);

  const executarRoteirizacao = useCallback(async () => {
    roteiroAbortRef.current?.abort();
    const ac = new AbortController();
    roteiroAbortRef.current = ac;

    setRoteiroPopoverAberto(true);
    if (!coordsRoteiro || coordsRoteiro.length < 2) {
      setRoteiroResultado(null);
      setRoteiroLoading(false);
      return;
    }
    setRoteiroLoading(true);
    setRoteiroResultado(null);
    try {
      const { matrixKm, usouOsrm, perfilOsrm } = await obterMatrizDistanciasKm(coordsRoteiro, ac.signal);
      if (ac.signal.aborted) return;
      const r = resolverRoteiroDeposito(coordsRoteiro, matrixKm, usouOsrm, perfilOsrm);
      if (ac.signal.aborted) return;
      if (!r) {
        setRoteiroResultado(null);
        return;
      }
      const comGeo = await enriquecerRotaComGeometriaOsrm(coordsRoteiro, r, ac.signal);
      if (!ac.signal.aborted) setRoteiroResultado(comGeo);
    } catch {
      if (!ac.signal.aborted) setRoteiroResultado(null);
    } finally {
      if (roteiroAbortRef.current === ac) {
        roteiroAbortRef.current = null;
        setRoteiroLoading(false);
      }
    }
  }, [coordsRoteiro]);

  const handleRoteirizarClick = useCallback(() => {
    if (roteiroLoading) return;
    if (selecionadosComChave.length >= 1) {
      setRoteiroWizard(null);
      setRoteiroModo(null);
      void executarRoteirizacao();
      return;
    }
    if (roteiroModo === 'ctrl') return;
    setRoteiroWizard('escolha');
  }, [roteiroLoading, selecionadosComChave.length, executarRoteirizacao, roteiroModo]);

  const wizardVoltar = useCallback(() => {
    setRoteiroWizard((s) => (s === 'escolha' ? null : 'escolha'));
  }, []);

  const aplicarFiltrosRoteiro = useCallback((chaves: string[]) => {
    setRoteirizadorChaves(new Set(chaves));
    setRoteiroWizard(null);
    setRoteiroModo('filtros');
  }, []);

  const layoutToken = `${mostrarFiltros}-${mostrarCards}-${telaCheia}|mapH:${mapPaneHeightPx ?? 'auto'}|rot:${roteirizadorChaves.size}:${roteiroResultado?.totalKm ?? 0}|rotPop:${roteiroPopoverAberto ? 1 : 0}|poly:${roteiroResultado?.mapaPolyline?.length ?? 0}`;
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

  const snapPdf = pdfCaptura;

  const ajusteCargaSel = ajusteCargaChave
    ? selecionadosEnriquecidos.find((s) => s.chave === ajusteCargaChave)
    : null;

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
              roteirizadorChaves={roteirizadorChaves}
              roteirizadorChaveBaseFixa={chaveTeresinaMapa}
              onRoteirizadorToggleChave={toggleRoteirizadorChave}
              rotaPolyline={rotaPolyline}
              paradaSequenciaPorChave={paradaSequenciaPorChave}
              paradasRoteiro={paradasRoteiroMapa.length > 0 ? paradasRoteiroMapa : undefined}
              mapaOverlaySuperiorEsquerdo={
                <div className="pointer-events-none absolute inset-0 z-[1100]">
                  <div className="pointer-events-auto absolute left-3 top-[5.25rem] flex max-w-[min(22rem,calc(100%-1.5rem))] flex-col items-start gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleRoteirizarClick}
                        disabled={roteiroLoading}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-md hover:bg-emerald-700 disabled:opacity-50 dark:border-emerald-500 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                        title="Calcular rota (Teresina → cidade → Teresina). Com cidades já selecionadas (Ctrl+clique ou filtros), calcula a rota; sem seleção, abre opções de escolha."
                      >
                        {roteiroLoading ? 'Calculando…' : 'Roteirizar'}
                      </button>
                      {(roteiroModo != null || roteiroWizard != null) && !roteiroLoading && (
                        <button
                          type="button"
                          onClick={cancelarRoteirizacao}
                          className="rounded-lg border border-slate-300 bg-white/95 px-2 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-500 dark:bg-slate-800/95 dark:text-slate-200"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                    {roteiroModo === 'ctrl' && selecionadosComChave.length === 0 && (
                      <p className="max-w-[14rem] rounded-md bg-white/95 px-2 py-1 text-[10px] leading-snug text-slate-600 shadow-sm dark:bg-slate-800/95 dark:text-slate-300">
                        Ctrl+clique nas cidades e clique em Roteirizar.
                      </p>
                    )}
                    {roteiroPopoverAberto && (
                      <div className="w-full min-w-0">
                        <HeatmapRoteirizadorPanel
                          loading={roteiroLoading}
                          resultado={roteiroResultado}
                          selecionados={selecionadosEnriquecidos}
                          exclusoesSimulacao={exclusoesSimulacao}
                          ajustesQtdeSimulacao={ajustesQtdeSimulacao}
                          onRemover={toggleRoteirizadorChave}
                          onLimpar={limparRoteiro}
                          onFechar={() => setRoteiroPopoverAberto(false)}
                          onSalvarPdf={iniciarExportPdfRoteiro}
                          salvandoPdf={pdfExportando}
                          onAjustarCarga={setAjusteCargaChave}
                          onRestaurarSimulacao={restaurarSimulacaoToda}
                        />
                      </div>
                    )}
                  </div>
                </div>
              }
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
      {ajusteCargaSel && (
        <HeatmapAjusteCargaModal
          open
          municipioChave={ajusteCargaSel.chave}
          item={ajusteCargaSel.item}
          filtros={filtros as FiltrosPedidos}
          exclusoes={exclusoesSimulacao}
          ajustesQtde={ajustesQtdeSimulacao}
          onToggleLinha={toggleExclusaoLinha}
          onDefinirInclusaoLinhas={definirInclusaoLinhasSimulacao}
          onAjustarQtdeItem={ajustarQtdeItemSimulacao}
          onRestaurarCidade={restaurarCidadeSimulacao}
          onDetalhesCarregados={onDetalhesCarregados}
          onClose={() => setAjusteCargaChave(null)}
        />
      )}
      {snapPdf && (
        <div
          className="pointer-events-none fixed top-0 z-[2147483000] h-[480px] w-[840px] overflow-hidden rounded-lg border border-slate-200 bg-[#e8eef5] shadow-none"
          style={{ left: -10000 }}
          aria-hidden
        >
          <RoteiroPdfMapaCaptura
            key={snapPdf.key}
            polyline={snapPdf.polyline}
            paradas={snapPdf.paradas}
            onPronto={(containerEl) => {
              void (async () => {
                try {
                  await gerarPdfRoteiroHeatmap({
                    selecionados: snapPdf.selecionados,
                    resultado: snapPdf.resultado,
                    exclusoesSimulacao: snapPdf.exclusoesSimulacao,
                    ajustesQtdeSimulacao: snapPdf.ajustesQtdeSimulacao,
                    mapaElement: containerEl,
                  });
                } catch {
                  /* PDF pode abrir sem mapa se captura falhar */
                } finally {
                  setPdfCaptura(null);
                  setPdfExportando(false);
                }
              })();
            }}
          />
        </div>
      )}
      {roteiroWizard != null && (
        <HeatmapRoteiroWizardModal
          step={roteiroWizard}
          itensMapa={itensMapaRoteiro}
          maxCidades={MAX_CIDADES_ROTEIRO}
          onEscolherCtrl={() => setRoteiroWizard('ctrl')}
          onContinuarCtrl={() => {
            setRoteiroWizard(null);
            setRoteiroModo('ctrl');
          }}
          onEscolherFiltros={() => setRoteiroWizard('filtros')}
          onAplicarFiltros={aplicarFiltrosRoteiro}
          onVoltar={wizardVoltar}
          onCancelar={cancelarRoteirizacao}
        />
      )}
    </div>
  );
}
