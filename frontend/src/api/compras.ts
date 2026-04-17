import { apiFetch } from './client';

export interface FiltrosProdutosColeta {
  codigo?: string;
  descricao?: string;
  familia?: string;
  fornecedor?: string;
  coleta?: string;
  diaSemana?: string;
  apenasComSolicitacao?: boolean;
}

export interface ProdutoColetaRow {
  idProduto: number;
  codigoSolicitacao: number | null;
  qtdeSolicitada: number | null;
  codigoProduto: string;
  descricaoProduto: string;
  unidadeMedida: string | null;
  tipoProduto: string | null;
  grupoProduto: string | null;
  idFamiliaProduto: number | null;
  familiaProduto: string | null;
  produtoAtivo: string;
  idFornecedor: number | null;
  ultimoFornecedor: string | null;
  nomeColeta: string | null;
  diaSemana: string | null;
}

export interface ProdutosColetaResponse {
  data: ProdutoColetaRow[];
  error?: string;
}

/**
 * Lista produtos do Nomus para o pop-up de coleta de preços.
 * Filtros aplicados no servidor (rápido e otimizado).
 */
export async function listarProdutosColeta(filtros: FiltrosProdutosColeta = {}): Promise<ProdutosColetaResponse> {
  const params = new URLSearchParams();
  if (filtros.codigo) params.set('codigo', filtros.codigo);
  if (filtros.descricao) params.set('descricao', filtros.descricao);
  if (filtros.familia) params.set('familia', filtros.familia);
  if (filtros.fornecedor) params.set('fornecedor', filtros.fornecedor);
  if (filtros.coleta) params.set('coleta', filtros.coleta);
  if (filtros.diaSemana) params.set('diaSemana', filtros.diaSemana);
  if (filtros.apenasComSolicitacao === true) params.set('apenasComSolicitacao', 'true');
  const qs = params.toString();
  const url = `/api/compras/produtos-coleta${qs ? `?${qs}` : ''}`;
  const res = await apiFetch(url);
  const body = await res.json().catch(() => ({})) as { data?: ProdutoColetaRow[]; error?: string };
  if (!res.ok) {
    return { data: [], error: body.error ?? res.statusText };
  }
  return { data: body.data ?? [], error: body.error };
}

/** Item para confirmar/adicionar à coleta: idProduto e opcionalmente codigoSolicitacao (vínculo com solicitação de compra). */
export interface ItemColetaPayload {
  idProduto: number;
  codigoSolicitacao?: number | null;
}

/**
 * Confirma a seleção de produtos para coleta de preços.
 * Envia itens (idProduto + opcional codigoSolicitacao) para um registro por linha selecionada.
 */
export interface ColetaEmConflito {
  id: number;
  status: string;
}

export async function confirmarColetaPrecos(itens: ItemColetaPayload[]): Promise<{
  ok: boolean;
  coletaId?: number;
  error?: string;
  coletasEmConflito?: ColetaEmConflito[];
  bloqueante?: boolean;
  coletas?: ColetaBloqueante[];
}> {
  const res = await apiFetch('/api/compras/confirmar-coleta', {
    method: 'POST',
    body: { itens },
  });
  const text = await res.text();
  let body: {
    error?: string;
    cause?: string;
    id?: number;
    coletasEmConflito?: ColetaEmConflito[];
    messageDetail?: string;
    bloqueante?: boolean;
    coletas?: ColetaBloqueante[];
  } = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text || res.statusText };
  }
  if (!res.ok) {
    const base = body.error ?? res.statusText;
    const detalhe = body.cause && body.cause !== base ? ` (${body.cause})` : '';
    return {
      ok: false,
      error: `${base}${detalhe}`,
      coletasEmConflito: body.coletasEmConflito,
      bloqueante: body.bloqueante,
      coletas: body.coletas,
    };
  }
  return { ok: true, coletaId: body.id };
}

/** Opção de fornecedor retornada pela listagem (GET /fornecedores). */
export interface FornecedorOpcao {
  id: number;
  nome: string;
  nomeRazaoSocial: string | null;
  uf: string | null;
  cnpjCpf: string | null;
}

/** Item de fornecedor da cotação (com dados adicionais). */
export interface FornecedorColetaItem {
  idPessoa: number;
  nome: string;
  pedidoMinimo?: string;
  condicaoPagamento?: string;
  formaPagamento?: string;
  valorFrete?: string;
  valorFreteTipo?: '%' | 'R$';
  ipi?: string;
  ipiTipo?: '%' | 'R$';
}

export interface ColetaPrecosListItem {
  id: number;
  dataCriacao: string;
  /** Data da última movimentação (status, cotação, itens etc.); null = usar dataCriacao. */
  dataUltimaMovimentacao?: string | null;
  /** True se já existe ciência para coleta >72h em aberto. */
  temCiencia?: boolean;
  qtdItens: number;
  qtdRegistros: number;
  usuarioCriacao: string | null;
  fornecedores: FornecedorColetaItem[];
  status?: string;
  /** Justificativa do cancelamento (quando status é Rejeitada). */
  justificativaCancelamento?: string | null;
  dataEnvioAprovacao?: string | null;
  dataFinalizacao?: string | null;
  /** Códigos de produto da coleta (para filtro). */
  codigosProduto?: string[];
  /** Descrições de produto da coleta (para filtro). */
  descricoesProduto?: string[];
  /** Nomes da coleta (Nomus: atributo 650) dos produtos da coleta — para filtro no painel. */
  nomesColeta?: string[];
  /** Observações da coleta (texto longo); exibido no mapa de cotação. */
  observacoes?: string | null;
  /** True se a coleta já foi enviada para aprovação em algum momento (nunca volta a false); impede exclusão. */
  jaEnviadaAprovacao?: boolean;
  /** Coletas antigas (false): finalizar sem vínculo Nomus; novas (true): obrigatório pedido ou cotação. */
  requerVinculoFinalizacao?: boolean;
  finalizacaoTipoRegistro?: string | null;
  finalizacaoIdRegistro?: number | null;
  /** Vínculos Nomus na finalização (pedido/cotação); pode ter vários. */
  finalizacaoVinculos?: { tipoRegistro: string; idRegistro: number }[];
}

/** Coleta que bloqueia criar nova coleta (>72h sem movimentação, sem ciência). */
export interface ColetaBloqueante {
  id: number;
  status: string;
  dataCriacao: string;
  dataUltimaMovimentacao: string | null;
}

export async function listarColetasBloqueantes(): Promise<{ data: ColetaBloqueante[]; error?: string }> {
  const res = await apiFetch('/api/compras/coletas-bloqueantes');
  const body = await res.json().catch(() => ({})) as { data?: ColetaBloqueante[]; error?: string };
  if (!res.ok) return { data: [], error: body.error ?? res.statusText };
  return { data: body.data ?? [] };
}

export async function registrarCienciaColeta(coletaId: number, justificativa: string, senha: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`/api/compras/coletas/${coletaId}/ciencia`, {
    method: 'POST',
    body: { justificativa, senha },
  });
  const body = await res.json().catch(() => ({})) as { error?: string };
  if (!res.ok) return { ok: false, error: body.error ?? res.statusText };
  return { ok: true };
}

export interface OpcoesFiltroColetas {
  codigos: string[];
  descricoes: string[];
}

/**
 * Opções para os filtros de Código e Descrição do produto (multi-select).
 */
export async function obterOpcoesFiltroColetas(): Promise<{ codigos: string[]; descricoes: string[]; error?: string }> {
  const res = await apiFetch('/api/compras/coletas/opcoes-filtro');
  const text = await res.text();
  let body: { codigos?: string[]; descricoes?: string[]; error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { codigos?: string[]; descricoes?: string[]; error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) {
    return { codigos: [], descricoes: [], error: body.error ?? res.statusText };
  }
  return {
    codigos: Array.isArray(body.codigos) ? body.codigos : [],
    descricoes: Array.isArray(body.descricoes) ? body.descricoes : [],
    error: body.error,
  };
}

/**
 * Lista fornecedores ativos do Nomus (para o popup de seleção na cotação).
 */
export async function listarFornecedores(): Promise<{ data: FornecedorOpcao[]; error?: string }> {
  const res = await apiFetch('/api/compras/fornecedores');
  const text = await res.text();
  let body: { data?: FornecedorOpcao[]; error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { data?: FornecedorOpcao[]; error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) {
    return { data: [], error: body.error ?? res.statusText };
  }
  const data = Array.isArray(body.data) ? body.data : [];
  return { data, error: body.error };
}

export interface OpcaoNomus {
  id: number;
  nome: string;
}

/**
 * Lista condições de pagamento ativas do Nomus (para selects no modal de fornecedores).
 */
export async function listarCondicoesPagamento(): Promise<{ data: OpcaoNomus[]; error?: string }> {
  const res = await apiFetch('/api/compras/condicoes-pagamento');
  const text = await res.text();
  let body: { data?: OpcaoNomus[]; error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { data?: OpcaoNomus[]; error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) {
    return { data: [], error: body.error ?? res.statusText };
  }
  return { data: Array.isArray(body.data) ? body.data : [], error: body.error };
}

/**
 * Lista formas de pagamento ativas do Nomus (para selects no modal de fornecedores).
 */
export async function listarFormasPagamento(): Promise<{ data: OpcaoNomus[]; error?: string }> {
  const res = await apiFetch('/api/compras/formas-pagamento');
  const text = await res.text();
  let body: { data?: OpcaoNomus[]; error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { data?: OpcaoNomus[]; error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) {
    return { data: [], error: body.error ?? res.statusText };
  }
  return { data: Array.isArray(body.data) ? body.data : [], error: body.error };
}

/**
 * Atualiza os fornecedores da cotação (máx. 6) com dados adicionais por fornecedor.
 */
export async function atualizarFornecedoresColeta(
  coletaId: number,
  fornecedores: FornecedorColetaItem[]
): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`/api/compras/coletas/${coletaId}/fornecedores`, {
    method: 'PUT',
    body: { fornecedores: fornecedores.slice(0, 6) },
  });
  const text = await res.text();
  let body: { error?: string } = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text || res.statusText };
  }
  if (!res.ok) {
    return { ok: false, error: body.error ?? res.statusText };
  }
  return { ok: true };
}

/**
 * Lista registros de preços/produtos da coleta (dados do SQL da coleta de preços).
 * Retorna array de objetos com todos os campos do SQL (Id Produto, Codigo do Produto, etc.).
 */
export interface PrecosColetaDebug {
  registrosSalvos?: number;
  itensNaColeta?: number;
  nomusConfigurado?: boolean;
  nomusErro?: string;
}

const PRECOS_COLETA_TIMEOUT_MS = 25000;

export async function listarPrecosColeta(coletaId: number): Promise<{
  data: Record<string, unknown>[];
  solicitacoesPorProduto?: Record<number, number[]>;
  message?: string;
  error?: string;
  debug?: PrecosColetaDebug;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PRECOS_COLETA_TIMEOUT_MS);
  let res: Response;
  try {
    res = await apiFetch(`/api/compras/coletas/${coletaId}/precos`, { signal: controller.signal });
  } catch (e) {
    clearTimeout(timeoutId);
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('A requisição demorou muito. Tente novamente ou verifique a conexão com o ERP (Nomus).');
    }
    throw e;
  }
  clearTimeout(timeoutId);
  const text = await res.text();
  let body: { data?: Record<string, unknown>[]; solicitacoesPorProduto?: Record<number, number[]>; message?: string; error?: string; debug?: PrecosColetaDebug } = {};
  if (text) {
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) {
    return { data: [], message: body.message, error: body.error ?? res.statusText, debug: body.debug };
  }
  const data = Array.isArray(body.data) ? body.data : [];
  return { data, solicitacoesPorProduto: body.solicitacoesPorProduto, message: body.message, error: body.error, debug: body.debug };
}

/** Item de preço por fornecedor para salvar na cotação. */
export interface PrecoCotacaoSalvarItem {
  idPessoa: number;
  precoNF: number;
  percICMS: number;
  percPIS: number;
  percIPI: number;
  percCOFINS: number;
  precoTotal: number;
}

/** Preço salvo da cotação (resposta do GET precos-cotacao). idProduto presente quando lista toda a coleta. */
export interface PrecoCotacaoSalvoItem {
  idProduto?: number;
  idFornecedor: number;
  precoNF: number;
  percICMS: number;
  percPIS: number;
  percIPI: number;
  percCOFINS: number;
  precoTotal: number;
}

/**
 * Lista os preços já salvos da cotação para um produto (para preencher o modal ao reabrir).
 */
export async function listarPrecosCotacao(
  coletaId: number,
  idProduto: number
): Promise<{ data: PrecoCotacaoSalvoItem[]; error?: string }> {
  const res = await apiFetch(
    `/api/compras/coletas/${coletaId}/precos-cotacao?idProduto=${encodeURIComponent(idProduto)}`
  );
  const text = await res.text();
  let body: { data?: PrecoCotacaoSalvoItem[]; error?: string } = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text || res.statusText };
  }
  if (!res.ok) {
    return { data: [], error: body.error ?? res.statusText };
  }
  const data = Array.isArray(body.data) ? body.data : [];
  return { data, error: body.error };
}

/**
 * Lista toda a cotação da coleta (todos os produtos/fornecedores) para o Mapa de Cotação.
 */
export async function listarPrecosCotacaoToda(
  coletaId: number
): Promise<{ data: PrecoCotacaoSalvoItem[]; error?: string }> {
  const res = await apiFetch(`/api/compras/coletas/${coletaId}/precos-cotacao`);
  const text = await res.text();
  let body: { data?: PrecoCotacaoSalvoItem[]; error?: string } = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text || res.statusText };
  }
  if (!res.ok) {
    return { data: [], error: body.error ?? res.statusText };
  }
  const data = Array.isArray(body.data) ? body.data : [];
  return { data, error: body.error };
}

/**
 * Salva os preços cadastrados (popup Cadastrar preços) por produto/fornecedor.
 */
export async function salvarPrecosCotacao(
  coletaId: number,
  idProduto: number,
  precos: PrecoCotacaoSalvarItem[]
): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`/api/compras/coletas/${coletaId}/precos-cotacao`, {
    method: 'POST',
    body: { idProduto, precos },
  });
  const text = await res.text();
  let body: { error?: string } = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text || res.statusText };
  }
  if (!res.ok) {
    return { ok: false, error: body.error ?? res.statusText };
  }
  return { ok: true };
}

/**
 * Lista coletas de preços cadastradas.
 */
export async function listarColetasPrecos(): Promise<{ data: ColetaPrecosListItem[]; error?: string }> {
  const res = await apiFetch('/api/compras/coletas');
  const text = await res.text();
  let body: { data?: ColetaPrecosListItem[]; error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { data?: ColetaPrecosListItem[]; error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) {
    return { data: [], error: body.error ?? res.statusText };
  }
  const data = Array.isArray(body.data) ? body.data : [];
  return { data, error: body.error };
}

/** Exclui a coleta. Só é permitido se ela nunca foi enviada para aprovação (jaEnviadaAprovacao === false). */
export async function excluirColetaPrecos(coletaId: number): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`/api/compras/coletas/${coletaId}`, { method: 'DELETE' });
  const text = await res.text();
  let body: { error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) return { ok: false, error: body.error ?? res.statusText };
  return { ok: true };
}

/** Atualiza as observações da coleta (texto longo; exibido no mapa de cotação). */
export async function atualizarObservacoesColeta(coletaId: number, observacoes: string | null): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`/api/compras/coletas/${coletaId}/observacoes`, {
    method: 'PATCH',
    body: { observacoes: observacoes ?? null },
  });
  const text = await res.text();
  let body: { error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) return { ok: false, error: body.error ?? res.statusText };
  return { ok: true };
}

/** Envia a coleta para aprovação (status → "Em Aprovação"). */
export async function enviarParaAprovacao(coletaId: number): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`/api/compras/coletas/${coletaId}/enviar-aprovacao`, { method: 'PATCH' });
  const text = await res.text();
  let body: { error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) return { ok: false, error: body.error ?? res.statusText };
  return { ok: true };
}

/** Reabre a coleta (volta para "Em cotação"). Exige senha do usuário. Só quando status é "Em Aprovação". */
export async function reabrirColeta(coletaId: number, senha: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`/api/compras/coletas/${coletaId}/reabrir`, {
    method: 'PATCH',
    body: { senha: senha.trim() },
  });
  const text = await res.text();
  let body: { error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) return { ok: false, error: body.error ?? res.statusText };
  return { ok: true };
}

/** Remove um item (produto) da coleta. Quando status é "Em cotação" ou "Em Aprovação". Justificativa obrigatória. */
export async function excluirItemColeta(coletaId: number, idProduto: number, justificativa: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`/api/compras/coletas/${coletaId}/itens/${idProduto}`, {
    method: 'DELETE',
    body: { justificativa: justificativa.trim() },
  });
  const text = await res.text();
  let body: { error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) return { ok: false, error: body.error ?? res.statusText };
  return { ok: true };
}

/** Cancela todos os itens da coleta. Apenas quando status é "Em Aprovação". Justificativa obrigatória. */
export async function cancelarTodosItensColeta(coletaId: number, justificativa: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`/api/compras/coletas/${coletaId}/itens/todos`, {
    method: 'DELETE',
    body: { justificativa: justificativa.trim() },
  });
  const text = await res.text();
  let body: { error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) return { ok: false, error: body.error ?? res.statusText };
  return { ok: true };
}

/** Adiciona itens à coleta (um por produto + solicitação). Só quando status é "Em cotação". */
export async function adicionarItensColeta(coletaId: number, itens: ItemColetaPayload[]): Promise<{ ok: boolean; adicionados?: number; error?: string }> {
  const res = await apiFetch(`/api/compras/coletas/${coletaId}/itens`, { method: 'POST', body: { itens } });
  const text = await res.text();
  let body: { error?: string; adicionados?: number } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { error?: string; adicionados?: number };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) return { ok: false, error: body.error ?? res.statusText };
  return { ok: true, adicionados: body.adicionados };
}

/** Cancela a cotação (status "Rejeitada"). Justificativa obrigatória. Não permite mais alterações. */
export async function cancelarCotacao(coletaId: number, justificativa: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`/api/compras/coletas/${coletaId}/cancelar-cotacao`, {
    method: 'PATCH',
    body: { justificativa: justificativa.trim() },
  });
  const text = await res.text();
  let body: { error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) return { ok: false, error: body.error ?? res.statusText };
  return { ok: true };
}

/** Atualiza quantidade aprovada e/ou fornecedor vencedor do registro da coleta. */
export async function atualizarRegistroColeta(
  coletaId: number,
  registroId: number,
  payload: { qtdeAprovada?: number; idFornecedorVencedor?: number | null }
): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`/api/compras/coletas/${coletaId}/registros/${registroId}`, {
    method: 'PATCH',
    body: payload,
  });
  const text = await res.text();
  let body: { error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) return { ok: false, error: body.error ?? res.statusText };
  return { ok: true };
}

export interface OpcaoVinculoFinalizacaoItem {
  id: number;
  nome: string;
  nomeFornecedor: string | null;
  dataEmissao: string | null;
  tipoRegistro: string;
}

/**
 * Pedidos de compra e cotações no Nomus para vincular à finalização (busca no nome e fornecedor).
 */
export async function listarOpcoesVinculoFinalizacao(
  q: string
): Promise<{ data: OpcaoVinculoFinalizacaoItem[]; error?: string }> {
  const qs = new URLSearchParams();
  if (q.trim()) qs.set('q', q.trim());
  const res = await apiFetch(`/api/compras/coletas/opcoes-vinculo-finalizacao?${qs.toString()}`);
  const text = await res.text();
  let body: { data?: OpcaoVinculoFinalizacaoItem[]; error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { data?: OpcaoVinculoFinalizacaoItem[]; error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) return { data: [], error: body.error ?? res.statusText };
  return { data: Array.isArray(body.data) ? body.data : [] };
}

/** Finaliza a cotação (status "Finalizada"). Só quando status é "Em Aprovação". Exige quantidades aprovadas preenchidas.
 *  Coletas com vínculo: envie `vinculos` (um ou mais pedidos/cotações Nomus) ou um único `vinculo` legado. */
export async function finalizarCotacao(
  coletaId: number,
  vinculo?:
    | { tipoRegistro: 'PEDIDO' | 'COTACAO'; idRegistro: number }
    | { vinculos: { tipoRegistro: 'PEDIDO' | 'COTACAO'; idRegistro: number }[] }
    | null
): Promise<{ ok: boolean; error?: string }> {
  let bodyPayload: Record<string, unknown> = {};
  if (vinculo != null && 'vinculos' in vinculo && Array.isArray(vinculo.vinculos) && vinculo.vinculos.length > 0) {
    bodyPayload = {
      vinculos: vinculo.vinculos.map((v) => ({
        tipoRegistro: v.tipoRegistro,
        idRegistro: v.idRegistro,
      })),
    };
  } else if (
    vinculo != null &&
    'tipoRegistro' in vinculo &&
    vinculo.tipoRegistro &&
    Number.isFinite(vinculo.idRegistro) &&
    vinculo.idRegistro > 0
  ) {
    bodyPayload = { tipoRegistro: vinculo.tipoRegistro, idRegistro: vinculo.idRegistro };
  }
  const res = await apiFetch(`/api/compras/coletas/${coletaId}/finalizar-cotacao`, {
    method: 'PATCH',
    body: Object.keys(bodyPayload).length > 0 ? bodyPayload : {},
  });
  const text = await res.text();
  let body: { error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) return { ok: false, error: body.error ?? res.statusText };
  return { ok: true };
}

/** Envia a coleta para o financeiro. Só quando status é "Em Aprovação". */
export async function enviarParaFinanceiro(coletaId: number): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch(`/api/compras/coletas/${coletaId}/enviar-financeiro`, { method: 'PATCH' });
  const text = await res.text();
  let body: { error?: string } = {};
  if (text) {
    try {
      body = JSON.parse(text) as { error?: string };
    } catch {
      body = { error: text || res.statusText };
    }
  }
  if (!res.ok) return { ok: false, error: body.error ?? res.statusText };
  return { ok: true };
}
