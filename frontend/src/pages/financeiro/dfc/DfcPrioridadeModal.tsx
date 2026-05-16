import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DFC_PRIORIDADES,
  DFC_PRIORIDADE_CHIP,
  DFC_PRIORIDADE_LABEL_CURTO,
  aplicarPrioridadeContasLote,
  aplicarPrioridadeLancamentosLote,
  listarPrioridadesConta,
  listarPrioridadesLancamento,
  removerPrioridadeLancamento,
  salvarPrioridadeConta,
  salvarPrioridadeLancamento,
  type DfcPrioridade,
  type DfcPrioridadeContaLinha,
  type DfcPrioridadeLancamentoLinha,
  type DfcTipoRefLancamento,
} from '../../../api/dfcPrioridade';
import {
  fetchDfcDespesasPagamentoEmAberto,
  fetchDfcDespesasPagamentoFornecedorOpcoes,
  type DfcDespesaPagamentoEmAbertoLinha,
} from '../../../api/financeiro';
import MultiSelectWithSearch from '../../../components/MultiSelectWithSearch';
import estruturaJson from './estruturaDfcArvore.json';

type EstruturaNo = {
  pathKey?: string;
  id: number | null;
  nome: string;
  tipo: string;
  macro: string;
  codigo: string;
  children?: EstruturaNo[];
};

interface ContaAnalitica {
  id: number;
  nome: string;
  codigo: string;
  macro: string;
}

const EMPRESAS_PADRAO = [
  { id: 1, label: 'Só Aço' },
  { id: 2, label: 'Só Móveis' },
];

const nfBrl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MS_LABEL_CLASS_PED = 'block text-xs text-slate-500 dark:text-slate-400 mb-1';
const MS_INPUT_CLASS_PED =
  'rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent';

function fmtDataYmdBr(ymd: string | null): string {
  if (!ymd) return '—';
  const p = ymd.slice(0, 10);
  const [y, m, d] = p.split('-');
  if (y && m && d) return `${d}/${m}/${y}`;
  return ymd;
}

function seloSituacaoDespesa(s: DfcDespesaPagamentoEmAbertoLinha['situacao']): JSX.Element {
  if (s === 'vencido') {
    return (
      <span className="inline-flex items-center rounded-md border border-rose-300 bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-800 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-100">
        Vencido
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-sky-300 bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-sky-900 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-100">
      A vencer
    </span>
  );
}

function coletarContasAnaliticas(nodes: EstruturaNo[]): ContaAnalitica[] {
  const out: ContaAnalitica[] = [];
  function walk(n: EstruturaNo) {
    if (n.tipo === 'A' && n.id != null) {
      out.push({ id: n.id, nome: n.nome, codigo: n.codigo, macro: n.macro });
    }
    n.children?.forEach(walk);
  }
  nodes.forEach(walk);
  const seen = new Set<number>();
  return out.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

/** Omitidas só na aba «Classificar Plano de Contas» (códigos assim). Outras abas seguem usando a lista completa. */
const PREFIXOS_OCULTOS_CLASSIFICAR_PLANO_CONTAS = ['1.', '2.', '16.'] as const;

function codigoOcultoNaClassificacaoPlano(codigo: string | undefined | null): boolean {
  const c = String(codigo ?? '').trim();
  if (!c) return false;
  return PREFIXOS_OCULTOS_CLASSIFICAR_PLANO_CONTAS.some((p) => c.startsWith(p));
}

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function chaveContaEmp(idEmpresa: number, idConta: number): string {
  return `${idEmpresa}#${idConta}`;
}

function chaveLanc(idEmpresa: number, tipoRef: DfcTipoRefLancamento, idRef: number): string {
  return `${idEmpresa}#${tipoRef}#${idRef}`;
}

/** Valor interno do multiselect de filtro «Sem prioridade» (efetiva = nem override nem plano). */
const FILTRO_PRIORIDADE_SEM = '__dfc_sem_pri__';

function prioridadePlanoPorRow(row: DfcDespesaPagamentoEmAbertoLinha, mapaContas: Map<string, DfcPrioridadeContaLinha>): DfcPrioridade | null {
  if (row.idContaFinanceiro == null) return null;
  return mapaContas.get(chaveContaEmp(row.idEmpresa, row.idContaFinanceiro))?.prioridade ?? null;
}

export type DfcPrioridadeModalProps = {
  aberto: boolean;
  onClose: () => void;
  /** Intervalo das datas da faixa de filtros da DFC (KPIs «Vencidos / A vencer a pagar»). */
  dataInicio: string;
  dataFim: string;
  /** Empresas atualmente selecionadas no filtro principal da DFC (default das abas). */
  idEmpresas: number[];
  /**
   * Atualização cirúrgica do mapa de prioridade de plano de contas (sem recarregar a DFC).
   * Passe `prioridade = null` para indicar remoção.
   */
  onPrioridadeContaAtualizada?: (
    idEmpresa: number,
    idContaFinanceiro: number,
    prioridade: DfcPrioridade | null,
  ) => void;
  /**
   * Atualização cirúrgica do mapa de prioridade de lançamento (sem recarregar a DFC).
   * Passe `prioridade = null` para indicar remoção.
   */
  onPrioridadeLancAtualizada?: (
    idEmpresa: number,
    tipoRef: DfcTipoRefLancamento,
    idRef: number,
    prioridade: DfcPrioridade | null,
  ) => void;
  /** Rótulo das empresas (1 → "Só Aço", 2 → "Só Móveis"). */
  empresas?: Array<{ id: number; label: string }>;
};

type Aba = 'contas' | 'lancamentos';

export default function DfcPrioridadeModal({
  aberto,
  onClose,
  dataInicio,
  dataFim,
  idEmpresas,
  onPrioridadeContaAtualizada,
  onPrioridadeLancAtualizada,
  empresas = EMPRESAS_PADRAO,
}: DfcPrioridadeModalProps) {
  const [aba, setAba] = useState<Aba>('contas');
  const [contasPrioridade, setContasPrioridade] = useState<DfcPrioridadeContaLinha[]>([]);
  const [lancsPrioridade, setLancsPrioridade] = useState<DfcPrioridadeLancamentoLinha[]>([]);
  const [carregandoContas, setCarregandoContas] = useState(false);
  const [carregandoLancs, setCarregandoLancs] = useState(false);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [linhasSelecionadas, setLinhasSelecionadas] = useState<Set<string>>(new Set());
  const [prioridadeLote, setPrioridadeLote] = useState<DfcPrioridade>(1);
  const [observacaoLote, setObservacaoLote] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** Filtro de empresa local da aba "Classificar Plano de Contas" (padrão = empresas da DFC). */
  const [empresasFiltroContas, setEmpresasFiltroContas] = useState<number[]>([]);
  /** Múltiplas contas: ids numéricos unidos por `|` (componente Gerenciador de Pedidos). */
  const [filtroPipePlanoContas, setFiltroPipePlanoContas] = useState('');
  const [filtroPipeFornecedores, setFiltroPipeFornecedores] = useState('');
  const [filtroPipePrioridades, setFiltroPipePrioridades] = useState('');
  const [empresasFiltroLancs, setEmpresasFiltroLancs] = useState<number[]>([]);
  const [fornecedoresNomeOpcoes, setFornecedoresNomeOpcoes] = useState<string[]>([]);
  const [despesasAberto, setDespesasAberto] = useState<DfcDespesaPagamentoEmAbertoLinha[]>([]);
  const [carregandoDespesas, setCarregandoDespesas] = useState(false);
  const [salvandoPrioridadeChave, setSalvandoPrioridadeChave] = useState<string | null>(null);

  const contasAnaliticas = useMemo(
    () => coletarContasAnaliticas((estruturaJson as unknown as { roots: EstruturaNo[] }).roots),
    []
  );

  const contasAnaliticasClassificarPlano = useMemo(
    () => contasAnaliticas.filter((c) => !codigoOcultoNaClassificacaoPlano(c.codigo)),
    [contasAnaliticas]
  );

  const opcoesContaIdsSorted = useMemo(
    () =>
      [...contasAnaliticas]
        .sort((a, b) => String(a.codigo || a.nome).localeCompare(String(b.codigo || b.nome), 'pt-BR'))
        .map((c) => String(c.id)),
    [contasAnaliticas]
  );

  const labelContaPorId = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of contasAnaliticas) {
      m[String(c.id)] = `${c.codigo ? `${c.codigo} — ` : ''}${c.nome}`;
    }
    return m;
  }, [contasAnaliticas]);

  const opcoesValorFiltroPrioridade = useMemo(
    () => [...DFC_PRIORIDADES.map(String), FILTRO_PRIORIDADE_SEM],
    []
  );

  const labelValorFiltroPrioridade = useMemo(() => {
    const m: Record<string, string> = {
      [FILTRO_PRIORIDADE_SEM]: 'Sem prioridade',
    };
    for (const p of DFC_PRIORIDADES) {
      m[String(p)] = `${p} — ${DFC_PRIORIDADE_LABEL_CURTO[p]}`;
    }
    return m;
  }, []);

  /** Empresas usadas para carregar dados (segue o filtro da DFC ou tudo, se vazio). */
  const empresasUtilizadas = useMemo(
    () => (idEmpresas.length > 0 ? idEmpresas : empresas.map((e) => e.id)),
    [idEmpresas, empresas]
  );

  /** Empresas efetivamente filtradas dentro da aba "contas" (subconjunto do permitido). */
  const empresasFiltroContasEfetivas = useMemo(
    () => (empresasFiltroContas.length > 0 ? empresasFiltroContas : empresasUtilizadas),
    [empresasFiltroContas, empresasUtilizadas]
  );

  /** Empresas efetivamente filtradas na aba de despesas em aberto. */
  const empresasFiltroLancsEfetivas = useMemo(
    () => (empresasFiltroLancs.length > 0 ? empresasFiltroLancs : empresasUtilizadas),
    [empresasFiltroLancs, empresasUtilizadas]
  );

  const labelEmpresa = useCallback(
    (id: number) => empresas.find((e) => e.id === id)?.label ?? `Empresa ${id}`,
    [empresas]
  );

  // Mapa de prioridade atual por (idEmpresa, idConta)
  const mapaContas = useMemo(() => {
    const m = new Map<string, DfcPrioridadeContaLinha>();
    for (const c of contasPrioridade) m.set(chaveContaEmp(c.idEmpresa, c.idContaFinanceiro), c);
    return m;
  }, [contasPrioridade]);

  const mapaLancs = useMemo(() => {
    const m = new Map<string, DfcPrioridadeLancamentoLinha>();
    for (const c of lancsPrioridade) m.set(chaveLanc(c.idEmpresa, c.tipoRef, c.idRef), c);
    return m;
  }, [lancsPrioridade]);

  const recarregarContas = useCallback(async () => {
    setCarregandoContas(true);
    setErro(null);
    const r = await listarPrioridadesConta({ idEmpresas: empresasUtilizadas });
    setCarregandoContas(false);
    if (r.erro) setErro(r.erro);
    else setContasPrioridade(r.linhas);
  }, [empresasUtilizadas]);

  const recarregarLancs = useCallback(async () => {
    setCarregandoLancs(true);
    setErro(null);
    const r = await listarPrioridadesLancamento({ idEmpresas: empresasUtilizadas });
    setCarregandoLancs(false);
    if (r.erro) setErro(r.erro);
    else setLancsPrioridade(r.linhas);
  }, [empresasUtilizadas]);

  const recarregarDespesas = useCallback(async () => {
    setCarregandoDespesas(true);
    setErro(null);
    const idsCf = [
      ...new Set(
        filtroPipePlanoContas
          .split('|')
          .map((s) => Math.trunc(Number(s)))
          .filter((n) => n > 0)
      ),
    ];
    const nomesFf = [
      ...new Set(filtroPipeFornecedores.split('|').map((s) => s.trim()).filter(Boolean)),
    ];
    const r = await fetchDfcDespesasPagamentoEmAberto({
      dataInicio,
      dataFim,
      idEmpresas: empresasFiltroLancsEfetivas,
      idsContaFinanceiro: idsCf.length > 0 ? idsCf : undefined,
      nomesFornecedor: nomesFf.length > 0 ? nomesFf : undefined,
    });
    setCarregandoDespesas(false);
    if (r.erro) setErro(r.erro);
    else setDespesasAberto(r.linhas);
  }, [dataInicio, dataFim, empresasFiltroLancsEfetivas, filtroPipePlanoContas, filtroPipeFornecedores]);

  useEffect(() => {
    if (!aberto || aba !== 'lancamentos') return;
    let cancelled = false;
    void fetchDfcDespesasPagamentoFornecedorOpcoes({
      dataInicio,
      dataFim,
      idEmpresas: empresasFiltroLancsEfetivas,
    }).then((r) => {
      if (cancelled) return;
      if (!r.erro) setFornecedoresNomeOpcoes(Array.isArray(r.nomes) ? r.nomes : []);
    });
    return () => {
      cancelled = true;
    };
  }, [aberto, aba, dataInicio, dataFim, empresasFiltroLancsEfetivas]);

  useEffect(() => {
    if (!aberto) return;
    if (aba === 'contas') void recarregarContas();
  }, [aberto, aba, recarregarContas]);

  useEffect(() => {
    if (!aberto || aba !== 'lancamentos') return;
    void recarregarLancs();
  }, [aberto, aba, recarregarLancs]);

  useEffect(() => {
    if (!aberto || aba !== 'lancamentos') return;
    void recarregarDespesas();
  }, [aberto, aba, recarregarDespesas]);

  useEffect(() => {
    if (!aberto) return;
    setLinhasSelecionadas(new Set());
    setFiltroTexto('');
    setMensagem(null);
    setErro(null);
    setEmpresasFiltroContas([]);
    setEmpresasFiltroLancs([]);
    setFiltroPipePlanoContas('');
    setFiltroPipeFornecedores('');
    setFiltroPipePrioridades('');
    setFornecedoresNomeOpcoes([]);
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aberto, onClose]);

  const linhasContaEmpresa = useMemo(() => {
    const out: Array<{ key: string; conta: ContaAnalitica; idEmpresa: number; prioridadeAtual: DfcPrioridade | null; obs: string | null }> = [];
    const nq = normalizar(filtroTexto);
    for (const conta of contasAnaliticasClassificarPlano) {
      const ehBusca = nq.length === 0;
      const casaBusca =
        ehBusca ||
        normalizar(conta.nome).includes(nq) ||
        normalizar(conta.codigo || '').includes(nq) ||
        String(conta.id).includes(filtroTexto.trim());
      if (!casaBusca) continue;
      for (const idEmp of empresasFiltroContasEfetivas) {
        const k = chaveContaEmp(idEmp, conta.id);
        const m = mapaContas.get(k);
        out.push({
          key: k,
          conta,
          idEmpresa: idEmp,
          prioridadeAtual: m ? (m.prioridade as DfcPrioridade) : null,
          obs: m?.observacao ?? null,
        });
      }
    }
    return out;
  }, [contasAnaliticasClassificarPlano, empresasFiltroContasEfetivas, mapaContas, filtroTexto]);

  const linhasDespesasFiltradas = useMemo(() => {
    const nq = normalizar(filtroTexto);
    const t = filtroTexto.trim();
    const priSel = [
      ...new Set(filtroPipePrioridades.split('|').map((s) => s.trim()).filter(Boolean)),
    ];
    const filtroPrioAtivo = priSel.length > 0;

    function prioridadeEfetiva(row: DfcDespesaPagamentoEmAbertoLinha): DfcPrioridade | null {
      const ov = mapaLancs.get(chaveLanc(row.idEmpresa, 'A', row.id))?.prioridade ?? null;
      if (ov != null) return ov as DfcPrioridade;
      return prioridadePlanoPorRow(row, mapaContas);
    }

    function casaFiltroPrio(row: DfcDespesaPagamentoEmAbertoLinha): boolean {
      if (!filtroPrioAtivo) return true;
      const eff = prioridadeEfetiva(row);
      const chave = eff == null ? FILTRO_PRIORIDADE_SEM : String(eff);
      return priSel.includes(chave);
    }

    return despesasAberto.filter((row) => {
      if (!casaFiltroPrio(row)) return false;
      if (!t) return true;
      return (
        String(row.id).includes(t) ||
        String(row.idEmpresa).includes(t) ||
        (row.nome ? normalizar(row.nome).includes(nq) : false) ||
        (row.descricaoLancamento ? normalizar(row.descricaoLancamento).includes(nq) : false)
      );
    });
  }, [despesasAberto, filtroTexto, filtroPipePrioridades, mapaLancs, mapaContas]);

  const toggleSelecionarLinha = useCallback((key: string) => {
    setLinhasSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSelecionarTodas = useCallback(() => {
    setLinhasSelecionadas((prev) => {
      const todasKeys = linhasContaEmpresa.map((l) => l.key);
      if (prev.size === todasKeys.length) return new Set();
      return new Set(todasKeys);
    });
  }, [linhasContaEmpresa]);

  const aplicarLoteContas = useCallback(
    async (remover: boolean) => {
      if (linhasSelecionadas.size === 0) {
        setErro('Selecione ao menos uma linha.');
        return;
      }
      setErro(null);
      setMensagem(null);
      setSalvando(true);
      const itens = linhasContaEmpresa
        .filter((l) => linhasSelecionadas.has(l.key))
        .map((l) => ({ idEmpresa: l.idEmpresa, idContaFinanceiro: l.conta.id }));
      const r = await aplicarPrioridadeContasLote({
        itens,
        prioridade: remover ? undefined : prioridadeLote,
        observacao: observacaoLote.trim() || undefined,
        remover,
      });
      setSalvando(false);
      if (!r.ok) {
        setErro(r.erro ?? 'Falha ao salvar em lote.');
        return;
      }
      setMensagem(`${r.afetados} ${remover ? 'classificação(ões) removida(s)' : 'conta(s) classificada(s)'} com sucesso.`);
      setLinhasSelecionadas(new Set());
      // Atualiza estado local (sem refetch) e notifica pai cirurgicamente
      const novaPrioridade: DfcPrioridade | null = remover ? null : prioridadeLote;
      setContasPrioridade((prev) => {
        const set = new Set(itens.map((i) => `${i.idEmpresa}#${i.idContaFinanceiro}`));
        const semAfetados = prev.filter((c) => !set.has(`${c.idEmpresa}#${c.idContaFinanceiro}`));
        if (novaPrioridade == null) return semAfetados;
        const adicionados: DfcPrioridadeContaLinha[] = itens.map((i) => ({
          idEmpresa: i.idEmpresa,
          idContaFinanceiro: i.idContaFinanceiro,
          prioridade: novaPrioridade,
          observacao: observacaoLote.trim() || null,
          usuario: '',
          atualizadoEm: new Date().toISOString(),
        }));
        return [...semAfetados, ...adicionados];
      });
      for (const i of itens) {
        onPrioridadeContaAtualizada?.(i.idEmpresa, i.idContaFinanceiro, novaPrioridade);
      }
    },
    [linhasSelecionadas, linhasContaEmpresa, prioridadeLote, observacaoLote, onPrioridadeContaAtualizada]
  );

  const alterarPrioridadeConta = useCallback(
    async (idEmpresa: number, idConta: number, prioridade: DfcPrioridade | null) => {
      setErro(null);
      setMensagem(null);
      // Snapshot para rollback em caso de erro
      const snapshot = contasPrioridade;
      // Update otimista local (evita piscar/scroll-jump por refetch)
      setContasPrioridade((prev) => {
        const semAtual = prev.filter(
          (c) => !(c.idEmpresa === idEmpresa && c.idContaFinanceiro === idConta)
        );
        if (prioridade == null) return semAtual;
        const existente = prev.find(
          (c) => c.idEmpresa === idEmpresa && c.idContaFinanceiro === idConta
        );
        const nova: DfcPrioridadeContaLinha = {
          idEmpresa,
          idContaFinanceiro: idConta,
          prioridade,
          observacao: existente?.observacao ?? null,
          usuario: existente?.usuario ?? '',
          atualizadoEm: new Date().toISOString(),
        };
        return [...semAtual, nova];
      });
      if (prioridade == null) {
        const r = await aplicarPrioridadeContasLote({
          itens: [{ idEmpresa, idContaFinanceiro: idConta }],
          remover: true,
        });
        if (!r.ok) {
          setContasPrioridade(snapshot);
          setErro(r.erro ?? 'Falha ao remover.');
          return;
        }
      } else {
        const r = await salvarPrioridadeConta({ idEmpresa, idContaFinanceiro: idConta, prioridade });
        if (!r.ok) {
          setContasPrioridade(snapshot);
          setErro(r.erro ?? 'Falha ao salvar.');
          return;
        }
      }
      // Atualiza o mapa no pai cirurgicamente (sem recarregar a DFC inteira)
      onPrioridadeContaAtualizada?.(idEmpresa, idConta, prioridade);
    },
    [contasPrioridade, onPrioridadeContaAtualizada]
  );

  const alterarPrioridadeDespesa = useCallback(
    async (row: DfcDespesaPagamentoEmAbertoLinha, novo: DfcPrioridade | null) => {
      const chave = chaveLanc(row.idEmpresa, 'A', row.id);
      setSalvandoPrioridadeChave(chave);
      setErro(null);
      setMensagem(null);
      const snapshot = lancsPrioridade;
      const patchMapa = (prior: DfcPrioridade | null) => {
        setLancsPrioridade((prev) => {
          const sem = prev.filter(
            (l) => !(l.idEmpresa === row.idEmpresa && l.tipoRef === 'A' && l.idRef === row.id)
          );
          if (prior == null) return sem;
          return [
            ...sem,
            {
              idEmpresa: row.idEmpresa,
              tipoRef: 'A' as const,
              idRef: row.id,
              idContaFinanceiro: row.idContaFinanceiro,
              prioridade: prior,
              observacao: null,
              usuario: '',
              atualizadoEm: new Date().toISOString(),
            },
          ];
        });
      };

      patchMapa(novo);

      try {
        if (novo == null) {
          const r = await removerPrioridadeLancamento(row.idEmpresa, 'A', row.id);
          if (!r.ok) {
            setLancsPrioridade(snapshot);
            setErro(r.erro ?? 'Falha ao remover.');
            return;
          }
        } else {
          const r = await salvarPrioridadeLancamento({
            idEmpresa: row.idEmpresa,
            tipoRef: 'A',
            idRef: row.id,
            idContaFinanceiro: row.idContaFinanceiro,
            prioridade: novo,
          });
          if (!r.ok) {
            setLancsPrioridade(snapshot);
            setErro(r.erro ?? 'Falha ao salvar.');
            return;
          }
        }
        onPrioridadeLancAtualizada?.(row.idEmpresa, 'A', row.id, novo);
      } finally {
        setSalvandoPrioridadeChave(null);
      }
    },
    [lancsPrioridade, onPrioridadeLancAtualizada]
  );

  const aplicarLoteLancs = useCallback(
    async (remover: boolean) => {
      if (linhasSelecionadas.size === 0) {
        setErro('Selecione ao menos uma linha.');
        return;
      }
      setErro(null);
      setMensagem(null);
      setSalvando(true);
      const itens = linhasDespesasFiltradas
        .filter((row) => linhasSelecionadas.has(chaveLanc(row.idEmpresa, 'A', row.id)))
        .map((row) => ({
          idEmpresa: row.idEmpresa,
          tipoRef: 'A' as DfcTipoRefLancamento,
          idRef: row.id,
          idContaFinanceiro: row.idContaFinanceiro ?? undefined,
        }));
      const r = await aplicarPrioridadeLancamentosLote({
        itens,
        prioridade: remover ? undefined : prioridadeLote,
        observacao: observacaoLote.trim() || undefined,
        remover,
      });
      setSalvando(false);
      if (!r.ok) {
        setErro(r.erro ?? 'Falha ao salvar em lote.');
        return;
      }
      setMensagem(`${r.afetados} lançamento(s) ${remover ? 'desclassificado(s)' : 'classificado(s)'} com sucesso.`);
      setLinhasSelecionadas(new Set());
      // Atualiza estado local (sem refetch) e notifica pai cirurgicamente
      const novaPrioridade: DfcPrioridade | null = remover ? null : prioridadeLote;
      setLancsPrioridade((prev) => {
        const set = new Set(itens.map((i) => chaveLanc(i.idEmpresa, i.tipoRef, i.idRef)));
        const semAfetados = prev.filter(
          (l) => !set.has(chaveLanc(l.idEmpresa, l.tipoRef, l.idRef))
        );
        if (novaPrioridade == null) return semAfetados;
        const adicionados: DfcPrioridadeLancamentoLinha[] = itens.map((i) => ({
          idEmpresa: i.idEmpresa,
          tipoRef: i.tipoRef,
          idRef: i.idRef,
          idContaFinanceiro: i.idContaFinanceiro ?? null,
          prioridade: novaPrioridade,
          observacao: observacaoLote.trim() || null,
          usuario: '',
          atualizadoEm: new Date().toISOString(),
        }));
        return [...semAfetados, ...adicionados];
      });
      for (const i of itens) {
        onPrioridadeLancAtualizada?.(i.idEmpresa, i.tipoRef, i.idRef, novaPrioridade);
      }
    },
    [linhasSelecionadas, linhasDespesasFiltradas, prioridadeLote, observacaoLote, onPrioridadeLancAtualizada]
  );

  if (!aberto || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/50 dark:bg-slate-950/60"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative flex w-[min(98vw,1700px)] max-w-none max-h-[min(96vh,1100px)] min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-800 font-sans"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dfc-prioridade-titulo"
      >
        {/* Cabeçalho */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-600">
          <div className="min-w-0 pr-2">
            <h2 id="dfc-prioridade-titulo" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Prioridade de pagamento
            </h2>
            <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
              Classifique planos de contas e lançamentos. Use o filtro para focar a DFC.
              Override por lançamento prevalece sobre a do plano de contas.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-slate-600 dark:hover:text-slate-100"
            aria-label="Fechar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-slate-200 dark:border-slate-600">
          {([
            { id: 'contas', label: 'Classificar Plano de Contas' },
            { id: 'lancamentos', label: 'Classificar por Lançamento' },
          ] as { id: Aba; label: string }[]).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setAba(t.id);
                setLinhasSelecionadas(new Set());
                setFiltroTexto('');
                setMensagem(null);
                setErro(null);
                setFiltroPipePrioridades('');
              }}
              className={`px-4 py-2 text-sm font-semibold transition ${
                aba === t.id
                  ? 'border-b-2 border-primary-600 text-primary-700 dark:text-primary-300'
                  : 'text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Mensagens */}
        {(mensagem || erro) && (
          <div
            className={`shrink-0 px-4 py-2 text-sm ${
              erro
                ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200 border-b border-rose-200 dark:border-rose-800'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200 border-b border-emerald-200 dark:border-emerald-800'
            }`}
          >
            {erro ?? mensagem}
          </div>
        )}

        {/* Conteúdo */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {aba === 'contas' && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Empresa:</span>
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden bg-slate-50 dark:bg-slate-700">
                  {([
                    { label: 'Só Aço', ids: [1] },
                    { label: 'Só Móveis', ids: [2] },
                    { label: 'Ambas', ids: [1, 2] },
                  ] as { label: string; ids: number[] }[]).map((opt, i) => {
                    // Compara contra a seleção efetiva da aba
                    const sel = empresasFiltroContasEfetivas;
                    const ativo = sel.length === opt.ids.length && opt.ids.every((id) => sel.includes(id));
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setEmpresasFiltroContas(opt.ids)}
                        className={`px-3 py-1.5 text-xs font-semibold transition ${
                          i > 0 ? 'border-l border-slate-200 dark:border-slate-600' : ''
                        } ${
                          ativo
                            ? 'bg-primary-600 text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={filtroTexto}
                  onChange={(e) => setFiltroTexto(e.target.value)}
                  placeholder="Filtrar por nome, código ou id da conta…"
                  className="flex-1 min-w-[12rem] rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={toggleSelecionarTodas}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  {linhasSelecionadas.size === linhasContaEmpresa.length && linhasContaEmpresa.length > 0
                    ? 'Desmarcar todas'
                    : 'Selecionar todas'}
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {linhasSelecionadas.size} de {linhasContaEmpresa.length} selecionadas
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 dark:border-slate-600">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="w-10 px-2 py-1.5"></th>
                      <th className="px-2 py-1.5 text-left">Empresa</th>
                      <th className="px-2 py-1.5 text-left">Código</th>
                      <th className="px-2 py-1.5 text-left">Conta</th>
                      <th className="px-2 py-1.5 text-left">Macro</th>
                      <th className="px-2 py-1.5 text-left w-44">Prioridade</th>
                      <th className="px-2 py-1.5 text-left">Observação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {carregandoContas ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                          Carregando classificações…
                        </td>
                      </tr>
                    ) : linhasContaEmpresa.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                          Nenhuma conta encontrada para o filtro.
                        </td>
                      </tr>
                    ) : (
                      linhasContaEmpresa.slice(0, 1000).map((l) => {
                        const checked = linhasSelecionadas.has(l.key);
                        return (
                          <tr key={l.key} className={checked ? 'bg-primary-50 dark:bg-primary-900/20' : ''}>
                            <td className="px-2 py-1.5">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSelecionarLinha(l.key)}
                                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{labelEmpresa(l.idEmpresa)}</td>
                            <td className="px-2 py-1.5 font-mono text-xs text-slate-500 dark:text-slate-400">{l.conta.codigo}</td>
                            <td className="px-2 py-1.5 text-slate-800 dark:text-slate-100">{l.conta.nome}</td>
                            <td className="px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400">{l.conta.macro}</td>
                            <td className="px-2 py-1.5">
                              <select
                                value={l.prioridadeAtual ?? ''}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  void alterarPrioridadeConta(
                                    l.idEmpresa,
                                    l.conta.id,
                                    v === '' ? null : (Number(v) as DfcPrioridade)
                                  );
                                }}
                                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                              >
                                <option value="">— Sem prioridade</option>
                                {DFC_PRIORIDADES.map((p) => (
                                  <option key={p} value={p}>
                                    {p} — {DFC_PRIORIDADE_LABEL_CURTO[p]}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400 truncate max-w-[20rem]" title={l.obs ?? undefined}>
                              {l.obs ?? '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
                {linhasContaEmpresa.length > 1000 && (
                  <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-200 text-xs">
                    Mostrando 1000 primeiras linhas. Refine o filtro para ver mais.
                  </div>
                )}
              </div>

              {/* Rodapé de lote */}
              <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 p-3">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Ação em lote:</span>
                <select
                  value={prioridadeLote}
                  onChange={(e) => setPrioridadeLote(Number(e.target.value) as DfcPrioridade)}
                  className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                >
                  {DFC_PRIORIDADES.map((p) => (
                    <option key={p} value={p}>
                      {p} — {DFC_PRIORIDADE_LABEL_CURTO[p]}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={observacaoLote}
                  onChange={(e) => setObservacaoLote(e.target.value.slice(0, 500))}
                  placeholder="Observação (opcional)"
                  className="flex-1 min-w-[12rem] rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  disabled={salvando || linhasSelecionadas.size === 0}
                  onClick={() => void aplicarLoteContas(false)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Aplicar prioridade a {linhasSelecionadas.size}
                </button>
                <button
                  type="button"
                  disabled={salvando || linhasSelecionadas.size === 0}
                  onClick={() => void aplicarLoteContas(true)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:hover:bg-rose-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Remover classificação de {linhasSelecionadas.size}
                </button>
              </div>
            </div>
          )}

          {aba === 'lancamentos' && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-4">
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Empresa:
                </span>
                <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden bg-slate-50 dark:bg-slate-700">
                  {([
                    { label: 'Só Aço', ids: [1] },
                    { label: 'Só Móveis', ids: [2] },
                    { label: 'Ambas', ids: [1, 2] },
                  ] as { label: string; ids: number[] }[]).map((opt, i) => {
                    const sel = empresasFiltroLancsEfetivas;
                    const ativo = sel.length === opt.ids.length && opt.ids.every((id) => sel.includes(id));
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => setEmpresasFiltroLancs(opt.ids)}
                        className={`px-3 py-1.5 text-xs font-semibold transition ${
                          i > 0 ? 'border-l border-slate-200 dark:border-slate-600' : ''
                        } ${
                          ativo
                            ? 'bg-primary-600 text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-end gap-3">
                <MultiSelectWithSearch
                  label="Plano de contas"
                  placeholder="Todos"
                  options={opcoesContaIdsSorted}
                  value={filtroPipePlanoContas}
                  onChange={setFiltroPipePlanoContas}
                  labelClass={MS_LABEL_CLASS_PED}
                  inputClass={MS_INPUT_CLASS_PED}
                  minWidth="260px"
                  optionLabel="contas"
                  labelByValue={labelContaPorId}
                />
                <MultiSelectWithSearch
                  label="Fornecedor"
                  placeholder="Todos"
                  options={fornecedoresNomeOpcoes}
                  value={filtroPipeFornecedores}
                  onChange={setFiltroPipeFornecedores}
                  labelClass={MS_LABEL_CLASS_PED}
                  inputClass={MS_INPUT_CLASS_PED}
                  minWidth="240px"
                  optionLabel="fornecedores"
                />
                <MultiSelectWithSearch
                  label="Prioridade"
                  placeholder="Todas"
                  options={opcoesValorFiltroPrioridade}
                  value={filtroPipePrioridades}
                  onChange={setFiltroPipePrioridades}
                  labelClass={MS_LABEL_CLASS_PED}
                  inputClass={MS_INPUT_CLASS_PED}
                  minWidth="220px"
                  optionLabel="prioridades"
                  labelByValue={labelValorFiltroPrioridade}
                />
                <div className="flex min-w-[12rem] flex-1 flex-col">
                  <label className={MS_LABEL_CLASS_PED} htmlFor="dfc-prior-aberto-busca">
                    Busca na lista
                  </label>
                  <input
                    id="dfc-prior-aberto-busca"
                    type="search"
                    value={filtroTexto}
                    onChange={(e) => setFiltroTexto(e.target.value)}
                    placeholder="Id, empresa, favorecido ou descrição…"
                    className={`${MS_INPUT_CLASS_PED} w-full`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void recarregarDespesas();
                  }}
                  className="mb-0.5 shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Recarregar Nomus
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLinhasSelecionadas((prev) => {
                      const todasKeys = linhasDespesasFiltradas.map((row) =>
                        chaveLanc(row.idEmpresa, 'A', row.id)
                      );
                      if (prev.size === todasKeys.length) return new Set();
                      return new Set(todasKeys);
                    });
                  }}
                  className="mb-0.5 shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Selecionar todas
                </button>
                <span className="mb-1 shrink-0 self-end text-xs text-slate-500 dark:text-slate-400 pb-px">
                  {linhasSelecionadas.size} de {linhasDespesasFiltradas.length} selecionadas
                </span>
              </div>

              <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 dark:border-slate-600">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="w-10 px-2 py-1.5"></th>
                      <th className="px-2 py-1.5 text-left">Situação</th>
                      <th className="px-2 py-1.5 text-left">Empresa</th>
                      <th className="px-2 py-1.5 text-left">Conta</th>
                      <th className="px-2 py-1.5 text-left">Vencimento</th>
                      <th className="px-2 py-1.5 text-right whitespace-nowrap">Valor em aberto</th>
                      <th className="px-2 py-1.5 text-left">Favorecido / descrição</th>
                      <th className="min-w-[16rem] w-[min(22rem,32vw)] px-2 py-1.5 text-left">Prioridade</th>
                      <th className="px-2 py-1.5 text-left">Obs.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {carregandoDespesas || carregandoLancs ? (
                      <tr>
                        <td colSpan={9} className="py-6 text-center text-slate-500 dark:text-slate-400">
                          Carregando despesas…
                        </td>
                      </tr>
                    ) : linhasDespesasFiltradas.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-6 text-center text-slate-500 dark:text-slate-400">
                          Nenhuma linha encontrada{filtroTexto.trim() ? ' para o filtro atual' : ''}.
                          Ajuste as datas na DFC, filtros de conta, fornecedor, prioridade ou a busca na lista.
                        </td>
                      </tr>
                    ) : (
                      linhasDespesasFiltradas.map((row) => {
                        const k = chaveLanc(row.idEmpresa, 'A', row.id);
                        const checked = linhasSelecionadas.has(k);
                        const conta =
                          row.idContaFinanceiro != null
                            ? contasAnaliticas.find((c) => c.id === row.idContaFinanceiro)
                            : undefined;
                        const regLanc = mapaLancs.get(k);
                        const override = regLanc?.prioridade ?? null;
                        const prioConta =
                          row.idContaFinanceiro != null
                            ? mapaContas.get(chaveContaEmp(row.idEmpresa, row.idContaFinanceiro))?.prioridade ??
                              null
                            : null;
                        const prioExibicao = override ?? prioConta;
                        const salvandoLinha = salvandoPrioridadeChave === k;
                        return (
                          <tr key={k} className={checked ? 'bg-primary-50 dark:bg-primary-900/20' : ''}>
                            <td className="px-2 py-1.5 align-top">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSelecionarLinha(k)}
                                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                              />
                            </td>
                            <td className="px-2 py-1.5 align-top">{seloSituacaoDespesa(row.situacao)}</td>
                            <td className="px-2 py-1.5 align-top">{labelEmpresa(row.idEmpresa)}</td>
                            <td className="px-2 py-1.5 align-top text-xs text-slate-600 dark:text-slate-300 truncate max-w-[14rem]" title={conta ? `${conta.codigo} ${conta.nome}` : undefined}>
                              {conta ? (
                                <span>
                                  <span className="font-mono text-[10px] text-slate-400 mr-1">{conta.codigo}</span>
                                  {conta.nome}
                                </span>
                              ) : row.idContaFinanceiro != null ? (
                                <span className="text-slate-400">#{row.idContaFinanceiro}</span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-2 py-1.5 align-top text-xs whitespace-nowrap">
                              {fmtDataYmdBr(row.dataVencimento)}
                            </td>
                            <td className="px-2 py-1.5 align-top text-xs text-right font-semibold tabular-nums whitespace-nowrap">
                              {nfBrl.format(row.saldoBaixar)}
                            </td>
                            <td className="px-2 py-1.5 align-top text-xs text-slate-600 dark:text-slate-300 max-w-[16rem]">
                              <div className="truncate font-medium" title={row.nome ?? undefined}>
                                {row.nome ?? '—'}
                              </div>
                              <div className="truncate text-[11px] text-slate-400" title={row.descricaoLancamento ?? undefined}>
                                {row.descricaoLancamento ?? ''}
                              </div>
                            </td>
                            <td className="min-w-[16rem] w-[min(22rem,32vw)] px-2 py-1.5 align-top">
                              <select
                                value={override ?? ''}
                                disabled={salvandoLinha}
                                title={
                                  prioExibicao != null
                                    ? `${prioExibicao} — ${DFC_PRIORIDADE_LABEL_CURTO[prioExibicao]}`
                                    : undefined
                                }
                                onChange={(e) => {
                                  const v = e.target.value;
                                  void alterarPrioridadeDespesa(row, v === '' ? null : (Number(v) as DfcPrioridade));
                                }}
                                className={`w-full min-w-[14rem] rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1.5 text-sm ${
                                  prioExibicao != null ? `${DFC_PRIORIDADE_CHIP[prioExibicao]} font-semibold` : ''
                                }`}
                              >
                                <option value="">
                                  {override == null && prioConta != null
                                    ? `${prioConta} — ${DFC_PRIORIDADE_LABEL_CURTO[prioConta]}`
                                    : override == null
                                      ? '— Sem prioridade —'
                                      : '— Remover override —'}
                                </option>
                                {DFC_PRIORIDADES.filter(
                                  (p) => override != null || prioConta == null || p !== prioConta
                                ).map((p) => (
                                  <option key={p} value={p}>
                                    {p} — {DFC_PRIORIDADE_LABEL_CURTO[p]}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-1.5 align-top text-[11px] text-slate-500 truncate max-w-[8rem]" title={regLanc?.observacao ?? undefined}>
                              {regLanc?.observacao ?? '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 p-3">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Ação em lote:</span>
                <select
                  value={prioridadeLote}
                  onChange={(e) => setPrioridadeLote(Number(e.target.value) as DfcPrioridade)}
                  className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                >
                  {DFC_PRIORIDADES.map((p) => (
                    <option key={p} value={p}>
                      {p} — {DFC_PRIORIDADE_LABEL_CURTO[p]}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={observacaoLote}
                  onChange={(e) => setObservacaoLote(e.target.value.slice(0, 500))}
                  placeholder="Observação (opcional)"
                  className="flex-1 min-w-[12rem] rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  disabled={salvando || linhasSelecionadas.size === 0}
                  onClick={() => void aplicarLoteLancs(false)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Aplicar prioridade a {linhasSelecionadas.size}
                </button>
                <button
                  type="button"
                  disabled={salvando || linhasSelecionadas.size === 0}
                  onClick={() => void aplicarLoteLancs(true)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:hover:bg-rose-900/50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Remover override de {linhasSelecionadas.size}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
