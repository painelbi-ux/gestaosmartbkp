/**
 * MPP: Nomus (mppQuery.sql). Previsão: PD+Cod (MPP) ↔ Gestor; fallback SQLite por maior data de previsão.
 * Cache de pedidos invalidado a cada carga para alinhar ao Gestor.
 * Grade: resumo por dia + código do componente; estoque inicial = soma (MP PA por par PA+componente) + saldo setores (mppEstoqueSetores.sql, pd.nome = codigoComponente);
 * consumo progressivo no total; coluna disp. início = estoque remanescente (MP PA + setores já embutidos no débito).
 * Pedidos com TipoF Requisição ou Inserir em Romaneio: data de previsão forçada para 2199-12-31 (fim da fila, sem consumir estoque antes).
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import type { Pool } from 'mysql2/promise';
import { getNomusPool, isNomusEnabled } from '../config/nomusDb.js';
import { prisma } from '../config/prisma.js';
import {
  buildSetChavesPedidoCodMppPrevisaoFim,
  invalidatePedidosCache,
  listarPedidos,
  type PedidoRow,
} from '../data/pedidosRepository.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = 'mppQuery.sql';
const SQL_FILE_ESTOQUE_SETORES = 'mppEstoqueSetores.sql';

function resolveDataSqlPath(filename: string): string {
  const candidates = [
    join(__dirname, '..', 'data', filename),
    join(process.cwd(), 'src', 'data', filename),
    join(process.cwd(), 'dist', 'data', filename),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`Arquivo ${filename} não encontrado.`);
}

let sqlCache: string | null = null;

function getMppSql(): string {
  if (sqlCache) return sqlCache;
  sqlCache = readFileSync(resolveDataSqlPath(SQL_FILE), 'utf-8').trim();
  return sqlCache;
}

let mppEstoqueSetoresSqlCache: string | null = null;

function getMppEstoqueSetoresSql(): string {
  if (mppEstoqueSetoresSqlCache) return mppEstoqueSetoresSqlCache;
  mppEstoqueSetoresSqlCache = readFileSync(resolveDataSqlPath(SQL_FILE_ESTOQUE_SETORES), 'utf-8').trim();
  return mppEstoqueSetoresSqlCache;
}

/** Saldo setores (2,19,20) por código produto = nome no ERP; falha → mapa vazio. */
export async function obterEstoqueSetoresPorCodigoProduto(pool: Pool): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const sql = getMppEstoqueSetoresSql();
    const [rows] = await pool.query(sql);
    if (!Array.isArray(rows)) return map;
    for (const r of rows as Record<string, unknown>[]) {
      const cod = String(r.codigoProduto ?? '').trim();
      if (!cod) continue;
      const v = Number(r.estoque);
      map.set(cod, Number.isFinite(v) ? v : 0);
    }
  } catch (e) {
    console.warn('[mppController] obterEstoqueSetoresPorCodigoProduto:', (e as Error)?.message);
  }
  return map;
}

function previsaoNovaToIso(val: unknown): string | null {
  const d = val instanceof Date ? val : new Date(val as string | number);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Gera chave alternativa sem romaneio: idChave é "deId-pedidoId-produtoId";
 * o Gestor pode ter gravado como "0000000-pedidoId-produtoId". Retorna essa chave para fallback.
 */
function idChaveParaFallback(idChave: string): string | null {
  const s = String(idChave ?? '').trim();
  const parts = s.split('-');
  if (parts.length < 3) return null;
  return '0000000-' + parts.slice(1).join('-');
}

type PrevisaoUltima = { iso: string; ts: number };

const PRISMA_IN_CHUNK = 400;
/** Último ajuste por id_pedido (iso + timestamp de data_ajuste) para comparar entre vários romaneios do mesmo PD+Código. */
async function obterUltimaPrevisaoPorIdPedido(ids: string[]): Promise<Map<string, PrevisaoUltima>> {
  const idsNorm = [...new Set(ids.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (idsNorm.length === 0) return new Map();
  const fallbacks = idsNorm.map(idChaveParaFallback).filter((x): x is string => x != null);
  const todosIds = [...new Set([...idsNorm, ...fallbacks])];
  const map = new Map<string, PrevisaoUltima>();
  for (let i = 0; i < todosIds.length; i += PRISMA_IN_CHUNK) {
    const chunk = todosIds.slice(i, i + PRISMA_IN_CHUNK);
    const list = await prisma.pedidoPrevisaoAjuste.findMany({
      where: { id_pedido: { in: chunk } },
      select: { id_pedido: true, previsao_nova: true, data_ajuste: true },
      orderBy: [{ data_ajuste: 'desc' }, { id: 'desc' }],
    });
    for (const r of list) {
      const key = String(r.id_pedido ?? '').trim();
      if (!key || map.has(key)) continue;
      const iso = previsaoNovaToIso(r.previsao_nova);
      if (!iso) continue;
      const dAdj = r.data_ajuste instanceof Date ? r.data_ajuste : new Date(r.data_ajuste as string | number);
      const ts = Number.isNaN(dAdj.getTime()) ? 0 : dAdj.getTime();
      map.set(key, { iso, ts });
    }
  }
  return map;
}

/**
 * Chave de negócio: pedido (nome PD) + código do produto (Cod), alinhada entre MPP e Gerenciador.
 * Normalização: trim, espaços internos colapsados, comparação sem distinção de maiúsculas.
 */
function chavePedidoMaisCod(pedido: unknown, codProduto: unknown): string {
  const norm = (v: unknown) =>
    String(v ?? '')
      .normalize('NFKC')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  const p = norm(pedido);
  const c = norm(codProduto);
  if (!p || !c) return '';
  return `${p}\x1e${c}`;
}

function lerMppPedidoEProduto(r: Record<string, unknown>): { pedido: unknown; produto: unknown } {
  return {
    pedido: r.Codigo_pedido ?? r['Codigo_pedido'] ?? r.codigo_pedido,
    produto: r.Codigo_produto ?? r['Codigo_produto'] ?? r.codigo_produto,
  };
}

function lerPdECodGerenciador(r: Record<string, unknown>): { pd: unknown; cod: unknown } {
  return {
    pd: r.PD ?? r['PD'] ?? r.pd,
    cod: r.Cod ?? r['Cod'] ?? r.cod,
  };
}

/**
 * Todas as idChave do Gerenciador para o mesmo par (PD + Cod) — pode haver mais de uma (romaneios).
 * Não sobrescrever: antes ficava só a última linha e a previsão podia ser de outro vínculo.
 */
function buildMapPedidoCodParaListaIdChaves(pedidos: PedidoRow[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const row of pedidos) {
    const r = row as Record<string, unknown>;
    const { pd, cod } = lerPdECodGerenciador(r);
    const idChave = String(row.id_pedido ?? '').trim();
    if (!idChave) continue;
    const k = chavePedidoMaisCod(pd, cod);
    if (!k) continue;
    const list = m.get(k) ?? [];
    if (!list.includes(idChave)) list.push(idChave);
    m.set(k, list);
  }
  return m;
}

/** Mesma “Previsão atual” do Gerenciador (já mesclada no listarPedidos). Com várias linhas no mesmo PD+Cod, usa a data mais tardia (ISO). */
function previsaoGestorRowIso(row: PedidoRow): string | null {
  const p = row.previsao_entrega_atualizada ?? row.previsao_entrega;
  if (p == null) return null;
  const d = p instanceof Date ? p : new Date(p as string);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function buildMapPedidoCodParaMaiorPrevisaoGestor(pedidos: PedidoRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const row of pedidos) {
    const r = row as Record<string, unknown>;
    const { pd, cod } = lerPdECodGerenciador(r);
    const k = chavePedidoMaisCod(pd, cod);
    if (!k) continue;
    const iso = previsaoGestorRowIso(row);
    if (!iso) continue;
    const cur = m.get(k);
    if (!cur || iso > cur) m.set(k, iso);
  }
  return m;
}

function adicionarChaveEVariante0000000(set: Set<string>, idChave: string): void {
  const t = String(idChave ?? '').trim();
  if (!t) return;
  set.add(t);
  const fb = idChaveParaFallback(t);
  if (fb) set.add(fb);
}

/**
 * Entre várias idChave (romaneios diferentes), prefere a **maior data de previsão** (alinha à “previsão atual”
 * quando há linhas com datas distintas). Empate: mantém o ajuste com data_ajuste mais recente.
 */
function escolherPrevisaoEntreCandidatos(
  idChavesCandidatas: string[],
  porId: Map<string, PrevisaoUltima>
): string | null {
  let best: PrevisaoUltima | null = null;
  const vistos = new Set<string>();
  for (const raw of idChavesCandidatas) {
    const key = String(raw ?? '').trim();
    if (!key || vistos.has(key)) continue;
    vistos.add(key);
    const variantes = [key, idChaveParaFallback(key)].filter((x): x is string => Boolean(x));
    for (const k of variantes) {
      const hit = porId.get(k);
      if (!hit) continue;
      if (!best || hit.iso > best.iso || (hit.iso === best.iso && hit.ts > best.ts)) best = hit;
    }
  }
  return best?.iso ?? null;
}

const DEFAULT_PAGE_SIZE = 200;
const MAX_PAGE_SIZE = 500;
/** Máximo de linhas buscadas do ERP para ordenar por Data de Previsão e calcular acumulado em memória. */
const FETCH_LIMIT_FOR_SORT = 10000;
/** Limite maior só para o horizonte MRP: grade MPP com filtros pode mostrar componentes fora das primeiras 10k linhas brutas. */
export const FETCH_LIMIT_MPP_HORIZONTE = 500_000;
/** Data fictícia para MPP: pedidos Requisição / Inserir em Romaneio (fim da ordem, após o restante). */
const MPP_PREVISAO_FIM_FILA_ISO = '2199-12-31';

function parseBool(val: unknown): boolean {
  if (val === true || val === 'true' || val === '1') return true;
  return false;
}

/**
 * Estoque_MP_PA = Estoque_PA x Qtd Unitária do Componente (`qtd` no SQL).
 */
function fillEstoqueMPPA(rows: Record<string, unknown>[]): void {
  for (const row of rows) {
    const estoquePA = Number(row.Estoque_PA) || 0;
    const qtdUnit = Number(row.qtd) || 0;
    row.Estoque_MP_PA = estoquePA * qtdUnit;
  }
}

/** Extrai YYYY-MM-DD da previsão (ISO ou prefixo). Exportado para o horizonte MRP alinhar ao MPP. */
export function mppDiaIsoDataPrevisao(val: unknown): string | null {
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val ?? '').trim();
  if (!s) return null;
  const mIso = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  if (mIso) return mIso[1]!;
  const mBr = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (mBr) return `${mBr[3]}-${mBr[2]}-${mBr[1]}`;
  return null;
}

const SEP_DIA_COMP = '\x1e';
/** Chave PA + componente: um valor de Estoque_MP_PA por par (duplicatas de linha colapsadas com max). */
const SEP_PA_COMP = '\x1f';

/**
 * Agrupa demanda por (dia, código componente). Parte MPP: por par PA+componente (max nas duplicatas), somada entre PAs.
 * Estoque inicial do débito progressivo = essa soma + estoqueSetoresPorCodigo.get(codigoComponente) (pd.nome no ERP).
 * Percorre dias do mais antigo ao mais recente; disp. início = remanescente; Saldo = max(0, demanda − disp.).
 */
function buildMppResumoDiarioProgressivo(
  linhas: Record<string, unknown>[],
  estoqueSetoresPorCodigo: Map<string, number>
): Record<string, unknown>[] {
  type DiaAgg = { qtde: number; componente: string };
  const porDiaComp = new Map<string, DiaAgg>();
  const estoquePorParPaComp = new Map<string, number>();

  for (const row of linhas) {
    const dia = mppDiaIsoDataPrevisao(row.dataPrevisao);
    if (!dia) continue;
    const cod = String(row.codigoComponente ?? '').trim();
    const compNome = String(row.componente ?? '').trim();
    const qtc = Number(row.qtdTotalComponente) || 0;
    const emp = Number(row.Estoque_MP_PA) || 0;
    const pa = String(row.Codigo_produto ?? row['Codigo_produto'] ?? '').trim();
    const parKey = `${pa}${SEP_PA_COMP}${cod}`;

    const key = `${cod}${SEP_DIA_COMP}${dia}`;
    const prev = porDiaComp.get(key);
    if (prev) {
      prev.qtde += qtc;
      if (compNome.length > prev.componente.length) prev.componente = compNome;
    } else {
      porDiaComp.set(key, { qtde: qtc, componente: compNome });
    }

    const curPar = estoquePorParPaComp.get(parKey);
    if (curPar == null || emp > curPar) estoquePorParPaComp.set(parKey, emp);
  }

  const estoquePorComp = new Map<string, number>();
  for (const [parKey, v] of estoquePorParPaComp) {
    const sepAt = parKey.lastIndexOf(SEP_PA_COMP);
    const codComp = sepAt >= 0 ? parKey.slice(sepAt + SEP_PA_COMP.length) : parKey;
    estoquePorComp.set(codComp, (estoquePorComp.get(codComp) ?? 0) + v);
  }

  const datasPorComp = new Map<string, string[]>();
  for (const key of porDiaComp.keys()) {
    const sep = key.indexOf(SEP_DIA_COMP);
    const cod = sep >= 0 ? key.slice(0, sep) : key;
    const dia = sep >= 0 ? key.slice(sep + SEP_DIA_COMP.length) : '';
    const arr = datasPorComp.get(cod) ?? [];
    if (dia && !arr.includes(dia)) arr.push(dia);
    datasPorComp.set(cod, arr);
  }
  for (const arr of datasPorComp.values()) {
    arr.sort((a, b) => a.localeCompare(b));
  }

  const out: Record<string, unknown>[] = [];
  const componentesOrdenados = [...datasPorComp.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  for (const cod of componentesOrdenados) {
    const dias = datasPorComp.get(cod) ?? [];
    const mppPart = estoquePorComp.get(cod) ?? 0;
    const setoresPart = estoqueSetoresPorCodigo.get(cod) ?? 0;
    let remaining = mppPart + setoresPart;
    for (const dia of dias) {
      const agg = porDiaComp.get(`${cod}${SEP_DIA_COMP}${dia}`);
      if (!agg) continue;
      const demanda = agg.qtde;
      const estoqueDisponivelInicio = remaining;
      const saldo = Math.max(0, demanda - estoqueDisponivelInicio);
      remaining = Math.max(0, estoqueDisponivelInicio - demanda);
      out.push({
        dataPrevisao: dia,
        codigoComponente: cod,
        componente: agg.componente,
        qtdeTotalComponente: demanda,
        estoqueMPPA: estoqueDisponivelInicio,
        saldo,
      });
    }
  }
  return out;
}

export type MppFiltrosLista = {
  codigoPedido: string;
  codigoProduto: string;
  cliente: string;
  segmentacao: string;
  codigoComponente: string;
  componente: string;
  apenasComPrevisao: boolean;
};

function parseMppFiltrosFromQuery(req: Request): MppFiltrosLista {
  return {
    codigoPedido: typeof req.query.codigo_pedido === 'string' ? req.query.codigo_pedido.trim() : '',
    codigoProduto: typeof req.query.codigo_produto === 'string' ? req.query.codigo_produto.trim() : '',
    cliente: typeof req.query.cliente === 'string' ? req.query.cliente.trim() : '',
    segmentacao: typeof req.query.segmentacao === 'string' ? req.query.segmentacao.trim() : '',
    codigoComponente: typeof req.query.codigo_componente === 'string' ? req.query.codigo_componente.trim() : '',
    componente: typeof req.query.componente === 'string' ? req.query.componente.trim() : '',
    apenasComPrevisao: parseBool(req.query.apenas_com_previsao),
  };
}

/**
 * Linhas MPP brutas (ERP + previsão + Estoque_MP_PA calculado), antes do resumo diário.
 */
async function carregarLinhasMppFiltradas(
  pool: Pool,
  f: MppFiltrosLista,
  rawFetchLimit: number = FETCH_LIMIT_FOR_SORT
): Promise<{ linhas: Record<string, unknown>[]; rawTruncated: boolean }> {
  const sqlBase = getMppSql();
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (f.codigoPedido) {
    conditions.push('`Codigo_pedido` LIKE ?');
    params.push(`%${f.codigoPedido}%`);
  }
  if (f.codigoProduto) {
    conditions.push('TRIM(mpp_sub.`Codigo_produto`) LIKE ?');
    params.push(`%${f.codigoProduto}%`);
  }
  if (f.cliente) {
    conditions.push('`Cliente` LIKE ?');
    params.push(`%${f.cliente}%`);
  }
  if (f.segmentacao) {
    conditions.push('`Segmentacao_carradas` LIKE ?');
    params.push(`%${f.segmentacao}%`);
  }
  if (f.codigoComponente) {
    conditions.push('`codigoComponente` LIKE ?');
    params.push(`%${f.codigoComponente}%`);
  }
  if (f.componente) {
    conditions.push('`componente` LIKE ?');
    params.push(`%${f.componente}%`);
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM (${sqlBase}) AS mpp_sub${whereClause} LIMIT ? OFFSET ?`;
  params.push(rawFetchLimit, 0);

  const [rows] = await pool.query(sql, params);
  const raw = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
  const rawTruncated = raw.length >= rawFetchLimit;

  let pedidoCodParaListaIdChave = new Map<string, string[]>();
  let pedidoCodParaMaiorPrevisaoIso = new Map<string, string>();
  let chavesPedidoCodMppPrevisaoFim = new Set<string>();
  try {
    invalidatePedidosCache();
    const { data: pedidos } = await listarPedidos({});
    pedidoCodParaListaIdChave = buildMapPedidoCodParaListaIdChaves(pedidos);
    pedidoCodParaMaiorPrevisaoIso = buildMapPedidoCodParaMaiorPrevisaoGestor(pedidos);
    chavesPedidoCodMppPrevisaoFim = buildSetChavesPedidoCodMppPrevisaoFim(pedidos);
  } catch (e) {
    console.warn('[mppController] listarPedidos para cruzar PD+Cod falhou:', (e as Error)?.message);
  }

  const chavesParaBuscar = new Set<string>();
  for (const r of raw) {
    adicionarChaveEVariante0000000(chavesParaBuscar, String(r.idChave ?? r.idchave ?? ''));
    const { pedido, produto } = lerMppPedidoEProduto(r);
    const kNegocio = chavePedidoMaisCod(pedido, produto);
    if (!kNegocio) continue;
    const lista = pedidoCodParaListaIdChave.get(kNegocio);
    if (lista) {
      for (const idc of lista) adicionarChaveEVariante0000000(chavesParaBuscar, idc);
    }
  }

  let porIdExato = new Map<string, PrevisaoUltima>();
  try {
    porIdExato = await obterUltimaPrevisaoPorIdPedido([...chavesParaBuscar]);
  } catch (e) {
    console.warn('[mppController] obterUltimaPrevisaoPorIdPedido falhou:', (e as Error)?.message);
  }

  let data = raw.map((r) => {
    const idChaveMpp = String(r.idChave ?? r.idchave ?? '').trim();
    const { pedido, produto } = lerMppPedidoEProduto(r);
    const kNegocio = chavePedidoMaisCod(pedido, produto);
    let dataPrevisao: string | null =
      kNegocio ? pedidoCodParaMaiorPrevisaoIso.get(kNegocio) ?? null : null;
    if (!dataPrevisao) {
      const doGestor = kNegocio ? (pedidoCodParaListaIdChave.get(kNegocio) ?? []) : [];
      const candidatos = [...doGestor];
      if (idChaveMpp && !candidatos.includes(idChaveMpp)) candidatos.push(idChaveMpp);
      dataPrevisao = escolherPrevisaoEntreCandidatos(candidatos, porIdExato);
    }
    if (kNegocio && chavesPedidoCodMppPrevisaoFim.has(kNegocio)) {
      dataPrevisao = MPP_PREVISAO_FIM_FILA_ISO;
    }
    const linha = typeof r === 'object' && r !== null ? { ...(r as object) } : {};
    return { ...linha, dataPrevisao } as Record<string, unknown>;
  });

  if (f.apenasComPrevisao) {
    data = data.filter((r) => String(r.dataPrevisao ?? '').trim() !== '');
  }
  fillEstoqueMPPA(data);

  return { linhas: data, rawTruncated };
}

export type ListarMppDadosFiltradosOpts = {
  /** Padrão: FETCH_LIMIT_FOR_SORT. Use FETCH_LIMIT_MPP_HORIZONTE para o horizonte MRP. */
  rawFetchLimit?: number;
};

/**
 * Resumo diário por componente com estoque progressivo (até `rawFetchLimit` linhas brutas do ERP).
 */
export async function listarMppDadosFiltrados(
  pool: Pool,
  f: MppFiltrosLista,
  opts?: ListarMppDadosFiltradosOpts
): Promise<Record<string, unknown>[]> {
  const lim = opts?.rawFetchLimit ?? FETCH_LIMIT_FOR_SORT;
  const { linhas } = await carregarLinhasMppFiltradas(pool, f, lim);
  const estSet = await obterEstoqueSetoresPorCodigoProduto(pool);
  return buildMppResumoDiarioProgressivo(linhas, estSet);
}

/** Mesmos filtros vazios usados no horizonte MRP ao buscar MPP bruto. */
export const MPP_FILTROS_VAZIOS: MppFiltrosLista = {
  codigoPedido: '',
  codigoProduto: '',
  cliente: '',
  segmentacao: '',
  codigoComponente: '',
  componente: '',
  apenasComPrevisao: false,
};

/**
 * Soma, por código do componente, todas as «Qtde total componente (no dia)» do resumo MPP
 * (sem filtros de data ou de grade — todo o período coberto pelo resumo).
 * Usa o mesmo teto de linhas brutas do horizonte MRP; `limitHit` indica truncagem no ERP.
 */
export async function somarQtdeTotalComponenteMppPorCodigoSemFiltro(pool: Pool): Promise<{
  totais: Record<string, number>;
  limitHit: boolean;
}> {
  const { linhas, rawTruncated } = await carregarLinhasMppFiltradas(
    pool,
    MPP_FILTROS_VAZIOS,
    FETCH_LIMIT_MPP_HORIZONTE
  );
  const estSet = await obterEstoqueSetoresPorCodigoProduto(pool);
  const resumo = buildMppResumoDiarioProgressivo(linhas, estSet);
  const totais: Record<string, number> = {};
  for (const row of resumo) {
    const cod = String(row.codigoComponente ?? '').trim();
    if (!cod) continue;
    const q = Number(row.qtdeTotalComponente);
    if (!Number.isFinite(q)) continue;
    totais[cod] = (totais[cod] ?? 0) + q;
  }
  return { totais, limitHit: rawTruncated };
}

/** GET /api/mpp — resumo MPP por dia e componente + previsão do Gestor (paginado). */
export async function getMpp(req: Request, res: Response): Promise<void> {
  const pool = getNomusPool();
  if (!pool || !isNomusEnabled()) {
    res.status(503).json({ error: 'ERP (Nomus) não configurado.', data: [] });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query.page ?? 1), 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(String(req.query.pageSize ?? DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );
  const offset = (page - 1) * pageSize;
  const filtros = parseMppFiltrosFromQuery(req);

  try {
    const { linhas, rawTruncated } = await carregarLinhasMppFiltradas(pool, filtros);
    const estSet = await obterEstoqueSetoresPorCodigoProduto(pool);
    const data = buildMppResumoDiarioProgressivo(linhas, estSet);
    const total = data.length;
    const pageData = data.slice(offset, offset + pageSize);
    const hasMore = offset + pageData.length < total;

    res.json({ data: pageData, page, pageSize, total, hasMore, limitHit: rawTruncated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[mppController] getMpp:', msg);
    res.status(503).json({ error: 'Erro ao consultar MPP no ERP.', data: [] });
  }
}

/** GET /api/mpp/export — mesmo resumo da grade (até o limite interno de linhas ERP). */
export async function getMppExport(req: Request, res: Response): Promise<void> {
  const pool = getNomusPool();
  if (!pool || !isNomusEnabled()) {
    res.status(503).json({ error: 'ERP (Nomus) não configurado.', data: [] });
    return;
  }

  const filtros = parseMppFiltrosFromQuery(req);

  try {
    const { linhas, rawTruncated } = await carregarLinhasMppFiltradas(pool, filtros);
    const estSet = await obterEstoqueSetoresPorCodigoProduto(pool);
    const data = buildMppResumoDiarioProgressivo(linhas, estSet);
    res.json({ data, total: data.length, limitHit: rawTruncated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[mppController] getMppExport:', msg);
    res.status(503).json({ error: 'Erro ao exportar MPP.', data: [] });
  }
}
