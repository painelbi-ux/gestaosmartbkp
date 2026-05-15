import { useEffect, useMemo, useState } from 'react';
import { obterFiltrosOpcoes, type FiltrosOpcoes } from '../../api/pedidos';
import {
  criarProgramacaoSetorialRegistro,
  getProgramacaoSetorialEstoque,
  getProgramacaoSetorialPlanning,
} from '../../api/programacaoSetorial';
import MultiSelectWithSearch from '../../components/MultiSelectWithSearch';
import { isRecursoPcp } from '../../utils/programacaoSetorialRecursoPcp';

type PlanningRow = {
  idChave: string;
  id: string;
  Observacoes: string;
  PD: string;
  Previsao: string;
  Cliente: string;
  Cod: string;
  'Descricao do produto': string;
  'Setor de Producao': string;
  /** Atributo produto 587; filtro exclusivo do setor "Corte e Dobra" (= PCP). */
  Recurso?: string;
  tipoF?: string;
  'Qtde Pendente Real': number;
  /** Origem do último ajuste de previsão: 'override' (rota específica) ou 'base'. */
  origem_ultimo_ajuste?: 'override' | 'base' | null;
  /** Aviso: overrides em rotas que não aparecem mais para este (PD, item) — carrada migrada. */
  carrada_migrada?: { rota: string; previsao: string }[] | null;
  [key: string]: any;
};

type ProcessedItem = PlanningRow & {
  originalQty: number;
  qtyToProduce: number;
  fulfilledByStock: number;
};

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim();
}

function parsePtBrDateSafe(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date(0);
  const s = String(dateStr).trim();
  // dd/MM/yyyy
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mm = Number(m[2]);
    const y = Number(m[3]);
    const dt = new Date(y, mm - 1, d);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  // yyyy-MM-dd (input type="date")
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) {
    const y = Number(m2[1]);
    const mm = Number(m2[2]);
    const d = Number(m2[3]);
    const dt = new Date(y, mm - 1, d);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? new Date(0) : dt;
}

function isWithinInterval(date: Date, start: Date, end: Date): boolean {
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

/**
 * Não exibir na grade nem oferecer no filtro de setor:
 * setor vazio sem Recurso PCP; "Outros"; "Não considerar na meta".
 */
function linhaExcluidaProgramacaoSetorial(item: ProcessedItem): boolean {
  const setorRaw = String(item['Setor de Producao'] ?? '').trim();
  const setorNorm = normalize(setorRaw);
  if (setorNorm === 'outros') return true;
  if (setorNorm === 'nao considerar na meta') return true;
  if (!setorRaw) {
    if (!isRecursoPcp(item.Recurso ?? item['Recurso'])) return true;
  }
  return false;
}

function snapshotLinha(item: ProcessedItem) {
  return {
    observacoes: item.Observacoes,
    previsao: item.Previsao,
    pd: item.PD,
    cod: item.Cod,
    descricao: item['Descricao do produto'],
    setor: item['Setor de Producao'],
    recurso: item.Recurso,
    tipoF: item.tipoF,
    originalQty: item.originalQty,
    qtyToProduce: item.qtyToProduce,
    fulfilledByStock: item.fulfilledByStock,
  };
}

/** Conflito: mesma carrada (Observações/rota) com tipo Carradas e mais de uma previsão. */
type CarradasConflict = {
  observacoes: string;
  datas: string[];
  itens: { pd: string; previsao: string }[];
};

function dedupeLinhasParaSalvar(items: ProcessedItem[]): ProcessedItem[] {
  const map = new Map<string, ProcessedItem>();
  for (const it of items) {
    const k = `${String(it.idChave ?? it.id)}|${String(it.Observacoes)}|${String(it.Previsao)}|${String(it.Cod)}`;
    if (!map.has(k)) map.set(k, it);
  }
  return [...map.values()];
}

function validarCarradasMesmaDataPorCarrada(items: ProcessedItem[]): CarradasConflict[] {
  const carradas = items.filter((i) => normalize(String(i.tipoF ?? '')) === 'carradas');
  const byObs = new Map<string, ProcessedItem[]>();
  for (const it of carradas) {
    const key = String(it.Observacoes ?? '').trim() || '(sem observação de rota)';
    const list = byObs.get(key) ?? [];
    list.push(it);
    byObs.set(key, list);
  }
  const conflicts: CarradasConflict[] = [];
  for (const [obs, group] of byObs) {
    const datas = new Set(group.map((g) => String(g.Previsao ?? '').trim()).filter(Boolean));
    if (datas.size <= 1) continue;
    const datasSorted = [...datas].sort((a, b) => parsePtBrDateSafe(a).getTime() - parsePtBrDateSafe(b).getTime());
    conflicts.push({
      observacoes: obs,
      datas: datasSorted,
      itens: group.map((g) => ({
        pd: String(g.PD ?? ''),
        previsao: String(g.Previsao ?? ''),
      })),
    });
  }
  return conflicts;
}

export type ProgramacaoSetorialPageProps = {
  /** Chamado após gravar com sucesso no painel principal (lista de programações). */
  onProgramacaoSalva?: () => void;
};

export default function ProgramacaoSetorialPage({ onProgramacaoSalva }: ProgramacaoSetorialPageProps) {
  const [planningData, setPlanningData] = useState<PlanningRow[]>([]);
  const [stockData, setStockData] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState<'planning' | 'fulfilled'>('planning');

  const [selectedSector, setSelectedSector] = useState<string>('Geral');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [showPD, setShowPD] = useState<boolean>(false);

  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasLoadedData, setHasLoadedData] = useState<boolean>(false);
  const [mostrarFaixas, setMostrarFaixas] = useState<boolean>(true);
  const [observacoesParam, setObservacoesParam] = useState<string>('');
  const [loadingParams, setLoadingParams] = useState<boolean>(true);
  const [opcoes, setOpcoes] = useState<FiltrosOpcoes>({
    rotas: [],
    categorias: [],
    status: [],
    metodos: [],
    ufs: [],
    municipios: [],
    formasPagamento: [],
    gruposProduto: [],
    pds: [],
    setores: [],
    vendedores: [],
    clientes: [],
    codigos: [],
  });

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveNome, setSaveNome] = useState('');
  const [saveObservacao, setSaveObservacao] = useState('');
  const [saveSaving, setSaveSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOkMessage, setSaveOkMessage] = useState<string | null>(null);
  const [carradasErroOpen, setCarradasErroOpen] = useState(false);
  const [carradasErroConflicts, setCarradasErroConflicts] = useState<CarradasConflict[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoadingParams(true);
    obterFiltrosOpcoes()
      .then((res) => {
        if (!cancelled) setOpcoes(res);
      })
      .catch(() => {
        if (!cancelled) setOpcoes((prev) => ({ ...prev, rotas: [] }));
      })
      .finally(() => {
        if (!cancelled) setLoadingParams(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCarregarDados() {
    setLoadingData(true);
    setLoadError(null);
    try {
      const [planningRes, estoqueRes] = await Promise.all([
        getProgramacaoSetorialPlanning(observacoesParam),
        getProgramacaoSetorialEstoque(),
      ]);

      setPlanningData(planningRes.data ?? []);
      const map: Record<string, number> = {};
      for (const row of estoqueRes.data ?? []) {
        const saldo = Number(row.saldoSetorFinal ?? 0) || 0;
        if (row.cod) map[row.cod] = saldo;
      }
      setStockData(map);
      setHasLoadedData(true);
      setActiveTab('planning');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLoadError(msg);
      setPlanningData([]);
      setStockData({});
      setHasLoadedData(false);
    } finally {
      setLoadingData(false);
    }
  }

  const processedItems = useMemo(() => {
    if (planningData.length === 0) return [] as ProcessedItem[];

    const sortedPlanning = [...planningData].sort((a, b) => parsePtBrDateSafe(a.Previsao).getTime() - parsePtBrDateSafe(b.Previsao).getTime());
    const stockRemaining = { ...stockData };
    const result: ProcessedItem[] = [];

    for (const item of sortedPlanning) {
      const cod = String(item.Cod || '');
      const requested = Number(item['Qtde Pendente Real'] ?? 0) || 0;
      let available = stockRemaining[cod] || 0;

      let usedFromStock = 0;
      if (available > 0) {
        usedFromStock = Math.min(requested, available);
        stockRemaining[cod] -= usedFromStock;
      }

      const rawQtyToProduce = Math.max(0, requested - usedFromStock);
      const roundedQtyToProduce = Math.ceil(rawQtyToProduce);

      result.push({
        ...item,
        originalQty: requested,
        qtyToProduce: roundedQtyToProduce,
        fulfilledByStock: usedFromStock,
      });
    }

    return result;
  }, [planningData, stockData]);

  const aglutinatedItems = useMemo(() => {
    const groups: Record<string, ProcessedItem> = {};
    for (const item of processedItems) {
      const key = `${item.Observacoes}|${item.Previsao}|${item.Cod}`;
      if (!groups[key]) {
        groups[key] = { ...item };
      } else {
        groups[key].originalQty += item.originalQty;
        groups[key].qtyToProduce += item.qtyToProduce;
        groups[key].fulfilledByStock += item.fulfilledByStock;
        if (item.PD && !String(groups[key].PD || '').includes(item.PD)) {
          groups[key].PD = groups[key].PD ? `${groups[key].PD}, ${item.PD}` : item.PD;
        }
        // Recurso: necessário para o setor "Corte e Dobra" (PCP). Se o primeiro item não tinha PCP, outro da mesma chave pode ter.
        if (isRecursoPcp(item.Recurso)) {
          groups[key].Recurso = item.Recurso;
        } else if (!isRecursoPcp(groups[key].Recurso) && item.Recurso != null && String(item.Recurso).trim() !== '') {
          groups[key].Recurso = item.Recurso;
        }
      }
    }
    return Object.values(groups);
  }, [processedItems]);

  const aglutinatedItemsFiltrados = useMemo(
    () => aglutinatedItems.filter((item) => !linhaExcluidaProgramacaoSetorial(item)),
    [aglutinatedItems],
  );

  const sectors = useMemo(() => {
    const seen = new Set<string>();
    for (const item of planningData) {
      const s = String(item['Setor de Producao'] ?? '').trim();
      if (!s || s === 'undefined') continue;
      const n = normalize(s);
      if (n === 'outros') continue;
      if (n === 'nao considerar na meta') continue;
      seen.add(s);
    }
    const rest = [...seen].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return ['Geral', 'Corte e Dobra', ...rest];
  }, [planningData]);

  const filterByRules = (items: ProcessedItem[], sector: string, start: string, end: string) => {
    let result = items;

    if (start && end) {
      const s = parsePtBrDateSafe(start);
      const e = parsePtBrDateSafe(end);
      result = result.filter((item) => {
        const itemDate = parsePtBrDateSafe(item.Previsao);
        if (itemDate.getTime() === 0) return false;
        return isWithinInterval(itemDate, s, e);
      });
    }

    if (sector !== 'Geral') {
      if (sector === 'Corte e Dobra') {
        result = result.filter((item) => isRecursoPcp(item.Recurso ?? item['Recurso']));
      } else {
        result = result.filter((item) => String(item['Setor de Producao']) === sector);
      }
    }

    return result;
  };

  /** Filtro de setor (e período): apenas a tabela; não restringe o registro salvo. */
  const listaVisual = useMemo(
    () => filterByRules(aglutinatedItemsFiltrados, selectedSector, startDate, endDate),
    [aglutinatedItemsFiltrados, selectedSector, startDate, endDate],
  );

  /** Programação total a gravar: todos os setores, mesmo período (regras como setor "Geral"). */
  const listaParaSalvarBase = useMemo(
    () => filterByRules(aglutinatedItemsFiltrados, 'Geral', startDate, endDate),
    [aglutinatedItemsFiltrados, startDate, endDate],
  );

  const planningList = listaVisual.filter((item) => item.qtyToProduce > 0);
  const fulfilledList = listaVisual.filter((item) => item.fulfilledByStock > 0);

  const planningListParaSalvar = listaParaSalvarBase.filter((item) => item.qtyToProduce > 0);
  const fulfilledListParaSalvar = listaParaSalvarBase.filter((item) => item.fulfilledByStock > 0);

  const podeSalvar = hasLoadedData && (planningListParaSalvar.length > 0 || fulfilledListParaSalvar.length > 0);

  function abrirModalSalvar() {
    setSaveError(null);
    setSaveOkMessage(null);
    setCarradasErroOpen(false);
    setCarradasErroConflicts([]);
    const sugestao = `Programação setorial — ${new Date().toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`;
    setSaveNome(sugestao);
    setSaveObservacao('');
    setSaveModalOpen(true);
  }

  async function confirmarSalvarProgramacao() {
    const nome = saveNome.trim();
    if (!nome) {
      setSaveError('Informe um nome para a programação.');
      return;
    }
    const linhasParaValidar = dedupeLinhasParaSalvar([...planningListParaSalvar, ...fulfilledListParaSalvar]);
    const conflitosCarradas = validarCarradasMesmaDataPorCarrada(linhasParaValidar);
    if (conflitosCarradas.length > 0) {
      setCarradasErroConflicts(conflitosCarradas);
      setCarradasErroOpen(true);
      setSaveModalOpen(false);
      return;
    }
    setSaveSaving(true);
    setSaveError(null);
    try {
      const dadosProgramacao = {
        versao: 1 as const,
        geradoEm: new Date().toISOString(),
        filtros: {
          observacoesParam,
          selectedSector,
          startDate,
          endDate,
          showPD,
        },
        abaAtiva: activeTab,
        linhasProgramacao: planningListParaSalvar.map(snapshotLinha),
        linhasEstoqueAtendido: fulfilledListParaSalvar.map(snapshotLinha),
      };
      await criarProgramacaoSetorialRegistro({
        nome,
        observacao: saveObservacao.trim() || null,
        dadosProgramacao,
      });
      setSaveModalOpen(false);
      setSaveOkMessage('Programação registrada no painel.');
      onProgramacaoSalva?.();
      window.setTimeout(() => setSaveOkMessage(null), 4000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveSaving(false);
    }
  }

  useEffect(() => {
    if (sectors.length > 0 && !sectors.includes(selectedSector)) {
      setSelectedSector('Geral');
    }
  }, [sectors, selectedSector]);

  const labelClass = 'block text-xs text-slate-500 dark:text-slate-400 mb-1';
  const inputClass =
    'w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent';

  /** Mesmo tamanho/estilo dos botões Carregar informações e Salvar programação. */
  const btnAcaoPrimariaClass =
    'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto';

  return (
    <div className="p-6 flex flex-col min-h-0 font-sans">
      {/* Tabs */}
      <div className="mb-4 flex gap-2 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('planning')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
            activeTab === 'planning'
              ? 'bg-primary-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Programação
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('fulfilled')}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
            activeTab === 'fulfilled'
              ? 'bg-primary-600 text-white'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          Estoque Atendido
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
        {saveOkMessage && !mostrarFaixas && (
          <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium order-first sm:order-none">{saveOkMessage}</span>
        )}
        {!mostrarFaixas && (
          <button
            type="button"
            onClick={abrirModalSalvar}
            disabled={!podeSalvar}
            className={btnAcaoPrimariaClass}
            title={!hasLoadedData ? 'Carregue as informações primeiro' : !podeSalvar ? 'Não há linhas para salvar' : 'Registrar no painel de programações'}
          >
            Salvar programação
          </button>
        )}
        <button
          type="button"
          onClick={() => setMostrarFaixas((v) => !v)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition"
          title={mostrarFaixas ? 'Ocultar filtros e parâmetros' : 'Exibir filtros e parâmetros'}
          aria-label={mostrarFaixas ? 'Ocultar filtros e parâmetros' : 'Exibir filtros e parâmetros'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {mostrarFaixas ? (
              <>
                <path d="m18 15-6-6-6 6" />
                <path d="M6 19h12" />
              </>
            ) : (
              <>
                <path d="m6 9 6 6 6-6" />
                <path d="M6 5h12" />
              </>
            )}
          </svg>
          {mostrarFaixas ? 'Ocultar filtros' : 'Exibir filtros'}
        </button>
      </div>

      {/* Modal salvar */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-xl overflow-hidden">
            <div className="bg-primary-700 text-white px-5 py-4 flex items-center justify-between">
              <h3 className="font-semibold">Salvar programação</h3>
              <button
                type="button"
                onClick={() => !saveSaving && setSaveModalOpen(false)}
                className="rounded p-1 hover:bg-white/10"
                aria-label="Fechar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {saveError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>}
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Nome (aparece na tela principal)</span>
                <input
                  type="text"
                  value={saveNome}
                  readOnly
                  aria-readonly="true"
                  tabIndex={-1}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm cursor-default select-all"
                  disabled={saveSaving}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Observação (opcional)</span>
                <textarea
                  value={saveObservacao}
                  onChange={(e) => setSaveObservacao(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm resize-y min-h-[72px]"
                  disabled={saveSaving}
                />
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Será registrada no painel &quot;Programações Setoriais&quot; com os dados da tabela atual (programação e estoque atendido), filtros e parâmetros.
              </p>
              <button
                type="button"
                onClick={() => void confirmarSalvarProgramacao()}
                disabled={saveSaving}
                className="w-full bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saveSaving ? 'Salvando...' : 'Confirmar e registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {carradasErroOpen && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-lg max-h-[85vh] rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-xl overflow-hidden flex flex-col">
            <div className="bg-amber-700 text-white px-5 py-4 flex items-center justify-between shrink-0">
              <h3 className="font-semibold">Datas inconsistentes (Carradas)</h3>
              <button
                type="button"
                onClick={() => setCarradasErroOpen(false)}
                className="rounded p-1 hover:bg-white/10"
                aria-label="Fechar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 text-sm text-slate-700 dark:text-slate-200">
              <p>
                Para pedidos com tipo <strong>Carradas</strong>, todos os itens da mesma carrada (mesma observação de rota) precisam ter a <strong>mesma previsão</strong>. Corrija as datas ou os filtros e salve novamente.
              </p>
              <ul className="space-y-4 list-none">
                {carradasErroConflicts.map((c) => (
                  <li key={c.observacoes} className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-3">
                    <div className="font-semibold text-amber-900 dark:text-amber-200">Carrada: {c.observacoes}</div>
                    <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">Datas encontradas: {c.datas.join(' · ')}</div>
                    <ul className="mt-2 space-y-1.5 text-xs border-t border-amber-200/60 dark:border-amber-800/60 pt-2">
                      {c.itens.map((it, idx) => (
                        <li key={`${it.pd}-${it.previsao}-${idx}`}>
                          PD <span className="font-mono">{it.pd || '—'}</span>
                          {' — '}
                          previsão <span className="font-medium">{it.previsao || '—'}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setCarradasErroOpen(false)}
                className="w-full bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 text-white rounded-lg py-2.5 font-semibold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <>
        {loadError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Erro ao carregar dados: {loadError}
          </div>
        )}
        {mostrarFaixas && (
          <>
            <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 sm:p-5 shadow-sm">
              <div className="mb-4 pb-3 border-b border-slate-100 dark:border-slate-700/80">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 tracking-tight">Seleciona parâmetros</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed max-w-3xl">
                  Defina as <strong className="font-medium text-slate-600 dark:text-slate-300">observações / rotas</strong> para buscar no servidor e clique em{' '}
                  <span className="whitespace-nowrap">Carregar informações</span>. O filtro de setor abaixo atua só na tabela após o carregamento.
                </p>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
                <div className="min-w-0 flex-1 w-full sm:max-w-2xl">
                  <MultiSelectWithSearch
                    label="Observações (rotas)"
                    placeholder={loadingParams ? 'Carregando...' : 'Todas'}
                    options={opcoes.rotas}
                    value={observacoesParam}
                    onChange={setObservacoesParam}
                    labelClass={labelClass}
                    inputClass={inputClass}
                    minWidth="100%"
                    optionLabel="observações"
                  />
                </div>
                <div className="flex shrink-0 w-full sm:w-auto sm:justify-end sm:pb-0.5">
                  <button
                    type="button"
                    onClick={handleCarregarDados}
                    disabled={loadingData || loadingParams}
                    className={`relative overflow-hidden ${btnAcaoPrimariaClass}`}
                  >
                    {loadingData ? 'Carregando dados...' : 'Carregar informações'}
                    {loadingData && <span className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/20 to-transparent" />}
                  </button>
                </div>
              </div>
            </div>

            {loadingData && (
              <div className="mb-4 rounded-xl border border-primary-500/30 bg-gradient-to-r from-primary-900/20 via-slate-900/20 to-primary-900/20 p-5">
                <div className="flex items-center gap-4">
                  <div className="relative h-14 w-14 shrink-0">
                    <span className="absolute inset-0 rounded-full border-4 border-primary-500/20" />
                    <span className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary-500 animate-spin" />
                    <span className="absolute inset-2 rounded-full border-4 border-transparent border-r-cyan-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '900ms' }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-primary-700 dark:text-primary-200">Sincronizando Programação Setorial</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">Buscando planejamento e estoque no servidor com os parâmetros selecionados...</p>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200/70 dark:bg-slate-700 overflow-hidden">
                      <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary-500 to-cyan-400 animate-[pulse_1s_ease-in-out_infinite]" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div
              className={`mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 flex flex-col gap-3 ${loadingData ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                O <strong>setor</strong> escolhido filtra só a tabela. Ao salvar, a programação registrada inclui <strong>todos os setores</strong>, respeitando o período de datas (e as observações usadas ao carregar).
              </p>
              <div className="flex flex-wrap items-end justify-between gap-4 w-full">
              <div className="flex flex-wrap gap-4 items-end min-w-0 flex-1">
                <label className="flex flex-col gap-1 min-w-[240px]">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Setor</span>
                  <select value={selectedSector} onChange={(e) => setSelectedSector(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
                    {sectors.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-center gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Início</span>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                  </label>
                  <span className="text-slate-400 font-bold pb-2">→</span>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Fim</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                  </label>
                </div>

                <div className="flex flex-col gap-1.5 min-w-[200px]">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Exibir Pedidos</span>
                  <div className="flex items-center gap-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showPD}
                      aria-label={showPD ? 'Exibir coluna de pedidos: ativado' : 'Exibir coluna de pedidos: desativado'}
                      onClick={() => setShowPD((v) => !v)}
                      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800 ${
                        showPD ? 'bg-primary-600' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ease-in-out ${
                          showPD ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{showPD ? 'Sim' : 'Não'}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 shrink-0 w-full sm:w-auto sm:ml-auto">
                {saveOkMessage && <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium text-right">{saveOkMessage}</span>}
                <button
                  type="button"
                  onClick={abrirModalSalvar}
                  disabled={!podeSalvar}
                  className={btnAcaoPrimariaClass}
                  title={!hasLoadedData ? 'Carregue as informações primeiro' : !podeSalvar ? 'Não há linhas para salvar' : 'Registrar no painel de programações'}
                >
                  Salvar programação
                </button>
              </div>
              </div>
            </div>
          </>
        )}

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm font-sans">
          {activeTab === 'fulfilled' && (
            <div className="p-4 bg-primary-700/10 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-800 dark:text-slate-100">Atendidos pelo Estoque</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">Itens já abatidos pelo saldo disponível.</p>
              </div>
              <span className="bg-primary-700 text-white px-4 py-2 rounded-lg text-xs font-semibold uppercase">{fulfilledList.length} ITENS</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[900px] font-sans">
              <thead className="bg-primary-600 text-white">
                <tr>
                  <th className="py-3 px-4 font-semibold">Observações</th>
                  <th className="py-3 px-4 font-semibold">Previsão</th>
                  {showPD && <th className="py-3 px-4 font-semibold">PD</th>}
                  <th className="py-3 px-4 font-semibold">Cód</th>
                  <th className="py-3 px-4 font-semibold">Descrição do Produto</th>
                  {activeTab === 'planning' ? (
                    <>
                      <th className="py-3 px-4 font-semibold">Setor</th>
                      <th className="py-3 px-4 font-semibold text-right">A Produzir</th>
                    </>
                  ) : (
                    <>
                      <th className="py-3 px-4 font-semibold text-right">Original</th>
                      <th className="py-3 px-4 font-semibold text-right text-yellow-400">Atendido</th>
                      <th className="py-3 px-4 font-semibold text-right">Pendente</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-700 dark:text-slate-200">
                {(activeTab === 'planning' ? planningList : fulfilledList).length > 0 ? (
                  (activeTab === 'planning' ? planningList : fulfilledList).map((item, i) => (
                    <tr key={i} className="text-sm hover:bg-slate-50 dark:hover:bg-slate-700/40">
                      <td className="p-3 text-slate-700 dark:text-slate-200 max-w-[180px] truncate" title={item.Observacoes}>
                        {item.Observacoes}
                      </td>
                      <td className="p-3 whitespace-nowrap text-slate-700 dark:text-slate-200">
                        <span className="inline-flex items-center gap-1.5">
                          <span>{item.Previsao}</span>
                          {item.origem_ultimo_ajuste === 'override' && (
                            <span
                              className="inline-flex items-center rounded-full bg-slate-200 dark:bg-slate-600 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:text-slate-200"
                              title="Ajuste aplicado apenas nesta rota (override). Outras rotas mantêm a previsão base."
                            >
                              rota
                            </span>
                          )}
                          {Array.isArray(item.carrada_migrada) && item.carrada_migrada.length > 0 && (
                            <span
                              role="img"
                              aria-label="Carrada migrada"
                              title={`Este pedido tem ajustes em rotas que não aparecem mais:\n${item.carrada_migrada!.map((m) => `  • ${m.rota} → ${m.previsao}`).join('\n')}\nRevise a previsão para a nova carrada.`}
                              className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                                <line x1="12" y1="9" x2="12" y2="13" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                              </svg>
                            </span>
                          )}
                        </span>
                      </td>
                      {showPD && <td className="p-3 text-slate-700 dark:text-slate-200">{item.PD}</td>}
                      <td className="p-3 text-slate-700 dark:text-slate-200">{item.Cod}</td>
                      <td className="p-3 text-slate-700 dark:text-slate-200 leading-snug">{item['Descricao do produto']}</td>
                      {activeTab === 'planning' ? (
                        <>
                          <td className="p-3">
                            <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                              {item['Setor de Producao']}
                            </span>
                          </td>
                          <td className="p-3 text-right tabular-nums text-slate-700 dark:text-slate-200">{item.qtyToProduce}</td>
                        </>
                      ) : (
                        <>
                          <td className="p-3 text-right tabular-nums">{item.originalQty}</td>
                          <td className="p-3 text-right tabular-nums text-slate-700 dark:text-slate-200">{item.fulfilledByStock}</td>
                          <td className="p-3 text-right tabular-nums text-slate-700 dark:text-slate-200">{item.qtyToProduce}</td>
                        </>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={showPD ? 10 : 9} className="px-6 py-24 text-center text-slate-400 text-sm font-medium font-sans opacity-60">
                      {hasLoadedData ? 'Nenhum registro encontrado' : 'Selecione parâmetros e carregue as informações'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </>
    </div>
  );
}

