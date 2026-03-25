import type { PrecificacaoItemRow } from '../api/engenharia';

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

function toPercent(v: string | null | undefined): number {
  const raw = String(v ?? '').trim();
  if (!raw) return 0;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type ResumoCalculoItem =
  | { tipo: 'linha'; label: string; perc: number | null; valor: number; destaque?: boolean }
  | { tipo: 'espaco' };

export interface ResumoCalculoPrecificacao {
  itens: ResumoCalculoItem[];
  precoVendaFinal: number;
  impostosDetalhe: Array<{ nome: string; perc: number; valor: number }>;
}

/**
 * Mesma lógica do "Resumo de cálculo" em FichaPrecificacaoReport (PDF).
 * `itensAjustados` deve ser o resultado de aplicarCalculoConsumiveisEspeciais (itens + markup).
 */
export function computeResumoCalculoPrecificacao(
  itensAjustados: PrecificacaoItemRow[],
  valores: Record<string, string>
): ResumoCalculoPrecificacao {
  const v = (key: string) => valores[key]?.trim() || '—';

  const grupos: Record<'Matéria Prima' | 'Material Secundário' | 'Embalagem', PrecificacaoItemRow[]> = {
    'Matéria Prima': [],
    'Material Secundário': [],
    Embalagem: [],
  };
  for (const item of itensAjustados) {
    const tipo = normalizarTipoMaterial(item.tipoMaterial);
    grupos[tipo].push(item);
  }

  const sumGrupo = (titulo: keyof typeof grupos) =>
    round2(grupos[titulo].reduce((s, i) => s + (i.valorTotal ?? 0), 0));

  const totalMateriaPrima = sumGrupo('Matéria Prima');
  const totalMaterialSecundario = sumGrupo('Material Secundário');
  const totalEmbalagens = sumGrupo('Embalagem');
  const totalInsumos = round2(totalMateriaPrima + totalMaterialSecundario + totalEmbalagens);

  const pMaoDireta = toPercent(v('maoDeObraDireta'));
  const pMaoIndireta = toPercent(v('maoDeObraIndireta'));
  const pDepreciacao = toPercent(v('depreciacao'));
  const pDespesasAdm = toPercent(v('despesasAdministrativas'));
  const pFrete = toPercent(v('frete'));
  const pPropaganda = toPercent(v('propaganda'));
  const pEmbalagem = toPercent(v('embalagem'));
  const pLucro = toPercent(v('lucro'));
  const pComissoes = toPercent(v('comissoes'));
  const pCofins = toPercent(v('cofins'));
  const pPis = toPercent(v('pis'));
  const pCsll = toPercent(v('csll'));
  const pIrpj = toPercent(v('irpj'));
  const pIpi = toPercent(v('ipi'));
  const pIcms = toPercent(v('icms'));

  const valMaoDireta = round2((totalInsumos * pMaoDireta) / 100);
  const valMaoIndireta = round2((totalInsumos * pMaoIndireta) / 100);
  const valDepreciacao = round2((totalInsumos * pDepreciacao) / 100);
  const custoVariavelDireto = round2(totalInsumos + valMaoDireta + valMaoIndireta + valDepreciacao);

  const valDespesasAdm = round2((totalInsumos * pDespesasAdm) / 100);
  const precoVendaLiquido = round2(custoVariavelDireto + valDespesasAdm);

  const valFrete = round2((totalInsumos * pFrete) / 100);
  const valPropaganda = round2((totalInsumos * pPropaganda) / 100);
  const valEmbalagem = round2((totalInsumos * pEmbalagem) / 100);
  const precoBrutoVenda = round2(precoVendaLiquido + valFrete + valPropaganda + valEmbalagem);

  const valLucro = round2((precoBrutoVenda * pLucro) / 100);
  const valComissoes = round2(((precoBrutoVenda + valLucro) * pComissoes) / 100);
  const precoBrutoVendaLucro = round2(precoBrutoVenda + valLucro + valComissoes);

  const pImpostosFederais = pCofins + pPis + pCsll + pIrpj + pIpi + pIcms;
  const valImpostosFederais = round2((totalInsumos * pImpostosFederais) / 100);
  const valIcms = round2((totalInsumos * pIcms) / 100);
  const multiplicadorDireto = round2(1 / Math.max(0.0001, 1 - (pImpostosFederais + pIcms) / 100));
  const precoVendaFinal = round2(precoBrutoVendaLucro * multiplicadorDireto);

  const impostosDetalhe = [
    { nome: 'COFINS', perc: pCofins, valor: round2((totalInsumos * pCofins) / 100) },
    { nome: 'PIS', perc: pPis, valor: round2((totalInsumos * pPis) / 100) },
    { nome: 'CSLL', perc: pCsll, valor: round2((totalInsumos * pCsll) / 100) },
    { nome: 'IRPJ', perc: pIrpj, valor: round2((totalInsumos * pIrpj) / 100) },
    { nome: 'IPI', perc: pIpi, valor: round2((totalInsumos * pIpi) / 100) },
    { nome: 'ICMS', perc: pIcms, valor: round2((totalInsumos * pIcms) / 100) },
  ];

  const itensResumo: ResumoCalculoItem[] = [
    { tipo: 'linha', label: 'Matéria Prima:', perc: null, valor: totalMateriaPrima },
    { tipo: 'linha', label: 'Material Secundário:', perc: null, valor: totalMaterialSecundario },
    { tipo: 'linha', label: 'Embalagens:', perc: null, valor: totalEmbalagens },
    { tipo: 'linha', label: 'Total dos Insumos:', perc: null, valor: totalInsumos, destaque: true },
    { tipo: 'espaco' },
    { tipo: 'linha', label: 'Mão de Obra Direta:', perc: pMaoDireta, valor: valMaoDireta },
    { tipo: 'linha', label: 'Mão de Obra Indireta:', perc: pMaoIndireta, valor: valMaoIndireta },
    { tipo: 'linha', label: 'Depreciação:', perc: pDepreciacao, valor: valDepreciacao },
    { tipo: 'linha', label: 'Custo Variável Direto:', perc: null, valor: custoVariavelDireto, destaque: true },
    { tipo: 'espaco' },
    { tipo: 'linha', label: 'Despesas Administrativas:', perc: pDespesasAdm, valor: valDespesasAdm },
    { tipo: 'linha', label: 'Preço Venda Líquido:', perc: null, valor: precoVendaLiquido, destaque: true },
    { tipo: 'espaco' },
    { tipo: 'linha', label: 'Frete:', perc: pFrete, valor: valFrete },
    { tipo: 'linha', label: 'Propaganda:', perc: pPropaganda, valor: valPropaganda },
    { tipo: 'linha', label: 'Embalagem:', perc: pEmbalagem, valor: valEmbalagem },
    { tipo: 'linha', label: 'Preço Bruto da Venda:', perc: null, valor: precoBrutoVenda, destaque: true },
    { tipo: 'linha', label: 'Lucro:', perc: pLucro, valor: valLucro },
    { tipo: 'linha', label: 'Comissões:', perc: pComissoes, valor: valComissoes },
    { tipo: 'linha', label: 'Preço Bruto da Venda + Lucro:', perc: null, valor: precoBrutoVendaLucro, destaque: true },
    { tipo: 'linha', label: 'Impostos Federais:', perc: pImpostosFederais, valor: valImpostosFederais },
    { tipo: 'linha', label: 'ICMS:', perc: pIcms, valor: valIcms },
    { tipo: 'linha', label: 'Multiplicador Direto:', perc: null, valor: multiplicadorDireto, destaque: true },
  ];

  return {
    itens: itensResumo,
    precoVendaFinal,
    impostosDetalhe,
  };
}

export function formatResumoValor(num: number): string {
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatResumoPercent(num: number | null): string {
  if (num == null) return '';
  return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
