import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { TODAS_PERMISSOES, type CodigoPermissao } from '../config/permissoes.js';

/**
 * Retorna as permissões do usuário: se for master, todas; senão as do grupo.
 */
export async function getPermissoesUsuario(login: string): Promise<CodigoPermissao[]> {
  if (login === 'master') {
    return [...TODAS_PERMISSOES];
  }
  const usuario = await prisma.usuario.findUnique({
    where: { login },
    select: { grupoId: true, grupo: { select: { permissoes: true } } },
  });
  if (!usuario?.grupo?.permissoes) return [];
  try {
    const arr = JSON.parse(usuario.grupo.permissoes) as string[];
    return arr.filter((p): p is CodigoPermissao => typeof p === 'string');
  } catch {
    return [];
  }
}

/**
 * Middleware que exige pelo menos uma das permissões informadas.
 * Deve ser usado após requireAuth.
 */
export function requirePermission(...permissoes: CodigoPermissao[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const login = req.user?.login;
      if (!login) {
        res.status(401).json({ error: 'Não autorizado.' });
        return;
      }
      const userPerms = await getPermissoesUsuario(login);
      const hasAny = permissoes.some((p) => userPerms.includes(p));
      if (hasAny) {
        next();
        return;
      }
      res.status(403).json({ error: 'Sem permissão para esta ação.', code: 'permission_denied' });
    } catch (e) {
      const cause = e instanceof Error ? e.message : String(e);
      console.error('[requirePermission]', cause);
      if (!res.headersSent) {
        res.status(503).json({
          error: 'Serviço temporariamente indisponível. Tente novamente.',
          cause,
        });
      }
    }
  };
}
