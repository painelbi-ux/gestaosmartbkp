/**
 * Diagnostico rápido de permissões de usuários (sem alterar banco).
 *
 * Uso: npx tsx scripts/diagnostico-permissoes-usuarios.ts
 */
import { prisma } from '../src/config/prisma.js';

const USERS = ['marcosamorim', 'gilvania', 'francelino', 'wellingtonfeitosa'];

async function main() {
  const usuarios = await prisma.usuario.findMany({
    where: { login: { in: USERS } },
    select: { id: true, login: true, grupoId: true, grupo: { select: { nome: true, permissoes: true } } },
  });

  console.log('Permissões (diagnóstico) - Comunicação PD x Pedidos');
  for (const u of usuarios) {
    let perms: string[] = [];
    try {
      perms = u.grupo?.permissoes ? (JSON.parse(u.grupo.permissoes) as string[]) : [];
    } catch {
      perms = [];
    }
    console.log(`- ${u.login} (grupo=${u.grupo?.nome ?? '—'})`);
    console.log(`  permissoes=${perms.join(', ') || '[]'}`);
  }
  for (const login of USERS) {
    if (!usuarios.some((u) => u.login === login)) {
      console.log(`- ${login} (não encontrado no banco)`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());

