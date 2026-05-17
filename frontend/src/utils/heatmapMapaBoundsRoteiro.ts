import L from 'leaflet';
import { PONTO_RETORNO_TERESINA } from './heatmapRoteirizador';

export type PontoMapaRoteiro = { lat: number; lng: number };

/** Amostra a polyline OSRM para não inflar o bounding box com ruído. */
function amostrarPolyline(pts: [number, number][], maxPontos = 60): L.LatLngTuple[] {
  if (pts.length === 0) return [];
  if (pts.length <= maxPontos) return pts.map((p) => [p[0], p[1]] as L.LatLngTuple);
  const out: L.LatLngTuple[] = [];
  const step = Math.max(1, Math.floor(pts.length / maxPontos));
  for (let i = 0; i < pts.length; i += step) out.push([pts[i]![0], pts[i]![1]]);
  const last = pts[pts.length - 1]!;
  const tail = out[out.length - 1];
  if (!tail || tail[0] !== last[0] || tail[1] !== last[1]) {
    out.push([last[0], last[1]]);
  }
  return out;
}

export function pontosBoundsRoteiro(
  polyline: [number, number][],
  paradas: PontoMapaRoteiro[],
  /** Se true, usa só Teresina + paradas (zoom mais fechado, igual à visualização desejada). */
  somenteParadas = true
): L.LatLngTuple[] {
  const base: L.LatLngTuple[] = [
    [PONTO_RETORNO_TERESINA.lat, PONTO_RETORNO_TERESINA.lng],
    ...paradas.map((p) => [p.lat, p.lng] as L.LatLngTuple),
  ];
  if (somenteParadas || polyline.length < 2) return base;
  return [...base, ...amostrarPolyline(polyline)];
}

export function boundsRoteiro(
  polyline: [number, number][],
  paradas: PontoMapaRoteiro[],
  fatorEncolher = 0.52
): L.LatLngBounds {
  const pts = pontosBoundsRoteiro(polyline, paradas, true);
  const b = L.latLngBounds(pts);
  if (!b.isValid()) return b;
  const c = b.getCenter();
  const ne = b.getNorthEast();
  const sw = b.getSouthWest();
  const latHalf = ((ne.lat - sw.lat) / 2) * fatorEncolher;
  const lngHalf = ((ne.lng - sw.lng) / 2) * fatorEncolher;
  return L.latLngBounds([c.lat - latHalf, c.lng - lngHalf], [c.lat + latHalf, c.lng + lngHalf]);
}

export function aplicarZoomRoteiroNoMapa(
  map: L.Map,
  polyline: [number, number][],
  paradas: PontoMapaRoteiro[],
  opts?: { padding?: [number, number]; maxZoom?: number; fatorEncolher?: number }
): void {
  if (paradas.length === 0 && polyline.length < 2) return;
  const tight = boundsRoteiro(polyline, paradas, opts?.fatorEncolher ?? 0.52);
  if (!tight.isValid()) return;
  map.invalidateSize({ animate: false });
  map.fitBounds(tight, {
    padding: opts?.padding ?? [20, 20],
    maxZoom: opts?.maxZoom ?? 16,
    animate: false,
  });
}

/** Aguarda tiles e animação de bounds antes de rasterizar (PDF). */
export function aguardarMapaRoteiroPronto(map: L.Map, timeoutMs = 3200): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const fallback = window.setTimeout(done, timeoutMs);

    const onReady = () => {
      let tiles = 0;
      let loaded = 0;
      const onTile = () => {
        loaded++;
        if (loaded >= tiles) {
          window.clearTimeout(fallback);
          window.setTimeout(done, 350);
        }
      };

      map.eachLayer((layer) => {
        if (layer instanceof L.TileLayer) {
          tiles++;
          layer.once('load', onTile);
          layer.once('tileerror', onTile);
        }
      });

      if (tiles === 0) {
        window.clearTimeout(fallback);
        window.setTimeout(done, 500);
      }
    };

    if ((map as L.Map & { _loaded?: boolean })._loaded) onReady();
    else map.whenReady(onReady);
  });
}
