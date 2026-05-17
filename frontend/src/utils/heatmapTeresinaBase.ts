import type { MapaMunicipioItem } from '../api/pedidos';
import { PONTO_RETORNO_TERESINA } from './heatmapRoteirizador';

export function normalizarNomeMunicipio(s: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** Município Teresina/PI no mapa (base da rota; não conta como parada extra). */
export function isTeresinaMapaItem(item: MapaMunicipioItem): boolean {
  const m = normalizarNomeMunicipio(item.municipio);
  const uf = (item.uf || '').trim().toUpperCase();
  return m === 'teresina' && uf === 'PI';
}

export function labelTeresinaBase(): string {
  return PONTO_RETORNO_TERESINA.label;
}
