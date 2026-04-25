import { useCallback, useMemo, useState } from 'react';
import estruturaJson from './estruturaDfcArvore.json';
import { rotuloPeriodoCabecalho } from './dfcPeriodos';
import DfcDetalheLancamentosModal from './DfcDetalheLancamentosModal';

export type DfcEstruturaNo = {
  pathKey: string;
  id: number | null;
  nome: string;
  tipo: string;
  macro: string;
  codigo: string;
  children: DfcEstruturaNo[];
};

export type ArvoreContasDfcProps = {
  periodos: string[];
  valoresPorConta: Record<number, Record<string, number>>;
  granularidade: 'dia' | 'mes';
  dataInicio: string;
  dataFim: string;
  idEmpresa?: number;
  loading?: boolean;
  error?: string | null;
  /** Quando true, a grade usa a altura disponível (ex.: modo tela inteira). */
  telaCheia?: boolean;
};

/** Larguras e `left` cumulativo das colunas fixas (px). (Id e Tipo ocultos na grade.) */
const STICKY_COLS = [
  { w: 40, l: 0 },
  { w: 72, l: 40 },
  { w: 220, l: 112 },
  { w: 112, l: 332 },
] as const;
const STICKY_TOTAL_W = STICKY_COLS.reduce((s, c) => s + c.w, 0);

const MACRO_LABEL: Record<string, string> = {
  OPERACIONAL: 'Operacional',
  FINANCIAMENTOS: 'Financiamentos',
  INVESTIMENTOS: 'Investimentos',
  OUTRAS: 'Outras movimentações',
};

const nf = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function chipMacro(macro: string): string {
  const base = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium shrink-0';
  if (macro === 'OPERACIONAL') return `${base} bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100`;
  if (macro === 'INVESTIMENTOS') return `${base} bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100`;
  if (macro === 'FINANCIAMENTOS') return `${base} bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100`;
  if (macro === 'OUTRAS')
    return `${base} bg-amber-100 text-amber-950 dark:bg-amber-900/35 dark:text-amber-100`;
  return `${base} bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-100`;
}

/** Fundo da linha: sintéticas em tons de violeta (agrupamento); analíticas listradas neutras. */
function corFundoLinha(node: DfcEstruturaNo, rowIdx: number): string {
  if (node.tipo === 'S') {
    return rowIdx % 2 === 0
      ? 'bg-violet-100/85 dark:bg-violet-950/50'
      : 'bg-indigo-100/75 dark:bg-indigo-950/45';
  }
  return rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-800/30' : 'bg-slate-50/80 dark:bg-slate-800/50';
}

function isDescendantPath(desc: string, ancestor: string): boolean {
  return desc.startsWith(`${ancestor}/`);
}

function alternarExpansao(expanded: Set<string>, pathKey: string): Set<string> {
  const next = new Set(expanded);
  if (next.has(pathKey)) {
    next.delete(pathKey);
    for (const k of [...next]) {
      if (k !== pathKey && isDescendantPath(k, pathKey)) next.delete(k);
    }
  } else {
    next.add(pathKey);
  }
  return next;
}

function coletarChavesComFilhos(nodes: DfcEstruturaNo[]): string[] {
  const out: string[] = [];
  function w(n: DfcEstruturaNo) {
    if (n.children?.length) {
      out.push(n.pathKey);
      n.children.forEach(w);
    }
  }
  nodes.forEach(w);
  return out;
}

function linhasVisiveis(roots: DfcEstruturaNo[], expanded: Set<string>): { node: DfcEstruturaNo; depth: number }[] {
  const out: { node: DfcEstruturaNo; depth: number }[] = [];
  function walk(n: DfcEstruturaNo, depth: number) {
    out.push({ node: n, depth });
    if (n.children?.length && expanded.has(n.pathKey)) {
      for (const c of n.children) walk(c, depth + 1);
    }
  }
  roots.forEach((r) => walk(r, 0));
  return out;
}

/** IDs analíticos (conta Nomus) sob este nó — para rollup. */
function coletarIdsAnaliticos(node: DfcEstruturaNo): number[] {
  if (node.tipo === 'A' && node.id != null) return [node.id];
  return (node.children ?? []).flatMap(coletarIdsAnaliticos);
}

function montarMapaIdsPorPathKey(roots: DfcEstruturaNo[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  function visit(n: DfcEstruturaNo) {
    map.set(n.pathKey, coletarIdsAnaliticos(n));
    n.children?.forEach(visit);
  }
  roots.forEach(visit);
  return map;
}

function somaPeriodo(
  ids: number[],
  periodo: string,
  valoresPorConta: Record<number, Record<string, number>>
): number {
  let s = 0;
  for (const id of ids) {
    s += valoresPorConta[id]?.[periodo] ?? 0;
  }
  return s;
}

type DetalheLancamentosState = {
  ids: number[];
  periodo: string | undefined;
  titulo: string;
} | null;

export default function ArvoreContasDfc({
  periodos,
  valoresPorConta,
  granularidade,
  dataInicio,
  dataFim,
  idEmpresa = 1,
  loading = false,
  error = null,
  telaCheia = false,
}: ArvoreContasDfcProps) {
  const roots = useMemo(
    () => (estruturaJson as unknown as { roots: DfcEstruturaNo[] }).roots,
    []
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [detalheAberto, setDetalheAberto] = useState<DetalheLancamentosState>(null);

  const abrirDetalhe = useCallback((rawIds: number[], periodo: string | undefined, titulo: string) => {
    const uniq = [...new Set(rawIds.filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
    if (!uniq.length) return;
    setDetalheAberto({ ids: uniq, periodo, titulo });
  }, []);

  const fecharDetalhe = useCallback(() => setDetalheAberto(null), []);

  const todasChavesComFilhos = useMemo(() => coletarChavesComFilhos(roots), [roots]);
  const idsPorPathKey = useMemo(() => montarMapaIdsPorPathKey(roots), [roots]);

  const expandirTudo = useCallback(() => {
    setExpanded(new Set(todasChavesComFilhos));
  }, [todasChavesComFilhos]);

  const recolherTudo = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const visiveis = useMemo(() => linhasVisiveis(roots, expanded), [roots, expanded]);

  const temPivot = periodos.length > 0;

  return (
    <div
      className={`rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden ${
        telaCheia ? 'flex flex-col min-h-0 flex-1 h-full' : ''
      }`}
    >
      <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Estrutura DFC</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Valores por <span className="font-medium">data de baixa</span> no plano{' '}
            <span className="font-medium">idContaFinanceiro</span>: contas a pagar (P + LP por data de lançamento) e
            receitas (R + LR por <span className="font-medium">dataLancamento</span> do lançamento). Regenerar árvore:{' '}
            <code className="text-[10px]">npm run build:dfc-estrutura</code>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {loading ? (
            <span className="text-xs text-slate-500 dark:text-slate-400 animate-pulse">Carregando…</span>
          ) : null}
          <button
            type="button"
            onClick={expandirTudo}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600/80 transition"
          >
            Expandir tudo
          </button>
          <button
            type="button"
            onClick={recolherTudo}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600/80 transition"
          >
            Recolher tudo
          </button>
        </div>
      </div>
      {error ? (
        <div className="shrink-0 px-4 py-2 text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/25 border-b border-amber-200 dark:border-amber-800/50">
          {error}
        </div>
      ) : null}
      {detalheAberto != null ? (
        <DfcDetalheLancamentosModal
          onClose={fecharDetalhe}
          ids={detalheAberto.ids}
          periodo={detalheAberto.periodo}
          titulo={detalheAberto.titulo}
          dataInicio={dataInicio}
          dataFim={dataFim}
          granularidade={granularidade}
          idEmpresa={idEmpresa}
        />
      ) : null}

      <div
        className={
          telaCheia
            ? 'flex-1 min-h-0 overflow-x-auto overflow-y-auto'
            : 'overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto'
        }
      >
        <table className="text-sm border-collapse" style={{ minWidth: temPivot ? STICKY_TOTAL_W + periodos.length * 96 + 120 : STICKY_TOTAL_W }}>
          <thead className="sticky top-0 z-30">
            <tr className="bg-primary-600 text-white text-left shadow-sm">
              <th
                className="py-2.5 px-2 font-semibold sticky z-30 border-r border-primary-500/40 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.15)]"
                style={{ left: STICKY_COLS[0].l, width: STICKY_COLS[0].w, minWidth: STICKY_COLS[0].w }}
                aria-label="Expandir"
              />
              <th
                className="py-2.5 px-2 font-semibold whitespace-nowrap sticky z-30 border-r border-primary-500/40 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.15)]"
                style={{ left: STICKY_COLS[1].l, width: STICKY_COLS[1].w, minWidth: STICKY_COLS[1].w }}
              >
                Cód.
              </th>
              <th
                className="py-2.5 px-2 font-semibold sticky z-30 border-r border-primary-500/40 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.15)]"
                style={{ left: STICKY_COLS[2].l, width: STICKY_COLS[2].w, minWidth: STICKY_COLS[2].w }}
              >
                Nome
              </th>
              <th
                className="py-2.5 px-2 font-semibold whitespace-nowrap sticky z-30 border-r border-primary-500/50 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.2)]"
                style={{ left: STICKY_COLS[3].l, width: STICKY_COLS[3].w, minWidth: STICKY_COLS[3].w }}
              >
                Fluxo
              </th>
              {temPivot
                ? periodos.map((p) => (
                    <th
                      key={p}
                      className="py-2.5 px-2 font-semibold text-right whitespace-nowrap bg-primary-600 min-w-[88px]"
                      title={p}
                    >
                      {rotuloPeriodoCabecalho(p, granularidade)}
                    </th>
                  ))
                : null}
              {temPivot ? (
                <th className="py-2.5 px-2 font-semibold text-right whitespace-nowrap bg-primary-700 min-w-[100px]">
                  Total
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {visiveis.map(({ node, depth }, rowIdx) => {
              const pad = depth * 14;
              const temFilhos = (node.children?.length ?? 0) > 0;
              const aberto = expanded.has(node.pathKey);
              const ids = idsPorPathKey.get(node.pathKey) ?? [];
              const bg = corFundoLinha(node, rowIdx);
              const synth = node.tipo === 'S';
              return (
                <tr
                  key={node.pathKey}
                  className={`border-t border-slate-100 dark:border-slate-700/80 ${bg} ${
                    synth ? 'ring-1 ring-inset ring-violet-300/35 dark:ring-violet-600/25' : ''
                  }`}
                >
                  <td
                    className={`py-1.5 px-1 align-middle sticky z-20 border-r border-slate-200/90 dark:border-slate-600/80 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)] ${bg}`}
                    style={{ left: STICKY_COLS[0].l, width: STICKY_COLS[0].w, minWidth: STICKY_COLS[0].w }}
                  >
                    {temFilhos ? (
                      <button
                        type="button"
                        className="mx-auto flex h-8 w-8 items-center justify-center rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-600/50 transition"
                        aria-expanded={aberto}
                        aria-label={aberto ? 'Recolher' : 'Explodir'}
                        onClick={() => setExpanded((prev) => alternarExpansao(prev, node.pathKey))}
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`transition-transform ${aberto ? 'rotate-90' : ''}`}
                          aria-hidden
                        >
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                      </button>
                    ) : (
                      <span className="block h-8 w-8" aria-hidden />
                    )}
                  </td>
                  <td
                    className={`py-1.5 px-2 text-xs tabular-nums whitespace-nowrap text-slate-600 dark:text-slate-400 align-middle sticky z-20 border-r border-slate-200/90 dark:border-slate-600/80 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)] ${bg}`}
                    style={{ left: STICKY_COLS[1].l, width: STICKY_COLS[1].w, minWidth: STICKY_COLS[1].w }}
                  >
                    {node.codigo || '—'}
                  </td>
                  <td
                    className={`py-1.5 px-2 text-slate-800 dark:text-slate-200 align-middle sticky z-20 border-r border-slate-200/90 dark:border-slate-600/80 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.08)] ${bg} ${
                      ids.length > 0 ? 'cursor-pointer hover:underline decoration-slate-400/60' : ''
                    }`}
                    style={{ left: STICKY_COLS[2].l, width: STICKY_COLS[2].w, minWidth: STICKY_COLS[2].w }}
                    title={ids.length > 0 ? 'Clique para ver lançamentos no período filtrado' : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (ids.length === 0) return;
                      abrirDetalhe(ids, undefined, `${node.nome} · ${dataInicio} → ${dataFim}`);
                    }}
                  >
                    <span className="inline-block" style={{ paddingLeft: pad }}>
                      {node.nome}
                    </span>
                  </td>
                  <td
                    className={`py-1.5 px-2 align-middle sticky z-20 border-r border-slate-300/90 dark:border-slate-500/80 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.12)] ${bg}`}
                    style={{ left: STICKY_COLS[3].l, width: STICKY_COLS[3].w, minWidth: STICKY_COLS[3].w }}
                  >
                    <span className={chipMacro(node.macro)}>{MACRO_LABEL[node.macro] ?? node.macro}</span>
                  </td>
                  {temPivot
                    ? periodos.map((p) => {
                        const v = somaPeriodo(ids, p, valoresPorConta);
                        return (
                          <td
                            key={p}
                            className={`py-1.5 px-2 text-right tabular-nums text-slate-700 dark:text-slate-200 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-600/40 ${bg}`}
                            title="Clique para ver lançamentos deste período"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (ids.length === 0) return;
                              abrirDetalhe(
                                ids,
                                p,
                                `${rotuloPeriodoCabecalho(p, granularidade)} · ${p}`
                              );
                            }}
                          >
                            {nf.format(v)}
                          </td>
                        );
                      })
                    : null}
                  {temPivot ? (
                    <td
                      className={`py-1.5 px-2 text-right tabular-nums font-medium text-slate-800 dark:text-slate-100 cursor-pointer hover:brightness-95 dark:hover:brightness-110 ${
                        synth
                          ? 'bg-violet-200/50 dark:bg-violet-900/35'
                          : 'bg-slate-100/90 dark:bg-slate-700/40'
                      } ${bg}`}
                      title="Clique para ver todos os lançamentos do período filtrado"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (ids.length === 0) return;
                        abrirDetalhe(
                          ids,
                          undefined,
                          `Total · ${dataInicio} → ${dataFim}`
                        );
                      }}
                    >
                      {nf.format(periodos.reduce((s, p) => s + somaPeriodo(ids, p, valoresPorConta), 0))}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
