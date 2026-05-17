import { useState, useEffect, Fragment } from 'react';
import type { SortLevel } from '../../hooks/useGradeFiltrosExcel';

export type ColunaClassificavel = { id: string; label: string };

interface ModalClassificarGradeProps {
  open: boolean;
  onClose: () => void;
  colunas: ColunaClassificavel[];
  initialLevels: SortLevel[];
  onApply: (levels: SortLevel[]) => void;
}

export default function ModalClassificarGrade({
  open,
  onClose,
  colunas,
  initialLevels,
  onApply,
}: ModalClassificarGradeProps) {
  const [levels, setLevels] = useState<SortLevel[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setLevels(
        initialLevels.length > 0
          ? initialLevels.map((l) => ({ ...l }))
          : [{ id: colunas[0]?.id ?? '', dir: 'asc' as const }]
      );
      setSelectedIndex(0);
    }
  }, [open, initialLevels, colunas]);

  const adicionarNivel = () => {
    const usados = new Set(levels.map((l) => l.id));
    const proxima = colunas.find((c) => !usados.has(c.id)) ?? colunas[0];
    if (proxima) {
      setLevels((prev) => [...prev, { id: proxima.id, dir: 'asc' }]);
      setSelectedIndex(levels.length);
    }
  };

  const excluirNivel = () => {
    if (levels.length <= 1) return;
    setLevels((prev) => prev.filter((_, i) => i !== selectedIndex));
    setSelectedIndex((prev) => Math.max(0, Math.min(prev, levels.length - 2)));
  };

  const setLevelCol = (index: number, id: string) => {
    setLevels((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, id };
      return next;
    });
  };

  const setLevelDir = (index: number, dir: 'asc' | 'desc') => {
    setLevels((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, dir };
      return next;
    });
  };

  const handleApply = () => {
    const valid = levels.filter((l) => l.id && colunas.some((c) => c.id === l.id));
    const toApply: SortLevel[] =
      valid.length > 0
        ? valid.map((l) => ({ id: String(l.id), dir: l.dir }))
        : [{ id: colunas[0]?.id ?? '', dir: 'asc' }];
    onApply(toApply);
    onClose();
  };

  if (!open || colunas.length === 0) return null;

  const btnClass =
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-sm font-medium';
  const inputClass =
    'w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm min-w-[200px]';

  return (
    <div
      className="fixed inset-0 z-[13000] flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-classificar-grade-title"
    >
      <div
        className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl w-full max-w-2xl min-w-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-600">
          <h2 id="modal-classificar-grade-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Classificar
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={adicionarNivel}
              className={`${btnClass} text-emerald-600 border-emerald-300 dark:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20`}
            >
              <span className="text-lg leading-none">+</span>
              Adicionar nível
            </button>
            <button
              type="button"
              onClick={excluirNivel}
              disabled={levels.length <= 1}
              className={`${btnClass} text-red-600 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50`}
            >
              <span className="text-lg leading-none">×</span>
              Excluir nível
            </button>
          </div>
        </div>

        <div className="px-4 py-3 overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-2 items-center text-sm">
            <span className="font-medium text-slate-500 dark:text-slate-400">Classificar por</span>
            <span className="font-medium text-slate-500 dark:text-slate-400">Ordem</span>
            {levels.map((level, index) => (
              <Fragment key={index}>
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="radio"
                    name="nivel-grade"
                    checked={selectedIndex === index}
                    onChange={() => setSelectedIndex(index)}
                    className="shrink-0 text-primary-600 focus:ring-primary-500"
                  />
                  <select
                    value={level.id}
                    onChange={(e) => setLevelCol(index, e.target.value)}
                    className={`${inputClass} min-w-0`}
                  >
                    {colunas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <select
                    value={level.dir}
                    onChange={(e) => setLevelDir(index, e.target.value as 'asc' | 'desc')}
                    className="w-full max-w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="asc">De A a Z (Crescente)</option>
                    <option value="desc">De Z a A (Decrescente)</option>
                  </select>
                </div>
              </Fragment>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 rounded-b-xl">
          <button type="button" onClick={onClose} className={btnClass}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-lg bg-primary-600 hover:bg-primary-700 px-4 py-2 text-sm font-medium text-white"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}


