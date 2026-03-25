import { useState, useEffect, useMemo } from 'react';
import type { PrecificacaoItemRow } from '../../api/engenharia';
import {
  salvarPrecificacaoValores,
  atualizarValorUnitarioItemPrecificacao,
  excluirItemPrecificacao,
} from '../../api/engenharia';
import { listarTickets, obterTicketPorId, type TicketItem, type TicketDetalhe } from '../../api/integracao';
import SelectWithSearch from '../SelectWithSearch';
import { MensagemSemRegistrosInline } from '../MensagemSemRegistros';
import { downloadFichaPrecificacaoPdf } from './FichaPrecificacaoReport';
import {
  aplicarCalculoConsumiveisEspeciais,
  isComponenteConsumivelCalculadoMarkup,
} from '../../utils/precificacaoConsumiveis';
import {
  computeResumoCalculoPrecificacao,
  formatResumoPercent,
  formatResumoValor,
} from '../../utils/precificacaoResumoCalculo';

const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-sm font-medium';
const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50 transition';

const labelClass = 'text-xs text-slate-500 dark:text-slate-400 block mb-0.5';
const inputClass =
  'w-full rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-2 py-1.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500';

/** Botões de ícone na grade (mesmo tamanho: 28×28 px). */
const btnIconGrade =
  'inline-flex items-center justify-center w-7 h-7 shrink-0 rounded-md border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50';
const btnIconGradeDanger =
  `${btnIconGrade} text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/25 hover:border-red-300 dark:hover:border-red-800`;

const SEGMENTOS = {
  Consumíveis: [
    { key: 'sucata', label: 'Sucata' },
    { key: 'fosfatizacao', label: 'Fosfatização' },
    { key: 'solda', label: 'Solda' },
    { key: 'gasGlp', label: 'Gás GLP' },
  ],
  'Despesas Operacionais': [
    { key: 'maoDeObraDireta', label: 'Mão de Obra Direta' },
    { key: 'maoDeObraIndireta', label: 'Mão de Obra Indireta' },
    { key: 'depreciacao', label: 'Depreciação' },
    { key: 'despesasAdministrativas', label: 'Despesas Administrativas' },
    { key: 'embalagem', label: 'Embalagem' },
    { key: 'frete', label: 'Frete' },
    { key: 'comissoes', label: 'Comissões' },
    { key: 'propaganda', label: 'Propaganda' },
  ],
  Lucro: [{ key: 'lucro', label: 'Lucro' }],
  'Impostos Sobre a Venda': [
    { key: 'cofins', label: 'COFINS' },
    { key: 'pis', label: 'PIS' },
    { key: 'csll', label: 'CSLL' },
    { key: 'irpj', label: 'IRPJ' },
    { key: 'icms', label: 'ICMS' },
    { key: 'ipi', label: 'IPI' },
  ],
} as const;

type CampoKey = (typeof SEGMENTOS)[keyof typeof SEGMENTOS][number]['key'];

/** Federais fixos na ficha; apenas ICMS e IPI permanecem editáveis neste bloco. */
const CAMPOS_IMPOSTOS_SO_LEITURA = new Set<CampoKey>(['cofins', 'pis', 'csll', 'irpj']);

const INITIAL_VALUES: Record<CampoKey, string> = {
  sucata: '1,00',
  fosfatizacao: '5,00',
  solda: '3,00',
  gasGlp: '3,00',
  maoDeObraDireta: '20,00',
  maoDeObraIndireta: '1,00',
  depreciacao: '1,00',
  despesasAdministrativas: '12,00',
  embalagem: '5,00',
  frete: '8,00',
  comissoes: '5,00',
  propaganda: '1,00',
  lucro: '50,00',
  cofins: '7,60',
  pis: '1,65',
  csll: '1,08',
  irpj: '0,42',
  icms: '0,00',
  ipi: '0,00',
};

function mergeComPadrao(base: Record<CampoKey, string>, incoming?: Record<string, string> | null): Record<CampoKey, string> {
  const merged = { ...base } as Record<CampoKey, string>;
  if (!incoming || typeof incoming !== 'object') return merged;
  (Object.keys(base) as CampoKey[]).forEach((k) => {
    const raw = incoming[k];
    if (raw == null) return;
    const v = String(raw).trim();
    if (v !== '') merged[k] = v;
  });
  return merged;
}

export interface ModalResultadoPrecificacaoProps {
  idPrecificacao: number;
  codigoProduto: string;
  descricaoProduto: string;
  /** Código NCM do produto (Nomus). */
  ncmCodigo?: string | null;
  /** Data da precificação (ISO ou formatada) para o relatório */
  dataPrecificacao?: string;
  /** Usuário que criou a precificação */
  usuario?: string;
  itens: PrecificacaoItemRow[];
  initialValores?: Record<string, string> | null;
  /** Ticket CRM já salvo no servidor (reabrir resultado); omitir ou null na 1ª abertura após criar precificação. */
  initialTicketCrmId?: number | null;
  /** Atualiza estado da página após Salvar (para manter ticket sem refetch). */
  onTicketSalvo?: (ticketCrmId: number | null) => void;
  onClose: () => void;
}

export default function ModalResultadoPrecificacao({
  idPrecificacao,
  codigoProduto,
  descricaoProduto,
  ncmCodigo,
  dataPrecificacao,
  usuario,
  itens: itensProp,
  initialValores,
  initialTicketCrmId = null,
  onTicketSalvo,
  onClose,
}: ModalResultadoPrecificacaoProps) {
  const itens = Array.isArray(itensProp) ? itensProp : [];

  const [valores, setValores] = useState<Record<CampoKey, string>>(() => {
    return mergeComPadrao(INITIAL_VALUES, initialValores);
  });
  const [salvando, setSalvando] = useState(false);
  const [mensagemSalvar, setMensagemSalvar] = useState<'ok' | 'erro' | null>(null);
  const [itensLocal, setItensLocal] = useState<PrecificacaoItemRow[]>(() => [...itens]);
  const [editandoItemId, setEditandoItemId] = useState<number | null>(null);
  const [valorUnitarioEdicao, setValorUnitarioEdicao] = useState('');
  const [salvandoValorItem, setSalvandoValorItem] = useState(false);
  const [excluindoItemId, setExcluindoItemId] = useState<number | null>(null);

  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [ticketId, setTicketId] = useState<string>('');
  const [ticketDetalhe, setTicketDetalhe] = useState<TicketDetalhe | null>(null);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingTicketDetalhe, setLoadingTicketDetalhe] = useState(false);

  const [subaba, setSubaba] = useState<'materiais' | 'markup' | 'calculo'>('materiais');

  const itensExibicao = useMemo(
    () => aplicarCalculoConsumiveisEspeciais(itensLocal, valores as Record<string, string>),
    [itensLocal, valores]
  );

  const resumoCalculo = useMemo(
    () => computeResumoCalculoPrecificacao(itensExibicao, valores as Record<string, string>),
    [itensExibicao, valores]
  );

  useEffect(() => {
    setItensLocal([...itens]);
    setEditandoItemId(null);
    setValorUnitarioEdicao('');
  }, [idPrecificacao, itens]);

  useEffect(() => {
    setValores(mergeComPadrao(INITIAL_VALUES, initialValores));
  }, [idPrecificacao, initialValores]);

  useEffect(() => {
    setLoadingTickets(true);
    listarTickets()
      .then((data) => {
        setTickets(Array.isArray(data) ? data : []);
      })
      .catch(() => setTickets([]))
      .finally(() => setLoadingTickets(false));
  }, []);

  /** Sincroniza ticket com o valor gravado ao abrir / trocar de precificação. Na criação vem null → campo vazio. */
  useEffect(() => {
    setTicketId(
      initialTicketCrmId != null && initialTicketCrmId >= 1 ? String(initialTicketCrmId) : ''
    );
  }, [idPrecificacao, initialTicketCrmId]);

  useEffect(() => {
    const id = ticketId ? parseInt(ticketId, 10) : 0;
    if (!Number.isFinite(id) || id < 1) {
      setTicketDetalhe(null);
      return;
    }
    setLoadingTicketDetalhe(true);
    obterTicketPorId(id)
      .then((d) => setTicketDetalhe(d ?? null))
      .catch(() => setTicketDetalhe(null))
      .finally(() => setLoadingTicketDetalhe(false));
  }, [ticketId]);

  const handleChange = (key: CampoKey, value: string) => {
    setValores((prev) => ({ ...prev, [key]: value }));
    setMensagemSalvar(null);
  };

  const handleSalvar = async () => {
    setSalvando(true);
    setMensagemSalvar(null);
    const tid = ticketId.trim();
    const parsed = tid === '' ? NaN : parseInt(tid, 10);
    const ticketCrmIdSalvar =
      Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
    const { error } = await salvarPrecificacaoValores(idPrecificacao, valores, {
      ticketCrmId: ticketCrmIdSalvar,
    });
    setSalvando(false);
    if (error) {
      setMensagemSalvar('erro');
      return;
    }
    setMensagemSalvar('ok');
    onTicketSalvo?.(ticketCrmIdSalvar);
  };

  const handleBaixarPdf = () => {
    downloadFichaPrecificacaoPdf({
      idPrecificacao,
      codigoProduto,
      descricaoProduto,
      ncmCodigo,
      dataPrecificacao,
      usuario,
      itens: itensLocal,
      valores,
      ticketDetalhe,
      ticketId: ticketId || undefined,
    });
  };

  const formatDecimalInput = (value: number | null | undefined): string => {
    if (value == null || Number.isNaN(value)) return '';
    return String(value).replace('.', ',');
  };

  const parseDecimalInput = (value: string): number | null => {
    const raw = value.trim();
    if (!raw) return null;
    const normalized = raw.includes(',')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw;
    const n = Number(normalized);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  };

  const iniciarEdicaoItem = (item: PrecificacaoItemRow) => {
    setEditandoItemId(item.id);
    setValorUnitarioEdicao(formatDecimalInput(item.valorUnitario));
  };

  const cancelarEdicaoItem = () => {
    setEditandoItemId(null);
    setValorUnitarioEdicao('');
  };

  const salvarEdicaoItem = async (item: PrecificacaoItemRow) => {
    const parsed = parseDecimalInput(valorUnitarioEdicao);
    if (valorUnitarioEdicao.trim() !== '' && parsed == null) return;

    setSalvandoValorItem(true);
    const { item: atualizado, error } = await atualizarValorUnitarioItemPrecificacao(
      idPrecificacao,
      item.id,
      parsed
    );
    setSalvandoValorItem(false);
    if (error || !atualizado) return;

    setItensLocal((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? { ...it, valorUnitario: atualizado.valorUnitario, valorTotal: atualizado.valorTotal }
          : it
      )
    );
    cancelarEdicaoItem();
  };

  const handleExcluirItem = async (item: PrecificacaoItemRow) => {
    const nome = (item.componente ?? item.codigocomponente ?? `item #${item.id}`).trim();
    if (!window.confirm(`Remover "${nome}" da composição desta precificação?`)) return;

    setExcluindoItemId(item.id);
    const { error } = await excluirItemPrecificacao(idPrecificacao, item.id);
    setExcluindoItemId(null);
    if (error) {
      window.alert(error);
      return;
    }
    if (editandoItemId === item.id) cancelarEdicaoItem();
    setItensLocal((prev) => prev.filter((it) => it.id !== item.id));
  };

  const iconeLixeira = (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Resultado da precificação"
    >
      <div
        className="rounded-xl shadow-xl w-full max-w-6xl max-h-[95vh] min-h-[min(70vh,640px)] flex flex-col border bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-slate-200 dark:border-slate-600 shrink-0 space-y-1" aria-label="Dados da precificação">
          <dl className="flex flex-col gap-1 text-sm text-slate-600 dark:text-slate-300">
            <div>
              <span className="font-medium">#{idPrecificacao}</span>
            </div>
            <div>
              <dt className="inline font-medium after:content-[':'] after:mr-1">Código do Produto</dt>
              <dd className="inline">{codigoProduto || '—'}</dd>
            </div>
            <div>
              <dt className="inline font-medium after:content-[':'] after:mr-1">Descrição do Produto</dt>
              <dd className="inline break-words">{descricaoProduto || '—'}</dd>
            </div>
            <div>
              <dt className="inline font-medium after:content-[':'] after:mr-1">NCM</dt>
              <dd className="inline tabular-nums">{ncmCodigo?.trim() ? ncmCodigo.trim() : '—'}</dd>
            </div>
          </dl>
        </header>

        {/* Subabas: Materiais | Markup | Cálculo */}
        <div className="shrink-0 border-b border-slate-200 dark:border-slate-600 px-6">
          <nav className="flex gap-1" aria-label="Abas da precificação">
            <button
              type="button"
              onClick={() => setSubaba('materiais')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition -mb-px ${
                subaba === 'materiais'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Materiais
            </button>
            <button
              type="button"
              onClick={() => setSubaba('markup')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition -mb-px ${
                subaba === 'markup'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Markup
            </button>
            <button
              type="button"
              onClick={() => setSubaba('calculo')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition -mb-px ${
                subaba === 'calculo'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              Cálculo
            </button>
          </nav>
        </div>

        <div className="flex-1 min-h-0 flex flex-col px-6 py-4 gap-4 overflow-hidden">
          {subaba === 'materiais' && (
            <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-hidden w-full">
          {/* Acima da grade: select Ticket (ID) + Cliente, Vendedor, Município, UF */}
          <div className="shrink-0 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3">
            <div>
              <SelectWithSearch
                id="modal-precificacao-ticket"
                label="Ticket (ID)"
                placeholder="Selecione..."
                options={tickets.map((t) => ({
                  value: String(t.id),
                  label: `#${t.id}${t.titulo ? ` — ${t.titulo.length > 50 ? t.titulo.slice(0, 50) + '…' : t.titulo}` : ''}`,
                }))}
                value={ticketId}
                onChange={setTicketId}
                disabled={loadingTickets}
                labelClass={labelClass}
                maxListHeight={260}
              />
            </div>
            {loadingTicketDetalhe && ticketId && (
              <p className="text-xs text-slate-500 dark:text-slate-400">Carregando informações do ticket...</p>
            )}
            {!loadingTicketDetalhe && ticketDetalhe && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <span className={labelClass}>Cliente</span>
                  <p className="text-sm text-slate-800 dark:text-slate-200">{ticketDetalhe.cliente ?? '—'}</p>
                </div>
                <div>
                  <span className={labelClass}>Vendedor</span>
                  <p className="text-sm text-slate-800 dark:text-slate-200">{ticketDetalhe.vendedorrep ?? '—'}</p>
                </div>
                <div>
                  <span className={labelClass}>Município</span>
                  <p className="text-sm text-slate-800 dark:text-slate-200">{ticketDetalhe.municipio ?? '—'}</p>
                </div>
                <div>
                  <span className={labelClass}>UF</span>
                  <p className="text-sm text-slate-800 dark:text-slate-200">{ticketDetalhe.UF ?? '—'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Grade de materiais */}
          <div
            className="flex-1 min-h-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-auto"
            style={{ minHeight: '12rem' }}
          >
              <table className="w-full text-sm text-left min-w-[860px]">
                <thead className="bg-primary-600 text-white">
                  <tr>
                    <th className="py-3 px-2 font-semibold text-center">Editar</th>
                    <th className="py-3 px-4 font-semibold">#</th>
                    <th className="py-3 px-4 font-semibold">Cód. comp.</th>
                    <th className="py-3 px-4 font-semibold">Componente</th>
                    <th className="py-3 px-4 font-semibold">Qtd</th>
                    <th className="py-3 px-4 font-semibold text-right">Valor Unitário</th>
                    <th className="py-3 px-4 font-semibold text-right">Valor Total</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700 dark:text-slate-200">
                  {itensExibicao.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 px-4 text-center">
                        <MensagemSemRegistrosInline />
                      </td>
                    </tr>
                  )}
                  {itensExibicao.map((item, idx) => {
                    const consumivelMarkup = isComponenteConsumivelCalculadoMarkup(item);
                    return (
                    <tr
                      key={item.id != null ? `item-${item.id}` : `row-${idx}`}
                      className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30"
                    >
                      <td className="py-2 px-2 text-center">
                        <div className="inline-flex items-center justify-center gap-1 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleExcluirItem(item)}
                            disabled={excluindoItemId === item.id || salvandoValorItem}
                            className={btnIconGradeDanger}
                            title="Remover insumo da composição"
                            aria-label={`Remover ${item.componente ?? item.codigocomponente ?? 'item'} da composição`}
                          >
                            {excluindoItemId === item.id ? (
                              <span className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" aria-hidden />
                            ) : (
                              iconeLixeira
                            )}
                          </button>
                          {consumivelMarkup ? (
                            <span
                              className="inline-flex items-center justify-center w-7 h-7 text-slate-400 dark:text-slate-500 text-xs"
                              title="Calculado pelo Markup (não editável)"
                            >
                              —
                            </span>
                          ) : editandoItemId === item.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => salvarEdicaoItem(item)}
                                disabled={salvandoValorItem}
                                className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 shrink-0"
                                title="Salvar preço unitário"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                  <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.4 7.4a1 1 0 01-1.42 0l-3.2-3.2a1 1 0 011.414-1.42l2.49 2.49 6.693-6.69a1 1 0 011.423 0z" clipRule="evenodd" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={cancelarEdicaoItem}
                                disabled={salvandoValorItem}
                                className={btnIconGrade}
                                title="Cancelar edição"
                              >
                                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => iniciarEdicaoItem(item)}
                              className={btnIconGrade}
                              title="Editar preço unitário"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                <path d="M17.414 2.586a2 2 0 010 2.828l-9.193 9.193a1 1 0 01-.39.244l-3.3 1.1a1 1 0 01-1.265-1.265l1.1-3.3a1 1 0 01.244-.39l9.193-9.193a2 2 0 012.828 0zM6.121 12.465l1.414 1.414 8.486-8.486-1.414-1.414-8.486 8.486z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium tabular-nums">{idx + 1}</td>
                      <td className="py-3 px-4">{item.codigocomponente ?? '—'}</td>
                      <td className="py-3 px-4">{item.componente ?? '—'}</td>
                      <td className="py-3 px-4 tabular-nums">
                        {consumivelMarkup
                          ? '—'
                          : typeof item.qtd === 'number'
                            ? item.qtd.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 5 })
                            : item.qtd}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {consumivelMarkup ? (
                          '—'
                        ) : editandoItemId === item.id ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            value={valorUnitarioEdicao}
                            onChange={(e) => setValorUnitarioEdicao(e.target.value)}
                            className="w-28 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-2 py-1 text-sm text-right"
                            placeholder="0,00"
                            aria-label={`Editar valor unitário do item ${item.codigocomponente ?? item.id}`}
                          />
                        ) : item.valorUnitario != null ? (
                          item.valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {item.valorTotal != null
                          ? item.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                          : '—'}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
          </div>
            </div>
          )}

          {subaba === 'calculo' && (
            <div className="flex-1 min-h-0 basis-0 flex flex-col" aria-label="Resumo de cálculo (somente leitura)">
              <div className="flex-1 min-h-0 basis-0 overflow-y-auto overflow-x-hidden overscroll-y-contain pr-1 pb-1 flex flex-col gap-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/40 overflow-hidden shrink-0">
                  <div className="bg-primary-600 text-white text-sm font-semibold px-4 py-2.5">Resumo de cálculo</div>
                  <div className="bg-white dark:bg-slate-800/30">
                    {resumoCalculo.itens.map((row, idx) =>
                      row.tipo === 'espaco' ? (
                        <div key={`esp-${idx}`} className="h-2 shrink-0" aria-hidden />
                      ) : (
                        <div
                          key={`${row.label}-${idx}`}
                          className={`flex w-full min-w-0 items-center gap-3 py-2 px-3 text-sm border-b border-slate-200/90 dark:border-slate-600/80 ${
                            row.destaque
                              ? 'bg-slate-200/90 dark:bg-slate-700/60 font-semibold text-slate-900 dark:text-slate-100'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          <span className="flex-1 min-w-0 pr-2">{row.label}</span>
                          <div className="flex shrink-0 items-center gap-6 ml-auto">
                            <span className="w-[5.25rem] text-right tabular-nums text-slate-600 dark:text-slate-400">
                              {row.perc != null ? formatResumoPercent(row.perc) : '\u00a0'}
                            </span>
                            <span className="min-w-[7rem] text-right tabular-nums">{formatResumoValor(row.valor)}</span>
                          </div>
                        </div>
                      )
                    )}
                    <div className="flex w-full min-w-0 items-center gap-3 py-2.5 px-3 text-sm font-bold bg-[#f5f2d0] dark:bg-yellow-900/35 text-slate-900 dark:text-slate-100 border-t-2 border-amber-200/80 dark:border-amber-800/60">
                      <span className="flex-1 min-w-0">Preço Venda:</span>
                      <div className="flex shrink-0 items-center gap-6 ml-auto">
                        <span className="w-[5.25rem] text-right tabular-nums">&nbsp;</span>
                        <span className="min-w-[7rem] text-right tabular-nums">
                          {formatResumoValor(resumoCalculo.precoVendaFinal)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                  Visualização do mesmo resumo principal da ficha em PDF (sem o quadro de impostos detalhado). Os valores
                  acompanham as abas Materiais e Markup (incluindo alterações ainda não salvas no servidor).
                </p>
              </div>
            </div>
          )}

          {subaba === 'markup' && (
          <div className="flex-1 min-h-0 overflow-auto">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Campos % (valores e percentuais)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {Object.entries(SEGMENTOS).map(([tituloSeg, campos]) => (
              <div
                key={tituloSeg}
                className="rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 p-4 space-y-3"
              >
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-600 pb-2">
                  {tituloSeg}
                </h3>
                <div className="space-y-2">
                  {campos.map(({ key, label }) => {
                    const k = key as CampoKey;
                    const somenteLeitura = CAMPOS_IMPOSTOS_SO_LEITURA.has(k);
                    return (
                    <div key={key}>
                      <label htmlFor={key} className={labelClass}>
                        {label}
                      </label>
                      <input
                        id={key}
                        type="text"
                        inputMode={somenteLeitura ? undefined : 'decimal'}
                        readOnly={somenteLeitura}
                        title={somenteLeitura ? 'Valor fixo (não editável)' : undefined}
                        value={valores[k]}
                        onChange={(e) => handleChange(k, e.target.value)}
                        onPaste={somenteLeitura ? (e) => e.preventDefault() : undefined}
                        className={`${inputClass} ${
                          somenteLeitura
                            ? 'bg-slate-100 dark:bg-slate-600/40 cursor-not-allowed text-slate-700 dark:text-slate-200'
                            : ''
                        }`}
                        placeholder="0,00 %"
                      />
                    </div>
                    );
                  })}
                </div>
              </div>
            ))}
            </div>
          </div>
          )}
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 rounded-b-xl">
          {mensagemSalvar === 'ok' && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Salvo com sucesso.</span>
          )}
          {mensagemSalvar === 'erro' && (
            <span className="text-sm text-red-600 dark:text-red-400 font-medium">Erro ao salvar. Tente novamente.</span>
          )}
          <button
            type="button"
            onClick={handleBaixarPdf}
            className={btnSecondary}
            title="Baixa a ficha de precificação em PDF"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Baixar PDF
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className={btnPrimary}
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
          <button type="button" onClick={onClose} className={btnSecondary}>
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
