import { apiJson } from './client';

export type MrpProdutoProcessoRow = {
  id: number;
  codigoProdutoPai: string;
  descricaoProdutoPai: string;
  codigoProduto: string;
  descricaoProduto: string;
  qtdeUtilizada: number | null;
  origem: string;
};

export type MrpProdutosProcessoParams = {
  codigo_pai?: string;
  descricao_pai?: string;
  codigo_produto?: string;
  descricao_produto?: string;
  origem?: string;
};

export type MrpProdutosProcessoResponse = {
  data: MrpProdutoProcessoRow[];
  total: number;
  source: string;
  updatedAt: string;
};

export function getMrpProdutosProcesso(params: MrpProdutosProcessoParams = {}) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const v = value?.trim();
    if (v) qs.set(key, v);
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiJson<MrpProdutosProcessoResponse>(`/api/mrp-produtos-processo${suffix}`);
}
