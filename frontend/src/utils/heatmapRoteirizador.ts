/** Ponto de retorno / base padrão para entregas na região. */
export const PONTO_RETORNO_TERESINA = {
  lat: -5.0892,
  lng: -42.8019,
  label: 'Teresina, PI',
} as const;

const ROAD_FACTOR_HAVERSINE = 1.22;

export type RoteiroNivel = 'ok' | 'atencao' | 'pesado';

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
  /** Distâncias obtidas via OSRM (estrada); se false, estimativa Haversine × fator. */
  usouOsrm: boolean;
  /** Tempo aproximado em trânsito (50 km/h média em trechos mistos). */
  horasEstimadas: number;
  insight: {
    nivel: RoteiroNivel;
    titulo: string;
    linhas: string[];
    kmPorParada: number;
    /** Total rota / (soma das distâncias em linha reta entre paradas consecutivas na mesma ordem). >1.4 indica trechos sinuosos ou desvio natural. */
    fatorVsLinhaReta: number;
  };
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

/** Matriz de distâncias em km (simétrica). */
export async function obterMatrizDistanciasKm(
  coords: RoteiroCoord[],
  signal?: AbortSignal
): Promise<{ matrixKm: number[][]; usouOsrm: boolean }> {
  if (coords.length <= 1) {
    return { matrixKm: [[0]], usouOsrm: false };
  }
  if (coords.length > 25) {
    return { matrixKm: buildHaversineMatrixKm(coords), usouOsrm: false };
  }
  const lonLat = coords.map((c) => `${c.lng},${c.lat}`).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${lonLat}?annotations=distance`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { distances?: number[][] };
    const dm = data.distances;
    if (!dm || dm.length !== coords.length) throw new Error('matrix');
    const matrixKm = dm.map((row) => row.map((meters) => (Number(meters) > 0 ? meters / 1000 : 0)));
    return { matrixKm, usouOsrm: true };
  } catch {
    return { matrixKm: buildHaversineMatrixKm(coords), usouOsrm: false };
  }
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
  usouOsrm: boolean
): RoteiroResultado | null {
  if (coords.length < 2) return null;

  let tour = tourVizinhoMaisProximo(matrixKm);
  if (tour[0] !== 0) {
    const idx = tour.indexOf(0);
    if (idx > 0) tour = [...tour.slice(idx), ...tour.slice(0, idx)];
  }
  const semDepInicio = tour.filter((x, i) => !(x === 0 && i > 0));
  const ciclo = tourParaCicloFechado(semDepInicio);
  const otimizado = doisOptCiclo(ciclo, matrixKm);

  const ordemIndices = otimizado.slice(1, -1);

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
  const horasEstimadas = totalKm / 50;

  let somaLinhaReta = 0;
  for (let i = 0; i < otimizado.length - 1; i++) {
    const a = otimizado[i]!;
    const b = otimizado[i + 1]!;
    somaLinhaReta += haversineKm(coords[a]!.lat, coords[a]!.lng, coords[b]!.lat, coords[b]!.lng);
  }
  const fatorVsLinhaReta = somaLinhaReta > 0 ? totalKm / somaLinhaReta : 1;
  const nCidades = ordemIndices.length;
  const kmPorParada = nCidades > 0 ? totalKm / nCidades : totalKm;

  const insight = gerarInsight({
    nCidades,
    totalKm,
    kmPorParada,
    fatorVsLinhaReta,
    horasEstimadas,
    usouOsrm,
  });

  return {
    ordemIndices,
    pernas: pernasSemRetorno,
    retornoKm,
    totalKm,
    usouOsrm,
    horasEstimadas,
    insight,
  };
}

function gerarInsight(p: {
  nCidades: number;
  totalKm: number;
  kmPorParada: number;
  fatorVsLinhaReta: number;
  horasEstimadas: number;
  usouOsrm: boolean;
}): RoteiroResultado['insight'] {
  const linhas: string[] = [];
  let nivel: RoteiroNivel = 'ok';
  let titulo = 'Rota equilibrada para o conjunto';

  if (p.nCidades === 0) {
    return {
      nivel: 'ok',
      titulo: 'Selecione cidades no mapa',
      linhas: [],
      kmPorParada: 0,
      fatorVsLinhaReta: 1,
    };
  }

  if (p.totalKm > 1100) {
    nivel = 'pesado';
    titulo = 'Distância total muito elevada';
    linhas.push('Considere dividir em duas ou mais rotas ou revisar o conjunto de cidades.');
  } else if (p.totalKm > 700) {
    nivel = 'atencao';
    titulo = 'Viagem longa';
    linhas.push('Dia de rota exigente: avalie descanso do motorista e janela de entrega.');
  }

  if (p.kmPorParada > 220 && p.nCidades >= 2) {
    if (nivel === 'ok') nivel = 'atencao';
    titulo = 'Trechos longos entre paradas';
    linhas.push('Média alta de km por cidade — pernas podem cansar equipe e aumentar risco de atraso.');
  }

  if (p.fatorVsLinhaReta > 1.55) {
    if (nivel === 'ok') nivel = 'atencao';
    linhas.push(
      'A rota em estrada é bem mais longa que o “atalho” em linha reta entre as paradas: terreno sinuoso ou desvio natural de rodovias.'
    );
  } else if (p.fatorVsLinhaReta < 1.12 && p.nCidades >= 3) {
    linhas.push('Trajetória relativamente “direta” entre as paradas — bom aproveitamento geográfico.');
  }

  if (p.horasEstimadas > 10) {
    nivel = 'pesado';
    titulo = 'Muitas horas de estrada estimadas';
    linhas.push('Acima de ~10 h de rolagem (estimativa bruta) costuma inviabilizar uma única janela útil de entrega.');
  } else if (p.horasEstimadas > 7) {
    if (nivel !== 'pesado') nivel = 'atencao';
    linhas.push('Planeje paradas e abastecimento; verifique conformidade com jornada.');
  }

  if (p.nCidades > 12) {
    if (nivel === 'ok') nivel = 'atencao';
    linhas.push('Muitas paradas num único dia aumenta sensibilidade a imprevistos (trânsito, cliente ausente).');
  }

  if (!p.usouOsrm) {
    linhas.push('Distâncias por estimativa (linha reta × fator). Conecte-se à internet para tentar cálculo por estrada (OSRM).');
  } else {
    linhas.push('Distâncias por matriz de estrada (OSRM — referência pública).');
  }

  if (linhas.length === 0) {
    linhas.push('Volume e dispersão parecem razoáveis para uma rota de entrega em um dia, sujeito à operação real.');
  }

  return { nivel, titulo, linhas: [...new Set(linhas)], kmPorParada: p.kmPorParada, fatorVsLinhaReta: p.fatorVsLinhaReta };
}
