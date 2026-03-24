/**
 * Aplica responsible_user_id (responsável adicional) para cards SycroOrder antigos
 * criados antes da funcionalidade de "responsável adicional".
 *
 * Uso: npx tsx scripts/aplicar-responsavel-legacy-sycroorder.ts
 */

import { prisma } from '../src/config/prisma.js';

async function main() {
  const loginDestino = 'marcosamorim';
  const pdList = [
    'PD 44835',
    'PD 46688',
    'PD 47483',
    'PD 47851',
    'PD 47731',
    'PD 47457',
    'PD 47031',
    'PD 47265',
  ];

  // Em SQLite/Prisma, o campo `login` já é normalizado para minúsculo no app.
  const user = await prisma.usuario.findUnique({
    where: { login: loginDestino },
    select: { id: true, login: true, nome: true },
  });
  if (!user) {
    throw new Error(`Usuário destino não encontrado: ${loginDestino}`);
  }

  const result = await prisma.sycroOrderOrder.updateMany({
    where: { order_number: { in: pdList } },
    data: { responsible_user_id: user.id },
  });

  console.log('Aplicação de responsável adicional (legacy) concluída:');
  console.log(`  - Usuário: ${user.login}${user.nome ? ` (${user.nome})` : ''}`);
  console.log(`  - Cards: ${result.count} atualizado(s)`);
  console.log(`  - PDs: ${pdList.join(', ')}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

