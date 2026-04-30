/**
 * Painel Financeiro-Comercial — leitura Nomus (itens) e agregação por pedido (PD).
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getNomusPool, isNomusEnabled } from '../config/nomusDb.js';
import {
  analisarConformidade,
  diasEsperadosParcelas,
  extrairDiasDaCondicao,
  faixaTicket,
  isCondicaoAVista,
  isRetiradaSoAco,
  labelFaixa,
  mediaPrazoDias,
  type FaixaTicket,
  type StatusConformidade,
} from '../services/painelComercialConformidade.js';
import { getPoliticaComercialPainelPersistida } from './politicaComercialPainelRepository.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = 'sqlPainelComercialNomus.sql';
const SQL_FILE_ITENS = 'sqlPainelComercialItensPorPedido.sql';

function resolveSqlPath(file: string): string {
  const candidates = [join(__dirname, file), join(process.cwd(), 'src', 'data', file), join(process.cwd(), 'dist', 'data', file)];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`Arquivo ${file} não encontrado.`);
}

function getCell(row: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (name in row && row[name] !== undefined) return row[name];
    const target = name.toLowerCase();
    for (const k of Object.keys(row)) {
      if (k.toLowerCase() === target) return row[k];
    }
  }
  return undefined;
}

function num(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface PainelComercialPedidoDto {
  pd: string;
  pdId: number;
  empresaId: number;
  cliente: string;
  emissao: string;
  tabelaPreco: string;
  totalPedido: number;
  somaEntrada: number;
  pctEntrada: number;
  formaPagamento: string;
  condicaoPagamento: string;
  metodoEntrega: string;
  observacoes: string;
  faixaTicket: FaixaTicket;
  labelFaixa: string;
  diasCondicao: number[];
  diasEsperados: string;
  periodicidadeLabel: string;
  entradaOk: boolean;
  prazosOk: boolean;
  prazosIndeterminados: boolean;
  retiradaSoAco: boolean;
  status: StatusConformidade;
  motivos: string[];
}

export interface PainelComercialDashboardDto {
  dataInicio: string;
  dataFim: string;
  totalPedidos: number;
  pedidosAnalisados: number;
  pedidosExcluidosPolitica: number;
  pctConformes: number;
  pctAlertas: number;
  pctNaoConformes: number;
  ticketMedio: number;
  ticketMedioAnalisados: number;
  /** Média dos prazos médios (dias do saldo) em pedidos a prazo com dias inferidos na condição; `null` se não houver nenhum. */
  prazoMedioVendasAPrazoDias: number | null;
  /** Quantidade de pedidos que entraram no cálculo de `prazoMedioVendasAPrazoDias`. */
  pedidosVendasAPrazoComPrazoCadastrado: number;
  porMes: { mes: string; total: number; ok: number; alerta: number; naoConforme: number; excluido: number }[];
  porForma: { forma: string; pedidos: number; pctOk: number }[];
  porCondicao: { condicao: string; pedidos: number }[];
  porFaixa: { faixa: FaixaTicket; label: string; pedidos: number; pctOk: number }[];
  porEntradaFaixa: { faixa: string; pedidos: number }[];
  pedidos: PainelComercialPedidoDto[];
  erro?: string;
}

function mesDeEmissao(emissao: unknown): string {
  const s = str(emissao);
  const m = /^(\d{4}-\d{2})/.exec(s);
  return m ? m[1]! : '—';
}

export async function obterPainelComercialDashboard(
  dataInicio: string,
  dataFim: string,
  empresaId?: 1 | 2
): Promise<PainelComercialDashboardDto> {
  const empty: PainelComercialDashboardDto = {
    dataInicio,
    dataFim,
    totalPedidos: 0,
    pedidosAnalisados: 0,
    pedidosExcluidosPolitica: 0,
    pctConformes: 0,
    pctAlertas: 0,
    pctNaoConformes: 0,
    ticketMedio: 0,
    ticketMedioAnalisados: 0,
    prazoMedioVendasAPrazoDias: null,
    pedidosVendasAPrazoComPrazoCadastrado: 0,
    porMes: [],
    porForma: [],
    porCondicao: [],
    porFaixa: [],
    porEntradaFaixa: [],
    pedidos: [],
  };

  const pool = getNomusPool();
  if (!pool || !isNomusEnabled()) {
    return { ...empty, erro: 'NOMUS_DB_URL não configurado ou pool indisponível.' };
  }

  const politica = await getPoliticaComercialPainelPersistida();

  let sql: string;
  try {
    sql = readFileSync(resolveSqlPath(SQL_FILE), 'utf-8').trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ...empty, erro: msg };
  }

  const safe = /^\d{4}-\d{2}-\d{2}$/;
  if (!safe.test(dataInicio) || !safe.test(dataFim)) {
    return { ...empty, erro: 'Datas inválidas.' };
  }

  const empresaFilter = empresaId ? `AND pd.idEmpresa = ${empresaId}` : '';
  sql = sql
    .replace(/__DATA_INI__/g, dataInicio)
    .replace(/__DATA_FIM__/g, dataFim)
    .replace(/__EMPRESA_FILTER__/g, empresaFilter);

  let rows: Record<string, unknown>[];
  try {
    const [r] = await pool.query(sql);
    rows = (Array.isArray(r) ? r : []) as Record<string, unknown>[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ...empty, erro: msg };
  }

  type Agg = {
    pd: string;
    pdId: number;
    empresaId: number;
    cliente: string;
    emissao: string;
    tabelaPreco: string;
    forma: string;
    condicao: string;
    metodo: string;
    observacoes: string;
    algumaLinhaRetiradaSoAco: boolean;
    sumLinha: number;
    sumEntrada: number;
    valorPedidoTotalRef: number;
  };

  const map = new Map<string, Agg>();

  for (const row of rows) {
    const pd = str(getCell(row, 'PD'));
    if (!pd) continue;
    const empresaIdRow = Math.trunc(num(getCell(row, 'idEmpresa', 'pd.idEmpresa'))) || 0;
    const pdId = Math.trunc(num(getCell(row, 'pd.id', 'id'))) || 0;
    const cliente = str(getCell(row, 'Cliente'));
    const emissaoRaw = getCell(row, 'Emissao', 'emissao');
    const emissao = emissaoRaw instanceof Date ? ymd(emissaoRaw) : str(emissaoRaw).slice(0, 10);
    const forma = str(getCell(row, 'Forma de Pagamento'));
    const condicao = str(getCell(row, 'Condicao de pagamento do pedido de venda'));
    const metodo = str(getCell(row, 'Metodo de Entrega'));
    const observacoes = str(getCell(row, 'Observacoes', 'Observações'));
    const tabelaPreco = str(getCell(row, 'tabelaPreco', 'TabelaPreco', 'nomeTabelaPreco'));
    const linha = num(getCell(row, 'Valor Total com desconto + IPI do item PD'));
    const entrada = num(getCell(row, 'valorAdiantamentoRateio'));
    const vpt = num(getCell(row, 'Valor Pedido Total'));

    let a = map.get(pd);
    if (!a) {
      a = {
        pd,
        pdId,
        empresaId: empresaIdRow,
        cliente,
        emissao,
        tabelaPreco,
        forma,
        condicao,
        metodo,
        observacoes,
        algumaLinhaRetiradaSoAco: false,
        sumLinha: 0,
        sumEntrada: 0,
        valorPedidoTotalRef: vpt,
      };
      map.set(pd, a);
    }
    a.sumLinha += linha;
    a.sumEntrada += entrada;
    if (vpt > 0) a.valorPedidoTotalRef = vpt;
    if (!a.cliente && cliente) a.cliente = cliente;
    if (!a.emissao && emissao) a.emissao = emissao;
    if (!a.forma && forma) a.forma = forma;
    if (!a.tabelaPreco && tabelaPreco) a.tabelaPreco = tabelaPreco;
    if (!a.condicao && condicao) a.condicao = condicao;
    if (!a.metodo && metodo) a.metodo = metodo;
    if (observacoes) a.observacoes = observacoes;
    if (isRetiradaSoAco(observacoes)) a.algumaLinhaRetiradaSoAco = true;
    if (!a.pdId && pdId) a.pdId = pdId;
    if (!a.empresaId && empresaIdRow) a.empresaId = empresaIdRow;
  }

  const pedidos: PainelComercialPedidoDto[] = [];

  for (const a of map.values()) {
    const totalPedido = a.valorPedidoTotalRef > 0 ? a.valorPedidoTotalRef : a.sumLinha;
    const pctEntrada = totalPedido > 0 ? a.sumEntrada / totalPedido : 0;
    const fx = faixaTicket(totalPedido, politica);
    const diasC = extrairDiasDaCondicao(a.condicao, politica);
    const diasEsp = diasEsperadosParcelas(totalPedido, politica);
    const observacoesParaPolitica = a.algumaLinhaRetiradaSoAco ? '1-Retirada na So Aço' : a.observacoes;
    const analise = analisarConformidade(
      {
        totalPedido,
        somaEntrada: a.sumEntrada,
        formaPagamento: a.forma,
        nomeCondicao: a.condicao,
        observacoesTipicas: observacoesParaPolitica,
      },
      politica
    );

    pedidos.push({
      pd: a.pd,
      pdId: a.pdId,
      empresaId: a.empresaId,
      cliente: a.cliente,
      emissao: a.emissao,
      tabelaPreco: a.tabelaPreco,
      totalPedido,
      somaEntrada: a.sumEntrada,
      pctEntrada,
      formaPagamento: a.forma,
      condicaoPagamento: a.condicao,
      metodoEntrega: a.metodo,
      observacoes: a.observacoes,
      faixaTicket: fx,
      labelFaixa: labelFaixa(fx, politica),
      diasCondicao: diasC,
      diasEsperados: diasEsp.join(', '),
      periodicidadeLabel: diasC.length ? diasC.join(' + ') : '—',
      entradaOk: analise.entradaOk,
      prazosOk: analise.prazosOk,
      prazosIndeterminados: analise.prazosIndeterminados,
      retiradaSoAco: analise.retiradaSoAco,
      status: analise.status,
      motivos: analise.motivos,
    });
  }

  const analisaveis = pedidos.filter((p) => p.status !== 'excluido_politica');
  const excluidos = pedidos.length - analisaveis.length;
  const okC = analisaveis.filter((p) => p.status === 'ok').length;
  const alC = analisaveis.filter((p) => p.status === 'alerta').length;
  const ncC = analisaveis.filter((p) => p.status === 'nao_conforme').length;
  const nA = analisaveis.length;
  const somaT = pedidos.reduce((s, p) => s + p.totalPedido, 0);
  const somaTA = analisaveis.reduce((s, p) => s + p.totalPedido, 0);

  const porMesMap = new Map<string, { total: number; ok: number; alerta: number; naoConforme: number; excluido: number }>();
  for (const p of pedidos) {
    const mes = mesDeEmissao(p.emissao);
    const cur = porMesMap.get(mes) ?? { total: 0, ok: 0, alerta: 0, naoConforme: 0, excluido: 0 };
    cur.total++;
    if (p.status === 'excluido_politica') cur.excluido++;
    else if (p.status === 'ok') cur.ok++;
    else if (p.status === 'alerta') cur.alerta++;
    else cur.naoConforme++;
    porMesMap.set(mes, cur);
  }
  const porMes = [...porMesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({ mes, ...v }));

  const formaMap = new Map<string, { pedidos: number; analisados: number; ok: number }>();
  for (const p of pedidos) {
    const k = p.formaPagamento || '(vazio)';
    const cur = formaMap.get(k) ?? { pedidos: 0, analisados: 0, ok: 0 };
    cur.pedidos++;
    if (p.status !== 'excluido_politica') {
      cur.analisados++;
      if (p.status === 'ok') cur.ok++;
    }
    formaMap.set(k, cur);
  }
  const porForma = [...formaMap.entries()].map(([forma, v]) => ({
    forma,
    pedidos: v.pedidos,
    pctOk: v.analisados ? Math.round((v.ok / v.analisados) * 1000) / 10 : 0,
  }));

  const condMap = new Map<string, number>();
  for (const p of pedidos) {
    const k = p.condicaoPagamento || '(vazio)';
    condMap.set(k, (condMap.get(k) ?? 0) + 1);
  }
  const porCondicao = [...condMap.entries()]
    .map(([condicao, c]) => ({ condicao, pedidos: c }))
    .sort((a, b) => b.pedidos - a.pedidos)
    .slice(0, 25);

  const faixaMap = new Map<FaixaTicket, { pedidos: number; analisados: number; ok: number }>();
  for (const p of pedidos) {
    const cur = faixaMap.get(p.faixaTicket) ?? { pedidos: 0, analisados: 0, ok: 0 };
    cur.pedidos++;
    if (p.status !== 'excluido_politica') {
      cur.analisados++;
      if (p.status === 'ok') cur.ok++;
    }
    faixaMap.set(p.faixaTicket, cur);
  }
  const ord: FaixaTicket[] = ['ate_3000', 'entre_3001_10000', 'acima_10000'];
  const porFaixa = ord.map((faixa) => {
    const v = faixaMap.get(faixa) ?? { pedidos: 0, analisados: 0, ok: 0 };
    return {
      faixa,
      label: labelFaixa(faixa, politica),
      pedidos: v.pedidos,
      pctOk: v.analisados ? Math.round((v.ok / v.analisados) * 1000) / 10 : 0,
    };
  });

  const entMap = new Map<string, number>();
  const alvoE = politica.pctEntradaAlvo;
  const tolE = politica.pctEntradaTolerancia;
  const lowE = alvoE - tolE;
  const highE = alvoE + tolE;
  const fmtPctInt = (x: number) => `${Math.round(x * 100)}`;
  for (const p of pedidos) {
    const pct = p.pctEntrada;
    let k = `${fmtPctInt(lowE)}–${fmtPctInt(highE)}%`;
    if (pct < lowE) k = `< ${fmtPctInt(lowE)}%`;
    else if (pct > highE) k = `> ${fmtPctInt(highE)}%`;
    entMap.set(k, (entMap.get(k) ?? 0) + 1);
  }
  const porEntradaFaixa = [...entMap.entries()].map(([faixa, pedidos]) => ({ faixa, pedidos }));

  let somaMediaPrazoAPrazo = 0;
  let nPrazoAPrazo = 0;
  for (const p of pedidos) {
    if (p.status === 'excluido_politica') continue;
    if (isCondicaoAVista(p.condicaoPagamento)) continue;
    if (!p.diasCondicao.length) continue;
    somaMediaPrazoAPrazo += mediaPrazoDias(p.diasCondicao);
    nPrazoAPrazo++;
  }
  const prazoMedioVendasAPrazoDias =
    nPrazoAPrazo > 0 ? Math.round((somaMediaPrazoAPrazo / nPrazoAPrazo) * 10) / 10 : null;

  pedidos.sort((a, b) => b.emissao.localeCompare(a.emissao) || a.pd.localeCompare(b.pd));

  return {
    dataInicio,
    dataFim,
    totalPedidos: pedidos.length,
    pedidosAnalisados: nA,
    pedidosExcluidosPolitica: excluidos,
    pctConformes: nA ? Math.round((okC / nA) * 1000) / 10 : 0,
    pctAlertas: nA ? Math.round((alC / nA) * 1000) / 10 : 0,
    pctNaoConformes: nA ? Math.round((ncC / nA) * 1000) / 10 : 0,
    ticketMedio: pedidos.length ? Math.round((somaT / pedidos.length) * 100) / 100 : 0,
    ticketMedioAnalisados: nA ? Math.round((somaTA / nA) * 100) / 100 : 0,
    prazoMedioVendasAPrazoDias,
    pedidosVendasAPrazoComPrazoCadastrado: nPrazoAPrazo,
    porMes,
    porForma,
    porCondicao,
    porFaixa,
    porEntradaFaixa,
    pedidos,
  };
}

export interface PainelComercialItemPedidoDto {
  idItemPedido: number;
  codigo: string;
  descricao: string;
  qtdePedida: number;
  qtdeAtendida: number;
  valorTotalComIpi: number;
  statusIp: number;
  tabelaPreco: string;
}

/** Linhas de item do pedido (Nomus) para o modal de detalhe do painel comercial. */
export async function obterItensPedidoPainelComercial(pdId: number): Promise<{
  itens: PainelComercialItemPedidoDto[];
  erro?: string;
}> {
  if (!Number.isFinite(pdId) || pdId <= 0) {
    return { itens: [], erro: 'pdId inválido.' };
  }
  const pool = getNomusPool();
  if (!pool || !isNomusEnabled()) {
    return { itens: [], erro: 'NOMUS_DB_URL não configurado ou pool indisponível.' };
  }
  let sql: string;
  try {
    sql = readFileSync(resolveSqlPath(SQL_FILE_ITENS), 'utf-8').trim();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { itens: [], erro: msg };
  }
  try {
    const [r] = await pool.query(sql, [pdId]);
    const rows = (Array.isArray(r) ? r : []) as Record<string, unknown>[];
    const itens = rows.map((row) => ({
      idItemPedido: Math.trunc(num(getCell(row, 'idItemPedido', 'id_item_pedido'))) || 0,
      codigo: str(getCell(row, 'codigo')),
      descricao: str(getCell(row, 'descricao')),
      qtdePedida: num(getCell(row, 'qtdePedida', 'qtdepedida')),
      qtdeAtendida: num(getCell(row, 'qtdeAtendida', 'qtdeatendida')),
      valorTotalComIpi: num(getCell(row, 'valorTotalComIpi', 'valortotalcomipi')),
      statusIp: Math.trunc(num(getCell(row, 'statusIp', 'statusip'))) || 0,
      tabelaPreco: str(getCell(row, 'tabelaPreco', 'TabelaPreco')),
    }));
    return { itens };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { itens: [], erro: msg };
  }
}
