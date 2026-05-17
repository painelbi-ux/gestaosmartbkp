import { prisma } from './prisma.js';
import { GRUPO_MASTER_NOME, serializePermissoesMaster } from './grupoMaster.js';

/**
 * Garante que o grupo Master exista com todas as permissões do sistema.
 */
export async function ensureGrupoMaster(): Promise<void> {
  const permissoes = serializePermissoesMaster();
  await prisma.grupoUsuario.upsert({
    where: { nome: GRUPO_MASTER_NOME },
    update: {
      permissoes,
      descricao: 'Acesso total ao sistema (equivalente ao usuário master)',
      ativo: true,
    },
    create: {
      nome: GRUPO_MASTER_NOME,
      descricao: 'Acesso total ao sistema (equivalente ao usuário master)',
      permissoes,
      ativo: true,
    },
  });
}
