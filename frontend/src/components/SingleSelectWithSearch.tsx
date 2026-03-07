import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

export interface OptionItem {
  id: number;
  nome: string;
  descricao?: string | null;
}

export interface SingleSelectWithSearchProps {
  label: string;
  placeholder?: string;
  options: OptionItem[];
  value: OptionItem | null;
  onChange: (value: OptionItem | null) => void;
  labelClass: string;
  inputClass: string;
  minWidth?: string;
  /** Se true, limpa a seleção ao clicar no mesmo item. */
  clearable?: boolean;
  /** Quando informado, a busca é feita no servidor; chamado com debounce ao digitar. */
  onSearchChange?: (term: string) => void;
  /** Exibir "Carregando..." na lista enquanto busca no servidor. */
  searchLoading?: boolean;
  /** Altura máxima da área da lista (ex: "180px"). */
  listMaxHeight?: string;
}

const SEARCH_DEBOUNCE_MS = 350;

export default function SingleSelectWithSearch({
  label,
  placeholder = 'Selecione...',
  options,
  value,
  onChange,
  labelClass,
  inputClass,
  minWidth = '260px',
  clearable = true,
  onSearchChange,
  searchLoading = false,
  listMaxHeight = '180px',
}: SingleSelectWithSearchProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputSearchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredOptions = useMemo(() => {
    if (onSearchChange) return options;
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter(
      (o) =>
        (o.nome ?? '').toLowerCase().includes(q) ||
        (o.descricao ?? '').toLowerCase().includes(q)
    );
  }, [options, search, onSearchChange]);

  useEffect(() => {
    if (!onSearchChange) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      onSearchChange(search.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, onSearchChange]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current && target && !ref.current.contains(target)) setOpen(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputSearchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleSelect = (opt: OptionItem) => {
    if (clearable && value?.id === opt.id) {
      onChange(null);
    } else {
      onChange(opt);
    }
    setOpen(false);
  };

  const handleToggleOpen = () => {
    if (open) {
      setOpen(false);
    } else {
      setSearch('');
      setOpen(true);
    }
  };

  const labelText = value ? value.nome : placeholder;

  return (
    <div className="relative" style={{ minWidth }} ref={ref}>
      <label className={labelClass}>{label}</label>
      <button
        type="button"
        onClick={handleToggleOpen}
        className={inputClass + ' w-full text-left flex items-center justify-between gap-2'}
      >
        <span className="truncate">{labelText}</span>
        <span className="text-slate-400 shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-50 mt-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-lg min-w-full max-h-[240px] flex flex-col">
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
          <div className="overflow-y-auto py-1 flex flex-col" style={{ maxHeight: listMaxHeight }}>
            {searchLoading ? (
              <p className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400 text-center">Carregando...</p>
            ) : filteredOptions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Nenhum resultado</p>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={`w-full text-left px-3 py-1.5 text-sm transition ${
                    value?.id === opt.id
                      ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-800 dark:text-primary-200 font-medium'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600'
                  }`}
                >
                  <span className="truncate block">{opt.nome}</span>
                  {opt.descricao && (
                    <span className="text-xs text-slate-500 dark:text-slate-400 truncate block">
                      {opt.descricao}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
