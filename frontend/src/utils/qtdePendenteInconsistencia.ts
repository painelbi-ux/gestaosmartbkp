import type { Pedido } from '../api/pedidos';

export type GrupoInconsistenciaQtdePendente = {
  /** Chave interna PD|COD */
  key: string;
  pdLabel: string;
  cod: string;
  pendenteItem: number;
  somaQtdePendenteReal: number;
  linhas: Pedido[];
};

function getPdRaw(p: Pedido): string {
  const v = p['PD'] ?? p['pd'];
  return v != null ? String(v).trim() : '';
}

function getCodRaw(p: Pedido): string {
  const v = p['Cod'] ?? p['cod'];
  return v != null ? String(v).trim() : '';
}

function normalizePdDigits(pd: string): string {
  const s = String(pd ?? '').trim();
  const digits = s.replace(/\D+/g, '');
  return digits || s;
}

/**
 * Mesmo item de pedido em várias rotas/romaneios: soma de "Qtde Pendente Real" não pode
 * ultrapassar "Pendente" (quantidade pendente do item no pedido no ERP).
 */
export function analisarInconsistenciaQtdePendenteReal(pedidos: Pedido[]): {
  grupos: GrupoInconsistenciaQtdePendente[];
  linhasAfetadas: Pedido[];
} {
  const map = new Map<string, Pedido[]>();
  for (const p of pedidos) {
    const pd = getPdRaw(p);
    const cod = getCodRaw(p);
    if (!pd || !cod) continue;
    const key = `${normalizePdDigits(pd)}|${cod.toUpperCase()}`;
    const arr = map.get(key) ?? [];
    arr.push(p);
    map.set(key, arr);
  }

  const grupos: GrupoInconsistenciaQtdePendente[] = [];
  for (const [key, linhas] of map) {
    if (linhas.length === 0) continue;
    let soma = 0;
    for (const r of linhas) {
      const q = Number(r['Qtde Pendente Real'] ?? r['Qtde pendente real']);
      if (Number.isFinite(q) && q >= 0) soma += q;
    }
    const pendVals = linhas
      .map((r) => Number(r['Pendente'] ?? r['pendente']))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (pendVals.length === 0) continue;
    const pendenteItem = Math.min(...pendVals);
    if (!Number.isFinite(pendenteItem)) continue;
    if (soma > pendenteItem + 1e-6) {
      grupos.push({
        key,
        pdLabel: getPdRaw(linhas[0]!) || key.split('|')[0]!,
        cod: getCodRaw(linhas[0]!) || key.split('|')[1]!,
        pendenteItem,
        somaQtdePendenteReal: soma,
        linhas,
      });
    }
  }

  const seen = new Set<string>();
  const linhasAfetadas: Pedido[] = [];
  for (const g of grupos) {
    for (const r of g.linhas) {
      const id = String(r.id_pedido ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      linhasAfetadas.push(r);
    }
  }

  return { grupos, linhasAfetadas };
}

export function resumoTooltipInconsistencia(grupos: GrupoInconsistenciaQtdePendente[]): string {
  if (grupos.length === 0) {
    return 'Nenhuma inconsistência: em cada combinação pedido + código, a soma das quantidades pendentes reais por rota não ultrapassa a quantidade pendente do item.';
  }
  const linhas = grupos
    .slice(0, 5)
    .map(
      (g) =>
        `${g.pdLabel} · ${g.cod}: soma ${g.somaQtdePendenteReal} un. nas rotas > ${g.pendenteItem} un. pendentes do item.`
    )
    .join('\n');
  const mais = grupos.length > 5 ? `\n… e mais ${grupos.length - 5} caso(s).` : '';
  return (
    'Inconsistência detectada (parcial no faturamento entre rotas):\n' +
    linhas +
    mais +
    '\n\nClique no ícone para listar só as linhas envolvidas.'
  );
}
