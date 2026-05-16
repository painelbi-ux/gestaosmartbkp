import { prisma } from '../config/prisma.js';

const COMMERCIAL_TEAM_FLAG = '__time_comercial__';

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

function parsePermissoesJson(value: string | null | undefined): string[] {
  const arr = parseJsonArray(value);
  return arr ?? [];
}

export function isUserCommercialTeamByPermsJson(permissoesJson: string | null | undefined): boolean {
  return parsePermissoesJson(permissoesJson).includes(COMMERCIAL_TEAM_FLAG);
}

/** True se a forma de entrega indica responsável josenildo (vs PCP). */
export function isResponsavelJosenildo(deliveryMethod: string): boolean {
  const fm = String(deliveryMethod ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  return (
    (fm.includes('entrega') && fm.includes('grande')) ||
    (fm.includes('retirada') && fm.includes('moveis')) ||
    fm.includes('so aco')
  );
}

async function resolvePrimaryRecipientUserId(delivery_method: string): Promise<number | null> {
  const primaryLogin = isResponsavelJosenildo(delivery_method) ? 'josenildo' : 'pcp';
  const primaryUser = await prisma.usuario.findFirst({
    where: { login: { equals: primaryLogin } },
    select: { id: true },
  });
  return primaryUser?.id ?? null;
}

export async function resolveSycroOrderResponsibleRecipientUserIds(args: {
  delivery_method: string;
  responsible_user_id: number | null | undefined;
}): Promise<number[]> {
  const primaryId = await resolvePrimaryRecipientUserId(args.delivery_method);
  const recipientIds = new Set<number>();
  if (primaryId != null) recipientIds.add(primaryId);

  if (args.responsible_user_id != null && Number.isFinite(args.responsible_user_id)) {
    recipientIds.add(args.responsible_user_id);
  }

  return [...recipientIds];
}

async function usuarioEhTimeComercial(userId: number | null): Promise<boolean> {
  if (userId == null || !Number.isFinite(userId)) return false;
  const u = await prisma.usuario.findUnique({
    where: { id: userId },
    select: { permissoes: true, ativo: true },
  });
  if (!u?.ativo) return false;
  return isUserCommercialTeamByPermsJson(u.permissoes);
}

/**
 * Um único nome no card "Aguarda resposta de …".
 * - Autor fora do time comercial: prioriza o responsável comercial do card (`responsible_user_id`).
 * - Autor do time comercial: prioriza o destinatário primário da rota (Josenildo ou PCP), depois criador, depois responsável.
 */
export async function resolveAguardaRespostaDeLabel(args: {
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

  const primaryId = await resolvePrimaryRecipientUserId(args.delivery_method);
  const authorIsCommercial = await usuarioEhTimeComercial(args.authorUserId);

  const inPool = (id: number | null | undefined): id is number =>
    id != null && Number.isFinite(id) && pool.has(id);

  let chosenId: number | null = null;

  if (!authorIsCommercial && inPool(args.responsible_user_id)) {
    chosenId = args.responsible_user_id;
  } else if (inPool(primaryId)) {
    chosenId = primaryId;
  } else if (inPool(args.created_by)) {
    chosenId = args.created_by;
  } else if (inPool(args.responsible_user_id)) {
    chosenId = args.responsible_user_id;
  } else {
    const rest = [...pool].sort((a, b) => a - b);
    chosenId = rest.length > 0 ? rest[0]! : null;
  }

  if (chosenId != null) {
    const u = await prisma.usuario.findFirst({
      where: { id: chosenId, ativo: true },
      select: { login: true, nome: true },
    });
    if (u) return u.nome?.trim() ? u.nome.trim() : u.login;
  }
  return isResponsavelJosenildo(args.delivery_method) ? 'josenildo' : 'PCP';
}

/**
 * Para cards já existentes: último comentário com observação define quem "falou por último"
 * (mesma ideia do PATCH que usa o usuário logado como autor). Se não houver, usa o criador.
 */
async function inferAuthorUserIdForAguardaRespostaBackfill(
  orderId: number,
  createdBy: number | null
): Promise<number | null> {
  const rows = await prisma.sycroOrderHistory.findMany({
    where: { order_id: orderId },
    orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
    take: 300,
    select: { user_id: true, observation: true },
  });
  for (const r of rows) {
    if (r.observation != null && String(r.observation).trim() !== '') {
      if (r.user_id != null && Number.isFinite(r.user_id)) return r.user_id;
      return createdBy;
    }
  }
  return createdBy;
}

/**
 * Recalcula `aguarda_resposta_de_label` para todos os cards com pendência ativa,
 * usando os critérios atuais (um único destinatário).
 */
export async function backfillAguardaRespostaLabelsForPendingOrders(): Promise<{ scanned: number; updated: number }> {
  const orders = await prisma.sycroOrderOrder.findMany({
    where: { aguarda_resposta_pendente: 1 },
    select: {
      id: true,
      delivery_method: true,
      created_by: true,
      responsible_user_id: true,
      aguarda_resposta_de_label: true,
    },
  });
  let updated = 0;
  for (const o of orders) {
    const authorId = await inferAuthorUserIdForAguardaRespostaBackfill(o.id, o.created_by);
    const newLabel = await resolveAguardaRespostaDeLabel({
      delivery_method: String(o.delivery_method ?? ''),
      created_by: o.created_by,
      responsible_user_id: o.responsible_user_id,
      authorUserId: authorId,
    });
    const prev = (o.aguarda_resposta_de_label ?? '').trim();
    if (newLabel.trim() !== prev) {
      await prisma.sycroOrderOrder.update({
        where: { id: o.id },
        data: { aguarda_resposta_de_label: newLabel },
      });
      updated += 1;
    }
  }
  return { scanned: orders.length, updated };
}
