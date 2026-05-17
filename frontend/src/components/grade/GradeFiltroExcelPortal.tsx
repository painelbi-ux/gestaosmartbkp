import { createPortal } from 'react-dom';
import type { ExcelFilterDraft } from '../../hooks/useGradeFiltrosExcel';

type Props = {
  colunaAberta: string;
  rect: { top: number; left: number; width: number };
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  excelFilterDrafts: Record<string, ExcelFilterDraft>;
  setExcelFilterDrafts: React.Dispatch<React.SetStateAction<Record<string, ExcelFilterDraft>>>;
  valoresUnicosPorColuna: Record<string, string[]>;
  onSortAsc: (colId: string) => void;
  onSortDesc: (colId: string) => void;
  onAplicar: (colId: string) => void;
  onCancelar: () => void;
};

export default function GradeFiltroExcelPortal({
  colunaAberta,
  rect,
  dropdownRef,
  excelFilterDrafts,
  setExcelFilterDrafts,
  valoresUnicosPorColuna,
  onSortAsc,
  onSortDesc,
  onAplicar,
  onCancelar,
}: Props) {
  const key = colunaAberta;
  const valores = valoresUnicosPorColuna[key] ?? [];
  const draft = excelFilterDrafts[key] ?? { search: '', selected: valores };
  const visiveis = valores.filter((v) => v.toLowerCase().includes(draft.search.trim().toLowerCase()));
  const todosVisiveisSelecionados = visiveis.length > 0 && visiveis.every((v) => draft.selected.includes(v));

  const toggle = (value: string, checked: boolean) => {
    setExcelFilterDrafts((prev) => {
      const atual = prev[key] ?? { search: '', selected: valores };
      const set = new Set(atual.selected);
      if (checked) set.add(value);
      else set.delete(value);
      return { ...prev, [key]: { ...atual, selected: [...set] } };
    });
  };

  return createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: Math.min(rect.top, window.innerHeight - 380),
        left: Math.max(4, Math.min(rect.left, window.innerWidth - 296)),
        width: rect.width,
        zIndex: 13001,
      }}
      className="rounded-lg border border-slate-300 bg-white p-2 text-slate-800 shadow-2xl dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onSortAsc(key)}
        className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
      >
        A↧ Classificar de A a Z
      </button>
      <button
        type="button"
        onClick={() => onSortDesc(key)}
        className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700"
      >
        Z↧ Classificar de Z a A
      </button>
      <div className="my-2 border-t border-slate-200 dark:border-slate-600" />
      <input
        type="text"
        value={draft.search}
        onChange={(e) =>
          setExcelFilterDrafts((prev) => ({
            ...prev,
            [key]: {
              search: e.target.value,
              selected: prev[key]?.selected ?? valores,
            },
          }))
        }
        placeholder="Pesquisar"
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        autoFocus
      />
      <div className="mt-2 max-h-44 overflow-auto rounded border border-slate-200 p-1 dark:border-slate-600">
        <label className="flex items-center gap-2 px-1 py-1 text-xs font-medium">
          <input
            type="checkbox"
            checked={todosVisiveisSelecionados}
            onChange={(e) => {
              const checked = e.target.checked;
              setExcelFilterDrafts((prev) => {
                const atual = prev[key] ?? { search: '', selected: valores };
                const set = new Set(atual.selected);
                for (const v of visiveis) {
                  if (checked) set.add(v);
                  else set.delete(v);
                }
                return { ...prev, [key]: { ...atual, selected: [...set] } };
              });
            }}
          />
          (Selecionar tudo)
        </label>
        {visiveis.map((value) => (
          <label key={value} className="flex items-center gap-2 px-1 py-0.5 text-xs">
            <input
              type="checkbox"
              checked={draft.selected.includes(value)}
              onChange={(e) => toggle(value, e.target.checked)}
            />
            <span className="truncate" title={value}>
              {value}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => onAplicar(key)}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
        >
          OK
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
        >
          Cancelar
        </button>
      </div>
    </div>,
    document.body
  );
}
