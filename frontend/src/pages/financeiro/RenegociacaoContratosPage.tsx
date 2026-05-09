import { useState, useMemo } from 'react';

type Sistema = 'price' | 'sac';
type TipoCarencia = 'juros' | 'total';
type Aba = 'simular' | 'analisar';

/* ─────────────────────────────────────────────────────────────── */
/* INTERFACES                                                       */
/* ─────────────────────────────────────────────────────────────── */
interface ParcelaDetalhe {
  mes: number;
  parcela: number;
  juros: number;
  amortizacao: number;
  saldo: number;
}

interface ResultadoSimulacao {
  parcelasAtual: ParcelaDetalhe[];
  parcelasRenegociado: ParcelaDetalhe[];
  parcelaCarencia: number;
  mesesCarencia: number;
  saldoRenegociado: number;
  totalPagoAtual: number;
  totalPagoRenegociado: number;
  totalJurosAtual: number;
  totalJurosRenegociado: number;
  pmtAtual: number;
  pmtNova: number;
}

interface ResultadoAnalise {
  taxaMensal: number;
  taxaAnual: number;
  cetMensal: number | null;
  cetAnual: number | null;
  totalParcelas: number;
  totalJuros: number;
  totalEncargos: number;
  totalGeral: number;
  parcelas: ParcelaDetalhe[];
}

/* ─────────────────────────────────────────────────────────────── */
/* FUNÇÕES FINANCEIRAS                                              */
/* ─────────────────────────────────────────────────────────────── */
function calcPMT(saldo: number, taxa: number, prazo: number): number {
  const r = taxa / 100;
  if (r === 0 || prazo === 0) return prazo > 0 ? saldo / prazo : 0;
  return (saldo * r * Math.pow(1 + r, prazo)) / (Math.pow(1 + r, prazo) - 1);
}

function gerarPrice(saldo: number, taxa: number, prazo: number): ParcelaDetalhe[] {
  if (prazo <= 0 || saldo <= 0) return [];
  const r = taxa / 100;
  const pmt = calcPMT(saldo, taxa, prazo);
  const rows: ParcelaDetalhe[] = [];
  let s = saldo;
  for (let i = 0; i < prazo; i++) {
    const juros = s * r;
    const amort = pmt - juros;
    s = Math.max(0, s - amort);
    rows.push({ mes: i + 1, parcela: pmt, juros, amortizacao: amort, saldo: s });
  }
  return rows;
}

function gerarSAC(saldo: number, taxa: number, prazo: number): ParcelaDetalhe[] {
  if (prazo <= 0 || saldo <= 0) return [];
  const r = taxa / 100;
  const amortFix = saldo / prazo;
  const rows: ParcelaDetalhe[] = [];
  let s = saldo;
  for (let i = 0; i < prazo; i++) {
    const juros = s * r;
    const parcela = amortFix + juros;
    s = Math.max(0, s - amortFix);
    rows.push({ mes: i + 1, parcela, juros, amortizacao: amortFix, saldo: s });
  }
  return rows;
}

function gerarTabela(saldo: number, taxa: number, prazo: number, sistema: Sistema): ParcelaDetalhe[] {
  return sistema === 'price' ? gerarPrice(saldo, taxa, prazo) : gerarSAC(saldo, taxa, prazo);
}

/** Newton-Raphson para encontrar a taxa mensal dado PV, PMT, N (Price) */
function calcTaxaPrice(pv: number, pmt: number, n: number): number {
  if (pmt <= 0 || n <= 0 || pv <= 0) return 0;
  if (pmt * n <= pv) return 0; // PMT insuficiente para cobrir o principal
  // Caso sem juros
  if (Math.abs(pmt * n - pv) < 0.01) return 0;

  let r = 0.01; // chute inicial: 1% a.m.
  for (let iter = 0; iter < 2000; iter++) {
    const pow = Math.pow(1 + r, n);
    const f = pmt * (1 - 1 / pow) / r - pv;
    const df = pmt * (n / (pow * (1 + r)) * r - (1 - 1 / pow)) / (r * r);
    if (Math.abs(df) < 1e-15) break;
    const r1 = r - f / df;
    if (r1 <= 0) r = r / 2;
    else {
      if (Math.abs(r1 - r) < 1e-12) return r1;
      r = r1;
    }
  }
  return r;
}

/** Taxa mensal SAC: i = (PMT_1 - PV/n) / PV */
function calcTaxaSAC(pv: number, pmt1: number, n: number): number {
  if (n <= 0 || pv <= 0) return 0;
  return (pmt1 - pv / n) / pv;
}

/* ─────────────────────────────────────────────────────────────── */
/* FORMATADORES                                                     */
/* ─────────────────────────────────────────────────────────────── */
const fmt = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtBRL = (v: number) => `R$ ${fmt(v)}`;
const fmtPct = (v: number, dec = 4) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';
const parseBR = (s: string) => parseFloat(s.replace(',', '.')) || 0;

/* ─────────────────────────────────────────────────────────────── */
/* COMPONENTE PRINCIPAL                                             */
/* ─────────────────────────────────────────────────────────────── */
export default function RenegociacaoContratosPage() {
  const [aba, setAba] = useState<Aba>('simular');

  return (
    <div className="space-y-5 w-full min-w-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 shrink-0">
          <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            Simulação de Renegociação de Contratos Bancários
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Simule cenários de renegociação ou calcule a taxa real de uma oferta bancária
          </p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 w-fit">
        <TabBtn active={aba === 'simular'} onClick={() => setAba('simular')}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          Simular Renegociação
        </TabBtn>
        <TabBtn active={aba === 'analisar'} onClick={() => setAba('analisar')}>
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Analisar Oferta Bancária
        </TabBtn>
      </div>

      {aba === 'simular' ? <PainelSimular /> : <PainelAnalisar />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* ABA 1: SIMULAR RENEGOCIAÇÃO                                     */
/* ─────────────────────────────────────────────────────────────── */
function PainelSimular() {
  const [saldoDevedor, setSaldoDevedor] = useState('100000');
  const [taxaMensal, setTaxaMensal] = useState('1,5');
  const [prazoRestante, setPrazoRestante] = useState('48');
  const [sistema, setSistema] = useState<Sistema>('price');
  const [novaTaxa, setNovaTaxa] = useState('1,2');
  const [novoPrazo, setNovoPrazo] = useState('60');
  const [carencia, setCarencia] = useState('0');
  const [tipoCarencia, setTipoCarencia] = useState<TipoCarencia>('juros');
  const [multa, setMulta] = useState('0');
  const [mostrarTabela, setMostrarTabela] = useState(false);
  const [abaTabela, setAbaTabela] = useState<'atual' | 'renegociado'>('atual');

  const resultado = useMemo<ResultadoSimulacao | null>(() => {
    const sd = parseBR(saldoDevedor);
    const tm = parseBR(taxaMensal);
    const pr = parseInt(prazoRestante) || 0;
    const nt = parseBR(novaTaxa);
    const np = parseInt(novoPrazo) || 0;
    const car = Math.max(0, parseInt(carencia) || 0);
    const mt = parseBR(multa);

    if (sd <= 0 || tm <= 0 || pr <= 0 || nt <= 0 || np <= 0) return null;

    const parcelasAtual = gerarTabela(sd, tm, pr, sistema);
    const pmtAtual = parcelasAtual[0]?.parcela ?? 0;
    const saldoRenegociado = sd * (1 + mt / 100);
    const r = nt / 100;
    const carRows: ParcelaDetalhe[] = [];
    let parcelaCarencia = 0;

    if (car > 0) {
      for (let i = 0; i < car; i++) {
        if (tipoCarencia === 'juros') {
          parcelaCarencia = saldoRenegociado * r;
          carRows.push({ mes: i + 1, parcela: parcelaCarencia, juros: parcelaCarencia, amortizacao: 0, saldo: saldoRenegociado });
        } else {
          carRows.push({ mes: i + 1, parcela: 0, juros: 0, amortizacao: 0, saldo: saldoRenegociado * Math.pow(1 + r, i + 1) });
        }
      }
    }

    const saldoAposCarencia = car > 0 && tipoCarencia === 'total'
      ? saldoRenegociado * Math.pow(1 + r, car)
      : saldoRenegociado;

    const prazoAmort = np - car;
    if (prazoAmort <= 0) return null;

    const parcelasAmort = gerarTabela(saldoAposCarencia, nt, prazoAmort, sistema);
    const parcelasRenegociado: ParcelaDetalhe[] = [
      ...carRows,
      ...parcelasAmort.map((p) => ({ ...p, mes: p.mes + car })),
    ];
    const pmtNova = parcelasAmort[0]?.parcela ?? 0;

    return {
      parcelasAtual,
      parcelasRenegociado,
      parcelaCarencia: car > 0 && tipoCarencia === 'juros' ? saldoRenegociado * r : 0,
      mesesCarencia: car,
      saldoRenegociado,
      totalPagoAtual: parcelasAtual.reduce((s, p) => s + p.parcela, 0),
      totalPagoRenegociado: parcelasRenegociado.reduce((s, p) => s + p.parcela, 0),
      totalJurosAtual: parcelasAtual.reduce((s, p) => s + p.juros, 0),
      totalJurosRenegociado: parcelasRenegociado.reduce((s, p) => s + p.juros, 0),
      pmtAtual,
      pmtNova,
    };
  }, [saldoDevedor, taxaMensal, prazoRestante, sistema, novaTaxa, novoPrazo, carencia, tipoCarencia, multa]);

  const economiaTotal = resultado ? resultado.totalPagoAtual - resultado.totalPagoRenegociado : 0;
  const economiaParcela = resultado ? resultado.pmtAtual - resultado.pmtNova : 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Inputs */}
      <div className="space-y-4">
        <CardSection title="Contrato Atual" dot="slate">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Saldo Devedor Atual (R$)">
                <Input value={saldoDevedor} onChange={setSaldoDevedor} placeholder="100000" />
              </Field>
            </div>
            <Field label="Taxa Mensal Atual (%)">
              <Input value={taxaMensal} onChange={setTaxaMensal} placeholder="1,5" />
            </Field>
            <Field label="Prazo Restante (meses)">
              <InputNum value={prazoRestante} onChange={setPrazoRestante} min={1} />
            </Field>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Sistema de Amortização</label>
              <SistemaToggle value={sistema} onChange={setSistema} />
            </div>
          </div>
        </CardSection>

        <CardSection title="Condições de Renegociação" dot="emerald">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nova Taxa Mensal (%)">
              <Input value={novaTaxa} onChange={setNovaTaxa} placeholder="1,2" />
            </Field>
            <Field label="Novo Prazo Total (meses)">
              <InputNum value={novoPrazo} onChange={setNovoPrazo} min={1} />
            </Field>
            <Field label="Carência (meses)">
              <InputNum value={carencia} onChange={setCarencia} min={0} />
            </Field>
            <Field label="Multa / Taxa de Renegociação (%)">
              <Input value={multa} onChange={setMulta} placeholder="0" />
            </Field>
            {parseInt(carencia) > 0 && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Tipo de Carência</label>
                <div className="flex gap-3">
                  {(['juros', 'total'] as TipoCarencia[]).map((t) => (
                    <button key={t} type="button" onClick={() => setTipoCarencia(t)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${tipoCarencia === t ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-emerald-400'}`}>
                      {t === 'juros' ? 'Paga juros' : 'Carência total'}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  {tipoCarencia === 'juros' ? 'Durante a carência, paga apenas os juros mensais.' : 'Durante a carência, os juros capitalizam no saldo.'}
                </p>
              </div>
            )}
          </div>
        </CardSection>
      </div>

      {/* Resultados */}
      <div className="space-y-4">
        {!resultado ? (
          <EmptyState label="Preencha os dados à esquerda para ver a simulação" />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="Parcela Atual" value={fmtBRL(resultado.pmtAtual)} color="slate" />
              <KpiCard
                label={resultado.mesesCarencia > 0 ? `Nova Parcela (a partir mês ${resultado.mesesCarencia + 1})` : 'Nova Parcela'}
                value={fmtBRL(resultado.pmtNova)}
                sub={resultado.mesesCarencia > 0 ? `Carência: ${fmtBRL(resultado.parcelaCarencia)}/mês` : undefined}
                color={resultado.pmtNova <= resultado.pmtAtual ? 'green' : 'red'}
              />
              <KpiCard label="Total a Pagar (atual)" value={fmtBRL(resultado.totalPagoAtual)} sub={`Juros: ${fmtBRL(resultado.totalJurosAtual)}`} color="slate" />
              <KpiCard label="Total a Pagar (renegociado)" value={fmtBRL(resultado.totalPagoRenegociado)} sub={`Juros: ${fmtBRL(resultado.totalJurosRenegociado)}`} color={resultado.totalPagoRenegociado <= resultado.totalPagoAtual ? 'green' : 'red'} />
            </div>

            <div className={`rounded-xl border p-4 ${economiaTotal >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wide ${economiaTotal >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                    {economiaTotal >= 0 ? 'Economia total com a renegociação' : 'Custo adicional da renegociação'}
                  </p>
                  <p className={`text-2xl font-bold mt-1 ${economiaTotal >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                    {fmtBRL(Math.abs(economiaTotal))}
                  </p>
                </div>
                <div className={`text-xs px-3 py-1 rounded-full font-medium shrink-0 ${economiaParcela >= 0 ? 'bg-emerald-100 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300'}`}>
                  {economiaParcela >= 0 ? '-' : '+'}{fmtBRL(Math.abs(economiaParcela))}/mês
                </div>
              </div>
              {resultado.saldoRenegociado !== parseBR(saldoDevedor) && (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Saldo renegociado (com multa): {fmtBRL(resultado.saldoRenegociado)}
                </p>
              )}
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-700/50">
                    {['Indicador', 'Atual', 'Renegociado'].map((h) => (
                      <th key={h} className={`px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide ${h === 'Indicador' ? 'text-left' : 'text-right'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  <ComparativoRow label="Taxa mensal" a={`${taxaMensal}%`} b={`${novaTaxa}%`} />
                  <ComparativoRow label="Prazo (meses)" a={prazoRestante} b={novoPrazo} />
                  <ComparativoRow label="1ª Parcela" a={fmtBRL(resultado.pmtAtual)} b={fmtBRL(resultado.pmtNova)} bBetter={resultado.pmtNova <= resultado.pmtAtual} />
                  <ComparativoRow label="Total de juros" a={fmtBRL(resultado.totalJurosAtual)} b={fmtBRL(resultado.totalJurosRenegociado)} bBetter={resultado.totalJurosRenegociado <= resultado.totalJurosAtual} />
                  <ComparativoRow label="Total a pagar" a={fmtBRL(resultado.totalPagoAtual)} b={fmtBRL(resultado.totalPagoRenegociado)} bBetter={resultado.totalPagoRenegociado <= resultado.totalPagoAtual} />
                </tbody>
              </table>
            </div>

            <TabelaAmortizacao
              mostrar={mostrarTabela}
              onToggle={() => setMostrarTabela((v) => !v)}
              aba={abaTabela}
              onAba={setAbaTabela}
              parcelasAtual={resultado.parcelasAtual}
              parcelasRenegociado={resultado.parcelasRenegociado}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* ABA 2: ANALISAR OFERTA BANCÁRIA                                 */
/* ─────────────────────────────────────────────────────────────── */
function PainelAnalisar() {
  const [valorFinanciado, setValorFinanciado] = useState('100000');
  const [numParcelas, setNumParcelas] = useState('48');
  const [valorParcela, setValorParcela] = useState('2800');
  const [sistema, setSistema] = useState<Sistema>('price');

  // Custos adicionais
  const [mostrarCustos, setMostrarCustos] = useState(false);
  const [iof, setIof] = useState('0');
  const [tac, setTac] = useState('0');
  const [seguroMensal, setSeguroMensal] = useState('0');
  const [outrosEncargos, setOutrosEncargos] = useState('0');

  const [mostrarTabela, setMostrarTabela] = useState(false);

  const resultado = useMemo<ResultadoAnalise | null>(() => {
    const pv = parseBR(valorFinanciado);
    const n = parseInt(numParcelas) || 0;
    const pmt = parseBR(valorParcela);
    const vIof = parseBR(iof);
    const vTac = parseBR(tac);
    const vSeg = parseBR(seguroMensal);
    const vOut = parseBR(outrosEncargos);

    if (pv <= 0 || n <= 0 || pmt <= 0) return null;
    if (pmt * n < pv) return null; // impossível — parcela insuficiente

    let taxaMensal: number;
    if (sistema === 'price') {
      taxaMensal = calcTaxaPrice(pv, pmt, n);
    } else {
      taxaMensal = calcTaxaSAC(pv, pmt, n);
    }

    if (taxaMensal < 0 || !isFinite(taxaMensal)) return null;

    const taxaAnual = (Math.pow(1 + taxaMensal, 12) - 1) * 100;
    const parcelas = gerarTabela(pv, taxaMensal * 100, n, sistema);

    const totalParcelas = parcelas.reduce((s, p) => s + p.parcela, 0);
    const totalJuros = parcelas.reduce((s, p) => s + p.juros, 0);
    const totalEncargos = vIof + vTac + vSeg * n + vOut;
    const totalGeral = totalParcelas + totalEncargos;

    let cetMensal: number | null = null;
    let cetAnual: number | null = null;
    if (totalEncargos > 0) {
      // CET: encontrar taxa onde PV - custos_upfront = PV_ajustado
      // Custos upfront (pagos no início): IOF + TAC
      // Custos mensais: seguro/mês ao longo das parcelas
      // Parcelas permanecem as mesmas, mas o PV líquido = PV - IOF - TAC
      const pvLiquido = pv - vIof - vTac;
      if (pvLiquido > 0) {
        if (sistema === 'price') {
          // Para CET com seguro: PMT efetivo por mês = pmt + seguro
          const pmtCet = pmt + vSeg;
          const cetR = calcTaxaPrice(pvLiquido, pmtCet, n);
          if (cetR >= 0 && isFinite(cetR)) {
            cetMensal = cetR * 100;
            cetAnual = (Math.pow(1 + cetR, 12) - 1) * 100;
          }
        } else {
          // SAC: primeira parcela + seguro
          const pmt1Cet = pmt + vSeg;
          const cetR = calcTaxaSAC(pvLiquido, pmt1Cet, n);
          if (cetR >= 0 && isFinite(cetR)) {
            cetMensal = cetR * 100;
            cetAnual = (Math.pow(1 + cetR, 12) - 1) * 100;
          }
        }
      }
    }

    return { taxaMensal: taxaMensal * 100, taxaAnual, cetMensal, cetAnual, totalParcelas, totalJuros, totalEncargos, totalGeral, parcelas };
  }, [valorFinanciado, numParcelas, valorParcela, sistema, iof, tac, seguroMensal, outrosEncargos]);

  const custosMensais = parseBR(seguroMensal);
  const custosUpfront = parseBR(iof) + parseBR(tac);
  const temCustos = custosMensais > 0 || custosUpfront > 0 || parseBR(outrosEncargos) > 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {/* Inputs */}
      <div className="space-y-4">
        <CardSection title="Dados da Oferta" dot="blue">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Valor Financiado / Saldo Devedor (R$)">
                <Input value={valorFinanciado} onChange={setValorFinanciado} placeholder="100000" />
              </Field>
            </div>
            <Field label="Quantidade de Parcelas">
              <InputNum value={numParcelas} onChange={setNumParcelas} min={1} />
            </Field>
            <Field label={sistema === 'sac' ? 'Valor da 1ª Parcela (R$)' : 'Valor da Parcela (R$)'}>
              <Input value={valorParcela} onChange={setValorParcela} placeholder="2800" />
            </Field>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Sistema de Amortização</label>
              <SistemaToggle value={sistema} onChange={setSistema} />
            </div>
          </div>
        </CardSection>

        {/* Custos adicionais */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setMostrarCustos((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
              <span className={`inline-block w-2 h-2 rounded-full ${temCustos ? 'bg-amber-400' : 'bg-slate-300 dark:bg-slate-600'}`}></span>
              Custos Adicionais da Operação
              {temCustos && <span className="text-xs font-normal text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">Incluídos no CET</span>}
            </span>
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${mostrarCustos ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {mostrarCustos && (
            <div className="px-5 pb-5 grid grid-cols-2 gap-4 border-t border-slate-100 dark:border-slate-700 pt-4">
              <Field label="IOF (R$)">
                <Input value={iof} onChange={setIof} placeholder="0" />
              </Field>
              <Field label="TAC — Tarifa de Abertura (R$)">
                <Input value={tac} onChange={setTac} placeholder="0" />
              </Field>
              <Field label="Seguro Mensal (R$)">
                <Input value={seguroMensal} onChange={setSeguroMensal} placeholder="0" />
              </Field>
              <Field label="Outros Encargos (R$)">
                <Input value={outrosEncargos} onChange={setOutrosEncargos} placeholder="0" />
              </Field>
              <p className="col-span-2 text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
                IOF e TAC são cobrados uma única vez. Seguro é multiplicado pelo nº de parcelas. Outros encargos são somados diretamente ao total.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Resultados */}
      <div className="space-y-4">
        {!resultado ? (
          <EmptyState label="Preencha o valor financiado, nº de parcelas e valor da parcela" />
        ) : (
          <>
            {/* Taxa de juros real */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl border border-blue-200 dark:border-blue-800 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400 mb-3">
                Taxa de Juros Real da Operação
              </p>
              <div className="flex items-end gap-6">
                <div>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Mensal</p>
                  <p className="text-3xl font-bold text-blue-800 dark:text-blue-200">
                    {fmtPct(resultado.taxaMensal)} <span className="text-sm font-normal">a.m.</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Anual efetiva</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                    {fmtPct(resultado.taxaAnual, 2)} <span className="text-sm font-normal">a.a.</span>
                  </p>
                </div>
              </div>
            </div>

            {/* CET */}
            {resultado.cetMensal !== null && resultado.cetAnual !== null && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-3">
                  CET — Custo Efetivo Total (com todos os encargos)
                </p>
                <div className="flex items-end gap-6">
                  <div>
                    <p className="text-xs text-amber-600 dark:text-amber-400">Mensal</p>
                    <p className="text-2xl font-bold text-amber-800 dark:text-amber-200">
                      {fmtPct(resultado.cetMensal)} <span className="text-sm font-normal">a.m.</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-amber-600 dark:text-amber-400">Anual efetiva</p>
                    <p className="text-xl font-bold text-amber-700 dark:text-amber-300">
                      {fmtPct(resultado.cetAnual, 2)} <span className="text-sm font-normal">a.a.</span>
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-amber-600/70 dark:text-amber-500">
                  Spread encargos: +{fmtPct(resultado.cetMensal - resultado.taxaMensal)} a.m.
                </p>
              </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="Total de Parcelas" value={fmtBRL(resultado.totalParcelas)} sub={`${numParcelas}x ${fmtBRL(parseBR(valorParcela))}`} color="slate" />
              <KpiCard label="Total de Juros" value={fmtBRL(resultado.totalJuros)} sub={`${fmtPct((resultado.totalJuros / resultado.totalParcelas) * 100, 1)} do total pago`} color="red" />
              {resultado.totalEncargos > 0 && (
                <KpiCard label="Encargos Adicionais" value={fmtBRL(resultado.totalEncargos)} sub="IOF + TAC + seguro + outros" color="red" />
              )}
              <KpiCard
                label={resultado.totalEncargos > 0 ? 'Total Geral (parcelas + encargos)' : 'Custo Total da Operação'}
                value={fmtBRL(resultado.totalGeral)}
                sub={`Principal: ${fmtBRL(parseBR(valorFinanciado))}`}
                color="slate"
              />
            </div>

            {/* Decomposição do custo */}
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Decomposição do Custo Total</p>
              <DecomposicaoBarra
                label="Principal (devolvido)"
                valor={parseBR(valorFinanciado)}
                total={resultado.totalGeral}
                cor="bg-slate-400 dark:bg-slate-500"
              />
              <DecomposicaoBarra
                label="Juros pagos"
                valor={resultado.totalJuros}
                total={resultado.totalGeral}
                cor="bg-red-400 dark:bg-red-500"
              />
              {resultado.totalEncargos > 0 && (
                <DecomposicaoBarra
                  label="Encargos (IOF, TAC, seguro...)"
                  valor={resultado.totalEncargos}
                  total={resultado.totalGeral}
                  cor="bg-amber-400 dark:bg-amber-500"
                />
              )}
            </div>

            {/* Tabela de amortização */}
            <button
              type="button"
              onClick={() => setMostrarTabela((v) => !v)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
            >
              <svg className={`w-4 h-4 transition-transform ${mostrarTabela ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
              {mostrarTabela ? 'Ocultar' : 'Ver'} tabela de amortização detalhada
            </button>

            {mostrarTabela && (
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    Tabela de Amortização — {sistema === 'price' ? 'Tabela Price' : 'SAC'} · {fmtPct(resultado.taxaMensal)} a.m.
                  </p>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700">
                      <tr>
                        {['Mês', 'Parcela', 'Juros', 'Amortização', 'Saldo'].map((h) => (
                          <th key={h} className="text-right first:text-left px-3 py-2 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {resultado.parcelas.map((row) => (
                        <tr key={row.mes} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                          <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{row.mes}</td>
                          <td className="px-3 py-1.5 text-right text-slate-700 dark:text-slate-300 font-medium">{fmt(row.parcela)}</td>
                          <td className="px-3 py-1.5 text-right text-red-500 dark:text-red-400">{fmt(row.juros)}</td>
                          <td className="px-3 py-1.5 text-right text-emerald-600 dark:text-emerald-400">{fmt(row.amortizacao)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-600 dark:text-slate-300">{fmt(row.saldo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── */
/* COMPONENTES UTILITÁRIOS                                         */
/* ─────────────────────────────────────────────────────────────── */
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 shadow-sm'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
      }`}
    >
      {children}
    </button>
  );
}

function CardSection({ title, dot, children }: { title: string; dot: 'slate' | 'emerald' | 'blue'; children: React.ReactNode }) {
  const dotColor = { slate: 'bg-slate-400', emerald: 'bg-emerald-500', blue: 'bg-blue-500' }[dot];
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-4 flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`}></span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = 'w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />;
}

function InputNum({ value, onChange, min }: { value: string; onChange: (v: string) => void; min?: number }) {
  return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} min={min} className={inputCls} />;
}

function SistemaToggle({ value, onChange }: { value: Sistema; onChange: (s: Sistema) => void }) {
  return (
    <div className="flex gap-3">
      {(['price', 'sac'] as Sistema[]).map((s) => (
        <button key={s} type="button" onClick={() => onChange(s)}
          className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${value === s ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:border-emerald-400'}`}>
          {s === 'price' ? 'Tabela Price' : 'SAC'}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-10 shadow-sm flex flex-col items-center justify-center text-center gap-3">
      <svg className="w-12 h-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
      <p className="text-slate-400 dark:text-slate-500 text-sm">{label}</p>
    </div>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: 'slate' | 'green' | 'red' }) {
  const colorMap = {
    slate: 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700',
    green: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  };
  const valueColorMap = {
    slate: 'text-slate-800 dark:text-slate-200',
    green: 'text-emerald-700 dark:text-emerald-300',
    red: 'text-red-700 dark:text-red-300',
  };
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${colorMap[color]}`}>
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
      <p className={`text-xl font-bold mt-1 ${valueColorMap[color]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function ComparativoRow({ label, a, b, bBetter }: { label: string; a: string; b: string; bBetter?: boolean }) {
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{label}</td>
      <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300 font-medium">{a}</td>
      <td className={`px-4 py-3 text-right font-semibold ${bBetter === undefined ? 'text-slate-700 dark:text-slate-300' : bBetter ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
        {b}{bBetter !== undefined && <span className="ml-1 text-xs">{bBetter ? '▼' : '▲'}</span>}
      </td>
    </tr>
  );
}

function TabelaAmortizacao({ mostrar, onToggle, aba, onAba, parcelasAtual, parcelasRenegociado }: {
  mostrar: boolean; onToggle: () => void; aba: 'atual' | 'renegociado';
  onAba: (a: 'atual' | 'renegociado') => void;
  parcelasAtual: ParcelaDetalhe[]; parcelasRenegociado: ParcelaDetalhe[];
}) {
  return (
    <>
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm">
        <svg className={`w-4 h-4 transition-transform ${mostrar ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
        {mostrar ? 'Ocultar' : 'Ver'} tabela de amortização detalhada
      </button>
      {mostrar && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="flex border-b border-slate-200 dark:border-slate-700">
            {(['atual', 'renegociado'] as const).map((a) => (
              <button key={a} type="button" onClick={() => onAba(a)}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${aba === a ? 'text-emerald-600 dark:text-emerald-400 border-b-2 border-emerald-600 dark:border-emerald-400 -mb-px bg-emerald-50 dark:bg-emerald-900/20' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}>
                {a === 'atual' ? 'Contrato Atual' : 'Após Renegociação'}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-700">
                <tr>
                  {['Mês', 'Parcela', 'Juros', 'Amortização', 'Saldo'].map((h) => (
                    <th key={h} className="text-right first:text-left px-3 py-2 font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {(aba === 'atual' ? parcelasAtual : parcelasRenegociado).map((row) => (
                  <tr key={row.mes} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{row.mes}</td>
                    <td className="px-3 py-1.5 text-right text-slate-700 dark:text-slate-300 font-medium">{fmt(row.parcela)}</td>
                    <td className="px-3 py-1.5 text-right text-red-500 dark:text-red-400">{fmt(row.juros)}</td>
                    <td className="px-3 py-1.5 text-right text-emerald-600 dark:text-emerald-400">{fmt(row.amortizacao)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-600 dark:text-slate-300">{fmt(row.saldo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function DecomposicaoBarra({ label, valor, total, cor }: { label: string; valor: number; total: number; cor: string }) {
  const pct = total > 0 ? (valor / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-600 dark:text-slate-400">{label}</span>
        <span className="text-slate-700 dark:text-slate-300 font-medium">{fmtBRL(valor)} <span className="text-slate-400">({fmtPct(pct, 1)})</span></span>
      </div>
      <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}
