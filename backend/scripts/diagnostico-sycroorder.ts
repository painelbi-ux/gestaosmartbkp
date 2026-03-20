/**
 * Diagnostico rápido do SycroOrder (Comunicação PD):
 * - Quantidade de cards
 * - Quantidade de histórico/notificações/leitura
 * - Lista curta dos cards mais recentes
 *
 * Uso: npx tsx scripts/diagnostico-sycroorder.ts
 */
import { prisma } from '../src/config/prisma.js';

async function main() {
  const [ordersCount, histCount, notifCount, readsCount] = await Promise.all([
    prisma.sycroOrderOrder.count(),
    prisma.sycroOrderHistory.count(),
    prisma.sycroOrderNotification.count(),
    prisma.sycroOrderOrderRead.count(),
  ]);

  console.log('SycroOrder (Comunicação PD)');
  console.log(`  - Orders: ${ordersCount}`);
  console.log(`  - History: ${histCount}`);
  console.log(`  - Notifications: ${notifCount}`);
  console.log(`  - Reads: ${readsCount}`);

  const recent = await prisma.sycroOrderOrder.findMany({
    orderBy: { created_at: 'desc' },
    take: 10,
    select: {
      id: true,
      order_number: true,
      delivery_method: true,
      current_promised_date: true,
      status: true,
      is_urgent: true,
      tag_disponivel: true,
      created_by: true,
      creator_name: true,
      created_at: true,
    },
  });

  console.log('\nCards mais recentes (até 10):');
  for (const o of recent) {
    console.log(
      `  #${o.id} pedido=${o.order_number} entrega="${o.delivery_method}" prometida=${o.current_promised_date} status=${o.status} tag=${o.tag_disponivel} criador=${o.creator_name ?? o.created_by ?? '—'} em=${o.created_at.toISOString()}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

