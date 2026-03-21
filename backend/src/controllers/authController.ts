import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { createToken } from '../middleware/auth.js';
import { loginSchema } from '../validators/auth.js';

// Em HTTP (sem HTTPS), secure deve ser false para o navegador enviar o cookie
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.COOKIE_SECURE === 'true',
  sameSite: 'lax' as const,
  maxAge: 24 * 60 * 60 * 1000,
  path: '/',
};

const LOGIN_ERR = 'Erro ao processar login. Tente novamente.';

function sendError(res: Response, status: number, message: string): void {
  try {
    if (!res.headersSent) res.status(status).json({ error: message });
  } catch (e) {
    console.error('[auth] sendError falhou:', (e as Error)?.message);
  }
}

/**
 * POST /auth/login - autentica usuário e define cookie JWT + retorna CSRF.
 * Nunca retorna 500: usa 503 para falhas de serviço (frontend não mostra "Erro no servidor" genérico).
 */
export async function login(req: Request, res: Response): Promise<void> {
  try {
    let body = req.body;
    if (body == null) body = {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body) as Record<string, unknown>;
      } catch {
        body = {};
      }
    }
    if (typeof body !== 'object' || Array.isArray(body)) body = {};

    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      sendError(res, 400, 'Dados inválidos. Envie login e senha.');
      return;
    }

    const { login: loginUser, senha } = parsed.data;
    let usuario:
      | { id: number; login: string; senhaHash: string; ativo: boolean; grupo?: { ativo: boolean } | null }
      | null = null;
    try {
      usuario = await prisma.usuario.findUnique({
        where: { login: loginUser },
        select: {
          id: true,
          login: true,
          senhaHash: true,
          ativo: true,
          grupo: { select: { ativo: true } },
        },
      });
    } catch (dbErr) {
      const err = dbErr as Error;
      console.error('[auth] Erro ao acessar banco no login:', err?.message ?? dbErr);
      sendError(res, 503, 'Base de dados indisponível. Execute na pasta raiz: npm run dev');
      return;
    }
    if (!usuario) {
      sendError(res, 401, 'Login ou senha inválidos.');
      return;
    }
    if (usuario.ativo === false) {
      sendError(res, 403, 'Usuário inativo. Solicite ao administrador que o ative.');
      return;
    }
    if (usuario.grupo?.ativo === false) {
      sendError(res, 403, 'Grupo do usuário está inativo. Solicite ao administrador que ative.');
      return;
    }

    let senhaOk = false;
    try {
      senhaOk = await bcrypt.compare(senha, usuario.senhaHash);
    } catch (bcErr) {
      console.error('[auth] Erro bcrypt:', bcErr);
      sendError(res, 503, LOGIN_ERR);
      return;
    }
    if (!senhaOk) {
      sendError(res, 401, 'Login ou senha inválidos.');
      return;
    }

    let token: string;
    try {
      token = createToken({ sub: String(usuario.id), login: usuario.login });
    } catch (tokenErr) {
      console.error('[auth] Erro ao gerar token:', tokenErr);
      sendError(res, 503, LOGIN_ERR);
      return;
    }

    try {
      res.cookie('token', token, COOKIE_OPTIONS);
    } catch (cookieErr) {
      console.error('[auth] Erro ao definir cookie:', (cookieErr as Error)?.message);
      sendError(res, 503, LOGIN_ERR);
      return;
    }
    const csrfToken = (req as Request & { csrfToken?: string }).csrfToken ?? '';
    if (!res.headersSent) {
      res.status(200).json({ ok: true, login: usuario.login, csrf_token: csrfToken, token });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[auth] Erro inesperado no login:', msg);
    if (stack) console.error('[auth] Stack:', stack);
    sendError(res, 503, LOGIN_ERR);
  }
}

/**
 * POST /auth/logout - limpa cookie. Nunca retorna 500.
 */
export function logout(req: Request, res: Response): void {
  try {
    res.clearCookie('token', { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 0 });
    if (!res.headersSent) res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[auth] logout:', (e as Error)?.message);
    if (!res.headersSent) res.status(503).json({ error: 'Erro ao sair.' });
  }
}

/**
 * GET /auth/csrf - retorna o token CSRF (cookie já definido pelo middleware).
 */
export function getCsrf(req: Request, res: Response): void {
  const csrfToken = (req as Request & { csrfToken?: string }).csrfToken;
  res.json({ csrf_token: csrfToken });
}
