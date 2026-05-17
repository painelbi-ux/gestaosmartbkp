/** Ponto de retorno / base padrão para entregas na região. */
export const PONTO_RETORNO_TERESINA = {
  lat: -5.0892,
  lng: -42.8019,
  label: 'Teresina, PI',
} as const;

const ROAD_FACTOR_HAVERSINE = 1.22;

/** Perfis OSRM: caminhão (HGV) quando o servidor aceitar; senão carro (ainda por malha viária). */
export type OsrmPerfilViario = 'driving-hgv' | 'driving';

export interface RoteiroLeg {
  de: string;
  para: string;
  distanciaKm: number;
}

export interface RoteiroResultado {
  /** Índices em `coords` (0 = Teresina, 1..n = cidades na ordem da entrada). */
  ordemIndices: number[];
  pernas: RoteiroLeg[];
  /** Última cidade visitada → Teresina. */
  retornoKm: number;
  totalKm: number;
  /** Distâncias da matriz obtidas via OSRM (malha viária); se false, estimativa Haversine × fator. */
  usouOsrm: boolean;
  /** Perfil usado na matriz OSRM, quando aplicável. */
  perfilOsrm: OsrmPerfilViario | null;
  /**
   * Geometria da rota sobre estradas (OSRM Route), [lat, lng].
   * Ausente se a API de rota falhar; o mapa pode usar segmentos retos entre paradas.
   */
  mapaPolyline?: [number, number][];
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type RoteiroCoord = { lat: number; lng: number; label: string };

function buildHaversineMatrixKm(coords: RoteiroCoord[]): number[][] {
  const n = coords.length;
  const m: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d =
        haversineKm(coords[i]!.lat, coords[i]!.lng, coords[j]!.lat, coords[j]!.lng) * ROAD_FACTOR_HAVERSINE;
      m[i]![j] = d;
      m[j]![i] = d;
    }
  }
  return m;
}

async function osrmTableKm(
  coords: RoteiroCoord[],
  perfil: OsrmPerfilViario,
  signal?: AbortSignal
): Promise<number[][] | null> {
  const lonLat = coords.map((c) => `${c.lng},${c.lat}`).join(';');
  const url = `https://router.project-osrm.org/table/v1/${perfil}/${lonLat}?annotations=distance`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as { distances?: number[][] };
  const dm = data.distances;
  if (!dm || dm.length !== coords.length) return null;
  return dm.map((row) => row.map((meters) => (Number(meters) > 0 ? meters / 1000 : 0)));
}

/** Matriz de distâncias em km (simétrica), por estrada quando OSRM responde. */
export async function obterMatrizDistanciasKm(
  coords: RoteiroCoord[],
  signal?: AbortSignal
): Promise<{ matrixKm: number[][]; usouOsrm: boolean; perfilOsrm: OsrmPerfilViario | null }> {
  if (coords.length <= 1) {
    return { matrixKm: [[0]], usouOsrm: false, perfilOsrm: null };
  }
  if (coords.length > 25) {
    return { matrixKm: buildHaversineMatrixKm(coords), usouOsrm: false, perfilOsrm: null };
  }
  const perfis: OsrmPerfilViario[] = ['driving-hgv', 'driving'];
  for (const perfil of perfis) {
    try {
      const matrixKm = await osrmTableKm(coords, perfil, signal);
      if (matrixKm) return { matrixKm, usouOsrm: true, perfilOsrm: perfil };
    } catch {
      /* tenta próximo perfil */
    }
  }
  return { matrixKm: buildHaversineMatrixKm(coords), usouOsrm: false, perfilOsrm: null };
}

const OSRM_BASE = 'https://router.project-osrm.org';

function mesmoParLatLng(a: RoteiroCoord, b: RoteiroCoord, eps = 1e-5): boolean {
  return Math.abs(a.lat - b.lat) < eps && Math.abs(a.lng - b.lng) < eps;
}

/** Junta geometrias evitando ponto duplicado na emenda. */
function mergePolylines(a: [number, number][], b: [number, number][]): [number, number][] {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const [la, lo] = a[a.length - 1]!;
  const [fb, fo] = b[0]!;
  const dup = Math.abs(la - fb) < 1e-5 && Math.abs(lo - fo) < 1e-5;
  return dup ? [...a, ...b.slice(1)] : [...a, ...b];
}

type OsrmRouteJson = {
  code?: string;
  message?: string;
  routes?: Array<{
    distance?: number;
    legs?: Array<{ distance?: number }>;
    geometry?: { type?: string; coordinates?: [number, number][] };
  }>;
};

function extrairPolylineELegsKm(data: OsrmRouteJson): {
  polyline: [number, number][];
  pernasKm: number[];
  totalKm: number;
} | null {
  if (data.code != null && data.code !== 'Ok') return null;
  if (!data.routes?.[0]) return null;
  const route = data.routes[0];
  const coords = route.geometry?.coordinates;
  if (!coords?.length) return null;
  const polyline = coords.map(([lng, lat]) => [lat, lng] as [number, number]);
  const legs = route.legs ?? [];
  let pernasKm = legs.map((leg) => (Number(leg.distance) > 0 ? leg.distance! / 1000 : 0));
  const totalM = Number(route.distance);
  const totalKm = totalM > 0 ? totalM / 1000 : pernasKm.reduce((s, x) => s + x, 0);
  if (polyline.length < 2 || totalKm <= 0) return null;
  if (pernasKm.length === 0 && totalKm > 0) {
    pernasKm = [totalKm];
  }
  return { polyline, pernasKm, totalKm };
}

async function osrmRouteUmaChamada(
  coords: RoteiroCoord[],
  perfil: OsrmPerfilViario,
  signal?: AbortSignal
): Promise<{ polyline: [number, number][]; pernasKm: number[]; totalKm: number } | null> {
  if (coords.length < 2) return null;
  const lonLat = coords.map((c) => `${c.lng},${c.lat}`).join(';');
  const url = `${OSRM_BASE}/route/v1/${perfil}/${lonLat}?overview=full&geometries=geojson&steps=false`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as OsrmRouteJson;
  return extrairPolylineELegsKm(data);
}

/** Vários trechos A→B; falha se algum trecho falhar. */
async function osrmRoutePorSegmentos(
  coordsCadeia: RoteiroCoord[],
  perfil: OsrmPerfilViario,
  signal?: AbortSignal
): Promise<{ polyline: [number, number][]; pernasKm: number[]; totalKm: number } | null> {
  if (coordsCadeia.length < 2) return null;
  let poly: [number, number][] = [];
  const pernasKm: number[] = [];
  for (let i = 0; i < coordsCadeia.length - 1; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 40));
    const seg = await osrmRouteUmaChamada([coordsCadeia[i]!, coordsCadeia[i + 1]!], perfil, signal);
    if (!seg) return null;
    poly = mergePolylines(poly, seg.polyline);
    pernasKm.push(seg.totalKm);
  }
  const totalKm = pernasKm.reduce((s, x) => s + x, 0);
  return poly.length >= 2 ? { polyline: poly, pernasKm, totalKm } : null;
}

/**
 * Geometria da rota sobre estradas (OSRM).
 * Tenta rota única; se o ciclo fecha na base (mesmo ponto início/fim), ida + volta em duas chamadas;
 * se necessário, cai no encadeamento perna-a-perna (sempre segue a malha viária).
 */
export async function obterGeometriaRotaOsrm(
  coordsNaOrdem: RoteiroCoord[],
  perfilPreferido: OsrmPerfilViario | null,
  signal?: AbortSignal
): Promise<{ polyline: [number, number][]; pernasKm: number[]; totalKm: number; perfilUsado: OsrmPerfilViario } | null> {
  if (coordsNaOrdem.length < 2) return null;
  const perfis: OsrmPerfilViario[] = perfilPreferido
    ? [perfilPreferido, perfilPreferido === 'driving-hgv' ? 'driving' : 'driving-hgv']
    : ['driving-hgv', 'driving'];

  const n = coordsNaOrdem.length;
  const fechaNaBase =
    n >= 3 && mesmoParLatLng(coordsNaOrdem[0]!, coordsNaOrdem[n - 1]!);

  for (const perfil of perfis) {
    try {
      if (fechaNaBase) {
        const ida = coordsNaOrdem.slice(0, -1);
        const ultimaCidade = coordsNaOrdem[n - 2]!;
        const base = coordsNaOrdem[n - 1]!;
        const gIda = await osrmRouteUmaChamada(ida, perfil, signal);
        const gVolta = await osrmRouteUmaChamada([ultimaCidade, base], perfil, signal);
        if (gIda && gVolta) {
          const polyline = mergePolylines(gIda.polyline, gVolta.polyline);
          const pernasKm = [...gIda.pernasKm, ...gVolta.pernasKm];
          const totalKm = gIda.totalKm + gVolta.totalKm;
          if (polyline.length >= 2 && pernasKm.length > 0) {
            return { polyline, pernasKm, totalKm, perfilUsado: perfil };
          }
        }
      }

      const single = await osrmRouteUmaChamada(coordsNaOrdem, perfil, signal);
      if (single && single.pernasKm.length > 0) {
        return { ...single, perfilUsado: perfil };
      }
      if (single && single.polyline.length >= 2) {
        return { ...single, pernasKm: [single.totalKm], perfilUsado: perfil };
      }

      const porSeg = await osrmRoutePorSegmentos(coordsNaOrdem, perfil, signal);
      if (porSeg) {
        return { ...porSeg, perfilUsado: perfil };
      }
    } catch {
      /* próximo perfil */
    }
  }
  return null;
}

/** Custo do ciclo depósito (0) → ordem das cidades (índices 1..n-1) → depósito. */
function custoCicloDeposito(matrix: number[][], ordemCidadesIdx: number[]): number {
  if (ordemCidadesIdx.length === 0) return 0;
  let s = matrix[0]![ordemCidadesIdx[0]!]!;
  for (let i = 0; i < ordemCidadesIdx.length - 1; i++) {
    s += matrix[ordemCidadesIdx[i]!]![ordemCidadesIdx[i + 1]!]!;
  }
  s += matrix[ordemCidadesIdx[ordemCidadesIdx.length - 1]!]![0]!;
  return s;
}

/** Melhor ordem exata para até 9 cidades (9!); acima disso vizinho mais próximo + 2-opt. */
function melhorOrdemIndices(matrix: number[][], nCoords: number): number[] {
  const m = nCoords - 1;
  if (m <= 0) return [];
  const cidadeIdx = Array.from({ length: m }, (_, i) => i + 1);
  if (m > 9) {
    let tour = tourVizinhoMaisProximo(matrix);
    if (tour[0] !== 0) {
      const idx = tour.indexOf(0);
      if (idx > 0) tour = [...tour.slice(idx), ...tour.slice(0, idx)];
    }
    const semDepInicio = tour.filter((x, i) => !(x === 0 && i > 0));
    const ciclo = tourParaCicloFechado(semDepInicio);
    const otimizado = doisOptCiclo(ciclo, matrix);
    return otimizado.slice(1, -1);
  }
  let best = cidadeIdx.slice();
  let bestCost = Infinity;
  const rec = (prefix: number[], remaining: number[]) => {
    if (remaining.length === 0) {
      const cost = custoCicloDeposito(matrix, prefix);
      if (cost < bestCost) {
        bestCost = cost;
        best = prefix.slice();
      }
      return;
    }
    for (let i = 0; i < remaining.length; i++) {
      const next = remaining[i]!;
      rec(
        [...prefix, next],
        [...remaining.slice(0, i), ...remaining.slice(i + 1)]
      );
    }
  };
  rec([], cidadeIdx);
  return best;
}

/** Vizinho mais próximo a partir do índice 0 (depósito). */
function tourVizinhoMaisProximo(matrix: number[][]): number[] {
  const n = matrix.length;
  if (n <= 2) return n === 1 ? [0] : [0, 1];
  const visited = new Set<number>([0]);
  const tour: number[] = [0];
  let current = 0;
  while (visited.size < n) {
    let bestJ = -1;
    let bestD = Infinity;
    for (let j = 0; j < n; j++) {
      if (visited.has(j)) continue;
      const d = matrix[current]![j]!;
      if (d < bestD) {
        bestD = d;
        bestJ = j;
      }
    }
    if (bestJ < 0) break;
    visited.add(bestJ);
    tour.push(bestJ);
    current = bestJ;
  }
  return tour;
}

/** 2-opt em ciclo [0, …, 0] (primeiro e último são o depósito). */
function doisOptCiclo(tourClosed: number[], matrix: number[][]): number[] {
  const n = tourClosed.length;
  if (n < 4) return tourClosed;

  const dist = (t: number[]) => {
    let s = 0;
    for (let i = 0; i < t.length - 1; i++) s += matrix[t[i]!]![t[i + 1]!]!;
    return s;
  };

  let t = [...tourClosed];
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;
    for (let i = 1; i < n - 2; i++) {
      for (let k = i + 1; k < n - 1; k++) {
        const nt = [...t.slice(0, i), ...t.slice(i, k + 1).reverse(), ...t.slice(k + 1)];
        if (dist(nt) + 1e-6 < dist(t)) {
          t = nt;
          improved = true;
        }
      }
    }
  }
  return t;
}

function tourParaCicloFechado(tourFromDepot: number[]): number[] {
  if (tourFromDepot.length === 0) return [0, 0];
  if (tourFromDepot[0] !== 0) return [0, ...tourFromDepot.filter((x) => x !== 0), 0];
  const rest = tourFromDepot.slice(1);
  return [0, ...rest, 0];
}

export function resolverRoteiroDeposito(
  coords: RoteiroCoord[],
  matrixKm: number[][],
  usouOsrm: boolean,
  perfilOsrm: OsrmPerfilViario | null
): RoteiroResultado | null {
  if (coords.length < 2) return null;

  const ordemIndices = melhorOrdemIndices(matrixKm, coords.length);
  const otimizado = [0, ...ordemIndices, 0];

  const pernas: RoteiroLeg[] = [];
  for (let i = 0; i < otimizado.length - 1; i++) {
    const a = otimizado[i]!;
    const b = otimizado[i + 1]!;
    pernas.push({
      de: coords[a]!.label,
      para: coords[b]!.label,
      distanciaKm: matrixKm[a]![b]!,
    });
  }

  const retornoKm = pernas.length > 0 ? pernas[pernas.length - 1]!.distanciaKm : 0;
  const pernasSemRetorno = pernas.slice(0, -1);
  const totalKm = pernas.reduce((s, p) => s + p.distanciaKm, 0);

  return {
    ordemIndices,
    pernas: pernasSemRetorno,
    retornoKm,
    totalKm,
    usouOsrm,
    perfilOsrm,
  };
}

/** Coordenadas na ordem de visita (ida + volta ao depósito). */
export function coordsOrdemVisita(coords: RoteiroCoord[], resultado: RoteiroResultado): RoteiroCoord[] {
  const idxs = [0, ...resultado.ordemIndices, 0];
  return idxs.map((i) => coords[i]!);
}

/** Enriquece o resultado com geometria e pernas alinhadas ao traçado OSRM Route (quando possível). */
export async function enriquecerRotaComGeometriaOsrm(
  coords: RoteiroCoord[],
  resultado: RoteiroResultado,
  signal?: AbortSignal
): Promise<RoteiroResultado> {
  const naOrdem = coordsOrdemVisita(coords, resultado);
  const geo = await obterGeometriaRotaOsrm(naOrdem, resultado.perfilOsrm, signal);
  if (!geo) return resultado;

  const nSegs = naOrdem.length - 1;
  const legsOk = geo.pernasKm.length === nSegs && geo.pernasKm.length > 0;
  let pernasSemRetorno = resultado.pernas;
  let retornoKm = resultado.retornoKm;
  if (legsOk) {
    const pernas: RoteiroLeg[] = [];
    for (let i = 0; i < geo.pernasKm.length; i++) {
      pernas.push({
        de: naOrdem[i]!.label,
        para: naOrdem[i + 1]!.label,
        distanciaKm: geo.pernasKm[i]!,
      });
    }
    retornoKm = geo.pernasKm[geo.pernasKm.length - 1]!;
    pernasSemRetorno = pernas.slice(0, -1);
  }

  return {
    ...resultado,
    pernas: pernasSemRetorno,
    retornoKm,
    totalKm: geo.totalKm > 0 ? geo.totalKm : resultado.totalKm,
    mapaPolyline: geo.polyline.length >= 2 ? geo.polyline : resultado.mapaPolyline,
    perfilOsrm: geo.perfilUsado,
  };
}
