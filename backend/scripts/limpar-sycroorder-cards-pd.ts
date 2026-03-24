/**
 * Remove cards SycroOrder (Comunicação PD) e registros relacionados para PDs informados.
 * Uso: npx tsx backend/scripts/limpar-sycroorder-cards-pd.ts
 */
import { prisma } from '../src/config/prisma.js';

const ORDER_NUMBERS = ['PD 47146', '47146', 'PD 47192', '47192'];

async function main() {
  const cards = await prisma.sycroOrderOrder.findMany({
    where: { order_number: { in: ORDER_NUMBERS } },
    select: { id: true, order_number: true },
  });

  const cardIds = cards.map((c) => c.id);

  if (cardIds.length === 0) {
    console.log('Nenhum card encontrado para os PDs informados.');
    return;
  }

  let delNotif = { count: 0 };
  let delHist = { count: 0 };
  let delReads = { count: 0 };
  let delCards = { count: 0 };

  await prisma.$transaction(async (tx) => {
    delNotif = await tx.sycroOrderNotification.deleteMany({
      where: { order_id: { in: cardIds } },
    });
    delHist = await tx.sycroOrderHistory.deleteMany({
      where: { order_id: { in: cardIds } },
    });
    delReads = await tx.sycroOrderOrderRead.deleteMany({
      where: { order_id: { in: cardIds } },
    });
    delCards = await tx.sycroOrderOrder.deleteMany({
      where: { id: { in: cardIds } },
    });
  });

  console.log('Limpeza concluída:');
  console.log('Cards encontrados:', cards.map((c) => `${c.order_number} (#${c.id})`).join(', '));
  console.log(`- Notificações removidas: ${delNotif.count}`);
  console.log(`- Histórico removido: ${delHist.count}`);
  console.log(`- Leituras removidas: ${delReads.count}`);
  console.log(`- Cards removidos: ${delCards.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
