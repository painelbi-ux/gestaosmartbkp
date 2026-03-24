import { prisma } from '../src/config/prisma.js';

async function main() {
  const login = 'gilvania';
  const orderNumbers = ['PD 46992', '46992'];

  const user = await prisma.usuario.findUnique({
    where: { login },
    select: { id: true, login: true, nome: true },
  });
  if (!user) {
    console.log(`Usuário não encontrado: ${login}`);
    return;
  }

  const orders = await prisma.sycroOrderOrder.findMany({
    where: { order_number: { in: orderNumbers } },
    select: { id: true, order_number: true, responsible_user_id: true, delivery_method: true, created_by: true, created_at: true },
  });

  console.log('Usuário:', user);
  console.log('Orders:', orders);

  function normalizeLogin(login: string) {
    return String(login ?? '').trim().toLowerCase();
  }
  function isResponsavelJosenildo(deliveryMethod: string): boolean {
    const fm = String(deliveryMethod ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return (
      (fm.includes('entrega') && fm.includes('grande')) ||
      (fm.includes('retirada') && fm.includes('moveis')) ||
      fm.includes('so aco')
    );
  }

  for (const o of orders) {
    const primaryLogin = isResponsavelJosenildo(o.delivery_method) ? 'josenildo' : 'pcp';
    const primaryUser = await prisma.usuario.findFirst({
      where: { login: { equals: primaryLogin } },
      select: { id: true, login: true },
    });
    const recipientIds = new Set<number>();
    if (primaryUser?.id) recipientIds.add(primaryUser.id);
    if (o.responsible_user_id != null && Number.isFinite(o.responsible_user_id)) recipientIds.add(o.responsible_user_id);
    console.log(`Computed recipients for order ${o.order_number}:`, [...recipientIds]);
    console.log('primaryLogin:', primaryLogin, 'primaryUser:', primaryUser);
  }

  const notifications = await prisma.sycroOrderNotification.findMany({
    where: { user_id: user.id, order_id: { in: orders.map((o) => o.id) } },
    orderBy: { created_at: 'desc' },
  });

  console.log('Notificações do usuário para esses cards:', notifications);

  const notificationsAll = await prisma.sycroOrderNotification.findMany({
    where: { order_id: { in: orders.map((o) => o.id) } },
    orderBy: { created_at: 'desc' },
  });
  console.log('Notificações (todas) para esses cards:', notificationsAll);

  const allForUser = await prisma.sycroOrderNotification.findMany({
    where: { user_id: user.id },
    orderBy: { created_at: 'desc' },
    take: 20,
  });
  console.log('Notificações (últimas 20) para o usuário:', allForUser);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

