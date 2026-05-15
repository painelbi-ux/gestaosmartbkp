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

const SUPER_LOGINS = new Set(['master', 'marquesfilho']);

/**
 * Retorna as permissões do usuário: se for master ou marquesfilho, todas; senão as do grupo.
 */
export async function getPermissoesUsuario(login: string): Promise<CodigoPermissao[]> {
  if (SUPER_LOGINS.has(login)) {
    // Mesmo para super-usuários, respeitamos `ativo`/`grupo.ativo`.
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
  const comprasGrupoComIntegracaoImplicita = ['Compras', 'Operador Compras'].includes(String(grupoNome));

  if (comprasGrupoComIntegracaoImplicita) {
    // Compatibilidade: esses dois nomes de grupo sempre recebem integração se ainda não estiver no JSON.
    if (!union.includes(PERMISSOES.INTEGRACAO_VER)) union.push(PERMISSOES.INTEGRACAO_VER);
    if (!union.includes(PERMISSOES.INTEGRACAO_EDITAR)) union.push(PERMISSOES.INTEGRACAO_EDITAR);
  }

  // Demais grupos: integracao.* vem apenas do que está salvo em grupo.permissoes (ex.: Supervisor de Compras).
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
