/**
 * Zera todas as informações do SycroOrder (Kanban): pedidos, histórico e notificações.
 * Não altera nenhum outro dado do projeto (usuários, pedidos ERP, etc.).
 *
 * Uso: npx tsx scripts/zerar-sycroorder.ts
 */

import { prisma } from '../src/config/prisma.js';

async function main() {
  const notif = await prisma.sycroOrderNotification.deleteMany({});
  const hist = await prisma.sycroOrderHistory.deleteMany({});
  const orders = await prisma.sycroOrderOrder.deleteMany({});

  console.log('SycroOrder zerado:');
  console.log(`  - ${notif.count} notificação(ões) removida(s)`);
  console.log(`  - ${hist.count} registro(s) de histórico removido(s)`);
  console.log(`  - ${orders.count} pedido(s) removido(s)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
