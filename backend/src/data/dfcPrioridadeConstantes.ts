/**
 * DFC — Constantes/tipos da classificação de prioridade de pagamento.
 * Valores numéricos persistidos no banco local; rótulos para UI/back end.
 */

export const DFC_PRIORIDADE = {
  PRIORITARIO: 1,
  REPROGRAMAR_30: 2,
  REPROGRAMAR_INDEFINIDO: 3,
  NAO_PAGAR: 4,
} as const;

export type DfcPrioridade = (typeof DFC_PRIORIDADE)[keyof typeof DFC_PRIORIDADE];

export const DFC_PRIORIDADES_VALIDAS: readonly DfcPrioridade[] = [
  DFC_PRIORIDADE.PRIORITARIO,
  DFC_PRIORIDADE.REPROGRAMAR_30,
  DFC_PRIORIDADE.REPROGRAMAR_INDEFINIDO,
  DFC_PRIORIDADE.NAO_PAGAR,
];

export const DFC_PRIORIDADE_LABEL: Record<DfcPrioridade, string> = {
  [DFC_PRIORIDADE.PRIORITARIO]: 'Pagamento Prioritário',
  [DFC_PRIORIDADE.REPROGRAMAR_30]: 'Reprogramar Vencimento +30 dias',
  [DFC_PRIORIDADE.REPROGRAMAR_INDEFINIDO]: 'Reprogramar Vencimento Indefinido',
  [DFC_PRIORIDADE.NAO_PAGAR]: 'Não realizar pagamento',
};

/** 'A' = agendamentofinanceiro.id ; 'L' = lancamentofinanceiro.id (Nomus). */
export type DfcTipoRefLancamento = 'A' | 'L';

export function ehDfcPrioridadeValida(n: unknown): n is DfcPrioridade {
  return typeof n === 'number' && DFC_PRIORIDADES_VALIDAS.includes(n as DfcPrioridade);
}

export function ehTipoRefValido(s: unknown): s is DfcTipoRefLancamento {
  return s === 'A' || s === 'L';
}
