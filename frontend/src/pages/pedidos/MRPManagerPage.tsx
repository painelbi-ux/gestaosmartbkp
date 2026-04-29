import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createMrpRun,
  deleteMrpRun,
  listMrpRuns,
  processMrpRun,
  type MrpRun,
  type MrpScenarioRowPayload,
  type MrpScenarioType,
} from '../../api/mrp';
import { parsePedidosXlsxForImport } from '../../utils/exportImportPedidos';

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('pt-BR');
}

function scenarioLabel(run: MrpRun): string {
  if (run.scenario_type === 'SIMULADO') {
    return run.scenario_file_name ? `Simulado (${run.scenario_file_name})` : 'Simulado';
  }
  return 'Real';
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

export default function MRPManagerPage() {
  const navigate = useNavigate();
  const inputFileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [runs, setRuns] = useState<MrpRun[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [modalNovoOpen, setModalNovoOpen] = useState(false);
  const [nome, setNome] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [scenarioType, setScenarioType] = useState<MrpScenarioType>('REAL');
  const [scenarioFileName, setScenarioFileName] = useState('');
  const [scenarioRows, setScenarioRows] = useState<MrpScenarioRowPayload[]>([]);

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

  const resetNovo = () => {
    setNome('');
    setObservacoes('');
    setScenarioType('REAL');
    setScenarioFileName('');
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
        }))
        .filter((l) => l.id_pedido && l.previsao_nova);
      setScenarioRows(mapped);
      setScenarioFileName(file.name);
      setToast(`${mapped.length} linha(s) de cenário simulado carregadas.`);
      setTimeout(() => setToast(null), 2500);
    } catch (e) {
      setScenarioRows([]);
      setScenarioFileName('');
      setToast(e instanceof Error ? e.message : 'Erro ao ler arquivo de cenário.');
      setTimeout(() => setToast(null), 3500);
    }
  };

  const canSave = useMemo(() => {
    if (!nome.trim()) return false;
    if (scenarioType === 'SIMULADO' && scenarioRows.length === 0) return false;
    return true;
  }, [nome, scenarioType, scenarioRows.length]);

  const submitNovo = async (processNow: boolean) => {
    if (!canSave) return;
    setSaving(true);
    try {
      await createMrpRun({
        nome: nome.trim(),
        observacoes: observacoes.trim() || undefined,
        scenario_type: scenarioType,
        scenario_file_name: scenarioType === 'SIMULADO' ? scenarioFileName || undefined : undefined,
        scenario_rows: scenarioType === 'SIMULADO' ? scenarioRows : undefined,
        process_now: processNow,
      });
      setToast(processNow ? 'MRP criado e processado.' : 'MRP criado e aguardando processamento.');
      setTimeout(() => setToast(null), 3000);
      fecharModal();
      await loadRuns();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Erro ao criar MRP.');
      setTimeout(() => setToast(null), 3500);
    } finally {
      setSaving(false);
    }
  };

  const onProcessar = async (run: MrpRun) => {
    const scenarioTxt =
      run.scenario_type === 'SIMULADO'
        ? `Simulado${run.scenario_file_name ? ` com arquivo: ${run.scenario_file_name}` : ''}`
        : 'Real';
    const ok = window.confirm(
      `Deseja processar o MRP "${run.nome}"?\n\nO cálculo será realizado com base no cenário ${scenarioTxt}.\nEsta ação irá gerar um snapshot do MRP que ficará salvo no histórico.`
    );
    if (!ok) return;
    setProcessingId(run.id);
    try {
      await processMrpRun(run.id);
      setToast('MRP processado com sucesso.');
      setTimeout(() => setToast(null), 3000);
      await loadRuns();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Erro ao processar MRP.');
      setTimeout(() => setToast(null), 3500);
    } finally {
      setProcessingId(null);
    }
  };

  const onExcluir = async (run: MrpRun) => {
    const ok = window.confirm(`Excluir o MRP "${run.nome}" e seu snapshot? Esta ação não pode ser desfeita.`);
    if (!ok) return;
    setDeletingId(run.id);
    try {
      await deleteMrpRun(run.id);
      setToast('MRP excluído.');
      setTimeout(() => setToast(null), 2500);
      await loadRuns();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Erro ao excluir MRP.');
      setTimeout(() => setToast(null), 3500);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">Gerenciador de MRPs</h1>
        <button
          type="button"
          onClick={() => setModalNovoOpen(true)}
          className="rounded-lg bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 text-sm font-medium"
        >
          Novo MRP
        </button>
      </div>

      {erro && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-4 py-2 text-sm">
          {erro}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">Nome/Descrição</th>
                <th className="px-3 py-2 text-left">Data criação</th>
                <th className="px-3 py-2 text-left">Data processamento</th>
                <th className="px-3 py-2 text-left">Cenário</th>
                <th className="px-3 py-2 text-left">Arquivo</th>
                <th className="px-3 py-2 text-left">Usuário</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={9}>
                    Carregando...
                  </td>
                </tr>
              ) : runs.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-slate-500" colSpan={9}>
                    Nenhum MRP registrado.
                  </td>
                </tr>
              ) : (
                runs.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-3 py-2 whitespace-nowrap">#{r.id}</td>
                    <td className="px-3 py-2 min-w-[18rem]">
                      <p className="font-medium">{r.nome}</p>
                      {r.observacoes ? <p className="text-xs text-slate-500 mt-0.5">{r.observacoes}</p> : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(r.processed_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{scenarioLabel(r)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.scenario_file_name ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.processed_by_login ?? r.created_by_login ?? '—'}</td>
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
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={r.status !== 'PROCESSADO'}
                          onClick={() => navigate(`/pedidos/mrp/${r.id}`)}
                          className="text-primary-600 hover:underline disabled:opacity-40 disabled:no-underline"
                        >
                          Visualizar
                        </button>
                        {r.status === 'AGUARDANDO_PROCESSAMENTO' || r.status === 'ERRO' ? (
                          <button
                            type="button"
                            onClick={() => void onProcessar(r)}
                            disabled={processingId === r.id}
                            className="text-amber-700 hover:underline disabled:opacity-50 disabled:no-underline"
                          >
                            {processingId === r.id ? 'Processando...' : 'Processar'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void onExcluir(r)}
                          disabled={deletingId === r.id || r.status === 'PROCESSANDO'}
                          className="text-red-600 hover:underline disabled:opacity-50 disabled:no-underline"
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

      <p className="text-xs text-slate-500">
        Dashboard atual permanece disponível em <Link className="underline" to="/pedidos/mrp-dashboard">/pedidos/mrp-dashboard</Link>.
      </p>

      {modalNovoOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={fecharModal}>
          <div className="w-full max-w-xl rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Novo MRP</h2>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Nome/Descrição *</label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 bg-white dark:bg-slate-700"
                placeholder='Ex.: MRP Semana 18 - Mai/2026'
              />
            </div>
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
                <label className="block text-xs text-slate-500 mb-1">Arquivo de cenário (.xlsx)</label>
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
                onClick={() => void submitNovo(false)}
                disabled={!canSave || saving}
                className="rounded-lg border border-primary-600 text-primary-700 px-3 py-2 text-sm disabled:opacity-50"
              >
                Salvar e Aguardar
              </button>
              <button
                type="button"
                onClick={() => void submitNovo(true)}
                disabled={!canSave || saving}
                className="rounded-lg bg-primary-600 text-white px-3 py-2 text-sm disabled:opacity-50"
              >
                Salvar e Processar
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-slate-800 text-white px-4 py-2 text-sm shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
