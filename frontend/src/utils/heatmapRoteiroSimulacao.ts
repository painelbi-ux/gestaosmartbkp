import type { MapaMunicipioItem, TooltipDetalheRow } from '../api/pedidos';

/** Chave de linha agregada (pedido + carrada/rota + rm), igual ao popup do mapa. */
export function chaveLinhaAgregada(row: TooltipDetalheRow): string {
  const pedido = String(row.pedido ?? '').trim() || `_${row.codigo ?? ''}_${row.produto ?? ''}`;
  const rota = (row.rota ?? '').trim();
  const rm = (row.rm ?? '').trim();
  return `${pedido}|${rota}|${rm}`;
}

/** Chave de exclusão por item de pedido (fase 3: código + produto). */
export function chaveExclusaoItem(municipioChave: string, row: TooltipDetalheRow): string {
  const pedido = String(row.pedido ?? '').trim() || `_${row.codigo ?? ''}_${row.produto ?? ''}`;
  const rota = (row.rota ?? '').trim();
  const rm = (row.rm ?? '').trim();
  const codigo = String(row.codigo ?? '').trim();
  const produto = String(row.produto ?? '').trim();
  return `${municipioChave}::${pedido}|${rota}|${rm}|${codigo}|${produto}`;
}

/** @deprecated Use chaveExclusaoItem — mantido para migração de chaves antigas. */
export function chaveExclusaoSimulacao(municipioChave: string, linhaKey: string): string {
  return `${municipioChave}::${linhaKey}`;
}

export function limparExclusoesMunicipio(exclusoes: ReadonlySet<string>, municipioChave: string): Set<string> {
  const prefix = `${municipioChave}::`;
  const next = new Set(exclusoes);
  for (const k of next) {
    if (k.startsWith(prefix)) next.delete(k);
  }
  return next;
}

export type AjustesQtdeSimulacao = ReadonlyMap<string, number>;

export function limparAjustesQtdeMunicipio(
  ajustes: ReadonlyMap<string, number>,
  municipioChave: string
): Map<string, number> {
  const prefix = `${municipioChave}::`;
  const next = new Map(ajustes);
  for (const k of next.keys()) {
    if (k.startsWith(prefix)) next.delete(k);
  }
  return next;
}

export function getQtdePendenteReal(row: TooltipDetalheRow): number {
  const n = row.qtdePendenteReal;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function getPendenteConsiderar(
  row: TooltipDetalheRow,
  municipioChave: string,
  ajustes?: AjustesQtdeSimulacao
): number {
  const real = getQtdePendenteReal(row);
  const key = chaveExclusaoItem(municipioChave, row);
  const ajustado = ajustes?.get(key);
  if (ajustado !== undefined && Number.isFinite(ajustado)) {
    return Math.max(0, ajustado);
  }
  return real;
}

/** Valor de Venda proporcional à quantidade considerada na simulação. */
export function valorVendaEfetivoLinha(
  row: TooltipDetalheRow,
  municipioChave: string,
  ajustes?: AjustesQtdeSimulacao
): number {
  const base = row.valorPendente ?? 0;
  const qtdeReal = getQtdePendenteReal(row);
  if (qtdeReal <= 0) return base;
  const qtdeCons = getPendenteConsiderar(row, municipioChave, ajustes);
  if (Math.abs(qtdeCons - qtdeReal) < 1e-9) return base;
  return base * (qtdeCons / qtdeReal);
}

export type LinhaAgregadaRoteiro = TooltipDetalheRow & { linhaKey: string };

export type LinhaItemRoteiro = TooltipDetalheRow & { itemKey: string };

export function listarItensDetalhe(detalhesBruto: TooltipDetalheRow[]): LinhaItemRoteiro[] {
  return detalhesBruto.map((row) => ({
    ...row,
    itemKey: chaveLinhaAgregada(row) + `|${String(row.codigo ?? '').trim()}|${String(row.produto ?? '').trim()}`,
  }));
}

/** Uma linha por (pedido + rota + rm) com soma de Venda. */
export function agregarDetalhesPorPedidoRota(detalhesBruto: TooltipDetalheRow[]): LinhaAgregadaRoteiro[] {
  if (detalhesBruto.length === 0) return [];
  const by = new Map<string, LinhaAgregadaRoteiro>();
  for (const row of detalhesBruto) {
    const linhaKey = chaveLinhaAgregada(row);
    const existing = by.get(linhaKey);
    if (existing) {
      existing.valorPendente += row.valorPendente ?? 0;
    } else {
      by.set(linhaKey, { ...row, valorPendente: row.valorPendente ?? 0, linhaKey });
    }
  }
  return [...by.values()];
}

export function itemEstaExcluido(
  municipioChave: string,
  row: TooltipDetalheRow,
  exclusoes: ReadonlySet<string>
): boolean {
  if (exclusoes.has(chaveExclusaoItem(municipioChave, row))) return true;
  const legado = chaveExclusaoSimulacao(municipioChave, chaveLinhaAgregada(row));
  return exclusoes.has(legado);
}

/** Total Venda do município respeitando exclusões e ajustes de quantidade. */
export function totalVendaMunicipioSimulado(
  detalhesBruto: TooltipDetalheRow[],
  municipioChave: string,
  exclusoes: ReadonlySet<string>,
  ajustes?: AjustesQtdeSimulacao
): number {
  if (detalhesBruto.length === 0) return 0;
  let s = 0;
  for (const row of detalhesBruto) {
    if (!itemEstaExcluido(municipioChave, row, exclusoes)) {
      s += valorVendaEfetivoLinha(row, municipioChave, ajustes);
    }
  }
  return s;
}

/** Total original (sem exclusões). */
export function totalVendaMunicipioOriginal(detalhesBruto: TooltipDetalheRow[]): number {
  return detalhesBruto.reduce((s, r) => s + (r.valorPendente ?? 0), 0);
}

export function valorExcluidoMunicipio(
  detalhesBruto: TooltipDetalheRow[],
  municipioChave: string,
  exclusoes: ReadonlySet<string>,
  ajustes?: AjustesQtdeSimulacao
): number {
  const orig = totalVendaMunicipioOriginal(detalhesBruto);
  const sim = totalVendaMunicipioSimulado(detalhesBruto, municipioChave, exclusoes, ajustes);
  return Math.max(0, orig - sim);
}

export function contagemExclusoesMunicipio(
  detalhesBruto: TooltipDetalheRow[],
  municipioChave: string,
  exclusoes: ReadonlySet<string>
): number {
  return detalhesBruto.filter((r) => itemEstaExcluido(municipioChave, r, exclusoes)).length;
}

export type SelecionadoComChave = { item: MapaMunicipioItem; chave: string };

export function labelRotaParada(item: MapaMunicipioItem): string {
  return `${item.municipio}${item.uf ? `, ${item.uf}` : ''}`;
}

export function vendaPorLabelComExclusoes(
  selecionados: SelecionadoComChave[],
  exclusoes: ReadonlySet<string>,
  ajustes?: AjustesQtdeSimulacao
): Map<string, number> {
  const m = new Map<string, number>();
  for (const { item, chave } of selecionados) {
    m.set(labelRotaParada(item), totalVendaMunicipioSimulado(item.detalhes ?? [], chave, exclusoes, ajustes));
  }
  return m;
}

export function totalVendaRoteiroComExclusoes(
  selecionados: SelecionadoComChave[],
  exclusoes: ReadonlySet<string>,
  ajustes?: AjustesQtdeSimulacao
): number {
  return selecionados.reduce(
    (s, { item, chave }) => s + totalVendaMunicipioSimulado(item.detalhes ?? [], chave, exclusoes, ajustes),
    0
  );
}

export function totalVendaRoteiroOriginal(selecionados: SelecionadoComChave[]): number {
  return selecionados.reduce((s, { item }) => s + totalVendaMunicipioOriginal(item.detalhes ?? []), 0);
}

export function totalExcluidoRoteiro(
  selecionados: SelecionadoComChave[],
  exclusoes: ReadonlySet<string>,
  ajustes?: AjustesQtdeSimulacao
): number {
  return selecionados.reduce(
    (s, { item, chave }) => s + valorExcluidoMunicipio(item.detalhes ?? [], chave, exclusoes, ajustes),
    0
  );
}

export function simulacaoCargaAtiva(
  exclusoes: ReadonlySet<string>,
  ajustes?: AjustesQtdeSimulacao
): boolean {
  return exclusoes.size > 0 || (ajustes?.size ?? 0) > 0;
}
