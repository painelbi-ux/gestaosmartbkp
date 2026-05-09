/**
 * Integração Nomus para Compras – produtos para coleta de preços.
 * SQL fornecido; filtros aplicados no servidor para performance.
 */

import { getNomusPool } from '../config/nomusDb.js';
import { SQL_REGISTRO_COLETA_BASE } from './sqlRegistroColetaPrecos.js';

const SQL_BASE = `
Select
  p.id As idProduto,
  sco.id As codigoSolicitacao,
  sco.quantidadesolicitada As qtdeSolicitada,
  p.nome As codigoProduto,
  Upper(p.descricao) As descricaoProduto,
  umed.abreviatura As unidadeMedida,
  tp.descricao As tipoProduto,
  gp.nome As grupoProduto,
  fp.id As idFamiliaProduto,
  fp.nome As familiaProduto,
  If((p.ativo = 1), 'Sim', 'Não') As produtoAtivo,
  um.idFornecedor As idFornecedor,
  um.nomefornecedor As ultimoFornecedor,
  Coalesce(nc.opcao, 'A DEFINIR') As nomeColeta,
  Coalesce(ds.opcao, 'A Definir') As diaSemana
From
  produto p
Left Join unidademedida umed On
  p.idUnidadeMedida = umed.id
Left Join tipoproduto tp On
  p.idTipoProduto = tp.id
Left Join grupoproduto gp On
  p.idGrupoProduto = gp.id
Left Join familiaproduto fp On
  p.idFamiliaProduto = fp.id
Left Join
  (
    Select
      b.idProduto,
      c.idItemDocumentoEstoque,
      c.idItemPedidoCompra,
      c.qtde As quantidade,
      c.idprod,
      c.valorunitario As valorunitario,
      c.dataentrada As dataentrada,
      c.datapedidocompra As datapedidocompra,
      c.idFornecedor,
      c.nomefornecedor As nomefornecedor
    From
      (
        Select distinct
          pc.dataEmissao,
          a.idItemDocumentoEstoque As idmax,
          b.idProduto,
          p.nome
        From
          itemdocumentoestoque_itempedidocompra a
        Left Join itemdocumentoestoque b On
          a.idItemDocumentoEstoque = b.id
        Left Join itempedidocompra ipc On
          ipc.id = a.idItemPedidoCompra
        Left Join pedidocompra pc On
          pc.id = ipc.idPedidoCompra
        Left Join produto p On
          p.id = ipc.idProduto
        Inner Join (
          Select
            b2.idProduto,
            Max(pc2.dataEmissao) As dataMaxima,
            Max(a2.idItemDocumentoEstoque) As idMaximo
          From
            itemdocumentoestoque_itempedidocompra a2
          Left Join itemdocumentoestoque b2 On
            a2.idItemDocumentoEstoque = b2.id
          Left Join itempedidocompra ipc2 On
            ipc2.id = a2.idItemPedidoCompra
          Left Join pedidocompra pc2 On
            pc2.id = ipc2.idPedidoCompra
          Group By
            b2.idProduto
        ) As ultima_data On
          (b.idProduto = ultima_data.idProduto)
          And (pc.dataEmissao = ultima_data.dataMaxima)
          And (a.idItemDocumentoEstoque = ultima_data.idMaximo)
      ) b
    Left Join (
      Select
        a.idItemDocumentoEstoque As idgeral,
        a.idItemDocumentoEstoque,
        a.idItemPedidoCompra,
        round((Sum(a.qtde)), 2) As qtde,
        round(e.valorUnitario, 2) As valorunitario,
        c.idProduto As idprod,
        g.nome As nomeprod,
        Date_Format(f.dataEntrada, "%d/%m/%Y") As dataentrada,
        Date_Format(d.dataEmissao, "%d/%m/%Y") As datapedidocompra,
        h.id As idFornecedor,
        h.nome As nomefornecedor
      From
        itemdocumentoestoque_itempedidocompra a
      Left Join movimentacaoproducao b On
        a.idItemDocumentoEstoque = b.id
      Left Join itempedidocompra c On
        a.idItemPedidoCompra = c.id
      Left Join pedidocompra d On
        c.idPedidoCompra = d.id
      Left Join itemdocumentoestoque e On
        a.idItemDocumentoEstoque = e.id
      Left Join documentoestoque f On
        e.idDocumentoEntrada = f.id
      Left Join produto g On
        c.idProduto = g.id
      Left Join pessoa h On
        f.idParceiro = h.id
      Group By
        a.idItemDocumentoEstoque
    ) c On
      b.idmax = c.idgeral
  ) um On
  um.idProduto = p.id
Left Join (
  Select
    apv.idProduto,
    apv.idAtributo,
    alo.opcao,
    apv.idListaOpcao
  From
    atributoprodutovalor apv
  Left Join atributolistaopcao alo On
    alo.id = apv.idListaOpcao
  Where
    apv.idAtributo = 650
) nc On
  nc.idProduto = p.id
Left Join (
  Select
    apv.idProduto,
    apv.idAtributo,
    alo.opcao,
    apv.idListaOpcao
  From
    atributoprodutovalor apv
  Left Join atributolistaopcao alo On
    alo.id = apv.idListaOpcao
  Where
    apv.idAtributo = 651
) ds On
  ds.idProduto = p.id
Left Join (
  Select
    a3.idProduto,
    a3.id,
    (Sum(a3.quantidade) - Coalesce(Sum(scipc.qtdeAtendida), 0)) As quantidadesolicitada
  From
    solicitacaocompra a3
  Left Join solicitacaocompraitempedidocompra scipc On
    a3.id = scipc.idSolicitacaoCompra
  Where
    (a3.status In (2, 6))
    And (a3.lixeira Is Null)
  Group By
    a3.idProduto,
    a3.id
) sco On
  sco.idProduto = p.id
Where
  (p.idTipoProduto In (5, 13, 14, 6, 10, 16, 21, 22))
  And (p.ativo = 1)
`.trim();

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
  unidadeMedida: string;
  tipoProduto: string;
  grupoProduto: string;
  idFamiliaProduto: number | null;
  familiaProduto: string;
  produtoAtivo: string;
  idFornecedor: number | null;
  ultimoFornecedor: string;
  nomeColeta: string;
  diaSemana: string;
}

/** Escapa caracteres especiais do LIKE (%, _) para uso seguro. */
function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Monta SQL com filtros opcionais (parâmetros preparados). */
function buildSqlAndParams(filtros: FiltrosProdutosColeta): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filtros.codigo?.trim()) {
    const c = filtros.codigo.trim();
    conditions.push('(p.nome LIKE ? OR CAST(p.id AS CHAR) = ?)');
    params.push(`%${escapeLike(c)}%`, c);
  }
  if (filtros.descricao?.trim()) {
    const d = filtros.descricao.trim().toUpperCase();
    conditions.push('Upper(p.descricao) LIKE ?');
    params.push(`%${escapeLike(d)}%`);
  }
  if (filtros.familia?.trim()) {
    const f = filtros.familia.trim();
    conditions.push('fp.nome LIKE ?');
    params.push(`%${escapeLike(f)}%`);
  }
  if (filtros.fornecedor?.trim()) {
    const fo = filtros.fornecedor.trim();
    conditions.push('um.nomefornecedor LIKE ?');
    params.push(`%${escapeLike(fo)}%`);
  }
  if (filtros.coleta?.trim()) {
    const co = filtros.coleta.trim();
    conditions.push('Coalesce(nc.opcao, \'A DEFINIR\') LIKE ?');
    params.push(`%${escapeLike(co)}%`);
  }
  if (filtros.diaSemana?.trim()) {
    const ds = filtros.diaSemana.trim();
    conditions.push('Coalesce(ds.opcao, \'A Definir\') LIKE ?');
    params.push(`%${escapeLike(ds)}%`);
  }
  if (filtros.apenasComSolicitacao === true) {
    conditions.push('(sco.quantidadesolicitada Is Not Null And sco.quantidadesolicitada > 0)');
  }

  const whereExtra = conditions.length ? ` And ${conditions.join(' And ')}` : '';
  const sql = `${SQL_BASE}${whereExtra}`;
  return { sql, params };
}

/**
 * Lista produtos para coleta de preços a partir do Nomus.
 * Filtros aplicados no SQL para performance.
 */
export async function listarProdutosColeta(filtros: FiltrosProdutosColeta = {}): Promise<{
  data: ProdutoColetaRow[];
  erro?: string;
}> {
  const pool = getNomusPool();
  if (!pool) {
    return { data: [], erro: 'NOMUS_DB_URL não configurado' };
  }
  try {
    const { sql, params } = buildSqlAndParams(filtros);
    const [rows] = await pool.query<Record<string, unknown>[]>(sql, params);
    const data = (Array.isArray(rows) ? rows : []).map((r) => ({
      idProduto: r.idProduto ?? r.idproduto ?? 0,
      codigoSolicitacao: r.codigoSolicitacao != null ? Number(r.codigoSolicitacao) : (r.codigosolicitacao != null ? Number(r.codigosolicitacao) : null),
      qtdeSolicitada: r.qtdeSolicitada != null ? Number(r.qtdeSolicitada) : (r.qtdesolicitada != null ? Number(r.qtdesolicitada) : null),
      codigoProduto: r.codigoProduto ?? r.codigoproduto ?? '',
      descricaoProduto: r.descricaoProduto ?? r.descricaoproduto ?? '',
      unidadeMedida: r.unidadeMedida ?? r.unidademedida ?? null,
      tipoProduto: r.tipoProduto ?? r.tipoproduto ?? null,
      grupoProduto: r.grupoProduto ?? r.grupoproduto ?? null,
      idFamiliaProduto: r.idFamiliaProduto ?? r.idfamiliaproduto ?? null,
      familiaProduto: r.familiaProduto ?? r.familiaproduto ?? null,
      produtoAtivo: r.produtoAtivo ?? r.produtoativo ?? '',
      idFornecedor: r.idFornecedor ?? r.idfornecedor ?? null,
      ultimoFornecedor: r.ultimoFornecedor ?? r.ultimofornecedor ?? null,
      nomeColeta: r.nomeColeta ?? r.nomecoleta ?? null,
      diaSemana: r.diaSemana ?? r.diasemana ?? null,
    })) as ProdutoColetaRow[];
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasRepository] listarProdutosColeta:', msg);
    return { data: [], erro: msg };
  }
}

/** Item para buscar registro: idProduto e opcionalmente idSolicitacao (retorna só a linha da solicitação escolhida). */
export interface ItemRegistroColeta {
  idProduto: number;
  idSolicitacao?: number | null;
}

function keyIdProduto(r: Record<string, unknown>): number {
  const k = Object.keys(r).find((key) => /^id\s*produto$/i.test(String(key).trim()));
  const raw = k ? r[k] : r['Id Produto'] ?? r['id produto'] ?? r.idProduto;
  return Number(raw ?? 0);
}

function keyIdSolicitacao(r: Record<string, unknown>): number | null {
  const k = Object.keys(r).find((key) => /^id\s*solicita/i.test(String(key).trim()));
  const raw = k ? r[k] : r['Id Solicitação'] ?? r['Id Solicitacao'] ?? r.idSolicitacao;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Executa o SQL de registro da coleta no Nomus.
 * Aceita itens com idProduto e opcional idSolicitacao; retorna exatamente uma linha por item
 * (a linha da solicitação escolhida, evitando múltiplos registros para o mesmo produto).
 */
export async function buscarRegistroColetaNomus(itens: ItemRegistroColeta[]): Promise<{
  rows: Record<string, unknown>[];
  erro?: string;
}> {
  if (itens.length === 0) return { rows: [] };
  const pool = getNomusPool();
  if (!pool) return { rows: [], erro: 'NOMUS_DB_URL não configurado' };
  const idProdutosUnicos = [...new Set(itens.map((i) => i.idProduto))];
  try {
    const placeholders = idProdutosUnicos.map(() => '?').join(', ');
    const sql = `${SQL_REGISTRO_COLETA_BASE} AND p.id IN (${placeholders})`;
    const [rows] = await pool.query<Record<string, unknown>[]>(sql, idProdutosUnicos);
    const list = Array.isArray(rows) ? rows : [];
    const result: Record<string, unknown>[] = [];
    const usedIndex = new Set<number>();
    for (const item of itens) {
      const sid = item.idSolicitacao ?? null;
      const idx = list.findIndex((r, i) => {
        if (usedIndex.has(i)) return false;
        const rid = keyIdProduto(r as Record<string, unknown>);
        const rsid = keyIdSolicitacao(r as Record<string, unknown>);
        if (rid !== item.idProduto) return false;
        return sid != null ? rsid === sid : true;
      });
      if (idx >= 0) {
        usedIndex.add(idx);
        result.push(list[idx] as Record<string, unknown>);
      }
    }
    return { rows: result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasRepository] buscarRegistroColetaNomus:', msg);
    return { rows: [], erro: msg };
  }
}

export interface FornecedorOpcaoRow {
  id: number;
  nome: string;
  nomeRazaoSocial: string | null;
  uf: string | null;
  cnpjCpf: string | null;
}

/**
 * Lista fornecedores ativos (pessoa.fornecedor=1, ativo=1) para o popup de seleção da cotação.
 * SQL conforme definido: id, nome (cnpjCpf - nome), nomeRazaoSocial, uf, cnpjCpf.
 */
export async function listarFornecedoresAtivos(): Promise<{ data: FornecedorOpcaoRow[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { data: [], erro: 'NOMUS_DB_URL não configurado' };
  try {
    const sql = `Select
  p.id,
  Concat(p.cnpjCpf, ' - ', p.nome) As nome,
  p.nomeRazaoSocial,
  p.uf,
  p.cnpjCpf
From
  pessoa p
Where
  (p.nomeRazaoSocial Is Not Null) And
  (p.fornecedor = 1) And
  (p.ativo = 1)
Order By
  p.nomeRazaoSocial`;
    const [rows] = await pool.query<Record<string, unknown>[]>(sql);
    const data = (Array.isArray(rows) ? rows : []).map((r) => ({
      id: Number(r.id ?? 0),
      nome: String(r.nome ?? r.Nome ?? '').trim(),
      nomeRazaoSocial: r.nomeRazaoSocial != null ? String(r.nomeRazaoSocial).trim() : null,
      uf: r.uf != null ? String(r.uf).trim() : null,
      cnpjCpf: r.cnpjCpf != null ? String(r.cnpjCpf).trim() : null,
    })) as FornecedorOpcaoRow[];
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasRepository] listarFornecedoresAtivos:', msg);
    return { data: [], erro: msg };
  }
}

export interface OpcaoNomusRow {
  id: number;
  nome: string;
}

/**
 * Lista condições de pagamento ativas do Nomus (condicaopagamento ativo = 1).
 */
export async function listarCondicoesPagamentoNomus(): Promise<{ data: OpcaoNomusRow[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { data: [], erro: 'NOMUS_DB_URL não configurado' };
  try {
    const sql = `SELECT id, nome FROM condicaopagamento c WHERE ativo = 1 ORDER BY nome`;
    const [rows] = await pool.query<Record<string, unknown>[]>(sql);
    const data = (Array.isArray(rows) ? rows : []).map((r) => ({
      id: Number(r.id ?? 0),
      nome: String(r.nome ?? '').trim(),
    })) as OpcaoNomusRow[];
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasRepository] listarCondicoesPagamentoNomus:', msg);
    return { data: [], erro: msg };
  }
}

/**
 * Lista formas de pagamento ativas do Nomus (formapagamento ativo = 1).
 */
export async function listarFormasPagamentoNomus(): Promise<{ data: OpcaoNomusRow[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { data: [], erro: 'NOMUS_DB_URL não configurado' };
  try {
    const sql = `SELECT id, nome FROM formapagamento f WHERE ativo = 1 ORDER BY nome`;
    const [rows] = await pool.query<Record<string, unknown>[]>(sql);
    const data = (Array.isArray(rows) ? rows : []).map((r) => ({
      id: Number(r.id ?? 0),
      nome: String(r.nome ?? '').trim(),
    })) as OpcaoNomusRow[];
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[comprasRepository] listarFormasPagamentoNomus:', msg);
    return { data: [], erro: msg };
  }
}
