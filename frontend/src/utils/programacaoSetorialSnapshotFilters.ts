/**
 * Filtra linhas do snapshot com as mesmas regras do gerador (`filterByRules` em ProgramacaoSetorialPage).
 */

import { isRecursoPcp } from './programacaoSetorialRecursoPcp';

export type SnapshotLinhaFiltravel = {
  observacoes?: string;
  previsao?: string;
  pd?: string;
  cod?: string;
  descricao?: string;
  setor?: string;
  /** Minúsculo (JSON salvo pelo gerador). */
  recurso?: string;
  /** Compat.: JSON antigo ou cópia literal do ERP. */
  Recurso?: string;
  qtyToProduce?: number;
};

function recursoDaLinha(item: SnapshotLinhaFiltravel): string {
  return String(item.recurso ?? item.Recurso ?? '');
}

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function parsePtBrDateSafe(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date(0);
  const s = String(dateStr).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mm = Number(m[2]);
    const y = Number(m[3]);
    const dt = new Date(y, mm - 1, d);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) {
    const y = Number(m2[1]);
    const mm = Number(m2[2]);
    const d = Number(m2[3]);
    const dt = new Date(y, mm - 1, d);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? new Date(0) : dt;
}

function isWithinInterval(date: Date, start: Date, end: Date): boolean {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

/**
 * @param startDate/endDate — `yyyy-mm-dd` ou vazio (sem filtro de data)
 */
export function filterSnapshotLinhasByRules(
  linhas: SnapshotLinhaFiltravel[],
  sector: string,
  startDate: string,
  endDate: string,
): SnapshotLinhaFiltravel[] {
  let result = [...linhas];

  if (startDate && endDate) {
    const s = parsePtBrDateSafe(startDate);
    const e = parsePtBrDateSafe(endDate);
    result = result.filter((item) => {
      const itemDate = parsePtBrDateSafe(item.previsao);
      if (itemDate.getTime() === 0) return false;
      return isWithinInterval(itemDate, s, e);
    });
  }

  if (sector !== 'Geral') {
    if (sector === 'Corte e Dobra') {
      result = result.filter((item) => isRecursoPcp(recursoDaLinha(item)));
    } else {
      result = result.filter((item) => String(item.setor ?? '') === sector);
    }

    const desc = (item: SnapshotLinhaFiltravel) => String(item.descricao || '').toLowerCase();
    const sectorNorm = normalize(sector);

    if (sectorNorm === 'outros') {
      result = result.filter((item) => !desc(item).includes('estante'));
    } else if (sectorNorm === 'nao considerar na meta') {
      result = result.filter((item) => !desc(item).includes('coluna para estante') && !desc(item).includes('compensado'));
    } else if (sectorNorm.includes('porta-palete') || sectorNorm.includes('porta palete')) {
      result = result.filter((item) => !desc(item).toUpperCase().startsWith('PORTA PALETE'));
    }
  }

  return result;
}
