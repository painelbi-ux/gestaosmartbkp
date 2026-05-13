import type { Request, Response } from 'express';
import {
  queryDfcAgendamentosEfetivos,
  queryDfcAgendamentosDetalhe,
  queryDfcAgendamentosProjecao,
  queryDfcAgendamentosProjecaoDetalhe,
  type DfcAgendamentoGranularidade,
  type DfcAgendamentoDetalheRow,
} from '../data/dfcAgendamentoRepository.js';
import { queryDfcKpis } from '../data/dfcKpisRepository.js';
import {
  queryDfcLancamentosLpAgrupado,
  queryDfcLancamentosLpDetalhe,
  mergeDfcAgregadoLinhas,
  mergeDfcDetalheOrdenadoMany,
} from '../data/dfcLancamentoLpRepository.js';
import {
  queryDfcReceitasAgrupado,
  queryDfcReceitasDetalhe,
  queryDfcReceitasProjecao,
  queryDfcReceitasProjecaoDetalhe,
} from '../data/dfcReceitasRepository.js';
import {
  obterPainelComercialDashboard,
  obterItensPedidoPainelComercial,
} from '../data/painelComercialRepository.js';
import {
  getPoliticaComercialPainelPersistida,
  mergePoliticaComercialParcial,
  savePoliticaComercialPainel,
} from '../data/politicaComercialPainelRepository.js';
import { DEFAULT_POLITICA_COMERCIAL } from '../services/painelComercialConformidade.js';

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

/** Data de hoje local no formato YYYY-MM-DD (usa horário do servidor). */
function hojeYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Data de amanhã local no formato YYYY-MM-DD. */
function amanhaYmd(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Retorna a menor das duas datas no formato YYYY-MM-DD. */
function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

/** Retorna a maior das duas datas no formato YYYY-MM-DD. */
function maxDate(a: string, b: string): string {
  return a >= b ? a : b;
}

/** Parseia "idEmpresas=1,2" ou "idEmpresa=1" da query string → array de ids válidos. Padrão: [1, 2]. */
function parseIdEmpresas(query: Request['query']): number[] {
  const raw = String(query.idEmpresas ?? query.idEmpresa ?? '').trim();
  if (!raw) return [1, 2];
  const ids = raw
    .split(/[,;\s]+/)
    .map((s) => Math.trunc(Number(s)))
    .filter((n) => n > 0);
  return ids.length > 0 ? [...new Set(ids)] : [1, 2];
}

/**
 * GET /api/financeiro/dfc/agendamentos-efetivos
 * Query: dataInicio, dataFim (YYYY-MM-DD), granularidade=dia|mes, idEmpresas=1,2 (default 1,2)
 */
export async function getDfcAgendamentosEfetivos(req: Request, res: Response): Promise<void> {
  const dataInicio = String(req.query.dataInicio ?? '').trim();
  const dataFim = String(req.query.dataFim ?? '').trim();
  const granularidadeRaw = String(req.query.granularidade ?? 'mes').trim().toLowerCase();
  const granularidade: DfcAgendamentoGranularidade =
    granularidadeRaw === 'dia' ? 'dia' : 'mes';
  const idEmpresas = parseIdEmpresas(req.query);

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

  // ── Divisão: passado/hoje = efetivos; futuro = projeção ────────────────────
  const hoje = hojeYmd();
  const amanha = amanhaYmd();

  // Parte retrospectiva: dataInicio → min(dataFim, hoje)
  const retroFim = minDate(dataFim, hoje);
  const temRetro = dataInicio <= retroFim;

  // Parte projeção: max(dataInicio, amanhã) → dataFim
  const projInicio = maxDate(dataInicio, amanha);
  const temProj = projInicio <= dataFim;

  // LP (lançamentos diretos) cobre o intervalo completo — não têm status "pendente"
  const { linhas: linhasLp, erro: erroLp } = await queryDfcLancamentosLpAgrupado({
    dataLancamentoInicio: dataInicio,
    dataLancamentoFim: dataFim,
    granularidade,
    idEmpresas,
  });
  if (erroLp) console.error('[getDfcAgendamentosEfetivos] LP:', erroLp);

  let linhasEfetivos: DfcAgendamentoLinha[] = [];
  let linhasRecEfetivas: DfcAgendamentoLinha[] = [];

  if (temRetro) {
    const { linhas, erro } = await queryDfcAgendamentosEfetivos({
      dataBaixaInicio: dataInicio,
      dataBaixaFim: retroFim,
      granularidade,
      idEmpresas,
    });
    if (erro) {
      res.status(503).json({ linhas: [], erro });
      return;
    }
    linhasEfetivos = linhas;

    const { linhas: linhasRec, erro: erroRec } = await queryDfcReceitasAgrupado({
      dataBaixaInicio: dataInicio,
      dataBaixaFim: retroFim,
      granularidade,
      idEmpresas,
    });
    if (erroRec) console.error('[getDfcAgendamentosEfetivos] receitas retrospectivas:', erroRec);
    else linhasRecEfetivas = linhasRec;
  }

  let linhasProjPg: DfcAgendamentoLinha[] = [];
  let linhasProjRec: DfcAgendamentoLinha[] = [];

  if (temProj) {
    const { linhas: lPg, erro: ePg } = await queryDfcAgendamentosProjecao({
      dataVencimentoInicio: projInicio,
      dataVencimentoFim: dataFim,
      granularidade,
      idEmpresas,
    });
    if (ePg) console.error('[getDfcAgendamentosEfetivos] projeção pagamentos:', ePg);
    else linhasProjPg = lPg;

    const { linhas: lRec, erro: eRec } = await queryDfcReceitasProjecao({
      dataVencimentoInicio: projInicio,
      dataVencimentoFim: dataFim,
      granularidade,
      idEmpresas,
    });
    if (eRec) console.error('[getDfcAgendamentosEfetivos] projeção receitas:', eRec);
    else linhasProjRec = lRec;
  }

  const linhas = mergeDfcAgregadoLinhas(
    mergeDfcAgregadoLinhas(
      mergeDfcAgregadoLinhas(linhasEfetivos, erroLp ? [] : linhasLp),
      linhasRecEfetivas
    ),
    mergeDfcAgregadoLinhas(linhasProjPg, linhasProjRec)
  );

  res.json({ linhas, granularidade, dataInicio, dataFim, idEmpresas });
}

/**
 * GET /api/financeiro/dfc/agendamentos-efetivos-detalhe
 * Query: dataInicio, dataFim, granularidade, idEmpresas=1,2, ids (csv de idContaFinanceiro),
 * periodo (opcional: YYYY-MM ou YYYY-MM-DD conforme granularidade; omitir = intervalo inteiro).
 */
export async function getDfcAgendamentosDetalhe(req: Request, res: Response): Promise<void> {
  const dataInicio = String(req.query.dataInicio ?? '').trim();
  const dataFim = String(req.query.dataFim ?? '').trim();
  const granularidadeRaw = String(req.query.granularidade ?? 'mes').trim().toLowerCase();
  const granularidade: DfcAgendamentoGranularidade =
    granularidadeRaw === 'dia' ? 'dia' : 'mes';
  const idEmpresas = parseIdEmpresas(req.query);
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

  // ── Divisão: passado/hoje = efetivos; futuro = projeção ────────────────────
  const hoje = hojeYmd();
  const amanha = amanhaYmd();

  // Determina se o período/bucket é futuro (projeção) ou passado (efetivo)
  // Se periodoBucket informado, usa ele para decidir; se não, consulta ambos e mescla.
  const bucketEhFuturo = periodoOpt != null && periodoOpt > hoje;
  const bucketEhPassado = periodoOpt != null && periodoOpt <= hoje;

  const retroFim = minDate(dataFim, hoje);
  const temRetro = dataInicio <= retroFim && !bucketEhFuturo;

  const projInicio = maxDate(dataInicio, amanha);
  const temProj = projInicio <= dataFim && !bucketEhPassado;

  // LP cobre o intervalo completo (sem divisão)
  const { detalhes: detalhesLp, erro: erroLp } = await queryDfcLancamentosLpDetalhe({
    dataLancamentoInicio: dataInicio,
    dataLancamentoFim: dataFim,
    granularidade,
    idEmpresas,
    idsContaFinanceiro: idsUniq,
    periodoBucket: periodoOpt,
  });
  if (erroLp) console.error('[getDfcAgendamentosDetalhe] LP:', erroLp);

  let detalhesAg: DfcAgendamentoDetalheRow[] = [];
  let detalhesRec: DfcAgendamentoDetalheRow[] = [];
  let detalhesProjPg: DfcAgendamentoDetalheRow[] = [];
  let detalhesProjRec: DfcAgendamentoDetalheRow[] = [];

  if (temRetro) {
    const { detalhes: dAg, erro: eAg } = await queryDfcAgendamentosDetalhe({
      dataBaixaInicio: dataInicio,
      dataBaixaFim: retroFim,
      granularidade,
      idEmpresas,
      idsContaFinanceiro: idsUniq,
      periodoBucket: periodoOpt,
    });
    if (eAg) {
      res.status(503).json({ detalhes: [], erro: eAg });
      return;
    }
    detalhesAg = dAg;

    const { detalhes: dRec, erro: eRec } = await queryDfcReceitasDetalhe({
      dataBaixaInicio: dataInicio,
      dataBaixaFim: retroFim,
      granularidade,
      idEmpresas,
      idsContaFinanceiro: idsUniq,
      periodoBucket: periodoOpt,
    });
    if (eRec) console.error('[getDfcAgendamentosDetalhe] receitas retrospectivas:', eRec);
    else detalhesRec = dRec;
  }

  if (temProj) {
    const { detalhes: dPg, erro: ePg } = await queryDfcAgendamentosProjecaoDetalhe({
      dataVencimentoInicio: projInicio,
      dataVencimentoFim: dataFim,
      granularidade,
      idEmpresas,
      idsContaFinanceiro: idsUniq,
      periodoBucket: periodoOpt,
    });
    if (ePg) console.error('[getDfcAgendamentosDetalhe] projeção pagamentos:', ePg);
    else detalhesProjPg = dPg;

    const { detalhes: dRec, erro: eRec } = await queryDfcReceitasProjecaoDetalhe({
      dataVencimentoInicio: projInicio,
      dataVencimentoFim: dataFim,
      granularidade,
      idEmpresas,
      idsContaFinanceiro: idsUniq,
      periodoBucket: periodoOpt,
    });
    if (eRec) console.error('[getDfcAgendamentosDetalhe] projeção receitas:', eRec);
    else detalhesProjRec = dRec;
  }

  const { detalhes, truncado } = mergeDfcDetalheOrdenadoMany([
    detalhesAg,
    erroLp ? [] : detalhesLp,
    detalhesRec,
    detalhesProjPg,
    detalhesProjRec,
  ]);

  res.json({
    detalhes,
    truncado,
    granularidade,
    dataInicio,
    dataFim,
    idEmpresas,
  });
}

/**
 * GET /api/financeiro/dfc/kpis
 * Query: dataInicio, dataFim (YYYY-MM-DD), idEmpresas=1,2
 * Retorna KPIs financeiros: recebimentos, pagamentos, vencidos, a vencer, saldo bancário.
 */
export async function getDfcKpis(req: Request, res: Response): Promise<void> {
  const dataInicio = String(req.query.dataInicio ?? '').trim();
  const dataFim = String(req.query.dataFim ?? '').trim();
  const idEmpresas = parseIdEmpresas(req.query);

  if (!DATE_RE.test(dataInicio) || !DATE_RE.test(dataFim)) {
    res.status(400).json({ error: 'Informe dataInicio e dataFim no formato YYYY-MM-DD.' });
    return;
  }

  const { kpis, erro } = await queryDfcKpis({ dataInicio, dataFim, idEmpresas });
  if (erro) {
    console.error('[getDfcKpis]', erro);
  }
  res.json({ ...kpis, idEmpresas });
}

/**
 * GET /api/financeiro/painel-comercial?dataInicio&dataFim&empresaId=todos|1|2 (YYYY-MM-DD)
 * Conformidade comercial agregada por PD (Nomus).
 */
export async function getPainelComercial(req: Request, res: Response): Promise<void> {
  const dataInicio = String(req.query.dataInicio ?? '').trim();
  const dataFim = String(req.query.dataFim ?? '').trim();
  const empresaIdRaw = String(req.query.empresaId ?? 'todos').trim().toLowerCase();
  const empresaId =
    empresaIdRaw === '1' || empresaIdRaw === '2'
      ? (Number(empresaIdRaw) as 1 | 2)
      : empresaIdRaw === 'todos' || empresaIdRaw === ''
        ? undefined
        : null;

  if (!DATE_RE.test(dataInicio) || !DATE_RE.test(dataFim)) {
    res.status(400).json({ error: 'Informe dataInicio e dataFim no formato YYYY-MM-DD.' });
    return;
  }
  if (empresaId === null) {
    res.status(400).json({ error: 'empresaId inválido. Use todos, 1 (Só Aço) ou 2 (Só Móveis).' });
    return;
  }

  const dIni = parseDate(dataInicio);
  const dFim = parseDate(dataFim);
  if (!dIni || !dFim || dFim < dIni) {
    res.status(400).json({ error: 'Intervalo de datas inválido.' });
    return;
  }

  const diff = diffDaysInclusive(dIni, dFim);
  if (diff > 400) {
    res.status(400).json({ error: 'Intervalo máximo: 400 dias.' });
    return;
  }

  const body = await obterPainelComercialDashboard(dataInicio, dataFim, empresaId);
  if (body.erro) {
    res.status(503).json({ error: body.erro });
    return;
  }
  res.json(body);
}

/**
 * GET /api/financeiro/painel-comercial/politica
 * Política comercial persistida para o painel (parcelas, entrada, limites de extração de dias).
 */
export async function getPoliticaComercialPainel(req: Request, res: Response): Promise<void> {
  void req;
  const politica = await getPoliticaComercialPainelPersistida();
  res.json({ politica, padraoSistema: DEFAULT_POLITICA_COMERCIAL });
}

/**
 * PUT /api/financeiro/painel-comercial/politica
 * Body: objeto parcial ou completo (mesmo formato de `politica` no GET).
 */
export async function putPoliticaComercialPainel(req: Request, res: Response): Promise<void> {
  const merged = mergePoliticaComercialParcial(req.body);
  try {
    await savePoliticaComercialPainel(merged);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: msg });
    return;
  }
  res.json({ politica: merged });
}

/**
 * GET /api/financeiro/painel-comercial/itens-pedido?pdId= (id numérico do pedido no Nomus)
 */
export async function getPainelComercialItensPedido(req: Request, res: Response): Promise<void> {
  const raw = String(req.query.pdId ?? '').trim();
  const pdId = Number.parseInt(raw, 10);
  if (!Number.isFinite(pdId) || pdId <= 0) {
    res.status(400).json({ error: 'Informe pdId (inteiro positivo).' });
    return;
  }
  const body = await obterItensPedidoPainelComercial(pdId);
  if (body.erro) {
    res.status(503).json({ error: body.erro, itens: [] });
    return;
  }
  res.json(body);
}
