import {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  useDeferredValue,
  memo,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  getMrp,
  getMrpHorizonte,
  getMrpMppQtdeTotalPorComponente,
  type MrpHorizonteLinha,
  type MrpHorizonteResponse,
  type MrpRow,
} from '../../api/mrp';
import { PERMISSOES } from '../../config/permissoes';
import { useAuth } from '../../contexts/AuthContext';
import FiltroDatasMRPPopover from '../../components/FiltroDatasMRPPopover';
import { downloadMrpXlsx } from '../../utils/exportMrpXlsx';
import {
  codigoChave,
  empenhoHorizonteUltimoDia,
  fmtNum2,
  numCampoMRP,
  primeiraDataRupturaParaRow,
  qtdeAComprarHorizonte,
  saldosENecessidadesHorizonte,
  parseDataMRP,
  statusHorizonteParaLinha,
} from '../../utils/mrpHorizonteDerivados';

/** Cache da última carga: ao voltar na aba MRP, restaura sem nova requisição. Só recarrega ao clicar em Atualizar. */
let mrpCache: { data: MrpRow[] } | null = null;

/** Soma MPP «Qtde total componente (no dia)» por código (sem filtro de datas), alinhado ao Empenho Total. */
let mrpMppQtdeCache: { totais: Record<string, number>; limitHit: boolean } | null = null;

const COLUNAS: {
  key: keyof MrpRow;
  label: string;
  /** Cabeçalho da coluna na tabela; se omitido, usa `label`. */
  thContent?: ReactNode;
  integer?: boolean;
  thClassName?: string;
  tdClassName?: string;
  tdTitle?: boolean;
}[] = [
  { key: 'codigocomponente', label: 'Código' },
  {
    key: 'componente',
    label: 'Componente',
    thClassName: 'max-w-[13rem] w-[13rem] min-w-[9rem]',
    tdClassName: 'max-w-[13rem] w-[13rem] min-w-[9rem] truncate align-top',
    tdTitle: true,
  },
  { key: 'unidademedida', label: 'UM' },
  { key: 'estoqueSeguranca', label: 'Est. Segurança', integer: true },
  { key: 'coleta', label: 'Coleta' },
  { key: 'itemcritico', label: 'Item Crítico' },
  { key: 'estoque', label: 'Estoque', integer: true },
  {
    key: 'CM',
    label: 'CM',
    integer: true,
    thClassName: 'w-14 min-w-[3.5rem] max-w-[3.5rem]',
    tdClassName: 'text-right tabular-nums w-14 min-w-[3.5rem] max-w-[3.5rem] box-border',
  },
  {
    key: 'pcPendentesAL',
    label: 'PC Aguardando Liberação',
    integer: true,
    thClassName:
      'whitespace-normal text-center leading-tight align-middle w-[10.5rem] min-w-[10.5rem] max-w-[10.5rem] box-border px-2 py-3 break-words',
    tdClassName:
      'text-right tabular-nums w-[10.5rem] min-w-[10.5rem] max-w-[10.5rem] box-border px-2 overflow-hidden align-middle',
    thContent: (
      <>
        PC
        <br />
        <span className="inline-block max-w-full text-[10px] sm:text-[11px] leading-tight">
          Aguardando Liberação
        </span>
      </>
    ),
  },
  {
    key: 'quantidade',
    label: 'Qtde Solicitada',
    integer: true,
    thClassName: 'min-w-[7rem] max-w-[8rem] w-[7.5rem] whitespace-normal text-center leading-tight box-border px-2',
    tdClassName: 'text-right tabular-nums min-w-[7rem] max-w-[8rem] w-[7.5rem] box-border px-2 overflow-hidden align-middle',
  },
  { key: 'dataNecessidade', label: 'Data Necessidade' },
  { key: 'saldoaReceber', label: 'PC Liberado', integer: true },
  { key: 'dataEntrega', label: 'Data Entrega' },
  {
    key: 'dataRuptura',
    label: 'Data Ruptura',
    thClassName: 'whitespace-nowrap',
    tdClassName: 'whitespace-nowrap',
  },
  {
    key: 'statusHorizonte',
    label: 'Status',
    thClassName: 'whitespace-normal min-w-[7.5rem] max-w-[11rem] text-left leading-snug',
  },
  {
    key: 'qtdeAComprar',
    label: 'Qtde a Comprar',
    thClassName: 'whitespace-nowrap',
    tdClassName: 'text-right tabular-nums whitespace-nowrap',
  },
  {
    key: 'empenhoTotal',
    label: 'Empenho Total',
    thClassName: 'whitespace-nowrap',
    tdClassName: 'text-right tabular-nums whitespace-nowrap',
  },
  {
    key: 'empenhoHorizonte',
    label: 'Empenho horizonte',
    thClassName: 'whitespace-nowrap',
    tdClassName: 'text-right tabular-nums whitespace-nowrap',
  },
];

const CHAVES_COLUNAS_SO_HORIZONTE: (keyof MrpRow)[] = [
  'dataRuptura',
  'statusHorizonte',
  'qtdeAComprar',
  'empenhoHorizonte',
];

function colunaSoComHorizonte(key: keyof MrpRow): boolean {
  return CHAVES_COLUNAS_SO_HORIZONTE.includes(key);
}

function colunasVisibilidadeInicial(): Record<string, boolean> {
  const r: Record<string, boolean> = {};
  for (const c of COLUNAS) r[c.key] = true;
  return r;
}

/** Mesmas classes base do `FiltroPedidos` (Gerenciador de Pedidos). */
const MRP_FILTER_INPUT_CLASS =
  'w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent min-h-[2.5rem]';
const MRP_FILTER_LABEL_CLASS = 'block text-xs text-slate-500 dark:text-slate-400 mb-1';
const MRP_BTN_PRIMARY_CLASS =
  'px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm transition shrink-0';

const OPCOES_STATUS_HORIZONTE_MRP: { value: string; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'Abastecido', label: 'Abastecido' },
  { value: 'Ruptura Sem PC', label: 'Ruptura Sem PC' },
  { value: 'Ruptura Antes do PC', label: 'Ruptura Antes do PC' },
  { value: 'Ruptura Depois do PC', label: 'Ruptura Depois do PC' },
  { value: 'Ruptura Sem PC/SC', label: 'Ruptura Sem PC/SC' },
  { value: '—', label: 'Sem linha de horizonte' },
];

/** Compara ISO yyyy-mm-dd com intervalo (inputs type=date). Sem filtro: aceita qualquer; com filtro e sem data: exclui. */
function isoDentroIntervalo(iso: string | null, ini: string, fim: string): boolean {
  const i = ini.trim();
  const f = fim.trim();
  if (!i && !f) return true;
  if (!iso) return false;
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  if (i && d < i) return false;
  if (f && d > f) return false;
  return true;
}

/** Filtros, horizonte carregado e colunas visíveis persistem ao trocar de aba (desmontagem da página). */
type MrpUiPersistido = {
  filterCodigo: string;
  filterComponente: string;
  filterColeta: string;
  filterItemCritico: string;
  filterStatusHorizonte: string;
  filterDataNecessidadeIni: string;
  filterDataNecessidadeFim: string;
  filterDataRupturaIni: string;
  filterDataRupturaFim: string;
  filterHorizonteFim: string;
  horizonte: MrpHorizonteResponse | null;
  horizonteErro: string | null;
  colunasVisiveisMap: Record<string, boolean>;
};

function mrpUiEstadoInicial(): MrpUiPersistido {
  return {
    filterCodigo: '',
    filterComponente: '',
    filterColeta: '',
    filterItemCritico: '',
    filterStatusHorizonte: '',
    filterDataNecessidadeIni: '',
    filterDataNecessidadeFim: '',
    filterDataRupturaIni: '',
    filterDataRupturaFim: '',
    filterHorizonteFim: '',
    horizonte: null,
    horizonteErro: null,
    colunasVisiveisMap: colunasVisibilidadeInicial(),
  };
}

let mrpUiPersistido: MrpUiPersistido = mrpUiEstadoInicial();

function celula(val: unknown, asInteger?: boolean): string {
  if (val == null) return '—';
  if (asInteger) {
    const n = Number(val);
    if (Number.isNaN(n)) return '—';
    return String(Math.round(n));
  }
  if (typeof val === 'object') return String(val);
  return String(val);
}

function formatIsoParaBr(iso: string): string {
  const s = iso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return iso;
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

const LEGENDA_STATUS_HORIZONTE: Record<string, string> = {
  Abastecido:
    'Nenhum dia no horizonte com necessidade maior que zero, ou não se enquadra em nenhuma regra de ruptura (ex.: PC liberado sem data de entrega).',
  'Ruptura Sem PC':
    'Sem PC liberado (pedido de compra) e com quantidade solicitada; ruptura no horizonte.',
  'Ruptura Antes do PC':
    'Há saldo em PC liberado e a data de ruptura é anterior à data de entrega do pedido.',
  'Ruptura Depois do PC':
    'Há saldo em PC liberado e a data de ruptura é posterior à data de entrega do pedido.',
  'Ruptura Sem PC/SC':
    'Sem PC liberado e sem quantidade solicitada; ruptura no horizonte.',
};

function tituloCelulaQtdeAComprar(status: string): string | undefined {
  if (status === '—') return 'Sem linha de horizonte para este código.';
  if (status === 'Abastecido') return 'Abastecido: sem quantidade a comprar.';
  if (status === 'Ruptura Depois do PC') return 'Ruptura após o PC: sem quantidade a comprar.';
  if (status === 'Ruptura Antes do PC')
    return 'Necessidade acumulada no dia anterior à primeira data de ruptura no horizonte.';
  if (status === 'Ruptura Sem PC' || status === 'Ruptura Sem PC/SC')
    return 'Necessidade acumulada no último dia do horizonte.';
  return undefined;
}

/** Estilo visual da célula Status (horizonte). */
function classNameCelulaStatusHorizonte(status: string): string {
  const base =
    'py-2 px-4 whitespace-normal min-w-[7.5rem] max-w-[11rem] text-xs leading-snug align-top text-center';
  switch (status) {
    case 'Abastecido':
      return `${base} font-bold bg-emerald-600 text-white dark:bg-emerald-700`;
    case 'Ruptura Sem PC':
      return `${base} font-bold bg-red-600 text-white dark:bg-red-700`;
    case 'Ruptura Antes do PC':
      return `${base} font-bold bg-yellow-400 text-black dark:bg-yellow-500 dark:text-slate-950`;
    case 'Ruptura Depois do PC':
      return `${base} font-bold bg-sky-400 text-black dark:bg-sky-500 dark:text-slate-950`;
    case 'Ruptura Sem PC/SC':
      return `${base} font-bold bg-black text-white dark:bg-zinc-950`;
    default:
      return `${base} bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200`;
  }
}

/** Separa cada bloco de data no horizonte (primeira coluna do dia = Consumo). */
function horizonteBordaInicioDia(indiceDia: number): string {
  if (indiceDia === 0) {
    return 'border-l-2 border-l-amber-950 dark:border-l-amber-200';
  }
  return 'border-l-[3px] border-l-amber-950 dark:border-l-amber-100';
}

const HORIZONTE_BORDA_INTERNA =
  'border-t border-b border-r border-amber-600/55 border-l border-amber-500/35 dark:border-amber-700/50 dark:border-l-amber-800/40';

/** Bordas mais leves entre subcolunas do corpo da tabela (horizonte). */
const HORIZONTE_TD_INTERNA =
  'border-t border-b border-r border-slate-200 border-l border-slate-200/55 dark:border-slate-600 dark:border-l-slate-700/40';

type MrpDerivadosHorizonteEmpenho = {
  empenhoHorizonteFmt: string;
};

type ColunaMRPVisivel = (typeof COLUNAS)[number];

/**
 * Linha da grade isolada + memo: evita re-render de milhares de células quando o pai atualiza por filtros.
 * Código sem linha no horizonte usa 1 célula por dia (colSpan 4) em vez de 4×dias nós DOM.
 */
const MrpTableBodyRow = memo(
  function MrpTableBodyRow({
    row,
    linhaH,
    empenhoHorizonteFmt,
    horizonte,
    temHorizonteNaGrade,
    colunasVisiveisLista,
    empenhoMppNum,
  }: {
    row: MrpRow;
    linhaH: MrpHorizonteLinha | undefined;
    empenhoHorizonteFmt: string | undefined;
    horizonte: MrpHorizonteResponse | null;
    temHorizonteNaGrade: boolean;
    colunasVisiveisLista: ColunaMRPVisivel[];
    empenhoMppNum: number | undefined;
  }) {
    const horizonteCalc = useMemo(() => {
      if (!linhaH?.dias?.length) return null;
      const saldo0 = numCampoMRP(row.estoque);
      const { saldosEf, nAcum } = saldosENecessidadesHorizonte(linhaH.dias, {
        saldoInicialPrimeiroDia: saldo0,
      });
      let isoDataRuptura: string | null = null;
      for (let i = 0; i < nAcum.length; i++) {
        if (nAcum[i] > 0) {
          isoDataRuptura = linhaH.dias[i].data;
          break;
        }
      }
      return { saldosEf, nAcum, isoDataRuptura };
    }, [linhaH, row.estoque]);

    const isoDataRuptura = linhaH ? (horizonteCalc?.isoDataRuptura ?? null) : null;
    const statusHorizonteTxt = statusHorizonteParaLinha(
      row,
      linhaH,
      linhaH ? (horizonteCalc?.isoDataRuptura ?? null) : undefined
    );
    const qtdeAComprarTxt = qtdeAComprarHorizonte(
      statusHorizonteTxt,
      linhaH,
      horizonteCalc?.nAcum
    );
    const empenhoTotalTxt =
      empenhoMppNum != null && Number.isFinite(empenhoMppNum) ? fmtNum2(empenhoMppNum) : '—';
    const empenhoHorizonteTxt = linhaH
      ? (empenhoHorizonteFmt ?? empenhoHorizonteUltimoDia(linhaH))
      : '—';

    return (
      <tr className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
        {colunasVisiveisLista.map((col) => (
          <td
            key={col.key}
            className={
              col.key === 'statusHorizonte'
                ? classNameCelulaStatusHorizonte(statusHorizonteTxt)
                : `py-2 px-4 ${col.tdClassName ?? 'whitespace-nowrap'}`
            }
            title={
              col.key === 'dataRuptura' && isoDataRuptura
                ? formatIsoParaBr(isoDataRuptura)
                : col.key === 'statusHorizonte'
                  ? LEGENDA_STATUS_HORIZONTE[statusHorizonteTxt] ?? statusHorizonteTxt
                  : col.key === 'qtdeAComprar'
                    ? tituloCelulaQtdeAComprar(statusHorizonteTxt)
                    : col.key === 'empenhoTotal'
                      ? 'Soma MPP de qtde total componente por dia, em todo o período do resumo (sem filtro de datas).'
                      : col.key === 'empenhoHorizonte'
                        ? 'Soma do consumo no horizonte de produção exibido.'
                        : col.tdTitle
                          ? String(row[col.key] ?? '') || undefined
                          : undefined
            }
          >
            {col.key === 'dataRuptura'
              ? isoDataRuptura
                ? formatIsoParaBr(isoDataRuptura)
                : '—'
              : col.key === 'statusHorizonte'
                ? statusHorizonteTxt
                : col.key === 'qtdeAComprar'
                  ? qtdeAComprarTxt
                  : col.key === 'empenhoTotal'
                    ? empenhoTotalTxt
                    : col.key === 'empenhoHorizonte'
                      ? empenhoHorizonteTxt
                      : celula(row[col.key], col.integer)}
          </td>
        ))}
        {temHorizonteNaGrade &&
          horizonte &&
          (linhaH
            ? (() => {
                const saldosEf = horizonteCalc?.saldosEf ?? [];
                const nAcum = horizonteCalc?.nAcum ?? [];
                return linhaH.dias.flatMap((cel, di) => {
                  const nVal = nAcum[di] ?? 0;
                  const necessidadeAlerta = nVal > 0;
                  const saldoExibido = saldosEf[di] ?? 0;
                  const tituloSaldoEstoque =
                    di > 0
                      ? 'Saldo = max(0, (saldo anterior − consumo anterior) + entrada anterior). Esse valor entra na Necessidade.'
                      : 'Saldo inicial: max(0, coluna Estoque desta linha). Esse valor entra na Necessidade.';
                  return [
                    <td
                      key={`${cel.data}-c`}
                      className={`py-2 px-2 text-xs text-right tabular-nums bg-amber-50/40 dark:bg-amber-950/20 border-t border-b border-r border-slate-200 dark:border-slate-600 ${horizonteBordaInicioDia(di)}`}
                    >
                      {fmtNum2(cel.consumo)}
                    </td>,
                    <td
                      key={`${cel.data}-se`}
                      className={`py-2 px-2 text-xs text-right tabular-nums bg-amber-50/40 dark:bg-amber-950/20 ${HORIZONTE_TD_INTERNA}`}
                      title={tituloSaldoEstoque}
                    >
                      {fmtNum2(saldoExibido)}
                    </td>,
                    <td
                      key={`${cel.data}-e`}
                      className={`py-2 px-2 text-xs text-right tabular-nums bg-amber-50/40 dark:bg-amber-950/20 ${HORIZONTE_TD_INTERNA}`}
                    >
                      {fmtNum2(cel.entrada)}
                    </td>,
                    <td
                      key={`${cel.data}-n`}
                      className={
                        necessidadeAlerta
                          ? `py-2 px-2 text-xs text-right tabular-nums font-bold bg-red-600 text-white border-t border-b border-r border-l border-red-700 dark:bg-red-700 dark:border-red-900`
                          : `py-2 px-2 text-xs text-right tabular-nums font-medium bg-amber-50/60 dark:bg-amber-950/30 ${HORIZONTE_TD_INTERNA}`
                      }
                    >
                      {fmtNum2(nVal)}
                    </td>,
                  ];
                });
              })()
            : horizonte.datas.map((d, di) => (
                <td
                  key={`${d}-empty-block`}
                  colSpan={4}
                  className={`py-2 px-2 text-xs text-center text-slate-400 bg-white dark:bg-slate-800 border-t border-b border-r border-slate-200 dark:border-slate-600 ${horizonteBordaInicioDia(di)}`}
                  title="Sem linha de horizonte para este código."
                >
                  —
                </td>
              )))}
      </tr>
    );
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.linhaH === next.linhaH &&
    prev.empenhoHorizonteFmt === next.empenhoHorizonteFmt &&
    prev.horizonte === next.horizonte &&
    prev.temHorizonteNaGrade === next.temHorizonteNaGrade &&
    prev.colunasVisiveisLista === next.colunasVisiveisLista &&
    prev.empenhoMppNum === next.empenhoMppNum
);

/** Overlay do horizonte: mesmo vocabulário visual do carregamento principal da página MRP. */
function HorizonteLoadingOverlay() {
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/35 dark:bg-slate-950/45 backdrop-blur-sm px-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-10 py-8 shadow-lg">
        <div className="relative w-12 h-12 shrink-0">
          <div className="absolute inset-0 rounded-full border-4 border-primary-200 dark:border-primary-800" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary-600 animate-spin" />
        </div>
        <p className="text-base font-medium text-slate-700 dark:text-slate-200 animate-pulse text-center">
          Calculando MRP
        </p>
      </div>
    </div>,
    document.body
  );
}

export default function MRPPage() {
  const { hasPermission } = useAuth();
  const podeExportarXlsx =
    hasPermission(PERMISSOES.PCP_EXPORTAR_XLSX) ||
    hasPermission(PERMISSOES.PCP_TOTAL) ||
    hasPermission(PERMISSOES.PEDIDOS_EDITAR);

  const [data, setData] = useState<MrpRow[]>(() => mrpCache?.data ?? []);
  const [loading, setLoading] = useState(() => !mrpCache);
  const [erro, setErro] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [filterCodigo, setFilterCodigo] = useState(() => mrpUiPersistido.filterCodigo);
  const [filterComponente, setFilterComponente] = useState(() => mrpUiPersistido.filterComponente);
  const [filterColeta, setFilterColeta] = useState(() => mrpUiPersistido.filterColeta);
  const [filterItemCritico, setFilterItemCritico] = useState<string>(() => mrpUiPersistido.filterItemCritico);
  const [filterStatusHorizonte, setFilterStatusHorizonte] = useState(
    () => mrpUiPersistido.filterStatusHorizonte ?? ''
  );
  const [filterDataNecessidadeIni, setFilterDataNecessidadeIni] = useState(
    () => mrpUiPersistido.filterDataNecessidadeIni ?? ''
  );
  const [filterDataNecessidadeFim, setFilterDataNecessidadeFim] = useState(
    () => mrpUiPersistido.filterDataNecessidadeFim ?? ''
  );
  const [filterDataRupturaIni, setFilterDataRupturaIni] = useState(
    () => mrpUiPersistido.filterDataRupturaIni ?? ''
  );
  const [filterDataRupturaFim, setFilterDataRupturaFim] = useState(
    () => mrpUiPersistido.filterDataRupturaFim ?? ''
  );
  const [filterHorizonteFim, setFilterHorizonteFim] = useState(() => mrpUiPersistido.filterHorizonteFim);
  const [horizonte, setHorizonte] = useState<MrpHorizonteResponse | null>(() => mrpUiPersistido.horizonte);
  const [horizonteLoading, setHorizonteLoading] = useState(false);
  const [horizonteErro, setHorizonteErro] = useState<string | null>(() => mrpUiPersistido.horizonteErro);
  const [colunasVisiveisMap, setColunasVisiveisMap] = useState(() => ({
    ...mrpUiPersistido.colunasVisiveisMap,
  }));
  const [painelColunasAberto, setPainelColunasAberto] = useState(false);
  const painelColunasRef = useRef<HTMLDivElement>(null);
  const [mppQtdePorCodigo, setMppQtdePorCodigo] = useState<Record<string, number>>(
    () => mrpMppQtdeCache?.totais ?? {}
  );
  const [mppQtdeLimitHit, setMppQtdeLimitHit] = useState(() => mrpMppQtdeCache?.limitHit ?? false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    const [mrpOutcome, mppOutcome] = await Promise.allSettled([
      getMrp(),
      getMrpMppQtdeTotalPorComponente(),
    ]);
    if (mrpOutcome.status === 'fulfilled') {
      const rows = Array.isArray(mrpOutcome.value.data) ? mrpOutcome.value.data : [];
      setData(rows);
      mrpCache = { data: rows };
    } else {
      setData([]);
      mrpCache = null;
      setErro(
        mrpOutcome.reason instanceof Error
          ? mrpOutcome.reason.message
          : 'Erro ao carregar MRP.'
      );
    }
    if (mppOutcome.status === 'fulfilled') {
      const m = mppOutcome.value;
      const totais = m.totais && typeof m.totais === 'object' ? { ...m.totais } : {};
      setMppQtdePorCodigo(totais);
      const hit = Boolean(m.limitHit);
      setMppQtdeLimitHit(hit);
      mrpMppQtdeCache = { totais, limitHit: hit };
    } else {
      setMppQtdePorCodigo({});
      setMppQtdeLimitHit(false);
      mrpMppQtdeCache = { totais: {}, limitHit: false };
    }
    setLoading(false);
  }, []);

  const carregarHorizonte = useCallback(async () => {
    const fim = filterHorizonteFim.trim();
    if (!fim) {
      setHorizonteErro('Informe a data final do Horizonte de Produção.');
      return;
    }
    setHorizonteLoading(true);
    setHorizonteErro(null);
    try {
      const h = await getMrpHorizonte(fim);
      setHorizonte(h);
    } catch (e) {
      setHorizonte(null);
      setHorizonteErro(e instanceof Error ? e.message : 'Erro ao carregar horizonte.');
    } finally {
      setHorizonteLoading(false);
    }
  }, [filterHorizonteFim]);

  useEffect(() => {
    if (mrpCache) {
      setData(mrpCache.data);
      setLoading(false);
      setErro(null);
    } else {
      void carregar();
    }
    if (mrpMppQtdeCache) {
      setMppQtdePorCodigo(mrpMppQtdeCache.totais);
      setMppQtdeLimitHit(mrpMppQtdeCache.limitHit);
    }
    // Montagem única: não refazer GET ao trocar de aba (igual MPP).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mrpUiPersistido.filterCodigo = filterCodigo;
    mrpUiPersistido.filterComponente = filterComponente;
    mrpUiPersistido.filterColeta = filterColeta;
    mrpUiPersistido.filterItemCritico = filterItemCritico;
    mrpUiPersistido.filterStatusHorizonte = filterStatusHorizonte;
    mrpUiPersistido.filterDataNecessidadeIni = filterDataNecessidadeIni;
    mrpUiPersistido.filterDataNecessidadeFim = filterDataNecessidadeFim;
    mrpUiPersistido.filterDataRupturaIni = filterDataRupturaIni;
    mrpUiPersistido.filterDataRupturaFim = filterDataRupturaFim;
    mrpUiPersistido.filterHorizonteFim = filterHorizonteFim;
    mrpUiPersistido.horizonte = horizonte;
    mrpUiPersistido.horizonteErro = horizonteErro;
    mrpUiPersistido.colunasVisiveisMap = colunasVisiveisMap;
  }, [
    filterCodigo,
    filterComponente,
    filterColeta,
    filterItemCritico,
    filterStatusHorizonte,
    filterDataNecessidadeIni,
    filterDataNecessidadeFim,
    filterDataRupturaIni,
    filterDataRupturaFim,
    filterHorizonteFim,
    horizonte,
    horizonteErro,
    colunasVisiveisMap,
  ]);

  useEffect(() => {
    if (!painelColunasAberto) return;
    const fechar = (e: MouseEvent) => {
      if (painelColunasRef.current && !painelColunasRef.current.contains(e.target as Node)) {
        setPainelColunasAberto(false);
      }
    };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [painelColunasAberto]);

  const temHorizonteNaGrade = Boolean(horizonte && horizonte.datas.length > 0);

  const colunasVisiveisLista = useMemo(
    () =>
      COLUNAS.filter((c) => {
        if (colunaSoComHorizonte(c.key) && !temHorizonteNaGrade) return false;
        return colunasVisiveisMap[c.key] !== false;
      }),
    [colunasVisiveisMap, temHorizonteNaGrade]
  );

  const alternarColunaFixa = (key: string) => {
    setColunasVisiveisMap((prev) => {
      const atual = prev[key] !== false;
      if (atual) {
        const restantes = COLUNAS.filter((c) => c.key !== key && prev[c.key] !== false).length;
        if (restantes === 0) return prev;
      }
      return { ...prev, [key]: !atual };
    });
  };

  const marcarTodasColunasFixas = () => {
    setColunasVisiveisMap(colunasVisibilidadeInicial());
  };

  /** Uma linha de horizonte por código (precisa existir antes do filtro por status/ruptura). */
  const horizontePorCodigo = useMemo(() => {
    const m = new Map<string, MrpHorizonteLinha>();
    if (!horizonte?.linhas) return m;
    for (const linha of horizonte.linhas) {
      const k = linha.codigo.trim();
      if (k && !m.has(k)) m.set(k, linha);
    }
    return m;
  }, [horizonte]);

  const derivadosHorizontePorCodigo = useMemo(() => {
    const m = new Map<string, MrpDerivadosHorizonteEmpenho>();
    if (!horizonte?.linhas) return m;
    for (const linha of horizonte.linhas) {
      const k = linha.codigo.trim();
      if (!k || m.has(k)) continue;
      let sumC = 0;
      for (const cel of linha.dias) {
        const c = Number(cel.consumo);
        if (Number.isFinite(c)) sumC += c;
      }
      m.set(k, {
        empenhoHorizonteFmt: fmtNum2(sumC),
      });
    }
    return m;
  }, [horizonte]);

  const deferredFilterCodigo = useDeferredValue(filterCodigo);
  const deferredFilterComponente = useDeferredValue(filterComponente);
  const deferredFilterColeta = useDeferredValue(filterColeta);
  const deferredFilterItemCritico = useDeferredValue(filterItemCritico);
  const deferredFilterStatusHorizonte = useDeferredValue(filterStatusHorizonte);
  const deferredDataNecessidadeIni = useDeferredValue(filterDataNecessidadeIni);
  const deferredDataNecessidadeFim = useDeferredValue(filterDataNecessidadeFim);
  const deferredDataRupturaIni = useDeferredValue(filterDataRupturaIni);
  const deferredDataRupturaFim = useDeferredValue(filterDataRupturaFim);

  const filteredData = useMemo(() => {
    const termCod = deferredFilterCodigo.trim().toLowerCase();
    const termComp = deferredFilterComponente.trim().toLowerCase();
    const termCol = deferredFilterColeta.trim().toLowerCase();
    return data.filter((row) => {
      const cod = (row.codigocomponente ?? '').toString().toLowerCase();
      const comp = (row.componente ?? '').toString().toLowerCase();
      const col = (row.coleta ?? '').toString().toLowerCase();
      if (termCod && !cod.includes(termCod)) return false;
      if (termComp && !comp.includes(termComp)) return false;
      if (termCol && !col.includes(termCol)) return false;
      if (deferredFilterItemCritico === 'Sim' && (row.itemcritico ?? '').toString().toLowerCase() !== 'sim')
        return false;
      if (deferredFilterItemCritico === 'Não' && (row.itemcritico ?? '').toString().toLowerCase() === 'sim')
        return false;

      const chave = codigoChave(row);
      const linhaH = chave ? horizontePorCodigo.get(chave) : undefined;
      const isoRupRow = primeiraDataRupturaParaRow(linhaH, row);
      const statusTxt = statusHorizonteParaLinha(row, linhaH, linhaH ? isoRupRow : undefined);
      if (deferredFilterStatusHorizonte && statusTxt !== deferredFilterStatusHorizonte) return false;

      const isoNec = parseDataMRP(row.dataNecessidade);
      if (
        !isoDentroIntervalo(isoNec, deferredDataNecessidadeIni, deferredDataNecessidadeFim)
      ) {
        return false;
      }

      if (!isoDentroIntervalo(isoRupRow, deferredDataRupturaIni, deferredDataRupturaFim)) return false;

      return true;
    });
  }, [
    data,
    deferredFilterCodigo,
    deferredFilterComponente,
    deferredFilterColeta,
    deferredFilterItemCritico,
    deferredFilterStatusHorizonte,
    deferredDataNecessidadeIni,
    deferredDataNecessidadeFim,
    deferredDataRupturaIni,
    deferredDataRupturaFim,
    horizontePorCodigo,
  ]);

  /** Chave estável por objeto de linha: evita remontar a árvore inteira ao mudar só a posição na lista filtrada. */
  const stableKeyByRow = useMemo(() => {
    const m = new WeakMap<MrpRow, string>();
    data.forEach((row, i) => {
      const id = row.idComponente;
      const idPart =
        id != null && String(id).trim() !== '' ? String(id).replace(/\s+/g, '') : 'x';
      m.set(row, `mrp-${idPart}-${i}`);
    });
    return m;
  }, [data]);

  const colSpanGrade =
    colunasVisiveisLista.length + (temHorizonteNaGrade ? horizonte!.datas.length * 4 : 0);

  const temFiltros =
    filterCodigo.trim() !== '' ||
    filterComponente.trim() !== '' ||
    filterColeta.trim() !== '' ||
    filterItemCritico !== '' ||
    filterStatusHorizonte.trim() !== '' ||
    filterDataNecessidadeIni.trim() !== '' ||
    filterDataNecessidadeFim.trim() !== '' ||
    filterDataRupturaIni.trim() !== '' ||
    filterDataRupturaFim.trim() !== '' ||
    filterHorizonteFim.trim() !== '';

  const limparFiltros = () => {
    setFilterCodigo('');
    setFilterComponente('');
    setFilterColeta('');
    setFilterItemCritico('');
    setFilterStatusHorizonte('');
    setFilterDataNecessidadeIni('');
    setFilterDataNecessidadeFim('');
    setFilterDataRupturaIni('');
    setFilterDataRupturaFim('');
    setFilterHorizonteFim('');
  };

  const exportarExcel = useCallback(async () => {
    if (filteredData.length === 0) {
      window.alert('Nenhum registro para exportar com os filtros atuais.');
      return;
    }
    setExportLoading(true);
    try {
      await downloadMrpXlsx(
        {
          rows: filteredData,
          columns: colunasVisiveisLista.map((c) => ({
            key: c.key,
            label: c.label,
            integer: c.integer,
          })),
          horizonte,
          horizontePorCodigo,
          mppQtdePorCodigo,
        },
        `mrp_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Erro ao exportar MRP.');
    } finally {
      setExportLoading(false);
    }
  }, [filteredData, colunasVisiveisLista, horizonte, horizontePorCodigo, mppQtdePorCodigo]);

  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 p-6">
        <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 min-h-[320px]">
          <div className="flex flex-col items-center gap-6">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 rounded-full border-4 border-primary-200 dark:border-primary-800" />
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary-600 animate-spin" />
            </div>
            <p className="text-lg font-medium text-slate-700 dark:text-slate-300 animate-pulse">
              Gerando MRP...
            </p>
            <div className="flex gap-1">
              <span className="w-2 h-2 rounded-full bg-primary-500 animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 rounded-full bg-primary-500 animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-primary-500 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-4">MRP</h1>
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-amber-800 dark:text-amber-200">{erro}</p>
          <button
            type="button"
            onClick={carregar}
            className="mt-3 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-200">MRP</h1>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative" ref={painelColunasRef}>
            <button
              type="button"
              onClick={() => setPainelColunasAberto((v) => !v)}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              aria-expanded={painelColunasAberto}
              aria-haspopup="true"
            >
              Colunas da grade
            </button>
            {painelColunasAberto ? (
              <div
                className="absolute right-0 top-full mt-1 z-50 w-64 max-h-[min(70vh,420px)] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg py-2 px-3"
                role="menu"
              >
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                  Colunas fixas (azul)
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
                  Não afeta as colunas de datas do horizonte.
                </p>
                <ul className="space-y-0.5">
                  {COLUNAS.filter(
                    (c) => !colunaSoComHorizonte(c.key) || temHorizonteNaGrade
                  ).map((c) => (
                    <li key={c.key}>
                      <label className="flex items-center gap-2 py-1.5 px-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700/80 cursor-pointer text-sm text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          className="rounded border-slate-400 text-primary-600 focus:ring-primary-500"
                          checked={colunasVisiveisMap[c.key] !== false}
                          onChange={() => alternarColunaFixa(c.key)}
                        />
                        <span>{c.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={marcarTodasColunasFixas}
                  className="mt-2 w-full text-xs py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  Marcar todas
                </button>
              </div>
            ) : null}
          </div>
          {podeExportarXlsx && (
            <button
              type="button"
              onClick={() => void exportarExcel()}
              disabled={exportLoading}
              className="inline-flex items-center justify-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Exporta todas as linhas filtradas da grade (colunas visíveis e horizonte, se carregado) para Excel"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h2" />
                <path d="M8 17h8" />
                <path d="M8 9h1" />
                <path d="M12 9h4" />
              </svg>
              {exportLoading ? 'Exportando…' : 'Excel'}
            </button>
          )}
          <button
            type="button"
            onClick={carregar}
            className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            Atualizar
          </button>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex flex-wrap items-end gap-3 p-4 bg-white dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50">
          <div className="shrink-0 min-w-[140px]">
            <label className={MRP_FILTER_LABEL_CLASS}>Código</label>
            <input
              type="text"
              placeholder="Filtrar…"
              value={filterCodigo}
              onChange={(e) => setFilterCodigo(e.target.value)}
              className={MRP_FILTER_INPUT_CLASS}
            />
          </div>
          <div className="shrink-0 min-w-[200px] max-w-[280px]">
            <label className={MRP_FILTER_LABEL_CLASS}>Componente</label>
            <input
              type="text"
              placeholder="Filtrar…"
              value={filterComponente}
              onChange={(e) => setFilterComponente(e.target.value)}
              className={MRP_FILTER_INPUT_CLASS}
            />
          </div>
          <div className="shrink-0 min-w-[160px]">
            <label className={MRP_FILTER_LABEL_CLASS}>Coleta</label>
            <input
              type="text"
              placeholder="Filtrar…"
              value={filterColeta}
              onChange={(e) => setFilterColeta(e.target.value)}
              className={MRP_FILTER_INPUT_CLASS}
            />
          </div>
          <div className="shrink-0 min-w-[120px]">
            <label className={MRP_FILTER_LABEL_CLASS}>Item crítico</label>
            <select
              value={filterItemCritico}
              onChange={(e) => setFilterItemCritico(e.target.value)}
              className={MRP_FILTER_INPUT_CLASS}
            >
              <option value="">Todos</option>
              <option value="Sim">Sim</option>
              <option value="Não">Não</option>
            </select>
          </div>
          <div className="shrink-0 min-w-[200px] max-w-[14rem]">
            <label className={MRP_FILTER_LABEL_CLASS}>Status</label>
            <select
              value={filterStatusHorizonte}
              onChange={(e) => setFilterStatusHorizonte(e.target.value)}
              className={MRP_FILTER_INPUT_CLASS}
              title="Status derivado do horizonte (carregue o horizonte para refletir na grade)."
            >
              {OPCOES_STATUS_HORIZONTE_MRP.map((o) => (
                <option key={o.value === '' ? '__todos' : o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <FiltroDatasMRPPopover
            valores={{
              filterDataNecessidadeIni,
              filterDataNecessidadeFim,
              filterDataRupturaIni,
              filterDataRupturaFim,
              filterHorizonteFim,
            }}
            onChange={(u) => {
              if (u.filterDataNecessidadeIni !== undefined) setFilterDataNecessidadeIni(u.filterDataNecessidadeIni);
              if (u.filterDataNecessidadeFim !== undefined) setFilterDataNecessidadeFim(u.filterDataNecessidadeFim);
              if (u.filterDataRupturaIni !== undefined) setFilterDataRupturaIni(u.filterDataRupturaIni);
              if (u.filterDataRupturaFim !== undefined) setFilterDataRupturaFim(u.filterDataRupturaFim);
              if (u.filterHorizonteFim !== undefined) setFilterHorizonteFim(u.filterHorizonteFim);
            }}
          />
          <button
            type="button"
            onClick={() => void carregarHorizonte()}
            disabled={horizonteLoading}
            className="shrink-0 text-sm px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition"
          >
            {horizonteLoading ? 'Carregando horizonte…' : 'Carregar horizonte'}
          </button>
          <button type="button" onClick={limparFiltros} className={MRP_BTN_PRIMARY_CLASS} title="Limpar todos os filtros">
            Limpar filtros
          </button>
        </div>
        {temFiltros && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Exibindo {filteredData.length} de {data.length} registro(s)
          </p>
        )}
        {horizonteErro && (
          <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">{horizonteErro}</p>
        )}
        {mppQtdeLimitHit && (
          <p className="mt-2 text-xs font-medium text-amber-800 dark:text-amber-200">
            Atenção: o somatório da coluna Empenho Total (MPP) pode estar incompleto — o ERP atingiu o limite de
            linhas brutas na montagem do resumo.
          </p>
        )}
        {temHorizonteNaGrade && horizonte && (
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-200 font-medium">
            Colunas de horizonte na grade: {formatIsoParaBr(horizonte.dataInicio)} a {formatIsoParaBr(horizonte.dataFim)} ({horizonte.datas.length}{' '}
            dia(s)) — alinhadas ao código do componente.
          </p>
        )}
      </div>

      {horizonteLoading ? <HorizonteLoadingOverlay /> : null}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto max-h-[75vh] overflow-y-auto">
          <table className={`w-full text-sm text-left border-collapse ${temHorizonteNaGrade ? 'min-w-max' : 'min-w-[900px]'}`}>
            <thead className="sticky top-0 z-20">
              <tr className="bg-primary-600 text-white">
                {colunasVisiveisLista.map((col) => (
                  <th
                    key={col.key}
                    rowSpan={temHorizonteNaGrade ? 2 : 1}
                    title={
                      col.key === 'dataRuptura'
                        ? 'Primeiro dia em que a necessidade acumulada no horizonte é maior que zero'
                        : col.key === 'statusHorizonte'
                          ? 'Passe o mouse sobre a célula para ver o significado de cada status.'
                          : col.key === 'qtdeAComprar'
                            ? 'Abastecido ou Ruptura Depois do PC: vazio. Ruptura Antes do PC: necessidade no dia anterior à ruptura. Ruptura Sem PC / Sem PC-SC: necessidade no último dia do horizonte.'
                            : col.key === 'empenhoTotal'
                              ? 'Somatório de «Qtde total componente (no dia)» no resumo MPP, todas as datas, sem filtros de grade (carregado com o MRP).'
                              : col.key === 'empenhoHorizonte'
                                ? 'Somatório do consumo (coluna Consumo) nos dias do horizonte carregado.'
                                : undefined
                    }
                    className={`py-3 px-4 font-semibold border border-primary-500/40 align-middle ${
                      col.thClassName ?? 'whitespace-nowrap'
                    }`}
                  >
                    {col.thContent ?? col.label}
                  </th>
                ))}
                {temHorizonteNaGrade &&
                  horizonte!.datas.map((d, di) => (
                    <th
                      key={d}
                      colSpan={4}
                      className={`py-2 px-2 font-semibold text-center whitespace-nowrap border-t border-b border-r border-amber-700 bg-amber-600 text-white ${horizonteBordaInicioDia(di)}`}
                    >
                      {formatIsoParaBr(d)}
                    </th>
                  ))}
              </tr>
              {temHorizonteNaGrade ? (
                <tr className="bg-amber-500 text-white">
                  {horizonte!.datas.flatMap((d, di) => [
                    <th
                      key={`${d}-c`}
                      className={`py-1.5 px-1.5 text-[11px] font-medium text-center bg-amber-500 text-white min-w-[64px] border-t border-b border-r border-amber-600/70 ${horizonteBordaInicioDia(di)}`}
                    >
                      Consumo
                    </th>,
                    <th
                      key={`${d}-se`}
                      className={`py-1.5 px-1 text-[10px] sm:text-[11px] font-medium text-center bg-amber-500 text-white min-w-[4.25rem] max-w-[5rem] whitespace-normal leading-tight ${HORIZONTE_BORDA_INTERNA}`}
                      title="Saldo exibido e usado na Necessidade: mínimo 0. 1º dia: coluna Estoque. Demais: (saldo anterior − consumo anterior) + entrada anterior."
                    >
                      Saldo Estoque
                    </th>,
                    <th
                      key={`${d}-e`}
                      className={`py-1.5 px-1.5 text-[11px] font-medium text-center bg-amber-500 text-white min-w-[64px] ${HORIZONTE_BORDA_INTERNA}`}
                    >
                      Entrada
                    </th>,
                    <th
                      key={`${d}-n`}
                      className={`py-1.5 px-1 text-[10px] sm:text-[11px] font-medium text-center bg-amber-500 text-white min-w-[4.25rem] whitespace-normal leading-tight border-t border-b border-r border-amber-600/70 border-l border-amber-500/35 dark:border-amber-700/50 dark:border-l-amber-800/40`}
                      title="Consumo − (Saldo estoque + Entrada), com saldo estoque ≥ 0; acumula no tempo (carry-forward)."
                    >
                      Necessidade
                    </th>,
                  ])}
                </tr>
              ) : null}
            </thead>
            <tbody className="text-slate-700 dark:text-slate-200 divide-y divide-slate-200 dark:divide-slate-600">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={colSpanGrade} className="py-8 px-4 text-center text-slate-500 dark:text-slate-400">
                    {data.length === 0
                      ? 'Nenhum registro encontrado.'
                      : 'Nenhum registro encontrado com os filtros aplicados.'}
                  </td>
                </tr>
              ) : (
                filteredData.map((row) => {
                  const chave = codigoChave(row);
                  const linhaH = chave ? horizontePorCodigo.get(chave) : undefined;
                  const empenhoFmt = chave ? derivadosHorizontePorCodigo.get(chave)?.empenhoHorizonteFmt : undefined;
                  const empenhoMpp = chave ? mppQtdePorCodigo[chave.trim()] : undefined;
                  const stableKey = stableKeyByRow.get(row) ?? (chave ? `mrp-cod-${chave}` : 'mrp-row');
                  return (
                    <MrpTableBodyRow
                      key={stableKey}
                      row={row}
                      linhaH={linhaH}
                      empenhoHorizonteFmt={empenhoFmt}
                      horizonte={horizonte}
                      temHorizonteNaGrade={temHorizonteNaGrade}
                      colunasVisiveisLista={colunasVisiveisLista}
                      empenhoMppNum={empenhoMpp}
                    />
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
