import { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
// jspdf-autotable não tem tipagem obrigatória; tratamos como `any`.
import autoTable from 'jspdf-autotable';
import { obterFiltrosOpcoes, type FiltrosOpcoes } from '../../api/pedidos';
import { getProgramacaoSetorialEstoque, getProgramacaoSetorialPlanning } from '../../api/programacaoSetorial';
import MultiSelectWithSearch from '../../components/MultiSelectWithSearch';

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
  'Qtde Pendente Real': number;
  [key: string]: any;
};

type ProcessedItem = PlanningRow & {
  originalQty: number;
  qtyToProduce: number;
  fulfilledByStock: number;
};

const LOGO_URL = 'https://lh3.googleusercontent.com/d/1eKGfnhvBBCoNc1t-HNLFxjpZFV00XL4g';

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

export default function ProgramacaoSetorialPage() {
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

  const [printVersions, setPrintVersions] = useState<Record<string, number>>({});
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  // Modal de impressão
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [consolidatedStart, setConsolidatedStart] = useState<string>('');
  const [consolidatedEnd, setConsolidatedEnd] = useState<string>('');

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = LOGO_URL;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        setLogoBase64(canvas.toDataURL('image/png'));
      }
    };
  }, []);

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
      }
    }
    return Object.values(groups);
  }, [processedItems]);

  const sectors = useMemo(() => {
    const uniqueSectors = Array.from(new Set(planningData.map((item) => String(item['Setor de Producao'] || ''))));
    return ['Geral', 'Corte e Dobra', ...uniqueSectors.filter((s) => s && s !== 'undefined' && s.trim() !== '')];
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
        const excludedSectors = ['Móveis de aço', 'Móveis em melamínico', 'Cadeiras', 'Bebedouros', 'Fogões'].map((s) => normalize(s));
        result = result.filter((item) => {
          const itemSector = normalize(String(item['Setor de Producao'] || ''));
          const itemDesc = normalize(String(item['Descricao do produto'] || ''));
          return !excludedSectors.includes(itemSector) && !itemDesc.includes('estante') && !itemDesc.includes('compensado');
        });
      } else {
        result = result.filter((item) => String(item['Setor de Producao']) === sector);
      }

      const desc = (item: ProcessedItem) => String(item['Descricao do produto'] || '').toLowerCase();
      const sectorNorm = normalize(sector);

      if (sectorNorm === 'outros') {
        result = result.filter((item) => !desc(item).includes('estante'));
      } else if (sectorNorm === 'nao considerar na meta') {
        result = result.filter((item) => !desc(item).includes('coluna para estante') && !desc(item).includes('compensado'));
      } else if (sectorNorm.includes('porta-palete') || sectorNorm.includes('porta palete')) {
        result = result.filter((item) => !desc(item).toUpperCase().startsWith('PORTA PALETE'));
      }
    }

    return result;
  };

  const currentDisplayList = useMemo(() => filterByRules(aglutinatedItems, selectedSector, startDate, endDate), [aglutinatedItems, selectedSector, startDate, endDate]);
  const planningList = currentDisplayList.filter((item) => item.qtyToProduce > 0);
  const fulfilledList = currentDisplayList.filter((item) => item.fulfilledByStock > 0);

  const handlePrint = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const currentSector = selectedSector;
    const currentVersion = (printVersions[currentSector] || 0) + 1;
    setPrintVersions((prev) => ({ ...prev, [currentSector]: currentVersion }));

    const now = new Date();
    const dateStr = now.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    const periodStr = startDate && endDate ? `${startDate} a ${endDate}` : 'Período Completo';
    const consolidatedPeriodStr = consolidatedStart && consolidatedEnd ? `${consolidatedStart} a ${consolidatedEnd}` : 'Período Completo';

    const itemsToPrintMain = planningList;
    const itemsForConsolidatedRaw = filterByRules(aglutinatedItems, selectedSector, consolidatedStart, consolidatedEnd).filter((i) => i.qtyToProduce > 0);

    const consolidatedMap: Record<string, { cod: string; desc: string; total: number }> = {};
    for (const item of itemsForConsolidatedRaw) {
      const cod = String(item.Cod || '');
      if (!consolidatedMap[cod]) consolidatedMap[cod] = { cod, desc: String(item['Descricao do produto'] || ''), total: 0 };
      consolidatedMap[cod].total += item.qtyToProduce;
    }

    const consolidatedFinalList = Object.values(consolidatedMap).sort((a, b) => a.desc.localeCompare(b.desc));
    const grandTotal = consolidatedFinalList.reduce((acc, curr) => acc + curr.total, 0);

    const drawPageHeader = (title: string, subtitle: string) => {
      if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 14, 8, 30, 10);
      }
      doc.setFontSize(14);
      doc.setTextColor(0, 26, 61);
      doc.text(title, 46, 13);
      doc.setFontSize(9);
      doc.text(`Impresso em: ${dateStr} | Versão: V.${currentVersion}`, 46, 18);
      doc.text(subtitle, 46, 22);
    };

    // Página principal
    drawPageHeader(`Programação de Produção - ${currentSector}`, `Período Programação: ${periodStr}`);

    const headers = [['Observações', 'Previsão', 'Cód', 'Descrição do Produto', 'Qtde Real', 'Obs. Produção']];
    if (showPD) headers[0].splice(2, 0, 'PD');

    const body = itemsToPrintMain.map((item) => {
      const row = [
        String(item.Observacoes || ''),
        String(item.Previsao || ''),
        String(item.Cod || ''),
        String(item['Descricao do produto'] || ''),
        String(item.qtyToProduce ?? ''),
        '',
      ];
      if (showPD) row.splice(2, 0, String(item.PD || ''));
      return row;
    });

    const descColIdx = showPD ? 4 : 3;
    const codColIdx = showPD ? 3 : 2;
    const pdColIdx = showPD ? 2 : -1;
    const qtyColIdx = showPD ? 5 : 4;
    const obsProdColIdx = showPD ? 6 : 5;

    autoTable(doc as any, {
      startY: 30,
      head: headers,
      body,
      theme: 'grid',
      headStyles: { fillColor: [0, 26, 61], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9.5, cellPadding: 2, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 20 },
        [codColIdx]: { cellWidth: 22 },
        [descColIdx]: { cellWidth: 'auto' },
        [qtyColIdx]: { cellWidth: 15, halign: 'center' },
        [obsProdColIdx]: { cellWidth: 35 },
        ...(showPD ? { [pdColIdx]: { cellWidth: 18 } } : {}),
      },
    });

    // Consolidação
    doc.addPage();
    drawPageHeader(`CONSOLIDAÇÃO DA PROGRAMAÇÃO - ${currentSector}`, `Resumo Totalizador | Período: ${consolidatedPeriodStr}`);

    const consolidatedHeaders = [['Cód', 'Descrição do Produto', 'Total a Produzir']];
    const consolidatedBody: any[][] = consolidatedFinalList.map((item) => [item.cod, item.desc, item.total.toString()]);
    consolidatedBody.push([
      { content: 'TOTAL GERAL', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 240] } },
      { content: grandTotal.toString(), styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 240] } },
    ]);

    autoTable(doc as any, {
      startY: 28,
      head: consolidatedHeaders,
      body: consolidatedBody,
      theme: 'grid',
      headStyles: { fillColor: [242, 169, 0], textColor: [0, 26, 61], fontStyle: 'bold' },
      styles: { fontSize: 11, cellPadding: 3, overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
      },
    });

    doc.save(`programacao_${currentSector}_V${currentVersion}.pdf`);
    setIsPrintModalOpen(false);
  };

  const labelClass = 'block text-xs text-slate-500 dark:text-slate-400 mb-1';
  const inputClass =
    'w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent';

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

      <div className="mb-3 flex justify-end">
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

      {/* Modal de impressão */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-xl overflow-hidden">
            <div className="bg-primary-700 text-white px-5 py-4 flex items-center justify-between">
              <h3 className="font-semibold">Configuração de Impressão</h3>
              <button type="button" onClick={() => setIsPrintModalOpen(false)} className="rounded p-1 hover:bg-white/10" aria-label="Fechar">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-5">
              <section className="space-y-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Período Programação Normal</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-slate-500">Início</span>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-slate-500">Término</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                  </label>
                </div>
              </section>

              <section className="space-y-2">
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">Período Consolidado (Última Folha)</label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-slate-500">Início</span>
                    <input type="date" value={consolidatedStart} onChange={(e) => setConsolidatedStart(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-slate-500">Término</span>
                    <input type="date" value={consolidatedEnd} onChange={(e) => setConsolidatedEnd(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                  </label>
                </div>
              </section>

              <button type="button" onClick={handlePrint} className="w-full bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-3 font-semibold">
                Confirmar e Gerar PDF
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
            <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Seleciona Parâmetros</p>
              <div className="flex flex-wrap items-end gap-3">
                <MultiSelectWithSearch
                  label="Observações"
                  placeholder={loadingParams ? 'Carregando...' : 'Todas'}
                  options={opcoes.rotas}
                  value={observacoesParam}
                  onChange={setObservacoesParam}
                  labelClass={labelClass}
                  inputClass={inputClass}
                  minWidth="260px"
                  optionLabel="observações"
                />
                <button
                  type="button"
                  onClick={handleCarregarDados}
                  disabled={loadingData || loadingParams}
                  className="relative overflow-hidden inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingData ? 'Carregando dados...' : 'Carregar informações'}
                  {loadingData && <span className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/20 to-transparent" />}
                </button>
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
              className={`mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 flex flex-wrap gap-4 items-end justify-between ${loadingData ? 'opacity-60 pointer-events-none' : ''}`}
            >
              <div className="flex flex-wrap gap-4 items-end">
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
                  <span className="text-slate-400 font-bold">→</span>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Fim</span>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                  </label>
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800">
                  <input type="checkbox" checked={showPD} onChange={(e) => setShowPD(e.target.checked)} className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500" />
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Mostrar PD</span>
                </label>
              </div>

              <button
                type="button"
                onClick={() => {
                  setConsolidatedStart(startDate);
                  setConsolidatedEnd(endDate);
                  setIsPrintModalOpen(true);
                }}
                disabled={!hasLoadedData || planningList.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Imprimir PDF
              </button>
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
                      <td className="p-3 whitespace-nowrap text-slate-700 dark:text-slate-200">{item.Previsao}</td>
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

