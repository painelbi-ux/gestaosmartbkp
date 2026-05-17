import type { MapaMunicipioItem } from '../api/pedidos';
import {
  labelRotaParada,
  totalVendaMunicipioOriginal,
  totalVendaMunicipioSimulado,
  vendaPorLabelComExclusoes,
  totalVendaRoteiroComExclusoes,
  simulacaoCargaAtiva,
  type AjustesQtdeSimulacao,
  type SelecionadoComChave,
} from './heatmapRoteiroSimulacao';

export type { SelecionadoComChave } from './heatmapRoteiroSimulacao';
export {
  chaveLinhaAgregada,
  chaveExclusaoSimulacao,
  agregarDetalhesPorPedidoRota,
  totalVendaMunicipioSimulado,
  totalVendaMunicipioOriginal,
  valorExcluidoMunicipio,
  contagemExclusoesMunicipio,
  vendaPorLabelComExclusoes,
  totalVendaRoteiroComExclusoes,
  totalVendaRoteiroOriginal,
  totalExcluidoRoteiro,
  limparExclusoesMunicipio,
  limparAjustesQtdeMunicipio,
  valorVendaEfetivoLinha,
  getPendenteConsiderar,
  getQtdePendenteReal,
} from './heatmapRoteiroSimulacao';

export type { AjustesQtdeSimulacao } from './heatmapRoteiroSimulacao';

export function fmtKmRoteiro(km: number): string {
  return `${km.toFixed(1)} km`;
}

export function fmtBrlRoteiro(v: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

/** Mesma agregação do popup de município (pedido|rota|rm) → soma da coluna «Venda». */
export function totalVendaComoPopupDetalhes(
  item: MapaMunicipioItem,
  exclusoes?: ReadonlySet<string>,
  municipioChave?: string,
  ajustes?: AjustesQtdeSimulacao
): number {
  const detalhes = item.detalhes ?? [];
  if (municipioChave && simulacaoCargaAtiva(exclusoes ?? new Set(), ajustes)) {
    return totalVendaMunicipioSimulado(detalhes, municipioChave, exclusoes ?? new Set(), ajustes);
  }
  if (detalhes.length === 0) return item.valorPendente ?? 0;
  return totalVendaMunicipioOriginal(detalhes);
}

export function vendaPorLabelSelecionados(
  selecionados: SelecionadoComChave[],
  exclusoes?: ReadonlySet<string>,
  ajustes?: AjustesQtdeSimulacao
): Map<string, number> {
  if (simulacaoCargaAtiva(exclusoes ?? new Set(), ajustes)) {
    return vendaPorLabelComExclusoes(selecionados, exclusoes ?? new Set(), ajustes);
  }
  const m = new Map<string, number>();
  for (const { item, chave } of selecionados) {
    m.set(labelRotaParada(item), totalVendaComoPopupDetalhes(item, undefined, chave, ajustes));
  }
  return m;
}

export function totalVendaSelecionados(
  selecionados: SelecionadoComChave[],
  exclusoes?: ReadonlySet<string>,
  ajustes?: AjustesQtdeSimulacao
): number {
  if (simulacaoCargaAtiva(exclusoes ?? new Set(), ajustes)) {
    return totalVendaRoteiroComExclusoes(selecionados, exclusoes ?? new Set(), ajustes);
  }
  return selecionados.reduce(
    (s, { item, chave }) => s + totalVendaComoPopupDetalhes(item, undefined, chave, ajustes),
    0
  );
}
