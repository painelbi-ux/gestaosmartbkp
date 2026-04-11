type ProgramacaoImpressaoModalProps = {
  open: boolean;
  onClose: () => void;
  sectors: string[];
  selectedSector: string;
  onSelectedSectorChange: (v: string) => void;
  showPD: boolean;
  onShowPDChange: (v: boolean) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  consolidatedStart: string;
  consolidatedEnd: string;
  onConsolidatedStartChange: (v: string) => void;
  onConsolidatedEndChange: (v: string) => void;
  onConfirm: () => void;
  confirmLabel?: string;
  disabledConfirm?: boolean;
  /** Após a 1ª impressão no painel: períodos não podem ser alterados (reimpressão permitida). */
  datasSomenteLeitura?: boolean;
};

export default function ProgramacaoImpressaoModal({
  open,
  onClose,
  sectors,
  selectedSector,
  onSelectedSectorChange,
  showPD,
  onShowPDChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  consolidatedStart,
  consolidatedEnd,
  onConsolidatedStartChange,
  onConsolidatedEndChange,
  onConfirm,
  confirmLabel = 'Confirmar e Gerar PDF',
  disabledConfirm = false,
  datasSomenteLeitura = false,
}: ProgramacaoImpressaoModalProps) {
  if (!open) return null;

  const dateCls =
    'rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2' +
    (datasSomenteLeitura ? ' opacity-90 cursor-not-allowed bg-slate-100 dark:bg-slate-900/80' : '');

  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center p-4 bg-black/60">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shadow-xl overflow-hidden">
        <div className="bg-primary-700 text-white px-5 py-4 flex items-center justify-between">
          <h3 className="font-semibold">Configuração de Impressão</h3>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-white/10" aria-label="Fechar">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4 text-sm text-slate-800 dark:text-slate-100">
          <label className="block">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Setor</span>
            <select
              value={selectedSector}
              onChange={(e) => onSelectedSectorChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2"
            >
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={showPD} onChange={(e) => onShowPDChange(e.target.checked)} className="w-4 h-4 rounded text-primary-600" />
            <span className="font-medium">Exibir Pedidos</span>
          </label>

          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Período programação (detalhe)</p>
            {datasSomenteLeitura && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
                Estas datas foram fixadas na primeira impressão e não podem ser alteradas. Você pode gerar o PDF novamente com os mesmos períodos.
              </p>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Início</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => onStartDateChange(e.target.value)}
                  disabled={datasSomenteLeitura}
                  readOnly={datasSomenteLeitura}
                  className={dateCls}
                />
              </label>
              <span className="text-slate-400 pb-2">→</span>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Fim</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => onEndDateChange(e.target.value)}
                  disabled={datasSomenteLeitura}
                  readOnly={datasSomenteLeitura}
                  className={dateCls}
                />
              </label>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Período consolidado (totalizador)</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Início</span>
                <input
                  type="date"
                  value={consolidatedStart}
                  onChange={(e) => onConsolidatedStartChange(e.target.value)}
                  disabled={datasSomenteLeitura}
                  readOnly={datasSomenteLeitura}
                  className={dateCls}
                />
              </label>
              <span className="text-slate-400 pb-2">→</span>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-500">Fim</span>
                <input
                  type="date"
                  value={consolidatedEnd}
                  onChange={(e) => onConsolidatedEndChange(e.target.value)}
                  disabled={datasSomenteLeitura}
                  readOnly={datasSomenteLeitura}
                  className={dateCls}
                />
              </label>
            </div>
          </div>

          <button
            type="button"
            onClick={onConfirm}
            disabled={disabledConfirm}
            className="w-full bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-3 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
