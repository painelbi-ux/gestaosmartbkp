import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { sendWhatsAppTextTo } from '../services/evolutionApi.js';
import { getNomusPool, isNomusEnabled } from '../config/nomusDb.js';
import { listarPedidos, listarHistoricoAjustes, registrarAjustePrevisao } from '../data/pedidosRepository.js';
import { getPermissoesUsuario } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';

/** Número que recebe notificação de novo pedido SycroOrder (DDD + número, sem 55) */
const SYCROORDER_WHATSAPP_NUMERO = '5586998660873';
const COMMERCIAL_TEAM_FLAG = '__time_comercial__';

type OrderStatus = 'PENDING' | 'FINISHED' | 'ESCALATED';

/** Mesmas permissões da rota PATCH /orders (atualizar card). */
const PERMISSOES_PODEM_ATUALIZAR_CARD = [
  PERMISSOES.COMUNICACAO_ATUALIZAR_CARD,
  PERMISSOES.COMUNICACAO_TOTAL,
  PERMISSOES.PEDIDOS_EDITAR,
  PERMISSOES.PEDIDOS_VER,
  PERMISSOES.COMUNICACAO_VER,
] as const;

function usuarioPodeAtualizarCardNasPermissoes(perms: string[]): boolean {
  return PERMISSOES_PODEM_ATUALIZAR_CARD.some((p) => perms.includes(p));
}

/** Incluído no autocomplete @ dos comentários (Comunicação PD). */
function usuarioPodeSerMencionadoEmComentarios(perms: string[]): boolean {
  return (
    perms.includes(PERMISSOES.COMUNICACAO_COMENTARIOS_PERMITIR_MENCAO) || perms.includes(PERMISSOES.COMUNICACAO_TOTAL)
  );
}

function formatarDataBR(iso: string): string {
  const s = String(iso).trim().slice(0, 10);
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}/${m}/${y}` : s;
}

/** Resolve usuário atual por login; retorna id, nome e login ou null */
async function getUsuarioAtual(login: string) {
  if (!login) return null;
  const u = await prisma.usuario.findUnique({
    where: { login },
    select: { id: true, nome: true, login: true, grupo: { select: { nome: true } } },
  });
  return u;
}

/** True se a forma de entrega indica responsável josenildo (apenas ele pode responder junto com o criador). */
function isResponsavelJosenildo(deliveryMethod: string): boolean {
  const fm = String(deliveryMethod ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return (
    (fm.includes('entrega') && fm.includes('grande')) ||
    (fm.includes('retirada') && fm.includes('moveis')) ||
    fm.includes('so aco')
  );
}

function normalizeLogin(login?: string | null): string {
  return String(login ?? '').trim().toLowerCase();
}

function parseJsonArray(value: string | null | undefined): string[] | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return null;
    return arr.map((x) => String(x ?? '').trim()).filter(Boolean);
  } catch {
    return null;
  }
}

/** Primeiro valor não vazio entre várias chaves possíveis (colunas variam na origem SQL). */
function getFieldFromRow(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return '';
}

/**
 * Cliente e vendedor são atributos do pedido (PD), não da linha selecionada no card.
 * Usar sempre todas as linhas do PD no Gerenciador — não `relevantRows` filtrado por item_ids_json,
 * pois IDs desatualizados ou incompatíveis deixavam o filtro vazio e sumiam os nomes na capa.
 */
function pickFirstDistinctFromRows(
  rows: Array<Record<string, unknown>>,
  keys: string[]
): string | null {
  const values = rows.map((r) => getFieldFromRow(r, keys)).filter(Boolean);
  return values.length > 0 ? [...new Set(values)][0]! : null;
}

/**
 * Chave canônica pedido+item (alinhada a pedidosRepository) para casar id_pedido quando o ERP
 * altera o prefixo (ex.: troca de romaneio/carrada na chave).
 */
function chavePedidoItem(id: string): string {
  const parts = String(id ?? '')
    .trim()
    .split('-');
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

function rowItemIdKey(row: Record<string, unknown>): string {
  return String(row['id_pedido'] ?? row['idChave'] ?? '').trim();
}

/**
 * Linhas do Gerenciador do card: filtra por item_ids_json com fallbacks (id canônico, Cod)
 * quando a chave literal mudou após realocação de carrada no ERP.
 */
function resolveRelevantRowsForCard(
  rows: Array<Record<string, unknown>>,
  selectedItemIds: string[] | null,
  itemCodesJson: string | null | undefined
): Array<Record<string, unknown>> {
  if (!selectedItemIds || selectedItemIds.length === 0) {
    return rows;
  }
  const byStrict = rows.filter((r) => selectedItemIds.includes(rowItemIdKey(r)));
  if (byStrict.length > 0) return byStrict;
  const selCanon = new Set(selectedItemIds.map((id) => chavePedidoItem(id)));
  const byCanon = rows.filter((r) => selCanon.has(chavePedidoItem(rowItemIdKey(r))));
  if (byCanon.length > 0) return byCanon;
  const codes = parseJsonArray(itemCodesJson);
  if (codes && codes.length > 0) {
    const set = new Set(codes.map((c) => String(c).trim()).filter(Boolean));
    const byCode = rows.filter((r) => set.has(String(r['Cod'] ?? r['cod'] ?? '').trim()));
    if (byCode.length > 0) return byCode;
  }
  return [];
}

/** "PD 47192" vs "47192" — alinhado ao filtro flexível do Gerenciador (evita lista vazia no PATCH). */
function normalizePdDigitsForCompare(pd: string): string {
  const s = String(pd ?? '').trim();
  const digits = s.replace(/\D+/g, '');
  return digits || s;
}

function gerenciadorRowMatchesOrderNumber(row: Record<string, unknown>, orderNumber: string): boolean {
  const rowPd = String(row['PD'] ?? row['pd'] ?? '').trim();
  const ord = String(orderNumber ?? '').trim();
  if (!rowPd || !ord) return false;
  const a = normalizePdDigitsForCompare(rowPd);
  const b = normalizePdDigitsForCompare(ord);
  return a.length > 0 && a === b;
}

function rotaTextFromGerenciadorRow(row: Record<string, unknown>): string {
  return String(row['Observacoes'] ?? row['Observações'] ?? row['Rota'] ?? row['rota'] ?? '').trim();
}

function parsePermissoesJson(value: string | null | undefined): string[] {
  const arr = parseJsonArray(value);
  return arr ?? [];
}

function isUserCommercialTeamByPermsJson(permissoesJson: string | null | undefined): boolean {
  return parsePermissoesJson(permissoesJson).includes(COMMERCIAL_TEAM_FLAG);
}

function sortedUnique(arr: string[]): string[] {
  return [...new Set(arr.map((s) => String(s ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function normalizeRotaName(rota?: string | null): string {
  return String(rota ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function isCarradaRota(rota?: string | null): boolean {
  return normalizeRotaName(rota).startsWith('rota ');
}

/** Rotas "parametrizadas" pela SQL do Gerenciador — não replicam ajuste entre pedidos por carrada. */
const EXCLUDED_SQL_ROTA_CATEGORIES = new Set([
  'retirada na so aco',
  'retirada na so moveis',
  'entrega grande teresina',
  'inserir em romaneio',
  'requisicao',
]);

function isExcludedSqlRotaCategory(dm: string): boolean {
  return EXCLUDED_SQL_ROTA_CATEGORIES.has(normalizeRotaName(dm));
}

async function resolveSycroOrderResponsibleRecipientUserIds(args: {
  delivery_method: string;
  responsible_user_id: number | null | undefined;
}): Promise<number[]> {
  const primaryLogin = isResponsavelJosenildo(args.delivery_method) ? 'josenildo' : 'pcp';
  const recipientIds = new Set<number>();

  const primaryUser = await prisma.usuario.findFirst({
    where: { login: { equals: primaryLogin } },
    select: { id: true },
  });
  if (primaryUser?.id) recipientIds.add(primaryUser.id);

  if (args.responsible_user_id != null && Number.isFinite(args.responsible_user_id)) {
    recipientIds.add(args.responsible_user_id);
  }

  return [...recipientIds];
}

/** Participantes do card que devem responder, exceto o autor do comentário — texto para a capa do card. */
async function resolveAguardaRespostaDeLabel(args: {
  delivery_method: string;
  created_by: number | null;
  responsible_user_id: number | null;
  authorUserId: number | null;
}): Promise<string> {
  const recipientIds = await resolveSycroOrderResponsibleRecipientUserIds({
    delivery_method: args.delivery_method,
    responsible_user_id: args.responsible_user_id,
  });
  const pool = new Set<number>(recipientIds);
  if (args.created_by != null && Number.isFinite(args.created_by)) pool.add(args.created_by);
  if (args.authorUserId != null && Number.isFinite(args.authorUserId)) pool.delete(args.authorUserId);
  const ids = [...pool];
  if (ids.length > 0) {
    const users = await prisma.usuario.findMany({
      where: { id: { in: ids }, ativo: true },
      select: { login: true, nome: true },
      orderBy: { login: 'asc' },
    });
    const labels = users.map((u) => (u.nome?.trim() ? u.nome.trim() : u.login));
    if (labels.length > 0) return labels.join(', ');
  }
  return isResponsavelJosenildo(args.delivery_method) ? 'josenildo' : 'PCP';
}

function isGrupoAdministrador(grupoNome?: string | null): boolean {
  const n = normalizeLogin(grupoNome);
  return n === 'admin' || n === 'administrador';
}

function toIsoDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  try {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const s = String(value).trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  } catch {
    return null;
  }
}

function formatDateRangePtBr(isoDates: string[]): string | null {
  const dates = isoDates.filter(Boolean);
  if (dates.length === 0) return null;
  const uniq = [...new Set(dates)];
  if (uniq.length === 1) return uniq[0]!;
  const sorted = [...uniq].sort((a, b) => a.localeCompare(b));
  return `${sorted[0]} a ${sorted[sorted.length - 1]}`;
}

function buildCarradasInfo(rows: Array<Record<string, unknown>>): Array<{ rota: string; previsao_atual: string | null; codigos: string[] }> {
  const byRota = new Map<string, { previsoes: string[]; codigos: string[] }>();
  for (const r of rows) {
    const rota = String(r['Observacoes'] ?? r['Observações'] ?? r['Rota'] ?? r['rota'] ?? '').trim() || 'Sem rota';
    const previsao = toIsoDate(r['previsao_entrega_atualizada'] ?? r['previsao_entrega']);
    const cod = String(r['Cod'] ?? r['cod'] ?? '').trim();
    const cur = byRota.get(rota) ?? { previsoes: [], codigos: [] };
    if (previsao) cur.previsoes.push(previsao);
    if (cod) cur.codigos.push(cod);
    byRota.set(rota, cur);
  }
  return [...byRota.entries()]
    .map(([rota, v]) => ({
      rota,
      previsao_atual: formatDateRangePtBr(v.previsoes),
      codigos: sortedUnique(v.codigos),
    }))
    .sort((a, b) => a.rota.localeCompare(b.rota, 'pt-BR'));
}

const STATUS_FINAIS_PERMITIDOS = new Set(['Atendido totalmente', 'Atendido com corte', 'Cancelado']);
const RESTRICTED_CREATORS = new Set(['wellingtonsousa', 'francelino', 'marcosamorim', 'gilvania']);

/** Lista pedidos do ERP (Nomus) para o dropdown do Novo Pedido. Rota = mesma regra do Gerenciador (Observacoes): com romaneio usa de.observacoes; sem romaneio usa Método de entrega (591) e demais condições. */
const SQL_PEDIDOS_ERP = `
  SELECT
    p.id,
    p.nome,
    pe.nome AS cliente,
    p.dataEmissao,
    p.dataEntregaPadrao,
    (SELECT MIN(ip.dataEntrega) FROM itempedido ip WHERE ip.idPedido = p.id) AS dataOriginalEntrega,
    (SELECT CASE
       WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Móveis') THEN '2-Retirada na So Moveis'
       WHEN (de.observacoes IS NULL AND me.opcao = 'Retirada na Só Aço') THEN '1-Retirada na So Aço'
       WHEN (de.observacoes IS NULL AND IFNULL(m.nome, mc.nome) = 'Teresina' AND aloreq.opcao = 'Sim') THEN '5-Requisicao'
       WHEN (de.observacoes IS NULL AND (IFNULL(m.nome, mc.nome) IN ('Timon', 'Teresina', 'Nazaria', 'Demerval Lobão', 'Curralinhos')) AND (aloreq.opcao = 'Não' OR aloreq.opcao IS NULL)) THEN '3-Entrega em Grande Teresina'
       WHEN (de.observacoes IS NULL) THEN '4-Inserir em Romaneio'
       ELSE de.observacoes
     END
     FROM itempedido ip
     LEFT JOIN itempedidoromaneio prm ON prm.idItemPedido = ip.id
     LEFT JOIN documentoestoque de ON de.id = prm.idRomaneio
     LEFT JOIN atributopedidovalor apv_me ON apv_me.idPedido = p.id AND apv_me.idAtributo = 591
     LEFT JOIN atributolistaopcao me ON me.id = apv_me.idListaOpcao
     LEFT JOIN atributopedidovalor apv_req ON apv_req.idPedido = p.id AND apv_req.idAtributo = 313
     LEFT JOIN atributolistaopcao aloreq ON aloreq.id = apv_req.idListaOpcao
     LEFT JOIN pessoa pe2 ON pe2.id = p.idCliente
     LEFT JOIN municipio mc ON mc.id = pe2.idMunicipio
     LEFT JOIN endereco ed ON ed.id = p.idEnderecoLocalEntrega
     LEFT JOIN municipio m ON m.id = ed.idMunicipio
     WHERE ip.idPedido = p.id
     LIMIT 1) AS rota
  FROM pedido p
  LEFT JOIN pessoa pe ON pe.id = p.idCliente
  WHERE p.idEmpresa = 1 AND p.dataEmissao >= '2025-01-01'
`;

const PEDIDOS_ERP_DEFAULT_LIMIT = 2000;
const PEDIDOS_ERP_SEARCH_LIMIT = 200;
/** Data mínima quando busca por nome (inclui pedidos em cargas de anos anteriores). */
const PEDIDOS_ERP_SEARCH_DATA_MIN = '2023-01-01';

/** GET /api/sycroorder/pedidos-erp — lista pedidos do ERP para seleção (filtros: cliente, data_emissao_ini, data_emissao_fim, nome para busca por número) */
export async function getPedidosErp(req: Request, res: Response): Promise<void> {
  const cliente = typeof req.query.cliente === 'string' ? req.query.cliente.trim() : '';
  const dataEmissaoIni = typeof req.query.data_emissao_ini === 'string' ? req.query.data_emissao_ini.trim() : '';
  const dataEmissaoFim = typeof req.query.data_emissao_fim === 'string' ? req.query.data_emissao_fim.trim() : '';
  const nome = typeof req.query.nome === 'string' ? req.query.nome.trim() : '';

  const pool = getNomusPool();
  if (!pool || !isNomusEnabled()) {
    res.status(503).json({ error: 'ERP (Nomus) não configurado.', data: [] });
    return;
  }

  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (cliente) {
      conditions.push(' UPPER(pe.nome) LIKE ? ');
      params.push(`%${cliente.toUpperCase()}%`);
    }
    if (dataEmissaoIni) {
      conditions.push(' p.dataEmissao >= ? ');
      params.push(dataEmissaoIni);
    }
    if (dataEmissaoFim) {
      conditions.push(' p.dataEmissao <= ? ');
      params.push(dataEmissaoFim);
    }
    if (nome) {
      conditions.push(' (p.nome LIKE ? OR p.nome = ?) ');
      params.push(`%${nome}%`, nome);
    }
    const whereExtra = conditions.length ? ' AND ' + conditions.join(' AND ') : '';
    const dataMin = nome ? PEDIDOS_ERP_SEARCH_DATA_MIN : '2025-01-01';
    const baseWhere = ` WHERE p.idEmpresa = 1 AND p.dataEmissao >= '${dataMin}'`;
    const limit = nome ? PEDIDOS_ERP_SEARCH_LIMIT : PEDIDOS_ERP_DEFAULT_LIMIT;
    const sql = SQL_PEDIDOS_ERP.trim().replace(' WHERE p.idEmpresa = 1 AND p.dataEmissao >= \'2025-01-01\'', baseWhere) + whereExtra + ` ORDER BY p.dataEmissao DESC, p.id DESC LIMIT ${limit}`;
    const [rows] = await pool.query(sql, params);
    let list = (Array.isArray(rows) ? rows : []) as Array<{
      id: number;
      nome: string;
      cliente: string | null;
      dataEmissao: Date | string;
      dataEntregaPadrao: Date | string | null;
      dataOriginalEntrega: Date | string | null;
      rota: string | null;
    }>;
    let previsaoAtualByPd = new Map<string, string>();
    // Restringir aos mesmos pedidos que aparecem no Gerenciador de Pedidos
    try {
      const { data: gerenciadorList } = await listarPedidos({});
      const pdNumbers = new Set(
        gerenciadorList.map((row: Record<string, unknown>) => String(row['PD'] ?? '').trim()).filter(Boolean)
      );
      // Calcula a "previsão atual" efetiva para cada PD (usa menor data do intervalo quando existir)
      for (const row of gerenciadorList as Array<Record<string, unknown>>) {
        const pd = String(row['PD'] ?? '').trim();
        if (!pd) continue;
        const previsaoIso = toIsoDate(row['previsao_entrega_atualizada'] ?? row['previsao_entrega']);
        if (!previsaoIso) continue;
        const prev = previsaoAtualByPd.get(pd);
        if (!prev || previsaoIso.localeCompare(prev, 'pt-BR') < 0) {
          previsaoAtualByPd.set(pd, previsaoIso);
        }
      }
      if (pdNumbers.size > 0) {
        list = list.filter((r) => pdNumbers.has(String(r.nome ?? '').trim()));
      }
    } catch (errList) {
      console.error('sycroorder getPedidosErp: listarPedidos (Gerenciador) falhou', errList);
      list = [];
    }
    const toDateStr = (v: Date | string | null | undefined): string | null => {
      if (v == null) return null;
      const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim().slice(0, 10);
      return s || null;
    };
    const data = list.map((r) => ({
      id: Number(r.id),
      nome: String(r.nome ?? ''),
      cliente: r.cliente != null ? String(r.cliente) : null,
      dataEmissao: r.dataEmissao instanceof Date ? r.dataEmissao.toISOString().slice(0, 10) : String(r.dataEmissao ?? '').slice(0, 10),
      dataEntregaPadrao: toDateStr(r.dataEntregaPadrao),
      dataOriginalEntrega: toDateStr(r.dataOriginalEntrega),
      previsao_atual: previsaoAtualByPd.get(String(r.nome ?? '').trim() || '') ?? null,
      rota: r.rota != null && String(r.rota).trim() !== '' ? String(r.rota).trim() : null,
    }));
    res.json(data);
  } catch (e) {
    console.error('sycroorder getPedidosErp', e);
    res.status(503).json({ error: 'Erro ao listar pedidos do ERP.', data: [] });
  }
}

/** GET /api/sycroorder/orders — lista pedidos com creator_name, último responsável e read_by_me. Cards cujo pedido não está mais no Gerenciador são automaticamente movidos para Atendido. */
export async function getOrders(req: Request, res: Response): Promise<void> {
  try {
    const login = req.user?.login;
    const loginNorm = normalizeLogin(login);
    let isAdminGrupo = false;
    let currentUserId: number | null = null;
    if (login) {
      const u = await getUsuarioAtual(login);
      currentUserId = u?.id ?? null;
      isAdminGrupo = !!u?.grupo?.nome && isGrupoAdministrador(u.grupo.nome);
    }

    let gerenciadorList: Array<Record<string, unknown>> | null = null;
    let pdNumbers = new Set<string>();
    try {
      const { data } = await listarPedidos({});
      gerenciadorList = (data ?? []) as Array<Record<string, unknown>>;
      pdNumbers = new Set(
        gerenciadorList.map((row: Record<string, unknown>) => String(row['PD'] ?? '').trim()).filter(Boolean)
      );
    } catch {
      // Se falhar ao carregar Gerenciador, segue sem mover nada
    }

    const orders = await prisma.sycroOrderOrder.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        usuarioCriador: { select: { nome: true } },
        usuarioResponsavel: { select: { login: true, nome: true } },
        history: {
          orderBy: { created_at: 'desc' },
          take: 1,
          include: { usuario: { select: { nome: true } } },
        },
      },
    });

    let ordersParaListar = orders;
    if (pdNumbers.size > 0 && gerenciadorList) {
      const statusField = (row: Record<string, unknown>) => String(row['Stauts'] ?? row['Status'] ?? '').trim();
      const pdField = (row: Record<string, unknown>) => String(row['PD'] ?? '').trim();

      const pdAllFinal = new Map<string, boolean>();
      for (const row of gerenciadorList) {
        const pd = pdField(row);
        if (!pd) continue;
        const st = statusField(row);
        const prev = pdAllFinal.get(pd);
        const ok = STATUS_FINAIS_PERMITIDOS.has(st);
        if (prev === undefined) pdAllFinal.set(pd, ok);
        else pdAllFinal.set(pd, prev && ok);
      }

      const updates: Array<{ id: number; from: string; to: OrderStatus; reason: string; currentDate: string }> = [];
      for (const o of orders) {
        const pd = String(o.order_number ?? '').trim();
        if (!pd) continue;
        let desired: OrderStatus = o.status as OrderStatus;
        if (!pdNumbers.has(pd)) {
          desired = 'FINISHED';
          if (desired !== o.status) {
            updates.push({
              id: o.id,
              from: o.status,
              to: desired,
              reason: 'Pedido não está mais na listagem do Gerenciador de Pedidos.',
              currentDate: o.current_promised_date,
            });
          }
          continue;
        }
        const allFinal = pdAllFinal.get(pd);
        if (allFinal === true && o.status !== 'FINISHED') {
          updates.push({
            id: o.id,
            from: o.status,
            to: 'FINISHED',
            reason: 'Todos os itens do pedido estão com status final no ERP.',
            currentDate: o.current_promised_date,
          });
        } else if (allFinal === false && o.status === 'FINISHED') {
          updates.push({
            id: o.id,
            from: o.status,
            to: 'ESCALATED',
            reason: 'Há itens do pedido que voltaram para status não final no ERP; retornando para Em andamento.',
            currentDate: o.current_promised_date,
          });
        }
      }

      if (updates.length > 0) {
        for (const u of updates) {
          await prisma.sycroOrderOrder.update({ where: { id: u.id }, data: { status: u.to } });
          await prisma.sycroOrderHistory.create({
            data: {
              order_id: u.id,
              user_id: null,
              user_name: 'Sistema',
              action_type: u.to === 'FINISHED' ? 'AUTO_ATENDIDO' : 'AUTO_REABERTO',
              previous_date: u.currentDate,
              new_date: u.currentDate,
              observation: u.reason,
            },
          });
        }
        ordersParaListar = await prisma.sycroOrderOrder.findMany({
          orderBy: { created_at: 'desc' },
          include: {
            usuarioCriador: { select: { nome: true } },
            usuarioResponsavel: { select: { login: true, nome: true } },
            history: {
              orderBy: { created_at: 'desc' },
              take: 1,
              include: { usuario: { select: { nome: true } } },
            },
          },
        });
      }
    }

    let readOrderIds = new Set<number>();
    if (currentUserId != null && ordersParaListar.length > 0) {
      const reads = await prisma.sycroOrderOrderRead.findMany({
        where: {
          user_id: currentUserId,
          order_id: { in: ordersParaListar.map((o) => o.id) },
          read_at: { not: null },
        },
        select: { order_id: true },
      });
      readOrderIds = new Set(reads.map((r) => r.order_id));
    }

    const pdToRows = new Map<string, Array<Record<string, unknown>>>();
    if (gerenciadorList && Array.isArray(gerenciadorList)) {
      for (const row of gerenciadorList) {
        const pd = String(row['PD'] ?? '').trim();
        if (!pd) continue;
        const arr = pdToRows.get(pd) ?? [];
        arr.push(row);
        pdToRows.set(pd, arr);
      }
    }

    const list = ordersParaListar.map((o) => {
      const lastH = o.history[0];
      const isFinished = String(o.status) === 'FINISHED';
      // Qualquer usuário pode atualizar qualquer card (exceto FINISHED).
      // As restrições detalhadas para criadores específicos são aplicadas no PATCH (updateOrder).
      const canRespond = !isFinished;

      const pd = String(o.order_number ?? '').trim();
      const rows = pd ? (pdToRows.get(pd) ?? []) : [];
      const selectedItemIds = parseJsonArray((o as unknown as { item_ids_json?: string | null }).item_ids_json);
      const itemCodesJson = (o as unknown as { item_codes_json?: string | null }).item_codes_json;
      const relevantRows = resolveRelevantRowsForCard(rows, selectedItemIds, itemCodesJson);
      const dataOriginalIso = formatDateRangePtBr(
        relevantRows
          .map((r) => toIsoDate(r['Data de entrega'] ?? r['Data de Entrega'] ?? r['dataParametro']))
          .filter(Boolean) as string[]
      );
      const previsaoAtualIso = formatDateRangePtBr(
        relevantRows
          .map((r) => toIsoDate(r['previsao_entrega_atualizada'] ?? r['previsao_entrega']))
          .filter(Boolean) as string[]
      );

      const clienteNome = pickFirstDistinctFromRows(rows, ['Cliente', 'cliente']);
      const vendedorNome = pickFirstDistinctFromRows(rows, [
        'Vendedor/Representante',
        'vendedor/representante',
        'Vendedor',
        'vendedor',
      ]);
      const carradasInfo = buildCarradasInfo(relevantRows);

      const ruLogin = o.usuarioResponsavel?.login ? normalizeLogin(o.usuarioResponsavel.login) : null;
      return {
        id: o.id,
        order_number: o.order_number,
        delivery_method: o.delivery_method,
        current_promised_date: o.current_promised_date,
        data_original: dataOriginalIso,
        previsao_atual: previsaoAtualIso,
        cliente_name: clienteNome,
        vendedor_name: vendedorNome,
        carradas_info: carradasInfo,
        tag_disponivel: !!o.tag_disponivel,
        aguarda_resposta_pendente: Number((o as { aguarda_resposta_pendente?: number }).aguarda_resposta_pendente) === 1,
        aguarda_resposta_de_label:
          (o as { aguarda_resposta_de_label?: string | null }).aguarda_resposta_de_label ?? null,
        status: o.status,
        is_urgent: o.is_urgent,
        created_by: o.created_by,
        creator_name: o.creator_name ?? o.usuarioCriador?.nome ?? null,
        responsible_user_id: o.responsible_user_id ?? null,
        responsible_user_login: ruLogin,
        created_at: o.created_at,
        last_responder_name: lastH?.user_name ?? lastH?.usuario?.nome ?? null,
        last_response_at: lastH?.created_at ?? null,
        read_by_me: readOrderIds.has(o.id),
        can_respond: canRespond,
      };
    });
    res.json(list);
  } catch (e) {
    console.error('sycroorder getOrders', e);
    res.status(503).json({ error: 'Erro ao listar pedidos.' });
  }
}

/** POST /api/sycroorder/orders — cria pedido; notifica usuários com PEDIDOS_VER (opcional) */
export async function createOrder(req: Request, res: Response): Promise<void> {
  const login = req.user?.login;
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  const {
    order_number,
    delivery_method,
    promised_date,
    observation,
    is_urgent,
    id_pedidos,
    responsible_user_id,
    aguarda_resposta,
  } = req.body as {
    order_number?: string;
    delivery_method?: string;
    promised_date?: string;
    observation?: string;
    is_urgent?: boolean;
    id_pedidos?: string[];
    /** Usuario.id opcional — deve ter permissão de atualizar card (mesma regra do PATCH). */
    responsible_user_id?: number | string | null;
    /** Obrigatório com `observation`: indica se o comentário exige retorno de outro participante. */
    aguarda_resposta?: boolean;
  };
  const observationTrim = observation != null ? String(observation).trim() : '';
  // Regra: na criação, o card SEMPRE nasce como "Aguarda resposta" (toggle travado na UI).
  // Por isso, ignoramos o valor de `aguarda_resposta` vindo do front.
  if (!order_number || !delivery_method || !promised_date) {
    res.status(400).json({ error: 'order_number, delivery_method e promised_date são obrigatórios.' });
    return;
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { login },
      select: { id: true, nome: true, login: true, permissoes: true, grupo: { select: { nome: true, ativo: true } } },
    });
    const created_by = usuario?.id ?? null;
    const creator_name = usuario?.nome ?? login;
    const creatorIsCommercialTeam = isUserCommercialTeamByPermsJson(usuario?.permissoes);
    const creatorPerms = await getPermissoesUsuario(login);
    const canEditResponsible =
      creatorPerms.includes(PERMISSOES.COMUNICACAO_EDITAR_RESPONSAVEL_CARD) ||
      creatorPerms.includes(PERMISSOES.COMUNICACAO_TOTAL);

    // Resolver itens do pedido no Gerenciador (para deduplicação por itens)
    let itensDoPedido: Array<{ id_pedido: string; cod: string; rota: string }> = [];
    try {
      const { data } = await listarPedidos({ pd: String(order_number).trim(), limit: 500 });
      itensDoPedido = (data ?? [])
        .map((row: Record<string, unknown>) => ({
          id_pedido: String(row.id_pedido ?? '').trim(),
          cod: String(row.Cod ?? row.cod ?? '').trim(),
          rota: String(row['Observacoes'] ?? row['Observações'] ?? row['Rota'] ?? row['rota'] ?? '').trim(),
        }))
        .filter((x) => x.id_pedido);
    } catch {
      // Se falhar, não cria (regra depende da lista)
      res.status(503).json({ error: 'Não foi possível validar itens do pedido no Gerenciador. Tente novamente.' });
      return;
    }

    const allItemIds = sortedUnique(itensDoPedido.map((i) => i.id_pedido));
    if (allItemIds.length === 0) {
      res.status(400).json({ error: 'Não foi possível identificar itens do pedido no Gerenciador.' });
      return;
    }

    const reqIds = Array.isArray(id_pedidos) ? sortedUnique(id_pedidos.map((x) => String(x ?? '').trim())) : [];
    const selectedIds = reqIds.length > 0 ? reqIds.filter((id) => allItemIds.includes(id)) : allItemIds;
    if (selectedIds.length === 0) {
      res.status(400).json({ error: 'Selecione ao menos um item válido do pedido.' });
      return;
    }

    // Regra: um card não pode nascer vinculado a mais de uma carrada (rotas que começam com "ROTA ").
    const idToRota = new Map(itensDoPedido.map((i) => [i.id_pedido, i.rota]));
    const carradasSelecionadas = new Set(
      selectedIds
        .map((id) => idToRota.get(id) ?? '')
        .filter((r) => isCarradaRota(r))
        .map((r) => String(r).trim())
    );
    if (carradasSelecionadas.size > 1) {
      res.status(400).json({
        error:
          'Não é permitido criar um card com itens de mais de uma carrada. Selecione apenas os itens de uma única rota/carrada e crie outro card para as demais.',
      });
      return;
    }

    // Deduplicação: não permitir cards que reaproveitam itens já referenciados em outro card do mesmo PD.
    const existing = await prisma.sycroOrderOrder.findMany({
      where: { order_number: String(order_number).trim() },
      select: { id: true, item_ids_json: true, item_codes_json: true, status: true, created_at: true },
      orderBy: { created_at: 'desc' },
    });
    for (const ex of existing) {
      const exIds = parseJsonArray(ex.item_ids_json);
      if (exIds == null || exIds.length === 0) {
        res.status(400).json({
          error:
            `Não é possível abrir outro card para o pedido ${String(order_number).trim()}. Já existe um card que referencia todos os itens do pedido (card #${ex.id}). ` +
            'Para continuar, você deve usar o card existente (atualizar/histórico) em vez de criar outro.',
        });
        return;
      }
      const exSet = new Set(exIds);
      const overlap = selectedIds.filter((id) => exSet.has(id));
      if (overlap.length > 0) {
        const codes = parseJsonArray(ex.item_codes_json) ?? [];
        res.status(400).json({
          error:
            `Não é possível abrir outro card para o pedido ${String(order_number).trim()} com os mesmos itens. Já existe o card #${ex.id} para estes itens` +
            (codes.length ? ` (${codes.join(', ')})` : '') +
            '. Para criar um novo card deste pedido, selecione apenas itens diferentes (sem sobreposição) ou utilize o card existente.',
        });
        return;
      }
    }

    const idToCod = new Map(itensDoPedido.map((i) => [i.id_pedido, i.cod]));
    const selectedCodes = sortedUnique(selectedIds.map((id) => idToCod.get(id) ?? '').filter(Boolean));

    let responsibleUserId: number | null = null;
    if (creatorIsCommercialTeam) {
      if (!created_by) {
        res.status(400).json({ error: 'Não foi possível identificar o usuário criador para definir o responsável adicional.' });
        return;
      }
      responsibleUserId = created_by;
    } else {
      if (!canEditResponsible) {
        res.status(403).json({ error: 'Seu perfil não possui permissão para editar responsável pelo card.' });
        return;
      }
      if (responsible_user_id == null || String(responsible_user_id).trim() === '') {
        res.status(400).json({ error: 'Para este perfil, o responsável adicional é obrigatório e deve pertencer ao Time comercial.' });
        return;
      }
      const rid =
        typeof responsible_user_id === 'number' && Number.isFinite(responsible_user_id)
          ? responsible_user_id
          : parseInt(String(responsible_user_id), 10);
      if (Number.isNaN(rid)) {
        res.status(400).json({ error: 'responsible_user_id inválido.' });
        return;
      }
      const ru = await prisma.usuario.findUnique({
        where: { id: rid },
        select: { id: true, login: true, ativo: true, permissoes: true, grupo: { select: { ativo: true } } },
      });
      if (!ru || !ru.ativo || (ru.grupo && ru.grupo.ativo === false)) {
        res.status(400).json({ error: 'Usuário responsável não encontrado ou inativo.' });
        return;
      }
      if (!isUserCommercialTeamByPermsJson(ru.permissoes)) {
        res.status(400).json({ error: 'O responsável adicional deve pertencer ao Time comercial.' });
        return;
      }
      const ruPerms = await getPermissoesUsuario(ru.login);
      const canViewPd = ruPerms.includes(PERMISSOES.COMUNICACAO_TELA_VER) || ruPerms.includes(PERMISSOES.COMUNICACAO_TOTAL);
      if (!canViewPd) {
        res.status(400).json({ error: 'O usuário escolhido não tem permissão para visualizar a Comunicação PD.' });
        return;
      }
      responsibleUserId = rid;
    }

    const aguardaLabelInicial = await resolveAguardaRespostaDeLabel({
      delivery_method: String(delivery_method).trim(),
      created_by,
      responsible_user_id: responsibleUserId,
      authorUserId: created_by,
    });

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.sycroOrderOrder.create({
        data: {
          order_number: String(order_number).trim(),
          delivery_method: String(delivery_method).trim(),
          current_promised_date: String(promised_date).trim(),
          status: 'PENDING',
          is_urgent: is_urgent ? 1 : 0,
          item_ids_json: JSON.stringify(selectedIds),
          item_codes_json: selectedCodes.length ? JSON.stringify(selectedCodes) : null,
          created_by,
          creator_name,
          responsible_user_id: responsibleUserId,
          aguarda_resposta_pendente: 1,
          aguarda_resposta_de_label: aguardaLabelInicial,
        },
      });

      await tx.sycroOrderHistory.create({
        data: {
          order_id: created.id,
          user_id: created_by,
          user_name: creator_name,
          action_type: 'CREATE',
          new_date: created.current_promised_date,
          observation: observationTrim || null,
        },
      });

      // Notificar apenas os responsáveis registrados no card:
      const recipientIds = await resolveSycroOrderResponsibleRecipientUserIds({
        delivery_method: delivery_method,
        responsible_user_id: responsibleUserId,
      });
      if (recipientIds.length > 0) {
        const msg = `Novo card ${created.order_number} criado por ${creator_name}`;
        await tx.sycroOrderNotification.createMany({
          data: recipientIds.map((uid) => ({
            user_id: uid,
            message: msg,
            order_id: created.id,
          })),
        });
      }

      return created;
    });

    // Notificação WhatsApp para o número configurado (novo pedido + dados do card)
    let whatsappText = '📋 *SycroOrder – Novo pedido criado*\n\n';
    whatsappText += `📄 *Pedido:* ${order.order_number}\n`;
    whatsappText += `🚚 *Entrega:* ${order.delivery_method}\n`;
    whatsappText += `📅 *Data prometida:* ${formatarDataBR(order.current_promised_date)}\n`;
    whatsappText += `👤 *Criador:* ${creator_name}\n`;
    if (order.is_urgent) whatsappText += `⚠️ *Urgente:* Sim\n`;
    if (observation && String(observation).trim()) {
      whatsappText += `\n💬 *Observação:* ${String(observation).trim()}\n`;
    }
    sendWhatsAppTextTo(SYCROORDER_WHATSAPP_NUMERO, whatsappText).catch((err) => {
      console.error('[SycroOrder] WhatsApp novo pedido:', err);
    });

    res.json({ id: order.id });
  } catch (e) {
    console.error('sycroorder createOrder', e);
    res.status(503).json({ error: 'Erro ao criar pedido.' });
  }
}

/** PATCH /api/sycroorder/orders/:id — atualiza status, data, observação, urgência */
export async function updateOrder(req: Request, res: Response): Promise<void> {
  const login = req.user?.login;
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  const loginNorm = normalizeLogin(login);
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  const {
    status,
    new_date,
    observation,
    comentario,
    observacao,
    is_urgent,
    motivo,
    id_pedidos,
    tag_disponivel,
    replicate_carrada,
    aguarda_resposta,
  } = req.body as {
    status?: OrderStatus;
    new_date?: string;
    /** @deprecated use comentario */
    observation?: string;
    /** Comentário do usuário no card (diálogo entre usuários) — exibido no histórico do Sycro. */
    comentario?: string;
    /** Informação complementar ao motivo — enviada ao Gerenciador de Pedidos (pedido_previsao_ajuste.observacao). */
    observacao?: string;
    is_urgent?: boolean;
    motivo?: string;
    /** Quando informado, o ajuste no Gerenciador é aplicado apenas a estes id_pedido (mesmo PD). */
    id_pedidos?: string[];
    /** Quando informado, atualiza a TAG de disponibilidade (DISPONÍVEL / NÃO DISPONÍVEL). */
    tag_disponivel?: boolean;
    /** Se true, replica previsão/motivo/observação para todos os itens da mesma rota (carrada) no Gerenciador. */
    replicate_carrada?: boolean;
    /** Obrigatório quando há comentário: true = aguarda retorno de outro participante; false = respondido. */
    aguarda_resposta?: boolean;
  };
  const comentarioVal = (comentario != null && String(comentario).trim() !== '' ? String(comentario).trim() : null) ?? (observation != null && String(observation).trim() !== '' ? String(observation).trim() : null);
  const observacaoVal = observacao != null && String(observacao).trim() !== '' ? String(observacao).trim() : null;
  let hasMentions = false;

  try {
    const order = await prisma.sycroOrderOrder.findUnique({ where: { id } });
    if (!order) {
      res.status(404).json({ error: 'Pedido não encontrado.' });
      return;
    }
    if (String(order.status) === 'FINISHED') {
      res.status(403).json({ error: 'Este card está em Faturado/Entregue e não permite atualizações. Apenas visualização.' });
      return;
    }

    const usuario = await getUsuarioAtual(login);
    const user_id = usuario?.id ?? null;
    const user_name = usuario?.nome ?? login;

    const isAdminGrupo = !!usuario?.grupo?.nome && isGrupoAdministrador(usuario.grupo.nome);
    const isRestrictedUser = RESTRICTED_CREATORS.has(loginNorm);
    const tagDesejado = tag_disponivel === undefined ? undefined : !!tag_disponivel;

    // Regra de atualização por "responsável josenildo" foi removida:
    // agora qualquer usuário (exceto restrições abaixo para criadores específicos)
    // pode atualizar qualquer card, desde que não esteja em FINISHED.

    const newDateProvided = new_date !== undefined && new_date !== null && String(new_date).trim() !== '';
    if (isRestrictedUser && !isAdminGrupo) {
      if (tagDesejado !== undefined) {
        res.status(400).json({ error: 'Seu perfil permite apenas inserir comentários neste card. Não é permitido alterar a TAG de disponibilidade.' });
        return;
      }
      if (newDateProvided) {
        res.status(400).json({ error: 'Seu perfil permite apenas inserir comentários neste card. Não é permitido informar nova data prometida.' });
        return;
      }
      if (is_urgent !== undefined) {
        res.status(400).json({ error: 'Seu perfil permite apenas inserir comentários neste card. Não é permitido alterar urgência.' });
        return;
      }
      if (motivo != null && String(motivo).trim()) {
        res.status(400).json({ error: 'Seu perfil permite apenas inserir comentários neste card. Não é permitido informar motivo/alterar data.' });
        return;
      }
      if (Array.isArray(id_pedidos) && id_pedidos.length > 0) {
        res.status(400).json({ error: 'Seu perfil permite apenas inserir comentários neste card. Não é permitido alterar itens.' });
        return;
      }
      if (replicate_carrada === true) {
        res.status(400).json({ error: 'Seu perfil permite apenas inserir comentários neste card. Não é permitido replicar data por carrada.' });
        return;
      }
    }
    if (!newDateProvided && !comentarioVal) {
      res.status(400).json({ error: 'Comentário é obrigatório quando não informar uma nova data prometida.' });
      return;
    }

    if (comentarioVal && typeof aguarda_resposta !== 'boolean') {
      res.status(400).json({
        error: 'Informe se aguarda resposta (defina Não ou Sim) ao enviar um comentário.',
      });
      return;
    }

    const nextDate = new_date !== undefined && new_date !== null ? String(new_date).trim() : order.current_promised_date;
    if (newDateProvided) {
      const motivoTrim = motivo != null ? String(motivo).trim() : '';
      if (!motivoTrim) {
        res.status(400).json({ error: 'Ao informar Nova data prometida, o motivo é obrigatório (mesmas opções do Gerenciador de Pedidos).' });
        return;
      }
    }

    const replicateCarradaRequested = replicate_carrada === true;
    if (replicateCarradaRequested && newDateProvided) {
      const dm = String(order.delivery_method ?? '').trim();
      if (!isCarradaRota(dm) || isExcludedSqlRotaCategory(dm)) {
        res.status(400).json({
          error: 'Replicação por carrada não se aplica a esta forma de entrega ou não está permitida.',
        });
        return;
      }
    }

    let nextStatus: OrderStatus;
    if (order.status === 'PENDING') {
      nextStatus = 'ESCALATED';
    } else {
      // Não permitir alteração manual de status; Faturado/Entregue é controlado automaticamente pelo ERP.
      nextStatus = order.status as OrderStatus;
    }

    const prevDate = order.current_promised_date;
    const nextUrgent = is_urgent !== undefined ? (is_urgent ? 1 : 0) : order.is_urgent;

    const tagChanged =
      tagDesejado !== undefined && Number(order.tag_disponivel) !== (tagDesejado ? 1 : 0);

    const updateData: Record<string, unknown> = {
      status: nextStatus,
      current_promised_date: nextDate,
      is_urgent: nextUrgent,
    };
    if (tagDesejado !== undefined) updateData.tag_disponivel = tagDesejado ? 1 : 0;

    if (comentarioVal && typeof aguarda_resposta === 'boolean') {
      const label =
        aguarda_resposta === true
          ? await resolveAguardaRespostaDeLabel({
              delivery_method: String(order.delivery_method ?? ''),
              created_by: order.created_by ?? null,
              responsible_user_id: (order.responsible_user_id as number | null) ?? null,
              authorUserId: user_id,
            })
          : null;
      updateData.aguarda_resposta_pendente = aguarda_resposta ? 1 : 0;
      updateData.aguarda_resposta_de_label = aguarda_resposta ? label : null;
    }

    await prisma.sycroOrderOrder.update({
      where: { id },
      data: updateData as any,
    });

    await prisma.sycroOrderHistory.create({
      data: {
        order_id: id,
        user_id,
        user_name,
        action_type: 'UPDATE',
        previous_date: prevDate,
        new_date: nextDate,
        observation: comentarioVal,
      },
    });

    // Lista de destinatários: responsáveis gravados no card
    const recipientIds = await resolveSycroOrderResponsibleRecipientUserIds({
      delivery_method: String(order.delivery_method ?? ''),
      responsible_user_id: (order.responsible_user_id as number | null | undefined) ?? null,
    });
    const recipientSet = new Set<number>(recipientIds);
    let sentMentionNotificationToResponsible = false;

    // Citações no comentário (@login) -> cria notificações SOMENTE para citados que também são responsáveis no card
    if (comentarioVal) {
      const mentionRegex = /@([a-zA-Z0-9_.]+)/g;
      const mentioned = [
        ...new Set(
          Array.from(comentarioVal.matchAll(mentionRegex)).map((m) => String(m[1] ?? '').trim().toLowerCase()).filter(Boolean)
        ),
      ];
      if (mentioned.length > 0) {
        hasMentions = true;
        const usersMentioned = await prisma.usuario.findMany({
          where: { login: { in: mentioned } },
          select: { id: true, login: true },
        });
        const mentionedResponsible = usersMentioned.filter((u) => recipientSet.has(u.id) && u.id !== user_id);
        if (mentionedResponsible.length > 0) {
          const msg = `Você foi citado por ${user_name} no card ${order.order_number}.`;
          await prisma.sycroOrderNotification.createMany({
            data: mentionedResponsible.map((u) => ({
              user_id: u.id,
              message: msg,
              order_id: id,
            })),
          });
          sentMentionNotificationToResponsible = true;
        }
      }
    }

    if (tagChanged) {
      await prisma.sycroOrderHistory.create({
        data: {
          order_id: id,
          user_id,
          user_name,
          action_type: tagDesejado ? 'TAG_DISPONIVEL_TRUE' : 'TAG_DISPONIVEL_FALSE',
          previous_date: null,
          new_date: null,
          observation: null,
        },
      });
    }

    if (nextDate !== prevDate && new_date !== undefined && new_date !== null && motivo != null && String(motivo).trim()) {
      try {
        const { data: gerenciadorList } = await listarPedidos({});
        const motivoTrim = String(motivo).trim();
        const orderNumber = String(order.order_number ?? '').trim();
        const dataNova = new Date(nextDate);
        const dm = String(order.delivery_method ?? '').trim();

        let idsPedido: string[] = [];
        const rowsDoPd = (gerenciadorList as Array<Record<string, unknown>>).filter((row) =>
          gerenciadorRowMatchesOrderNumber(row, orderNumber)
        );
        const itemCodesCard = (order as { item_codes_json?: string | null }).item_codes_json;

        if (replicateCarradaRequested) {
          const cardRows = resolveRelevantRowsForCard(
            rowsDoPd,
            parseJsonArray((order as { item_ids_json?: string | null }).item_ids_json),
            itemCodesCard
          );
          const rotaAlvo =
            (cardRows.length > 0 ? rotaTextFromGerenciadorRow(cardRows[0]!) : '') || dm;
          if (isCarradaRota(rotaAlvo) && !isExcludedSqlRotaCategory(rotaAlvo)) {
            idsPedido = sortedUnique(
              (gerenciadorList as Array<Record<string, unknown>>)
                .filter((row) => rotaTextFromGerenciadorRow(row) === rotaAlvo)
                .map((row) => rowItemIdKey(row))
                .filter(Boolean)
            );
          }
        }

        if (idsPedido.length === 0) {
          const bodyIds =
            Array.isArray(id_pedidos) && id_pedidos.length > 0
              ? id_pedidos.map((x) => String(x ?? '').trim()).filter(Boolean)
              : null;
          const selectedIds = bodyIds ?? parseJsonArray((order as { item_ids_json?: string | null }).item_ids_json);
          const resolved = resolveRelevantRowsForCard(rowsDoPd, selectedIds, itemCodesCard);
          idsPedido = sortedUnique(resolved.map((r) => rowItemIdKey(r)).filter(Boolean));
          if (idsPedido.length === 0) {
            idsPedido = sortedUnique(rowsDoPd.map((r) => rowItemIdKey(r)).filter(Boolean));
          }
        }

        if (idsPedido.length === 0) {
          console.warn('[SycroOrder] updateOrder: nenhum id_pedido para registrar previsão no Gerenciador', {
            orderId: order.id,
            orderNumber,
          });
        }

        for (const idPedido of idsPedido) {
          await registrarAjustePrevisao(idPedido, dataNova, motivoTrim, user_name ?? login, observacaoVal ?? undefined);
        }
      } catch (errRepl) {
        console.error('sycroorder updateOrder: replicar ajuste no Gerenciador', errRepl);
      }
    }

    // Notificar responsáveis gravados no card sobre a atualização.
    // Se houver menções no comentário e nenhum destinatário de menção for responsável,
    // ainda assim notificamos os responsáveis pelo card (garante que update não "some").
    const recipientsToNotify = recipientIds.filter((uid) => uid !== user_id);
    if (recipientsToNotify.length > 0) {
      const msgBase =
        nextUrgent === 1 || nextStatus === 'ESCALATED'
          ? `Card ${order.order_number} atualizado (crítico/escalado): ${nextStatus}`
          : `Card ${order.order_number} atualizado: ${nextStatus}`;

      // Se houve menção, mas não criou notificações para responsáveis, enviamos o update também.
      const shouldSendUpdate = !hasMentions || !sentMentionNotificationToResponsible;
      if (shouldSendUpdate) {
        await prisma.sycroOrderNotification.createMany({
          data: recipientsToNotify.map((uid) => ({
            user_id: uid,
            message: msgBase,
            order_id: id,
          })),
        });
      }
    }

    res.json({ success: true });
  } catch (e) {
    console.error('sycroorder updateOrder', e);
    res.status(503).json({ error: 'Erro ao atualizar pedido.' });
  }
}

/** PUT /api/sycroorder/orders/:id/tag-disponivel — ativa/desativa TAG DISPONÍVEL (aciona histórico). */
export async function setOrderTagDisponivel(req: Request, res: Response): Promise<void> {
  const login = req.user?.login;
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  const loginNorm = normalizeLogin(login);
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }

  const { available } = req.body as { available?: boolean };
  if (typeof available !== 'boolean') {
    res.status(400).json({ error: 'Campo "available" (boolean) é obrigatório.' });
    return;
  }

  try {
    const order = await prisma.sycroOrderOrder.findUnique({ where: { id } });
    if (!order) {
      res.status(404).json({ error: 'Pedido não encontrado.' });
      return;
    }
    if (String(order.status) === 'FINISHED') {
      res.status(403).json({ error: 'Este card está em Faturado/Entregue e não permite atualizações.' });
      return;
    }

    const usuario = await getUsuarioAtual(login);
    const user_id = usuario?.id ?? null;
    const user_name = usuario?.nome ?? login;
    const perms = await getPermissoesUsuario(login);
    const canControlTag =
      perms.includes(PERMISSOES.COMUNICACAO_TAG_CONTROLAR) || perms.includes(PERMISSOES.COMUNICACAO_TOTAL);
    if (!canControlTag) {
      res.status(403).json({ error: 'Você não tem permissão para alterar a TAG de disponibilidade.' });
      return;
    }

    const desiredInt = available ? 1 : 0;
    if (Number(order.tag_disponivel) === desiredInt) {
      res.json({ success: true, tag_disponivel: available });
      return;
    }

    await prisma.sycroOrderOrder.update({
      where: { id },
      data: { tag_disponivel: desiredInt },
    });

    await prisma.sycroOrderHistory.create({
      data: {
        order_id: id,
        user_id,
        user_name,
        action_type: available ? 'TAG_DISPONIVEL_TRUE' : 'TAG_DISPONIVEL_FALSE',
        previous_date: null,
        new_date: null,
        observation: null,
      },
    });

    res.json({ success: true, tag_disponivel: available });
  } catch (e) {
    console.error('sycroorder setOrderTagDisponivel', e);
    res.status(503).json({ error: 'Erro ao atualizar TAG de disponibilidade.' });
  }
}

/** PATCH /api/sycroorder/orders/:id/responsavel — altera somente o segundo responsável do card */
export async function setOrderResponsible(req: Request, res: Response): Promise<void> {
  const login = req.user?.login;
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  const rawRid = req.body?.responsible_user_id;
  if (rawRid == null || String(rawRid).trim() === '') {
    res.status(400).json({ error: 'responsible_user_id é obrigatório.' });
    return;
  }
  const rid = typeof rawRid === 'number' && Number.isFinite(rawRid) ? rawRid : parseInt(String(rawRid), 10);
  if (Number.isNaN(rid)) {
    res.status(400).json({ error: 'responsible_user_id inválido.' });
    return;
  }

  try {
    const order = await prisma.sycroOrderOrder.findUnique({ where: { id } });
    if (!order) {
      res.status(404).json({ error: 'Pedido não encontrado.' });
      return;
    }
    if (String(order.status) === 'FINISHED') {
      res.status(403).json({ error: 'Este card está em Faturado/Entregue e não permite alterações.' });
      return;
    }

    const ru = await prisma.usuario.findUnique({
      where: { id: rid },
      select: { id: true, login: true, ativo: true, permissoes: true, grupo: { select: { ativo: true } } },
    });
    if (!ru || !ru.ativo || (ru.grupo && ru.grupo.ativo === false)) {
      res.status(400).json({ error: 'Usuário responsável não encontrado ou inativo.' });
      return;
    }
    if (!isUserCommercialTeamByPermsJson(ru.permissoes)) {
      res.status(400).json({ error: 'O segundo responsável deve pertencer ao Time comercial.' });
      return;
    }
    const ruPerms = await getPermissoesUsuario(ru.login);
    const canViewPd = ruPerms.includes(PERMISSOES.COMUNICACAO_TELA_VER) || ruPerms.includes(PERMISSOES.COMUNICACAO_TOTAL);
    if (!canViewPd) {
      res.status(400).json({ error: 'O usuário escolhido não tem permissão para visualizar a Comunicação PD.' });
      return;
    }

    if (order.responsible_user_id === rid) {
      res.json({ success: true });
      return;
    }

    const usuario = await getUsuarioAtual(login);
    await prisma.$transaction(async (tx) => {
      await tx.sycroOrderOrder.update({
        where: { id },
        data: { responsible_user_id: rid },
      });
      await tx.sycroOrderHistory.create({
        data: {
          order_id: id,
          user_id: usuario?.id ?? null,
          user_name: usuario?.nome ?? login,
          action_type: 'UPDATE_RESPONSIBLE',
          previous_date: null,
          new_date: null,
          observation: `Segundo responsável alterado para @${ru.login}`,
        },
      });
    });

    res.json({ success: true });
  } catch (e) {
    console.error('sycroorder setOrderResponsible', e);
    res.status(503).json({ error: 'Erro ao atualizar responsável do card.' });
  }
}

/** PUT /api/sycroorder/orders/:id/read — marca card como lido (read: true) ou não lido (read: false) para o usuário atual */
export async function setOrderRead(req: Request, res: Response): Promise<void> {
  const login = req.user?.login;
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  const read = req.body?.read === true;
  try {
    const usuario = await getUsuarioAtual(login);
    if (!usuario) {
      res.status(401).json({ error: 'Usuário não encontrado.' });
      return;
    }
    await prisma.sycroOrderOrderRead.upsert({
      where: {
        order_id_user_id: { order_id: id, user_id: usuario.id },
      },
      create: {
        order_id: id,
        user_id: usuario.id,
        read_at: read ? new Date() : null,
      },
      update: {
        read_at: read ? new Date() : null,
      },
    });
    res.json({ success: true, read });
  } catch (e) {
    console.error('sycroorder setOrderRead', e);
    res.status(503).json({ error: 'Erro ao atualizar estado de leitura.' });
  }
}

/** Chave para deduplicar entradas do histórico (evita exibir o mesmo evento várias vezes). */
function historyDedupKey(h: {
  action_type: string;
  user_name: string | null;
  created_at: Date;
  previous_date: string | null;
  new_date: string | null;
  observation: string | null;
  motivo?: string | null;
  product_code?: string | null;
}): string {
  const created = h.created_at instanceof Date ? h.created_at.getTime() : new Date(h.created_at).getTime();
  return [h.action_type, h.user_name ?? '', created, h.previous_date ?? '', h.new_date ?? '', h.motivo ?? '', h.observation ?? '', h.product_code ?? ''].join('\0');
}

/** GET /api/sycroorder/orders/:id/history — histórico unificado (Sycro + gestão de pedidos). */
export async function getOrderHistory(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  try {
    const order = await prisma.sycroOrderOrder.findUnique({
      where: { id },
      select: { order_number: true },
    });
    if (!order) {
      res.status(404).json({ error: 'Pedido não encontrado.' });
      return;
    }
    const orderNumber = (order.order_number ?? '').trim();

    const history = await prisma.sycroOrderHistory.findMany({
      where: { order_id: id },
      orderBy: { created_at: 'desc' },
      include: { usuario: { select: { nome: true } } },
    });
    type HistoryEntry = {
      id: number;
      order_id: number;
      user_id: number | null;
      user_name: string | null;
      action_type: string;
      previous_date: string | null;
      new_date: string | null;
      /** Comentário livre (Sycro ou observação do Gerenciador). Motivo de ajuste vem em `motivo`. */
      observation: string | null;
      motivo?: string | null;
      created_at: Date;
      product_code?: string | null;
    };

    const mapped: HistoryEntry[] = history.map((h) => ({
      id: h.id,
      order_id: h.order_id,
      user_id: h.user_id,
      user_name: h.user_name ?? h.usuario?.nome ?? null,
      action_type: h.action_type,
      previous_date: h.previous_date,
      new_date: h.new_date,
      observation: h.observation,
      motivo: null,
      created_at: h.created_at,
    }));

    const idPedidosGestao: string[] = [];
    const idPedidoToCod = new Map<string, string>();
    try {
      const { data: pedidos } = await listarPedidos({});
      const pdNorm = orderNumber.toLowerCase();
      for (const p of pedidos) {
        const row = p as Record<string, unknown>;
        const pd = String(row.PD ?? row.pd ?? '').trim();
        if (pd.toLowerCase() !== pdNorm) continue;
        const idPedido = String(row.id_pedido ?? '').trim();
        if (idPedido && !idPedidosGestao.includes(idPedido)) {
          idPedidosGestao.push(idPedido);
          const cod = String(row.Cod ?? row.cod ?? '').trim();
          if (cod) idPedidoToCod.set(idPedido, cod);
        }
      }
    } catch (_) {
      // Se listarPedidos falhar, segue só com histórico Sycro
    }

    const ordemTemMaisDeUmItem = idPedidosGestao.length > 1;

    for (const idPedido of idPedidosGestao) {
      try {
        const ajustes = await listarHistoricoAjustes(idPedido);
        const productCode = ordemTemMaisDeUmItem ? (idPedidoToCod.get(idPedido) ?? null) : null;
        for (let i = 0; i < ajustes.length; i++) {
          const a = ajustes[i];
          const created = a.data_ajuste instanceof Date ? a.data_ajuste : new Date(a.data_ajuste);
          const newDateStr = a.previsao_nova instanceof Date ? a.previsao_nova.toISOString().slice(0, 10) : String(a.previsao_nova ?? '').slice(0, 10);
          const prevAjuste = ajustes[i + 1];
          const previousDateStr = prevAjuste
            ? prevAjuste.previsao_nova instanceof Date
              ? prevAjuste.previsao_nova.toISOString().slice(0, 10)
              : String(prevAjuste.previsao_nova ?? '').slice(0, 10)
            : null;
          const motivoTrim = a.motivo != null && String(a.motivo).trim() !== '' ? String(a.motivo).trim() : null;
          const observacaoTrim = a.observacao != null && String(a.observacao).trim() !== '' ? String(a.observacao).trim() : null;
          mapped.push({
            id: -a.id,
            order_id: id,
            user_id: null,
            user_name: a.usuario ?? null,
            action_type: 'AJUSTE_PREVISAO',
            previous_date: previousDateStr || null,
            new_date: newDateStr || null,
            motivo: motivoTrim,
            observation: observacaoTrim,
            created_at: created,
            product_code: productCode,
          });
        }
      } catch (_) {
        // Ignora falha em um id_pedido
      }
    }

    mapped.sort((a, b) => {
      const ta = a.created_at instanceof Date ? a.created_at.getTime() : new Date(a.created_at).getTime();
      const tb = b.created_at instanceof Date ? b.created_at.getTime() : new Date(b.created_at).getTime();
      return tb - ta;
    });

    // Agrupa AJUSTE_PREVISAO com mesma data/hora e mesma observação em um único tópico, listando todos os códigos
    const nonAjuste = mapped.filter((h) => h.action_type !== 'AJUSTE_PREVISAO');
    const ajusteEntries = mapped.filter((h) => h.action_type === 'AJUSTE_PREVISAO');
    // Agrupa por mesmo minuto (não timestamp exato), mesma observação e mesma nova previsão
    const toMinuteKey = (d: Date) => {
      const x = d instanceof Date ? d : new Date(d);
      const t = new Date(x.getFullYear(), x.getMonth(), x.getDate(), x.getHours(), x.getMinutes(), 0, 0);
      return t.getTime();
    };
    const groupKey = (h: HistoryEntry) => {
      const t = toMinuteKey(h.created_at);
      return `${t}\0${h.motivo ?? ''}\0${h.observation ?? ''}\0${h.new_date ?? ''}`;
    };
    const groups = new Map<string, HistoryEntry[]>();
    for (const h of ajusteEntries) {
      const key = groupKey(h);
      const list = groups.get(key) ?? [];
      list.push(h);
      groups.set(key, list);
    }
    const mergedAjuste: HistoryEntry[] = [];
    for (const list of groups.values()) {
      const first = list[0]!;
      const cods = [
        ...new Set(
          list.flatMap((e) =>
            (String(e.product_code ?? ''))
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          )
        ),
      ];
      const product_code =
        cods.length > 0
          ? cods.length === idPedidosGestao.length
            ? 'Todos os itens'
            : cods.join(', ')
          : null;
      const prevDates = [...new Set(list.map((e) => e.previous_date ?? '').filter(Boolean))];
      const previous_date = prevDates.length === 1 ? (first.previous_date ?? null) : null;
      mergedAjuste.push({
        ...first,
        id: first.id,
        product_code: product_code ?? undefined,
        previous_date,
      });
    }
    mergedAjuste.sort((a, b) => {
      const ta = a.created_at instanceof Date ? a.created_at.getTime() : new Date(a.created_at).getTime();
      const tb = b.created_at instanceof Date ? b.created_at.getTime() : new Date(b.created_at).getTime();
      return tb - ta;
    });

    const mapped2 = [...nonAjuste, ...mergedAjuste].sort((a, b) => {
      const ta = a.created_at instanceof Date ? a.created_at.getTime() : new Date(a.created_at).getTime();
      const tb = b.created_at instanceof Date ? b.created_at.getTime() : new Date(b.created_at).getTime();
      return tb - ta;
    });

    // Remove UPDATE do Sycro quando existe AJUSTE_PREVISAO no mesmo minuto com mesma new_date; usa o comentário do UPDATE no tópico exibido
    const updatesToRemove = mapped2.filter((h): h is HistoryEntry => h.action_type === 'UPDATE');
    for (const upd of updatesToRemove) {
      const minKey = toMinuteKey(upd.created_at);
      const newD = upd.new_date ?? '';
      const comentarioUpdate = upd.observation ?? '';
      const matching = mergedAjuste.find(
        (a) => toMinuteKey(a.created_at) === minKey && (a.new_date ?? '') === newD
      );
      if (matching && comentarioUpdate) {
        matching.observation = comentarioUpdate;
      }
    }
    const withoutDuplicateUpdates = mapped2.filter((h) => {
      if (h.action_type !== 'UPDATE') return true;
      const minKey = toMinuteKey(h.created_at);
      const newD = h.new_date ?? '';
      const hasMatchingAjuste = mergedAjuste.some(
        (a) => toMinuteKey(a.created_at) === minKey && (a.new_date ?? '') === newD
      );
      return !hasMatchingAjuste;
    });

    const seen = new Set<string>();
    const list = withoutDuplicateUpdates.filter((h) => {
      const key = historyDedupKey(h);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    res.json(list);
  } catch (e) {
    console.error('sycroorder getOrderHistory', e);
    res.status(503).json({ error: 'Erro ao carregar histórico.' });
  }
}

/** GET /api/sycroorder/order-numbers — números de pedido (order_number) que existem no Sycro (para bloquear importação na gestão). */
export async function getOrderNumbers(req: Request, res: Response): Promise<void> {
  try {
    const orders = await prisma.sycroOrderOrder.findMany({
      select: { order_number: true },
    });
    const list = orders.map((o) => (o.order_number ?? '').trim()).filter(Boolean);
    res.json(list);
  } catch (e) {
    console.error('sycroorder getOrderNumbers', e);
    res.status(503).json({ error: 'Erro ao listar pedidos Sycro.' });
  }
}

/** GET /api/sycroorder/notifications — notificações do usuário */
export async function getNotifications(req: Request, res: Response): Promise<void> {
  const login = req.user?.login;
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  try {
    const usuario = await getUsuarioAtual(login);
    if (!usuario) {
      res.json([]);
      return;
    }
    const list = await prisma.sycroOrderNotification.findMany({
      where: { user_id: usuario.id },
      orderBy: { created_at: 'desc' },
      take: 20,
    });
    res.json(list);
  } catch (e) {
    console.error('sycroorder getNotifications', e);
    res.status(503).json({ error: 'Erro ao carregar notificações.' });
  }
}

/** GET /api/sycroorder/users?query=... — busca usuários por login (para autocomplete de menções no comentário). */
/** GET /api/sycroorder/users-responsavel — usuários que podem ser marcados como responsáveis adicionais (mesma regra do PATCH). */
export async function listUsersResponsavelCard(req: Request, res: Response): Promise<void> {
  try {
    const users = await prisma.usuario.findMany({
      where: { ativo: true },
      select: { id: true, login: true, nome: true, permissoes: true, grupo: { select: { ativo: true } } },
      orderBy: { login: 'asc' },
    });
    const out: Array<{ id: number; login: string; nome: string | null }> = [];
    for (const u of users) {
      if (u.grupo && u.grupo.ativo === false) continue;
      if (!isUserCommercialTeamByPermsJson(u.permissoes)) continue;

      const perms = await getPermissoesUsuario(u.login);
      const canViewPd = perms.includes(PERMISSOES.COMUNICACAO_TELA_VER) || perms.includes(PERMISSOES.COMUNICACAO_TOTAL);
      if (!canViewPd) continue;

      out.push({ id: u.id, login: u.login, nome: u.nome ?? null });
    }
    res.json(out);
  } catch (e) {
    console.error('sycroorder listUsersResponsavelCard', e);
    res.status(503).json({ error: 'Erro ao listar usuários.' });
  }
}

export async function searchSycroOrderUsers(req: Request, res: Response): Promise<void> {
  const queryRaw = req.query.query;
  const query = typeof queryRaw === 'string' ? queryRaw.trim() : '';

  try {
    const q = query.toLowerCase();
    if (!q) {
      res.json([]);
      return;
    }

    const candidates = await prisma.usuario.findMany({
      where: { ativo: true, login: { contains: q } },
      take: 40,
      orderBy: { login: 'asc' },
      select: { login: true, nome: true, permissoes: true, grupo: { select: { ativo: true } } },
    });

    const out: Array<{ login: string; nome: string | null }> = [];
    for (const u of candidates) {
      if (u.grupo && u.grupo.ativo === false) continue;
      const perms = await getPermissoesUsuario(u.login);
      if (!usuarioPodeSerMencionadoEmComentarios(perms)) continue;
      out.push({ login: u.login, nome: u.nome ?? null });
      if (out.length >= 10) break;
    }

    res.json(out);
  } catch (e) {
    console.error('sycroorder searchSycroOrderUsers', e);
    res.status(503).json({ error: 'Erro ao buscar usuários para menções.' });
  }
}

/** POST /api/sycroorder/notifications/read — marcar como lidas */
export async function markNotificationsRead(req: Request, res: Response): Promise<void> {
  const login = req.user?.login;
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  try {
    const usuario = await getUsuarioAtual(login);
    if (!usuario) {
      res.json({ success: true });
      return;
    }
    await prisma.sycroOrderNotification.updateMany({
      where: { user_id: usuario.id },
      data: { is_read: 1 },
    });
    res.json({ success: true });
  } catch (e) {
    console.error('sycroorder markNotificationsRead', e);
    res.status(503).json({ error: 'Erro ao marcar notificações.' });
  }
}

/** PATCH /api/sycroorder/notifications/:id/read — marca uma notificação individual como lida/não lida */
export async function setNotificationRead(req: Request, res: Response): Promise<void> {
  const login = req.user?.login;
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }

  const read = req.body?.read === true;

  try {
    const usuario = await getUsuarioAtual(login);
    if (!usuario) {
      res.status(401).json({ error: 'Usuário não encontrado.' });
      return;
    }

    const updated = await prisma.sycroOrderNotification.updateMany({
      where: { id, user_id: usuario.id },
      data: { is_read: read ? 1 : 0 },
    });

    if (updated.count === 0) {
      res.status(404).json({ error: 'Notificação não encontrada.' });
      return;
    }

    res.json({ success: true, read });
  } catch (e) {
    console.error('sycroorder setNotificationRead', e);
    res.status(503).json({ error: 'Erro ao atualizar notificação.' });
  }
}
