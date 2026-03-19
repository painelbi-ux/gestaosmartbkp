import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { criarUsuarioSchema, atualizarUsuarioSchema } from '../validators/usuarios.js';

/**
 * GET /api/usuarios - lista usuários (apenas master).
 */
export async function listarUsuarios(_req: Request, res: Response): Promise<void> {
  try {
    const usuarios = await prisma.usuario.findMany({
      select: {
        id: true,
        login: true,
        nome: true,
        grupoId: true,
        fotoUrl: true,
        createdAt: true,
        grupo: { select: { id: true, nome: true } },
      },
      orderBy: { login: 'asc' },
    });
    res.json(
      usuarios.map((u) => ({
        id: u.id,
        login: u.login,
        nome: u.nome,
        grupoId: u.grupoId,
        fotoUrl: u.fotoUrl ?? null,
        grupo: u.grupo?.nome ?? null,
        createdAt: u.createdAt,
      }))
    );
  } catch (err) {
    console.error('listarUsuarios', err);
    res.status(503).json({ error: 'Erro ao listar usuários.' });
  }
}

/**
 * POST /api/usuarios - cria usuário (apenas master).
 */
export async function criarUsuario(req: Request, res: Response): Promise<void> {
  const parsed = criarUsuarioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  const { login: loginUser, senha, nome, grupoId, fotoUrl } = parsed.data;
  try {
    const senhaHash = await bcrypt.hash(senha, 10);
    const usuario = await prisma.usuario.create({
      data: {
        login: loginUser,
        senhaHash,
        nome: nome || null,
        grupoId: grupoId ?? null,
        fotoUrl: fotoUrl ?? null,
      },
      select: {
        id: true,
        login: true,
        nome: true,
        grupoId: true,
        fotoUrl: true,
        createdAt: true,
        grupo: { select: { nome: true } },
      },
    });
    res.status(201).json({
      id: usuario.id,
      login: usuario.login,
      nome: usuario.nome,
      grupoId: usuario.grupoId,
      fotoUrl: usuario.fotoUrl ?? null,
      grupo: usuario.grupo?.nome ?? null,
      createdAt: usuario.createdAt,
    });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'P2002') {
      res.status(400).json({ error: 'Login já existe.' });
      return;
    }
    console.error('criarUsuario', err);
    res.status(503).json({ error: 'Erro ao criar usuário.' });
  }
}

/**
 * PUT /api/usuarios/:id - atualiza usuário (senha/nome/grupo/foto).
 */
export async function atualizarUsuario(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }

  const parsed = atualizarUsuarioSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }

  const { senha, nome, grupoId, fotoUrl } = parsed.data;
  const temAlgumaAlteracao = senha !== undefined || nome !== undefined || grupoId !== undefined || fotoUrl !== undefined;
  if (!temAlgumaAlteracao) {
    res.status(400).json({ error: 'Informe ao menos um campo para atualizar.' });
    return;
  }

  try {
    const existente = await prisma.usuario.findUnique({
      where: { id },
      select: { id: true, grupoId: true },
    });
    if (!existente) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    // Valida grupo (quando alterando para um grupo específico)
    if (grupoId !== undefined && grupoId !== null) {
      const grupoExiste = await prisma.grupoUsuario.findUnique({ where: { id: grupoId } });
      if (!grupoExiste) {
        res.status(400).json({ error: 'Grupo informado não existe.' });
        return;
      }
    }

    const dataUpdate: {
      senhaHash?: string;
      nome?: string | null;
      grupoId?: number | null;
      fotoUrl?: string | null;
    } = {};

    if (senha !== undefined) {
      dataUpdate.senhaHash = await bcrypt.hash(senha, 10);
    }
    if (nome !== undefined) {
      dataUpdate.nome = nome ?? null;
    }
    if (grupoId !== undefined) {
      dataUpdate.grupoId = grupoId ?? null;
    }
    if (fotoUrl !== undefined) {
      dataUpdate.fotoUrl = fotoUrl ?? null;
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data: dataUpdate,
      select: {
        id: true,
        login: true,
        nome: true,
        grupoId: true,
        fotoUrl: true,
        createdAt: true,
        grupo: { select: { nome: true } },
      },
    });

    res.json({
      id: usuario.id,
      login: usuario.login,
      nome: usuario.nome,
      grupoId: usuario.grupoId,
      fotoUrl: usuario.fotoUrl ?? null,
      grupo: usuario.grupo?.nome ?? null,
      createdAt: usuario.createdAt,
    });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'P2002') {
      // não deveria ocorrer pois login é imutável, mas mantemos como fallback
      res.status(400).json({ error: 'Dados conflitantes.' });
      return;
    }
    console.error('atualizarUsuario', err);
    res.status(503).json({ error: 'Erro ao atualizar usuário.' });
  }
}
