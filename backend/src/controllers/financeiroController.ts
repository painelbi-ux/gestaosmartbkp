import type { Request, Response } from 'express';
import {
  queryDfcAgendamentosEfetivos,
  queryDfcAgendamentosDetalhe,
  type DfcAgendamentoGranularidade,
} from '../data/dfcAgendamentoRepository.js';
import {
  queryDfcLancamentosLpAgrupado,
  queryDfcLancamentosLpDetalhe,
  mergeDfcAgregadoLinhas,
  mergeDfcDetalheOrdenadoMany,
} from '../data/dfcLancamentoLpRepository.js';
import { queryDfcReceitasAgrupado, queryDfcReceitasDetalhe } from '../data/dfcReceitasRepository.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

const MAX_IDS_DETALHE = 400;

function parseDate(s: string): Date | null {
  if (!DATE_RE.test(s)) return null;
  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diffDaysInclusive(a: Date, b: Date): number {
  const ms = 86400000;
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((ub - ua) / ms) + 1;
}

/**
 * GET /api/financeiro/dfc/agendamentos-efetivos
 * Query: dataInicio, dataFim (YYYY-MM-DD), granularidade=dia|mes, idEmpresa (default 1)
 */
export async function getDfcAgendamentosEfetivos(req: Request, res: Response): Promise<void> {
  const dataInicio = String(req.query.dataInicio ?? '').trim();
  const dataFim = String(req.query.dataFim ?? '').trim();
  const granularidadeRaw = String(req.query.granularidade ?? 'mes').trim().toLowerCase();
  const granularidade: DfcAgendamentoGranularidade =
    granularidadeRaw === 'dia' ? 'dia' : 'mes';
  const idEmpresa = Math.max(1, Math.trunc(Number(req.query.idEmpresa ?? 1)) || 1);

  if (!DATE_RE.test(dataInicio) || !DATE_RE.test(dataFim)) {
    res.status(400).json({ error: 'Informe dataInicio e dataFim no formato YYYY-MM-DD.' });
    return;
  }

  const dIni = parseDate(dataInicio);
  const dFim = parseDate(dataFim);
  if (!dIni || !dFim || dFim < dIni) {
    res.status(400).json({ error: 'Período inválido: dataFim deve ser >= dataInicio.' });
    return;
  }

  if (granularidade === 'dia' && diffDaysInclusive(dIni, dFim) > 120) {
    res.status(400).json({
      error: 'No modo diário o intervalo máximo é 120 dias. Use visão mensal ou reduza o período.',
    });
    return;
  }

  const { linhas: linhasAg, erro: erroAg } = await queryDfcAgendamentosEfetivos({
    dataBaixaInicio: dataInicio,
    dataBaixaFim: dataFim,
    granularidade,
    idEmpresa,
  });

  if (erroAg) {
    res.status(503).json({ linhas: [], erro: erroAg });
    return;
  }

  const { linhas: linhasLp, erro: erroLp } = await queryDfcLancamentosLpAgrupado({
    dataLancamentoInicio: dataInicio,
    dataLancamentoFim: dataFim,
    granularidade,
    idEmpresa,
  });

  if (erroLp) {
    console.error('[getDfcAgendamentosEfetivos] lancamentos LP (LP / dataLancamento):', erroLp);
  }

  const { linhas: linhasRec, erro: erroRec } = await queryDfcReceitasAgrupado({
    dataBaixaInicio: dataInicio,
    dataBaixaFim: dataFim,
    granularidade,
    idEmpresa,
  });
  if (erroRec) {
    console.error('[getDfcAgendamentosEfetivos] receitas (R+LR / lf.dataLancamento):', erroRec);
  }

  const linhas = mergeDfcAgregadoLinhas(
    mergeDfcAgregadoLinhas(linhasAg, erroLp ? [] : linhasLp),
    erroRec ? [] : linhasRec
  );

  res.json({ linhas, granularidade, dataInicio, dataFim, idEmpresa });
}

/**
 * GET /api/financeiro/dfc/agendamentos-efetivos-detalhe
 * Query: dataInicio, dataFim, granularidade, idEmpresa, ids (csv de idContaFinanceiro),
 * periodo (opcional: YYYY-MM ou YYYY-MM-DD conforme granularidade; omitir = intervalo inteiro).
 */
export async function getDfcAgendamentosDetalhe(req: Request, res: Response): Promise<void> {
  const dataInicio = String(req.query.dataInicio ?? '').trim();
  const dataFim = String(req.query.dataFim ?? '').trim();
  const granularidadeRaw = String(req.query.granularidade ?? 'mes').trim().toLowerCase();
  const granularidade: DfcAgendamentoGranularidade =
    granularidadeRaw === 'dia' ? 'dia' : 'mes';
  const idEmpresa = Math.max(1, Math.trunc(Number(req.query.idEmpresa ?? 1)) || 1);
  const idsRaw = String(req.query.ids ?? '').trim();
  const periodoOpt = String(req.query.periodo ?? '').trim() || null;

  if (!DATE_RE.test(dataInicio) || !DATE_RE.test(dataFim)) {
    res.status(400).json({ error: 'Informe dataInicio e dataFim no formato YYYY-MM-DD.' });
    return;
  }

  const dIni = parseDate(dataInicio);
  const dFim = parseDate(dataFim);
  if (!dIni || !dFim || dFim < dIni) {
    res.status(400).json({ error: 'Período inválido: dataFim deve ser >= dataInicio.' });
    return;
  }

  if (granularidade === 'dia' && diffDaysInclusive(dIni, dFim) > 120) {
    res.status(400).json({
      error: 'No modo diário o intervalo máximo é 120 dias. Use visão mensal ou reduza o período.',
    });
    return;
  }

  const idsContaFinanceiro = idsRaw
    .split(/[,;\s]+/)
    .map((s) => Math.trunc(Number(s)))
    .filter((n) => n > 0);
  const idsUniq = [...new Set(idsContaFinanceiro)].slice(0, MAX_IDS_DETALHE);

  if (idsUniq.length === 0) {
    res.status(400).json({ error: 'Informe ao menos um id de conta (ids=1,2,3).' });
    return;
  }

  if (periodoOpt) {
    if (granularidade === 'mes' && !MONTH_RE.test(periodoOpt)) {
      res.status(400).json({ error: 'periodo no modo mensal deve ser YYYY-MM.' });
      return;
    }
    if (granularidade === 'dia' && !DATE_RE.test(periodoOpt)) {
      res.status(400).json({ error: 'periodo no modo diário deve ser YYYY-MM-DD.' });
      return;
    }
  }

  const { detalhes: detalhesAg, erro: erroAg } = await queryDfcAgendamentosDetalhe({
    dataBaixaInicio: dataInicio,
    dataBaixaFim: dataFim,
    granularidade,
    idEmpresa,
    idsContaFinanceiro: idsUniq,
    periodoBucket: periodoOpt,
  });

  if (erroAg) {
    res.status(503).json({ detalhes: [], erro: erroAg });
    return;
  }

  const { detalhes: detalhesLp, erro: erroLp } = await queryDfcLancamentosLpDetalhe({
    dataLancamentoInicio: dataInicio,
    dataLancamentoFim: dataFim,
    granularidade,
    idEmpresa,
    idsContaFinanceiro: idsUniq,
    periodoBucket: periodoOpt,
  });

  if (erroLp) {
    console.error('[getDfcAgendamentosDetalhe] lancamentos LP:', erroLp);
  }

  const { detalhes: detalhesRec, erro: erroRec } = await queryDfcReceitasDetalhe({
    dataBaixaInicio: dataInicio,
    dataBaixaFim: dataFim,
    granularidade,
    idEmpresa,
    idsContaFinanceiro: idsUniq,
    periodoBucket: periodoOpt,
  });
  if (erroRec) {
    console.error('[getDfcAgendamentosDetalhe] receitas (R+LR):', erroRec);
  }

  const { detalhes, truncado } = mergeDfcDetalheOrdenadoMany([
    detalhesAg,
    erroLp ? [] : detalhesLp,
    erroRec ? [] : detalhesRec,
  ]);

  res.json({
    detalhes,
    truncado,
    granularidade,
    dataInicio,
    dataFim,
    idEmpresa,
  });
}
