import { useCallback, useEffect, useState } from 'react';
import type { TooltipDetalheRow } from '../../api/pedidos';
import type { AjustesQtdeSimulacao } from '../../utils/heatmapRoteiroSimulacao';
import { getQtdePendenteReal } from '../../utils/heatmapRoteiroSimulacao';
import {
  avaliarCommitPendenteConsiderar,
  EDIT_COL_PENDENTE,
  formatQtdeParaInput,
  qtdeConsolidada,
  type CommitPendenteResult,
} from '../../utils/heatmapAjusteCargaGradeUi';

export default function PendenteConsiderarInput({
  exKey,
  row,
  rowIdx,
  municipioChave,
  ajustesQtde,
  excluida,
  onAplicarCommit,
  onNavigateToRow,
}: {
  exKey: string;
  row: TooltipDetalheRow;
  rowIdx: number;
  municipioChave: string;
  ajustesQtde: AjustesQtdeSimulacao;
  excluida: boolean;
  onAplicarCommit: (actions: CommitPendenteResult[]) => void;
  onNavigateToRow: (targetRowIdx: number) => void;
}) {
  const qtdeReal = getQtdePendenteReal(row);
  const qtdeCons = qtdeConsolidada(row, municipioChave, ajustesQtde);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    setDraft(null);
  }, [qtdeCons, excluida, exKey]);

  const commit = useCallback(
    (raw: string) => {
      onAplicarCommit(avaliarCommitPendenteConsiderar(raw, exKey, qtdeReal, excluida));
    },
    [exKey, excluida, onAplicarCommit, qtdeReal]
  );

  const navegarLinha = useCallback(
    (shift: boolean) => {
      const targetIdx = shift ? rowIdx - 1 : rowIdx + 1;
      onNavigateToRow(targetIdx);
    },
    [onNavigateToRow, rowIdx]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        commit(draft ?? formatQtdeParaInput(qtdeCons));
        setDraft(null);
        navegarLinha(e.shiftKey);
      }
    },
    [commit, draft, navegarLinha, qtdeCons]
  );

  const display = draft !== null ? draft : formatQtdeParaInput(qtdeCons);

  return (
    <input
      type="text"
      inputMode="decimal"
      disabled={excluida}
      value={display}
      onFocus={(e) => {
        setDraft(formatQtdeParaInput(qtdeCons));
        e.target.select();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        commit(e.target.value);
        setDraft(null);
      }}
      onKeyDown={handleKeyDown}
      data-editinput
      data-rowkey={exKey}
      data-colkey={EDIT_COL_PENDENTE}
      className="w-full min-w-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-right text-[11px] tabular-nums focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100"
      title="Quantidade considerada nesta carga (Enter/Tab: linha abaixo · Shift+Enter/Tab: linha acima)"
      aria-label="Pendente considerar"
      placeholder="—"
    />
  );
}
