import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { LABELS_PERMISSOES, PERMISSOES, type CodigoPermissao } from '../config/permissoes.js';
import { criarGrupoSchema, atualizarGrupoSchema } from '../validators/grupos.js';
import { getPermissoesUsuario } from '../middleware/requirePermission.js';

function parsePermissoes(json: string): CodigoPermissao[] {
  try {
    const arr = JSON.parse(json) as string[];
    return arr.filter((p): p is CodigoPermissao => typeof p === 'string');
  } catch {
    return [];
  }
}

function serializePermissoes(permissoes: string[]): string {
  return JSON.stringify(Array.isArray(permissoes) ? permissoes : []);
}

/**
 * GET /api/grupos - lista grupos (para quem pode gerenciar usuários).
 */
export async function listarGrupos(_req: Request, res: Response): Promise<void> {
  try {
    const grupos = await prisma.grupoUsuario.findMany({
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        nome: true,
        descricao: true,
        permissoes: true,
        ativo: true,
        _count: { select: { usuarios: true } },
      },
    });
    const withParsed = grupos.map((g) => ({
      id: g.id,
      nome: g.nome,
      descricao: g.descricao,
      permissoes: parsePermissoes(g.permissoes),
      ativo: g.ativo,
      totalUsuarios: g._count.usuarios,
    }));
    res.json(withParsed);
  } catch (err) {
    console.error('listarGrupos', err);
    res.status(503).json({ error: 'Erro ao listar grupos.' });
  }
}

/**
 * GET /api/grupos/permissoes - lista códigos e labels de permissões (para UI).
 */
export function listarPermissoes(_req: Request, res: Response): void {
  const lista = Object.entries(LABELS_PERMISSOES).map(([codigo, label]) => ({ codigo, label }));
  res.json(lista);
}

/**
 * POST /api/grupos - cria grupo.
 */
export async function criarGrupo(req: Request, res: Response): Promise<void> {
  const parsed = criarGrupoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  const { nome, descricao, permissoes, ativo } = parsed.data;
  try {
    const grupo = await prisma.grupoUsuario.create({
      data: {
        nome,
        descricao: descricao ?? null,
        permissoes: serializePermissoes(permissoes),
        ativo: ativo ?? true,
      },
      select: { id: true, nome: true, descricao: true, permissoes: true, ativo: true },
    });
    res.status(201).json({
      id: grupo.id,
      nome: grupo.nome,
      descricao: grupo.descricao,
      permissoes: parsePermissoes(grupo.permissoes),
      ativo: grupo.ativo,
      totalUsuarios: 0,
    });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'P2002') {
      res.status(400).json({ error: 'Já existe um grupo com este nome.' });
      return;
    }
    console.error('criarGrupo', err);
    res.status(503).json({ error: 'Erro ao criar grupo.' });
  }
}

/**
 * PUT /api/grupos/:id - atualiza grupo.
 */
export async function atualizarGrupo(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  const parsed = atualizarGrupoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Dados inválidos', details: parsed.error.flatten() });
    return;
  }
  // Enforcement granular por campo.
  const login = req.user?.login;
  if (!login) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  const userPerms = await getPermissoesUsuario(login);
  const has = (codes: string[]) => codes.some((c) => userPerms.includes(c as any));
  const podeInativar = has([PERMISSOES.GRUPOS_INATIVAR, PERMISSOES.GRUPOS_TOTAL, PERMISSOES.USUARIOS_GERENCIAR, PERMISSOES.USUARIOS_TOTAL]);
  const podeEditar = has([PERMISSOES.GRUPOS_EDITAR, PERMISSOES.GRUPOS_TOTAL, PERMISSOES.USUARIOS_GERENCIAR, PERMISSOES.USUARIOS_TOTAL]);

  const novoAtivo = parsed.data.ativo;
  if (novoAtivo !== undefined && !podeInativar) {
    res.status(403).json({ error: 'Sem permissão para inativar/ativar grupo.' });
    return;
  }

  const teveOutrosCampos =
    parsed.data.nome !== undefined || parsed.data.descricao !== undefined || parsed.data.permissoes !== undefined;
  if (teveOutrosCampos && !podeEditar) {
    res.status(403).json({ error: 'Sem permissão para editar grupo.' });
    return;
  }
  try {
    const existente = await prisma.grupoUsuario.findUnique({ where: { id } });
    if (!existente) {
      res.status(404).json({ error: 'Grupo não encontrado.' });
      return;
    }
    const data: { nome?: string; descricao?: string | null; permissoes?: string; ativo?: boolean } = {};
    if (parsed.data.nome !== undefined) data.nome = parsed.data.nome;
    if (parsed.data.descricao !== undefined) data.descricao = parsed.data.descricao ?? null;
    if (parsed.data.permissoes !== undefined) data.permissoes = serializePermissoes(parsed.data.permissoes);
    if (parsed.data.ativo !== undefined) data.ativo = parsed.data.ativo;
    const grupo = await prisma.grupoUsuario.update({
      where: { id },
      data,
      select: {
        id: true,
        nome: true,
        descricao: true,
        permissoes: true,
        ativo: true,
        _count: { select: { usuarios: true } },
      },
    });
    res.json({
      id: grupo.id,
      nome: grupo.nome,
      descricao: grupo.descricao,
      permissoes: parsePermissoes(grupo.permissoes),
      ativo: grupo.ativo,
      totalUsuarios: grupo._count.usuarios,
    });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === 'P2002') {
      res.status(400).json({ error: 'Já existe um grupo com este nome.' });
      return;
    }
    console.error('atualizarGrupo', err);
    res.status(503).json({ error: 'Erro ao atualizar grupo.' });
  }
}

/**
 * DELETE /api/grupos/:id - exclusão física do grupo.
 * Regra: bloquear se existir qualquer vínculo (ex.: usuários vinculados).
 */
export async function excluirGrupo(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }
  try {
    const existente = await prisma.grupoUsuario.findUnique({ where: { id } });
    if (!existente) {
      res.status(404).json({ error: 'Grupo não encontrado.' });
      return;
    }

    // Regra de integridade: se houver vínculo com usuários, bloquear exclusão física.
    const totalVinculosUsuarios = await prisma.usuario.count({ where: { grupoId: id } });
    if (totalVinculosUsuarios > 0) {
      res.status(400).json({
        error: 'Não é possível excluir fisicamente este grupo porque existem usuários vinculados.',
        orientacao: 'Use inativação (`ativo=false`) em vez de exclusão.',
      });
      return;
    }

    await prisma.grupoUsuario.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error('excluirGrupo', err);
    res.status(503).json({ error: 'Erro ao excluir grupo.' });
  }
}
