import { apiFetch } from './client';

export interface ProdutoPrecificacao {
  id: number;
  nome: string;
  descricao: string | null;
}

export interface ProdutosPrecificacaoResponse {
  data: ProdutoPrecificacao[];
  error?: string;
}

export interface GetProdutosPrecificacaoParams {
  /** Busca em nome e descrição (servidor). */
  q?: string;
  /** Limite de itens (default 50, max 100). */
  limit?: number;
}

/**
 * Lista produtos do Nomus para o modal Precificar (ativo=1, tipo acabado/intermediário/em processo).
 * Com q e limit para carregamento rápido e busca no servidor.
 */
export async function getProdutosPrecificacao(params?: GetProdutosPrecificacaoParams): Promise<ProdutosPrecificacaoResponse> {
  const sp = new URLSearchParams();
  if (params?.q != null && params.q !== '') sp.set('q', params.q);
  if (params?.limit != null) sp.set('limit', String(params.limit));
  const qs = sp.toString();
  const res = await apiFetch(`/api/engenharia/produtos-precificacao${qs ? `?${qs}` : ''}`);
  const body = (await res.json().catch(() => ({}))) as { data?: ProdutoPrecificacao[]; error?: string };
  if (!res.ok) {
    return { data: [], error: body.error ?? res.statusText };
  }
  const data = Array.isArray(body.data) ? body.data : [];
  return { data, error: body.error };
}

// --- Precificação (iniciar, listar, resultado) ---

export interface PrecificacaoListItem {
  id: number;
  codigoProduto: string;
  descricaoProduto: string;
  data: string;
  usuario: string;
}

export interface PrecificacaoItemRow {
  id: number;
  idprodutopai: number | null;
  codigopai: string | null;
  descricaopai: string | null;
  idcomponente: number | null;
  codigocomponente: string | null;
  componente: string | null;
  qtd: number;
  valorUnitario: number | null;
  valorTotal: number | null;
}

export interface PrecificacaoIniciarResponse {
  precificacao: {
    id: number;
    idProduto: number;
    codigoProduto: string | null;
    descricaoProduto: string | null;
    data: string;
    usuario: string | null;
  };
  itens: PrecificacaoItemRow[];
}

export interface PrecificacaoResultadoResponse {
  precificacao: {
    id: number;
    codigoProduto: string | null;
    descricaoProduto: string | null;
    data: string;
    usuario: string | null;
    valoresCampos?: Record<string, string> | null;
  };
  itens: PrecificacaoItemRow[];
}

/** Chaves dos campos % (Consumíveis, Despesas, Lucro, Impostos) */
export type PrecificacaoValoresCampos = Record<string, string>;

export async function salvarPrecificacaoValores(
  id: number,
  valores: PrecificacaoValoresCampos
): Promise<{ error?: string }> {
  const res = await apiFetch(`/api/engenharia/precificacao/${id}/valores`, {
    method: 'PATCH',
    body: valores,
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { error: body.error ?? res.statusText };
  return {};
}

export async function iniciarPrecificacao(idProduto: number): Promise<{
  data?: PrecificacaoIniciarResponse;
  error?: string;
}> {
  const res = await apiFetch('/api/engenharia/precificacao/iniciar', {
    method: 'POST',
    body: { idProduto },
  });
  const body = (await res.json().catch(() => ({}))) as PrecificacaoIniciarResponse & { error?: string };
  if (!res.ok) return { error: body.error ?? res.statusText };
  return { data: body as PrecificacaoIniciarResponse };
}

export async function listPrecificacoes(): Promise<{
  data: PrecificacaoListItem[];
  error?: string;
}> {
  const res = await apiFetch('/api/engenharia/precificacao');
  const body = (await res.json().catch(() => ({}))) as { data?: PrecificacaoListItem[]; error?: string };
  if (!res.ok) return { data: [], error: body.error ?? res.statusText };
  return { data: Array.isArray(body.data) ? body.data : [] };
}

export async function getPrecificacaoResultado(id: number): Promise<{
  data?: PrecificacaoResultadoResponse;
  error?: string;
}> {
  const res = await apiFetch(`/api/engenharia/precificacao/${id}/resultado`);
  const body = (await res.json().catch(() => ({}))) as PrecificacaoResultadoResponse & { error?: string };
  if (!res.ok) return { error: body.error ?? res.statusText };
  return { data: body as PrecificacaoResultadoResponse };
}
