/**
 * Atualiza aguarda_resposta_pendente / aguarda_resposta_de_label para PDs listados.
 * Uso (na pasta backend): npx tsx scripts/set-sycroorder-aguarda-resposta-pds.ts
 */
import { prisma } from '../src/config/prisma.js';

/** Número do PD (só dígitos) e rótulo exibido na capa do card. */
const ENTRIES: { num: string; label: string }[] = [
  { num: '46953', label: 'viniciusrodrigues' },
  { num: '47192', label: 'viniciusrodrigues' },
  { num: '47015', label: 'viniciusrodrigues' },
  { num: '47457', label: 'marcosamorim' },
  { num: '44835', label: 'marcosamorim' },
  { num: '47588', label: 'viniciusrodrigues' },
  { num: '47031', label: 'marcosamorim' },
  { num: '47745', label: 'viniciusrodrigues' },
  { num: '47483', label: 'viniciusrodrigues' },
  { num: '47851', label: 'viniciusrodrigues' },
  { num: '47907', label: 'marcosamorim' },
  { num: '48035', label: 'marcosamorim' },
  { num: '47731', label: 'marcosamorim' },
  { num: '47676', label: 'Marcos Amorim' },
  { num: '46688', label: 'Marcos Amorim' },
];

function orderNumberVariants(num: string): string[] {
  const n = num.trim();
  const uniq = new Set<string>();
  for (const v of [`PD ${n}`, `PD${n}`, `pd ${n}`, `pd${n}`, n, `PD  ${n}`]) {
    uniq.add(v);
  }
  return [...uniq];
}

async function main() {
  let total = 0;
  for (const { num, label } of ENTRIES) {
    const variants = orderNumberVariants(num);
    const r = await prisma.sycroOrderOrder.updateMany({
      where: { order_number: { in: variants } },
      data: {
        aguarda_resposta_pendente: 1,
        aguarda_resposta_de_label: label,
      },
    });
    if (r.count === 0) {
      const any = await prisma.sycroOrderOrder.findFirst({
        where: { order_number: { contains: num } },
        select: { id: true, order_number: true },
      });
      console.log(`PD ${num}: 0 linhas (valor no banco pode ser outro formato). Ex.: ${any ? `"${any.order_number}" (#${any.id})` : 'nenhum parecido'}`);
    } else {
      console.log(`PD ${num}: ${r.count} card(s) -> aguarda resposta de "${label}"`);
      total += r.count;
    }
  }
  console.log(`\nTotal de cards atualizados: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
