/** Lista todos os períodos (YYYY-MM-DD ou YYYY-MM) entre as datas inclusivas. */

function parseLocalDate(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function listarPeriodosDfc(
  dataInicio: string,
  dataFim: string,
  granularidade: 'dia' | 'mes'
): string[] {
  const ini = parseLocalDate(dataInicio);
  const fim = parseLocalDate(dataFim);
  if (!ini || !fim || fim < ini) return [];

  if (granularidade === 'mes') {
    const out: string[] = [];
    const cur = new Date(ini.getFullYear(), ini.getMonth(), 1);
    const endM = new Date(fim.getFullYear(), fim.getMonth(), 1);
    while (cur <= endM) {
      out.push(monthKey(cur));
      cur.setMonth(cur.getMonth() + 1);
    }
    return out;
  }

  const out: string[] = [];
  const cur = new Date(ini);
  while (cur <= fim) {
    out.push(dayKey(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function rotuloPeriodoCabecalho(periodo: string, granularidade: 'dia' | 'mes'): string {
  if (granularidade === 'mes') {
    const [y, mo] = periodo.split('-');
    if (y && mo) return `${mo}/${y}`;
    return periodo;
  }
  const [y, mo, d] = periodo.split('-');
  if (y && mo && d) return `${d}/${mo}/${y}`;
  return periodo;
}
