import type { Request, Response, NextFunction } from 'express';
import { usuarioTemAcessoMaster } from '../config/grupoMaster.js';

/**
 * Exige privilégios de master (login legado ou grupo Master).
 * Deve ser usado após requireAuth.
 */
export async function requireMaster(req: Request, res: Response, next: NextFunction): Promise<void> {
  const login = req.user?.login;
  if (!login) {
    res.status(403).json({ error: 'Apenas usuários master podem realizar esta ação.' });
    return;
  }
  try {
    const ok = await usuarioTemAcessoMaster(login);
    if (!ok) {
      res.status(403).json({ error: 'Apenas usuários master podem realizar esta ação.' });
      return;
    }
    next();
  } catch (e) {
    console.error('[requireMaster]', e);
    res.status(503).json({ error: 'Serviço temporariamente indisponível.' });
  }
}
