import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { criarUsuarioSchema, atualizarUsuarioSchema } from '../validators/usuarios.js';
import { PERMISSOES } from '../config/permissoes.js';
import { getPermissoesUsuario } from '../middleware/requirePermission.js';
import {
  getGrupoMasterId,
  isGrupoMasterNome,
  podeGerenciarAtribuicaoGrupoMaster,
  podeGerenciarRemocaoGrupoMaster,
} from '../config/grupoMaster.js';

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

function serializePermissoes(permissoes: string[] | null | undefined): string {
  return JSON.stringify(Array.isArray(permissoes) ? permissoes : []);
}

function withCommercialFlag(perms: string[] | null | undefined, isCommercialTeam: boolean | undefined): string[] {
  const base = Array.isArray(perms) ? [...new Set(perms.map((p) => String(p).trim()).filter(Boolean))] : [];
  if (isCommercialTeam === undefined) return base;
  const withoutFlag = base.filter((p) => p !== COMMERCIAL_TEAM_FLAG);
  return isCommercialTeam ? [...withoutFlag, COMMERCIAL_TEAM_FLAG] : withoutFlag;
}

function isCommercialTeamFromPerms(perms: string[] | null | undefined): boolean {
  return Array.isArray(perms) && perms.includes(COMMERCIAL_TEAM_FLAG);
}

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
        email: true,
        telefone: true,
        ativo: true,
        permissoes: true,
        grupoId: true,
        fotoUrl: true,
        createdAt: true,
        grupo: { select: { id: true, nome: true } },
      },
      orderBy: { login: 'asc' },
    });
    res.json(
      usuarios.map((u) => {
        const perms = parsePermissoes(u.permissoes);
        return {
          id: u.id,
          login: u.login,
          nome: u.nome,
          email: u.email ?? null,
          telefone: u.telefone ?? null,
          ativo: u.ativo,
          permissoes: perms.filter((p) => p !== COMMERCIAL_TEAM_FLAG),
          isCommercialTeam: isCommercialTeamFromPerms(perms),
          grupoId: u.grupoId,
          fotoUrl: u.fotoUrl ?? null,
          grupo: u.grupo?.nome ?? null,
          createdAt: u.createdAt,
        };
      })
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
  const { login: loginUser, senha, nome, email, telefone, grupoId, fotoUrl, ativo, permissoes, isCommercialTeam } = parsed.data;

  const loginReq = req.user?.login;
  if (loginReq && grupoId) {
    const grupoDestino = await prisma.grupoUsuario.findUnique({ where: { id: grupoId }, select: { nome: true } });
    if (grupoDestino && isGrupoMasterNome(grupoDestino.nome)) {
      const permsReq = await getPermissoesUsuario(loginReq);
      if (!podeGerenciarAtribuicaoGrupoMaster(permsReq)) {
        res.status(403).json({ error: 'Sem permissão para atribuir usuários ao grupo Master.' });
        return;
      }
    }
  }

  try {
    const senhaHash = await bcrypt.hash(senha, 10);
    const usuario = await prisma.usuario.create({
      data: {
        login: loginUser,
        senhaHash,
        nome,
        email: email || null,
        telefone: telefone || null,
        grupoId: grupoId ?? null,
        fotoUrl: fotoUrl ?? null,
        ativo: ativo ?? true,
        permissoes: serializePermissoes(withCommercialFlag(permissoes ?? [], isCommercialTeam)),
        mustChangePassword: true,
      },
      select: {
        id: true,
        login: true,
        nome: true,
        email: true,
        telefone: true,
        ativo: true,
        permissoes: true,
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
      email: usuario.email ?? null,
      telefone: usuario.telefone ?? null,
      ativo: usuario.ativo,
      permissoes: parsePermissoes(usuario.permissoes).filter((p) => p !== COMMERCIAL_TEAM_FLAG),
      isCommercialTeam: isCommercialTeamFromPerms(parsePermissoes(usuario.permissoes)),
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

  const { senha, nome, email, telefone, grupoId, fotoUrl, ativo, isCommercialTeam } = parsed.data;
  const temAlgumaAlteracao =
    senha !== undefined ||
    nome !== undefined ||
    email !== undefined ||
    telefone !== undefined ||
    grupoId !== undefined ||
    fotoUrl !== undefined ||
    ativo !== undefined ||
    isCommercialTeam !== undefined;
  if (!temAlgumaAlteracao) {
    res.status(400).json({ error: 'Informe ao menos um campo para atualizar.' });
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
  const podeAlterarSenha = has([PERMISSOES.USUARIOS_SENHA_ALTERAR, PERMISSOES.USUARIOS_TOTAL, PERMISSOES.USUARIOS_GERENCIAR]);
  const podeEditar = has([PERMISSOES.USUARIOS_EDITAR, PERMISSOES.USUARIOS_TOTAL, PERMISSOES.USUARIOS_GERENCIAR]);
  const podeInativar = has([PERMISSOES.USUARIOS_INATIVAR, PERMISSOES.USUARIOS_TOTAL, PERMISSOES.USUARIOS_GERENCIAR]);

  if (senha !== undefined && !podeAlterarSenha) {
    res.status(403).json({ error: 'Sem permissão para alterar senha de usuário.' });
    return;
  }
  if (ativo !== undefined && !podeInativar) {
    res.status(403).json({ error: 'Sem permissão para inativar/ativar usuário.' });
    return;
  }
  const teveOutrosCampos =
    nome !== undefined || email !== undefined || telefone !== undefined || grupoId !== undefined || fotoUrl !== undefined || isCommercialTeam !== undefined;
  if (teveOutrosCampos && !podeEditar) {
    res.status(403).json({ error: 'Sem permissão para editar usuário.' });
    return;
  }

  try {
    const existente = await prisma.usuario.findUnique({
      where: { id },
      select: { id: true, grupoId: true, permissoes: true },
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

    if (grupoId !== undefined && login) {
      const masterId = await getGrupoMasterId();
      const grupoAnteriorMaster = existente.grupoId != null && existente.grupoId === masterId;
      const grupoNovoMaster = grupoId != null && grupoId === masterId;

      if (grupoNovoMaster && !grupoAnteriorMaster && !podeGerenciarAtribuicaoGrupoMaster(userPerms)) {
        res.status(403).json({ error: 'Sem permissão para atribuir usuários ao grupo Master.' });
        return;
      }
      if (grupoAnteriorMaster && !grupoNovoMaster && !podeGerenciarRemocaoGrupoMaster(userPerms)) {
        res.status(403).json({ error: 'Sem permissão para remover usuários do grupo Master.' });
        return;
      }
    }

    const dataUpdate: {
      senhaHash?: string;
      nome?: string | null;
      email?: string | null;
      telefone?: string | null;
      grupoId?: number | null;
      fotoUrl?: string | null;
      ativo?: boolean;
      permissoes?: string;
      mustChangePassword?: boolean;
    } = {};

    if (senha !== undefined) {
      dataUpdate.senhaHash = await bcrypt.hash(senha, 10);
      dataUpdate.mustChangePassword = true;
    }
    if (nome !== undefined) {
      dataUpdate.nome = nome ?? null;
    }
    if (email !== undefined) {
      dataUpdate.email = email ?? null;
    }
    if (telefone !== undefined) {
      dataUpdate.telefone = telefone ?? null;
    }
    if (grupoId !== undefined) {
      dataUpdate.grupoId = grupoId ?? null;
    }
    if (fotoUrl !== undefined) {
      dataUpdate.fotoUrl = fotoUrl ?? null;
    }
    if (ativo !== undefined) {
      dataUpdate.ativo = ativo;
    }
    if (isCommercialTeam !== undefined) {
      const currentPerms = existente ? parsePermissoes(existente.permissoes) : [];
      const nextPerms = withCommercialFlag(currentPerms, isCommercialTeam);
      dataUpdate.permissoes = serializePermissoes(nextPerms);
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data: dataUpdate,
      select: {
        id: true,
        login: true,
        nome: true,
        email: true,
        telefone: true,
        ativo: true,
        permissoes: true,
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
      email: usuario.email ?? null,
      telefone: usuario.telefone ?? null,
      ativo: usuario.ativo,
      permissoes: parsePermissoes(usuario.permissoes).filter((p) => p !== COMMERCIAL_TEAM_FLAG),
      isCommercialTeam: isCommercialTeamFromPerms(parsePermissoes(usuario.permissoes)),
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

/**
 * DELETE /api/usuarios/:id - exclusão física do usuário.
 * Regra: bloquear se houver vínculo relacional com registros do sistema (SycroOrder).
 */
export async function excluirUsuario(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'ID inválido.' });
    return;
  }

  try {
    const existente = await prisma.usuario.findUnique({
      where: { id },
      select: { id: true, login: true },
    });
    if (!existente) {
      res.status(404).json({ error: 'Usuário não encontrado.' });
      return;
    }

    // Integrações relacionais reais (FKs) que impedem exclusão física.
    const [totalCriados, totalLeituras, totalNotifs, totalHistorico] = await Promise.all([
      prisma.sycroOrderOrder.count({ where: { created_by: id } }),
      prisma.sycroOrderOrderRead.count({ where: { user_id: id } }),
      prisma.sycroOrderNotification.count({ where: { user_id: id } }),
      prisma.sycroOrderHistory.count({ where: { user_id: id } }),
    ]);

    const totalVinculos = totalCriados + totalLeituras + totalNotifs + totalHistorico;
    if (totalVinculos > 0) {
      res.status(400).json({
        error: 'Não é possível excluir fisicamente este usuário porque ele possui vínculos com registros do sistema.',
        orientacao: 'Use inativação (`ativo=false`) em vez de exclusão.',
      });
      return;
    }

    await prisma.usuario.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error('excluirUsuario', err);
    res.status(503).json({ error: 'Erro ao excluir usuário.' });
  }
}
