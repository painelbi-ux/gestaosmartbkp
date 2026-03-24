import { prisma } from '../src/config/prisma.js';

async function main() {
  const pdTeste = ['PD 46992', '46992'];
  const pdResponsavel = ['PD 47015', '47015'];

  const marcos = await prisma.usuario.findUnique({
    where: { login: 'marcosamorim' },
    select: { id: true, login: true, nome: true },
  });

  if (!marcos) {
    throw new Error('Usuário marcosamorim não encontrado.');
  }

  const cardsTeste = await prisma.sycroOrderOrder.findMany({
    where: { order_number: { in: pdTeste } },
    select: { id: true, order_number: true },
  });

  const cardIdsTeste = cardsTeste.map((c) => c.id);

  let delNotif = { count: 0 };
  let delHist = { count: 0 };
  let delReads = { count: 0 };
  let delCards = { count: 0 };

  if (cardIdsTeste.length > 0) {
    await prisma.$transaction(async (tx) => {
      delNotif = await tx.sycroOrderNotification.deleteMany({
        where: { order_id: { in: cardIdsTeste } },
      });
      delHist = await tx.sycroOrderHistory.deleteMany({
        where: { order_id: { in: cardIdsTeste } },
      });
      delReads = await tx.sycroOrderOrderRead.deleteMany({
        where: { order_id: { in: cardIdsTeste } },
      });
      delCards = await tx.sycroOrderOrder.deleteMany({
        where: { id: { in: cardIdsTeste } },
      });
    });
  }

  const updResp = await prisma.sycroOrderOrder.updateMany({
    where: { order_number: { in: pdResponsavel } },
    data: { responsible_user_id: marcos.id },
  });

  console.log('Ajustes concluídos:');
  console.log(`- Card(s) teste encontrados (PD 46992): ${cardsTeste.length}`);
  console.log(`- Notificações removidas: ${delNotif.count}`);
  console.log(`- Histórico removido: ${delHist.count}`);
  console.log(`- Leituras removidas: ${delReads.count}`);
  console.log(`- Card(s) removidos: ${delCards.count}`);
  console.log(`- Card(s) atualizados com responsável adicional no PD 47015: ${updResp.count}`);
  console.log(`- Responsável adicional aplicado: ${marcos.login}${marcos.nome ? ` (${marcos.nome})` : ''}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

