import { useState, useRef, useEffect, useMemo } from 'react';

export interface SelectWithSearchOption {
  value: string;
  label: string;
}

export interface SelectWithSearchProps {
  id?: string;
  label?: string;
  placeholder?: string;
  options: SelectWithSearchOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  labelClass?: string;
  className?: string;
  /** Altura máxima da lista (px). */
  maxListHeight?: number;
}

export default function SelectWithSearch({
  id,
  label,
  placeholder = 'Selecione...',
  options,
  value,
  onChange,
  disabled = false,
  labelClass = 'block text-xs text-slate-500 dark:text-slate-400 mb-1',
  className = 'w-full max-w-md rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50',
  maxListHeight = 280,
}: SelectWithSearchProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputSearchRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter(
      (o) => o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)
    );
  }, [options, search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputSearchRef.current?.focus(), 50);
    }
  }, [open]);

  const handleSelect = (opt: SelectWithSearchOption) => {
    onChange(opt.value);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      {label != null && (
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
      )}
      <button
        type="button"
        id={id}
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={className + ' w-full text-left flex items-center justify-between gap-2'}
      >
        <span className="truncate">{displayLabel}</span>
        <span className="text-slate-400 shrink-0" aria-hidden>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div
          className="absolute z-50 mt-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-lg min-w-full flex flex-col"
          style={{ maxHeight: maxListHeight + 48 }}
        >
          <div className="p-2 border-b border-slate-200 dark:border-slate-600 shrink-0">
            <input
              ref={inputSearchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Pesquisar..."
              className="w-full rounded-md bg-slate-100 dark:bg-slate-600 border border-slate-300 dark:border-slate-500 text-slate-800 dark:text-slate-100 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="overflow-y-auto py-1" style={{ maxHeight: maxListHeight }}>
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Nenhum resultado</p>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-600 transition ${
                    opt.value === value ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-200 font-medium' : ''
                  }`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
