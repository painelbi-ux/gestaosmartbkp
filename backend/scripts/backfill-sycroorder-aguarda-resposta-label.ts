/**
 * Recalcula aguarda_resposta_de_label nos cards SycroOrder com aguarda_resposta_pendente = 1,
 * aplicando os critérios atuais (um único destinatário).
 *
 * Uso: cd backend && npx tsx scripts/backfill-sycroorder-aguarda-resposta-label.ts
 */
import { prisma } from '../src/config/prisma.js';
import { backfillAguardaRespostaLabelsForPendingOrders } from '../src/services/sycroOrderAguardaRespostaLabel.js';

async function main(): Promise<void> {
  const r = await backfillAguardaRespostaLabelsForPendingOrders();
  console.log(JSON.stringify(r, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
