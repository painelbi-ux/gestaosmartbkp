/**
 * Atualiza cards SycroOrder (Comunicação PD) para "Respondido".
 * Uso (na pasta backend): npx tsx scripts/set-sycroorder-respondido-pds.ts
 */
import { prisma } from '../src/config/prisma.js';

const NUMS = ['44835', '47457', '47031'];

function orderNumberVariants(num: string): string[] {
  const n = num.trim();
  return [...new Set([`PD ${n}`, `PD${n}`, `pd ${n}`, `pd${n}`, n, `PD  ${n}`])];
}

async function main() {
  let total = 0;

  for (const num of NUMS) {
    const variants = orderNumberVariants(num);
    const r = await prisma.sycroOrderOrder.updateMany({
      where: { order_number: { in: variants } },
      data: {
        aguarda_resposta_pendente: 0,
        aguarda_resposta_de_label: null,
      },
    });

    if (r.count === 0) {
      const any = await prisma.sycroOrderOrder.findFirst({
        where: { order_number: { contains: num } },
        select: { id: true, order_number: true },
      });
      console.log(
        `PD ${num}: 0 linhas (valor no banco pode ser outro formato). Ex.: ${
          any ? `"${any.order_number}" (#${any.id})` : 'nenhum parecido'
        }`
      );
      continue;
    }

    console.log(`PD ${num}: ${r.count} card(s) -> Respondido`);
    total += r.count;
  }

  console.log(`\nTotal de cards atualizados: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

