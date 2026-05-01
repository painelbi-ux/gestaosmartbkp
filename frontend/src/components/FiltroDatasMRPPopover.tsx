import { useState, useRef, useEffect } from 'react';

function CalendarIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

export type FiltroDatasMRPState = {
  filterDataNecessidadeIni: string;
  filterDataNecessidadeFim: string;
  filterDataRupturaIni: string;
  filterDataRupturaFim: string;
  filterHorizonteFim: string;
};

const inputClass =
  'rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent w-full min-w-0';
const labelClass = 'block text-xs text-slate-500 dark:text-slate-400 mb-1.5';

function BlocoDatas({
  titulo,
  dataIni,
  dataFim,
  onDataIniChange,
  onDataFimChange,
}: {
  titulo: string;
  dataIni: string;
  dataFim: string;
  onDataIniChange: (v: string) => void;
  onDataFimChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-2.5">
        <CalendarIcon />
        {titulo}
      </p>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <label className={labelClass}>Início</label>
          <input
            type="date"
            value={dataIni}
            onChange={(e) => onDataIniChange(e.target.value)}
            className={inputClass}
          />
        </div>
        <span className="text-slate-400 dark:text-slate-500 text-sm pt-5">→</span>
        <div className="flex-1 min-w-0">
          <label className={labelClass}>Fim</label>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => onDataFimChange(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>
    </div>
  );
}

interface FiltroDatasMRPPopoverProps {
  valores: FiltroDatasMRPState;
  onChange: (updates: Partial<FiltroDatasMRPState>) => void;
  mostrarHorizonte?: boolean;
}

export default function FiltroDatasMRPPopover({ valores, onChange, mostrarHorizonte = true }: FiltroDatasMRPPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const v = valores;
  const temAlgumaData =
    v.filterDataNecessidadeIni ||
    v.filterDataNecessidadeFim ||
    v.filterDataRupturaIni ||
    v.filterDataRupturaFim ||
    (mostrarHorizonte && v.filterHorizonteFim);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition border ${
          temAlgumaData
            ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300'
            : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
        }`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <CalendarIcon />
        Filtrar por datas
        {temAlgumaData && (
          <span className="w-2 h-2 rounded-full bg-primary-500 shrink-0" aria-hidden />
        )}
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 w-[340px] min-w-[320px] rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg p-5"
          role="dialog"
          aria-label="Filtros de data MRP"
        >
          <div className="space-y-5">
            <BlocoDatas
              titulo="Data necessidade"
              dataIni={v.filterDataNecessidadeIni}
              dataFim={v.filterDataNecessidadeFim}
              onDataIniChange={(val) => onChange({ filterDataNecessidadeIni: val })}
              onDataFimChange={(val) => onChange({ filterDataNecessidadeFim: val })}
            />
            <hr className="border-slate-200 dark:border-slate-600" />
            <BlocoDatas
              titulo="Data ruptura"
              dataIni={v.filterDataRupturaIni}
              dataFim={v.filterDataRupturaFim}
              onDataIniChange={(val) => onChange({ filterDataRupturaIni: val })}
              onDataFimChange={(val) => onChange({ filterDataRupturaFim: val })}
            />
            {mostrarHorizonte && (
              <>
                <hr className="border-slate-200 dark:border-slate-600" />
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-2.5">
                    <CalendarIcon />
                    Horizonte de produção
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                    Data final usada ao carregar o horizonte na grade.
                  </p>
                  <label className={labelClass}>Até</label>
                  <input
                    type="date"
                    value={v.filterHorizonteFim}
                    onChange={(e) => onChange({ filterHorizonteFim: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
