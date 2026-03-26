/**
 * Atualiza aguarda resposta para josenildo nos PDs informados.
 * Uso: npx tsx scripts/set-aguarda-josenildo-pds.ts
 */
import { prisma } from '../src/config/prisma.js';

const NUMS = ['47483', '47851'];
const LABEL = 'josenildo';

function orderNumberVariants(num: string): string[] {
  const n = num.trim();
  return [...new Set([`PD ${n}`, `PD${n}`, `pd ${n}`, `pd${n}`, n, `PD  ${n}`])];
}

async function main() {
  for (const num of NUMS) {
    const r = await prisma.sycroOrderOrder.updateMany({
      where: { order_number: { in: orderNumberVariants(num) } },
      data: {
        aguarda_resposta_pendente: 1,
        aguarda_resposta_de_label: LABEL,
      },
    });
    console.log(`PD ${num}: ${r.count} card(s) -> "${LABEL}"`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
