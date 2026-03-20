import type { Request, Response } from 'express';
import { listarPedidos } from '../data/pedidosRepository.js';
import { getProgramacaoSetorialEstoqueSaldo } from '../data/programacaoSetorialRepository.js';
import { prisma } from '../config/prisma.js';

type PlanningItem = {
  idChave: string;
  id: string;
  Observacoes: string;
  PD: string;
  Previsao: string;
  Cliente: string;
  Cod: string;
  'Descricao do produto': string;
  'Setor de Producao': string;
  'Qtde Pendente Real': number;
};

function formatDateDDMMYYYY(value: unknown): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value as string);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

function toPlanningItem(row: any): PlanningItem | null {
  const qtdePend = Number(row?.['Qtde Pendente Real'] ?? 0) || 0;
  if (qtdePend <= 0) return null;

  const previsaoDate = row?.previsao_entrega_atualizada ?? row?.previsao_entrega;
  const previsao = formatDateDDMMYYYY(previsaoDate);

  return {
    idChave: String(row?.id_pedido ?? row?.idChave ?? ''),
    id: String(row?.id_pedido ?? row?.id ?? ''),
    Observacoes: String(row?.Observacoes ?? row?.['Observacoes '] ?? row?.['Observações'] ?? ''),
    PD: String(row?.PD ?? ''),
    Previsao: previsao,
    Cliente: String(row?.Cliente ?? ''),
    Cod: String(row?.Cod ?? ''),
    'Descricao do produto': String(row?.['Descricao do produto'] ?? row?.produto ?? ''),
    'Setor de Producao': String(row?.['Setor de Producao'] ?? ''),
    'Qtde Pendente Real': qtdePend,
  };
}

export async function getProgramacaoSetorialPlanning(req: Request, res: Response) {
  const observacoes = typeof req.query.observacoes === 'string' ? req.query.observacoes.trim() : '';
  const result = await listarPedidos(observacoes ? { observacoes } : {});
  if (result.erroConexao) {
    return res.status(503).json({ error: 'NOMUS indisponível', detalhe: result.erroConexao, data: [] });
  }

  const data: PlanningItem[] = [];
  for (const row of result.data) {
    const item = toPlanningItem(row);
    if (!item) continue;
    data.push(item);
  }

  return res.json({ data });
}

export async function getProgramacaoSetorialEstoque(_req: Request, res: Response) {
  const result = await getProgramacaoSetorialEstoqueSaldo();
  if (result.erro) {
    return res.status(503).json({ error: 'NOMUS indisponível', detalhe: result.erro, data: [] });
  }
  return res.json({ data: result.data });
}

const STATUS_VALIDOS = new Set(['PENDENTE', 'EM_EXECUCAO', 'CONCLUIDA', 'CANCELADA']);

export async function listarProgramacoesSetoriais(_req: Request, res: Response) {
  try {
    const data = await prisma.programacaoSetorialRegistro.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ data });
  } catch (err) {
    console.error('listarProgramacoesSetoriais', err);
    return res.status(503).json({ error: 'Erro ao listar programações setoriais.' });
  }
}

export async function criarProgramacaoSetorial(req: Request, res: Response) {
  const nome = String((req.body as { nome?: unknown })?.nome ?? '').trim();
  const observacaoRaw = (req.body as { observacao?: unknown })?.observacao;
  const observacao = observacaoRaw == null ? null : String(observacaoRaw).trim() || null;
  if (!nome) {
    return res.status(400).json({ error: 'Informe o nome da programação.' });
  }
  try {
    const criadoPor = req.user?.login ?? null;
    const data = await prisma.programacaoSetorialRegistro.create({
      data: { nome, observacao, criadoPor },
    });
    return res.status(201).json(data);
  } catch (err) {
    console.error('criarProgramacaoSetorial', err);
    return res.status(503).json({ error: 'Erro ao criar programação setorial.' });
  }
}

export async function atualizarProgramacaoSetorial(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'ID inválido.' });

  const body = req.body as { nome?: unknown; observacao?: unknown; status?: unknown };
  const dataUpdate: { nome?: string; observacao?: string | null; status?: string } = {};

  if (body.nome !== undefined) {
    const nome = String(body.nome ?? '').trim();
    if (!nome) return res.status(400).json({ error: 'Nome inválido.' });
    dataUpdate.nome = nome;
  }
  if (body.observacao !== undefined) {
    const observacao = body.observacao == null ? null : String(body.observacao).trim() || null;
    dataUpdate.observacao = observacao;
  }
  if (body.status !== undefined) {
    const status = String(body.status ?? '').trim().toUpperCase();
    if (!STATUS_VALIDOS.has(status)) return res.status(400).json({ error: 'Status inválido.' });
    dataUpdate.status = status;
  }
  if (Object.keys(dataUpdate).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo informado para atualização.' });
  }

  try {
    const data = await prisma.programacaoSetorialRegistro.update({
      where: { id },
      data: dataUpdate,
    });
    return res.json(data);
  } catch (err) {
    console.error('atualizarProgramacaoSetorial', err);
    return res.status(503).json({ error: 'Erro ao atualizar programação setorial.' });
  }
}

