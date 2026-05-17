import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/prisma.js';
import { usuarioTemAcessoMaster } from '../config/grupoMaster.js';

/**
 * Exige que o usuário autenticado seja master, login admin, marquesfilho ou grupo admin/Master.
 * Deve ser usado após requireAuth.
 */
export async function requireMasterOrAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const login = req.user?.login;
  if (login && (await usuarioTemAcessoMaster(login))) {
    next();
    return;
  }
  if (login === 'admin') {
    next();
    return;
  }
  if (!login) {
    res.status(403).json({ error: 'Apenas usuários autorizados podem realizar esta ação.' });
    return;
  }
  const usuario = await prisma.usuario.findUnique({
    where: { login },
    select: { grupo: { select: { nome: true } } },
  });
  const nomeGrupo = usuario?.grupo?.nome;
  if (nomeGrupo === 'admin' || nomeGrupo === 'Administrador') {
    next();
    return;
  }
  res.status(403).json({ error: 'Apenas usuários autorizados podem realizar esta ação.' });
}
