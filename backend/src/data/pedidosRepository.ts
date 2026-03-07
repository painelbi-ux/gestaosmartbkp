/**
 * Pedidos: base lida do Nomus (MySQL, somente leitura). Ajustes no SQLite local.
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { getNomusPool, isNomusEnabled } from '../config/nomusDb.js';
import { setLastSyncErp } from '../config/statusApp.js';
import { geocodeMunicipio, geocodeFromCache, chaveLocal } from '../services/geocode.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = 'sqlBasePedidosNomus.sql';

function resolveSqlPath(): string {
  const candidates = [
    join(__dirname, SQL_FILE),
    join(process.cwd(), 'src', 'data', SQL_FILE),
    join(process.cwd(), 'dist', 'data', SQL_FILE),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(
    `Arquivo ${SQL_FILE} não encontrado. Procurou em: ${candidates.join(', ')}. Execute npm run build no backend.`
  );
}

const SQL_BASE_NOMUS = readFileSync(resolveSqlPath(), 'utf-8').trim();

export interface FiltrosPedidos {
  cliente?: string;
  observacoes?: string;
  pd?: string;
  cod?: string;
  data_emissao_ini?: string;
  data_emissao_fim?: string;
  data_entrega_ini?: string;
  data_entrega_fim?: string;
  data_previsao_anterior_ini?: string;
  data_previsao_anterior_fim?: string;
  data_ini?: string;
  data_fim?: string;
  atrasados?: boolean;
  grupo_produto?: string;
  setor_producao?: string;
  uf?: string;
  municipio_entrega?: string;
  motivo?: string;
  vendedor?: string;
  tipo_f?: string;
  status?: string;
  metodo?: string;
  forma_pagamento?: string;
  descricao_produto?: string;
  a_vista?: string;
  requisicao_loja?: string;
  page?: number;
  limit?: number;
  /** Níveis de classificação para ordenar a lista antes da paginação (ex.: [{ id: 'previsao_atual', dir: 'asc' }, ...]). */
  sort_levels?: { id: string; dir: 'asc' | 'desc' }[];
}

export interface PedidoRow {
  id_pedido: string;
  cliente: string;
  produto: string;
  qtd: number;
  previsao_entrega: Date;
  previsao_entrega_atualizada: Date;
  /** Penúltimo registro do histórico de alterações (previsão antes da última). Exibido como "Previsão anterior". */
  previsao_anterior?: Date;
  [key: string]: unknown;
}

export interface ObservacaoResumo {
  observacao: string;
  quantidade: number;
}

/** Replica a coluna Status do Power Query (M): Atrasado / Em dia conforme TipoF, datas e Valor Pedido Total. */
function computarStatus(row: Record<string, unknown>): 'Atrasado' | 'Em dia' {
  const tipoF = String((row['TipoF'] ?? row['tipoF']) ?? '').toUpperCase();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const dataEntregaRaw = row['Data de entrega'] ?? row['Data de Entrega'] ?? row['dataParametro'];
  const dataEntrega =
    dataEntregaRaw != null ? new Date(dataEntregaRaw as string | Date) : null;
  if (dataEntrega) dataEntrega.setHours(0, 0, 0, 0);

  const emissaoRaw = row['Emissao'] ?? row['emissao'];
  const emissao = emissaoRaw != null ? new Date(emissaoRaw as string | Date) : null;
  if (emissao) emissao.setHours(0, 0, 0, 0);

  const valorRaw = row['Valor Pedido Total'] ?? row['Valor pedido total'];
  const valor = valorRaw != null ? Number(valorRaw) : NaN;
  const valorNum = Number.isNaN(valor) ? 0 : valor;

  const temReqOuGrande =
    tipoF.includes('REQUISICAO') ||
    tipoF.includes('REQUISIÇÃO') ||
    tipoF.includes('RETIRADA') ||
    tipoF.includes('GRANDE');

  if (temReqOuGrande && dataEntrega && dataEntrega.getTime() < hoje.getTime()) return 'Atrasado';
  if (!temReqOuGrande && valorNum >= 30000 && dataEntrega && dataEntrega.getTime() < hoje.getTime()) return 'Atrasado';
  if (!temReqOuGrande && valorNum < 30000 && emissao) {
    const emissaoMais45 = new Date(emissao);
    emissaoMais45.setDate(emissaoMais45.getDate() + 45);
    if (emissaoMais45.getTime() < hoje.getTime()) return 'Atrasado';
  }
  return 'Em dia';
}

/** Último e penúltimo ajuste por id_pedido (para Previsão atual e Previsão anterior). */
type AjusteInfo = {
  ultimo: { previsao_nova: Date; motivo: string | null; observacao: string | null };
  penultimo: Date | null;
};

/** Linha bruta do SQLite (datas podem vir como string, número ou timestamp ms). */
type AjusteRow = { id: number; id_pedido: string; previsao_nova: unknown; motivo: string; observacao: string | null; data_ajuste: unknown };

/** Busca último e penúltimo ajuste por id_pedido exato (mesmo critério do histórico). Assim a grade mostra a mesma previsão que o último registro do histórico. */
async function obterUltimoEPenultimoPorPedido(ids: string[]): Promise<Map<string, AjusteInfo>> {
  if (ids.length === 0) return new Map();
  const result = new Map<string, AjusteInfo>();
  const idsUnicos = [...new Set(ids)].filter((id) => id != null && String(id).trim() !== '');
  try {
    const todos = await prisma.pedidoPrevisaoAjuste.findMany({
      take: 15000,
      select: { id: true, id_pedido: true, previsao_nova: true, motivo: true, observacao: true, data_ajuste: true },
    });
    const porIdExato = new Map<string, AjusteRow[]>();
    for (const a of todos) {
      const idNorm = String(a.id_pedido ?? '').trim();
      if (!idNorm) continue;
      const list = porIdExato.get(idNorm) ?? [];
      list.push(a as AjusteRow);
      porIdExato.set(idNorm, list);
    }
    for (const [, list] of porIdExato) {
      list.sort((x, y) => {
        const tx = parseDateFromDb(x.data_ajuste).getTime();
        const ty = parseDateFromDb(y.data_ajuste).getTime();
        if (ty !== tx) return ty - tx;
        return (y.id ?? 0) - (x.id ?? 0);
      });
    }
    for (const idChave of idsUnicos) {
      const idNorm = String(idChave).trim();
      const list = porIdExato.get(idNorm);
      if (!list || list.length === 0) continue;
      const ultimo = list[0]!;
      const penultimo = list[1]?.previsao_nova ?? null;
      result.set(idChave, {
        ultimo: { previsao_nova: parseDateFromDb(ultimo.previsao_nova), motivo: ultimo.motivo, observacao: ultimo.observacao ?? null },
        penultimo: penultimo != null ? parseDateFromDb(penultimo) : null,
      });
    }
  } catch (err) {
    console.error('[obterUltimoEPenultimoPorPedido] Prisma falhou:', err instanceof Error ? err.message : err);
  }
  return result;
}

/** Mapeia linha do Nomus para formato do app; aplica último e penúltimo ajuste (SQLite). Retorna todos os campos do banco (row) mais os calculados. */
function rowNomusToPedido(
  row: Record<string, unknown>,
  ajustePorId: Map<string, AjusteInfo>
): PedidoRow {
  const idChave = String(row['idChave'] ?? '').trim();
  const cliente = String(row['Cliente'] ?? '');
  const produto = String(row['Descricao do produto'] ?? row['Cod'] ?? '');
  const qtde = Number(row['Qtde pedida'] ?? 0);
  const previsaoOriginal = row['dataParametro'] != null ? new Date(row['dataParametro'] as string | Date) : new Date();
  const info = ajustePorId.get(idChave);
  const previsaoAtualizada = info ? info.ultimo.previsao_nova : previsaoOriginal;
  const motivoAjuste = info?.ultimo.motivo ?? null;
  const observacaoAjuste = info?.ultimo.observacao ?? null;
  const previsaoAnterior = info?.penultimo ?? previsaoOriginal;

  const statusSql = row['StatusPedido'] ?? row['statusPedido'];
  const status =
    typeof statusSql === 'string' && statusSql.trim()
      ? statusSql.trim()
      : computarStatus(row);

  // Todos os dados do banco (row) primeiro; em seguida campos calculados/ajustes (prioridade)
  return {
    ...row,
    id_pedido: idChave,
    cliente,
    produto,
    qtd: qtde,
    previsao_entrega: previsaoOriginal,
    previsao_entrega_atualizada: previsaoAtualizada,
    previsao_anterior: previsaoAnterior,
    motivo_ultimo_ajuste: motivoAjuste,
    observacao_ultimo_ajuste: observacaoAjuste,
    Status: status,
  } as PedidoRow;
}

const BATCH_SIZE_AJUSTES = 500;

/** Colunas de data usadas na classificação (valor numérico para ordenar). */
const SORT_DATE_COLUMN_IDS = ['emissao', 'data_original', 'previsao_anterior', 'previsao_atual'];

/** Mapeamento coluna id -> chaves no row (espelhando o frontend). */
const SORT_COLUMN_KEYS: Record<string, string[]> = {
  observacoes: ['Observacoes', 'Observacoes ', 'Observações'],
  pd: ['PD'],
  cliente: ['Cliente'],
  cod: ['Cod'],
  descricao: ['Descricao do produto'],
  setor_producao: ['Setor de Producao', 'Setor de produção'],
  stauts: ['Stauts', 'Status'],
  uf: ['UF'],
  municipio: ['Municipio de entrega'],
  qtde_pendente_real: ['Qtde Pendente Real'],
  valor_pendente_real: ['Saldo a Faturar Real', 'Valor Pendente Real'],
  emissao: ['Emissao', 'emissao'],
  data_original: ['Data de entrega', 'dataParametro'],
};

function getSortValueBackend(row: PedidoRow, colId: string): string | number {
  if (SORT_DATE_COLUMN_IDS.includes(colId)) {
    if (colId === 'previsao_atual') {
      const d = row.previsao_entrega_atualizada ?? row.previsao_entrega;
      if (d == null) return Number.MAX_SAFE_INTEGER;
      const t = d instanceof Date ? d.getTime() : new Date(d as string).getTime();
      return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
    }
    if (colId === 'previsao_anterior') {
      const d = row.previsao_anterior ?? row.previsao_entrega;
      if (d == null) return Number.MAX_SAFE_INTEGER;
      const t = d instanceof Date ? d.getTime() : new Date(d as string).getTime();
      return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
    }
    const keys = SORT_COLUMN_KEYS[colId];
    if (keys) {
      const d = getDateFromRow(row, keys);
      if (d == null) return Number.MAX_SAFE_INTEGER;
      return d.getTime();
    }
    return Number.MAX_SAFE_INTEGER;
  }
  const keys = SORT_COLUMN_KEYS[colId];
  if (keys) {
    const s = getField(row, keys);
    return s === '' ? '' : s;
  }
  return '';
}

function comparePedidosBackend(
  a: PedidoRow,
  b: PedidoRow,
  levels: { id: string; dir: 'asc' | 'desc' }[]
): number {
  for (const { id, dir } of levels) {
    const va = getSortValueBackend(a, id);
    const vb = getSortValueBackend(b, id);
    let cmp: number;
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb;
    } else {
      cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
    }
    if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
  }
  return 0;
}

function applySortPedidos(resultado: PedidoRow[], sortLevels: { id: string; dir: 'asc' | 'desc' }[]): PedidoRow[] {
  if (!Array.isArray(sortLevels) || sortLevels.length === 0) return resultado;
  return [...resultado].sort((a, b) => comparePedidosBackend(a, b, sortLevels));
}

function getField(row: PedidoRow, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim().length > 0) return String(v).trim();
  }
  return '';
}

/** Obtém data do row (suporta várias chaves; MySQL pode retornar camelCase ou como no SQL). */
function getDateFromRow(row: PedidoRow, keys: string[]): Date | null {
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    const d = v instanceof Date ? v : new Date(v as string);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** Parse YYYY-MM-DD como meia-noite local (evita problema de fuso nos filtros). */
function parseLocalDate(isoDateStr: string): Date {
  const parts = isoDateStr.trim().split('-').map(Number);
  if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
    return new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  }
  return new Date(isoDateStr);
}

/** Fim do dia local para data fim. */
function parseLocalDateEnd(isoDateStr: string): Date {
  const parts = isoDateStr.trim().split('-').map(Number);
  if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
    return new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
  }
  const d = new Date(isoDateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Comparação só pelo dia (ignora hora); retorna timestamp para comparação. */
function getDateOnlyTimestamp(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Normaliza texto para comparação em filtros: remove acentos e deixa em minúsculas (ex.: Piauí e Piaui tratados como iguais). */
function normalizarParaFiltro(s: string): string {
  const t = String(s ?? '').trim();
  if (!t) return '';
  return t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Busca parcial com suporte a % (estilo SQL LIKE).
 * Sem %: contém o termo (case-insensitive, ignora acentos).
 * Com %: % = qualquer sequência; ex.: "São%" começa com São, "%Paulo" termina com Paulo.
 */
function makeTextMatcher(termo: string): (value: string) => boolean {
  const t = termo.trim();
  if (!t) return () => true;
  const termoNorm = normalizarParaFiltro(t);
  if (termo.includes('%')) {
    const parts = t.split('%');
    const regexStr = parts
      .map((p) => normalizarParaFiltro(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    const regex = new RegExp(`^${regexStr}$`, 'i');
    return (val) => regex.test(normalizarParaFiltro(val));
  }
  return (val) => normalizarParaFiltro(val).includes(termoNorm);
}

const CACHE_PEDIDOS_TTL_MS = 90 * 1000; // 90 segundos
let cachePedidos: { data: PedidoRow[]; expiresAt: number } | null = null;

/** Invalida o cache de pedidos (chamar após importação ou ajuste manual). */
export function invalidatePedidosCache(): void {
  cachePedidos = null;
}

/** Aplica filtros e ordenação em uma lista de pedidos (usado com cache). */
function applyFiltrosPedidos(resultado: PedidoRow[], filtros: FiltrosPedidos): PedidoRow[] {
  /** Filtro multi-valor (vírgula): mantém linha se o campo bater com qualquer valor. */
  function filterByMultiText(
    list: PedidoRow[],
    rawValue: string | undefined,
    getFieldValue: (p: PedidoRow) => string
  ): PedidoRow[] {
    if (!rawValue?.trim()) return list;
    const parts = rawValue.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return list;
    if (parts.length === 1) {
      const match = makeTextMatcher(parts[0]!);
      return list.filter((p) => match(getFieldValue(p)));
    }
    const matchers = parts.map((t) => makeTextMatcher(t));
    return list.filter((p) => {
      const val = getFieldValue(p);
      return matchers.some((m) => m(val));
    });
  }

  /** Filtro multi-valor exato (Sim/Não): mantém linha se o campo estiver no conjunto (ignora acentos). */
  function filterByMultiExact(
    list: PedidoRow[],
    rawValue: string | undefined,
    getFieldValue: (p: PedidoRow) => string
  ): PedidoRow[] {
    if (!rawValue?.trim()) return list;
    const parts = rawValue.split(',').map((s) => normalizarParaFiltro(s.trim())).filter(Boolean);
    if (parts.length === 0) return list;
    const set = new Set(parts);
    return list.filter((p) => {
      const v = normalizarParaFiltro(getFieldValue(p));
      return v && set.has(v);
    });
  }

  resultado = filterByMultiExact(resultado, filtros.cliente, (p) => p.cliente ?? '');
  resultado = filterByMultiText(resultado, filtros.observacoes, (p) =>
    getField(p, ['Observacoes', 'Observacoes ', 'observacoes', 'Observações'])
  );
  if (filtros.pd?.trim()) {
    const parts = filtros.pd.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      const set = new Set(parts.map((s) => normalizarParaFiltro(s)));
      resultado = resultado.filter((p) => {
        const pd = getField(p, ['PD', 'pd']);
        if (!pd) return false;
        const pdNorm = normalizarParaFiltro(pd);
        return set.has(pdNorm) || [...set].some((term) => pdNorm.includes(term) || term.includes(pdNorm));
      });
    } else {
      const termo = normalizarParaFiltro(filtros.pd.trim());
      resultado = resultado.filter((p) => {
        const pd = getField(p, ['PD', 'pd']);
        if (!pd) return false;
        const pdNorm = normalizarParaFiltro(pd);
        return pdNorm.includes(termo) || termo.includes(pdNorm);
      });
    }
  }
  resultado = filterByMultiExact(resultado, filtros.cod, (p) => getField(p, ['Cod', 'cod']));
  if (filtros.data_emissao_ini) {
    const ini = getDateOnlyTimestamp(parseLocalDate(filtros.data_emissao_ini));
    resultado = resultado.filter((p) => {
      const d = getDateFromRow(p, ['Emissao', 'emissao']);
      if (!d) return false;
      return getDateOnlyTimestamp(d) >= ini;
    });
  }
  if (filtros.data_emissao_fim) {
    const fim = getDateOnlyTimestamp(parseLocalDateEnd(filtros.data_emissao_fim));
    resultado = resultado.filter((p) => {
      const d = getDateFromRow(p, ['Emissao', 'emissao']);
      if (!d) return false;
      return getDateOnlyTimestamp(d) <= fim;
    });
  }
  if (filtros.data_entrega_ini) {
    const ini = getDateOnlyTimestamp(parseLocalDate(filtros.data_entrega_ini));
    resultado = resultado.filter((p) => {
      const d = getDateFromRow(p, ['Data de entrega', 'dataParametro', 'Data de Entrega']);
      if (!d) return false;
      return getDateOnlyTimestamp(d) >= ini;
    });
  }
  if (filtros.data_entrega_fim) {
    const fim = getDateOnlyTimestamp(parseLocalDateEnd(filtros.data_entrega_fim));
    resultado = resultado.filter((p) => {
      const d = getDateFromRow(p, ['Data de entrega', 'dataParametro', 'Data de Entrega']);
      if (!d) return false;
      return getDateOnlyTimestamp(d) <= fim;
    });
  }
  if (filtros.data_previsao_anterior_ini) {
    const ini = getDateOnlyTimestamp(parseLocalDate(filtros.data_previsao_anterior_ini));
    resultado = resultado.filter((p) => getDateOnlyTimestamp(new Date(p.previsao_entrega)) >= ini);
  }
  if (filtros.data_previsao_anterior_fim) {
    const fim = getDateOnlyTimestamp(parseLocalDateEnd(filtros.data_previsao_anterior_fim));
    resultado = resultado.filter((p) => getDateOnlyTimestamp(new Date(p.previsao_entrega)) <= fim);
  }
  if (filtros.data_ini) {
    const ini = getDateOnlyTimestamp(parseLocalDate(filtros.data_ini));
    resultado = resultado.filter((p) => getDateOnlyTimestamp(new Date(p.previsao_entrega_atualizada)) >= ini);
  }
  if (filtros.data_fim) {
    const fim = getDateOnlyTimestamp(parseLocalDateEnd(filtros.data_fim));
    resultado = resultado.filter((p) => getDateOnlyTimestamp(new Date(p.previsao_entrega_atualizada)) <= fim);
  }
  if (filtros.atrasados === true) {
    const hoje = getDateOnlyTimestamp(new Date());
    resultado = resultado.filter((p) => getDateOnlyTimestamp(new Date(p.previsao_entrega_atualizada)) < hoje);
  }
  resultado = filterByMultiText(resultado, filtros.grupo_produto, (p) =>
    getField(p, ['Grupo de produto', 'grupo de produto'])
  );
  resultado = filterByMultiText(resultado, filtros.setor_producao, (p) =>
    getField(p, ['Setor de Producao', 'Setor de produção'])
  );
  resultado = filterByMultiText(resultado, filtros.uf, (p) => getField(p, ['UF', 'uf']));
  resultado = filterByMultiText(resultado, filtros.municipio_entrega, (p) =>
    getField(p, ['Municipio de entrega', 'municipio de entrega'])
  );
  resultado = filterByMultiText(resultado, filtros.motivo, (p) => {
    const motivo = (p as PedidoRow & { motivo_ultimo_ajuste?: string | null }).motivo_ultimo_ajuste;
    return motivo != null ? String(motivo) : '';
  });
  resultado = filterByMultiText(resultado, filtros.vendedor, (p) =>
    getField(p, ['Vendedor/Representante', 'vendedor/representante'])
  );
  resultado = filterByMultiExact(resultado, filtros.tipo_f, (p) => getField(p, ['tipoF', 'tipo_f']));
  resultado = filterByMultiExact(resultado, filtros.status, (p) => {
    let s = getField(p, ['StatusPedido', 'statusPedido']);
    if (!s) {
      const previsao = p.previsao_entrega_atualizada ?? p.previsao_entrega;
      const atrasado = previsao ? getDateOnlyTimestamp(new Date(previsao)) < getDateOnlyTimestamp(new Date()) : false;
      s = atrasado ? 'Atrasado' : 'Em dia';
    }
    return s;
  });
  resultado = filterByMultiExact(resultado, filtros.metodo, (p) =>
    getField(p, ['Metodo de Entrega', 'metodo de entrega'])
  );
  resultado = filterByMultiText(resultado, filtros.forma_pagamento, (p) =>
    getField(p, ['Forma de Pagamento', 'forma de pagamento'])
  );
  resultado = filterByMultiText(resultado, filtros.descricao_produto, (p) =>
    getField(p, ['Descricao do produto', 'descricao do produto', 'produto'])
  );
  resultado = filterByMultiExact(resultado, filtros.a_vista, (p) =>
    getField(p, ['Entrada/A vista Ate 10d', 'Entrada/A vista Ate 10d ', 'entrada/a vista ate 10d'])
  );
  resultado = filterByMultiExact(resultado, filtros.requisicao_loja, (p) =>
    getField(p, ['Requisicao de loja do grupo?', 'requisicao de loja do grupo?'])
  );

  resultado.sort(
    (a, b) =>
      new Date(a.previsao_entrega_atualizada).getTime() - new Date(b.previsao_entrega_atualizada).getTime()
  );
  return resultado;
}

/** Lista pedidos do Nomus (read-only) + previsao_entrega_atualizada dos ajustes (SQLite). Usa cache 90s para filtros rápidos. */
export async function listarPedidos(filtros: FiltrosPedidos = {}): Promise<{
  data: PedidoRow[];
  total: number;
  erroConexao?: string;
}> {
  const pool = getNomusPool();
  if (!pool || !isNomusEnabled()) {
    return { data: [], total: 0, erroConexao: 'NOMUS_DB_URL não configurado' };
  }

  try {
    const now = Date.now();
    let resultado: PedidoRow[];

    if (cachePedidos && cachePedidos.expiresAt > now) {
      resultado = cachePedidos.data;
    } else {
      const [rows] = await pool.query(SQL_BASE_NOMUS);
      const list = (Array.isArray(rows) ? rows : []) as Record<string, unknown>[];
      const ids = [...new Set(list.map((r) => String(r['idChave'] ?? '').trim()).filter(Boolean))];
      const ajustePorId = await obterUltimoEPenultimoPorPedido(ids);
      resultado = list.map((r) => rowNomusToPedido(r, ajustePorId));
      cachePedidos = { data: resultado, expiresAt: now + CACHE_PEDIDOS_TTL_MS };
      setLastSyncErp();
    }

    resultado = applyFiltrosPedidos(resultado, filtros);
    if (filtros.sort_levels?.length) {
      resultado = applySortPedidos(resultado, filtros.sort_levels);
    }
    const total = resultado.length;
    const usePagination = filtros.page != null || filtros.limit != null;
    if (!usePagination) return { data: resultado, total };
    const page = Math.max(1, filtros.page ?? 1);
    const limit = Math.min(500, Math.max(1, filtros.limit ?? 100));
    const start = (page - 1) * limit;
    return { data: resultado.slice(start, start + limit), total };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[listarPedidos] Nomus/Prisma falhou:', msg);
    if (err instanceof Error && err.stack) console.error(err.stack);
    return { data: [], total: 0, erroConexao: msg };
  }
}

/** Chaves para Saldo a Faturar Real no row (nomus/export). */
const KEYS_VALOR_PENDENTE_REAL = ['Saldo a Faturar Real', 'Valor Pendente Real', 'Valor Pendente', 'valor pendente real', 'valor pendente'];

/** Resumo para o dashboard (total, entrega hoje, atrasados, lead time médio, totais por valor pendente real). Opcionalmente filtrado por observacoes (rota). */
export async function obterResumoDashboard(filtros: { observacoes?: string } = {}): Promise<{
  total: number;
  entregaHoje: number;
  atrasados: number;
  leadTimeMedioDias: number | null;
  totalValorPendenteReal: number;
  atrasadosValorPendenteReal: number;
}> {
  const { data: pedidos } = await listarPedidos(filtros);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  let entregaHoje = 0;
  let atrasados = 0;
  let somaDias = 0;
  let countDias = 0;
  let totalValorPendenteReal = 0;
  let atrasadosValorPendenteReal = 0;

  for (const p of pedidos) {
    const valor = Math.max(0, getNumberFromRow(p, KEYS_VALOR_PENDENTE_REAL));
    totalValorPendenteReal += valor;

    const d = new Date(p.previsao_entrega_atualizada);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === hoje.getTime()) entregaHoje++;
    if (d < hoje) {
      atrasados++;
      atrasadosValorPendenteReal += valor;
    }
    const dias = Math.round((d.getTime() - hoje.getTime()) / (24 * 60 * 60 * 1000));
    somaDias += dias;
    countDias++;
  }

  return {
    total: pedidos.length,
    entregaHoje,
    atrasados,
    leadTimeMedioDias: countDias > 0 ? Math.round(somaDias / countDias) : null,
    totalValorPendenteReal,
    atrasadosValorPendenteReal,
  };
}

/** Valor numérico de uma coluna do row (suporta várias chaves). */
function getNumberFromRow(row: PedidoRow, keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

/** Busca valor numérico tentando chaves exatas e depois casamento case-insensitive nas chaves do row (MySQL pode devolver nomes em maiúsculas/minúsculas). */
function getNumberFromRowLoose(row: PedidoRow, keys: string[]): number {
  const exact = getNumberFromRow(row, keys);
  if (exact !== 0) return exact;
  const keyLower = keys.map((k) => k.toLowerCase());
  for (const k of Object.keys(row)) {
    if (keyLower.includes(k.toLowerCase())) {
      const v = row[k];
      if (v == null) continue;
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

/** Retorna todos os pedidos sem paginação (para resumos/agregações). Garante totalidade dos dados. */
async function obterTodosPedidosParaResumo(filtros: FiltrosPedidos = {}): Promise<PedidoRow[]> {
  const opts: FiltrosPedidos = { ...filtros };
  if (opts.page !== undefined) delete opts.page;
  if (opts.limit !== undefined) delete opts.limit;
  const { data } = await listarPedidos(opts);
  return data;
}

/** Obtém string para classificação TipoF: coluna TipoF/tipoF ou fallback via Observacoes. */
function getTipoFString(row: PedidoRow): string {
  const t = getField(row, ['TipoF', 'tipoF']);
  if (t && String(t).trim()) return String(t).toLowerCase();
  const obs = getField(row, ['Observacoes', 'Observacoes ', 'Observações']);
  return (obs || '').toLowerCase();
}

/** Indica se a linha pertence ao TipoF "Retirada" (contém Retirada). */
function isTipoFRetirada(row: PedidoRow): boolean {
  return getTipoFString(row).includes('retirada');
}

/** Indica se a linha pertence ao TipoF "Entrega Grande Teresina". */
function isTipoFEntregaGrandeTeresina(row: PedidoRow): boolean {
  const t = getTipoFString(row);
  return t.includes('entrega') && t.includes('grande');
}

/** Indica se a linha pertence ao TipoF "Carradas" (ou Inserir em Romaneio / rota). */
function isTipoFCarradas(row: PedidoRow): boolean {
  const t = getTipoFString(row);
  return t.includes('carradas') || t.includes('inserir em romaneio') || t.includes('romaneio') || t.includes('rota');
}

export interface ResumoStatusPorTipoF {
  retirada: { total: number; emDia: number; percentual: number };
  entregaGrandeTeresina: { total: number; emDia: number; percentual: number };
  carradas: { total: number; emDia: number; percentual: number };
}

/** Resumo % Em dia por TipoF para os indicadores (Retirada, Entrega Grande Teresina, Carradas). */
export async function obterResumoStatusPorTipoF(filtros: FiltrosPedidos = {}): Promise<ResumoStatusPorTipoF> {
  const pedidos = await obterTodosPedidosParaResumo(filtros);
  let retiradaTotal = 0,
    retiradaEmDia = 0;
  let entregaTotal = 0,
    entregaEmDia = 0;
  let carradasTotal = 0,
    carradasEmDia = 0;

  for (const p of pedidos) {
    const status = (p['Status'] ?? p['status']) === 'Em dia';
    if (isTipoFRetirada(p)) {
      retiradaTotal++;
      if (status) retiradaEmDia++;
    } else if (isTipoFEntregaGrandeTeresina(p)) {
      entregaTotal++;
      if (status) entregaEmDia++;
    } else if (isTipoFCarradas(p)) {
      carradasTotal++;
      if (status) carradasEmDia++;
    }
  }

  const perc = (emDia: number, total: number) => (total > 0 ? Math.round((emDia / total) * 10000) / 100 : 0);
  return {
    retirada: { total: retiradaTotal, emDia: retiradaEmDia, percentual: perc(retiradaEmDia, retiradaTotal) },
    entregaGrandeTeresina: { total: entregaTotal, emDia: entregaEmDia, percentual: perc(entregaEmDia, entregaTotal) },
    carradas: { total: carradasTotal, emDia: carradasEmDia, percentual: perc(carradasEmDia, carradasTotal) },
  };
}

export interface LinhaTabelaStatusTipoF {
  tipoF: string;
  total: number;
  emDia: number;
  percentual: number;
}

/** Tabela detalhada por TipoF para diagnóstico: cada valor distinto de TipoF com total, emDia e %; totalGeral. */
export async function obterTabelaStatusPorTipoF(): Promise<{
  linhas: LinhaTabelaStatusTipoF[];
  totalGeral: number;
}> {
  const pedidos = await obterTodosPedidosParaResumo({});
  const mapa = new Map<string, { total: number; emDia: number }>();

  for (const p of pedidos) {
    const tipoF = getField(p, ['TipoF', 'tipoF']) || '(vazio)';
    const status = (p['Status'] ?? p['status']) === 'Em dia';
    const cur = mapa.get(tipoF) ?? { total: 0, emDia: 0 };
    cur.total++;
    if (status) cur.emDia++;
    mapa.set(tipoF, cur);
  }

  const perc = (emDia: number, total: number) => (total > 0 ? Math.round((emDia / total) * 10000) / 100 : 0);
  const linhas: LinhaTabelaStatusTipoF[] = [...mapa.entries()]
    .map(([tipoF, { total, emDia }]) => ({
      tipoF,
      total,
      emDia,
      percentual: perc(emDia, total),
    }))
    .sort((a, b) => b.total - a.total);

  return { linhas, totalGeral: pedidos.length };
}

/** Resumo financeiro para os 4 cards acima do dashboard. Usa a totalidade dos dados (sem paginação). */
export async function obterResumoFinanceiro(filtros: FiltrosPedidos = {}): Promise<{
  quantidadePedidos: number;
  saldoFaturarPrazo: number;
  valorAdiantamento: number;
  saldoFaturar: number;
}> {
  const pedidos = await obterTodosPedidosParaResumo(filtros);
  const codigosPedidos = new Set<string>();
  let saldoFaturarPrazo = 0;
  let valorAdiantamento = 0;
  let saldoFaturar = 0;

  const keysValorPendente = ['Saldo a Faturar Real', 'Valor Pendente Real', 'Valor Pendente', 'valor pendente real', 'valor pendente'];
  const keysAdiantamentoRateio = ['valorAdiantamentoRateio', 'valor adiantamento rateio'];

  for (const p of pedidos) {
    const pd = getField(p, ['PD', 'pd']);
    if (pd) codigosPedidos.add(pd);

    const regra = getNumberFromRowLoose(p, ['regra', 'Regra']);
    const valorPendente = getNumberFromRowLoose(p, keysValorPendente);
    const adiantamentoRateio = getNumberFromRowLoose(p, keysAdiantamentoRateio);

    saldoFaturar += valorPendente;
    if (regra > 10) saldoFaturarPrazo += valorPendente;
    valorAdiantamento += adiantamentoRateio;
  }

  return {
    quantidadePedidos: codigosPedidos.size,
    saldoFaturarPrazo: Math.round(saldoFaturarPrazo * 100) / 100,
    valorAdiantamento: Math.round(valorAdiantamento * 100) / 100,
    saldoFaturar: Math.round(saldoFaturar * 100) / 100,
  };
}

/** Resumo por Observacoes (quantidade de pedidos). */
export async function obterResumoObservacoes(): Promise<ObservacaoResumo[]> {
  const { data: pedidos } = await listarPedidos({});
  const contador = new Map<string, number>();
  for (const p of pedidos) {
    const obsRaw = p['Observacoes'] ?? p['Observacoes '] ?? p['Observacoes'] ?? 'Sem Observacoes';
    const obs = String(obsRaw || 'Sem Observacoes').trim() || 'Sem Observacoes';
    contador.set(obs, (contador.get(obs) ?? 0) + 1);
  }
  return [...contador.entries()]
    .map(([observacao, quantidade]) => ({ observacao, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

const MAX_DETALHES_TOOLTIP = 80;

/** Rota "4 - Inserir em Romaneio" = sem rota definida. */
function isSemRota(rota: string): boolean {
  const r = (rota || '').trim();
  return r.includes('Inserir em Romaneio') || r === '4 - Inserir em Romaneio';
}

/** Corrige UF conhecida quando o ERP envia município com estado errado (ex.: São Luís,PI → MA; Belém,AM → PA). */
function corrigirUFMunicipio(municipio: string, uf: string): string {
  const m = (municipio || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const u = (uf || '').trim().toUpperCase();
  if ((m === 'sao luis' || m === 'sao luís') && u === 'PI') return 'MA';
  if (m === 'belem' && u === 'AM') return 'PA';
  return u;
}

export type CorBolhaMapa = 'vermelho' | 'verde' | 'amarelo' | 'roxo' | 'preto';

/** Define cor da bolha (igual ao BI): preto (2+ rotas e pedidos sem rota), roxo (2+ rotas), vermelho (sem rota), amarelo (com rota mas pedidos não alocados), verde (todos mesma rota). */
function definirCorBolha(totalItens: number, countSemRota: number, numRotasDistintas: number): CorBolhaMapa {
  if (totalItens === 0) return 'verde';
  if (numRotasDistintas > 1 && countSemRota > 0) return 'preto';
  if (countSemRota === totalItens) return 'vermelho';
  if (countSemRota > 0) return 'amarelo';
  if (numRotasDistintas > 1) return 'roxo';
  return 'verde';
}

export interface TooltipDetalheRow {
  rm: string;
  rota: string;
  dataEmissao: string;
  pedido: string;
  municipio: string;
  aVista: string;
  valorPendente: number;
  codigo: string;
  produto: string;
}

export interface MunicipioAgregadoMapa {
  municipio: string;
  uf: string;
  valorPendente: number;
  detalhes: TooltipDetalheRow[];
  cor: CorBolhaMapa;
}

/** Agregação por município com detalhes e cor da bolha (Rota, Pedido, Código, Produto, Valor Pendente). Usa todos os pedidos (sem paginação) para bater com resumo do SQL/Excel. */
async function obterAgregacaoPorMunicipioComDetalhes(filtros: FiltrosPedidos = {}): Promise<MunicipioAgregadoMapa[]> {
  const { data: pedidos } = await listarPedidos(filtros);
  const map = new Map<
    string,
    {
      municipio: string;
      uf: string;
      valor: number;
      detalhes: TooltipDetalheRow[];
      countSemRota: number;
      totalItens: number;
      rotasDistintas: Set<string>;
    }
  >();
  for (const p of pedidos) {
    const municipio = getField(p, ['Municipio de entrega', 'municipio de entrega']);
    const ufBruto = getField(p, ['UF', 'uf']);
    const uf = corrigirUFMunicipio(municipio, ufBruto);
    if (!municipio || municipio.toLowerCase().includes('retirada') || municipio.toLowerCase().includes('inserir')) continue;
    const valorRaw = p['Saldo a Faturar Real'] ?? p['Valor Pendente Real'] ?? p['Valor Pendente'] ?? 0;
    const valor = Number(valorRaw);
    if (Number.isNaN(valor)) continue;
    if (valor < 0) continue;
    const key = `${municipio.trim()}|${uf}`;
    const rm = getField(p, ['RM', 'rm']);
    const rota = getField(p, ['Observacoes', 'Observacoes ', 'Observações']);
    const emissaoRaw = p['Emissao'] ?? getField(p, ['Emissao', 'emissao']);
    const dataEmissao = emissaoRaw ? (typeof emissaoRaw === 'string' ? emissaoRaw : new Date(emissaoRaw as Date).toISOString().slice(0, 10)) : '';
    const pedido = getField(p, ['PD', 'pd']);
    const municipioRow = getField(p, ['Municipio de entrega', 'municipio de entrega']);
    const aVista = getField(p, ['Entrada/A vista Ate 10d', 'Entrada/A vista Ate 10d ', 'entrada/a vista ate 10d']);
    const codigo = getField(p, ['Cod', 'cod']);
    const produto = getField(p, ['Descricao do produto', 'descricao do produto']);
    const row: TooltipDetalheRow = {
      rm,
      rota,
      dataEmissao,
      pedido,
      municipio: municipioRow,
      aVista,
      valorPendente: valor,
      codigo,
      produto,
    };
    const semRota = isSemRota(rota);
    const cur = map.get(key);
    if (cur) {
      cur.valor += valor;
      cur.totalItens += 1;
      if (cur.detalhes.length < MAX_DETALHES_TOOLTIP) cur.detalhes.push(row);
      if (semRota) cur.countSemRota += 1;
      else if (rota) cur.rotasDistintas.add(rota);
    } else {
      const rotasDistintas = new Set<string>();
      if (!semRota && rota) rotasDistintas.add(rota);
      map.set(key, {
        municipio: municipio.trim(),
        uf,
        valor,
        detalhes: [row],
        countSemRota: semRota ? 1 : 0,
        totalItens: 1,
        rotasDistintas,
      });
    }
  }
  return [...map.values()].map(({ municipio, uf, valor, detalhes, countSemRota, totalItens, rotasDistintas }) => ({
    municipio,
    uf,
    valorPendente: valor,
    detalhes,
    cor: definirCorBolha(totalItens, countSemRota, rotasDistintas.size),
  }));
}

export interface MapaMunicipioItem {
  /** Chave no formato Município,UF,Brasil (ex.: Teresina,PI,Brasil) — usada para apontar no mapa. */
  chave: string;
  municipio: string;
  uf: string;
  valorPendente: number;
  lat: number;
  lng: number;
  detalhes: TooltipDetalheRow[];
  cor: CorBolhaMapa;
}

export interface MapaMunicipiosResponse {
  itens: MapaMunicipioItem[];
  semCoordenadas: { chave: string; municipio: string; uf: string; valorPendente: number }[];
}

/** Agregação por município com coordenadas; cada ponto é identificado pela chave "Município,UF,Brasil". */
export async function obterMapaMunicipios(filtros: FiltrosPedidos = {}): Promise<MapaMunicipiosResponse> {
  const agregados = await obterAgregacaoPorMunicipioComDetalhes(filtros);
  const itens: MapaMunicipioItem[] = [];
  const semCoordenadas: { chave: string; municipio: string; uf: string; valorPendente: number }[] = [];
  for (const a of agregados) {
    const chave = chaveLocal(a.municipio, a.uf);
    const coords = geocodeFromCache(a.municipio, a.uf) ?? await geocodeMunicipio(a.municipio, a.uf);
    if (coords) {
      itens.push({ ...a, chave, lat: coords.lat, lng: coords.lng });
    } else {
      semCoordenadas.push({ chave, municipio: a.municipio, uf: a.uf, valorPendente: a.valorPendente });
    }
  }
  return { itens, semCoordenadas };
}

export interface FiltrosOpcoes {
  rotas: string[];
  categorias: string[];
  status: string[];
  metodos: string[];
  ufs: string[];
  municipios: string[];
  formasPagamento: string[];
  gruposProduto: string[];
  pds: string[];
  setores: string[];
  vendedores: string[];
  clientes: string[];
  codigos: string[];
}

/** Retorna valores distintos para os filtros (lista de pedidos e heatmap). */
export async function obterFiltrosOpcoes(): Promise<FiltrosOpcoes> {
  const { data: pedidos } = await listarPedidos({});
  const rotasSet = new Set<string>();
  const categoriasSet = new Set<string>();
  const statusSet = new Set<string>();
  const metodosSet = new Set<string>();
  const ufsSet = new Set<string>();
  const municipiosSet = new Set<string>();
  const formasPagamentoSet = new Set<string>();
  const gruposProdutoSet = new Set<string>();
  const pdsSet = new Set<string>();
  const setoresSet = new Set<string>();
  const vendedoresSet = new Set<string>();
  const clientesSet = new Set<string>();
  const codigosSet = new Set<string>();

  for (const p of pedidos) {
    const rota = getField(p, ['Observacoes', 'Observacoes ', 'Observações']);
    if (rota) rotasSet.add(rota);

    const cat = getField(p, ['tipoF', 'tipo_f']);
    if (cat) categoriasSet.add(cat);

    let s = getField(p, ['StatusPedido', 'statusPedido']);
    if (!s) {
      const previsao = p.previsao_entrega_atualizada ?? p.previsao_entrega;
      const atrasado = previsao ? getDateOnlyTimestamp(new Date(previsao)) < getDateOnlyTimestamp(new Date()) : false;
      s = atrasado ? 'Atrasado' : 'Em dia';
    }
    statusSet.add(s);

    const metodo = getField(p, ['Metodo de Entrega', 'metodo de entrega']);
    if (metodo) metodosSet.add(metodo);

    const uf = getField(p, ['UF', 'uf']);
    if (uf) ufsSet.add(uf);

    const municipio = getField(p, ['Municipio de entrega', 'municipio de entrega']);
    if (municipio) municipiosSet.add(municipio);

    const formaPag = getField(p, ['Forma de Pagamento', 'forma de pagamento']);
    if (formaPag) formasPagamentoSet.add(formaPag);

    const grupo = getField(p, ['Grupo de produto', 'grupo de produto']);
    if (grupo) gruposProdutoSet.add(grupo);

    const pd = getField(p, ['PD', 'pd']);
    if (pd) pdsSet.add(pd);

    const setor = getField(p, ['Setor de Producao', 'Setor de produção']);
    if (setor) setoresSet.add(setor);

    const vendedor = getField(p, ['Vendedor/Representante', 'vendedor/representante']);
    if (vendedor) vendedoresSet.add(vendedor);

    const cliente = p.cliente ?? '';
    if (cliente) clientesSet.add(cliente);

    const cod = getField(p, ['Cod', 'cod']);
    if (cod) codigosSet.add(cod);
  }

  return {
    rotas: [...rotasSet].sort(),
    categorias: [...categoriasSet].sort(),
    status: [...statusSet].sort(),
    metodos: [...metodosSet].sort(),
    ufs: [...ufsSet].sort(),
    municipios: [...municipiosSet].sort(),
    formasPagamento: [...formasPagamentoSet].sort(),
    gruposProduto: [...gruposProdutoSet].sort(),
    pds: [...pdsSet].sort(),
    setores: [...setoresSet].sort(),
    vendedores: [...vendedoresSet].sort(),
    clientes: [...clientesSet].sort(),
    codigos: [...codigosSet].sort(),
  };
}

/** Remove todos os registros de alteração de pedidos (histórico de ajustes). */
export async function limparTodosAjustes(): Promise<number> {
  const result = await prisma.pedidoPrevisaoAjuste.deleteMany({});
  return result.count;
}

/** Normaliza data para meio-dia UTC (evita dia a menos em fuso ao exibir). */
function toNoonUTC(d: Date): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return new Date(Date.UTC(y, m, day, 12, 0, 0, 0));
}

/** Grava ajuste no SQLite (não altera o Nomus). */
export async function registrarAjustePrevisao(
  idPedido: string,
  previsaoNova: Date,
  motivo: string,
  usuario: string,
  observacao?: string | null
): Promise<void> {
  const dataNormalizada = toNoonUTC(previsaoNova);
  const idNorm = (idPedido ?? '').trim();
  await prisma.$transaction(async (tx) => {
    await tx.pedidoPrevisaoAjuste.create({
      data: {
        id_pedido: idNorm,
        previsao_nova: dataNormalizada,
        motivo,
        observacao: observacao ?? null,
        usuario,
      },
    });
  });
}

/** Última previsão por id_pedido (só SQLite, sem Nomus). */
async function obterUltimaPrevisaoPorIds(ids: string[]): Promise<Map<string, Date>> {
  if (ids.length === 0) return new Map();
  const idsNorm = ids.map((id) => String(id).trim()).filter(Boolean);
  if (idsNorm.length === 0) return new Map();
  const rows = await prisma.pedidoPrevisaoAjuste.findMany({
    where: { id_pedido: { in: idsNorm } },
    select: { id_pedido: true, previsao_nova: true },
    orderBy: [{ data_ajuste: 'desc' }, { id: 'desc' }],
  });
  const map = new Map<string, Date>();
  for (const r of rows) {
    const key = String(r.id_pedido).trim();
    if (!map.has(key)) map.set(key, r.previsao_nova);
  }
  return map;
}

export interface AjusteLoteItem {
  id_pedido: string;
  previsao_nova: Date;
  motivo: string;
  observacao?: string | null;
}

export interface RegistrarAjustesLoteResult {
  ok: number;
  erros: Array<{ id_pedido: string; erro: string }>;
  /** Ajustes efetivamente aplicados */
  applied?: Array<{ id_pedido: string; previsao_nova: string; motivo: string }>;
}

/**
 * Registra vários ajustes em uma única transação (createMany).
 * Ignora itens cuja previsão já é a mesma (evita linhas duplicadas no histórico).
 */
export async function registrarAjustesPrevisaoLote(
  ajustes: AjusteLoteItem[],
  usuario: string
): Promise<RegistrarAjustesLoteResult> {
  if (ajustes.length === 0) {
    return { ok: 0, erros: [] };
  }

  const ids = [...new Set(ajustes.map((a) => a.id_pedido))];
  const ultimaPrevisaoPorId = await obterUltimaPrevisaoPorIds(ids);

  const toDateOnly = (d: Date) => new Date(d).toISOString().slice(0, 10);
  const toInsert: { id_pedido: string; previsao_nova: Date; motivo: string; observacao: string | null }[] = [];
  let skipped = 0;

  for (const a of ajustes) {
    const idNorm = (a.id_pedido ?? '').trim();
    const nova = new Date(a.previsao_nova);
    const atual = ultimaPrevisaoPorId.get(idNorm);
    if (atual && toDateOnly(atual) === toDateOnly(nova)) {
      skipped += 1;
      continue;
    }
    const observacao = a.observacao != null && String(a.observacao).trim() !== '' ? String(a.observacao).trim() : null;
    toInsert.push({ id_pedido: idNorm, previsao_nova: toNoonUTC(nova), motivo: a.motivo, observacao });
  }

  try {
    if (toInsert.length > 0) {
      const dataAjusteRequest = new Date();
      await prisma.pedidoPrevisaoAjuste.createMany({
        data: toInsert.map((a) => ({
          id_pedido: a.id_pedido,
          previsao_nova: a.previsao_nova,
          motivo: a.motivo,
          observacao: a.observacao,
          usuario,
          data_ajuste: dataAjusteRequest,
        })),
      });
    }
    const applied = toInsert.map((a) => ({
      id_pedido: a.id_pedido,
      previsao_nova: toDateOnly(a.previsao_nova),
      motivo: a.motivo,
    }));
    return { ok: toInsert.length + skipped, erros: [], applied };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao registrar ajuste em lote';
    return {
      ok: 0,
      erros: ajustes.map((a) => ({ id_pedido: a.id_pedido, erro: msg })),
    };
  }
}

/** Busca um pedido por id (lista Nomus + ajuste). Compara com id normalizado (trim). */
export async function buscarPedidoPorId(idPedido: string): Promise<PedidoRow | null> {
  const idNorm = (idPedido ?? '').trim();
  const { data: pedidos } = await listarPedidos({});
  return pedidos.find((p) => (p.id_pedido ?? '').trim() === idNorm) ?? null;
}

/**
 * Converte valor de data vindo do SQLite para Date.
 * Aceita: ISO string, número (timestamp ms), string numérica, string com separador de milhares (ex.: 1.771.934.400.000).
 */
function parseDateFromDb(val: unknown): Date {
  if (val == null) return new Date(0);
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? new Date(0) : val;
  if (typeof val === 'number' && Number.isFinite(val)) {
    const d = new Date(val);
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  }
  const s = String(val).trim();
  if (!s) return new Date(0);
  // Número com separador de milhares (ex.: 1.771.934.400.000)
  const numStr = s.replace(/\./g, '');
  if (/^\d+$/.test(numStr)) {
    const d = new Date(Number(numStr));
    return Number.isNaN(d.getTime()) ? new Date(0) : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

/**
 * Chave canônica pedido+item (ignora prefixo da rota e normaliza item: 0645 e 645 -> mesmo grupo).
 * Ex.: "179648-46836-3255" -> "46836-3255"; "179259-46827-0645" -> "46827-645".
 * Usado só para leitura; gravação mantém id completo.
 */
function chavePedidoItem(id: string): string {
  const parts = String(id ?? '').trim().split('-');
  if (parts.length >= 3) {
    const pedido = parts[parts.length - 2]!.trim();
    const itemStr = parts[parts.length - 1]!.trim();
    const numItem = parseInt(itemStr, 10);
    const itemCanonico = Number.isNaN(numItem) ? itemStr : String(numItem);
    return `${pedido}-${itemCanonico}`;
  }
  if (parts.length === 2) return parts.join('-').trim();
  return String(id ?? '').trim();
}

/** Histórico de ajustes por pedido (SQLite). Busca pelo id_pedido exato da linha para não misturar registros de outras rotas/itens. */
export async function listarHistoricoAjustes(idPedido: string): Promise<{
  id: number;
  id_pedido: string;
  previsao_nova: Date;
  motivo: string;
  observacao: string | null;
  usuario: string;
  data_ajuste: Date;
}[]> {
  const idNorm = (idPedido ?? '').trim();
  if (!idNorm) return [];

  const mapRow = (r: { id: number; id_pedido: string; previsao_nova: unknown; motivo: string; observacao: string | null; usuario: string; data_ajuste: unknown }) => ({
    id: r.id,
    id_pedido: r.id_pedido,
    previsao_nova: parseDateFromDb(r.previsao_nova),
    motivo: r.motivo,
    observacao: r.observacao,
    usuario: r.usuario,
    data_ajuste: parseDateFromDb(r.data_ajuste),
  });

  type Row = { id: number; id_pedido: string; previsao_nova: unknown; motivo: string; observacao: string | null; usuario: string; data_ajuste: unknown };
  let rows: Row[] = [];

  try {
    rows = await prisma.$queryRaw<Row[]>`
      SELECT id, id_pedido, previsao_nova, motivo, observacao, usuario, data_ajuste
      FROM pedido_previsao_ajuste
      WHERE TRIM(id_pedido) = ${idNorm}
      ORDER BY data_ajuste DESC, id DESC
    `;
  } catch (_) {
    rows = [];
  }

  return rows.map(mapRow);
}

export interface FiltrosRelatorioAlteracoes {
  data_ini?: string;
  data_fim?: string;
  id_pedido?: string;
  cliente?: string;
}

export interface RegistroAlteracaoRelatorio {
  id: number;
  id_pedido: string;
  cliente: string;
  previsao_nova: Date;
  motivo: string;
  observacao: string | null;
  usuario: string;
  data_ajuste: Date;
}

/**
 * Lista registros de alteração para relatório, com filtros por período, pedido e cliente.
 * Enriquece com nome do cliente via base Nomus.
 */
export async function listarAlteracoesParaRelatorio(
  filtros: FiltrosRelatorioAlteracoes
): Promise<RegistroAlteracaoRelatorio[]> {
  const where: { id_pedido?: string | { in: string[] }; data_ajuste?: { gte?: Date; lte?: Date } } = {};

  if (filtros.data_ini) {
    const gte = new Date(filtros.data_ini);
    gte.setHours(0, 0, 0, 0);
    where.data_ajuste = { ...where.data_ajuste, gte };
  }
  if (filtros.data_fim) {
    const lte = new Date(filtros.data_fim);
    lte.setHours(23, 59, 59, 999);
    where.data_ajuste = { ...where.data_ajuste, lte };
  }
  if (filtros.cliente?.trim()) {
    const { data: pedidosCliente } = await listarPedidos({ cliente: filtros.cliente.trim() });
    const idsCliente = [...new Set(pedidosCliente.map((p) => p.id_pedido))];
    if (idsCliente.length === 0) return [];
    if (filtros.id_pedido?.trim()) {
      if (!idsCliente.includes(filtros.id_pedido.trim())) return [];
      where.id_pedido = filtros.id_pedido.trim();
    } else {
      where.id_pedido = { in: idsCliente };
    }
  } else if (filtros.id_pedido?.trim()) {
    where.id_pedido = filtros.id_pedido.trim();
  }

  const ajustes = await prisma.pedidoPrevisaoAjuste.findMany({
    where,
    orderBy: { data_ajuste: 'desc' },
  });

  const idsUnicos = [...new Set(ajustes.map((a) => a.id_pedido))];
  const { data: pedidos } = await listarPedidos({});
  const clientePorId = new Map<string, string>();
  for (const p of pedidos) {
    if (idsUnicos.includes(p.id_pedido) && !clientePorId.has(p.id_pedido)) {
      clientePorId.set(p.id_pedido, p.cliente ?? '');
    }
  }

  return ajustes.map((a) => ({
    id: a.id,
    id_pedido: a.id_pedido,
    cliente: clientePorId.get(a.id_pedido) ?? '',
    previsao_nova: a.previsao_nova,
    motivo: a.motivo,
    observacao: a.observacao,
    usuario: a.usuario,
    data_ajuste: a.data_ajuste,
  }));
}

export interface MotivoResumo {
  motivo: string;
  quantidade: number;
}

function toDateOnly(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

/**
 * Remove do banco os registros "Importação em lote" cuja data não alterou
 * a previsão (era igual à que já estava). Assim o Dashboard não os exibe.
 */
export async function limparImportacaoSemAlteracao(): Promise<void> {
  const importacoes = await prisma.pedidoPrevisaoAjuste.findMany({
    where: { motivo: { contains: 'Importação em lote' } },
    orderBy: { data_ajuste: 'asc' },
  });
  if (importacoes.length === 0) return;

  const { data: pedidos } = await listarPedidos({});
  const originalPorId = new Map<string, Date>();
  for (const p of pedidos) {
    originalPorId.set(p.id_pedido, p.previsao_entrega);
  }

  const idsUnicos = [...new Set(importacoes.map((a) => a.id_pedido))];
  const todosAjustesPorId = new Map<
    string,
    { id: number; id_pedido: string; previsao_nova: Date; data_ajuste: Date }[]
  >();
  for (const id of idsUnicos) {
    const todos = await prisma.pedidoPrevisaoAjuste.findMany({
      where: { id_pedido: id },
      orderBy: { data_ajuste: 'asc' },
      select: { id: true, id_pedido: true, previsao_nova: true, data_ajuste: true },
    });
    todosAjustesPorId.set(id, todos);
  }

  const idsToDelete: number[] = [];
  for (const a of importacoes) {
    const todos = todosAjustesPorId.get(a.id_pedido) ?? [];
    const idx = todos.findIndex((x) => x.id === a.id);
    const anterior = idx <= 0 ? originalPorId.get(a.id_pedido) : todos[idx - 1].previsao_nova;
    const novaStr = toDateOnly(a.previsao_nova);
    const anteriorStr = anterior ? toDateOnly(anterior) : '';
    if (anteriorStr === novaStr) idsToDelete.push(a.id);
  }

  if (idsToDelete.length > 0) {
    await prisma.pedidoPrevisaoAjuste.deleteMany({ where: { id: { in: idsToDelete } } });
  }
}

/** Resumo de alterações por motivo (SQLite). Remove antes os registros de importação sem alteração real. */
export async function obterResumoMotivos(): Promise<MotivoResumo[]> {
  await limparImportacaoSemAlteracao();
  const rows = await prisma.pedidoPrevisaoAjuste.groupBy({
    by: ['motivo'],
    _count: { motivo: true },
    orderBy: { _count: { motivo: 'desc' } },
  });
  return rows.map((r) => ({
    motivo: r.motivo || '(sem motivo)',
    quantidade: r._count.motivo,
  }));
}
