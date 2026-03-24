/**
 * Backfill: para cards SycroOrder antigos/criados com falhas, cria notificações
 * SOMENTE para os responsáveis do card quando não houver nenhuma notificação registrada.
 *
 * Uso: npx tsx scripts/backfill-sycroorder-notifications-missing.ts
 */

import { prisma } from '../src/config/prisma.js';

function isResponsavelJosenildo(deliveryMethod: string): boolean {
  const fm = String(deliveryMethod ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  return (fm.includes('entrega') && fm.includes('grande')) || (fm.includes('retirada') && fm.includes('moveis')) || fm.includes('so aco');
}

function isFiniteNumber(v: unknown): v is number {
  return v != null && typeof v === 'number' && Number.isFinite(v);
}

async function main() {
  const orders = await prisma.sycroOrderOrder.findMany({
    where: { notifications: { none: {} } },
    select: {
      id: true,
      order_number: true,
      delivery_method: true,
      responsible_user_id: true,
      creator_name: true,
    },
  });

  console.log(`Encontrados ${orders.length} cards sem notificações.`);

  let totalCreated = 0;
  for (const o of orders) {
    const recipientIds = new Set<number>();

    const primaryLogin = isResponsavelJosenildo(o.delivery_method ?? '') ? 'josenildo' : 'pcp';
    const primaryUser = await prisma.usuario.findFirst({
      where: { login: { equals: primaryLogin } },
      select: { id: true },
    });
    if (primaryUser?.id) recipientIds.add(primaryUser.id);

    if (isFiniteNumber(o.responsible_user_id)) recipientIds.add(o.responsible_user_id);

    const recipientList = [...recipientIds];
    if (recipientList.length === 0) continue;

    const msg = `Novo card ${String(o.order_number ?? '').trim()} criado por ${o.creator_name ?? '—'}`;
    await prisma.sycroOrderNotification.createMany({
      data: recipientList.map((uid) => ({
        user_id: uid,
        message: msg,
        order_id: o.id,
      })),
    });
    totalCreated += recipientList.length;

    console.log(`Backfill PD ${o.order_number}: ${recipientList.length} notificação(ões)`);
  }

  console.log(`Total de notificações criadas: ${totalCreated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

