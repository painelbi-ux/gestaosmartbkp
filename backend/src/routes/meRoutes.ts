import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getPermissoesUsuario } from '../middleware/requirePermission.js';
import { prisma } from '../config/prisma.js';

const COMMERCIAL_TEAM_FLAG = '__time_comercial__';

function parsePermissoes(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as string[];
    return arr.filter((p) => typeof p === 'string');
  } catch {
    return [];
  }
}

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response) => {
  try {
    const login = req.user?.login ?? '';
    if (!login) {
      res.json({ login: '', nome: null, grupo: null, permissoes: [] });
      return;
    }
    let usuario: { login: string; nome: string | null; permissoes?: string | null; grupo?: { nome: string } | null } | null = null;
    try {
      usuario = await prisma.usuario.findUnique({
        where: { login },
        select: { login: true, nome: true, permissoes: true, grupo: { select: { nome: true } } },
      });
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error('[api/me] Erro ao buscar usuário (tentando sem grupo):', msg);
      try {
        usuario = await prisma.usuario.findUnique({
          where: { login },
          select: { login: true, nome: true, permissoes: true },
        });
        if (usuario) (usuario as { grupo?: { nome: string } | null }).grupo = null;
      } catch (_) {
        console.error('[api/me] Erro de banco:', msg);
        if (!res.headersSent) res.status(503).json({ error: 'Base indisponível. Rode: npx prisma migrate deploy (na pasta backend).' });
        return;
      }
    }
    let permissoes: string[] = [];
    try {
      permissoes = await getPermissoesUsuario(login);
    } catch (_) {
      // mantém permissoes vazio em caso de falha (ex.: coluna/tabela ausente)
    }
    res.json({
      login: usuario?.login ?? login,
      nome: usuario?.nome ?? null,
      grupo: usuario?.grupo?.nome ?? null,
      isCommercialTeam: parsePermissoes(usuario?.permissoes).includes(COMMERCIAL_TEAM_FLAG),
      permissoes,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[api/me] Erro:', msg);
    if (!res.headersSent) {
      res.status(503).json({ error: 'Serviço temporariamente indisponível. Tente novamente.' });
    }
  }
});

export default router;
