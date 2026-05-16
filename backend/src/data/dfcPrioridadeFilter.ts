/**
 * DFC — Resolve o filtro de prioridade para injetar nas queries do Nomus.
 *
 * Regra:
 *  - Filtro vazio (sem prioridades selecionadas) ⇒ não restringe (passa tudo).
 *  - Filtro com prioridades selecionadas ⇒ só passa linhas cujo "carimbo efetivo"
 *    está nas selecionadas. Carimbo efetivo: override de lançamento (se houver)
 *    ou prioridade do plano de contas. Lançamento vence o plano de contas.
 *
 * Como o banco do Nomus (MySQL) e o local (SQLite/Prisma) são separados,
 * lemos as listas do Prisma e injetamos como tuplas IN no SQL Nomus.
 *
 *   AND (
 *     (af.idEmpresa, af.id) IN aprovadosAf
 *     OR (lf.idEmpresa, lf.id) IN aprovadosLf
 *     OR (
 *       (af.idEmpresa, af.id) NOT IN reprovadosAf
 *       AND (lf.idEmpresa, lf.id) NOT IN reprovadosLf
 *       AND (af.idEmpresa, af.idContaFinanceiro) IN contasAprovadas
 *     )
 *   )
 *
 * Para queries que não envolvem `lf` (P, projeção P/R) só usamos os ramos de af.
 * Para queries que não envolvem `af` (LP, LR sem agendamento) só usamos lf.
 */

import { prisma } from '../config/prisma.js';
import {
  DFC_PRIORIDADES_VALIDAS,
  type DfcPrioridade,
} from './dfcPrioridadeConstantes.js';

export type IdEmpresaId = { idEmpresa: number; id: number };

export interface DfcPrioridadeFilterResolvido {
  /** True quando o filtro está vazio (não restringe). */
  semFiltro: boolean;
  contasAprovadas: IdEmpresaId[];   // (idEmpresa, idContaFinanceiro) cuja prioridade ∈ selecionadas
  refsAfAprovadas: IdEmpresaId[];   // (idEmpresa, af.id) cuja prioridade ∈ selecionadas
  refsAfReprovadas: IdEmpresaId[];  // (idEmpresa, af.id) cuja prioridade ∉ selecionadas
  refsLfAprovadas: IdEmpresaId[];
  refsLfReprovadas: IdEmpresaId[];
}

export async function resolverFiltroPrioridade(params: {
  prioridades: DfcPrioridade[];
  idEmpresas: number[];
}): Promise<DfcPrioridadeFilterResolvido> {
  const sel = [...new Set(params.prioridades.filter((p) => DFC_PRIORIDADES_VALIDAS.includes(p)))];
  if (sel.length === 0) {
    return {
      semFiltro: true,
      contasAprovadas: [],
      refsAfAprovadas: [],
      refsAfReprovadas: [],
      refsLfAprovadas: [],
      refsLfReprovadas: [],
    };
  }

  const empresas = [...new Set(params.idEmpresas.filter((n) => Number.isFinite(n) && n > 0))];
  const naoSel = DFC_PRIORIDADES_VALIDAS.filter((p) => !sel.includes(p));

  const empresasWhere = empresas.length > 0 ? { idEmpresa: { in: empresas } } : {};

  const [contasIn, lancsIn, lancsOut] = await Promise.all([
    prisma.dfcPrioridadeConta.findMany({
      where: { ...empresasWhere, prioridade: { in: sel } },
      select: { idEmpresa: true, idContaFinanceiro: true },
    }),
    prisma.dfcPrioridadeLancamento.findMany({
      where: { ...empresasWhere, prioridade: { in: sel } },
      select: { idEmpresa: true, tipoRef: true, idRef: true },
    }),
    naoSel.length > 0
      ? prisma.dfcPrioridadeLancamento.findMany({
          where: { ...empresasWhere, prioridade: { in: naoSel } },
          select: { idEmpresa: true, tipoRef: true, idRef: true },
        })
      : Promise.resolve([] as Array<{ idEmpresa: number; tipoRef: string; idRef: number }>),
  ]);

  const contasAprovadas: IdEmpresaId[] = contasIn.map((r) => ({
    idEmpresa: r.idEmpresa,
    id: r.idContaFinanceiro,
  }));
  const refsAfAprovadas: IdEmpresaId[] = [];
  const refsLfAprovadas: IdEmpresaId[] = [];
  for (const r of lancsIn) {
    const item = { idEmpresa: r.idEmpresa, id: r.idRef };
    if (r.tipoRef === 'A') refsAfAprovadas.push(item);
    else if (r.tipoRef === 'L') refsLfAprovadas.push(item);
  }
  const refsAfReprovadas: IdEmpresaId[] = [];
  const refsLfReprovadas: IdEmpresaId[] = [];
  for (const r of lancsOut) {
    const item = { idEmpresa: r.idEmpresa, id: r.idRef };
    if (r.tipoRef === 'A') refsAfReprovadas.push(item);
    else if (r.tipoRef === 'L') refsLfReprovadas.push(item);
  }

  return {
    semFiltro: false,
    contasAprovadas,
    refsAfAprovadas,
    refsAfReprovadas,
    refsLfAprovadas,
    refsLfReprovadas,
  };
}

function pairsClause(prefix: string, n: number): string {
  if (n <= 0) return '';
  const tuplas = Array.from({ length: n }, () => '(?, ?)').join(', ');
  return `(${prefix}) IN (${tuplas})`;
}

function flatArgs(rows: IdEmpresaId[]): unknown[] {
  const out: unknown[] = [];
  for (const r of rows) {
    out.push(r.idEmpresa, r.id);
  }
  return out;
}

export interface DfcFilterFragment {
  sql: string;
  args: unknown[];
}

export type DfcQueryKind =
  /** SQL usa `af.id` e `af.idContaFinanceiro` (queries de agendamento puro: P, projeção P/R). */
  | 'af'
  /** SQL usa tanto `af.id`/`af.idContaFinanceiro` quanto `lf.id` (queries de receita R com join lf). */
  | 'af_lf'
  /** SQL usa só `lf.id` e `lf.idContaFinanceiro` (queries de LP, LR sem agendamento). */
  | 'lf';

/**
 * Gera o fragmento SQL " AND ( ... )" + args correspondentes para anexar à query.
 * Retorna sql vazio quando não há filtro ativo.
 */
export function montarFragmentoFiltroPrioridade(
  filtro: DfcPrioridadeFilterResolvido,
  kind: DfcQueryKind
): DfcFilterFragment {
  if (filtro.semFiltro) return { sql: '', args: [] };

  const args: unknown[] = [];
  const aprovOr: string[] = [];
  const reprovAnd: string[] = [];
  const contasCond: string[] = [];

  if (kind === 'af' || kind === 'af_lf') {
    if (filtro.refsAfAprovadas.length > 0) {
      aprovOr.push(pairsClause('af.idEmpresa, af.id', filtro.refsAfAprovadas.length));
      args.push(...flatArgs(filtro.refsAfAprovadas));
    }
  }
  if (kind === 'lf' || kind === 'af_lf') {
    if (filtro.refsLfAprovadas.length > 0) {
      aprovOr.push(pairsClause('lf.idEmpresa, lf.id', filtro.refsLfAprovadas.length));
      args.push(...flatArgs(filtro.refsLfAprovadas));
    }
  }

  if (kind === 'af' || kind === 'af_lf') {
    if (filtro.refsAfReprovadas.length > 0) {
      reprovAnd.push(`NOT ${pairsClause('af.idEmpresa, af.id', filtro.refsAfReprovadas.length)}`);
      args.push(...flatArgs(filtro.refsAfReprovadas));
    }
  }
  if (kind === 'lf' || kind === 'af_lf') {
    if (filtro.refsLfReprovadas.length > 0) {
      reprovAnd.push(`NOT ${pairsClause('lf.idEmpresa, lf.id', filtro.refsLfReprovadas.length)}`);
      args.push(...flatArgs(filtro.refsLfReprovadas));
    }
  }

  if (filtro.contasAprovadas.length > 0) {
    if (kind === 'af' || kind === 'af_lf') {
      contasCond.push(
        pairsClause('af.idEmpresa, af.idContaFinanceiro', filtro.contasAprovadas.length)
      );
      args.push(...flatArgs(filtro.contasAprovadas));
    } else if (kind === 'lf') {
      contasCond.push(
        pairsClause('lf.idEmpresa, lf.idContaFinanceiro', filtro.contasAprovadas.length)
      );
      args.push(...flatArgs(filtro.contasAprovadas));
    }
  }

  // Ramo "conta aprovada e nenhum lançamento override reprovado"
  const contaRamoParts: string[] = [];
  if (contasCond.length > 0) contaRamoParts.push(...contasCond);
  if (reprovAnd.length > 0) contaRamoParts.push(...reprovAnd);
  const contaRamo = contaRamoParts.length > 0 ? `(${contaRamoParts.join(' AND ')})` : null;

  const partes = [...aprovOr];
  if (contaRamo) partes.push(contaRamo);

  if (partes.length === 0) {
    // Filtro selecionado mas não há nenhuma classificação cadastrada que case
    // ⇒ "WHERE 1=0" para retornar vazio (consistente: filtro ativo mas sem dados).
    return { sql: 'AND 1=0', args: [] };
  }

  return { sql: `AND (${partes.join(' OR ')})`, args };
}
