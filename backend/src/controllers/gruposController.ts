import type { Request, Response } from 'express';
import { prisma } from '../config/prisma.js';
import { LABELS_PERMISSOES, PERMISSOES, type CodigoPermissao } from '../config/permissoes.js';
import { criarGrupoSchema, atualizarGrupoSchema } from '../validators/grupos.js';
import { getPermissoesUsuario } from '../middleware/requirePermission.js';
import { validarTelaPrincipalParaPermissoesGrupo } from '../config/telaPrincipalGrupo.js';
import {
  GRUPO_MASTER_NOME,
  isGrupoMasterNome,
  podeEditarGrupoMaster,
  serializePermissoesMaster,
} from '../config/grupoMaster.js';
import { TODAS_PERMISSOES } from '../config/permissoes.js';

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
        telaPrincipalInicial: true,
        logoutInatividadeMinutos: true,
        ativo: true,
        _count: { select: { usuarios: true } },
      },
    });
    const withParsed = grupos.map((g) => ({
      id: g.id,
      nome: g.nome,
      descricao: g.descricao,
      permissoes: isGrupoMasterNome(g.nome) ? [...TODAS_PERMISSOES] : parsePermissoes(g.permissoes),
      telaPrincipalInicial: g.telaPrincipalInicial ?? null,
      logoutInatividadeMinutos: g.logoutInatividadeMinutos ?? null,
      ativo: g.ativo,
      totalUsuarios: g._count.usuarios,
      isGrupoMaster: isGrupoMasterNome(g.nome),
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
  const { nome, descricao, permissoes, ativo, telaPrincipalInicial, logoutInatividadeMinutos } = parsed.data;
  if (isGrupoMasterNome(nome)) {
    res.status(400).json({ error: `O nome "${GRUPO_MASTER_NOME}" é reservado ao grupo de acesso total do sistema.` });
    return;
  }
  const checkTela = validarTelaPrincipalParaPermissoesGrupo(telaPrincipalInicial ?? null, permissoes);
  if (!checkTela.ok) {
    res.status(400).json({ error: checkTela.error });
    return;
  }
  try {
    const grupo = await prisma.grupoUsuario.create({
      data: {
        nome,
        descricao: descricao ?? null,
        permissoes: serializePermissoes(permissoes),
        telaPrincipalInicial: checkTela.value,
        logoutInatividadeMinutos: logoutInatividadeMinutos ?? null,
        ativo: ativo ?? true,
      },
      select: {
        id: true,
        nome: true,
        descricao: true,
        permissoes: true,
        telaPrincipalInicial: true,
        logoutInatividadeMinutos: true,
        ativo: true,
      },
    });
    res.status(201).json({
      id: grupo.id,
      nome: grupo.nome,
      descricao: grupo.descricao,
      permissoes: parsePermissoes(grupo.permissoes),
      telaPrincipalInicial: grupo.telaPrincipalInicial ?? null,
      logoutInatividadeMinutos: grupo.logoutInatividadeMinutos ?? null,
      ativo: grupo.ativo,
      totalUsuarios: 0,
      isGrupoMaster: false,
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
    parsed.data.nome !== undefined ||
    parsed.data.descricao !== undefined ||
    parsed.data.permissoes !== undefined ||
    parsed.data.telaPrincipalInicial !== undefined;
  if (teveOutrosCampos && !podeEditar) {
    res.status(403).json({ error: 'Sem permissão para editar grupo.' });
    return;
  }
  try {
    const existente = await prisma.grupoUsuario.findUnique({
      where: { id },
      select: { nome: true, permissoes: true, telaPrincipalInicial: true },
    });
    if (!existente) {
      res.status(404).json({ error: 'Grupo não encontrado.' });
      return;
    }

    const ehGrupoMaster = isGrupoMasterNome(existente.nome);

    if (ehGrupoMaster) {
      if (parsed.data.nome !== undefined && parsed.data.nome !== GRUPO_MASTER_NOME) {
        res.status(400).json({ error: `O grupo ${GRUPO_MASTER_NOME} não pode ser renomeado.` });
        return;
      }
      if (parsed.data.permissoes !== undefined && !podeEditarGrupoMaster(userPerms)) {
        res.status(403).json({ error: 'Sem permissão para alterar permissões do grupo Master.' });
        return;
      }
      const camposMasterSemPermissao =
        (parsed.data.descricao !== undefined ||
          parsed.data.telaPrincipalInicial !== undefined ||
          parsed.data.logoutInatividadeMinutos !== undefined ||
          parsed.data.ativo !== undefined) &&
        !podeEditarGrupoMaster(userPerms);
      if (camposMasterSemPermissao) {
        res.status(403).json({ error: 'Sem permissão para editar configurações do grupo Master.' });
        return;
      }
    } else if (parsed.data.nome !== undefined && isGrupoMasterNome(parsed.data.nome)) {
      res.status(400).json({ error: `O nome "${GRUPO_MASTER_NOME}" é reservado.` });
      return;
    }
    const precisaValidarTela =
      parsed.data.permissoes !== undefined || parsed.data.telaPrincipalInicial !== undefined;
    let telaPrincipalInicialGravar: string | null | undefined;
    if (precisaValidarTela) {
      const nextPerms =
        parsed.data.permissoes !== undefined ? parsed.data.permissoes : parsePermissoes(existente.permissoes);
      const nextTela =
        parsed.data.telaPrincipalInicial !== undefined
          ? parsed.data.telaPrincipalInicial
          : existente.telaPrincipalInicial;
      const checkTela = validarTelaPrincipalParaPermissoesGrupo(nextTela ?? null, nextPerms);
      if (!checkTela.ok) {
        res.status(400).json({ error: checkTela.error });
        return;
      }
      if (parsed.data.telaPrincipalInicial !== undefined) {
        telaPrincipalInicialGravar = checkTela.value;
      }
    }

    const data: {
      nome?: string;
      descricao?: string | null;
      permissoes?: string;
      ativo?: boolean;
      telaPrincipalInicial?: string | null;
      logoutInatividadeMinutos?: number | null;
    } = {};
    if (parsed.data.nome !== undefined) data.nome = parsed.data.nome;
    if (parsed.data.descricao !== undefined) data.descricao = parsed.data.descricao ?? null;
    if (parsed.data.permissoes !== undefined) {
      data.permissoes = ehGrupoMaster ? serializePermissoesMaster() : serializePermissoes(parsed.data.permissoes);
    }
    if (parsed.data.ativo !== undefined) data.ativo = parsed.data.ativo;
    if (parsed.data.telaPrincipalInicial !== undefined) {
      data.telaPrincipalInicial = telaPrincipalInicialGravar ?? null;
    }
    if (parsed.data.logoutInatividadeMinutos !== undefined) {
      data.logoutInatividadeMinutos = parsed.data.logoutInatividadeMinutos;
    }
    const grupo = await prisma.grupoUsuario.update({
      where: { id },
      data,
      select: {
        id: true,
        nome: true,
        descricao: true,
        permissoes: true,
        telaPrincipalInicial: true,
        logoutInatividadeMinutos: true,
        ativo: true,
        _count: { select: { usuarios: true } },
      },
    });
    res.json({
      id: grupo.id,
      nome: grupo.nome,
      descricao: grupo.descricao,
      permissoes: isGrupoMasterNome(grupo.nome) ? [...TODAS_PERMISSOES] : parsePermissoes(grupo.permissoes),
      telaPrincipalInicial: grupo.telaPrincipalInicial ?? null,
      logoutInatividadeMinutos: grupo.logoutInatividadeMinutos ?? null,
      ativo: grupo.ativo,
      totalUsuarios: grupo._count.usuarios,
      isGrupoMaster: isGrupoMasterNome(grupo.nome),
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
    if (isGrupoMasterNome(existente.nome)) {
      res.status(400).json({
        error: `O grupo ${GRUPO_MASTER_NOME} é do sistema e não pode ser excluído.`,
        orientacao: 'Remova os usuários do grupo ou inative-o.',
      });
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
