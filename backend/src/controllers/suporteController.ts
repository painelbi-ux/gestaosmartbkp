import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { PERMISSOES, type CodigoPermissao } from '../config/permissoes.js';
import { getPermissoesUsuario } from '../middleware/requirePermission.js';

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_ACTION = 5;
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

const LEGACY_CHAMADOS_ACCESS: CodigoPermissao[] = [
  PERMISSOES.COMUNICACAO_TELA_VER,
  PERMISSOES.COMUNICACAO_TOTAL,
  PERMISSOES.COMUNICACAO_VER,
  PERMISSOES.PEDIDOS_VER,
];

const CATALOG_KINDS = new Set(['status', 'prioridade', 'tipo']);

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.join(path.resolve(thisDir, '..', '..'), 'var', 'uploads', 'suporte');
fs.mkdirSync(uploadRoot, { recursive: true });

type IncomingAttachment = {
  fileName: string;
  mimeType: string;
  contentBase64: string;
  sizeBytes?: number;
};

function isMaster(login?: string | null): boolean {
  return String(login ?? '').trim().toLowerCase() === 'master';
}

function normalizeString(v: unknown): string {
  return String(v ?? '').trim();
}

function optionalString(v: unknown): string | null {
  const s = normalizeString(v);
  return s ? s : null;
}

function slugCode(v: string): string {
  return normalizeString(v)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function usesGranularSuportePerms(perms: string[]): boolean {
  return perms.some((p) => p.startsWith('suporte.'));
}

function hasLegacyChamadosAccess(perms: string[]): boolean {
  return LEGACY_CHAMADOS_ACCESS.some((p) => perms.includes(p));
}

/** Acesso às telas/API de chamados (lista, detalhe, mensagens). */
async function canAcessarChamadosSuporte(login: string): Promise<boolean> {
  if (isMaster(login)) return true;
  const perms = await getPermissoesUsuario(login);
  return perms.includes(PERMISSOES.SUPORTE_CHAMADOS_VER) || hasLegacyChamadosAccess(perms);
}

/** Catálogo de suporte: quem vê chamados ou quem só configura. */
async function canAccessSuporteModulo(login: string): Promise<boolean> {
  if (isMaster(login)) return true;
  const perms = await getPermissoesUsuario(login);
  if (perms.includes(PERMISSOES.SUPORTE_CHAMADOS_VER) || hasLegacyChamadosAccess(perms)) return true;
  return perms.includes(PERMISSOES.SUPORTE_CONFIGURAR);
}

async function canCriarChamado(login: string): Promise<boolean> {
  if (isMaster(login)) return true;
  const perms = await getPermissoesUsuario(login);
  if (usesGranularSuportePerms(perms)) return perms.includes(PERMISSOES.SUPORTE_CHAMADOS_CRIAR);
  return hasLegacyChamadosAccess(perms);
}

async function canResponderChamado(login: string): Promise<boolean> {
  if (isMaster(login)) return true;
  const perms = await getPermissoesUsuario(login);
  if (usesGranularSuportePerms(perms)) return perms.includes(PERMISSOES.SUPORTE_CHAMADOS_RESPONDER);
  return hasLegacyChamadosAccess(perms);
}

async function canVerTodosChamados(login: string): Promise<boolean> {
  if (isMaster(login)) return true;
  const perms = await getPermissoesUsuario(login);
  return perms.includes(PERMISSOES.SUPORTE_CHAMADOS_VER_TODOS);
}

async function canAlterarStatusChamado(login: string): Promise<boolean> {
  if (isMaster(login)) return true;
  const perms = await getPermissoesUsuario(login);
  return perms.includes(PERMISSOES.SUPORTE_CHAMADOS_ALTERAR_STATUS);
}

async function canConfigurarSuporte(login: string): Promise<boolean> {
  if (isMaster(login)) return true;
  const perms = await getPermissoesUsuario(login);
  return perms.includes(PERMISSOES.SUPORTE_CONFIGURAR);
}

function toAuthorType(login: string): 'master' | 'usuario' {
  return isMaster(login) ? 'master' : 'usuario';
}

function formatTicketNumber(id: number): string {
  return `SUP-${String(id).padStart(6, '0')}`;
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const obj = JSON.parse(value);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function defaultCatalogRows(): Array<{
  kind: string;
  code: string;
  label: string;
  active: boolean;
  sortOrder: number;
  blocksUserReply: boolean;
}> {
  return [
    { kind: 'status', code: 'aberto', label: 'Aberto', active: true, sortOrder: 1, blocksUserReply: false },
    { kind: 'status', code: 'em_analise', label: 'Em análise', active: true, sortOrder: 2, blocksUserReply: false },
    {
      kind: 'status',
      code: 'aguardando_resposta_usuario',
      label: 'Aguardando resposta do usuário',
      active: true,
      sortOrder: 3,
      blocksUserReply: false,
    },
    { kind: 'status', code: 'resolvido', label: 'Resolvido', active: true, sortOrder: 4, blocksUserReply: true },
    { kind: 'status', code: 'fechado', label: 'Fechado', active: true, sortOrder: 5, blocksUserReply: true },
    { kind: 'prioridade', code: 'baixa', label: 'Baixa', active: true, sortOrder: 1, blocksUserReply: false },
    { kind: 'prioridade', code: 'media', label: 'Média', active: true, sortOrder: 2, blocksUserReply: false },
    { kind: 'prioridade', code: 'alta', label: 'Alta', active: true, sortOrder: 3, blocksUserReply: false },
    { kind: 'prioridade', code: 'critica', label: 'Crítica', active: true, sortOrder: 4, blocksUserReply: false },
    { kind: 'tipo', code: 'duvida', label: 'Dúvida', active: true, sortOrder: 1, blocksUserReply: false },
    { kind: 'tipo', code: 'incidente', label: 'Incidente', active: true, sortOrder: 2, blocksUserReply: false },
    { kind: 'tipo', code: 'melhoria', label: 'Melhoria', active: true, sortOrder: 3, blocksUserReply: false },
    { kind: 'tipo', code: 'outro', label: 'Outro', active: true, sortOrder: 4, blocksUserReply: false },
  ];
}

async function ensureDefaultCatalog(): Promise<void> {
  const count = await prisma.supportTicketCatalogItem.count();
  if (count > 0) return;
  await prisma.supportTicketCatalogItem.createMany({ data: defaultCatalogRows() });
}

async function getActiveCodes(kind: string): Promise<Set<string>> {
  await ensureDefaultCatalog();
  const rows = await prisma.supportTicketCatalogItem.findMany({
    where: { kind, active: true },
    select: { code: true },
  });
  return new Set(rows.map((r) => r.code));
}

async function getInitialStatusCode(): Promise<string> {
  await ensureDefaultCatalog();
  const aberto = await prisma.supportTicketCatalogItem.findFirst({
    where: { kind: 'status', code: 'aberto', active: true },
  });
  if (aberto) return 'aberto';
  const first = await prisma.supportTicketCatalogItem.findFirst({
    where: { kind: 'status', active: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  return first?.code ?? 'aberto';
}

async function assertActiveCatalogCode(kind: string, code: string, label: string): Promise<void> {
  await ensureDefaultCatalog();
  const active = await getActiveCodes(kind);
  if (active.size === 0 && kind === 'tipo') return;
  if (!active.has(code)) {
    throw new Error(`${label} inválido(a).`);
  }
}

async function ticketBlocksUserReplyForUsuario(statusCode: string): Promise<boolean> {
  await ensureDefaultCatalog();
  const row = await prisma.supportTicketCatalogItem.findUnique({
    where: { kind_code: { kind: 'status', code: statusCode } },
  });
  if (row) return row.blocksUserReply;
  return ['resolvido', 'fechado'].includes(statusCode);
}

async function getStatusLabel(code: string): Promise<string> {
  await ensureDefaultCatalog();
  const row = await prisma.supportTicketCatalogItem.findUnique({
    where: { kind_code: { kind: 'status', code } },
  });
  return row?.label ?? code;
}

async function saveIncomingAttachments(ticketId: number, messageId: number | null, files: IncomingAttachment[]) {
  const saved: Array<{
    fileName: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
    publicUrl: string;
  }> = [];

  for (const file of files) {
    const originalName = normalizeString(file.fileName) || 'arquivo';
    const mimeType = normalizeString(file.mimeType).toLowerCase();
    const contentBase64 = normalizeString(file.contentBase64);
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error(`Tipo de arquivo não permitido: ${mimeType || originalName}`);
    }
    if (!contentBase64) {
      throw new Error(`Conteúdo vazio no anexo: ${originalName}`);
    }
    const buffer = Buffer.from(contentBase64, 'base64');
    const sizeBytes = Number.isFinite(file.sizeBytes) ? Number(file.sizeBytes) : buffer.byteLength;
    if (sizeBytes <= 0 || buffer.byteLength <= 0) {
      throw new Error(`Anexo inválido: ${originalName}`);
    }
    if (sizeBytes > MAX_ATTACHMENT_BYTES || buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Anexo excede ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB: ${originalName}`);
    }
    const safeExt = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10);
    const fileName = `${ticketId}-${Date.now()}-${randomUUID()}${safeExt || ''}`;
    const storagePath = path.join(uploadRoot, fileName);
    fs.writeFileSync(storagePath, buffer);
    const relativePath = `/uploads/suporte/${fileName}`;
    saved.push({
      fileName,
      originalName,
      mimeType,
      sizeBytes: buffer.byteLength,
      storagePath: relativePath,
      publicUrl: relativePath,
    });
  }

  if (saved.length > 0) {
    await prisma.supportTicketAttachment.createMany({
      data: saved.map((a) => ({
        ticketId,
        messageId: messageId ?? undefined,
        fileName: a.fileName,
        originalName: a.originalName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        storagePath: a.storagePath,
      })),
    });
  }
}

function mapTicketListRow(
  row: {
    id: number;
    ticketNumber: string;
    tipo: string;
    titulo: string;
    status: string;
    prioridade: string;
    createdAt: Date;
    updatedAt: Date;
    ownerLogin: string;
  },
  unreadUpdates = 0
): Record<string, unknown> {
  return {
    id: row.id,
    ticketNumber: row.ticketNumber,
    tipo: row.tipo,
    titulo: row.titulo,
    status: row.status,
    prioridade: row.prioridade,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ownerLogin: row.ownerLogin,
    unreadUpdates,
  };
}

export async function listSupportCatalog(req: Request, res: Response): Promise<void> {
  const login = normalizeString(req.user?.login);
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  if (!(await canAccessSuporteModulo(login))) {
    res.status(403).json({ error: 'Sem permissão para o módulo de suporte.' });
    return;
  }
  try {
    await ensureDefaultCatalog();
    const rows = await prisma.supportTicketCatalogItem.findMany({
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    });
    res.json({
      data: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        code: r.code,
        label: r.label,
        active: r.active,
        sortOrder: r.sortOrder,
        blocksUserReply: r.blocksUserReply,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : 'Erro ao carregar catálogo.' });
  }
}

type CatalogSyncParsed = {
  id: number;
  kind: string;
  label: string;
  active: boolean;
  sortOrder: number;
  blocksUserReply: boolean;
};

async function allocateCatalogCodeTx(tx: Prisma.TransactionClient, kind: string, label: string): Promise<string> {
  let base = slugCode(label);
  if (!base) base = 'item';
  let code = base;
  for (let n = 0; n < 500; n++) {
    const row = await tx.supportTicketCatalogItem.findUnique({
      where: { kind_code: { kind, code } },
    });
    if (!row) return code;
    code = `${base}_${n + 1}`;
  }
  throw new Error('Não foi possível gerar identificador interno único para o catálogo.');
}

export async function replaceSupportCatalog(req: Request, res: Response): Promise<void> {
  const login = normalizeString(req.user?.login);
  if (!(await canConfigurarSuporte(login))) {
    res.status(403).json({ error: 'Sem permissão para configurar o suporte.' });
    return;
  }
  const rowsRaw = Array.isArray(req.body?.items) ? (req.body.items as unknown[]) : [];
  try {
    const parsed: CatalogSyncParsed[] = rowsRaw.map((item, idx) => {
      const kind = normalizeString((item as Record<string, unknown>)?.kind).toLowerCase();
      if (!CATALOG_KINDS.has(kind)) {
        throw new Error(`Tipo de catálogo inválido na linha ${idx + 1}.`);
      }
      const idRaw = (item as Record<string, unknown>)?.id;
      const id =
        typeof idRaw === 'number' && Number.isFinite(idRaw) && idRaw > 0 ? Math.floor(idRaw) : 0;
      const label = normalizeString((item as Record<string, unknown>)?.label);
      if (!label) throw new Error(`Nome exibido obrigatório na linha ${idx + 1}.`);
      const sortOrderRaw = Number((item as Record<string, unknown>)?.sortOrder);
      const sortOrder = Number.isFinite(sortOrderRaw) ? sortOrderRaw : idx + 1;
      const active = (item as Record<string, unknown>)?.active !== false;
      const blocksUserReply = !!(item as Record<string, unknown>)?.blocksUserReply;
      return { id, kind, label, active, sortOrder, blocksUserReply };
    });

    const statusActive = parsed.filter((p) => p.kind === 'status' && p.active);
    if (statusActive.length === 0) {
      throw new Error('É necessário ao menos um status ativo.');
    }
    const prioridadeActive = parsed.filter((p) => p.kind === 'prioridade' && p.active);
    if (prioridadeActive.length === 0) {
      throw new Error('É necessário ao menos uma prioridade ativa.');
    }
    const tipoActive = parsed.filter((p) => p.kind === 'tipo' && p.active);
    if (tipoActive.length === 0) {
      throw new Error('É necessário ao menos um tipo de chamado ativo.');
    }

    await prisma.$transaction(async (tx) => {
      const keepIds: number[] = [];
      for (const row of parsed) {
        const blocks = row.kind === 'status' ? row.blocksUserReply : false;
        if (row.id > 0) {
          const exist = await tx.supportTicketCatalogItem.findUnique({ where: { id: row.id } });
          if (!exist) {
            throw new Error(
              `Item de catálogo não encontrado (id ${row.id}). Recarregue a página e tente novamente.`
            );
          }
          if (exist.kind !== row.kind) {
            throw new Error(`Inconsistência de tipo para o item id ${row.id}.`);
          }
          await tx.supportTicketCatalogItem.update({
            where: { id: row.id },
            data: {
              label: row.label,
              active: row.active,
              sortOrder: row.sortOrder,
              blocksUserReply: blocks,
            },
          });
          keepIds.push(row.id);
        } else {
          const code = await allocateCatalogCodeTx(tx, row.kind, row.label);
          const created = await tx.supportTicketCatalogItem.create({
            data: {
              kind: row.kind,
              code,
              label: row.label,
              active: row.active,
              sortOrder: row.sortOrder,
              blocksUserReply: blocks,
            },
          });
          keepIds.push(created.id);
        }
      }
      if (keepIds.length > 0) {
        await tx.supportTicketCatalogItem.deleteMany({
          where: { id: { notIn: keepIds } },
        });
      }
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Não foi possível salvar o catálogo.' });
  }
}

export async function createSupportTicket(req: Request, res: Response): Promise<void> {
  const login = normalizeString(req.user?.login);
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  if (!(await canAcessarChamadosSuporte(login))) {
    res.status(403).json({ error: 'Sem permissão para o módulo de suporte.' });
    return;
  }
  if (!(await canCriarChamado(login))) {
    res.status(403).json({ error: 'Sem permissão para abrir chamados.' });
    return;
  }
  try {
    const tipo = normalizeString(req.body?.tipo).toLowerCase();
    const titulo = normalizeString(req.body?.titulo);
    const descricao = normalizeString(req.body?.descricao);
    const categoria = optionalString(req.body?.categoria);
    const prioridade = normalizeString(req.body?.prioridade || 'media').toLowerCase();
    const files = Array.isArray(req.body?.attachments) ? (req.body.attachments as IncomingAttachment[]) : [];

    if (!tipo || !titulo || !descricao) {
      res.status(400).json({ error: 'Tipo, título e descrição são obrigatórios.' });
      return;
    }

    await assertActiveCatalogCode('tipo', tipo, 'Tipo');
    await assertActiveCatalogCode('prioridade', prioridade, 'Prioridade');

    if (files.length > MAX_ATTACHMENTS_PER_ACTION) {
      res.status(400).json({ error: `Limite de ${MAX_ATTACHMENTS_PER_ACTION} anexos por envio.` });
      return;
    }

    const owner = await prisma.usuario.findUnique({
      where: { login },
      select: { nome: true },
    });

    const initialStatus = await getInitialStatusCode();

    const created = await prisma.supportTicket.create({
      data: {
        ticketNumber: 'PENDENTE',
        ownerLogin: login,
        ownerNome: owner?.nome ?? null,
        tipo,
        titulo,
        descricao,
        categoria,
        prioridade,
        status: initialStatus,
        customFieldsJson: '{}',
        lastStatusChangeBy: login,
      },
    });

    const ticketNumber = formatTicketNumber(created.id);
    await prisma.$transaction([
      prisma.supportTicket.update({
        where: { id: created.id },
        data: { ticketNumber },
      }),
      prisma.supportTicketStatusHistory.create({
        data: {
          ticketId: created.id,
          fromStatus: null,
          toStatus: initialStatus,
          changedBy: login,
        },
      }),
      prisma.supportTicketNotification.create({
        data: {
          userLogin: 'master',
          message: `Novo chamado ${ticketNumber} aberto por ${login}.`,
          ticketId: created.id,
        },
      }),
    ]);

    if (files.length > 0) {
      await saveIncomingAttachments(created.id, null, files);
    }

    res.status(201).json({ id: created.id, ticketNumber });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Não foi possível abrir o chamado.' });
  }
}

export async function listSupportTickets(req: Request, res: Response): Promise<void> {
  const login = normalizeString(req.user?.login);
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  if (!(await canAcessarChamadosSuporte(login))) {
    res.status(403).json({ error: 'Sem permissão para o módulo de suporte.' });
    return;
  }
  const verTodos = await canVerTodosChamados(login);
  const status = optionalString(req.query.status)?.toLowerCase();
  const prioridade = optionalString(req.query.prioridade)?.toLowerCase();
  const tipo = optionalString(req.query.tipo);
  const usuario = optionalString(req.query.usuario);
  const busca = optionalString(req.query.search)?.toLowerCase();
  const sortBy = normalizeString(req.query.sortBy || 'createdAt');
  const sortDir = normalizeString(req.query.sortDir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  const where: Record<string, unknown> = {};
  if (!verTodos) where.ownerLogin = login;
  if (status) where.status = status;
  if (prioridade) where.prioridade = prioridade;
  if (tipo) where.tipo = tipo;
  if (verTodos && usuario) where.ownerLogin = usuario;
  if (busca) {
    where.OR = [
      { ticketNumber: { contains: busca } },
      { titulo: { contains: busca } },
      { descricao: { contains: busca } },
    ];
  }

  const orderBy =
    sortBy === 'prioridade'
      ? [{ prioridade: sortDir }, { createdAt: 'desc' as const }]
      : [{ createdAt: sortDir }];

  const data = await prisma.supportTicket.findMany({
    where,
    orderBy,
    select: {
      id: true,
      ticketNumber: true,
      tipo: true,
      titulo: true,
      status: true,
      prioridade: true,
      createdAt: true,
      updatedAt: true,
      ownerLogin: true,
    },
  });

  const ids = data.map((t) => t.id);
  const unreadByTicket = new Map<number, number>();
  if (ids.length > 0) {
    const grouped = await prisma.supportTicketNotification.groupBy({
      by: ['ticketId'],
      where: { userLogin: login, isRead: false, ticketId: { in: ids } },
      _count: { id: true },
    });
    for (const g of grouped) {
      unreadByTicket.set(g.ticketId, g._count.id);
    }
  }

  res.json({
    data: data.map((row) => mapTicketListRow(row, unreadByTicket.get(row.id) ?? 0)),
  });
}

/** Total de notificações de chamado não lidas para o usuário logado (badge no menu Suporte). */
export async function getSupportNotificationsUnreadCount(req: Request, res: Response): Promise<void> {
  const login = normalizeString(req.user?.login);
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  if (!(await canAcessarChamadosSuporte(login))) {
    res.status(403).json({ error: 'Sem permissão.' });
    return;
  }
  const count = await prisma.supportTicketNotification.count({
    where: { userLogin: login, isRead: false },
  });
  res.json({ count });
}

export async function getSupportTicketById(req: Request, res: Response): Promise<void> {
  const login = normalizeString(req.user?.login);
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  if (!(await canAcessarChamadosSuporte(login))) {
    res.status(403).json({ error: 'Sem permissão para o módulo de suporte.' });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    include: {
      mensagens: { orderBy: { createdAt: 'asc' } },
      anexos: { orderBy: { createdAt: 'asc' } },
      historicoStatus: { orderBy: { changedAt: 'desc' } },
    },
  });
  if (!ticket) {
    res.status(404).json({ error: 'Chamado não encontrado.' });
    return;
  }
  const verTodos = await canVerTodosChamados(login);
  if (!verTodos && ticket.ownerLogin !== login) {
    res.status(403).json({ error: 'Você não pode visualizar este chamado.' });
    return;
  }

  await prisma.supportTicketNotification.updateMany({
    where: { ticketId: id, userLogin: login, isRead: false },
    data: { isRead: true },
  });

  const customFields = parseJsonObject(ticket.customFieldsJson);
  const mensagens = ticket.mensagens.map((m) => ({
    id: m.id,
    authorLogin: m.authorLogin,
    authorNome: m.authorNome,
    authorType: m.authorType,
    mensagem: m.mensagem,
    createdAt: m.createdAt,
    attachments: ticket.anexos
      .filter((a) => a.messageId === m.id)
      .map((a) => ({
        id: a.id,
        originalName: a.originalName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        url: a.storagePath,
      })),
  }));

  const anexosAbertura = ticket.anexos
    .filter((a) => a.messageId == null)
    .map((a) => ({
      id: a.id,
      originalName: a.originalName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      url: a.storagePath,
    }));

  res.json({
    data: {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ownerLogin: ticket.ownerLogin,
      ownerNome: ticket.ownerNome,
      tipo: ticket.tipo,
      titulo: ticket.titulo,
      descricao: ticket.descricao,
      categoria: ticket.categoria,
      prioridade: ticket.prioridade,
      status: ticket.status,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      lastStatusChangeAt: ticket.lastStatusChangeAt,
      lastStatusChangeBy: ticket.lastStatusChangeBy,
      customFields,
      openingAttachments: anexosAbertura,
      messages: mensagens,
      statusHistory: ticket.historicoStatus,
    },
  });
}

export async function createSupportTicketMessage(req: Request, res: Response): Promise<void> {
  const login = normalizeString(req.user?.login);
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  if (!(await canAcessarChamadosSuporte(login))) {
    res.status(403).json({ error: 'Sem permissão para o módulo de suporte.' });
    return;
  }
  if (!(await canResponderChamado(login))) {
    res.status(403).json({ error: 'Sem permissão para responder chamados.' });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) {
    res.status(404).json({ error: 'Chamado não encontrado.' });
    return;
  }
  const verTodos = await canVerTodosChamados(login);
  if (!verTodos && ticket.ownerLogin !== login) {
    res.status(403).json({ error: 'Você não pode interagir neste chamado.' });
    return;
  }
  if (!verTodos && (await ticketBlocksUserReplyForUsuario(ticket.status))) {
    res.status(400).json({ error: 'Chamado encerrado para respostas do usuário.' });
    return;
  }
  const mensagem = normalizeString(req.body?.mensagem);
  if (!mensagem) {
    res.status(400).json({ error: 'Mensagem é obrigatória.' });
    return;
  }
  const files = Array.isArray(req.body?.attachments) ? (req.body.attachments as IncomingAttachment[]) : [];
  if (files.length > MAX_ATTACHMENTS_PER_ACTION) {
    res.status(400).json({ error: `Limite de ${MAX_ATTACHMENTS_PER_ACTION} anexos por envio.` });
    return;
  }
  const me = await prisma.usuario.findUnique({ where: { login }, select: { nome: true } });
  const created = await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      authorLogin: login,
      authorNome: me?.nome ?? null,
      authorType: toAuthorType(login),
      mensagem,
    },
  });
  if (files.length > 0) {
    await saveIncomingAttachments(ticket.id, created.id, files);
  }

  const staff = verTodos || isMaster(login);
  const notifyLogin = staff ? ticket.ownerLogin : 'master';
  await prisma.$transaction([
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { updatedAt: new Date() },
    }),
    prisma.supportTicketNotification.create({
      data: {
        userLogin: notifyLogin,
        message: staff
          ? `O chamado ${ticket.ticketNumber} recebeu resposta da equipe.`
          : `O chamado ${ticket.ticketNumber} recebeu nova mensagem do usuário.`,
        ticketId: ticket.id,
      },
    }),
  ]);

  res.status(201).json({ ok: true, messageId: created.id });
}

export async function updateSupportTicketStatus(req: Request, res: Response): Promise<void> {
  const login = normalizeString(req.user?.login);
  if (!(await canAcessarChamadosSuporte(login))) {
    res.status(403).json({ error: 'Sem permissão para o módulo de suporte.' });
    return;
  }
  if (!(await canAlterarStatusChamado(login))) {
    res.status(403).json({ error: 'Sem permissão para alterar o status do chamado.' });
    return;
  }
  const id = Number(req.params.id);
  const toStatus = normalizeString(req.body?.status).toLowerCase();
  if (!Number.isFinite(id) || !toStatus) {
    res.status(400).json({ error: 'Parâmetros inválidos.' });
    return;
  }
  try {
    await assertActiveCatalogCode('status', toStatus, 'Status');
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : 'Status inválido.' });
    return;
  }
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) {
    res.status(404).json({ error: 'Chamado não encontrado.' });
    return;
  }
  const fromStatus = ticket.status;
  if (fromStatus === toStatus) {
    res.json({ ok: true });
    return;
  }
  const label = await getStatusLabel(toStatus);
  await prisma.$transaction([
    prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: toStatus,
        lastStatusChangeAt: new Date(),
        lastStatusChangeBy: login,
      },
    }),
    prisma.supportTicketStatusHistory.create({
      data: {
        ticketId: ticket.id,
        fromStatus,
        toStatus,
        changedBy: login,
      },
    }),
    prisma.supportTicketNotification.create({
      data: {
        userLogin: ticket.ownerLogin,
        message: `Status do chamado ${ticket.ticketNumber} alterado para "${label}".`,
        ticketId: ticket.id,
      },
    }),
  ]);
  res.json({ ok: true });
}
