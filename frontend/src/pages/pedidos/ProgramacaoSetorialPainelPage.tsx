import { useEffect, useMemo, useState } from 'react';
import ProgramacaoSetorialPage from './ProgramacaoSetorialPage';
import ProgramacaoImpressaoModal from '../../components/ProgramacaoImpressaoModal';
import {
  atualizarProgramacaoSetorialRegistro,
  listarProgramacaoSetorialRegistros,
  type ProgramacaoSetorialRegistro,
} from '../../api/programacaoSetorial';
import { imageUrlToDataUrl } from '../../utils/imageDataUrl';
import { filterSnapshotLinhasByRules } from '../../utils/programacaoSetorialSnapshotFilters';
import { downloadProgramacaoSnapshotPdf, type SnapshotLinhaPdf } from '../../utils/programacaoSetorialSnapshotPdf';

/** Formato gravado em `dadosProgramacao` ao salvar no gerador. */
type SnapshotLinha = {
  observacoes?: string;
  previsao?: string;
  pd?: string;
  cod?: string;
  descricao?: string;
  setor?: string;
  recurso?: string;
  /** Compat.: snapshot gravado com chave igual ao ERP. */
  Recurso?: string;
  tipoF?: string;
  originalQty?: number;
  qtyToProduce?: number;
  fulfilledByStock?: number;
};

/** Gravado após a 1ª geração de PDF na visualização do registro (snapshot). */
type ImpressaoCongeladaSnapshot = {
  congelada: true;
  primeiraEm: string;
  printSector: string;
  printShowPD: boolean;
  printStart: string;
  printEnd: string;
  printConsolidatedStart: string;
  printConsolidatedEnd: string;
};

type DadosProgramacaoParsed = {
  versao?: number;
  geradoEm?: string;
  filtros?: {
    observacoesParam?: string;
    selectedSector?: string;
    startDate?: string;
    endDate?: string;
    showPD?: boolean;
  };
  abaAtiva?: string;
  linhasProgramacao?: SnapshotLinha[];
  linhasEstoqueAtendido?: SnapshotLinha[];
  impressao?: ImpressaoCongeladaSnapshot;
};

function parseDadosProgramacao(raw: string | null | undefined): DadosProgramacaoParsed | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as DadosProgramacaoParsed;
  } catch {
    return null;
  }
}

const STATUS_LABEL: Record<ProgramacaoSetorialRegistro['status'], string> = {
  PENDENTE: 'Pendente',
  EM_EXECUCAO: 'Em execução',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

const STATUS_BADGE: Record<ProgramacaoSetorialRegistro['status'], string> = {
  PENDENTE: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  EM_EXECUCAO: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  CONCLUIDA: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  CANCELADA: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
};

function fmtDate(v: string): string {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('pt-BR');
}

export default function ProgramacaoSetorialPainelPage() {
  const [registros, setRegistros] = useState<ProgramacaoSetorialRegistro[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [showGeradorModal, setShowGeradorModal] = useState(false);
  const [visualizacaoRegistro, setVisualizacaoRegistro] = useState<ProgramacaoSetorialRegistro | null>(null);
  const [pdfAcaoMsg, setPdfAcaoMsg] = useState<string | null>(null);

  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printSector, setPrintSector] = useState('Geral');
  const [printShowPD, setPrintShowPD] = useState(false);
  const [printStart, setPrintStart] = useState('');
  const [printEnd, setPrintEnd] = useState('');
  const [printConsolidatedStart, setPrintConsolidatedStart] = useState('');
  const [printConsolidatedEnd, setPrintConsolidatedEnd] = useState('');
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [salvandoCongelamentoImpressao, setSalvandoCongelamentoImpressao] = useState(false);

  useEffect(() => {
    void imageUrlToDataUrl('/logo-soaco.png').then(setLogoBase64);
  }, []);

  const dadosSnapVisualizacao = useMemo(() => {
    if (!visualizacaoRegistro) return null;
    const snap = parseDadosProgramacao(visualizacaoRegistro.dadosProgramacao);
    return { registro: visualizacaoRegistro, snap };
  }, [visualizacaoRegistro]);

  const setoresUnicosSnapshot = useMemo(() => {
    const linhas = dadosSnapVisualizacao?.snap?.linhasProgramacao ?? [];
    const s = new Set<string>();
    for (const r of linhas) {
      const v = String(r.setor ?? '').trim();
      if (v) s.add(v);
    }
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [dadosSnapVisualizacao?.snap?.linhasProgramacao]);

  const sectorsImpressao = useMemo(() => {
    const rest = setoresUnicosSnapshot.filter((x) => x !== 'Corte e Dobra');
    return ['Geral', 'Corte e Dobra', ...rest];
  }, [setoresUnicosSnapshot]);

  const impressaoCongelada = dadosSnapVisualizacao?.snap?.impressao?.congelada === true;

  function abrirModalImpressaoSnapshot() {
    const ds = dadosSnapVisualizacao;
    if (!ds?.snap) {
      setPdfAcaoMsg('Não há dados para gerar o PDF.');
      return;
    }
    const f = ds.snap.filtros ?? {};
    const imp = ds.snap.impressao;
    setPdfAcaoMsg(null);
    if (imp?.congelada) {
      setPrintSector(imp.printSector && sectorsImpressao.includes(imp.printSector) ? imp.printSector : 'Geral');
      setPrintShowPD(!!imp.printShowPD);
      setPrintStart(imp.printStart ?? '');
      setPrintEnd(imp.printEnd ?? '');
      setPrintConsolidatedStart(imp.printConsolidatedStart ?? '');
      setPrintConsolidatedEnd(imp.printConsolidatedEnd ?? '');
    } else {
      setPrintSector(f.selectedSector && sectorsImpressao.includes(f.selectedSector) ? f.selectedSector : 'Geral');
      setPrintShowPD(!!f.showPD);
      setPrintStart(f.startDate ?? '');
      setPrintEnd(f.endDate ?? '');
      setPrintConsolidatedStart(f.startDate ?? '');
      setPrintConsolidatedEnd(f.endDate ?? '');
    }
    setPrintModalOpen(true);
  }

  function snapshotLinhaToPdf(row: SnapshotLinha): SnapshotLinhaPdf {
    return {
      observacoes: row.observacoes,
      previsao: row.previsao,
      pd: row.pd,
      cod: row.cod,
      descricao: row.descricao,
      setor: row.setor,
      qtyToProduce: row.qtyToProduce,
    };
  }

  async function confirmarImpressaoSnapshot() {
    const ds = dadosSnapVisualizacao;
    if (!ds?.snap) {
      setPdfAcaoMsg('Não há dados para gerar o PDF.');
      return;
    }
    const linhas = ds.snap.linhasProgramacao ?? [];
    const mainFiltered = filterSnapshotLinhasByRules(linhas, printSector, printStart, printEnd).filter(
      (r) => Number(r.qtyToProduce ?? 0) > 0,
    );
    const consFiltered = filterSnapshotLinhasByRules(linhas, printSector, printConsolidatedStart, printConsolidatedEnd);
    if (mainFiltered.length === 0 && consFiltered.length === 0) {
      setPdfAcaoMsg('Não há linhas para o período e setor selecionados.');
      return;
    }
    const periodo = (a: string, b: string) => (a && b ? `${a} a ${b}` : 'Período completo');
    const safeSuffix =
      printSector === 'Geral'
        ? 'Geral'
        : printSector.replace(/[^\p{L}\p{N}\s\-]/gu, '').trim().slice(0, 40) || 'setor';
    try {
      downloadProgramacaoSnapshotPdf({
        registroId: ds.registro.id,
        tituloSuffix: safeSuffix,
        periodoLabel: periodo(printStart, printEnd),
        periodoConsolidadoLabel: periodo(printConsolidatedStart, printConsolidatedEnd),
        showPD: printShowPD,
        linhas: mainFiltered.map(snapshotLinhaToPdf),
        linhasConsolidacao: consFiltered.map(snapshotLinhaToPdf),
        logoBase64,
      });
      setPdfAcaoMsg(null);

      if (!ds.snap.impressao?.congelada) {
        const base = parseDadosProgramacao(ds.registro.dadosProgramacao);
        if (!base) {
          setPdfAcaoMsg('Não foi possível gravar o congelamento das datas (snapshot inválido). O PDF foi gerado.');
          setPrintModalOpen(false);
          return;
        }
        const impressao: ImpressaoCongeladaSnapshot = {
          congelada: true,
          primeiraEm: new Date().toISOString(),
          printSector,
          printShowPD,
          printStart,
          printEnd,
          printConsolidatedStart,
          printConsolidatedEnd,
        };
        setSalvandoCongelamentoImpressao(true);
        try {
          const merged: DadosProgramacaoParsed = { ...base, impressao };
          const atualizado = await atualizarProgramacaoSetorialRegistro(ds.registro.id, { dadosProgramacao: merged });
          setVisualizacaoRegistro(atualizado);
          setRegistros((prev) => prev.map((r) => (r.id === atualizado.id ? atualizado : r)));
        } catch (err) {
          setPdfAcaoMsg(
            err instanceof Error
              ? `PDF gerado, mas falhou ao gravar datas fixas: ${err.message}`
              : 'PDF gerado, mas falhou ao gravar datas fixas no registro.',
          );
          return;
        } finally {
          setSalvandoCongelamentoImpressao(false);
        }
      }

      setPrintModalOpen(false);
    } catch (e) {
      setPdfAcaoMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function carregarRegistros() {
    setLoading(true);
    setErro(null);
    try {
      const res = await listarProgramacaoSetorialRegistros();
      setRegistros(res.data ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarRegistros();
  }, []);

  const totalAbertas = useMemo(
    () => registros.filter((r) => r.status === 'PENDENTE' || r.status === 'EM_EXECUCAO').length,
    [registros]
  );

  return (
    <div className="p-6 flex flex-col gap-4 min-h-0">
      {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Programações Setoriais</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Abertas: {totalAbertas} | Total: {registros.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowGeradorModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition"
          >
            Gerar Programação
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="py-3 px-4 font-semibold">Identificador / Nome</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Criado por</th>
                <th className="py-3 px-4 font-semibold">Data de criação</th>
                <th className="py-3 px-4 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 px-4 text-center text-slate-500">Carregando...</td>
                </tr>
              ) : registros.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-14 px-4 text-center text-slate-500">Nenhuma programação registrada.</td>
                </tr>
              ) : (
                registros.map((r) => (
                  <tr key={r.id} className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="py-3 px-4">#{r.id} - {r.nome}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                    </td>
                    <td className="py-3 px-4">{r.criadoPor ?? '-'}</td>
                    <td className="py-3 px-4">{fmtDate(r.createdAt)}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setVisualizacaoRegistro(r)}
                          className="px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition"
                        >
                          Abrir Gerador
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showGeradorModal && (
        <div className="fixed inset-0 z-[120] bg-black/70 p-2 sm:p-4">
          <div className="h-full w-full rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 flex flex-col">
            <div className="shrink-0 px-3 py-2 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-white dark:bg-slate-800">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Gerar Programação</h3>
              <button type="button" onClick={() => setShowGeradorModal(false)} className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-sm">
                Fechar
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <ProgramacaoSetorialPage onProgramacaoSalva={carregarRegistros} />
            </div>
          </div>
        </div>
      )}

      {visualizacaoRegistro && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-labelledby="snapshot-programacao-title"
        >
          <div className="w-full max-w-5xl max-h-[90vh] rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-xl flex flex-col overflow-hidden">
            <div className="shrink-0 px-5 py-4 border-b border-slate-200 dark:border-slate-600 bg-primary-700 text-white flex items-center justify-between gap-3">
              <div>
                <h3 id="snapshot-programacao-title" className="font-semibold text-base">
                  Programação registrada (somente leitura)
                </h3>
                <p className="text-xs text-white/90 mt-0.5">
                  #{visualizacaoRegistro.id} — {visualizacaoRegistro.nome}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVisualizacaoRegistro(null)}
                className="rounded-lg px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20"
              >
                Fechar
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-6 text-sm text-slate-800 dark:text-slate-100">
              {(() => {
                const snap = parseDadosProgramacao(visualizacaoRegistro.dadosProgramacao);
                if (!snap) {
                  return (
                    <p className="text-slate-600 dark:text-slate-400">
                      Não há snapshot de dados armazenado para esta programação (registro antigo ou salvamento sem dados).
                    </p>
                  );
                }
                const f = snap.filtros ?? {};
                const linhasProg = snap.linhasProgramacao ?? [];
                const linhasEst = snap.linhasEstoqueAtendido ?? [];
                return (
                  <>
                    <section className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Metadados</h4>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-200 dark:border-slate-600">
                        {snap.geradoEm && (
                          <>
                            <dt className="text-slate-500">Gerado em</dt>
                            <dd>{fmtDate(snap.geradoEm)}</dd>
                          </>
                        )}
                        {snap.versao != null && (
                          <>
                            <dt className="text-slate-500">Versão do snapshot</dt>
                            <dd>{snap.versao}</dd>
                          </>
                        )}
                        {snap.abaAtiva && (
                          <>
                            <dt className="text-slate-500">Aba ao salvar</dt>
                            <dd>{snap.abaAtiva}</dd>
                          </>
                        )}
                        <dt className="text-slate-500">Observação do registro</dt>
                        <dd>{visualizacaoRegistro.observacao?.trim() || '—'}</dd>
                      </dl>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-3 leading-relaxed border-t border-slate-200 dark:border-slate-600 pt-3">
                        As tabelas abaixo reproduzem o que foi <strong>gravado</strong> ao salvar a programação (linhas, previsões e quantidades). Alterações no ERP depois disso{' '}
                        <strong>não alteram</strong> este registro: aqui você vê o histórico daquele momento.
                      </p>
                      {snap.impressao?.congelada && (
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-200 dark:border-slate-600 mt-3">
                          <dt className="text-slate-500">Datas da impressão PDF</dt>
                          <dd className="text-slate-700 dark:text-slate-200">Fixadas na 1ª geração ({fmtDate(snap.impressao.primeiraEm)})</dd>
                        </dl>
                      )}
                    </section>
                    <section className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Filtros e parâmetros</h4>
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-200 dark:border-slate-600">
                        <dt className="text-slate-500">Setor</dt>
                        <dd>{f.selectedSector ?? '—'}</dd>
                        <dt className="text-slate-500">Observações (parâmetro)</dt>
                        <dd>{f.observacoesParam?.trim() || '—'}</dd>
                        <dt className="text-slate-500">Período (início)</dt>
                        <dd>{f.startDate || '—'}</dd>
                        <dt className="text-slate-500">Período (fim)</dt>
                        <dd>{f.endDate || '—'}</dd>
                        <dt className="text-slate-500">Exibir Pedidos</dt>
                        <dd>{f.showPD ? 'Sim' : 'Não'}</dd>
                      </dl>
                    </section>
                    <section className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-900/40 p-4">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Impressão (snapshot)
                      </h4>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400">
                        Abre a mesma configuração do gerador (setor, PD, período da programação e período consolidado) e gera o PDF com detalhamento e consolidação.
                      </p>
                      {pdfAcaoMsg && (
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                          {pdfAcaoMsg}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={abrirModalImpressaoSnapshot}
                          disabled={linhasProg.length === 0}
                          className="inline-flex justify-center items-center px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition"
                        >
                          Imprimir PDF
                        </button>
                      </div>
                    </section>
                    <section className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Linhas — programação ({linhasProg.length})
                      </h4>
                      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
                        <table className="w-full text-xs text-left min-w-[640px]">
                          <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300">
                            <tr>
                              <th className="py-2 px-2 font-medium">Observações</th>
                              <th className="py-2 px-2 font-medium">Previsão</th>
                              <th className="py-2 px-2 font-medium">PD</th>
                              <th className="py-2 px-2 font-medium">Cód</th>
                              <th className="py-2 px-2 font-medium">Descrição</th>
                              <th className="py-2 px-2 font-medium">Setor</th>
                              <th className="py-2 px-2 font-medium text-right">Qtd produzir</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
                            {linhasProg.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="py-4 px-2 text-slate-500 text-center">
                                  Nenhuma linha
                                </td>
                              </tr>
                            ) : (
                              linhasProg.map((row, i) => (
                                <tr key={i} className="bg-white dark:bg-slate-800/50">
                                  <td className="py-2 px-2 align-top max-w-[140px] break-words">{row.observacoes ?? '—'}</td>
                                  <td className="py-2 px-2 align-top whitespace-nowrap">{row.previsao ?? '—'}</td>
                                  <td className="py-2 px-2 align-top">{row.pd ?? '—'}</td>
                                  <td className="py-2 px-2 align-top font-mono">{row.cod ?? '—'}</td>
                                  <td className="py-2 px-2 align-top max-w-[200px] break-words">{row.descricao ?? '—'}</td>
                                  <td className="py-2 px-2 align-top">{row.setor ?? '—'}</td>
                                  <td className="py-2 px-2 align-top text-right">{row.qtyToProduce ?? '—'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                    <section className="space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Linhas — estoque atendido ({linhasEst.length})
                      </h4>
                      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
                        <table className="w-full text-xs text-left min-w-[640px]">
                          <thead className="bg-slate-100 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300">
                            <tr>
                              <th className="py-2 px-2 font-medium">Observações</th>
                              <th className="py-2 px-2 font-medium">Previsão</th>
                              <th className="py-2 px-2 font-medium">PD</th>
                              <th className="py-2 px-2 font-medium">Cód</th>
                              <th className="py-2 px-2 font-medium">Descrição</th>
                              <th className="py-2 px-2 font-medium text-right">Atendido (estoque)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
                            {linhasEst.length === 0 ? (
                              <tr>
                                <td colSpan={6} className="py-4 px-2 text-slate-500 text-center">
                                  Nenhuma linha
                                </td>
                              </tr>
                            ) : (
                              linhasEst.map((row, i) => (
                                <tr key={i} className="bg-white dark:bg-slate-800/50">
                                  <td className="py-2 px-2 align-top max-w-[140px] break-words">{row.observacoes ?? '—'}</td>
                                  <td className="py-2 px-2 align-top whitespace-nowrap">{row.previsao ?? '—'}</td>
                                  <td className="py-2 px-2 align-top">{row.pd ?? '—'}</td>
                                  <td className="py-2 px-2 align-top font-mono">{row.cod ?? '—'}</td>
                                  <td className="py-2 px-2 align-top max-w-[200px] break-words">{row.descricao ?? '—'}</td>
                                  <td className="py-2 px-2 align-top text-right">{row.fulfilledByStock ?? '—'}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  </>
                );
              })()}
            </div>
            <div className="shrink-0 px-5 py-3 border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Visualização do que foi salvo no momento do registro. Para gerar uma nova programação interativa, use &quot;Gerar Programação&quot;.
              </p>
            </div>
          </div>
        </div>
      )}

      <ProgramacaoImpressaoModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        sectors={sectorsImpressao}
        selectedSector={printSector}
        onSelectedSectorChange={(v) => {
          setPrintSector(v);
          setPdfAcaoMsg(null);
        }}
        showPD={printShowPD}
        onShowPDChange={(v) => {
          setPrintShowPD(v);
          setPdfAcaoMsg(null);
        }}
        startDate={printStart}
        endDate={printEnd}
        onStartDateChange={(v) => {
          setPrintStart(v);
          setPdfAcaoMsg(null);
        }}
        onEndDateChange={(v) => {
          setPrintEnd(v);
          setPdfAcaoMsg(null);
        }}
        consolidatedStart={printConsolidatedStart}
        consolidatedEnd={printConsolidatedEnd}
        onConsolidatedStartChange={(v) => {
          setPrintConsolidatedStart(v);
          setPdfAcaoMsg(null);
        }}
        onConsolidatedEndChange={(v) => {
          setPrintConsolidatedEnd(v);
          setPdfAcaoMsg(null);
        }}
        onConfirm={() => void confirmarImpressaoSnapshot()}
        disabledConfirm={salvandoCongelamentoImpressao}
        datasSomenteLeitura={impressaoCongelada}
        confirmLabel={salvandoCongelamentoImpressao ? 'Gravando datas…' : 'Confirmar e Gerar PDF'}
      />
    </div>
  );
}

