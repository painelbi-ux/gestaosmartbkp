import { useState, useRef, useEffect, useMemo } from 'react';

const SEP = '|';

function parseValue(value: string): string[] {
  if (!value?.trim()) return [];
  return value.split(SEP).filter(Boolean);
}

export interface MultiSelectWithSearchProps {
  label: string;
  placeholder?: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  labelClass: string;
  inputClass: string;
  minWidth?: string;
  /** Ex.: "Rotas" para "N rotas selecionadas" */
  optionLabel?: string;
  /** Display por valor interno (`value`), ex.: código — nome onde `value` é só o id numérico. */
  labelByValue?: Record<string, string>;
  /** z-index do painel dropdown (útil dentro de modais). */
  dropdownZIndex?: number;
}

export default function MultiSelectWithSearch({
  label,
  placeholder = 'Todos',
  options,
  value,
  onChange,
  labelClass,
  inputClass,
  minWidth = '160px',
  optionLabel = 'itens',
  labelByValue,
  dropdownZIndex = 100,
}: MultiSelectWithSearchProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputSearchRef = useRef<HTMLInputElement>(null);
  const selected = parseValue(value);

  const displayFor = useMemo(() => {
    return (opt: string) => labelByValue?.[opt] ?? opt;
  }, [labelByValue]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((o) => {
      const d = labelByValue?.[o] ?? o;
      return d.toLowerCase().includes(q) || o.toLowerCase().includes(q);
    });
  }, [options, search, labelByValue]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    /** Captura para fechar dentro de modais que usam stopPropagation no conteúdo (o bubble não chega ao document). */
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [open]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setTimeout(() => inputSearchRef.current?.focus(), 50);
    }
  }, [open]);

  const toggle = (opt: string) => {
    const set = new Set(selected);
    if (set.has(opt)) set.delete(opt);
    else set.add(opt);
    onChange(Array.from(set).join(SEP));
  };

  const selectAll = () => {
    if (selected.length === filteredOptions.length) {
      const rest = selected.filter((s) => !filteredOptions.includes(s));
      onChange(rest.join(SEP));
    } else {
      const merged = new Set([...selected, ...filteredOptions]);
      onChange(Array.from(merged).join(SEP));
    }
  };

  const labelText =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? displayFor(selected[0])
        : `${selected.length} ${optionLabel}`;

  return (
    <div className="relative" style={{ minWidth }} ref={ref}>
      <label className={labelClass}>{label}</label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={inputClass + ' w-full text-left flex items-center justify-between gap-2'}
      >
        <span className="truncate">{labelText}</span>
        <span className="text-slate-400 shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div
          className="absolute mt-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-lg min-w-full max-h-[280px] flex flex-col"
          style={{ zIndex: dropdownZIndex }}
        >
          <div className="p-2 border-b border-slate-200 dark:border-slate-600 shrink-0">
            <input
              ref={inputSearchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar..."
              className="w-full rounded-md bg-slate-100 dark:bg-slate-600 border border-slate-300 dark:border-slate-500 text-slate-800 dark:text-slate-100 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div className="overflow-y-auto py-1 max-h-[220px]">
            {filteredOptions.length > 0 && (
              <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer text-sm border-b border-slate-100 dark:border-slate-600">
                <input
                  type="checkbox"
                  checked={filteredOptions.every((o) => selected.includes(o))}
                  onChange={selectAll}
                  className="rounded border-slate-400 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-slate-500 dark:text-slate-400 font-medium">Selecionar todos</span>
              </label>
            )}
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Nenhum resultado</p>
            ) : (
              filteredOptions.map((opt) => (
                <label
                  key={opt}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="rounded border-slate-400 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="truncate">{displayFor(opt)}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
