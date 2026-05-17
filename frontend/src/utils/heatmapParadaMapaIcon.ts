import L from 'leaflet';

const PIN_W = 32;
const PIN_H = 42;

/** Desenha marcador em forma de alfinete (parada), opcionalmente numerado. */
function desenharPin(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  fill: string,
  stroke: string,
  numero?: number
) {
  const cx = w / 2;
  const cy = 14;
  const r = 11.5;

  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0, false);
  ctx.lineTo(cx, h - 3);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  if (numero != null && numero > 0) {
    ctx.fillStyle = '#ffffff';
    const fs = numero >= 10 ? 12 : 14;
    ctx.font = `800 ${fs}px system-ui,-apple-system,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(numero), cx, cy + 0.5);
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
}

const iconeCanvasCache = new Map<string, L.Icon>();

function iconeCanvasPin(chave: string, fill: string, numero?: number): L.Icon {
  let icon = iconeCanvasCache.get(chave);
  if (!icon) {
    const canvas = document.createElement('canvas');
    canvas.width = PIN_W;
    canvas.height = PIN_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return L.icon({ iconUrl: '', iconSize: [1, 1], iconAnchor: [0, 0] });
    }
    desenharPin(ctx, PIN_W, PIN_H, fill, '#ffffff', numero);
    icon = L.icon({
      iconUrl: canvas.toDataURL('image/png'),
      iconSize: [PIN_W, PIN_H],
      iconAnchor: [PIN_W / 2, PIN_H - 2],
    });
    iconeCanvasCache.set(chave, icon);
  }
  return icon;
}

/** Parada na rota calculada (com ordem de visita). */
export function iconeParadaRotaCanvas(seq: number): L.Icon {
  return iconeCanvasPin(`rota-${seq}`, '#0f172a', seq);
}

/** Cidade selecionada para roteirização (ainda sem ordem). */
export function iconeParadaSelecaoCanvas(): L.Icon {
  return iconeCanvasPin('sel', '#ea580c');
}

const divIconCache = new Map<string, L.DivIcon>();

function iconeParadaDiv(chave: string, fill: string, numero?: number): L.DivIcon {
  let icon = divIconCache.get(chave);
  if (!icon) {
    const label =
      numero != null && numero > 0
        ? `<span style="font-size:${numero >= 10 ? 11 : 13}px;font-weight:800;line-height:1">${numero}</span>`
        : '<span style="width:6px;height:6px;border-radius:50%;background:#fff;display:block"></span>';
    icon = L.divIcon({
      className: 'heatmap-parada-pin',
      html: `<div style="pointer-events:none;position:relative;width:${PIN_W}px;height:${PIN_H}px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.4))">
        <svg width="${PIN_W}" height="${PIN_H}" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M16 40 C16 40 3 24 3 14 A13 13 0 1 1 29 14 C29 24 16 40 16 40 Z" fill="${fill}" stroke="#fff" stroke-width="2.5"/>
        </svg>
        <div style="position:absolute;top:5px;left:50%;transform:translateX(-50%);color:#fff;display:flex;align-items:center;justify-content:center;width:22px;height:22px">${label}</div>
      </div>`,
      iconSize: [PIN_W, PIN_H],
      iconAnchor: [PIN_W / 2, PIN_H - 2],
    });
    divIconCache.set(chave, icon);
  }
  return icon;
}

/** Ícone no mapa interativo — parada numerada. */
export function iconeParadaRota(seq: number): L.DivIcon {
  return iconeParadaDiv(`rota-${seq}`, '#0f172a', seq);
}

/** Ícone no mapa interativo — cidade incluída na rota (pré-cálculo). */
export function iconeParadaSelecao(): L.DivIcon {
  return iconeParadaDiv('sel', '#ea580c');
}
