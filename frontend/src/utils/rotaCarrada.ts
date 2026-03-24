/** Rotas definidas pela consulta SQL do Gerenciador — não entram na replicação por carrada. */
export const EXCLUDED_SQL_ROTA_CATEGORIES = new Set([
  'retirada na so aco',
  'retirada na so moveis',
  'entrega grande teresina',
  'inserir em romaneio',
  'requisicao',
]);

export function normalizeRotaNameStr(dm: string): string {
  return dm.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export function isExcludedSqlRotaCategory(dm: string): boolean {
  return EXCLUDED_SQL_ROTA_CATEGORIES.has(normalizeRotaNameStr(dm));
}

/** Carrada = rota que começa com "ROTA " (após normalização). */
export function isCarradaRota(rota?: string | null): boolean {
  const n = (rota ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return n.startsWith('rota ');
}

export function rotaFromPedidoRow(row: Record<string, unknown>): string {
  return String(row['Observacoes'] ?? row['Observações'] ?? row['Rota'] ?? row['rota'] ?? '').trim();
}

export function normalizePdLabelForCompare(pd: string): string {
  const s = String(pd ?? '').trim();
  const digits = s.replace(/\D+/g, '');
  return digits || s;
}
