import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchPainelComercialItensPedido,
  formatEmissaoPainelBr,
  type PainelComercialItemPedido,
  type PainelComercialPedido,
  type StatusConformidadePainel,
} from '../../api/painelComercial';
import {
  DIAS_ANTECIPACAO_FATURAMENTO_PADRAO,
  formatDataBr,
  simularAntecipacaoDataFaturamento,
} from '../../utils/painelComercialSimulacaoAntecipacao';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const pctFmt = (n: number) => `${n.toFixed(1)}%`;

function labelStatusPainel(s: StatusConformidadePainel): string {
  switch (s) {
    case 'ok':
      return 'Conforme';
    case 'alerta':
      return 'Alerta';
    case 'nao_conforme':
      return 'Não conforme';
    default:
      return 'Excluído (cartão)';
  }
}

/** Mesmos rótulos do SQL principal do painel (itempedido.status). */
function labelStatusItemNomus(statusIp: number): string {
  switch (statusIp) {
    case 1:
      return 'Aguardando liberação';
    case 2:
      return 'Liberado';
    case 3:
      return 'Atendido parcialmente';
    case 4:
      return 'Atendido totalmente';
    case 5:
      return 'Atendido com corte';
    case 6:
      return 'Cancelado';
    case 7:
      return 'Devolvido parcialmente';
    case 8:
      return 'Devolvido totalmente';
    default:
      return statusIp ? `Código ${statusIp}` : '—';
  }
}

export type PainelComercialPedidoDetalheModalProps = {
  pedido: PainelComercialPedido | null;
  onClose: () => void;
};

type AbaDetalhePedido = 'geral' | 'simulacao';
type CenarioSimulacao = 'i' | 'ii';

export default function PainelComercialPedidoDetalheModal({ pedido, onClose }: PainelComercialPedidoDetalheModalProps) {
  const [aba, setAba] = useState<AbaDetalhePedido>('geral');
  const [cenarioSim, setCenarioSim] = useState<CenarioSimulacao>('i');
  const [mostrarComparativoDesconto, setMostrarComparativoDesconto] = useState(false);
  const [diasAteFaturamentoSim, setDiasAteFaturamentoSim] = useState(DIAS_ANTECIPACAO_FATURAMENTO_PADRAO);
  const [taxaMensalPctSim, setTaxaMensalPctSim] = useState(2);
  const [emissaoBoletoPorParcelaSim, setEmissaoBoletoPorParcelaSim] = useState(5.5);
  const [tacSim, setTacSim] = useState(150);
  const [tedSim, setTedSim] = useState(30);
  const [itens, setItens] = useState<PainelComercialItemPedido[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const loadId = useRef(0);

  useEffect(() => {
    setAba('geral');
    setCenarioSim('i');
    setMostrarComparativoDesconto(false);
  }, [pedido?.pdId, pedido?.pd]);

  const resultadoSimulacoes = useMemo(() => {
    if (!pedido) return { i: null, ii: null } as const;
    const taxa = Math.max(0, taxaMensalPctSim) / 100;
    const nParc = pedido.diasCondicao.filter((d) => Number.isFinite(d) && d > 0).length;
    const emissaoTotal = nParc > 0 ? emissaoBoletoPorParcelaSim * nParc : 0;
    const common = {
      emissaoYmd: pedido.emissao,
      diasCondicao: pedido.diasCondicao,
      totalPedido: pedido.totalPedido,
      somaEntrada: pedido.somaEntrada,
      taxaMensal: taxa,
      diasAteFaturamento: diasAteFaturamentoSim,
      taxaEmissaoBoletosTotal: emissaoTotal,
      valorTac: tacSim,
      valorTed: tedSim,
    };
    return {
      i: simularAntecipacaoDataFaturamento({ ...common, baseDiasParaVp: 'emissao' }),
      ii: simularAntecipacaoDataFaturamento({ ...common, baseDiasParaVp: 'faturamento' }),
    } as const;
  }, [pedido, diasAteFaturamentoSim, taxaMensalPctSim, emissaoBoletoPorParcelaSim, tacSim, tedSim]);

  const resultadoAtual = cenarioSim === 'ii' ? resultadoSimulacoes.ii : resultadoSimulacoes.i;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!pedido?.pdId || pedido.pdId <= 0) {
      setItens([]);
      setErro(null);
      setLoading(false);
      return;
    }
    loadId.current += 1;
    const my = loadId.current;
    const ac = new AbortController();
    setLoading(true);
    setErro(null);
    setItens([]);
    void fetchPainelComercialItensPedido(pedido.pdId, { signal: ac.signal })
      .then((r) => {
        if (my !== loadId.current) return;
        setLoading(false);
        if (r.erro) setErro(r.erro);
        else setItens(r.itens);
      })
      .catch((e: unknown) => {
        if (my !== loadId.current) return;
        if (e instanceof Error && e.name === 'AbortError') return;
        setLoading(false);
        setErro(e instanceof Error ? e.message : 'Erro ao carregar itens.');
      });
    return () => {
      ac.abort();
      loadId.current += 1;
    };
  }, [pedido?.pdId, pedido?.pd]);

  if (typeof document === 'undefined' || !pedido) return null;

  const semId = !pedido.pdId || pedido.pdId <= 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/50 dark:bg-slate-950/60"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-full max-w-[min(96rem,calc(100vw-1.5rem))] max-h-[92vh] overflow-hidden flex flex-col rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="painel-pedido-modal-titulo"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-600 bg-primary-600 px-5 py-4 text-white">
          <div className="min-w-0">
            <h2 id="painel-pedido-modal-titulo" className="text-lg font-bold tracking-tight truncate">
              {pedido.pd}
            </h2>
            <p className="text-sm text-white/90 mt-0.5 truncate" title={pedido.cliente}>
              {pedido.cliente}
            </p>
            <p className="text-xs text-white/80 mt-1">
              Emissão {formatEmissaoPainelBr(pedido.emissao)} · Total {brl.format(pedido.totalPedido)} · Entrada{' '}
              {brl.format(pedido.somaEntrada)} ({pctFmt(pedido.pctEntrada * 100)})
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold bg-white/15 border border-white/25 ${pedido.status === 'ok' ? 'text-emerald-100' : pedido.status === 'alerta' ? 'text-amber-100' : pedido.status === 'nao_conforme' ? 'text-rose-100' : 'text-slate-100'}`}
              >
                {labelStatusPainel(pedido.status)}
              </span>
              {pedido.retiradaSoAco ? (
                <span
                  className="inline-flex rounded border border-amber-200/80 bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-100"
                  title="Retirada Só Aço — conferir desconto"
                >
                  RSA
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-white/90 hover:bg-white/10 hover:text-white transition"
              aria-label="Fechar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Seções do pedido"
          className="flex shrink-0 gap-0 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 px-4"
        >
          <button
            type="button"
            role="tab"
            id="painel-pedido-tab-geral"
            aria-selected={aba === 'geral'}
            tabIndex={aba === 'geral' ? 0 : -1}
            onClick={() => setAba('geral')}
            className={`relative px-4 py-3 text-sm font-semibold transition-colors ${
              aba === 'geral'
                ? 'text-primary-700 dark:text-primary-300'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Geral
            {aba === 'geral' ? (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t bg-primary-600 dark:bg-primary-400" aria-hidden />
            ) : null}
          </button>
          <button
            type="button"
            role="tab"
            id="painel-pedido-tab-simulacao"
            aria-selected={aba === 'simulacao'}
            tabIndex={aba === 'simulacao' ? 0 : -1}
            onClick={() => setAba('simulacao')}
            className={`relative px-4 py-3 text-sm font-semibold transition-colors ${
              aba === 'simulacao'
                ? 'text-primary-700 dark:text-primary-300'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Simulação
            {aba === 'simulacao' ? (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t bg-primary-600 dark:bg-primary-400" aria-hidden />
            ) : null}
          </button>
        </div>

        <div
          className="overflow-y-auto flex-1 p-5 space-y-6 min-h-0"
          role="tabpanel"
          aria-labelledby={aba === 'geral' ? 'painel-pedido-tab-geral' : 'painel-pedido-tab-simulacao'}
        >
          {aba === 'simulacao' ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-4 min-w-0">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200 shrink-0" htmlFor="painel-sim-cenario">
                    Cenário
                  </label>
                  <select
                    id="painel-sim-cenario"
                    value={cenarioSim}
                    onChange={(e) => setCenarioSim(e.target.value as CenarioSimulacao)}
                    className="max-w-xl rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-100"
                  >
                    <option value="i">I — Antecipação (dias emissão → vencimento)</option>
                    <option value="ii">II — Data de faturamento (dias 30, 60… fat. → vencimento)</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarComparativoDesconto((v) => !v)}
                  disabled={!resultadoSimulacoes.i || !resultadoSimulacoes.ii}
                  className="shrink-0 rounded-lg border border-primary-600 bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {mostrarComparativoDesconto ? 'Ocultar comparativo' : 'Comparativo de desconto (I vs II)'}
                </button>
              </div>

              {mostrarComparativoDesconto && resultadoSimulacoes.i && resultadoSimulacoes.ii ? (
                <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900/50 px-4 py-3 text-sm">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                    Comparativo — desconto na operação
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300">
                          <th className="py-2 pr-3 font-semibold">Métrica</th>
                          <th className="py-2 pr-3 font-semibold text-right">Cenário I</th>
                          <th className="py-2 pr-3 font-semibold text-right">Cenário II</th>
                          <th className="py-2 font-semibold text-right">II − I</th>
                        </tr>
                      </thead>
                      <tbody className="text-slate-800 dark:text-slate-100 tabular-nums">
                        <tr className="border-b border-slate-100 dark:border-slate-700/80">
                          <td className="py-2 pr-3">Desconto total (%)</td>
                          <td className="py-2 pr-3 text-right">
                            {resultadoSimulacoes.i.pctDescontoTotalOperacao != null
                              ? pctFmt(resultadoSimulacoes.i.pctDescontoTotalOperacao)
                              : '—'}
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {resultadoSimulacoes.ii.pctDescontoTotalOperacao != null
                              ? pctFmt(resultadoSimulacoes.ii.pctDescontoTotalOperacao)
                              : '—'}
                          </td>
                          <td className="py-2 text-right font-medium">
                            {resultadoSimulacoes.i.pctDescontoTotalOperacao != null &&
                            resultadoSimulacoes.ii.pctDescontoTotalOperacao != null
                              ? pctFmt(
                                  resultadoSimulacoes.ii.pctDescontoTotalOperacao -
                                    resultadoSimulacoes.i.pctDescontoTotalOperacao
                                )
                              : '—'}
                          </td>
                        </tr>
                        <tr className="border-b border-slate-100 dark:border-slate-700/80">
                          <td className="py-2 pr-3">Valor líquido antecipado</td>
                          <td className="py-2 pr-3 text-right">{brl.format(resultadoSimulacoes.i.valorLiquidoAntecipado)}</td>
                          <td className="py-2 pr-3 text-right">{brl.format(resultadoSimulacoes.ii.valorLiquidoAntecipado)}</td>
                          <td className="py-2 text-right font-medium">
                            {brl.format(
                              resultadoSimulacoes.ii.valorLiquidoAntecipado - resultadoSimulacoes.i.valorLiquidoAntecipado
                            )}
                          </td>
                        </tr>
                        <tr>
                          <td className="py-2 pr-3">Soma deságio (só taxa)</td>
                          <td className="py-2 pr-3 text-right">{brl.format(resultadoSimulacoes.i.somaDesagioParcelas)}</td>
                          <td className="py-2 pr-3 text-right">{brl.format(resultadoSimulacoes.ii.somaDesagioParcelas)}</td>
                          <td className="py-2 text-right font-medium">
                            {brl.format(
                              resultadoSimulacoes.ii.somaDesagioParcelas - resultadoSimulacoes.i.somaDesagioParcelas
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    Mesmos vencimentos e custos fixos; muda apenas a base dos dias no VP (emissão vs. data de faturamento).
                  </p>
                </div>
              ) : null}

              <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Dias até data de faturamento
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={720}
                        step={1}
                        value={diasAteFaturamentoSim}
                        onChange={(e) => setDiasAteFaturamentoSim(Number(e.target.value) || 0)}
                        className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Taxa efetiva mensal (%)
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={taxaMensalPctSim}
                        onChange={(e) => setTaxaMensalPctSim(Number(e.target.value) || 0)}
                        className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Emissão boleto (R$ / parcela)
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={emissaoBoletoPorParcelaSim}
                        onChange={(e) => setEmissaoBoletoPorParcelaSim(Number(e.target.value) || 0)}
                        className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">TAC (R$)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={tacSim}
                        onChange={(e) => setTacSim(Number(e.target.value) || 0)}
                        className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-100"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">TED (R$)</span>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={tedSim}
                        onChange={(e) => setTedSim(Number(e.target.value) || 0)}
                        className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-800 dark:text-slate-100"
                      />
                    </label>
                  </div>

                  {!resultadoAtual ? (
                    <p className="text-sm text-amber-800 dark:text-amber-200 rounded-lg border border-amber-200 dark:border-amber-800/60 bg-amber-50/90 dark:bg-amber-950/30 px-4 py-3">
                      Não foi possível simular: verifique a data de emissão do pedido e se a condição de pagamento possui prazos em dias
                      (ex.: 30 + 60 + 90).
                    </p>
                  ) : (
                    <>
                      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 px-4 py-3">
                        <div>
                          <dt className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Emissão</dt>
                          <dd className="font-medium text-slate-900 dark:text-slate-100">{formatDataBr(resultadoAtual.emissao)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Data de faturamento</dt>
                          <dd className="font-medium text-slate-900 dark:text-slate-100">{formatDataBr(resultadoAtual.dataFaturamento)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Valor a prazo</dt>
                          <dd className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{brl.format(resultadoAtual.valorAPrazo)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Parcelas</dt>
                          <dd className="font-medium text-slate-900 dark:text-slate-100">{resultadoAtual.parcelas}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Soma valor presente</dt>
                          <dd className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{brl.format(resultadoAtual.somaValorPresente)}</dd>
                        </div>
                        <div className="sm:col-span-2 lg:col-span-3">
                          <dt className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Custos fixos deduzidos</dt>
                          <dd className="mt-0.5 text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                            Boletos:{' '}
                            <span className="font-medium tabular-nums">
                              {resultadoAtual.parcelas} × {brl.format(emissaoBoletoPorParcelaSim)}
                            </span>{' '}
                            = <span className="font-medium tabular-nums">{brl.format(resultadoAtual.taxaEmissaoBoletosTotal)}</span>
                            {' · '}
                            TAC: <span className="font-medium tabular-nums">{brl.format(resultadoAtual.valorTac)}</span>
                            {' · '}
                            TED: <span className="font-medium tabular-nums">{brl.format(resultadoAtual.valorTed)}</span>
                            {' → '}
                            <span className="font-semibold tabular-nums">Total {brl.format(resultadoAtual.totalCustosFixos)}</span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">Valor líquido antecipado</dt>
                          <dd className="font-semibold tabular-nums text-primary-700 dark:text-primary-300">
                            {brl.format(resultadoAtual.valorLiquidoAntecipado)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-semibold uppercase text-slate-500 dark:text-slate-400">
                            Desconto total na operação
                          </dt>
                          <dd
                            className="font-semibold tabular-nums text-slate-900 dark:text-slate-100"
                            title="(Valor a prazo − Valor líquido antecipado) ÷ Valor a prazo — inclui deságio por taxa e custos fixos."
                          >
                            {resultadoAtual.pctDescontoTotalOperacao != null
                              ? pctFmt(resultadoAtual.pctDescontoTotalOperacao)
                              : '—'}
                          </dd>
                        </div>
                      </dl>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-x-auto">
                        <table className="w-full min-w-[640px] text-xs sm:text-sm text-left">
                          <thead className="bg-primary-600 text-white">
                            <tr>
                              <th className="py-2 px-2 sm:px-3 font-semibold">#</th>
                              <th className="py-2 px-2 sm:px-3 font-semibold">Prazo cond.</th>
                              <th className="py-2 px-2 sm:px-3 font-semibold">Vencimento</th>
                              <th className="py-2 px-2 sm:px-3 font-semibold text-right">Valor parcela</th>
                              <th
                                className="py-2 px-2 sm:px-3 font-semibold text-right"
                                title={
                                  cenarioSim === 'ii'
                                    ? 'Dias corridos da data de faturamento ao vencimento (prazos da condição)'
                                    : 'Dias corridos da emissão ao vencimento'
                                }
                              >
                                {cenarioSim === 'ii' ? 'Dias (fat.→venc.)' : 'Dias (emissão→venc.)'}
                              </th>
                              <th className="py-2 px-2 sm:px-3 font-semibold text-right">Meses (÷30)</th>
                              <th className="py-2 px-2 sm:px-3 font-semibold text-right">VP</th>
                              <th className="py-2 px-2 sm:px-3 font-semibold text-right">Deságio</th>
                            </tr>
                          </thead>
                          <tbody className="text-slate-700 dark:text-slate-200">
                            {resultadoAtual.linhas.map((ln) => (
                              <tr
                                key={ln.indice}
                                className="border-t border-slate-200 dark:border-slate-600 odd:bg-white even:bg-slate-50/80 dark:odd:bg-slate-800/40 dark:even:bg-slate-900/30"
                              >
                                <td className="py-2 px-2 sm:px-3 tabular-nums">{ln.indice}</td>
                                <td className="py-2 px-2 sm:px-3 tabular-nums">{ln.diasCondicao}</td>
                                <td className="py-2 px-2 sm:px-3 whitespace-nowrap">{formatDataBr(ln.vencimento)}</td>
                                <td className="py-2 px-2 sm:px-3 text-right tabular-nums">{brl.format(ln.valorParcela)}</td>
                                <td className="py-2 px-2 sm:px-3 text-right tabular-nums">{ln.diferencaDias}</td>
                                <td className="py-2 px-2 sm:px-3 text-right tabular-nums">{ln.prazoMeses.toFixed(4)}</td>
                                <td className="py-2 px-2 sm:px-3 text-right tabular-nums">{brl.format(ln.valorPresente)}</td>
                                <td className="py-2 px-2 sm:px-3 text-right tabular-nums">{brl.format(ln.desagio)}</td>
                              </tr>
                            ))}
                            <tr className="border-t-2 border-slate-300 dark:border-slate-500 bg-slate-100/90 dark:bg-slate-800/60 font-semibold">
                              <td className="py-2 px-2 sm:px-3" colSpan={3}>
                                Totais
                              </td>
                              <td className="py-2 px-2 sm:px-3 text-right tabular-nums">{brl.format(resultadoAtual.valorAPrazo)}</td>
                              <td className="py-2 px-2 sm:px-3 text-right">—</td>
                              <td className="py-2 px-2 sm:px-3 text-right">—</td>
                              <td className="py-2 px-2 sm:px-3 text-right tabular-nums">{brl.format(resultadoAtual.somaValorPresente)}</td>
                              <td className="py-2 px-2 sm:px-3 text-right tabular-nums">{brl.format(resultadoAtual.somaDesagioParcelas)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
            </div>
          ) : (
            <>
          <section>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">Condições e logística</h3>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Forma de pagamento</dt>
                <dd className="mt-0.5 text-slate-800 dark:text-slate-200">{pedido.formaPagamento || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Condição</dt>
                <dd className="mt-0.5 text-slate-800 dark:text-slate-200">{pedido.condicaoPagamento || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Tabela de preço</dt>
                <dd className="mt-0.5 text-slate-800 dark:text-slate-200">{pedido.tabelaPreco || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Método entrega</dt>
                <dd className="mt-0.5 text-slate-800 dark:text-slate-200">{pedido.metodoEntrega || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Classe rota / observações</dt>
                <dd className="mt-0.5 text-slate-800 dark:text-slate-200">{pedido.observacoes || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Faixa ticket</dt>
                <dd className="mt-0.5 text-slate-800 dark:text-slate-200">{pedido.labelFaixa}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Prazos (cadastro → esperado)</dt>
                <dd className="mt-0.5 text-slate-800 dark:text-slate-200">
                  <span className="font-medium">{pedido.periodicidadeLabel}</span>
                  <span className="block text-xs text-slate-500 mt-0.5">Esperado: {pedido.diasEsperados}</span>
                </dd>
              </div>
            </dl>
          </section>

          {pedido.motivos.length > 0 ? (
            <section>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Análise da política</h3>
              <ul className="list-none space-y-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                {pedido.motivos.map((m, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-slate-400 shrink-0">•</span>
                    <span>{m}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Itens do pedido</h3>
            {semId ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">Id interno do pedido indisponível — não foi possível carregar os itens no ERP.</p>
            ) : loading ? (
              <p className="text-sm text-slate-500 py-6 text-center">Carregando itens…</p>
            ) : erro ? (
              <p className="text-sm text-rose-700 dark:text-rose-300">{erro}</p>
            ) : itens.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum item retornado.</p>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
                <table className="w-full table-fixed text-xs sm:text-sm text-left">
                  <thead className="bg-primary-600 text-white">
                    <tr>
                      <th className="py-2.5 px-2 sm:px-3 font-semibold w-[9%]">Código</th>
                      <th className="py-2.5 px-2 sm:px-3 font-semibold w-[28%]">Descrição</th>
                      <th className="py-2.5 px-2 sm:px-3 font-semibold text-right w-[7%]">Qtd. ped.</th>
                      <th className="py-2.5 px-2 sm:px-3 font-semibold text-right w-[7%]">Qtd. at.</th>
                      <th className="py-2.5 px-2 sm:px-3 font-semibold text-right w-[11%]">Total + IPI</th>
                      <th className="py-2.5 px-2 sm:px-3 font-semibold w-[26%]">Tabela de preço</th>
                      <th className="py-2.5 px-2 sm:px-3 font-semibold w-[12%]">Status item</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700 dark:text-slate-200">
                    {itens.map((it) => (
                      <tr
                        key={it.idItemPedido}
                        className="border-t border-slate-200 dark:border-slate-600 odd:bg-white even:bg-slate-50/80 dark:odd:bg-slate-800/40 dark:even:bg-slate-900/30"
                      >
                        <td className="py-2.5 px-2 sm:px-3 font-medium tabular-nums align-top">{it.codigo || '—'}</td>
                        <td className="py-2.5 px-2 sm:px-3 align-top break-words" title={it.descricao}>
                          {it.descricao || '—'}
                        </td>
                        <td className="py-2.5 px-2 sm:px-3 text-right tabular-nums align-top">{it.qtdePedida}</td>
                        <td className="py-2.5 px-2 sm:px-3 text-right tabular-nums align-top">{it.qtdeAtendida}</td>
                        <td className="py-2.5 px-2 sm:px-3 text-right font-medium tabular-nums align-top whitespace-nowrap">
                          {brl.format(it.valorTotalComIpi)}
                        </td>
                        <td className="py-2.5 px-2 sm:px-3 align-top text-xs leading-snug break-words" title={it.tabelaPreco || undefined}>
                          {it.tabelaPreco || '—'}
                        </td>
                        <td className="py-2.5 px-2 sm:px-3 text-xs align-top">{labelStatusItemNomus(it.statusIp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
