import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { sendWhatsAppTextTo } from '../services/evolutionApi.js';
import { getNomusPool, isNomusEnabled } from '../config/nomusDb.js';

/** Número que recebe notificação de novo pedido SycroOrder (DDD + número, sem 55) */
const SYCROORDER_WHATSAPP_NUMERO = '5586998660873';

type OrderStatus = 'PENDING' | 'FINISHED' | 'ESCALATED';

function formatarDataBR(iso: string): string {
  const s = String(iso).trim().slice(0, 10);
  const [y, m, d] = s.split('-');
  return d && m && y ? `${d}/${m}/${y}` : s;
}

/** Resolve usuário atual por login; retorna id e nome ou null */
async function getUsuarioAtual(login: string) {
  if (!login) return null;
  const u = await prisma.usuario.findUnique({
    where: { login },
    select: { id: true, nome: true },
  });
  return u;
}

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
    const list = (Array.isArray(rows) ? rows : []) as Array<{
      id: number;
      nome: string;
      cliente: string | null;
      dataEmissao: Date | string;
      dataEntregaPadrao: Date | string | null;
      dataOriginalEntrega: Date | string | null;
      rota: string | null;
    }>;
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

/** GET /api/sycroorder/orders — lista pedidos com creator_name e último responsável */
export async function getOrders(_req: Request, res: Response): Promise<void> {
  try {
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
    const list = orders.map((o) => {
      const lastH = o.history[0];
      return {
        id: o.id,
        order_number: o.order_number,
        delivery_method: o.delivery_method,
        current_promised_date: o.current_promised_date,
        status: o.status,
        is_urgent: o.is_urgent,
        created_by: o.created_by,
        creator_name: o.creator_name ?? o.usuarioCriador?.nome ?? null,
        created_at: o.created_at,
        last_responder_name: lastH?.user_name ?? lastH?.usuario?.nome ?? null,
        last_response_at: lastH?.created_at ?? null,
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
  const { order_number, delivery_method, promised_date, observation, is_urgent } = req.body as {
    order_number?: string;
    delivery_method?: string;
    promised_date?: string;
    observation?: string;
    is_urgent?: boolean;
  };
  if (!order_number || !delivery_method || !promised_date) {
    res.status(400).json({ error: 'order_number, delivery_method e promised_date são obrigatórios.' });
    return;
  }

  try {
    const usuario = await getUsuarioAtual(login);
    const created_by = usuario?.id ?? null;
    const creator_name = usuario?.nome ?? login;

    const order = await prisma.sycroOrderOrder.create({
      data: {
        order_number: String(order_number).trim(),
        delivery_method: String(delivery_method).trim(),
        current_promised_date: String(promised_date).trim(),
        status: 'PENDING',
        is_urgent: is_urgent ? 1 : 0,
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
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  const { status, new_date, observation, is_urgent } = req.body as {
    status?: OrderStatus;
    new_date?: string;
    observation?: string;
    is_urgent?: boolean;
  };

  try {
    const order = await prisma.sycroOrderOrder.findUnique({ where: { id } });
    if (!order) {
      res.status(404).json({ error: 'Pedido não encontrado.' });
      return;
    }

    const usuario = await getUsuarioAtual(login);
    const user_id = usuario?.id ?? null;
    const user_name = usuario?.nome ?? login;

    const nextStatus = (status && ['PENDING', 'FINISHED', 'ESCALATED'].includes(status) ? status : order.status) as OrderStatus;
    if (nextStatus === 'PENDING' && order.status !== 'PENDING') {
      res.status(400).json({ error: 'Não é possível voltar para Aberto após a primeira resposta.' });
      return;
    }

    const prevDate = order.current_promised_date;
    const nextDate = new_date !== undefined && new_date !== null ? String(new_date).trim() : order.current_promised_date;
    const nextUrgent = is_urgent !== undefined ? (is_urgent ? 1 : 0) : order.is_urgent;

    await prisma.sycroOrderOrder.update({
      where: { id },
      data: {
        status: nextStatus,
        current_promised_date: nextDate,
        is_urgent: nextUrgent,
      },
    });

    await prisma.sycroOrderHistory.create({
      data: {
        order_id: id,
        user_id,
        user_name,
        action_type: 'UPDATE',
        previous_date: prevDate,
        new_date: nextDate,
        observation: observation != null ? String(observation).trim() : null,
      },
    });

    // Notificar criador do pedido (se diferente do usuário que atualizou e temos created_by)
    if (order.created_by && order.created_by !== user_id) {
      await prisma.sycroOrderNotification.create({
        data: {
          user_id: order.created_by,
          message: `PCP atualizou o pedido ${order.order_number}: ${nextStatus}`,
          order_id: id,
        },
      });
    }

    // Se escalado ou urgente, notificar quem tem pedidos.ver (mesmo lógica que create)
    if (nextStatus === 'ESCALATED' || nextUrgent === 1) {
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

/** GET /api/sycroorder/orders/:id/history */
export async function getOrderHistory(req: Request, res: Response): Promise<void> {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  try {
    const history = await prisma.sycroOrderHistory.findMany({
      where: { order_id: id },
      orderBy: { created_at: 'desc' },
      include: { usuario: { select: { nome: true } } },
    });
    const list = history.map((h) => ({
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
    res.json(list);
  } catch (e) {
    console.error('sycroorder getOrderHistory', e);
    res.status(503).json({ error: 'Erro ao carregar histórico.' });
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
