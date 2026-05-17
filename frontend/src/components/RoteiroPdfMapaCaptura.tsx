import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Pane, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { PONTO_RETORNO_TERESINA } from '../utils/heatmapRoteirizador';
import { iconeParadaRotaCanvas } from '../utils/heatmapParadaMapaIcon';
import {
  aguardarMapaRoteiroPronto,
  aplicarZoomRoteiroNoMapa,
  type PontoMapaRoteiro,
} from '../utils/heatmapMapaBoundsRoteiro';

export type ParadaPdfMapa = { lat: number; lng: number; seq: number };

function AjustaBoundsEPronto({
  polyline,
  paradas,
  onProntoRef,
}: {
  polyline: [number, number][];
  paradas: ParadaPdfMapa[];
  onProntoRef: React.MutableRefObject<(el: HTMLElement) => void>;
}) {
  const map = useMap();
  useEffect(() => {
    let alive = true;
    if (polyline.length < 2 && paradas.length === 0) return;

    const el = map.getContainer();
    const pontos: PontoMapaRoteiro[] = paradas.map((p) => ({ lat: p.lat, lng: p.lng }));

    void (async () => {
      await new Promise((r) => window.setTimeout(r, 80));
      if (!alive) return;

      aplicarZoomRoteiroNoMapa(map, polyline, pontos, {
        padding: [18, 18],
        maxZoom: 16,
        fatorEncolher: 0.48,
      });

      await new Promise((r) => window.setTimeout(r, 120));
      if (!alive) return;

      aplicarZoomRoteiroNoMapa(map, polyline, pontos, {
        padding: [12, 12],
        maxZoom: 16,
        fatorEncolher: 0.48,
      });

      await aguardarMapaRoteiroPronto(map);
      if (!alive) return;

      const z = map.getZoom();
      const alvo = Math.min(z + 1, 16);
      if (alvo > z) map.setZoom(alvo, { animate: false });

      await new Promise((r) => window.setTimeout(r, 400));
      if (!alive) return;

      try {
        map.invalidateSize({ animate: false });
      } catch {
        /* */
      }
      onProntoRef.current(el);
    })();

    return () => {
      alive = false;
    };
  }, [map, polyline, paradas, onProntoRef]);

  return null;
}

export type RoteiroPdfMapaCapturaProps = {
  polyline: [number, number][];
  paradas: ParadaPdfMapa[];
  /** Chamado uma vez com o `.leaflet-container` estável para rasterizar (html2canvas). */
  onPronto: (leafletContainer: HTMLElement) => void;
};

/**
 * Mapa mínimo (sem bolhas de cidades fora da rota) para rasterizar no PDF.
 */
export default function RoteiroPdfMapaCaptura({ polyline, paradas, onPronto }: RoteiroPdfMapaCapturaProps) {
  const onProntoRef = useRef(onPronto);
  onProntoRef.current = onPronto;

  const c0 = polyline[0] ?? ([PONTO_RETORNO_TERESINA.lat, PONTO_RETORNO_TERESINA.lng] as [number, number]);

  return (
    <MapContainer
      center={c0}
      zoom={9}
      className="h-full w-full"
      style={{ height: '100%', width: '100%', background: '#e8eef5' }}
      preferCanvas
      zoomControl={false}
      attributionControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      boxZoom={false}
      keyboard={false}
      touchZoom={false}
    >
      <TileLayer
        attribution=""
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <AjustaBoundsEPronto polyline={polyline} paradas={paradas} onProntoRef={onProntoRef} />
      <Pane name="pdf-rota" style={{ zIndex: 400 }}>
        {polyline.length >= 2 && (
          <Polyline
            positions={polyline}
            pathOptions={{
              color: '#1d4ed8',
              weight: 5,
              opacity: 0.95,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )}
      </Pane>
      <CircleMarker
        center={[PONTO_RETORNO_TERESINA.lat, PONTO_RETORNO_TERESINA.lng]}
        radius={10}
        pathOptions={{
          color: '#0f172a',
          weight: 2,
          fillColor: '#38bdf8',
          fillOpacity: 0.95,
        }}
      />
      {paradas.map((p) => (
        <Marker key={`${p.seq}-${p.lat}-${p.lng}`} position={[p.lat, p.lng]} icon={iconeParadaRotaCanvas(p.seq)} />
      ))}
    </MapContainer>
  );
}
