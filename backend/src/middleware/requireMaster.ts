import type { Request, Response, NextFunction } from 'express';

const SUPER_LOGINS = new Set(['master', 'marquesfilho']);

/**
 * Exige que o usuário autenticado seja master ou marquesfilho.
 * Deve ser usado após requireAuth.
 */
export function requireMaster(req: Request, res: Response, next: NextFunction): void {
  const login = req.user?.login;
  if (!login || !SUPER_LOGINS.has(login)) {
    res.status(403).json({ error: 'Apenas o usuário master pode realizar esta ação.' });
    return;
  }
  next();
}
