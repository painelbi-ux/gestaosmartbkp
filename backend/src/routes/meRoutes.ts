import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import { requireAuth } from '../middleware/auth.js';
import { getPermissoesUsuario } from '../middleware/requirePermission.js';
import { prisma } from '../config/prisma.js';
import { changePasswordSchema } from '../validators/auth.js';
import { validateCsrf } from '../middleware/csrf.js';

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
    let usuario: {
      id?: number;
      login: string;
      nome: string | null;
      permissoes?: string | null;
      mustChangePassword?: boolean;
      grupo?: { nome: string } | null;
    } | null = null;
    try {
      usuario = await prisma.usuario.findUnique({
        where: { login },
        select: { id: true, login: true, nome: true, permissoes: true, mustChangePassword: true, grupo: { select: { nome: true } } },
      });
    } catch (dbErr) {
      const msg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error('[api/me] Erro ao buscar usuário (tentando sem grupo):', msg);
      try {
        usuario = await prisma.usuario.findUnique({
          where: { login },
          select: { id: true, login: true, nome: true, permissoes: true, mustChangePassword: true },
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
      mustChangePassword: !!usuario?.mustChangePassword,
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

router.post('/change-password', validateCsrf, async (req: Request, res: Response) => {
  const login = req.user?.login;
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  const { senhaAtual, novaSenha } = parsed.data;
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { login },
      select: { id: true, senhaHash: true, ativo: true },
    });
    if (!usuario || usuario.ativo === false) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }
    const ok = await bcrypt.compare(senhaAtual, usuario.senhaHash);
    if (!ok) {
      res.status(400).json({ error: 'Senha atual inválida.' });
      return;
    }
    const senhaHash = await bcrypt.hash(novaSenha, 10);
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash, mustChangePassword: false },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[api/me change-password]', err);
    res.status(503).json({ error: 'Erro ao alterar senha.' });
  }
});

export default router;
