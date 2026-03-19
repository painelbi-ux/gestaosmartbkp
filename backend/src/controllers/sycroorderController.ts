import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { sendWhatsAppTextTo } from '../services/evolutionApi.js';
import { getNomusPool, isNomusEnabled } from '../config/nomusDb.js';
import { listarPedidos, listarHistoricoAjustes, registrarAjustePrevisao } from '../data/pedidosRepository.js';

/** Número que recebe notificação de novo pedido SycroOrder (DDD + número, sem 55) */
const SYCROORDER_WHATSAPP_NUMERO = '5586998660873';

type OrderStatus = 'PENDING' | 'FINISHED' | 'ESCALATED';

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

function sortedUnique(arr: string[]): string[] {
  return [...new Set(arr.map((s) => String(s ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
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
    // Restringir aos mesmos pedidos que aparecem no Gerenciador de Pedidos
    try {
      const { data: gerenciadorList } = await listarPedidos({});
      const pdNumbers = new Set(
        gerenciadorList.map((row: Record<string, unknown>) => String(row['PD'] ?? '').trim()).filter(Boolean)
      );
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
      const hasResponsavel = isResponsavelJosenildo(o.delivery_method);
      const isCriador = currentUserId != null && o.created_by === currentUserId;
      const isJosenildo = loginNorm === 'josenildo';
      const isVinicius = loginNorm === 'viniciusrodrigues';
      const isFinished = String(o.status) === 'FINISHED';
      const canRespondBase = hasResponsavel
        ? (isCriador || isJosenildo || isVinicius)
        : (!isJosenildo || isCriador);
      const canRespond = !isFinished && (isAdminGrupo || canRespondBase);

      const pd = String(o.order_number ?? '').trim();
      const rows = pd ? (pdToRows.get(pd) ?? []) : [];
      const selectedItemIds = parseJsonArray((o as unknown as { item_ids_json?: string | null }).item_ids_json);
      const relevantRows =
        selectedItemIds && selectedItemIds.length > 0
          ? rows.filter((r) => selectedItemIds.includes(String(r['id_pedido'] ?? '').trim()))
          : rows;
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

      const clienteNome = (() => {
        const values = relevantRows
          .map((r) => String(r['Cliente'] ?? r['cliente'] ?? '').trim())
          .filter(Boolean);
        return values.length > 0 ? [...new Set(values)][0]! : null;
      })();

      return {
        id: o.id,
        order_number: o.order_number,
        delivery_method: o.delivery_method,
        current_promised_date: o.current_promised_date,
        data_original: dataOriginalIso,
        previsao_atual: previsaoAtualIso,
        cliente_name: clienteNome,
        tag_disponivel: !!o.tag_disponivel,
        status: o.status,
        is_urgent: o.is_urgent,
        created_by: o.created_by,
        creator_name: o.creator_name ?? o.usuarioCriador?.nome ?? null,
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
  const { order_number, delivery_method, promised_date, observation, is_urgent, id_pedidos } = req.body as {
    order_number?: string;
    delivery_method?: string;
    promised_date?: string;
    observation?: string;
    is_urgent?: boolean;
    id_pedidos?: string[];
  };
  if (!order_number || !delivery_method || !promised_date) {
    res.status(400).json({ error: 'order_number, delivery_method e promised_date são obrigatórios.' });
    return;
  }

  try {
    const usuario = await getUsuarioAtual(login);
    const created_by = usuario?.id ?? null;
    const creator_name = usuario?.nome ?? login;

    // Resolver itens do pedido no Gerenciador (para deduplicação por itens)
    let itensDoPedido: Array<{ id_pedido: string; cod: string }> = [];
    try {
      const { data } = await listarPedidos({ pd: String(order_number).trim(), limit: 500 });
      itensDoPedido = (data ?? [])
        .map((row: Record<string, unknown>) => ({
          id_pedido: String(row.id_pedido ?? '').trim(),
          cod: String(row.Cod ?? row.cod ?? '').trim(),
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

    const order = await prisma.sycroOrderOrder.create({
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
      },
    });

    await prisma.sycroOrderHistory.create({
      data: {
        order_id: order.id,
        user_id: created_by,
        user_name: creator_name,
        action_type: 'CREATE',
        new_date: order.current_promised_date,
        observation: observation ? String(observation).trim() : null,
      },
    });

    // Notificar usuários que têm permissão de pedidos (grupos com pedidos.ver)
    const gruposComPedidos = await prisma.grupoUsuario.findMany({
      where: { permissoes: { contains: 'pedidos.ver' } },
      select: { id: true },
    });
    const userIds = await prisma.usuario.findMany({
      where: { grupoId: { in: gruposComPedidos.map((g) => g.id) } },
      select: { id: true },
    });
    const msg = `Novo pedido ${order.order_number} criado por ${creator_name}`;
    await prisma.sycroOrderNotification.createMany({
      data: userIds.map((u) => ({
        user_id: u.id,
        message: msg,
        order_id: order.id,
      })),
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
  const { status, new_date, observation, comentario, observacao, is_urgent, motivo, id_pedidos, tag_disponivel } = req.body as {
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

    const hasResponsavel = isResponsavelJosenildo(order.delivery_method);
    const isCriador = user_id != null && order.created_by === user_id;
    const isJosenildo = loginNorm === 'josenildo';
    const isVinicius = loginNorm === 'viniciusrodrigues';
    const canRespondBase = hasResponsavel
      ? (isCriador || isJosenildo || isVinicius)
      : (!isJosenildo || isCriador);
    const canRespond = isAdminGrupo || canRespondBase;
    if (!canRespond) {
      res.status(403).json({ error: 'Você não tem permissão para atualizar este card. Apenas o responsável pelo card (ou o criador) pode responder.' });
      return;
    }

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
    }
    if (!newDateProvided && !comentarioVal) {
      res.status(400).json({ error: 'Comentário é obrigatório quando não informar uma nova data prometida.' });
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

    // Citações no comentário (@login) -> cria notificações para os usuários citados
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
        if (usersMentioned.length > 0) {
          const msg = `Você foi citado por ${user_name} no card ${order.order_number}.`;
          await prisma.sycroOrderNotification.createMany({
            data: usersMentioned.map((u) => ({
              user_id: u.id,
              message: msg,
              order_id: id,
            })),
          });
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
        const todosDoPedido = gerenciadorList
          .filter((row: Record<string, unknown>) => String(row['PD'] ?? '').trim() === orderNumber)
          .map((row: Record<string, unknown>) => String(row['id_pedido'] ?? '').trim())
          .filter(Boolean);
        const idsPedido =
          Array.isArray(id_pedidos) && id_pedidos.length > 0
            ? id_pedidos.map((id) => String(id ?? '').trim()).filter(Boolean).filter((id) => todosDoPedido.includes(id))
            : todosDoPedido;
        const dataNova = new Date(nextDate);
        for (const idPedido of idsPedido) {
          await registrarAjustePrevisao(idPedido, dataNova, motivoTrim, user_name ?? login, observacaoVal ?? undefined);
        }
      } catch (errRepl) {
        console.error('sycroorder updateOrder: replicar ajuste no Gerenciador', errRepl);
      }
    }

    // Notificar criador do pedido (se diferente do usuário que atualizou e temos created_by)
    // Observação: quando há menção no comentário, mantemos somente a notificação de citação como padrão.
    if (!hasMentions && order.created_by && order.created_by !== user_id) {
      await prisma.sycroOrderNotification.create({
        data: {
          user_id: order.created_by,
          message: `PCP atualizou o pedido ${order.order_number}: ${nextStatus}`,
          order_id: id,
        },
      });
    }

    // Se escalado ou urgente, notificar quem tem pedidos.ver (mesmo lógica que create)
    if (!hasMentions && (nextStatus === 'ESCALATED' || nextUrgent === 1)) {
      const gruposComPedidos = await prisma.grupoUsuario.findMany({
        where: { permissoes: { contains: 'pedidos.ver' } },
        select: { id: true },
      });
      const userIds = await prisma.usuario.findMany({
        where: { grupoId: { in: gruposComPedidos.map((g) => g.id) } },
        select: { id: true },
      });
      const msg = `Atualização em pedido crítico/escalado ${order.order_number}`;
      await prisma.sycroOrderNotification.createMany({
        data: userIds.map((u) => ({
          user_id: u.id,
          message: msg,
          order_id: id,
        })),
      });
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
    const isAdminGrupo = !!usuario?.grupo?.nome && isGrupoAdministrador(usuario.grupo.nome);

    const isAllowedUser = isAdminGrupo || loginNorm === 'josenildo' || loginNorm === 'viniciusrodrigues';
    if (!isAllowedUser) {
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
function historyDedupKey(h: { action_type: string; user_name: string | null; created_at: Date; previous_date: string | null; new_date: string | null; observation: string | null; product_code?: string | null }): string {
  const created = h.created_at instanceof Date ? h.created_at.getTime() : new Date(h.created_at).getTime();
  return [h.action_type, h.user_name ?? '', created, h.previous_date ?? '', h.new_date ?? '', h.observation ?? '', h.product_code ?? ''].join('\0');
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
      observation: string | null;
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
          mapped.push({
            id: -a.id,
            order_id: id,
            user_id: null,
            user_name: a.usuario ?? null,
            action_type: 'AJUSTE_PREVISAO',
            previous_date: previousDateStr || null,
            new_date: newDateStr || null,
            observation: a.observacao ?? a.motivo ?? null,
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
      return `${t}\0${h.observation ?? ''}\0${h.new_date ?? ''}`;
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
export async function searchSycroOrderUsers(req: Request, res: Response): Promise<void> {
  const queryRaw = req.query.query;
  const query = typeof queryRaw === 'string' ? queryRaw.trim() : '';

  try {
    const q = query.toLowerCase();
    if (!q) {
      res.json([]);
      return;
    }

    const list = await prisma.usuario.findMany({
      where: { login: { contains: q, mode: 'insensitive' } },
      take: 10,
      orderBy: { login: 'asc' },
      select: { id: true, login: true, nome: true },
    });

    res.json(list.map((u) => ({ login: u.login, nome: u.nome ?? null })));
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
