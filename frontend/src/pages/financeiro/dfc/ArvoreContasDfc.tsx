import { useCallback, useMemo, useState } from 'react';
import estruturaJson from './estruturaDfcArvore.json';

export type DfcEstruturaNo = {
  pathKey: string;
  id: number | null;
  nome: string;
  tipo: string;
  macro: string;
  codigo: string;
  children: DfcEstruturaNo[];
};

const MACRO_LABEL: Record<string, string> = {
  OPERACIONAL: 'Operacional',
  FINANCIAMENTOS: 'Financiamentos',
  INVESTIMENTOS: 'Investimentos',
};

function chipMacro(macro: string): string {
  const base = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium shrink-0';
  if (macro === 'OPERACIONAL') return `${base} bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100`;
  if (macro === 'INVESTIMENTOS') return `${base} bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100`;
  if (macro === 'FINANCIAMENTOS') return `${base} bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100`;
  return `${base} bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-100`;
}

function chipTipo(tipo: string): string {
  const base = 'inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tabular-nums';
  if (tipo === 'S') return `${base} bg-amber-100 text-amber-900 dark:bg-amber-900/35 dark:text-amber-100`;
  return `${base} bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200`;
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

export default function ArvoreContasDfc() {
  const roots = useMemo(() => (estruturaJson as { roots: DfcEstruturaNo[] }).roots, []);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const todasChavesComFilhos = useMemo(() => coletarChavesComFilhos(roots), [roots]);

  const expandirTudo = useCallback(() => {
    setExpanded(new Set(todasChavesComFilhos));
  }, [todasChavesComFilhos]);

  const recolherTudo = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const visiveis = useMemo(() => linhasVisiveis(roots, expanded), [roots, expanded]);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Estrutura DFC</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Sintética (S) e analítica (A), conforme planilha. Regenerar:{' '}
            <code className="text-[10px]">npm run build:dfc-estrutura</code>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
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
      <div className="overflow-x-auto max-h-[min(70vh,720px)] overflow-y-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-primary-600 text-white text-left shadow-sm">
              <th className="py-2.5 px-2 font-semibold w-10" aria-label="Expandir" />
              <th className="py-2.5 px-2 font-semibold whitespace-nowrap">Cód.</th>
              <th className="py-2.5 px-2 font-semibold">Nome</th>
              <th className="py-2.5 px-2 font-semibold whitespace-nowrap">Id</th>
              <th className="py-2.5 px-2 font-semibold whitespace-nowrap">Tipo</th>
              <th className="py-2.5 px-2 font-semibold whitespace-nowrap">Fluxo</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map(({ node, depth }) => {
              const pad = depth * 14;
              const temFilhos = (node.children?.length ?? 0) > 0;
              const aberto = expanded.has(node.pathKey);
              return (
                <tr
                  key={node.pathKey}
                  className="border-t border-slate-100 dark:border-slate-700/80 odd:bg-white even:bg-slate-50/80 dark:odd:bg-slate-800/30 dark:even:bg-slate-800/50"
                >
                  <td className="py-1.5 px-1 align-middle w-10">
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
                  <td className="py-1.5 px-2 font-mono text-xs whitespace-nowrap text-slate-600 dark:text-slate-400 align-middle">
                    {node.codigo || '—'}
                  </td>
                  <td className="py-1.5 px-2 text-slate-800 dark:text-slate-200 align-middle">
                    <span className="inline-block" style={{ paddingLeft: pad }}>
                      {node.nome}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap align-middle">
                    {node.id != null ? node.id : '—'}
                  </td>
                  <td className="py-1.5 px-2 align-middle">
                    <span className={chipTipo(node.tipo)}>{node.tipo}</span>
                  </td>
                  <td className="py-1.5 px-2 align-middle">
                    <span className={chipMacro(node.macro)}>{MACRO_LABEL[node.macro] ?? node.macro}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
