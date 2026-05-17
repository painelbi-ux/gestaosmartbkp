import { useEffect, useState, useMemo, useCallback, Fragment, type ReactNode } from 'react';
import { MapContainer, TileLayer, Circle, Tooltip, Popup, useMap, Polyline, CircleMarker, Pane, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { obterMapaMunicipios, type MapaMunicipioItem, type TooltipDetalheRow, type CorBolhaMapa, type MapaMunicipiosResponse, type FiltrosPedidos } from '../api/pedidos';
import { PONTO_RETORNO_TERESINA } from '../utils/heatmapRoteirizador';
import { iconeParadaRota, iconeParadaSelecao } from '../utils/heatmapParadaMapaIcon';
import { aplicarZoomRoteiroNoMapa, type PontoMapaRoteiro } from '../utils/heatmapMapaBoundsRoteiro';

const CENTRO_BRASIL: [number, number] = [-14.235, -51.9253];
const ZOOM = 4;
const RAIO_MIN_KM = 3;
const RAIO_MAX_KM = 35;

/** Distância em km entre dois pontos (fórmula de Haversine). */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Para cada item, retorna o raio em km limitado para não sobrepor à bolha mais próxima. */
function raiosSemSobreposicao(
  itens: MapaMunicipioItem[],
  raioPorValor: (valor: number) => number
): Map<string, number> {
  const out = new Map<string, number>();
  const n = itens.length;
  for (let i = 0; i < n; i++) {
    const item = itens[i]!;
    const key = item.chave || `${item.municipio}-${item.uf}-${i}`;
    const raioDesejado = raioPorValor(item.valorPendente);
    let distMinimaKm = Infinity;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const other = itens[j]!;
      const d = haversineKm(item.lat, item.lng, other.lat, other.lng);
      if (d < distMinimaKm) distMinimaKm = d;
    }
    // Raio máximo para não sobrepor: metade da distância ao vizinho mais próximo (deixando pequena folga).
    const raioMaxSemSobrepor = distMinimaKm === Infinity ? RAIO_MAX_KM : Math.max(RAIO_MIN_KM, distMinimaKm / 2 - 0.3);
    const raioFinal = Math.max(RAIO_MIN_KM, Math.min(raioDesejado, raioMaxSemSobrepor));
    out.set(key, raioFinal);
  }
  return out;
}

const CORES_BOLHA: Record<CorBolhaMapa, { fillColor: string; color: string }> = {
  vermelho: { fillColor: '#dc2626', color: '#b91c1c' },
  verde: { fillColor: '#16a34a', color: '#15803d' },
  amarelo: { fillColor: '#eab308', color: '#ca8a04' },
  roxo: { fillColor: '#9333ea', color: '#7e22ce' },
  preto: { fillColor: '#1f2937', color: '#111827' },
};

function formatarValor(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor);
}

/** Evita que cliques/scroll dentro do popup fechem o painel ou sejam capturados pelo mapa. */
function stopMapEvent(e: React.MouseEvent | React.TouchEvent) {
  e.stopPropagation();
}

type SortCol = 'rm' | 'rota' | 'dataEmissao' | 'pedido' | 'municipio' | 'aVista' | 'valorPendente';
type SortDir = 'asc' | 'desc';

function formatDataExibicao(iso: string): string {
  if (!iso || iso.length < 10) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : '—';
}

/** Conteúdo do popup: título + tabela ordenável (RM | ROTAS | DATA EMISSÃO | PD | MUNICIPIO | A VISTA | VENDA) + Total */
function PopupConteudo({
  item,
  formatarValor,
}: {
  item: MapaMunicipioItem;
  formatarValor: (v: number) => string;
}) {
  const [sortBy, setSortBy] = useState<SortCol>('dataEmissao');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const detalhesBruto = item.detalhes ?? [];

  /** Uma linha por (pedido + rota): mesmo pedido em duas rotas vira duas linhas, com somatório do valor por rota. */
  const detalhesPorPedido = useMemo(() => {
    if (detalhesBruto.length === 0) return [];
    const byPedidoRota = new Map<string, TooltipDetalheRow & { valorPendente: number }>();
    for (const row of detalhesBruto) {
      const pedido = String(row.pedido ?? '').trim() || `_${row.codigo ?? ''}_${row.produto ?? ''}`;
      const rota = (row.rota ?? '').trim();
      const rm = (row.rm ?? '').trim();
      const key = `${pedido}|${rota}|${rm}`;
      const existing = byPedidoRota.get(key);
      if (existing) {
        existing.valorPendente += row.valorPendente ?? 0;
      } else {
        byPedidoRota.set(key, { ...row, valorPendente: row.valorPendente ?? 0 });
      }
    }
    return [...byPedidoRota.values()];
  }, [detalhesBruto]);

  const toggleSort = useCallback((col: SortCol) => {
    setSortBy(col);
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
  }, []);

  const detalhes = useMemo(() => {
    if (detalhesPorPedido.length === 0) return [];
    return [...detalhesPorPedido].sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'valorPendente') {
        cmp = (a.valorPendente ?? 0) - (b.valorPendente ?? 0);
      } else if (sortBy === 'dataEmissao') {
        const da = (a as TooltipDetalheRow).dataEmissao ?? '';
        const db = (b as TooltipDetalheRow).dataEmissao ?? '';
        cmp = da.localeCompare(db, undefined, { numeric: true });
      } else {
        const va = String((a as Record<string, unknown>)[sortBy] ?? '').toLowerCase();
        const vb = String((b as Record<string, unknown>)[sortBy] ?? '').toLowerCase();
        cmp = va.localeCompare(vb, undefined, { numeric: true });
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [detalhesPorPedido, sortBy, sortDir]);

  const totalVenda = useMemo(
    () => detalhes.reduce((s, r) => s + (r.valorPendente ?? 0), 0),
    [detalhes]
  );

  const thClass = 'text-left py-1.5 px-2 border-b border-amber-200 font-semibold cursor-pointer select-none hover:bg-amber-100 bg-amber-50/90 text-slate-800';
  const thRightClass = 'text-right py-1.5 px-2 border-b border-amber-200 font-semibold pl-4 cursor-pointer select-none hover:bg-amber-100 bg-amber-50/90 text-slate-800';

  return (
    <div
      className="min-w-[480px] max-w-[90vw] w-max leaflet-popup-content-interact"
      style={{ maxWidth: 'min(720px, 90vw)' }}
      onClick={stopMapEvent}
      onMouseDown={stopMapEvent}
      onTouchStart={stopMapEvent}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 rounded-t-lg">
        <div className="font-semibold text-slate-800 text-sm">
          {item.municipio}{item.uf ? ` (${item.uf})` : ''}
        </div>
        {item.chave && (
          <div className="text-xs text-slate-500 mt-0.5 font-mono">{item.chave}</div>
        )}
        <div className="text-xs text-slate-600 mt-0.5">
          Total VENDA: {formatarValor(item.valorPendente)}
        </div>
      </div>
      <div className="max-h-[320px] overflow-auto overscroll-contain">
        <table className="text-xs border-collapse whitespace-nowrap w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={thClass} onClick={() => toggleSort('rm')} role="button" title="Ordenar por RM">RM {sortBy === 'rm' && (sortDir === 'asc' ? '↑' : '↓')}</th>
              <th className={thClass} onClick={() => toggleSort('rota')} role="button" title="Ordenar por Rotas">ROTAS {sortBy === 'rota' && (sortDir === 'asc' ? '↑' : '↓')}</th>
              <th className={thClass} onClick={() => toggleSort('dataEmissao')} role="button" title="Ordenar por Data Emissão">DATA EMISSÃO {sortBy === 'dataEmissao' && (sortDir === 'asc' ? '↑' : '↓')}</th>
              <th className={thClass} onClick={() => toggleSort('pedido')} role="button" title="Ordenar por PD">PD {sortBy === 'pedido' && (sortDir === 'asc' ? '↑' : '↓')}</th>
              <th className={thClass} onClick={() => toggleSort('municipio')} role="button" title="Ordenar por Município">MUNICIPIO {sortBy === 'municipio' && (sortDir === 'asc' ? '↑' : '↓')}</th>
              <th className={thClass} onClick={() => toggleSort('aVista')} role="button" title="Ordenar por A Vista">A VISTA {sortBy === 'aVista' && (sortDir === 'asc' ? '↑' : '↓')}</th>
              <th className={thRightClass} onClick={() => toggleSort('valorPendente')} role="button" title="Ordenar por Venda">VENDA {sortBy === 'valorPendente' && (sortDir === 'asc' ? '↑' : '↓')}</th>
            </tr>
          </thead>
          <tbody className="text-slate-700 bg-white">
            {detalhes.map((row, idx) => (
              <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-1 px-2">{row.rm || '—'}</td>
                <td className="py-1 px-2 max-w-[200px] truncate" title={row.rota || ''}>{row.rota || '—'}</td>
                <td className="py-1 px-2">{formatDataExibicao(row.dataEmissao ?? '')}</td>
                <td className="py-1 px-2">{row.pedido ? `PD ${String(row.pedido).replace(/^PD\s*/i, '').trim()}` : '—'}</td>
                <td className="py-1 px-2">{row.municipio || '—'}</td>
                <td className="py-1 px-2">{row.aVista || '—'}</td>
                <td className="py-1 px-2 pl-4 text-right">{formatarValor(row.valorPendente ?? 0)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-amber-200 bg-amber-50/70 font-semibold text-slate-800">
              <td className="py-1.5 px-2" colSpan={6}>Total</td>
              <td className="py-1.5 px-2 pl-4 text-right">{formatarValor(totalVenda)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {detalhes.length >= 80 && (
        <div className="px-3 py-1.5 text-xs text-slate-500 border-t border-slate-100 bg-slate-50 rounded-b-lg">
          Exibindo até 80 itens. Total do município: {formatarValor(item.valorPendente)}
        </div>
      )}
    </div>
  );
}

/** Ajusta o zoom para caber todos os pontos (quando há dados). */
function AjustarBounds({ items }: { items: MapaMunicipioItem[] }) {
  const map = useMap();
  useEffect(() => {
    if (items.length === 0) return;
    const bounds = L.latLngBounds(items.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds.pad(0.15));
  }, [map, items]);
  return null;
}

/** Mesmo enquadramento usado no PDF: Teresina + paradas da rota. */
function AjustarBoundsRota({
  polyline,
  paradas,
  token,
}: {
  polyline?: [number, number][];
  paradas?: PontoMapaRoteiro[];
  token?: string;
}) {
  const map = useMap();
  useEffect(() => {
    if (!paradas?.length) return;
    const t = window.setTimeout(() => {
      aplicarZoomRoteiroNoMapa(map, polyline ?? [], paradas, {
        padding: [28, 28],
        maxZoom: 16,
        fatorEncolher: 0.48,
      });
    }, 100);
    return () => window.clearTimeout(t);
  }, [map, polyline, paradas, token]);
  return null;
}

export function mapaMunicipioChave(item: MapaMunicipioItem, i: number): string {
  return item.chave || `${item.municipio}-${item.uf}-${i}`;
}

interface MapaMunicipiosProps {
  filtros?: FiltrosPedidos;
  layoutToken?: string;
  /** Itens atuais do mapa (para o pai sincronizar seleção do roteirizador). */
  onItensCarregados?: (itens: MapaMunicipioItem[]) => void;
  roteirizadorChaves?: ReadonlySet<string>;
  /** Chave de Teresina/PI: sempre exibida como selecionada (base da rota). */
  roteirizadorChaveBaseFixa?: string;
  onRoteirizadorToggleChave?: (chave: string) => void;
  /** Linha [lat, lng] na ordem da rota (inclui retorno à base). */
  rotaPolyline?: [number, number][];
  /** Após roteirizar: número da parada (1-based) por chave do município no mapa. */
  paradaSequenciaPorChave?: ReadonlyMap<string, number>;
  /** Coordenadas das paradas (para enquadrar o mapa na rota). */
  paradasRoteiro?: PontoMapaRoteiro[];
  /** Conteúdo flutuante no canto superior esquerdo do mapa (ex.: botão Roteirizar). */
  mapaOverlaySuperiorEsquerdo?: ReactNode;
}

function RecalcularMapa({ token }: { token?: string }) {
  const map = useMap();
  useEffect(() => {
    const t = window.setTimeout(() => {
      map.invalidateSize();
    }, 80);
    return () => window.clearTimeout(t);
  }, [map, token]);
  return null;
}

function FecharPopupComEsc() {
  const map = useMap();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      map.closePopup();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [map]);
  return null;
}

/** Bolha com detalhes ao clique normal; com Ctrl+clique inclui/remove da rota (sem abrir popup). */
function BolhaMunicipioMapa({
  item,
  raioKm,
  cores,
  chave,
  roteirizadorChaves,
  roteirizadorChaveBaseFixa,
  onRoteirizadorToggleChave,
  sequenciaParada,
}: {
  item: MapaMunicipioItem;
  raioKm: number;
  cores: { fillColor: string; color: string };
  chave: string;
  roteirizadorChaves?: ReadonlySet<string>;
  /** Chave de Teresina/PI: sempre exibida como selecionada (base da rota). */
  roteirizadorChaveBaseFixa?: string;
  onRoteirizadorToggleChave?: (chave: string) => void;
  /** Número da parada na rota calculada (exibe selo no centro). */
  sequenciaParada?: number;
}) {
  const map = useMap();
  const ehBase = !!(roteirizadorChaveBaseFixa && chave === roteirizadorChaveBaseFixa);
  const sel = ehBase || !!(roteirizadorChaves?.has(chave));
  const seq = sequenciaParada;
  const paradaNaRota = sel && !ehBase;
  return (
    <Fragment>
    <Circle
      center={[item.lat, item.lng]}
      radius={raioKm * 1000}
      pathOptions={{
        fillColor: paradaNaRota ? cores.fillColor : sel ? '#f97316' : cores.fillColor,
        color: paradaNaRota ? '#ea580c' : sel ? '#c2410c' : cores.color,
        fillOpacity: paradaNaRota ? 0.38 : sel ? 0.72 : 0.55,
        weight: paradaNaRota ? 2.5 : sel ? 3 : 1.5,
        dashArray: paradaNaRota ? '6 4' : undefined,
      }}
      eventHandlers={{
        click: (e) => {
          const ev = e.originalEvent as MouseEvent | undefined;
          if (ev?.ctrlKey && onRoteirizadorToggleChave && !ehBase) {
            ev.preventDefault();
            L.DomEvent.stopPropagation(e as L.LeafletMouseEvent);
            onRoteirizadorToggleChave(chave);
            window.setTimeout(() => map.closePopup(), 0);
          }
        },
        mouseover: (e) => {
          e.target.setStyle({
            fillOpacity: paradaNaRota ? 0.52 : 0.88,
            weight: paradaNaRota ? 3 : sel ? 3 : 2,
          });
          e.target.bringToFront();
        },
        mouseout: (e) => {
          e.target.setStyle({
            fillOpacity: paradaNaRota ? 0.38 : sel ? 0.72 : 0.55,
            weight: paradaNaRota ? 2.5 : sel ? 3 : 1.5,
            dashArray: paradaNaRota ? '6 4' : undefined,
          });
        },
      }}
    >
      <Tooltip permanent={false} direction="top" offset={[0, -8]}>
        {onRoteirizadorToggleChave
          ? ehBase
            ? 'Base da rota (Teresina). Ctrl+clique em outra bolha para simular.'
            : 'Ctrl+clique: incluir ou remover da rota. Clique: detalhes.'
          : 'Clique para ver detalhes'}
      </Tooltip>
      <Popup className="leaflet-popup-detalhes" minWidth={380} maxWidth={640}>
        <PopupConteudo item={item} formatarValor={formatarValor} />
      </Popup>
    </Circle>
    {paradaNaRota && (
      <Marker
        key={`${chave}-parada-${seq ?? 'sel'}`}
        position={[item.lat, item.lng]}
        icon={seq != null && seq > 0 ? iconeParadaRota(seq) : iconeParadaSelecao()}
        interactive={false}
        zIndexOffset={800}
      />
    )}
    </Fragment>
  );
}

export default function MapaMunicipios({
  filtros = {},
  layoutToken,
  onItensCarregados,
  roteirizadorChaves,
  roteirizadorChaveBaseFixa,
  onRoteirizadorToggleChave,
  rotaPolyline,
  paradaSequenciaPorChave,
  paradasRoteiro,
  mapaOverlaySuperiorEsquerdo,
}: MapaMunicipiosProps) {
  const [resposta, setResposta] = useState<MapaMunicipiosResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErro(null);
    obterMapaMunicipios(filtros)
      .then(setResposta)
      .catch(() => setErro('Não foi possível carregar o mapa.'))
      .finally(() => setLoading(false));
  }, [filtros]);

  const dados = resposta?.itens ?? [];

  useEffect(() => {
    onItensCarregados?.(dados);
  }, [dados, onItensCarregados]);
  const semCoordenadas = resposta?.semCoordenadas ?? [];

  const { raioPorItem } = useMemo(() => {
    if (dados.length === 0) return { raioPorItem: new Map<string, number>() };
    const max = Math.max(...dados.map((d) => d.valorPendente), 1);
    const raioPorValor = (valor: number) => {
      const frac = Math.sqrt(Math.max(0, valor) / max);
      return RAIO_MIN_KM + frac * (RAIO_MAX_KM - RAIO_MIN_KM);
    };
    const raioPorItem = raiosSemSobreposicao(dados, raioPorValor);
    return { raioPorItem };
  }, [dados]);

  if (loading) {
    return (
      <div className="h-full min-h-[320px] bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700/50 rounded-xl overflow-hidden flex items-center justify-center">
        <p className="text-slate-600 dark:text-slate-400">Carregando mapa...</p>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="h-full min-h-[320px] bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700/50 rounded-xl overflow-hidden flex items-center justify-center">
        <p className="text-red-600 dark:text-red-400">{erro}</p>
      </div>
    );
  }

  if (dados.length === 0 && semCoordenadas.length === 0) {
    return (
      <div className="h-full min-h-[320px] bg-slate-200/60 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700/50 rounded-xl overflow-hidden flex flex-col">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 p-4 pb-0 shrink-0">
          Heatmap
        </h3>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-slate-600 dark:text-slate-400 text-sm">Nenhum município com pedidos no momento.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 bg-slate-100 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700/50 rounded-xl overflow-hidden">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 p-4 pb-2 shrink-0">
          Heatmap
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 px-4 pb-1 shrink-0">
        Tamanho da bolha = valor pendente. <strong>Teresina/PI</strong> é a base (sempre ativa). <strong>Ctrl+clique</strong> em outra bolha para incluir a cidade; clique normal abre detalhes. Use <strong>Roteirizar</strong> para o percurso Teresina → cidade → Teresina.
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-2 shrink-0 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-600 border border-green-800" aria-hidden />
          <span className="text-slate-600 dark:text-slate-400">Cidade com todos os pedidos na mesma rota</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-yellow-500 border border-yellow-700" aria-hidden />
          <span className="text-slate-600 dark:text-slate-400">Cidade com rota mas possui pedidos ainda não alocados em rota</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-600 border border-red-800" aria-hidden />
          <span className="text-slate-600 dark:text-slate-400">Cidade com pedido mas não possui rota</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-purple-600 border border-purple-800" aria-hidden />
          <span className="text-slate-600 dark:text-slate-400">Cidade com 2 ou mais rotas</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-gray-800 border border-gray-900" aria-hidden />
          <span className="text-slate-600 dark:text-slate-400">Cidade com 2 ou mais rotas e com pedidos sem rota</span>
        </span>
      </div>
      {semCoordenadas.length > 0 && (
        <details className="px-4 pb-2 shrink-0 text-xs">
          <summary className="cursor-pointer text-amber-700 dark:text-amber-400 font-medium">
            {semCoordenadas.length} município(s) com pedidos sem coordenadas (não aparecem no mapa)
          </summary>
          <ul className="mt-1 list-disc list-inside text-slate-600 dark:text-slate-400 max-h-24 overflow-y-auto">
            {semCoordenadas.map((s, i) => (
              <li key={i}><span className="font-mono">{s.chave || `${s.municipio}${s.uf ? ` (${s.uf})` : ''}`}</span> — {formatarValor(s.valorPendente)}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="flex-1 min-h-[280px] w-full relative z-0 rounded-b-xl overflow-hidden">
        <MapContainer
          center={CENTRO_BRASIL}
          zoom={ZOOM}
          className="h-full w-full rounded-b-xl relative z-0"
          scrollWheelZoom={true}
          style={{ background: 'hsl(210 40% 96%)', height: '100%', minHeight: 280 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          <FecharPopupComEsc />
          <RecalcularMapa token={layoutToken} />
          {rotaPolyline && paradasRoteiro && paradasRoteiro.length > 0 ? (
            <AjustarBoundsRota
              polyline={rotaPolyline}
              paradas={paradasRoteiro}
              token={layoutToken}
            />
          ) : (
            <AjustarBounds items={dados} />
          )}
          {dados.map((item, i) => {
            const key = mapaMunicipioChave(item, i);
            const raioKm = raioPorItem.get(key) ?? RAIO_MIN_KM;
            const cores = CORES_BOLHA[item.cor ?? 'verde'];
            return (
              <BolhaMunicipioMapa
                key={key}
                item={item}
                raioKm={raioKm}
                cores={cores}
                chave={key}
                roteirizadorChaves={roteirizadorChaves}
                roteirizadorChaveBaseFixa={roteirizadorChaveBaseFixa}
                onRoteirizadorToggleChave={onRoteirizadorToggleChave}
                sequenciaParada={paradaSequenciaPorChave?.get(key)}
              />
            );
          })}
          <Pane name="heatmap-rota-viaria" style={{ zIndex: 360 }}>
            {rotaPolyline && rotaPolyline.length >= 2 && (
              <Polyline
                key={`rota-${rotaPolyline.length}-${rotaPolyline[0]![0].toFixed(4)}`}
                positions={rotaPolyline}
                pathOptions={{
                  color: '#1d4ed8',
                  weight: 4,
                  opacity: 0.92,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            )}
          </Pane>
          {(roteirizadorChaveBaseFixa || (roteirizadorChaves && roteirizadorChaves.size > 0)) && (
            <CircleMarker
              center={[PONTO_RETORNO_TERESINA.lat, PONTO_RETORNO_TERESINA.lng]}
              radius={9}
              pathOptions={{
                color: '#0f172a',
                weight: 2,
                fillColor: '#38bdf8',
                fillOpacity: 0.95,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                Base / retorno: Teresina, PI
              </Tooltip>
            </CircleMarker>
          )}
        </MapContainer>
        {mapaOverlaySuperiorEsquerdo}
      </div>
    </div>
  );
}
