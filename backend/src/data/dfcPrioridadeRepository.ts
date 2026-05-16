/**
 * DFC — CRUD da classificação de prioridade (plano de contas + lançamento) no banco local.
 * Persiste em `dfc_prioridade_conta` e `dfc_prioridade_lancamento` (SQLite via Prisma).
 */

import { prisma } from '../config/prisma.js';
import type { DfcPrioridade, DfcTipoRefLancamento } from './dfcPrioridadeConstantes.js';

export interface DfcPrioridadeContaRow {
  idEmpresa: number;
  idContaFinanceiro: number;
  prioridade: DfcPrioridade;
  observacao: string | null;
  usuario: string;
  atualizadoEm: string;
}

export interface DfcPrioridadeLancamentoRow {
  idEmpresa: number;
  tipoRef: DfcTipoRefLancamento;
  idRef: number;
  /** Cache local da conta do lançamento (Nomus contafinanceiro.id), null quando desconhecido. */
  idContaFinanceiro: number | null;
  prioridade: DfcPrioridade;
  observacao: string | null;
  usuario: string;
  atualizadoEm: string;
}

function toIso(d: Date): string {
  return d.toISOString();
}

export async function listarPrioridadesConta(params: {
  idEmpresas?: number[];
  prioridades?: DfcPrioridade[];
}): Promise<DfcPrioridadeContaRow[]> {
  const where: Record<string, unknown> = {};
  if (params.idEmpresas && params.idEmpresas.length > 0) {
    where.idEmpresa = { in: params.idEmpresas };
  }
  if (params.prioridades && params.prioridades.length > 0) {
    where.prioridade = { in: params.prioridades };
  }
  const rows = await prisma.dfcPrioridadeConta.findMany({
    where,
    orderBy: [{ idEmpresa: 'asc' }, { idContaFinanceiro: 'asc' }],
  });
  return rows.map((r) => ({
    idEmpresa: r.idEmpresa,
    idContaFinanceiro: r.idContaFinanceiro,
    prioridade: r.prioridade as DfcPrioridade,
    observacao: r.observacao,
    usuario: r.usuario,
    atualizadoEm: toIso(r.atualizadoEm),
  }));
}

export async function upsertPrioridadeConta(input: {
  idEmpresa: number;
  idContaFinanceiro: number;
  prioridade: DfcPrioridade;
  observacao?: string | null;
  usuario: string;
}): Promise<DfcPrioridadeContaRow> {
  const saved = await prisma.dfcPrioridadeConta.upsert({
    where: {
      idEmpresa_idContaFinanceiro: {
        idEmpresa: input.idEmpresa,
        idContaFinanceiro: input.idContaFinanceiro,
      },
    },
    update: {
      prioridade: input.prioridade,
      observacao: input.observacao ?? null,
      usuario: input.usuario,
    },
    create: {
      idEmpresa: input.idEmpresa,
      idContaFinanceiro: input.idContaFinanceiro,
      prioridade: input.prioridade,
      observacao: input.observacao ?? null,
      usuario: input.usuario,
    },
  });
  return {
    idEmpresa: saved.idEmpresa,
    idContaFinanceiro: saved.idContaFinanceiro,
    prioridade: saved.prioridade as DfcPrioridade,
    observacao: saved.observacao,
    usuario: saved.usuario,
    atualizadoEm: toIso(saved.atualizadoEm),
  };
}

export async function deletePrioridadeConta(idEmpresa: number, idContaFinanceiro: number): Promise<boolean> {
  try {
    await prisma.dfcPrioridadeConta.delete({
      where: {
        idEmpresa_idContaFinanceiro: { idEmpresa, idContaFinanceiro },
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function upsertPrioridadeContaLote(input: {
  itens: Array<{ idEmpresa: number; idContaFinanceiro: number }>;
  prioridade: DfcPrioridade;
  observacao?: string | null;
  usuario: string;
}): Promise<number> {
  const { itens, prioridade, observacao, usuario } = input;
  let n = 0;
  for (const it of itens) {
    await prisma.dfcPrioridadeConta.upsert({
      where: {
        idEmpresa_idContaFinanceiro: {
          idEmpresa: it.idEmpresa,
          idContaFinanceiro: it.idContaFinanceiro,
        },
      },
      update: {
        prioridade,
        observacao: observacao ?? null,
        usuario,
      },
      create: {
        idEmpresa: it.idEmpresa,
        idContaFinanceiro: it.idContaFinanceiro,
        prioridade,
        observacao: observacao ?? null,
        usuario,
      },
    });
    n++;
  }
  return n;
}

export async function deletePrioridadeContaLote(input: {
  itens: Array<{ idEmpresa: number; idContaFinanceiro: number }>;
}): Promise<number> {
  let n = 0;
  for (const it of input.itens) {
    try {
      await prisma.dfcPrioridadeConta.delete({
        where: {
          idEmpresa_idContaFinanceiro: {
            idEmpresa: it.idEmpresa,
            idContaFinanceiro: it.idContaFinanceiro,
          },
        },
      });
      n++;
    } catch {
      // ignora "não existia"
    }
  }
  return n;
}

export async function listarPrioridadesLancamento(params: {
  idEmpresas?: number[];
  tipoRef?: DfcTipoRefLancamento;
  idsRef?: number[];
  prioridades?: DfcPrioridade[];
  idsContaFinanceiro?: number[];
}): Promise<DfcPrioridadeLancamentoRow[]> {
  const where: Record<string, unknown> = {};
  if (params.idEmpresas && params.idEmpresas.length > 0) {
    where.idEmpresa = { in: params.idEmpresas };
  }
  if (params.tipoRef) where.tipoRef = params.tipoRef;
  if (params.idsRef && params.idsRef.length > 0) {
    where.idRef = { in: params.idsRef };
  }
  if (params.prioridades && params.prioridades.length > 0) {
    where.prioridade = { in: params.prioridades };
  }
  if (params.idsContaFinanceiro && params.idsContaFinanceiro.length > 0) {
    where.idContaFinanceiro = { in: params.idsContaFinanceiro };
  }
  const rows = await prisma.dfcPrioridadeLancamento.findMany({
    where,
    orderBy: [{ idEmpresa: 'asc' }, { tipoRef: 'asc' }, { idRef: 'asc' }],
  });
  return rows.map((r) => ({
    idEmpresa: r.idEmpresa,
    tipoRef: r.tipoRef as DfcTipoRefLancamento,
    idRef: r.idRef,
    idContaFinanceiro: r.idContaFinanceiro,
    prioridade: r.prioridade as DfcPrioridade,
    observacao: r.observacao,
    usuario: r.usuario,
    atualizadoEm: toIso(r.atualizadoEm),
  }));
}

export async function upsertPrioridadeLancamento(input: {
  idEmpresa: number;
  tipoRef: DfcTipoRefLancamento;
  idRef: number;
  idContaFinanceiro?: number | null;
  prioridade: DfcPrioridade;
  observacao?: string | null;
  usuario: string;
}): Promise<DfcPrioridadeLancamentoRow> {
  const saved = await prisma.dfcPrioridadeLancamento.upsert({
    where: {
      idEmpresa_tipoRef_idRef: {
        idEmpresa: input.idEmpresa,
        tipoRef: input.tipoRef,
        idRef: input.idRef,
      },
    },
    update: {
      prioridade: input.prioridade,
      observacao: input.observacao ?? null,
      usuario: input.usuario,
      // Atualiza idContaFinanceiro só se vier informado (evita perder o cache existente)
      ...(input.idContaFinanceiro != null ? { idContaFinanceiro: input.idContaFinanceiro } : {}),
    },
    create: {
      idEmpresa: input.idEmpresa,
      tipoRef: input.tipoRef,
      idRef: input.idRef,
      idContaFinanceiro: input.idContaFinanceiro ?? null,
      prioridade: input.prioridade,
      observacao: input.observacao ?? null,
      usuario: input.usuario,
    },
  });
  return {
    idEmpresa: saved.idEmpresa,
    tipoRef: saved.tipoRef as DfcTipoRefLancamento,
    idRef: saved.idRef,
    idContaFinanceiro: saved.idContaFinanceiro,
    prioridade: saved.prioridade as DfcPrioridade,
    observacao: saved.observacao,
    usuario: saved.usuario,
    atualizadoEm: toIso(saved.atualizadoEm),
  };
}

export async function deletePrioridadeLancamento(
  idEmpresa: number,
  tipoRef: DfcTipoRefLancamento,
  idRef: number
): Promise<boolean> {
  try {
    await prisma.dfcPrioridadeLancamento.delete({
      where: { idEmpresa_tipoRef_idRef: { idEmpresa, tipoRef, idRef } },
    });
    return true;
  } catch {
    return false;
  }
}

export async function upsertPrioridadeLancamentoLote(input: {
  itens: Array<{ idEmpresa: number; tipoRef: DfcTipoRefLancamento; idRef: number; idContaFinanceiro?: number | null }>;
  prioridade: DfcPrioridade;
  observacao?: string | null;
  usuario: string;
}): Promise<number> {
  const { itens, prioridade, observacao, usuario } = input;
  let n = 0;
  for (const it of itens) {
    await prisma.dfcPrioridadeLancamento.upsert({
      where: {
        idEmpresa_tipoRef_idRef: {
          idEmpresa: it.idEmpresa,
          tipoRef: it.tipoRef,
          idRef: it.idRef,
        },
      },
      update: {
        prioridade,
        observacao: observacao ?? null,
        usuario,
        ...(it.idContaFinanceiro != null ? { idContaFinanceiro: it.idContaFinanceiro } : {}),
      },
      create: {
        idEmpresa: it.idEmpresa,
        tipoRef: it.tipoRef,
        idRef: it.idRef,
        idContaFinanceiro: it.idContaFinanceiro ?? null,
        prioridade,
        observacao: observacao ?? null,
        usuario,
      },
    });
    n++;
  }
  return n;
}

export async function deletePrioridadeLancamentoLote(input: {
  itens: Array<{ idEmpresa: number; tipoRef: DfcTipoRefLancamento; idRef: number }>;
}): Promise<number> {
  let n = 0;
  for (const it of input.itens) {
    try {
      await prisma.dfcPrioridadeLancamento.delete({
        where: {
          idEmpresa_tipoRef_idRef: {
            idEmpresa: it.idEmpresa,
            tipoRef: it.tipoRef,
            idRef: it.idRef,
          },
        },
      });
      n++;
    } catch {
      // ignora
    }
  }
  return n;
}
