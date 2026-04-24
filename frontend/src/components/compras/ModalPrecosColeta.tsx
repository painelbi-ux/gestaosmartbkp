import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  listarPrecosColeta,
  excluirItemColeta,
  enviarParaAprovacao,
  reabrirColeta,
  cancelarCotacao,
  finalizarCotacao,
  enviarParaFinanceiro,
  cancelarTodosItensColeta,
  atualizarObservacoesColeta,
  listarOpcoesVinculoFinalizacao,
  listarOpcoesVinculoErroOperacional,
  type OpcaoVinculoFinalizacaoItem,
} from '../../api/compras';
import type { FornecedorColetaItem } from '../../api/compras';
import ModalCadastrarPrecos from './ModalCadastrarPrecos';
import ModalCriarColetaPrecos from './ModalCriarColetaPrecos';
import SingleSelectWithSearch, { type OptionItem } from '../SingleSelectWithSearch';
import { useAuth } from '../../contexts/AuthContext';
import { PERMISSOES } from '../../config/permissoes';

export interface ModalPrecosColetaProps {
  coletaId: number;
  coletaLabel: string;
  fornecedores: FornecedorColetaItem[];
  dataCriacao?: string;
  usuarioCriacao?: string | null;
  status?: string;
  /** Data/hora em que foi enviado para aprovação (para exibir tempo em aprovação). */
  dataEnvioAprovacao?: string | null;
  /** Quando false, oculta botões de edição (apenas visualização). */
  podeEditarCompras?: boolean;
  onClose: () => void;
  onItemExcluido?: () => void;
  onColetaAlterada?: () => void;
  /** Quando true, renderiza inline (sem overlay) para uso em abas. */
  inline?: boolean;
  /** Observações da coleta (texto longo); exibido no mapa de cotação. */
  observacoes?: string | null;
  /** Coletas novas: ao finalizar, exige vínculo com pedido de compra ou cotação Nomus. */
  requerVinculoFinalizacao?: boolean;
}

/** Colunas da grade de preços: possíveis chaves no row (SQL/MySQL) e rótulo no cabeçalho. */
const COLUNAS_PRECOS: { keys: string[]; label: string; decimals?: number; date?: boolean }[] = [
  { keys: ['Codigo do Produto', 'codigo do produto'], label: 'Codigo do Produto' },
  { keys: ['Descricao do Produto', 'descricao do produto'], label: 'Descricao do Produto' },
  { keys: ['Unidade de Medida', 'unidade de medida'], label: 'Unidade de Medida' },
  { keys: ['Tipo do Produto', 'tipo do produto'], label: 'Tipo do Produto' },
  { keys: ['Familia do Produto', 'familia do produto'], label: 'Família do Produto' },
  { keys: ['Grupo do Produto', 'grupo do produto'], label: 'Grupo do Produto' },
  { keys: ['Estoque de Seguranca', 'estoque de seguranca', 'Estoque de Segurança'], label: 'Estoque de Segurança', decimals: 2 },
  { keys: ['Estoque Maximo', 'estoque maximo', 'Estoque Máximo'], label: 'Estoque Máximo', decimals: 2 },
  { keys: ['Saldo Estoque', 'saldo estoque'], label: 'Saldo de Estoque', decimals: 2 },
  { keys: ['Qtd Confirmada', 'qtd confirmada'], label: 'Qtd Confirmada', decimals: 2 },
  { keys: ['Qtd Liberada', 'qtd liberada'], label: 'Qtd Liberada', decimals: 2 },
  { keys: ['Data Necessidade', 'data necessidade'], label: 'Data Necessidade', date: true },
  { keys: ['Data Solicitacao', 'data solicitacao', 'Data Solicitacao'], label: 'Data Solicitação', date: true },
  { keys: ['PC_Aguardando Liberacao', 'pc_aguardando liberacao'], label: 'PC Aguardando Liberação' },
  { keys: ['Ultima Entrada', 'ultima entrada'], label: 'Ultima Entrada', date: true },
  { keys: ['Data Ultimo Pedido', 'data ultimo pedido'], label: 'Ultimo Pedido', date: true },
  { keys: ['Qtde Ult Compra', 'qtde ult compra'], label: 'Ultima Compra', decimals: 2 },
  { keys: ['Custo Unitario Compra', 'custo unitario compra'], label: 'Ultimo Custo', decimals: 2 },
  { keys: ['Ultimo Fornecedor', 'ultimo fornecedor'], label: 'Ultimo Fornecedor' },
  { keys: ['Consumo Medio', 'consumo medio'], label: 'Consumo Medio', decimals: 2 },
  { keys: ['Saldo em Estoque Antes UE', 'saldo em estoque antes ue'], label: 'Saldo em Estoque Antes Ultima Entrada', decimals: 2 },
  { keys: ['Qtde Empenhada', 'qtde empenhada', 'Qtdempenhada'], label: 'Qtde Empenhada', decimals: 2 },
  { keys: ['Ag Pag', 'ag pag'], label: 'Ag Pag', decimals: 2 },
];

function getRowValue(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(row, k)) return row[k];
  }
  const lower = keys[0].toLowerCase();
  const found = Object.keys(row).find((key) => key.toLowerCase() === lower);
  return found != null ? row[found] : undefined;
}

/** Formata data como dd/MM/yyyy sem mudar o dia (evita timezone). */
function formatDate(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'object') return '—';
  const s = String(value).trim();
  if (!s) return '—';
  const iso = s.includes('T') ? s.split('T')[0] : s;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatCell(value: unknown, col: { decimals?: number; date?: boolean }): string {
  if (value == null) return '—';
  if (col.date) return formatDate(value);
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (col.decimals != null && (typeof value === 'number' || (typeof value === 'string' && /^-?\d*\.?\d*$/.test(value)))) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(col.decimals) : String(value);
  }
  return String(value);
}

function formatarDataCriacao(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatarTempoDecorrido(isoInicio: string): string {
  const ini = new Date(isoInicio).getTime();
  const agora = Date.now();
  const diffMs = Math.max(0, agora - ini);
  const seg = Math.floor(diffMs / 1000) % 60;
  const min = Math.floor(diffMs / 60000) % 60;
  const h = Math.floor(diffMs / 3600000);
  if (h > 0) return `${h}h ${min}min`;
  if (min > 0) return `${min}min ${seg}s`;
  return `${seg}s`;
}

function mapOpcoesVinculoParaSelect(rows: OpcaoVinculoFinalizacaoItem[]): OptionItem[] {
  return rows.map((row) => ({
    id: row.id,
    uniqueKey: `${row.tipoRegistro}-${row.id}`,
    nome: `${row.nome} (${row.tipoRegistro === 'PEDIDO' ? 'Pedido' : 'Cotação'})`,
    descricao: [row.nomeFornecedor, row.dataEmissao].filter(Boolean).join(' · '),
    meta: { tipoRegistro: row.tipoRegistro, idRegistro: row.id },
  }));
}

function chaveVinculoErroOpParaPayload(key: string): { tipoRegistro: 'PEDIDO' | 'COTACAO'; idRegistro: number } | null {
  const i = key.lastIndexOf('-');
  if (i <= 0) return null;
  const tipo = key.slice(0, i).toUpperCase();
  const idRegistro = parseInt(key.slice(i + 1), 10);
  if (tipo !== 'PEDIDO' && tipo !== 'COTACAO') return null;
  if (!Number.isFinite(idRegistro) || idRegistro < 1) return null;
  return { tipoRegistro: tipo as 'PEDIDO' | 'COTACAO', idRegistro };
}

export default function ModalPrecosColeta({
  coletaId,
  coletaLabel,
  fornecedores,
  dataCriacao,
  usuarioCriacao,
  status = 'Em cotação',
  dataEnvioAprovacao,
  podeEditarCompras = true,
  onClose,
  onItemExcluido,
  onColetaAlterada,
  inline = false,
  observacoes: observacoesProp,
  requerVinculoFinalizacao = false,
}: ModalPrecosColetaProps) {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [cadastrarPrecosRow, setCadastrarPrecosRow] = useState<Record<string, unknown> | null>(null);
  const [observacoesLocal, setObservacoesLocal] = useState(observacoesProp ?? '');
  const [salvandoObservacoes, setSalvandoObservacoes] = useState(false);
  useEffect(() => {
    setObservacoesLocal(observacoesProp ?? '');
  }, [observacoesProp]);

  /** Ao fechar o modal, salva as observações automaticamente se tiverem sido alteradas. */
  const handleClose = useCallback(async () => {
    const valorAtual = observacoesLocal.trim();
    const valorInicial = (observacoesProp ?? '').trim();
    if (valorAtual !== valorInicial) {
      setSalvandoObservacoes(true);
      setErro(null);
      const res = await atualizarObservacoesColeta(coletaId, valorAtual || null);
      setSalvandoObservacoes(false);
      if (res.ok) {
        onColetaAlterada?.();
        onClose();
      } else {
        setErro(res.error ?? 'Não foi possível salvar as observações.');
      }
      return;
    }
    onClose();
  }, [coletaId, observacoesLocal, observacoesProp, onClose, onColetaAlterada]);

  const [loading, setLoading] = useState(true);
  const [excluindoId, setExcluindoId] = useState<number | null>(null);
  const [enviandoAprovacao, setEnviandoAprovacao] = useState(false);
  const [modalAdicionarItens, setModalAdicionarItens] = useState(false);
  const [statusLocal, setStatusLocal] = useState(status);
  /** Quando enviamos para aprovação aqui, guardamos a data local até o parent atualizar. */
  const [dataEnvioAprovacaoLocal, setDataEnvioAprovacaoLocal] = useState<string | null>(null);
  const emCotacao = statusLocal === 'Em cotação';
  const emAprovacao = statusLocal === 'Em Aprovação';
  const enviadoFinanceiro = statusLocal === 'Enviado para Financeiro';
  const podeReabrir = emAprovacao || enviadoFinanceiro;
  const rejeitada = statusLocal === 'Rejeitada';
  const [modalCancelar, setModalCancelar] = useState(false);
  const [justificativaCancelar, setJustificativaCancelar] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [enviandoFinalizar, setEnviandoFinalizar] = useState(false);
  const [enviandoFinanceiro, setEnviandoFinanceiro] = useState(false);
  const [cancelandoTodosItens, setCancelandoTodosItens] = useState(false);
  const [modalCancelarItem, setModalCancelarItem] = useState<{ tipo: 'item' | 'todos'; idProduto?: number } | null>(null);
  const [justificativaCancelarItem, setJustificativaCancelarItem] = useState('');
  const [cancelandoCancelarItem, setCancelandoCancelarItem] = useState(false);
  const [modalReabrir, setModalReabrir] = useState(false);
  const [senhaReabrir, setSenhaReabrir] = useState('');
  const [reabrindo, setReabrindo] = useState(false);
  const [modalVinculoFinalizar, setModalVinculoFinalizar] = useState(false);
  /** Um ou mais pedidos/cotações Nomus para gravar na finalização. */
  const [vinculosSelecionados, setVinculosSelecionados] = useState<OptionItem[]>([]);
  const [opcoesVinculoLista, setOpcoesVinculoLista] = useState<OptionItem[]>([]);
  const [loadingOpcoesVinculo, setLoadingOpcoesVinculo] = useState(false);
  const [finalizandoComVinculo, setFinalizandoComVinculo] = useState(false);
  /** Passo 2: checklist ampliada (Nomus) + senha antes de finalizar com erro operacional. */
  const [modalSqlErroOperacional, setModalSqlErroOperacional] = useState(false);
  const [linhasOpcoesErroOperacional, setLinhasOpcoesErroOperacional] = useState<OpcaoVinculoFinalizacaoItem[]>([]);
  const [carregandoChecklistErroOp, setCarregandoChecklistErroOp] = useState(false);
  const [erroChecklistErroOp, setErroChecklistErroOp] = useState<string | null>(null);
  const [filtroLocalChecklistErroOp, setFiltroLocalChecklistErroOp] = useState('');
  const [chavesSelecionadasErroOp, setChavesSelecionadasErroOp] = useState<string[]>([]);
  const [senhaErroOperacional, setSenhaErroOperacional] = useState('');
  const { hasPermission } = useAuth();
  const podeRegistrarErroOperacionalVinculo = hasPermission(PERMISSOES.COMPRAS_VINCULO_FINALIZACAO_AMPLIADO);
  const dataRefAprovacao = dataEnvioAprovacao ?? dataEnvioAprovacaoLocal;
  const [tempoAprovacaoDisplay, setTempoAprovacaoDisplay] = useState('');
  useEffect(() => {
    setStatusLocal(status);
  }, [status]);
  useEffect(() => {
    if (!emAprovacao || !dataRefAprovacao) {
      setTempoAprovacaoDisplay('');
      return;
    }
    const update = () => setTempoAprovacaoDisplay(formatarTempoDecorrido(dataRefAprovacao));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [emAprovacao, dataRefAprovacao]);
  useEffect(() => {
    if (!modalCancelarItem) setJustificativaCancelarItem('');
  }, [modalCancelarItem]);
  const labelClassFiltro = 'block text-xs text-slate-500 dark:text-slate-400 mb-1';
  const inputClassFiltro =
    'w-full rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent';

  const carregarOpcoesVinculo = useCallback(async (term: string) => {
    setLoadingOpcoesVinculo(true);
    setErro(null);
    const r = await listarOpcoesVinculoFinalizacao(term);
    setLoadingOpcoesVinculo(false);
    setOpcoesVinculoLista(mapOpcoesVinculoParaSelect(r.data));
    if (r.error) setErro(r.error);
  }, []);

  const abrirModalFinalizarComVinculo = useCallback(async () => {
    setVinculosSelecionados([]);
    setModalVinculoFinalizar(true);
    await carregarOpcoesVinculo('');
  }, [carregarOpcoesVinculo]);

  const adicionarVinculoAoFinalizar = useCallback((opt: OptionItem | null) => {
    if (!opt) return;
    const meta = opt.meta as { tipoRegistro?: string; idRegistro?: number } | undefined;
    if (!meta?.tipoRegistro || meta.idRegistro == null || !Number.isFinite(meta.idRegistro)) return;
    const uk = opt.uniqueKey ?? `${meta.tipoRegistro}-${meta.idRegistro}`;
    setVinculosSelecionados((prev) => {
      if (prev.some((p) => (p.uniqueKey ?? '') === uk)) return prev;
      return [...prev, opt];
    });
  }, []);

  const [erro, setErro] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [debug, setDebug] = useState<{
    registrosSalvos?: number;
    itensNaColeta?: number;
    nomusConfigurado?: boolean;
    nomusErro?: string;
  } | null>(null);

  const [solicitacoesPorProduto, setSolicitacoesPorProduto] = useState<Record<number, number[]>>({});

  const linhasChecklistFiltradas = useMemo(() => {
    const t = filtroLocalChecklistErroOp.trim().toLowerCase();
    if (!t) return linhasOpcoesErroOperacional;
    return linhasOpcoesErroOperacional.filter((row) => {
      const nome = (row.nome ?? '').toLowerCase();
      const forn = (row.nomeFornecedor ?? '').toLowerCase();
      const de = (row.dataEmissao ?? '').toLowerCase();
      return nome.includes(t) || forn.includes(t) || de.includes(t);
    });
  }, [linhasOpcoesErroOperacional, filtroLocalChecklistErroOp]);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    setMessage(null);
    setDebug(null);
    try {
      const res = await listarPrecosColeta(coletaId);
      setData(Array.isArray(res.data) ? res.data : []);
      setSolicitacoesPorProduto(res.solicitacoesPorProduto ?? {});
      if (res.error) setErro(res.error);
      if (res.message) setMessage(res.message);
      if (res.debug) setDebug(res.debug);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar preços.');
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [coletaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const colunas = useMemo(() => COLUNAS_PRECOS, []);
  const temDados = !loading && data.length > 0;

  const conteudo = (
    <div
      className={inline ? 'h-full min-h-0 flex flex-col bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl w-full max-w-[95vw] max-h-[90vh] flex flex-col'}
      onClick={inline ? undefined : (e) => e.stopPropagation()}
    >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-600 shrink-0">
          <h2 id="modal-precos-coleta-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Preços — {coletaLabel}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={salvandoObservacoes}
            className="rounded p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 dark:hover:text-slate-200 disabled:opacity-50"
            aria-label="Fechar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 shrink-0">
          <div className="flex flex-col gap-1.5 text-sm text-slate-600 dark:text-slate-300">
            <div><strong className="text-slate-700 dark:text-slate-200">Data Criação:</strong> {dataCriacao ? formatarDataCriacao(dataCriacao) : '—'}</div>
            <div><strong className="text-slate-700 dark:text-slate-200">Usuário da Criação:</strong> {(usuarioCriacao ?? '—').toString().toUpperCase()}</div>
            <div>
              <strong className="text-slate-700 dark:text-slate-200">Status atual:</strong>{' '}
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  statusLocal === 'Em Aprovação'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200'
                    : statusLocal === 'Finalizada'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                      : statusLocal === 'Enviado para Financeiro'
                        ? 'bg-slate-200 text-slate-800 dark:bg-slate-600 dark:text-slate-200'
                        : statusLocal === 'Rejeitada'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                }`}
              >
                {statusLocal}
              </span>
            </div>
            {emAprovacao && tempoAprovacaoDisplay && (
              <div><strong className="text-slate-700 dark:text-slate-200">Tempo em aprovação:</strong> {tempoAprovacaoDisplay}</div>
            )}
          </div>
        </div>

        {(() => {
          const idsSolicitacoes = [...new Set(Object.values(solicitacoesPorProduto).flat())].filter((n) => n > 0).sort((a, b) => a - b);
          if (idsSolicitacoes.length === 0) return null;
          return (
            <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-600 bg-primary-50 dark:bg-primary-900/20 shrink-0">
              <p className="text-sm text-primary-800 dark:text-primary-200">
                <strong>Vinculado(s) à(s) solicitação(ões) de compra:</strong> {idsSolicitacoes.join(', ')}
              </p>
            </div>
          );
        })()}

        {podeEditarCompras && emCotacao && !rejeitada && (
          <div className="flex items-center justify-end gap-2 px-4 py-2 border-b border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shrink-0">
            <button
              type="button"
              onClick={async () => {
                setEnviandoAprovacao(true);
                const res = await enviarParaAprovacao(coletaId);
                setEnviandoAprovacao(false);
                if (res.ok) {
                  setStatusLocal('Em Aprovação');
                  setDataEnvioAprovacaoLocal(new Date().toISOString());
                  onColetaAlterada?.();
                }
              }}
              disabled={enviandoAprovacao}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50 transition"
            >
              {enviandoAprovacao ? 'Enviando…' : 'Enviar para aprovação'}
            </button>
            <button
              type="button"
              onClick={() => setModalAdicionarItens(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-sm font-medium transition"
            >
              Adicionar itens
            </button>
          </div>
        )}

        {podeEditarCompras && podeReabrir && (
          <div className="flex items-center justify-between gap-4 px-4 py-2 border-b border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shrink-0 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setModalReabrir(true)}
                disabled={reabrindo}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-sm font-medium transition disabled:opacity-50"
              >
                {reabrindo ? 'Reabrindo…' : 'Reabrir'}
              </button>
              <button
                type="button"
                onClick={() => setModalCancelar(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-amber-500 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30 text-sm font-medium transition"
              >
                Cancelar Cotação
              </button>
              <button
                type="button"
                onClick={() => setModalCancelarItem({ tipo: 'todos' })}
                disabled={cancelandoTodosItens || data.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-slate-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition disabled:opacity-50"
              >
                Cancelar todos os itens
              </button>
            </div>
            {emAprovacao && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setErro(null);
                    if (requerVinculoFinalizacao) {
                      await abrirModalFinalizarComVinculo();
                      return;
                    }
                    setEnviandoFinalizar(true);
                    const res = await finalizarCotacao(coletaId);
                    setEnviandoFinalizar(false);
                    if (res.ok) {
                      setStatusLocal('Finalizada');
                      onColetaAlterada?.();
                    } else {
                      setErro(res.error ?? 'Não foi possível finalizar a cotação.');
                    }
                  }}
                  disabled={enviandoFinalizar || enviandoFinanceiro}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50 transition"
                >
                  {enviandoFinalizar ? 'Finalizando…' : 'Finalizar Cotação'}
                </button>
              <button
                type="button"
                onClick={async () => {
                  setEnviandoFinanceiro(true);
                  const res = await enviarParaFinanceiro(coletaId);
                  setEnviandoFinanceiro(false);
                  if (res.ok) {
                    setStatusLocal('Enviado para Financeiro');
                    onColetaAlterada?.();
                  }
                }}
                disabled={enviandoFinalizar || enviandoFinanceiro}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-sm font-medium disabled:opacity-50 transition"
              >
                {enviandoFinanceiro ? 'Enviando…' : 'Enviar para Financeiro'}
              </button>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-auto px-4 py-3 min-h-[280px]">
          {erro && (
            <div className="mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
              {erro}
            </div>
          )}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 gap-3" aria-live="polite" aria-busy="true">
              <div className="w-10 h-10 border-2 border-primary-200 dark:border-slate-600 border-t-primary-600 dark:border-t-primary-400 rounded-full animate-spin" role="status" aria-label="Carregando" />
              <span className="text-sm text-slate-500 dark:text-slate-400 sr-only">Carregando produtos...</span>
            </div>
          )}
          {!loading && !temDados && (
            <div className="py-8">
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-3">
                {message || 'Nenhum registro de preço encontrado para esta coleta.'}
              </p>
              {debug && (
                <div className="mt-4 p-3 rounded-lg bg-slate-100 dark:bg-slate-700/50 text-left text-xs font-mono text-slate-600 dark:text-slate-300">
                  <div className="font-semibold mb-1">Diagnóstico (por que a grade não foi montada):</div>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>Registros já salvos para esta coleta: <strong>{debug.registrosSalvos ?? 0}</strong></li>
                    <li>Itens (produtos) na coleta: <strong>{debug.itensNaColeta ?? 0}</strong></li>
                    <li>Nomus configurado (NOMUS_DB_URL): <strong>{debug.nomusConfigurado ? 'Sim' : 'Não'}</strong></li>
                    {debug.nomusErro && (
                      <li className="text-amber-600 dark:text-amber-400 mt-1">Erro Nomus: {debug.nomusErro}</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
          {temDados && (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800">
              <table className="w-full text-sm text-left border-collapse min-w-full">
                <thead className="bg-primary-600 text-white sticky top-0 z-10">
                  <tr>
                    <th className="py-2 px-3 font-semibold whitespace-nowrap border-b border-primary-500 w-32">
                      Ações
                    </th>
                    {colunas.map((col) => (
                      <th
                        key={col.label}
                        className="py-2 px-3 font-semibold whitespace-nowrap border-b border-primary-500"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-slate-700 dark:text-slate-200 divide-y divide-slate-200 dark:divide-slate-600">
                  {data.map((row, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50 dark:hover:bg-slate-700/30"
                    >
                      <td className="py-2 px-3 border-b border-slate-100 dark:border-slate-700 align-middle">
                        <div className="flex flex-wrap items-center gap-1">
                          {podeEditarCompras && (emCotacao || emAprovacao) && (
                            <button
                              type="button"
                              onClick={() => setCadastrarPrecosRow(row as Record<string, unknown>)}
                              title={emAprovacao ? 'Visualizar preços e informar quantidade aprovada' : 'Cadastrar ou alterar preços por fornecedor'}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary-600 hover:bg-primary-700 text-white text-xs font-medium transition"
                            >
                              Cadastrar preços
                            </button>
                          )}
                          {podeEditarCompras && (emCotacao || emAprovacao) && (() => {
                            const idProduto = Number(getRowValue(row as Record<string, unknown>, ['Id Produto', 'id produto', 'idProduto']) ?? 0);
                            if (!idProduto) return null;
                            const labelExcluir = emCotacao ? 'Excluir da coleta' : 'Cancelar item';
                            return (
                              <button
                                type="button"
                                onClick={() => setModalCancelarItem({ tipo: 'item', idProduto })}
                                disabled={excluindoId != null}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-red-300 dark:border-red-700 bg-white dark:bg-slate-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-medium transition disabled:opacity-50"
                              >
                                {excluindoId === idProduto ? 'Aguarde…' : labelExcluir}
                              </button>
                            );
                          })()}
                        </div>
                      </td>
                      {colunas.map((col) => {
                        const value = getRowValue(row as Record<string, unknown>, col.keys);
                        const text = formatCell(value, col);
                        return (
                          <td
                            key={col.label}
                            className="py-2 px-3 whitespace-nowrap max-w-[200px] truncate border-b border-slate-100 dark:border-slate-700"
                            title={text}
                          >
                            {text}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Observações da coleta (texto longo; exibido no mapa de cotação) */}
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600">
            <label htmlFor="observacoes-coleta" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Observações
            </label>
            <textarea
              id="observacoes-coleta"
              value={observacoesLocal}
              onChange={(e) => setObservacoesLocal(e.target.value)}
              placeholder="Digite observações desta coleta (aparecem no mapa de cotação e no PDF). Salva automaticamente ao fechar."
              rows={4}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:focus:ring-primary-400 dark:focus:border-primary-400 resize-y min-h-[80px]"
            />
          </div>
        </div>

      {cadastrarPrecosRow && (
        <ModalCadastrarPrecos
          row={cadastrarPrecosRow}
          coletaId={coletaId}
          coletaLabel={coletaLabel}
          fornecedores={fornecedores}
          statusColeta={statusLocal ?? undefined}
          onClose={() => setCadastrarPrecosRow(null)}
          onSalvo={carregar}
        />
      )}

      {modalAdicionarItens && (
        <ModalCriarColetaPrecos
          coletaIdToAddTo={coletaId}
          onClose={() => {
            setModalAdicionarItens(false);
            carregar();
            onColetaAlterada?.();
          }}
        />
      )}

      {modalReabrir && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
          onClick={() => !reabrindo && setModalReabrir(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-reabrir-title"
        >
          <div
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl w-full max-w-md p-4 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="modal-reabrir-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Reabrir coleta
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              A coleta voltará ao status &quot;Em cotação&quot; e o tempo passará a contar como em cotação. Informe sua senha para confirmar:
            </p>
            <input
              type="password"
              value={senhaReabrir}
              onChange={(e) => setSenhaReabrir(e.target.value)}
              placeholder="Senha"
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm"
              disabled={reabrindo}
              autoComplete="current-password"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setModalReabrir(false); setSenhaReabrir(''); }}
                disabled={reabrindo}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!senhaReabrir.trim()) return;
                  setReabrindo(true);
                  setErro(null);
                  const res = await reabrirColeta(coletaId, senhaReabrir);
                  setReabrindo(false);
                  if (res.ok) {
                    setStatusLocal('Em cotação');
                    setDataEnvioAprovacaoLocal(null);
                    setModalReabrir(false);
                    setSenhaReabrir('');
                    onColetaAlterada?.();
                  } else {
                    setErro(res.error ?? 'Não foi possível reabrir.');
                  }
                }}
                disabled={!senhaReabrir.trim() || reabrindo}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50 transition"
              >
                {reabrindo ? 'Reabrindo…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalCancelar && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
          onClick={() => !cancelando && setModalCancelar(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-cancelar-title"
        >
          <div
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl w-full max-w-md p-4 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="modal-cancelar-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Cancelar Cotação
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              A coleta será marcada como &quot;Rejeitada&quot; e não poderá mais ser alterada. Informe a justificativa (obrigatória):
            </p>
            <textarea
              value={justificativaCancelar}
              onChange={(e) => setJustificativaCancelar(e.target.value)}
              placeholder="Justificativa para o cancelamento..."
              rows={4}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm resize-y min-h-[80px]"
              disabled={cancelando}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalCancelar(false)}
                disabled={cancelando}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const j = justificativaCancelar.trim();
                  if (!j) return;
                  setCancelando(true);
                  const res = await cancelarCotacao(coletaId, j);
                  setCancelando(false);
                  if (res.ok) {
                    setStatusLocal('Rejeitada');
                    setJustificativaCancelar('');
                    setModalCancelar(false);
                    onColetaAlterada?.();
                  }
                }}
                disabled={!justificativaCancelar.trim() || cancelando}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50 transition"
              >
                {cancelando ? 'Cancelando…' : 'Confirmar cancelamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalCancelarItem && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
          onClick={() => !cancelandoCancelarItem && setModalCancelarItem(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-cancelar-item-title"
        >
          <div
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl w-full max-w-md p-4 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="modal-cancelar-item-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {modalCancelarItem.tipo === 'todos' ? 'Cancelar todos os itens' : 'Cancelar item'}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {modalCancelarItem.tipo === 'todos'
                ? 'Todos os itens serão removidos desta coleta. Esta ação não pode ser desfeita. Informe a justificativa (obrigatória):'
                : 'O item será removido da coleta. Informe a justificativa (obrigatória):'}
            </p>
            <textarea
              value={justificativaCancelarItem}
              onChange={(e) => setJustificativaCancelarItem(e.target.value)}
              placeholder="Justificativa..."
              rows={4}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm resize-y min-h-[80px]"
              disabled={cancelandoCancelarItem}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !cancelandoCancelarItem && setModalCancelarItem(null)}
                disabled={cancelandoCancelarItem}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const j = justificativaCancelarItem.trim();
                  if (!j) return;
                  setCancelandoCancelarItem(true);
                  try {
                    if (modalCancelarItem.tipo === 'todos') {
                      setCancelandoTodosItens(true);
                      const res = await cancelarTodosItensColeta(coletaId, j);
                      setCancelandoTodosItens(false);
                      if (res.ok) {
                        setModalCancelarItem(null);
                        carregar();
                        onColetaAlterada?.();
                      }
                    } else if (modalCancelarItem.idProduto != null) {
                      setExcluindoId(modalCancelarItem.idProduto);
                      const res = await excluirItemColeta(coletaId, modalCancelarItem.idProduto, j);
                      setExcluindoId(null);
                      if (res.ok) {
                        setModalCancelarItem(null);
                        carregar();
                        onItemExcluido?.();
                      }
                    }
                  } finally {
                    setCancelandoCancelarItem(false);
                  }
                }}
                disabled={!justificativaCancelarItem.trim() || cancelandoCancelarItem}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 transition"
              >
                {cancelandoCancelarItem ? 'Aguarde…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalVinculoFinalizar && (
        <>
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60"
          onClick={() => !finalizandoComVinculo && !modalSqlErroOperacional && setModalVinculoFinalizar(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-vinculo-finalizar-title"
        >
          <div
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl w-full max-w-lg p-4 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="modal-vinculo-finalizar-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              Vincular à finalização
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Selecione um ou mais <strong className="font-medium">pedidos de compra</strong> e/ou <strong className="font-medium">cotações de preços</strong> no Nomus vinculados a esta coleta. Pesquise e clique para adicionar cada um à lista.
            </p>
            {podeRegistrarErroOperacionalVinculo && (
              <p className="text-xs text-amber-800 dark:text-amber-200/90 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/90 dark:bg-amber-900/25 px-2.5 py-2">
                Se o vínculo for excepcional (fora do fluxo usual), use <strong className="font-medium">Finalizar com erro operacional</strong>: abrirá uma lista ampliada de pedidos e cotações no Nomus para marcar os vínculos e, em seguida, sua senha. O registro alimentará o indicador no dashboard de compras.
              </p>
            )}
            {erro && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                {erro}
              </div>
            )}
            {vinculosSelecionados.length > 0 && (
              <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 p-2">
                {vinculosSelecionados.map((v) => (
                  <span
                    key={v.uniqueKey ?? `${v.id}-${(v.meta as { idRegistro?: number })?.idRegistro}`}
                    className="inline-flex items-center gap-1 max-w-full rounded-md bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 pl-2 pr-1 py-0.5 text-xs text-slate-800 dark:text-slate-100"
                  >
                    <span className="truncate max-w-[min(100%,280px)]" title={v.nome}>
                      {v.nome}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 dark:text-slate-300"
                      aria-label="Remover"
                      onClick={() =>
                        setVinculosSelecionados((prev) => prev.filter((p) => (p.uniqueKey ?? '') !== (v.uniqueKey ?? '')))
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <SingleSelectWithSearch
              label="Adicionar pedido ou cotação (nome / fornecedor)"
              placeholder="Pesquisar e clicar para adicionar…"
              options={opcoesVinculoLista}
              value={null}
              onChange={adicionarVinculoAoFinalizar}
              labelClass={labelClassFiltro}
              inputClass={inputClassFiltro}
              minWidth="100%"
              onSearchChange={carregarOpcoesVinculo}
              searchLoading={loadingOpcoesVinculo}
              listMaxHeight="220px"
              clearable={false}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setModalVinculoFinalizar(false);
                  setModalSqlErroOperacional(false);
                  setLinhasOpcoesErroOperacional([]);
                  setErroChecklistErroOp(null);
                  setFiltroLocalChecklistErroOp('');
                  setChavesSelecionadasErroOp([]);
                  setSenhaErroOperacional('');
                  setVinculosSelecionados([]);
                }}
                disabled={finalizandoComVinculo}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
              >
                Cancelar
              </button>
              <div className="flex flex-wrap gap-2 justify-end">
                {podeRegistrarErroOperacionalVinculo && (
                  <button
                    type="button"
                    onClick={() => {
                      setErro(null);
                      setErroChecklistErroOp(null);
                      setSenhaErroOperacional('');
                      setChavesSelecionadasErroOp([]);
                      setFiltroLocalChecklistErroOp('');
                      setLinhasOpcoesErroOperacional([]);
                      setModalSqlErroOperacional(true);
                      setCarregandoChecklistErroOp(true);
                      void (async () => {
                        const r = await listarOpcoesVinculoErroOperacional('');
                        setCarregandoChecklistErroOp(false);
                        if (r.error) setErroChecklistErroOp(r.error);
                        else setLinhasOpcoesErroOperacional(r.data);
                      })();
                    }}
                    disabled={finalizandoComVinculo}
                    className="px-4 py-2 rounded-lg border border-amber-600 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/45 disabled:opacity-50 transition"
                  >
                    Finalizar com erro operacional
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    const vinculos = vinculosSelecionados
                      .map((item) => {
                        const m = item.meta as { tipoRegistro?: string; idRegistro?: number } | undefined;
                        if (!m?.tipoRegistro || m.idRegistro == null) return null;
                        return {
                          tipoRegistro: (m.tipoRegistro === 'COTACAO' ? 'COTACAO' : 'PEDIDO') as 'PEDIDO' | 'COTACAO',
                          idRegistro: m.idRegistro,
                        };
                      })
                      .filter((x): x is { tipoRegistro: 'PEDIDO' | 'COTACAO'; idRegistro: number } => x != null);
                    if (vinculos.length === 0) {
                      setErro('Selecione ao menos um pedido de compra ou uma cotação para concluir.');
                      return;
                    }
                    setFinalizandoComVinculo(true);
                    setErro(null);
                    const res = await finalizarCotacao(coletaId, { vinculos });
                    setFinalizandoComVinculo(false);
                    if (res.ok) {
                      setModalVinculoFinalizar(false);
                      setModalSqlErroOperacional(false);
                      setLinhasOpcoesErroOperacional([]);
                      setErroChecklistErroOp(null);
                      setChavesSelecionadasErroOp([]);
                      setSenhaErroOperacional('');
                      setVinculosSelecionados([]);
                      setStatusLocal('Finalizada');
                      onColetaAlterada?.();
                    } else {
                      setErro(res.error ?? 'Não foi possível finalizar a cotação.');
                    }
                  }}
                  disabled={finalizandoComVinculo || vinculosSelecionados.length === 0}
                  className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50 transition"
                >
                  {finalizandoComVinculo ? 'Finalizando…' : 'Confirmar e finalizar'}
                </button>
              </div>
            </div>
          </div>
        </div>
        {modalSqlErroOperacional && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60"
            onClick={() => !finalizandoComVinculo && setModalSqlErroOperacional(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-checklist-erro-operacional-title"
          >
            <div
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] p-4 flex flex-col gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 id="modal-checklist-erro-operacional-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Confirmar erro operacional
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Lista ampliada de pedidos e cotações no Nomus (últimos 180 dias e status alargados). Marque um ou mais vínculos e informe sua senha para finalizar com registro de{' '}
                <strong className="font-medium">erro operacional</strong> no dashboard.
              </p>
              <label className="block text-xs text-slate-500 dark:text-slate-400">
                Filtrar na lista
                <input
                  type="search"
                  value={filtroLocalChecklistErroOp}
                  onChange={(e) => setFiltroLocalChecklistErroOp(e.target.value)}
                  placeholder="Nome, fornecedor ou data…"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm"
                  disabled={finalizandoComVinculo || carregandoChecklistErroOp}
                />
              </label>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {chavesSelecionadasErroOp.length} selecionado(s) · {linhasChecklistFiltradas.length} linha(s) exibida(s)
              </p>
              <div className="min-h-[160px] max-h-[42vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-600 divide-y divide-slate-200 dark:divide-slate-600">
                {carregandoChecklistErroOp ? (
                  <p className="p-4 text-sm text-slate-500">Carregando lista…</p>
                ) : linhasChecklistFiltradas.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">Nenhum registro para exibir. Ajuste o filtro ou verifique o Nomus.</p>
                ) : (
                  linhasChecklistFiltradas.map((row) => {
                    const k = `${row.tipoRegistro}-${row.id}`;
                    const checked = chavesSelecionadasErroOp.includes(k);
                    return (
                      <label
                        key={k}
                        className="flex items-start gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setChavesSelecionadasErroOp((prev) =>
                              prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
                            );
                          }}
                          className="mt-1 rounded border-slate-300 dark:border-slate-600"
                          disabled={finalizandoComVinculo}
                        />
                        <span className="text-sm text-slate-800 dark:text-slate-100 min-w-0">
                          <span className="font-medium">{row.nome}</span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {' '}
                            · {row.tipoRegistro === 'PEDIDO' ? 'Pedido' : 'Cotação'} #{row.id}
                          </span>
                          {(row.nomeFornecedor || row.dataEmissao) && (
                            <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {[row.nomeFornecedor, row.dataEmissao].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              {erroChecklistErroOp && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-800 dark:text-red-200">
                  {erroChecklistErroOp}
                </div>
              )}
              <label className="block text-sm text-slate-600 dark:text-slate-300">
                Senha
                <input
                  type="password"
                  value={senhaErroOperacional}
                  onChange={(e) => setSenhaErroOperacional(e.target.value)}
                  placeholder="Sua senha de login"
                  className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm"
                  disabled={finalizandoComVinculo}
                  autoComplete="current-password"
                />
              </label>
              {erro && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-800 dark:text-red-200">
                  {erro}
                </div>
              )}
              <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setModalSqlErroOperacional(false);
                    setSenhaErroOperacional('');
                    setErro(null);
                    setErroChecklistErroOp(null);
                    setChavesSelecionadasErroOp([]);
                    setFiltroLocalChecklistErroOp('');
                    setLinhasOpcoesErroOperacional([]);
                  }}
                  disabled={finalizandoComVinculo}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-600 disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const vinculos = chavesSelecionadasErroOp
                      .map((key) => chaveVinculoErroOpParaPayload(key))
                      .filter((x): x is { tipoRegistro: 'PEDIDO' | 'COTACAO'; idRegistro: number } => x != null);
                    if (vinculos.length === 0) {
                      setErro('Marque ao menos um pedido de compra ou uma cotação na lista acima.');
                      return;
                    }
                    if (!senhaErroOperacional.trim()) return;
                    setFinalizandoComVinculo(true);
                    setErro(null);
                    const res = await finalizarCotacao(coletaId, {
                      vinculos,
                      erroOperacional: true,
                      senha: senhaErroOperacional.trim(),
                    });
                    setFinalizandoComVinculo(false);
                    if (res.ok) {
                      setModalSqlErroOperacional(false);
                      setLinhasOpcoesErroOperacional([]);
                      setErroChecklistErroOp(null);
                      setChavesSelecionadasErroOp([]);
                      setFiltroLocalChecklistErroOp('');
                      setSenhaErroOperacional('');
                      setModalVinculoFinalizar(false);
                      setVinculosSelecionados([]);
                      setStatusLocal('Finalizada');
                      onColetaAlterada?.();
                    } else {
                      setErro(res.error ?? 'Não foi possível finalizar com registro de erro operacional.');
                    }
                  }}
                  disabled={
                    !senhaErroOperacional.trim() ||
                    finalizandoComVinculo ||
                    chavesSelecionadasErroOp.length === 0 ||
                    carregandoChecklistErroOp ||
                    !!erroChecklistErroOp
                  }
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50 transition"
                >
                  {finalizandoComVinculo ? 'Finalizando…' : 'Confirmar com senha e finalizar'}
                </button>
              </div>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  );

  if (inline) return conteudo;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-precos-coleta-title"
    >
      {conteudo}
    </div>
  );
}
