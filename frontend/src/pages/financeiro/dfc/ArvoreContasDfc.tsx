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
  idEmpresas?: number[];
  loading?: boolean;
  error?: string | null;
  /** Quando true, a grade usa a altura disponível (ex.: modo tela inteira). */
  telaCheia?: boolean;
  /** Filtra linhas por nome/código/id (substring, em tempo real). Vazio = sem filtro. */
  filtroPlanoContas?: string;
};

/** Larguras e `left` cumulativo das colunas fixas (px). Cód. integrado na coluna Conta. */
const STICKY_COLS = [
  { w: 40, l: 0 },    // chevron
  { w: 260, l: 40 },  // Conta (nome + código prefixado)
  { w: 110, l: 300 }, // Fluxo
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

/** Raízes M0, M1, … (Fluxo Operacional / Financeiro / Investimentos / Outras) — fundo neutro, não azul de grupo. */
function isLinhaRaizFluxoDfc(node: DfcEstruturaNo): boolean {
  return /^M\d+$/.test(node.pathKey);
}

function fundoListraNeutra(rowIdx: number): string {
  return rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-900';
}

/**
 * Fundo da linha: hierarquia clara via tons de cinza.
 * Raízes de fluxo (M0, M1…) = separador escuro; sintéticas = cinza suave; analíticas = branco alternado.
 */
function corFundoLinha(node: DfcEstruturaNo, rowIdx: number): string {
  if (isLinhaRaizFluxoDfc(node)) return 'bg-slate-200 dark:bg-slate-700';
  if (node.tipo === 'S') return 'bg-slate-50 dark:bg-slate-800/70';
  return rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/60 dark:bg-slate-800/40';
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

function normalizarParaBusca(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Só ramos com correspondência em algum descendente; árvore aberta até às folhas que casam. */
function linhasFiltradasPorTexto(
  roots: DfcEstruturaNo[],
  queryRaw: string
): { node: DfcEstruturaNo; depth: number }[] {
  const raw = queryRaw.trim();
  if (!raw) return [];
  const nq = normalizarParaBusca(raw);

  function noCasa(n: DfcEstruturaNo): boolean {
    if (normalizarParaBusca(n.nome).includes(nq)) return true;
    if (normalizarParaBusca(n.codigo || '').includes(nq)) return true;
    if (n.id != null && String(n.id).includes(raw)) return true;
    return false;
  }

  function subarvoreTemCasa(n: DfcEstruturaNo): boolean {
    if (noCasa(n)) return true;
    return (n.children ?? []).some(subarvoreTemCasa);
  }

  const out: { node: DfcEstruturaNo; depth: number }[] = [];
  function walk(n: DfcEstruturaNo, depth: number) {
    if (!subarvoreTemCasa(n)) return;
    out.push({ node: n, depth });
    for (const c of n.children ?? []) walk(c, depth + 1);
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

/** Reatribui `pathKey` em profundidade (M0, M0/0, …) para bater com a ordem atual dos filhos. */
function assignPathKeysRecursive(node: DfcEstruturaNo, base: string): void {
  node.pathKey = base;
  node.children?.forEach((ch, i) => assignPathKeysRecursive(ch, `${base}/${i}`));
}

/**
 * Renomeia os nós "Entradas" e "Saídas" do fluxo operacional para
 * "Entradas operacionais" / "Saídas operacionais" (cores diferenciadas na grade).
 * Suporta a nova estrutura (Entradas/Saídas já no JSON) e a antiga (nós soltos).
 */
function montarRootsParaExibicao(roots: DfcEstruturaNo[]): DfcEstruturaNo[] {
  const cloned = JSON.parse(JSON.stringify(roots)) as DfcEstruturaNo[];
  const opIdx = cloned.findIndex((r) => r.macro === 'OPERACIONAL');
  if (opIdx < 0) {
    cloned.forEach((r, i) => assignPathKeysRecursive(r, `M${i}`));
    return cloned;
  }
  const op = cloned[opIdx];
  const children = op.children ?? [];

  // Nova estrutura: filhos diretos são "Entradas" e "Saídas"
  const nEntradas = children.find((c) => c.nome === 'Entradas');
  const nSaidas = children.find((c) => c.nome === 'Saídas');
  if (nEntradas && nSaidas) {
    nEntradas.nome = 'Entradas operacionais';
    nSaidas.nome = 'Saídas operacionais';
    cloned.forEach((r, i) => assignPathKeysRecursive(r, `M${i}`));
    return cloned;
  }

  // Estrutura legada: filhos diretos eram as categorias de receita/saída
  const nRec = children.find((c) => c.nome === 'Receitas Operacionais');
  const nDev = children.find((c) => c.nome === 'Devoluções');
  const nNao = children.find((c) => c.nome === 'Receitas Não Operacionais');
  if (!nRec || !nDev || !nNao) {
    cloned.forEach((r, i) => assignPathKeysRecursive(r, `M${i}`));
    return cloned;
  }
  const exc = new Set([nRec.pathKey, nDev.pathKey, nNao.pathKey]);
  const saidaChildren = children.filter((c) => !exc.has(c.pathKey));
  op.children = [
    {
      id: null,
      nome: 'Entradas operacionais',
      tipo: 'S',
      macro: 'OPERACIONAL',
      codigo: '',
      pathKey: '',
      children: [
        JSON.parse(JSON.stringify(nRec)) as DfcEstruturaNo,
        JSON.parse(JSON.stringify(nDev)) as DfcEstruturaNo,
        JSON.parse(JSON.stringify(nNao)) as DfcEstruturaNo,
      ],
    },
    {
      id: null,
      nome: 'Saídas operacionais',
      tipo: 'S',
      macro: 'OPERACIONAL',
      codigo: '',
      pathKey: '',
      children: saidaChildren.map((c) => JSON.parse(JSON.stringify(c)) as DfcEstruturaNo),
    },
  ];
  cloned.forEach((r, i) => assignPathKeysRecursive(r, `M${i}`));
  return cloned;
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

type CruzamentoOperacional = {
  opPathKey: string;
  porPeriodoEntradas: number[];
  porPeriodoSaidas: number[];
  fluxoPorPeriodo: number[];
  fluxoTotal: number;
};

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
  idEmpresas = [1, 2],
  loading = false,
  error = null,
  telaCheia = false,
  filtroPlanoContas = '',
}: ArvoreContasDfcProps) {
  const rootsRaw = useMemo(
    () => (estruturaJson as unknown as { roots: DfcEstruturaNo[] }).roots,
    []
  );
  const roots = useMemo(() => montarRootsParaExibicao(rootsRaw), [rootsRaw]);
  const idsPorPathKeyRaw = useMemo(() => montarMapaIdsPorPathKey(rootsRaw), [rootsRaw]);

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

  const filtroAtivo = filtroPlanoContas.trim().length > 0;
  const visiveis = useMemo(() => {
    if (!filtroPlanoContas.trim()) return linhasVisiveis(roots, expanded);
    return linhasFiltradasPorTexto(roots, filtroPlanoContas);
  }, [roots, expanded, filtroPlanoContas]);

  const cruzamentoOperacional = useMemo((): CruzamentoOperacional | null => {
    if (periodos.length === 0) return null;
    const op = rootsRaw.find((r) => r.macro === 'OPERACIONAL');
    if (!op?.children?.length) return null;

    const opEx = roots.find((r) => r.macro === 'OPERACIONAL');
    const base = opEx?.pathKey ?? op.pathKey;

    // Nova estrutura: filhos diretos são "Entradas" e "Saídas"
    const nEntradas = op.children.find((c) => c.nome === 'Entradas');
    const nSaidas = op.children.find((c) => c.nome === 'Saídas');
    if (nEntradas && nSaidas) {
      // DEDUÇÕES DA RECEITA (id=377) são valores positivos no BD que reduzem as entradas
      const nDed = nEntradas.children?.find((c) => c.id === 377);
      const idsEntradasTotal = idsPorPathKeyRaw.get(nEntradas.pathKey) ?? [];
      const idsDeducoes = nDed ? (idsPorPathKeyRaw.get(nDed.pathKey) ?? []) : [];
      const dedSet = new Set(idsDeducoes);
      const idsEntradasLiquidas = idsEntradasTotal.filter((id) => !dedSet.has(id));

      const porPeriodoEntradas = periodos.map(
        (p) =>
          somaPeriodo(idsEntradasLiquidas, p, valoresPorConta) -
          somaPeriodo(idsDeducoes, p, valoresPorConta)
      );

      const idsSaidas = idsPorPathKeyRaw.get(nSaidas.pathKey) ?? [];
      const porPeriodoSaidas = periodos.map((p) => somaPeriodo(idsSaidas, p, valoresPorConta));

      const fluxoPorPeriodo = periodos.map((_, i) => porPeriodoEntradas[i] - porPeriodoSaidas[i]);
      const fluxoTotal = fluxoPorPeriodo.reduce((a, b) => a + b, 0);
      return { opPathKey: base, porPeriodoEntradas, porPeriodoSaidas, fluxoPorPeriodo, fluxoTotal };
    }

    // Estrutura legada
    const nRec = op.children.find((c) => c.nome === 'Receitas Operacionais');
    const nDev = op.children.find((c) => c.nome === 'Devoluções');
    const nNao = op.children.find((c) => c.nome === 'Receitas Não Operacionais');
    if (!nRec || !nDev || !nNao) return null;

    const idsRec = idsPorPathKeyRaw.get(nRec.pathKey) ?? [];
    const idsDev = idsPorPathKeyRaw.get(nDev.pathKey) ?? [];
    const idsNao = idsPorPathKeyRaw.get(nNao.pathKey) ?? [];

    const porPeriodoEntradas = periodos.map(
      (p) =>
        somaPeriodo(idsRec, p, valoresPorConta) -
        somaPeriodo(idsDev, p, valoresPorConta) +
        somaPeriodo(idsNao, p, valoresPorConta)
    );

    const exc = new Set([nRec.pathKey, nDev.pathKey, nNao.pathKey]);
    const saidaChildren = op.children.filter((c) => !exc.has(c.pathKey));
    const porPeriodoSaidas = periodos.map((p) =>
      saidaChildren.reduce((acc, ch) => {
        const idsCh = idsPorPathKeyRaw.get(ch.pathKey) ?? [];
        return acc + somaPeriodo(idsCh, p, valoresPorConta);
      }, 0)
    );

    const fluxoPorPeriodo = periodos.map((_, i) => porPeriodoEntradas[i] - porPeriodoSaidas[i]);
    const fluxoTotal = fluxoPorPeriodo.reduce((a, b) => a + b, 0);
    return { opPathKey: base, porPeriodoEntradas, porPeriodoSaidas, fluxoPorPeriodo, fluxoTotal };
  }, [roots, rootsRaw, idsPorPathKeyRaw, periodos, valoresPorConta]);

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
            Intervalo do filtro por <span className="font-medium">data do lançamento</span> no Nomus (P e receitas R/LR:
            pagamento/recebimento em LF; LP: <span className="font-medium">dataLancamento</span>), bucket diário{' '}
            <span className="font-medium">YYYY-MM-DD</span> vindo do SQL. Regenerar árvore:{' '}
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
            disabled={filtroAtivo}
            title={filtroAtivo ? 'Indisponível enquanto o filtro do plano estiver ativo' : undefined}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600/80 transition disabled:opacity-45 disabled:cursor-not-allowed"
          >
            Expandir tudo
          </button>
          <button
            type="button"
            onClick={recolherTudo}
            disabled={filtroAtivo}
            title={filtroAtivo ? 'Indisponível enquanto o filtro do plano estiver ativo' : undefined}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600/80 transition disabled:opacity-45 disabled:cursor-not-allowed"
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
          idEmpresas={idEmpresas}
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
            <tr className="bg-slate-100 dark:bg-slate-700/90 text-left border-b-2 border-slate-200 dark:border-slate-600">
              <th
                className="py-2.5 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 sticky z-30 border-r border-slate-200 dark:border-slate-600 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)] bg-slate-100 dark:bg-slate-700/90"
                style={{ left: STICKY_COLS[0].l, width: STICKY_COLS[0].w, minWidth: STICKY_COLS[0].w }}
                aria-label="Expandir"
              />
              <th
                className="py-2.5 px-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide sticky z-30 border-r border-slate-200 dark:border-slate-600 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)] bg-slate-100 dark:bg-slate-700/90"
                style={{ left: STICKY_COLS[1].l, width: STICKY_COLS[1].w, minWidth: STICKY_COLS[1].w }}
              >
                Conta
              </th>
              <th
                className="py-2.5 px-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide whitespace-nowrap sticky z-30 border-r border-slate-200 dark:border-slate-600 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.12)] bg-slate-100 dark:bg-slate-700/90"
                style={{ left: STICKY_COLS[2].l, width: STICKY_COLS[2].w, minWidth: STICKY_COLS[2].w }}
              >
                Fluxo
              </th>
              {temPivot
                ? periodos.map((p) => (
                    <th
                      key={p}
                      className="py-2.5 px-2 text-xs font-semibold text-slate-600 dark:text-slate-300 text-right whitespace-nowrap min-w-[88px]"
                      title={p}
                    >
                      {rotuloPeriodoCabecalho(p, granularidade)}
                    </th>
                  ))
                : null}
              {temPivot ? (
                <th className="py-2.5 px-2 text-xs font-semibold text-slate-700 dark:text-slate-200 text-right whitespace-nowrap min-w-[100px] bg-slate-200/60 dark:bg-slate-600/60">
                  Total
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && filtroAtivo ? (
              <tr>
                <td colSpan={temPivot ? 4 + periodos.length : 3} className="py-8 px-4 text-center text-sm text-slate-500 dark:text-slate-400">
                  Nenhuma conta encontrada para «{filtroPlanoContas.trim()}».
                </td>
              </tr>
            ) : null}
            {visiveis.map(({ node, depth }, rowIdx) => {
              const pad = depth * 16;
              const temFilhos = (node.children?.length ?? 0) > 0;
              const aberto = filtroAtivo && temFilhos ? true : expanded.has(node.pathKey);
              const ids = idsPorPathKey.get(node.pathKey) ?? [];
              const bg = corFundoLinha(node, rowIdx);
              const synth = node.tipo === 'S';
              const isRaizFluxoDfc = isLinhaRaizFluxoDfc(node);
              const isRaizOperacional =
                cruzamentoOperacional != null && node.pathKey === cruzamentoOperacional.opPathKey;
              const isResumoEntradasOp =
                cruzamentoOperacional != null && node.nome === 'Entradas operacionais' && node.macro === 'OPERACIONAL';
              const isResumoSaidasOp =
                cruzamentoOperacional != null && node.nome === 'Saídas operacionais' && node.macro === 'OPERACIONAL';
              const isResumoOpFormula = isResumoEntradasOp || isResumoSaidasOp;
              /** Qualquer nó sintético de "Saídas" em qualquer fluxo */
              const isSaidasNode = isResumoSaidasOp || (node.tipo === 'S' && node.nome === 'Saídas');
              return (
                <tr
                  key={node.pathKey}
                  className={`border-t ${isRaizFluxoDfc ? 'border-slate-300 dark:border-slate-600' : 'border-slate-100 dark:border-slate-700/60'} ${bg}`}
                >
                  <td
                    className={`py-2 px-1 align-middle sticky z-20 border-r border-slate-200 dark:border-slate-600 ${bg}`}
                    style={{ left: STICKY_COLS[0].l, width: STICKY_COLS[0].w, minWidth: STICKY_COLS[0].w }}
                  >
                    {temFilhos ? (
                      <button
                        type="button"
                        disabled={filtroAtivo}
                        className="mx-auto flex h-8 w-8 items-center justify-center rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-600/50 transition disabled:opacity-40 disabled:pointer-events-none disabled:hover:bg-transparent"
                        aria-expanded={aberto}
                        aria-label={aberto ? 'Recolher' : 'Explodir'}
                        title={filtroAtivo ? 'Limpe o filtro do plano para expandir ou recolher nós' : undefined}
                        onClick={() => {
                          if (filtroAtivo) return;
                          setExpanded((prev) => alternarExpansao(prev, node.pathKey));
                        }}
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
                    className={`py-2 px-2 align-middle sticky z-20 border-r border-slate-200 dark:border-slate-600 ${bg} ${
                      ids.length > 0 ? 'cursor-pointer' : ''
                    }`}
                    style={{ left: STICKY_COLS[1].l, width: STICKY_COLS[1].w, minWidth: STICKY_COLS[1].w }}
                    title={ids.length > 0 ? 'Clique para ver lançamentos no período filtrado' : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (ids.length === 0) return;
                      abrirDetalhe(ids, undefined, `${node.nome} · ${dataInicio} → ${dataFim}`);
                    }}
                  >
                    <span
                      className={`inline-flex items-baseline gap-1.5 leading-snug ${
                        isRaizFluxoDfc
                          ? 'text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300'
                          : synth
                            ? 'text-sm font-semibold text-slate-800 dark:text-slate-100'
                            : 'text-sm text-slate-700 dark:text-slate-300'
                      } ${ids.length > 0 ? 'hover:underline decoration-slate-400/50' : ''}`}
                      style={{ paddingLeft: pad }}
                    >
                      {node.codigo && !isRaizFluxoDfc && (
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-normal shrink-0 tabular-nums">
                          {node.codigo}
                        </span>
                      )}
                      {node.nome}
                    </span>
                  </td>
                  <td
                    className={`py-2 px-2 align-middle sticky z-20 border-r border-slate-300 dark:border-slate-500 shadow-[4px_0_8px_-2px_rgba(0,0,0,0.06)] ${bg}`}
                    style={{ left: STICKY_COLS[2].l, width: STICKY_COLS[2].w, minWidth: STICKY_COLS[2].w }}
                  >
                    <span className={chipMacro(node.macro)}>{MACRO_LABEL[node.macro] ?? node.macro}</span>
                  </td>
                  {temPivot
                    ? periodos.map((p, i) => {
                        let v: number;
                        if (isRaizOperacional && cruzamentoOperacional) {
                          v = cruzamentoOperacional.fluxoPorPeriodo[i] ?? 0;
                        } else if (isResumoEntradasOp && cruzamentoOperacional) {
                          v = cruzamentoOperacional.porPeriodoEntradas[i] ?? 0;
                        } else if (isResumoSaidasOp && cruzamentoOperacional) {
                          v = cruzamentoOperacional.porPeriodoSaidas[i] ?? 0;
                        } else {
                          v = somaPeriodo(ids, p, valoresPorConta);
                        }
                        const podeDrill = ids.length > 0 && !isRaizOperacional;
                        const alertaSaidas = isSaidasNode && granularidade === 'dia' && v > 150000;
                        const corValor = alertaSaidas
                          ? 'bg-red-600 text-white font-bold'
                          : v < 0
                            ? `text-red-600 dark:text-red-400 ${synth ? 'font-semibold' : ''} ${bg}`
                            : v === 0
                              ? `text-slate-300 dark:text-slate-600 ${bg}`
                              : `${synth ? 'text-slate-800 dark:text-slate-100 font-semibold' : 'text-slate-700 dark:text-slate-200'} ${bg}`;
                        return (
                          <td
                            key={p}
                            className={`py-2 px-2 text-right tabular-nums text-sm ${corValor} ${
                              podeDrill ? 'cursor-pointer hover:brightness-95 dark:hover:brightness-110' : ''
                            }`}
                            title={
                              isRaizOperacional
                                ? 'Resumo: entradas operacionais menos saídas operacionais'
                                : isResumoEntradasOp
                                  ? 'Fórmula: receitas operacionais − devoluções + receitas não operacionais'
                                  : isResumoSaidasOp
                                    ? 'Soma das saídas operacionais (custos, despesas, etc.)'
                                    : 'Clique para ver lançamentos deste período'
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!podeDrill) return;
                              abrirDetalhe(
                                ids,
                                p,
                                `${rotuloPeriodoCabecalho(p, granularidade)} · ${p}`
                              );
                            }}
                          >
                            {v === 0 ? <span className="text-slate-300 dark:text-slate-600">—</span> : nf.format(v)}
                          </td>
                        );
                      })
                    : null}
                  {temPivot ? (() => {
                    const totalSaidas =
                      isResumoSaidasOp && cruzamentoOperacional
                        ? cruzamentoOperacional.porPeriodoSaidas.reduce((a, b) => a + b, 0)
                        : isSaidasNode
                          ? periodos.reduce((s, p) => s + somaPeriodo(ids, p, valoresPorConta), 0)
                          : null;
                    const alertaTotalSaidas =
                      isSaidasNode && granularidade === 'dia' && totalSaidas != null && totalSaidas > 150000;
                    const totalV =
                      isRaizOperacional && cruzamentoOperacional
                        ? cruzamentoOperacional.fluxoTotal
                        : isResumoEntradasOp && cruzamentoOperacional
                          ? cruzamentoOperacional.porPeriodoEntradas.reduce((a, b) => a + b, 0)
                          : isResumoSaidasOp && cruzamentoOperacional
                            ? cruzamentoOperacional.porPeriodoSaidas.reduce((a, b) => a + b, 0)
                            : periodos.reduce((s, p) => s + somaPeriodo(ids, p, valoresPorConta), 0);
                    const corTotal = alertaTotalSaidas
                      ? 'bg-red-600 text-white'
                      : totalV < 0
                        ? 'text-red-600 dark:text-red-400 bg-slate-100 dark:bg-slate-700/80'
                        : totalV === 0
                          ? 'text-slate-300 dark:text-slate-600 bg-slate-100 dark:bg-slate-700/80'
                          : synth
                            ? 'text-slate-900 dark:text-slate-50 bg-slate-100 dark:bg-slate-700/80'
                            : 'text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-700/80';
                    return (
                    <td
                      className={`py-2 px-2 text-right tabular-nums text-sm font-semibold ${corTotal} ${
                        isRaizOperacional
                          ? ''
                          : ids.length > 0
                            ? 'cursor-pointer hover:brightness-95 dark:hover:brightness-110'
                            : ''
                      }`}
                      title={
                        isRaizOperacional
                          ? 'Total do período: entradas operacionais menos saídas operacionais'
                          : isResumoOpFormula && cruzamentoOperacional
                            ? isResumoEntradasOp
                              ? 'Total: fórmula de entradas operacionais'
                              : 'Total: soma das saídas operacionais'
                            : 'Clique para ver todos os lançamentos do período filtrado'
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isRaizOperacional || ids.length === 0) return;
                        abrirDetalhe(
                          ids,
                          undefined,
                          `Total · ${dataInicio} → ${dataFim}`
                        );
                      }}
                    >
                      {totalV === 0
                        ? <span className="text-slate-300 dark:text-slate-600">—</span>
                        : nf.format(totalV)}
                    </td>
                  );
                  })() : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
