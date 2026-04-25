import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchDfcAgendamentosDetalhe, type DfcAgendamentoDetalheLinha } from '../../../api/financeiro';

const nf = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inputFiltroClass =
  'w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-1.5 text-sm min-w-0';

function fmtDataBr(ymd: string | null): string {
  if (!ymd) return '—';
  const p = ymd.slice(0, 10);
  const [y, m, d] = p.split('-');
  if (y && m && d) return `${d}/${m}/${y}`;
  return ymd;
}

function normalizar(s: string): string {
  return s.trim().toLowerCase();
}

function linhaPassaFiltros(
  row: DfcAgendamentoDetalheLinha,
  codigo: string,
  descricao: string,
  fornecedor: string,
  datas: string
): boolean {
  const c = normalizar(codigo);
  const d = normalizar(descricao);
  const f = normalizar(fornecedor);
  const dt = normalizar(datas);
  if (c && !String(row.id).includes(c)) return false;
  if (d && !(row.descricaoLancamento ?? '').toLowerCase().includes(d)) return false;
  if (f && !(row.nome ?? '').toLowerCase().includes(f)) return false;
  if (dt) {
    const dv = fmtDataBr(row.dataVencimento).toLowerCase();
    const db = fmtDataBr(row.dataBaixa).toLowerCase();
    const rawV = (row.dataVencimento ?? '').toLowerCase();
    const rawB = (row.dataBaixa ?? '').toLowerCase();
    const matchData = dv.includes(dt) || db.includes(dt) || rawV.includes(dt) || rawB.includes(dt);
    if (!matchData) return false;
  }
  return true;
}

export type DfcDetalheLancamentosModalProps = {
  onClose: () => void;
  ids: number[];
  /** `undefined` = todo o intervalo (data início → fim). */
  periodo: string | undefined;
  titulo: string;
  dataInicio: string;
  dataFim: string;
  granularidade: 'dia' | 'mes';
  idEmpresa: number;
};

/**
 * Modal centralizado (montado ao clicar na árvore DFC) — detalhe Nomus, filtros e total reativo aos filtros.
 */
export default function DfcDetalheLancamentosModal({
  onClose,
  ids,
  periodo,
  titulo,
  dataInicio,
  dataFim,
  granularidade,
  idEmpresa,
}: DfcDetalheLancamentosModalProps) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | undefined>();
  const [linhas, setLinhas] = useState<DfcAgendamentoDetalheLinha[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [filtroCodigo, setFiltroCodigo] = useState('');
  const [filtroDescricao, setFiltroDescricao] = useState('');
  const [filtroFornecedor, setFiltroFornecedor] = useState('');
  const [filtroDatas, setFiltroDatas] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const loadId = useRef(0);

  const idList = useMemo(
    () => [...new Set(ids.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b),
    [ids]
  );
  const idListKey = idList.join(',');

  const limparFiltros = useCallback(() => {
    setFiltroCodigo('');
    setFiltroDescricao('');
    setFiltroFornecedor('');
    setFiltroDatas('');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (idList.length === 0) {
      setLoading(false);
      setLinhas([]);
      setErro(undefined);
      setTruncado(false);
      return;
    }

    setFiltroCodigo('');
    setFiltroDescricao('');
    setFiltroFornecedor('');
    setFiltroDatas('');

    loadId.current += 1;
    const myId = loadId.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setErro(undefined);
    setLinhas([]);
    setTruncado(false);

    void fetchDfcAgendamentosDetalhe({
      dataInicio,
      dataFim,
      granularidade,
      ids: idList,
      periodo,
      idEmpresa,
      signal: ac.signal,
    })
      .then((r) => {
        if (myId !== loadId.current) return;
        setLoading(false);
        setLinhas(r.detalhes);
        setTruncado(r.truncado ?? false);
        setErro(r.erro);
      })
      .catch((e: unknown) => {
        if (myId !== loadId.current) return;
        if (e instanceof Error && e.name === 'AbortError') return;
        setLoading(false);
        setLinhas([]);
        setErro(e instanceof Error ? e.message : String(e));
      });

    return () => {
      ac.abort();
      loadId.current += 1;
    };
  }, [dataInicio, dataFim, granularidade, idEmpresa, periodo, idListKey, idList]);

  const linhasOrdenadas = useMemo(() => {
    if (!linhas.length) return [];
    return [...linhas].sort((a, b) => b.valorBaixado - a.valorBaixado);
  }, [linhas]);

  const linhasFiltradas = useMemo(
    () =>
      linhasOrdenadas.filter((row) =>
        linhaPassaFiltros(row, filtroCodigo, filtroDescricao, filtroFornecedor, filtroDatas)
      ),
    [linhasOrdenadas, filtroCodigo, filtroDescricao, filtroFornecedor, filtroDatas]
  );

  const somaFiltrada = useMemo(
    () => linhasFiltradas.reduce((s, r) => s + r.valorBaixado, 0),
    [linhasFiltradas]
  );

  const temFiltro =
    filtroCodigo.trim() ||
    filtroDescricao.trim() ||
    filtroFornecedor.trim() ||
    filtroDatas.trim();

  if (typeof document === 'undefined') return null;

  const mostrarFiltros = !loading && !erro && linhas.length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/50 dark:bg-slate-950/60"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative flex w-full max-w-5xl max-h-[min(92vh,880px)] min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-800 font-sans"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dfc-detalhe-titulo"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-600">
          <div className="min-w-0 pr-2">
            <h2 id="dfc-detalhe-titulo" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Detalhe dos lançamentos
            </h2>
            <p className="mt-0.5 break-words text-sm text-slate-600 dark:text-slate-400">{titulo}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-slate-600 dark:hover:text-slate-100"
            aria-label="Fechar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {mostrarFiltros ? (
          <div className="shrink-0 space-y-2 border-b border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-900/35 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Filtrar neste recorte</span>
              <div className="flex items-center gap-2">
                {temFiltro ? (
                  <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {linhasFiltradas.length} de {linhasOrdenadas.length}
                  </span>
                ) : null}
                {temFiltro ? (
                  <button
                    type="button"
                    onClick={limparFiltros}
                    className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    Limpar filtros
                  </button>
                ) : null}
              </div>
            </div>
            <div className="flex min-w-0 flex-nowrap items-end gap-2 overflow-x-auto pb-0.5 [scrollbar-gutter:stable]">
              <label className="flex w-[6.5rem] shrink-0 flex-col gap-0.5">
                <span className="whitespace-nowrap text-xs font-medium text-slate-600 dark:text-slate-400">Código</span>
                <input
                  type="search"
                  value={filtroCodigo}
                  onChange={(e) => setFiltroCodigo(e.target.value)}
                  placeholder="Ex.: 301124"
                  className={inputFiltroClass}
                  autoComplete="off"
                />
              </label>
              <label className="flex w-[9.5rem] shrink-0 flex-col gap-0.5" title="Vencimento ou data de baixa (ex.: 15/01 ou 2026-01)">
                <span className="whitespace-nowrap text-xs font-medium text-slate-600 dark:text-slate-400">Datas</span>
                <input
                  type="search"
                  value={filtroDatas}
                  onChange={(e) => setFiltroDatas(e.target.value)}
                  placeholder="Ex.: 15/01"
                  className={inputFiltroClass}
                  autoComplete="off"
                />
              </label>
              <label className="flex min-w-0 flex-1 basis-0 flex-col gap-0.5">
                <span className="whitespace-nowrap text-xs font-medium text-slate-600 dark:text-slate-400">Descrição</span>
                <input
                  type="search"
                  value={filtroDescricao}
                  onChange={(e) => setFiltroDescricao(e.target.value)}
                  placeholder="Contém…"
                  className={inputFiltroClass}
                  autoComplete="off"
                />
              </label>
              <label className="flex min-w-0 flex-1 basis-0 flex-col gap-0.5">
                <span className="whitespace-nowrap text-xs font-medium text-slate-600 dark:text-slate-400">Fornecedor</span>
                <input
                  type="search"
                  value={filtroFornecedor}
                  onChange={(e) => setFiltroFornecedor(e.target.value)}
                  placeholder="Contém…"
                  className={inputFiltroClass}
                  autoComplete="off"
                />
              </label>
            </div>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {loading ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400 animate-pulse">Carregando…</div>
          ) : erro ? (
            <div className="px-4 py-6 text-sm text-amber-800 dark:text-amber-200">{erro}</div>
          ) : linhas.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400">Nenhum lançamento neste recorte.</div>
          ) : (
            <table className="w-full table-fixed border-collapse text-left text-sm min-w-0">
              <colgroup>
                <col style={{ width: '7%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '26%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '13%' }} />
              </colgroup>
              <thead className="sticky top-0 z-[1]">
                <tr className="bg-primary-600 text-left text-white shadow-sm">
                  <th className="px-2 py-2 font-semibold">Código</th>
                  <th className="px-2 py-2 font-semibold">Descrição</th>
                  <th className="px-2 py-2 font-semibold">Fornecedor</th>
                  <th className="px-2 py-2 font-semibold leading-tight">Data Vencimento</th>
                  <th className="px-2 py-2 font-semibold leading-tight">Data Baixa</th>
                  <th className="px-2 py-2 text-right font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhasFiltradas.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="border-t border-slate-100 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700/80 dark:text-slate-400"
                    >
                      Nenhum lançamento corresponde aos filtros.
                    </td>
                  </tr>
                ) : (
                  linhasFiltradas.map((row, idx) => (
                    <tr
                      key={`${row.id}-${row.dataBaixa ?? ''}-${idx}`}
                      className="border-t border-slate-100 odd:bg-white even:bg-slate-50/90 dark:border-slate-700/80 dark:odd:bg-slate-800/30 dark:even:bg-slate-800/55"
                    >
                      <td className="px-2 py-1.5 align-top tabular-nums text-slate-700 dark:text-slate-300">{row.id}</td>
                      <td className="hyphens-auto min-w-0 break-words px-2 py-1.5 align-top text-slate-800 dark:text-slate-200">
                        {row.descricaoLancamento ?? '—'}
                      </td>
                      <td className="hyphens-auto min-w-0 break-words px-2 py-1.5 align-top text-slate-700 dark:text-slate-300">
                        {row.nome ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 align-top tabular-nums text-slate-600 dark:text-slate-400">
                        {fmtDataBr(row.dataVencimento)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 align-top tabular-nums text-slate-600 dark:text-slate-400">
                        {fmtDataBr(row.dataBaixa)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right align-top tabular-nums font-medium text-slate-900 dark:text-slate-100">
                        {nf.format(row.valorBaixado)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {!loading && !erro && linhas.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-primary-700/30 bg-primary-600 px-4 py-2.5 text-sm text-white">
            <span>
              Total{temFiltro ? ' (filtrado)' : ''}
            </span>
            <span className="font-semibold tabular-nums">{nf.format(somaFiltrada)}</span>
          </div>
        ) : null}

        {truncado && !loading && linhas.length > 0 ? (
          <div className="shrink-0 border-t border-amber-200/80 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-100">
            Lista limitada a 2000 linhas — refine o período ou expanda a árvore.
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
