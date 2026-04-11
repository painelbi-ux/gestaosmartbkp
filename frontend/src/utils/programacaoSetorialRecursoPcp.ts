function norm(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

/**
 * Indica se o atributo Recurso (produto / linha) corresponde a PCP para o setor virtual "Corte e Dobra".
 * Aceita "PCP", variações de caixa e prefixo antes de separador (ex.: "PCP - Corte").
 */
export function isRecursoPcp(val: string | null | undefined): boolean {
  const s = norm(String(val ?? ''));
  if (!s) return false;
  if (s === 'pcp') return true;
  const first = (s.split(/[\s\-–—:]+/)[0] ?? '').trim();
  return first === 'pcp';
}
