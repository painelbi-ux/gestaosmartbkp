import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createMrpRun,
  deleteMrpRun,
  listMrpRuns,
  processMrpRun,
  type MrpRun,
  type MrpScenarioRowPayload,
  type MrpScenarioType,
} from '../../api/mrp';
import { listarPedidosExport } from '../../api/pedidos';
import { downloadPedidosXlsx } from '../../utils/exportImportPedidos';
import { parsePedidosXlsxForImport } from '../../utils/exportImportPedidos';
import FiltroDatasMRPManagerPopover from '../../components/FiltroDatasMRPManagerPopover';
import MRPPage from './MRPPage';
import MPPPage from './MPPPage';

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR');
}

function scenarioLabel(run: MrpRun): string {
  return run.scenario_type === 'SIMULADO' ? 'Simulado' : 'Real';
}

function statusLabel(status: string): string {
  switch (status) {
    case 'AGUARDANDO_PROCESSAMENTO':
      return 'Aguardando Processamento';
    case 'PROCESSANDO':
      return 'Processando';
    case 'PROCESSADO':
      return 'Processado';
    case 'ERRO':
      return 'Erro';
    default:
      return status;
  }
}

function hojeIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoDateInput(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MRP_MANAGER_FILTER_INPUT_CLASS =
  'w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent min-h-[2.5rem]';
const MRP_MANAGER_FILTER_LABEL_CLASS = 'block text-xs text-slate-500 dark:text-slate-400 mb-1';
const MRP_MANAGER_BTN_PRIMARY_CLASS =
  'px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm transition shrink-0';

type ConfirmacaoMrp = {
  tipo: 'processar' | 'excluir';
  run: MrpRun;
  titulo: string;
  mensagem: string;
  detalhe?: string;
  confirmarLabel: string;
  tom: 'amber' | 'red';
};

type FeedbackModal = {
  titulo: string;
  mensagem: string;
  tom: 'success' | 'error' | 'info';
};

export default function MRPManagerPage() {
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [blockingMessage, setBlockingMessage] = useState<string | null>(null);
  const [runs, setRuns] = useState<MrpRun[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<FeedbackModal | null>(null);
  const [confirmacao, setConfirmacao] = useState<ConfirmacaoMrp | null>(null);
  const [modalNovoOpen, setModalNovoOpen] = useState(false);
  const [runVisualizacaoId, setRunVisualizacaoId] = useState<number | null>(null);
  const [modalMppOpen, setModalMppOpen] = useState(false);
  const [observacoes, setObservacoes] = useState('');
  const [scenarioType, setScenarioType] = useState<MrpScenarioType>('REAL');
  const [scenarioFileName, setScenarioFileName] = useState('');
  const [horizonteFim, setHorizonteFim] = useState('');
  const [scenarioRows, setScenarioRows] = useState<MrpScenarioRowPayload[]>([]);
  const [filtroCodigo, setFiltroCodigo] = useState('');
  const [filtroCriacaoIni, setFiltroCriacaoIni] = useState('');
  const [filtroCriacaoFim, setFiltroCriacaoFim] = useState('');
  const [filtroProcessamentoIni, setFiltroProcessamentoIni] = useState('');
  const [filtroProcessamentoFim, setFiltroProcessamentoFim] = useState('');
  const [filtroCenario, setFiltroCenario] = useState('');
  const [filtroArquivo, setFiltroArquivo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroObservacao, setFiltroObservacao] = useState('');

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const res = await listMrpRuns();
      setRuns(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setRuns([]);
      setErro(e instanceof Error ? e.message : 'Erro ao carregar histórico de MRPs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const filteredRuns = useMemo(() => {
    const cod = filtroCodigo.trim().replace(/^#/, '').toLowerCase();
    const arq = filtroArquivo.trim().toLowerCase();
    const obs = filtroObservacao.trim().toLowerCase();
    return runs.filter((r) => {
      if (cod && !String(r.id).toLowerCase().includes(cod)) return false;
      const criacaoIso = isoDateInput(r.created_at);
      if (filtroCriacaoIni && (!criacaoIso || criacaoIso < filtroCriacaoIni)) return false;
      if (filtroCriacaoFim && (!criacaoIso || criacaoIso > filtroCriacaoFim)) return false;
      const processamentoIso = isoDateInput(r.processed_at);
      if (filtroProcessamentoIni && (!processamentoIso || processamentoIso < filtroProcessamentoIni)) return false;
      if (filtroProcessamentoFim && (!processamentoIso || processamentoIso > filtroProcessamentoFim)) return false;
      if (filtroCenario && r.scenario_type !== filtroCenario) return false;
      if (arq && !(r.scenario_file_name ?? '—').toLowerCase().includes(arq)) return false;
      if (filtroStatus && r.status !== filtroStatus) return false;
      if (obs && !(r.observacoes ?? '—').toLowerCase().includes(obs)) return false;
      return true;
    });
  }, [
    runs,
    filtroCodigo,
    filtroCriacaoIni,
    filtroCriacaoFim,
    filtroProcessamentoIni,
    filtroProcessamentoFim,
    filtroCenario,
    filtroArquivo,
    filtroStatus,
    filtroObservacao,
  ]);

  const temFiltrosGrade =
    filtroCodigo.trim() !== '' ||
    filtroCriacaoIni !== '' ||
    filtroCriacaoFim !== '' ||
    filtroProcessamentoIni !== '' ||
    filtroProcessamentoFim !== '' ||
    filtroCenario !== '' ||
    filtroArquivo.trim() !== '' ||
    filtroStatus !== '' ||
    filtroObservacao.trim() !== '';

  const limparFiltrosGrade = () => {
    setFiltroCodigo('');
    setFiltroCriacaoIni('');
    setFiltroCriacaoFim('');
    setFiltroProcessamentoIni('');
    setFiltroProcessamentoFim('');
    setFiltroCenario('');
    setFiltroArquivo('');
    setFiltroStatus('');
    setFiltroObservacao('');
  };

  const resetNovo = () => {
    setObservacoes('');
    setScenarioType('REAL');
    setScenarioFileName('');
    setHorizonteFim('');
    setScenarioRows([]);
    if (inputFileRef.current) inputFileRef.current.value = '';
  };

  const fecharModal = () => {
    setModalNovoOpen(false);
    resetNovo();
  };

  const onFileChange = async (file: File | null) => {
    if (!file) {
      setScenarioRows([]);
      setScenarioFileName('');
      return;
    }
    try {
      const linhas = await parsePedidosXlsxForImport(file);
      const mapped = linhas
        .map((l) => ({
          id_pedido: String(l.id_pedido ?? '').trim(),
          previsao_nova: String(l.nova_previsao ?? '').trim(),
          cod_produto: l.cod?.trim() || undefined,
          qtde_pendente:
            typeof l.qtde_pendente === 'number' && Number.isFinite(l.qtde_pendente) && l.qtde_pendente > 0
              ? l.qtde_pendente
              : undefined,
        }))
        .filter((l) => l.id_pedido && l.previsao_nova);
      setScenarioRows(mapped);
      setScenarioFileName(file.name);
      setFeedbackModal({
        titulo: 'Arquivo carregado',
        mensagem: `${mapped.length} linha(s) de cenário simulado carregadas.`,
        tom: 'success',
      });
    } catch (e) {
      setScenarioRows([]);
      setScenarioFileName('');
      setFeedbackModal({
        titulo: 'Erro ao ler arquivo',
        mensagem: e instanceof Error ? e.message : 'Erro ao ler arquivo de cenário.',
        tom: 'error',
      });
    }
  };

  const canSave = useMemo(() => {
    if (!horizonteFim.trim()) return false;
    if (scenarioType === 'SIMULADO' && scenarioRows.length === 0) return false;
    return true;
  }, [horizonteFim, scenarioType, scenarioRows.length]);

  const submitNovo = async () => {
    if (!canSave) return;
    if (horizonteFim.trim() <= hojeIsoLocal()) {
      setFeedbackModal({
        titulo: 'Data do horizonte inválida',
        mensagem: 'A data final do horizonte deve ser maior que a data de hoje.',
        tom: 'error',
      });
      return;
    }
    setSaving(true);
    setBlockingMessage('Salvando MRP...');
    try {
      const created = await createMrpRun({
        observacoes: observacoes.trim() || undefined,
        scenario_type: scenarioType,
        scenario_file_name: scenarioType === 'SIMULADO' ? scenarioFileName || undefined : undefined,
        horizonte_fim: horizonteFim.trim(),
        scenario_rows: scenarioType === 'SIMULADO' ? scenarioRows : undefined,
      });
      setBlockingMessage(`Processando "${created.data.nome}"...`);
      const processed = await processMrpRun(created.data.id);
      setFeedbackModal({
        titulo: 'MRP processado',
        mensagem: 'MRP criado e processado com sucesso. O horizonte será carregado automaticamente ao visualizar.',
        tom: 'success',
      });
      fecharModal();
      await loadRuns();
      setRunVisualizacaoId(processed.data.id);
    } catch (e) {
      setFeedbackModal({
        titulo: 'Erro ao processar MRP',
        mensagem: e instanceof Error ? e.message : 'Erro ao criar e processar MRP.',
        tom: 'error',
      });
    } finally {
      setSaving(false);
      setBlockingMessage(null);
    }
  };

  const onProcessar = async (run: MrpRun) => {
    if (!run.horizonte_fim) {
      setFeedbackModal({
        titulo: 'Horizonte não informado',
        mensagem: 'Este MRP não possui data de horizonte salva. Crie um novo MRP informando a data final do horizonte.',
        tom: 'error',
      });
      return;
    }
    setProcessingId(run.id);
    setBlockingMessage(`Processando "${run.nome}"...`);
    try {
      await processMrpRun(run.id);
      setFeedbackModal({
        titulo: 'MRP processado',
        mensagem: 'MRP processado com sucesso.',
        tom: 'success',
      });
      await loadRuns();
    } catch (e) {
      setFeedbackModal({
        titulo: 'Erro ao processar MRP',
        mensagem: e instanceof Error ? e.message : 'Erro ao processar MRP.',
        tom: 'error',
      });
    } finally {
      setProcessingId(null);
      setBlockingMessage(null);
    }
  };

  const onExcluir = async (run: MrpRun) => {
    setDeletingId(run.id);
    setBlockingMessage(`Excluindo "${run.nome}"...`);
    try {
      await deleteMrpRun(run.id);
      setFeedbackModal({
        titulo: 'MRP excluído',
        mensagem: 'MRP excluído com sucesso.',
        tom: 'success',
      });
      await loadRuns();
    } catch (e) {
      setFeedbackModal({
        titulo: 'Erro ao excluir MRP',
        mensagem: e instanceof Error ? e.message : 'Erro ao excluir MRP.',
        tom: 'error',
      });
    } finally {
      setDeletingId(null);
      setBlockingMessage(null);
    }
  };

  const solicitarProcessamento = (run: MrpRun) => {
    const scenarioTxt =
      run.scenario_type === 'SIMULADO'
        ? `Simulado${run.scenario_file_name ? ` com arquivo: ${run.scenario_file_name}` : ''}`
        : 'Real';
    setConfirmacao({
      tipo: 'processar',
      run,
      titulo: 'Processar MRP',
      mensagem: `Deseja processar o MRP "${run.nome}"?`,
      detalhe: `O cálculo será realizado com base no cenário ${scenarioTxt}. Esta ação irá gerar um snapshot do MRP que ficará salvo no histórico.`,
      confirmarLabel: 'Processar',
      tom: 'amber',
    });
  };

  const solicitarExclusao = (run: MrpRun) => {
    setConfirmacao({
      tipo: 'excluir',
      run,
      titulo: 'Excluir MRP',
      mensagem: `Excluir o MRP "${run.nome}" e seu snapshot?`,
      detalhe: 'Esta ação não pode ser desfeita.',
      confirmarLabel: 'Excluir',
      tom: 'red',
    });
  };

  const confirmarAcao = async () => {
    if (!confirmacao) return;
    const { tipo, run } = confirmacao;
    setConfirmacao(null);
    if (tipo === 'processar') {
      await onProcessar(run);
      return;
    }
    await onExcluir(run);
  };

  const baixarModeloImportacao = async () => {
    setBlockingMessage('Gerando modelo com dados atuais...');
    try {
      const result = await listarPedidosExport({});
      const data = Array.isArray(result?.data) ? result.data : [];
      await downloadPedidosXlsx(
        data,
        `modelo_cenario_simulado_mrp_${new Date().toISOString().slice(0, 10)}.xlsx`,
        [],
        { omitMotivoObservacao: true }
      );
      setFeedbackModal({
        titulo: 'Modelo gerado',
        mensagem: `Modelo baixado com ${data.length} linha(s) atuais do Gerenciador de Pedidos.`,
        tom: 'success',
      });
    } catch (e) {
      setFeedbackModal({
        titulo: 'Erro ao gerar modelo',
        mensagem: e instanceof Error ? e.message : 'Erro ao gerar modelo para cenário simulado.',
        tom: 'error',
      });
    } finally {
      setBlockingMessage(null);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Gerenciador de MRPs</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setModalMppOpen(true)}
            className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 px-4 py-2 text-sm font-medium"
          >
            MPP
          </button>
          <button
            type="button"
            onClick={() => setModalNovoOpen(true)}
            className="rounded-lg bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 text-sm font-medium"
          >
            Novo MRP
          </button>
        </div>
      </div>

      {erro && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-4 py-2 text-sm">
          {erro}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 p-4 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50">
        <div className="shrink-0 min-w-[110px]">
          <label className={MRP_MANAGER_FILTER_LABEL_CLASS}>Código</label>
          <input value={filtroCodigo} onChange={(e) => setFiltroCodigo(e.target.value)} placeholder="# ou número" className={MRP_MANAGER_FILTER_INPUT_CLASS} />
        </div>
        <div className="shrink-0 min-w-[135px]">
          <label className={MRP_MANAGER_FILTER_LABEL_CLASS}>Cenário</label>
          <select value={filtroCenario} onChange={(e) => setFiltroCenario(e.target.value)} className={MRP_MANAGER_FILTER_INPUT_CLASS}>
            <option value="">Todos</option>
            <option value="REAL">Real</option>
            <option value="SIMULADO">Simulado</option>
          </select>
        </div>
        <div className="shrink-0 min-w-[150px]">
          <label className={MRP_MANAGER_FILTER_LABEL_CLASS}>Arquivo</label>
          <input value={filtroArquivo} onChange={(e) => setFiltroArquivo(e.target.value)} placeholder="Filtrar..." className={MRP_MANAGER_FILTER_INPUT_CLASS} />
        </div>
        <div className="shrink-0 min-w-[170px]">
          <label className={MRP_MANAGER_FILTER_LABEL_CLASS}>Status</label>
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className={MRP_MANAGER_FILTER_INPUT_CLASS}>
            <option value="">Todos</option>
            <option value="AGUARDANDO_PROCESSAMENTO">Aguardando Processamento</option>
            <option value="PROCESSANDO">Processando</option>
            <option value="PROCESSADO">Processado</option>
            <option value="ERRO">Erro</option>
          </select>
        </div>
        <div className="shrink-0 min-w-[190px]">
          <label className={MRP_MANAGER_FILTER_LABEL_CLASS}>Observação</label>
          <input value={filtroObservacao} onChange={(e) => setFiltroObservacao(e.target.value)} placeholder="Filtrar..." className={MRP_MANAGER_FILTER_INPUT_CLASS} />
        </div>
        <FiltroDatasMRPManagerPopover
          valores={{
            filtroCriacaoIni,
            filtroCriacaoFim,
            filtroProcessamentoIni,
            filtroProcessamentoFim,
          }}
          onChange={(updates) => {
            if (updates.filtroCriacaoIni !== undefined) setFiltroCriacaoIni(updates.filtroCriacaoIni);
            if (updates.filtroCriacaoFim !== undefined) setFiltroCriacaoFim(updates.filtroCriacaoFim);
            if (updates.filtroProcessamentoIni !== undefined) setFiltroProcessamentoIni(updates.filtroProcessamentoIni);
            if (updates.filtroProcessamentoFim !== undefined) setFiltroProcessamentoFim(updates.filtroProcessamentoFim);
          }}
        />
        <button type="button" onClick={limparFiltrosGrade} className={MRP_MANAGER_BTN_PRIMARY_CLASS}>
          Limpar filtros
        </button>
      </div>
      {temFiltrosGrade && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Exibindo {filteredRuns.length} de {runs.length} MRP(s)
        </p>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="px-3 py-2 text-left">Código</th>
                <th className="px-3 py-2 text-left">Data de Criação e usuário</th>
                <th className="px-3 py-2 text-left">Data de processamento e usuário</th>
                <th className="px-3 py-2 text-left">Cenário</th>
                <th className="px-3 py-2 text-left">Arquivo</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Observação</th>
                <th className="px-3 py-2 text-left">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={8}>
                    Carregando...
                  </td>
                </tr>
              ) : runs.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={8}>
                    Nenhum MRP registrado.
                  </td>
                </tr>
              ) : filteredRuns.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={8}>
                    Nenhum MRP encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredRuns.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-3 py-2 whitespace-nowrap">#{r.id}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <p>{formatDateTime(r.created_at)}</p>
                      <p className="text-xs text-slate-500">{r.created_by_login ?? '—'}</p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <p>{formatDateTime(r.processed_at)}</p>
                      <p className="text-xs text-slate-500">{r.processed_by_login ?? '—'}</p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{scenarioLabel(r)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.scenario_file_name ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
                          r.status === 'PROCESSADO'
                            ? 'bg-emerald-100 text-emerald-800'
                            : r.status === 'ERRO'
                              ? 'bg-red-100 text-red-800'
                              : r.status === 'PROCESSANDO'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 min-w-[16rem]">{r.observacoes ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          disabled={r.status !== 'PROCESSADO'}
                          onClick={() => setRunVisualizacaoId(r.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Visualizar
                        </button>
                        {r.status === 'AGUARDANDO_PROCESSAMENTO' || r.status === 'ERRO' ? (
                          <button
                            type="button"
                            onClick={() => solicitarProcessamento(r)}
                            disabled={processingId === r.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {processingId === r.id ? 'Processando...' : 'Processar'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => solicitarExclusao(r)}
                          disabled={deletingId === r.id || r.status === 'PROCESSANDO'}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-slate-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingId === r.id ? 'Excluindo...' : 'Excluir'}
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

      {runVisualizacaoId != null && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-5"
          onClick={() => setRunVisualizacaoId(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative w-[98vw] h-[92vh] max-w-[1800px] rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setRunVisualizacaoId(null)}
              className="absolute right-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
              aria-label="Fechar visualização do MRP"
              title="Fechar"
            >
              ×
            </button>
            <MRPPage runId={runVisualizacaoId} onClose={() => setRunVisualizacaoId(null)} embedded />
          </div>
        </div>
      )}

      {modalMppOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-5"
          onClick={() => setModalMppOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-mpp-title"
        >
          <div
            className="relative w-[98vw] h-[92vh] max-w-[1800px] rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setModalMppOpen(false)}
              className="absolute right-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
              aria-label="Fechar visualização do MPP"
              title="Fechar"
            >
              ×
            </button>
            <div id="modal-mpp-title" className="sr-only">
              MPP
            </div>
            <MPPPage />
          </div>
        </div>
      )}

      {confirmacao && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setConfirmacao(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-confirmacao-mrp-title"
        >
          <div
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 id="modal-confirmacao-mrp-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                {confirmacao.titulo}
              </h2>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{confirmacao.mensagem}</p>
              {confirmacao.detalhe ? (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{confirmacao.detalhe}</p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmacao(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarAcao()}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition ${
                  confirmacao.tom === 'red'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {confirmacao.confirmarLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {feedbackModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setFeedbackModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-feedback-mrp-title"
        >
          <div
            className="w-full max-w-md rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2
                id="modal-feedback-mrp-title"
                className={`text-lg font-semibold ${
                  feedbackModal.tom === 'error'
                    ? 'text-red-700 dark:text-red-300'
                    : feedbackModal.tom === 'success'
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-slate-800 dark:text-slate-100'
                }`}
              >
                {feedbackModal.titulo}
              </h2>
              <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{feedbackModal.mensagem}</p>
            </div>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setFeedbackModal(null)}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {modalNovoOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={fecharModal}>
          <div className="w-full max-w-xl rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Novo MRP</h2>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Observações</label>
              <textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-700 min-h-[70px]"
                placeholder="Opcional"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Data final do horizonte</label>
              <input
                type="date"
                value={horizonteFim}
                onChange={(e) => setHorizonteFim(e.target.value)}
                min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-700 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Esta data será usada para carregar automaticamente o horizonte na grade do MRP.
              </p>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Tipo de cenário</label>
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={scenarioType === 'REAL'}
                    onChange={() => setScenarioType('REAL')}
                  />
                  Calcular com dados reais do sistema
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={scenarioType === 'SIMULADO'}
                    onChange={() => setScenarioType('SIMULADO')}
                  />
                  Importar cenário simulado (.xlsx)
                </label>
              </div>
            </div>

            {scenarioType === 'SIMULADO' && (
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs text-slate-500">Arquivo de cenário (.xlsx)</label>
                  <button
                    type="button"
                    onClick={() => void baixarModeloImportacao()}
                    className="text-xs text-primary-600 hover:underline"
                  >
                    Baixar modelo
                  </button>
                </div>
                <input
                  ref={inputFileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => void onFileChange(e.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  {scenarioFileName
                    ? `${scenarioFileName} — ${scenarioRows.length} linha(s) válidas`
                    : 'Nenhum arquivo selecionado.'}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={fecharModal}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submitNovo()}
                disabled={!canSave || saving}
                className="rounded-lg border border-primary-600 text-primary-700 px-3 py-2 text-sm disabled:opacity-50"
              >
                {saving ? 'Processando...' : 'Processar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {blockingMessage && (
        <div className="fixed inset-0 z-[60] bg-black/55 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-6 py-5 shadow-lg flex items-center gap-3">
            <div className="h-5 w-5 rounded-full border-2 border-primary-200 border-t-primary-600 animate-spin" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{blockingMessage}</p>
          </div>
        </div>
      )}

    </div>
  );
}
