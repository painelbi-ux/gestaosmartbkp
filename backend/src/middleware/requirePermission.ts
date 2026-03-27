import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { PERMISSOES, TODAS_PERMISSOES, type CodigoPermissao } from '../config/permissoes.js';

function parsePermissoesJSON(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as string[];
    return arr.filter((p) => typeof p === 'string');
  } catch {
    return [];
  }
}

/**
 * Retorna as permissões do usuário: se for master, todas; senão as do grupo.
 */
export async function getPermissoesUsuario(login: string): Promise<CodigoPermissao[]> {
  if (login === 'master') {
    // Mesmo para master, respeitamos `ativo`/`grupo.ativo`.
    const usuario = await prisma.usuario.findUnique({
      where: { login },
      select: { ativo: true, grupo: { select: { ativo: true } } },
    });
    if (!usuario) return [];
    if (usuario.ativo === false) return [];
    if (usuario.grupo && usuario.grupo.ativo === false) return [];
    return [...TODAS_PERMISSOES];
  }
  const usuario = await prisma.usuario.findUnique({
    where: { login },
    select: {
      id: true,
      ativo: true,
      permissoes: true,
      grupo: { select: { ativo: true, nome: true, permissoes: true } },
    },
  });

  if (!usuario) return [];
  if (usuario.ativo === false) return [];
  if (usuario.grupo && usuario.grupo.ativo === false) return [];

  const groupPerms = parsePermissoesJSON(usuario.grupo?.permissoes);
  const union = [...new Set([...groupPerms])];

  const grupoNome = usuario.grupo?.nome ?? '';
  const allowIntegracaoForGroup = ['Compras', 'Operador Compras'].includes(String(grupoNome));

  if (allowIntegracaoForGroup) {
    // Garante que os grupos Compras/Operador Compras tenham acesso à integração.
    if (!union.includes(PERMISSOES.INTEGRACAO_VER)) union.push(PERMISSOES.INTEGRACAO_VER);
    if (!union.includes(PERMISSOES.INTEGRACAO_EDITAR)) union.push(PERMISSOES.INTEGRACAO_EDITAR);
  }

  // Regra legado: integração só para master.
  // Exceção: grupos Compras e Operador Compras.
  if (!allowIntegracaoForGroup) {
    const semIntegracaoParaNaoMaster = union.filter((p) => !String(p).startsWith('integracao.'));
    return semIntegracaoParaNaoMaster.filter((p): p is CodigoPermissao => typeof p === 'string');
  }

  return union.filter((p): p is CodigoPermissao => typeof p === 'string');
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
