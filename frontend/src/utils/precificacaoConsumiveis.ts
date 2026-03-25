import type { PrecificacaoItemRow } from '../api/engenharia';

/** Famílias de produto (Nomus) que entram na base dos consumíveis Fosfatização / Gás GLP / Solda. */
export const FAMILIAS_BASE_CONSUMIVEIS_MARKUP = new Set([65, 70, 106]);

export function normalizarCodigoConsumivel(c: string | null | undefined): string {
  return (c ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

export type TipoConsumivelEspecial = 'sucata' | 'solda' | 'gasGlp' | 'fosfatizacao';

export function tipoConsumivelEspecialPorCodigo(cod: string | null | undefined): TipoConsumivelEspecial | null {
  const n = normalizarCodigoConsumivel(cod);
  if (n === 'SUB 0001') return 'sucata';
  if (n === 'MUC 4377') return 'solda';
  if (n === 'MP 1309') return 'gasGlp';
  if (n === 'MUC 4378') return 'fosfatizacao';
  return null;
}

export function isComponenteConsumivelCalculadoMarkup(item: PrecificacaoItemRow): boolean {
  return tipoConsumivelEspecialPorCodigo(item.codigocomponente) != null;
}

function normalizarTipoMaterial(v: string | null | undefined): 'Matéria Prima' | 'Material Secundário' | 'Embalagem' {
  const s = String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (s.includes('embalag')) return 'Embalagem';
  if (s.includes('secund')) return 'Material Secundário';
  if (s.includes('materia prima') || s.includes('prima')) return 'Matéria Prima';
  return 'Matéria Prima';
}

function parseMarkupPercent(raw: string | undefined): number {
  const v = String(raw ?? '').trim();
  if (!v) return 0;
  const normalized = v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : v;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Recalcula valor total (e zera unitário) dos itens SUB 0001, MUC 4377, MP 1309, MUC 4378
 * conforme percentuais do Markup e somatórios de Matéria Prima (exclui secundário/embalagem e os próprios códigos especiais).
 */
export function aplicarCalculoConsumiveisEspeciais(
  itens: PrecificacaoItemRow[],
  markupValores: Record<string, string>
): PrecificacaoItemRow[] {
  const pSucata = parseMarkupPercent(markupValores.sucata);
  const pSolda = parseMarkupPercent(markupValores.solda);
  const pGas = parseMarkupPercent(markupValores.gasGlp);
  const pFosf = parseMarkupPercent(markupValores.fosfatizacao);

  const notSpecial = (i: PrecificacaoItemRow) => tipoConsumivelEspecialPorCodigo(i.codigocomponente) == null;

  const itensMpNaoEspecial = itens.filter(
    (i) => normalizarTipoMaterial(i.tipoMaterial) === 'Matéria Prima' && notSpecial(i)
  );

  const baseMpTotal = round2(itensMpNaoEspecial.reduce((s, i) => s + (i.valorTotal ?? 0), 0));

  const baseMpFam = round2(
    itensMpNaoEspecial
      .filter((i) => {
        const id = i.idFamiliaProduto;
        return id != null && FAMILIAS_BASE_CONSUMIVEIS_MARKUP.has(id);
      })
      .reduce((s, i) => s + (i.valorTotal ?? 0), 0)
  );

  return itens.map((i) => {
    const tipoEsp = tipoConsumivelEspecialPorCodigo(i.codigocomponente);
    if (!tipoEsp) return i;

    let total = 0;
    if (tipoEsp === 'sucata') total = round2(baseMpTotal * (pSucata / 100));
    else if (tipoEsp === 'solda') total = round2(baseMpFam * (pSolda / 100));
    else if (tipoEsp === 'gasGlp') total = round2(baseMpFam * (pGas / 100));
    else if (tipoEsp === 'fosfatizacao') total = round2(baseMpFam * (pFosf / 100));

    return {
      ...i,
      valorUnitario: null,
      valorTotal: total,
    };
  });
}
