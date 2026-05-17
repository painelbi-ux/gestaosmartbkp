import type { MapaMunicipioItem } from '../api/pedidos';

export const ROTULO_SEM_ROTA = '(sem rota)';

export type ItemMapaRoteiro = {
  chave: string;
  municipio: string;
  uf: string;
  rotas: Set<string>;
};

export function rotasDoItem(detalhes: MapaMunicipioItem['detalhes']): Set<string> {
  const s = new Set<string>();
  for (const d of detalhes ?? []) {
    const r = (d.rota ?? '').trim();
    s.add(r || ROTULO_SEM_ROTA);
  }
  if (s.size === 0) s.add(ROTULO_SEM_ROTA);
  return s;
}

export function indexarItensMapaRoteiro(
  itens: { item: MapaMunicipioItem; chave: string }[]
): ItemMapaRoteiro[] {
  return itens.map(({ item, chave }) => ({
    chave,
    municipio: (item.municipio ?? '').trim(),
    uf: (item.uf ?? '').trim().toUpperCase(),
    rotas: rotasDoItem(item.detalhes),
  }));
}

function itemAtendeRotas(item: ItemMapaRoteiro, rotasSel: ReadonlySet<string>): boolean {
  if (rotasSel.size === 0) return true;
  for (const r of item.rotas) {
    if (rotasSel.has(r)) return true;
  }
  return false;
}

function itemAtendeUfs(item: ItemMapaRoteiro, ufsSel: ReadonlySet<string>): boolean {
  if (ufsSel.size === 0) return true;
  return ufsSel.has(item.uf);
}

function itemAtendeMunicipios(item: ItemMapaRoteiro, munSel: ReadonlySet<string>): boolean {
  if (munSel.size === 0) return true;
  return munSel.has(item.chave);
}

export function filtrarItensMapaRoteiro(
  itens: ItemMapaRoteiro[],
  rotasSel: ReadonlySet<string>,
  ufsSel: ReadonlySet<string>,
  municipiosSel: ReadonlySet<string>
): ItemMapaRoteiro[] {
  return itens.filter(
    (it) =>
      itemAtendeRotas(it, rotasSel) &&
      itemAtendeUfs(it, ufsSel) &&
      itemAtendeMunicipios(it, municipiosSel)
  );
}

/** Opções de UF ainda válidas dado o recorte de rotas. */
export function ufsDisponiveis(itens: ItemMapaRoteiro[], rotasSel: ReadonlySet<string>): string[] {
  const ufs = new Set<string>();
  for (const it of itens) {
    if (itemAtendeRotas(it, rotasSel)) ufs.add(it.uf);
  }
  return [...ufs].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Municípios (chave) ainda válidos dado rotas + UFs. */
export function municipiosDisponiveis(
  itens: ItemMapaRoteiro[],
  rotasSel: ReadonlySet<string>,
  ufsSel: ReadonlySet<string>
): ItemMapaRoteiro[] {
  return itens.filter((it) => itemAtendeRotas(it, rotasSel) && itemAtendeUfs(it, ufsSel));
}

export function rotasUnicas(itens: ItemMapaRoteiro[]): string[] {
  const s = new Set<string>();
  for (const it of itens) {
    for (const r of it.rotas) s.add(r);
  }
  return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
}

export function labelMunicipio(item: ItemMapaRoteiro): string {
  return item.uf ? `${item.municipio}/${item.uf}` : item.municipio;
}

/** Remove seleções que deixaram de ser válidas após mudar filtro superior. */
export function restringirSelecoes(
  ufsSel: Set<string>,
  municipiosSel: Set<string>,
  itens: ItemMapaRoteiro[],
  rotasSel: ReadonlySet<string>
): { ufsSel: Set<string>; municipiosSel: Set<string> } {
  const ufsOk = ufsDisponiveis(itens, rotasSel);
  const ufsSet = new Set([...ufsSel].filter((u) => ufsOk.includes(u)));
  const munOk = municipiosDisponiveis(itens, rotasSel, ufsSet);
  const munSet = new Set([...municipiosSel].filter((k) => munOk.some((m) => m.chave === k)));
  return { ufsSel: ufsSet, municipiosSel: munSet };
}
