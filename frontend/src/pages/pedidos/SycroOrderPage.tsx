import { useEffect, useState, useCallback } from 'react';
import {
  getSycroOrderOrders,
  getSycroOrderPedidosErp,
  createSycroOrderOrder,
  updateSycroOrderOrder,
  getSycroOrderHistory,
  getSycroOrderNotifications,
  markSycroOrderNotificationsRead,
  setSycroOrderRead,
  setSycroOrderTagDisponivel,
  searchSycroOrderUsers,
  type SycroOrderOrder as Order,
  type SycroOrderHistoryItem,
  type SycroOrderNotification,
  type SycroOrderPedidoErp,
} from '../../api/sycroorder';
import { listarMotivosSugestao, type MotivoSugestao } from '../../api/motivosSugestao';
import { listarPedidos } from '../../api/pedidos';
import SingleSelectWithSearch, { type OptionItem } from '../../components/SingleSelectWithSearch';
import ModalGerenciarMotivos from '../../components/ModalGerenciarMotivos';
import { useAuth } from '../../contexts/AuthContext';

function formatDate(iso: string): string {
  try {
    const [y, m, d] = iso.split('-');
    return d && m && y ? `${d}/${m}/${y}` : iso;
  } catch {
    return iso;
  }
}

/** Data prometida entre hoje e hoje + 7 dias (inclusive) */
function isPromisedWithin7Days(dateStr: string): boolean {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const promised = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in7 = new Date(today);
    in7.setDate(in7.getDate() + 7);
    in7.setHours(23, 59, 59, 999);
    return promised >= today && promised <= in7;
  } catch {
    return false;
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/** Faixas do Kanban: status do backend e cor do cabeçalho */
const KANBAN_LANES: { status: Order['status']; label: string; headerClass: string }[] = [
  { status: 'PENDING', label: 'Aberto', headerClass: 'bg-red-500 text-white border-red-600 dark:bg-red-600 dark:border-red-700' },
  { status: 'ESCALATED', label: 'Em andamento', headerClass: 'bg-amber-400 text-slate-900 border-amber-500 dark:bg-amber-500 dark:text-slate-900 dark:border-amber-600' },
  { status: 'FINISHED', label: 'Faturado/Entregue', headerClass: 'bg-green-500 text-white border-green-600 dark:bg-green-600 dark:border-green-700' },
];

export default function SycroOrderPage() {
  const { login, grupo } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalNovo, setModalNovo] = useState(false);
  const [modalEditar, setModalEditar] = useState<Order | null>(null);
  const [modalEditarTagDisponivel, setModalEditarTagDisponivel] = useState<boolean | null>(null);
  const [tagLoadingOrderId, setTagLoadingOrderId] = useState<number | null>(null);
  const [modalHistorico, setModalHistorico] = useState<Order | null>(null);
  const [modalNotif, setModalNotif] = useState(false);
  const [mostrarFiltros, setMostrarFiltros] = useState(true);
  const [history, setHistory] = useState<SycroOrderHistoryItem[]>([]);
  const [notifications, setNotifications] = useState<SycroOrderNotification[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<{
    pedido: string[];
    criadoPor: string[];
    ultimaRespostaPor: string[];
    formaEntrega: string[];
    responsavel: string[];
    entrega7d: 'todos' | 'sim' | 'nao';
    leitura: 'todos' | 'lidos' | 'nao_lidos';
  }>({ pedido: [], criadoPor: [], ultimaRespostaPor: [], formaEntrega: [], responsavel: [], entrega7d: 'todos', leitura: 'todos' });
  const [buscaFiltro, setBuscaFiltro] = useState<{
    pedido: string;
    criadoPor: string;
    ultimaRespostaPor: string;
    formaEntrega: string;
    responsavel: string;
  }>({ pedido: '', criadoPor: '', ultimaRespostaPor: '', formaEntrega: '', responsavel: '' });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getSycroOrderOrders();
      setOrders(list);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    // Mantém o contador de não lidas no botão sem necessidade de clicar.
    getSycroOrderNotifications()
      .then(setNotifications)
      .catch(() => setNotifications([]));
  }, []);

  const acionarTagDisponivel = useCallback(
    async (order: Order, available: boolean) => {
      setTagLoadingOrderId(order.id);
      try {
        await setSycroOrderTagDisponivel(order.id, available);
        setToast(available ? 'DISPONÍVEL ativado.' : 'NÃO DISPONÍVEL ativado.');
        setTimeout(() => setToast(null), 3000);
        await carregar();
      } catch (err) {
        setToast(err instanceof Error ? err.message : 'Erro ao atualizar a TAG de disponibilidade.');
        setTimeout(() => setToast(null), 5000);
      } finally {
        setTagLoadingOrderId(null);
      }
    },
    [carregar]
  );

  const filteredBySearch = orders;

  const hasResponsavel = (dm: string) => {
    const fm = (dm ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    return (
      (fm.includes('entrega') && fm.includes('grande')) ||
      (fm.includes('retirada') && fm.includes('moveis')) ||
      fm.includes('so aco')
    );
  };

  const filtered = filteredBySearch.filter((o) => {
    if (filtros.pedido.length > 0 && !filtros.pedido.includes(o.order_number)) return false;
    const criador = (o.creator_name ?? '').trim() || '—';
    if (filtros.criadoPor.length > 0 && !filtros.criadoPor.includes(criador)) return false;
    const ultimaResp = (o.last_responder_name ?? '').trim() || '—';
    if (filtros.ultimaRespostaPor.length > 0 && !filtros.ultimaRespostaPor.includes(ultimaResp)) return false;
    const forma = (o.delivery_method ?? '').trim() || '—';
    if (filtros.formaEntrega.length > 0 && !filtros.formaEntrega.includes(forma)) return false;
    const resp = hasResponsavel(o.delivery_method ?? '') ? 'josenildo' : 'outros';
    if (filtros.responsavel.length > 0 && !filtros.responsavel.includes(resp)) return false;
    if (filtros.entrega7d !== 'todos') {
      const within7 = isPromisedWithin7Days(o.current_promised_date);
      if (filtros.entrega7d === 'sim' && !within7) return false;
      if (filtros.entrega7d === 'nao' && within7) return false;
    }
    if (filtros.leitura !== 'todos') {
      const isRead = !!o.read_by_me;
      if (filtros.leitura === 'lidos' && !isRead) return false;
      if (filtros.leitura === 'nao_lidos' && isRead) return false;
    }
    return true;
  });

  /** Pedidos por faixa: no topo os mais recentes (criados ou atualizados) */
  const ordersByLane = (status: Order['status']) => {
    const lane = filtered.filter((o) => o.status === status);
    return [...lane].sort((a, b) => {
      const aAt = a.last_response_at || a.created_at;
      const bAt = b.last_response_at || b.created_at;
      return new Date(bAt).getTime() - new Date(aAt).getTime();
    });
  };


  const abrirHistorico = async (order: Order) => {
    setModalHistorico(order);
    try {
      const list = await getSycroOrderHistory(order.id);
      setHistory(list);
    } catch {
      setHistory([]);
    }
  };

  const abrirNotificacoes = async () => {
    setModalNotif(true);
    try {
      const list = await getSycroOrderNotifications();
      setNotifications(list);
    } catch {
      setNotifications([]);
    }
  };

  const marcarLidas = async () => {
    try {
      await markSycroOrderNotificationsRead();
      const list = await getSycroOrderNotifications();
      setNotifications(list);
    } catch {}
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Comunicação PD</h2>
          <button
            type="button"
            onClick={() => setMostrarFiltros((v) => !v)}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
            title={mostrarFiltros ? 'Ocultar filtros' : 'Exibir filtros'}
            aria-label={mostrarFiltros ? 'Ocultar filtros' : 'Exibir filtros'}
          >
            {mostrarFiltros ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {toast && (
        <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-2 text-sm text-green-800 dark:text-green-200">
          {toast}
        </div>
      )}

      {mostrarFiltros && (() => {
        const opPedido = [...new Set(filteredBySearch.map((o) => o.order_number))].sort();
        const opCriadoPor = [...new Set(filteredBySearch.map((o) => (o.creator_name ?? '').trim() || '—'))].sort();
        const opUltimaResposta = [...new Set(filteredBySearch.map((o) => (o.last_responder_name ?? '').trim() || '—'))].sort();
        const opFormaEntrega = [...new Set(filteredBySearch.map((o) => (o.delivery_method ?? '').trim() || '—'))].sort();
        const toggle = (key: Exclude<keyof typeof filtros, 'entrega7d'>, value: string) => {
          setFiltros((prev) => {
            const arr = prev[key];
            const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
            return { ...prev, [key]: next };
          });
        };
        const filterBySearch = (term: string, options: string[]) => {
          const t = term.trim().toLowerCase();
          if (!t) return options;
          return options.filter((v) => v.toLowerCase().includes(t));
        };
        const searchInputClass = 'w-full px-2 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-400 mb-1.5';
        const opPedidoFiltrado = filterBySearch(buscaFiltro.pedido, opPedido);
        const opCriadoPorFiltrado = filterBySearch(buscaFiltro.criadoPor, opCriadoPor);
        const opUltimaRespostaFiltrado = filterBySearch(buscaFiltro.ultimaRespostaPor, opUltimaResposta);
        const opFormaEntregaFiltrado = filterBySearch(buscaFiltro.formaEntrega, opFormaEntrega);
        // Opções do filtro devem refletir apenas os cards existentes.
        // Quando não há cards, a lista precisa ficar vazia (evita exibir "josenildo/outros" para nada).
        const opResponsavel = [...new Set(filteredBySearch.map((o) => (hasResponsavel(o.delivery_method ?? '') ? 'josenildo' : 'outros')))].sort();
        const opResponsavelFiltrado = filterBySearch(buscaFiltro.responsavel, opResponsavel);
        const temFiltro =
          filtros.pedido.length > 0 ||
          filtros.criadoPor.length > 0 ||
          filtros.ultimaRespostaPor.length > 0 ||
          filtros.formaEntrega.length > 0 ||
          filtros.responsavel.length > 0 ||
          filtros.entrega7d !== 'todos' ||
          filtros.leitura !== 'todos';
        const listClass = 'flex flex-col gap-0.5 max-h-32 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-lg p-2 bg-slate-50 dark:bg-slate-800/50 min-w-[140px]';
        const itemClass = 'flex items-center gap-2 py-1 px-2 rounded text-sm cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50';
        const labelClass = 'text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5';
        return (
          <div className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Filtros</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={abrirNotificacoes}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  Notificações
                  {notifications.filter((n) => !n.is_read).length > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center min-w-5 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-xs font-semibold">
                      {notifications.filter((n) => !n.is_read).length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setModalNovo(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Novo Pedido
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-wrap gap-6">
                <div>
                  <p className={labelClass}>Pedido</p>
                  <input type="text" placeholder="Pesquisar..." value={buscaFiltro.pedido} onChange={(e) => setBuscaFiltro((p) => ({ ...p, pedido: e.target.value }))} className={searchInputClass} />
                  <ul className={listClass} role="list">
                    {opPedidoFiltrado.slice(0, 30).map((v) => (
                      <li key={v}>
                        <label className={itemClass}>
                          <input type="checkbox" checked={filtros.pedido.includes(v)} onChange={() => toggle('pedido', v)} className="rounded border-slate-300 dark:border-slate-600" />
                          <span className="text-slate-700 dark:text-slate-300 truncate" title={v}>{v}</span>
                        </label>
                      </li>
                    ))}
                    {opPedidoFiltrado.length > 30 && <li className="px-2 py-0.5 text-xs text-slate-500">+{opPedidoFiltrado.length - 30}</li>}
                  </ul>
                </div>
                <div>
                  <p className={labelClass}>Criado por</p>
                  <input type="text" placeholder="Pesquisar..." value={buscaFiltro.criadoPor} onChange={(e) => setBuscaFiltro((p) => ({ ...p, criadoPor: e.target.value }))} className={searchInputClass} />
                  <ul className={listClass} role="list">
                    {opCriadoPorFiltrado.map((v) => (
                      <li key={v}>
                        <label className={itemClass}>
                          <input type="checkbox" checked={filtros.criadoPor.includes(v)} onChange={() => toggle('criadoPor', v)} className="rounded border-slate-300 dark:border-slate-600" />
                          <span className="text-slate-700 dark:text-slate-300 truncate" title={v}>{v}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className={labelClass}>Última resposta por</p>
                  <input type="text" placeholder="Pesquisar..." value={buscaFiltro.ultimaRespostaPor} onChange={(e) => setBuscaFiltro((p) => ({ ...p, ultimaRespostaPor: e.target.value }))} className={searchInputClass} />
                  <ul className={listClass} role="list">
                    {opUltimaRespostaFiltrado.map((v) => (
                      <li key={v}>
                        <label className={itemClass}>
                          <input type="checkbox" checked={filtros.ultimaRespostaPor.includes(v)} onChange={() => toggle('ultimaRespostaPor', v)} className="rounded border-slate-300 dark:border-slate-600" />
                          <span className="text-slate-700 dark:text-slate-300 truncate" title={v}>{v}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className={labelClass}>Forma de entrega</p>
                  <input type="text" placeholder="Pesquisar..." value={buscaFiltro.formaEntrega} onChange={(e) => setBuscaFiltro((p) => ({ ...p, formaEntrega: e.target.value }))} className={searchInputClass} />
                  <ul className={`${listClass} min-w-[200px]`}>
                    {opFormaEntregaFiltrado.map((v) => (
                      <li key={v}>
                        <label className={itemClass}>
                          <input type="checkbox" checked={filtros.formaEntrega.includes(v)} onChange={() => toggle('formaEntrega', v)} className="rounded border-slate-300 dark:border-slate-600 flex-shrink-0" />
                          <span className="text-slate-700 dark:text-slate-300 truncate" title={v}>{v}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className={labelClass}>Responsável por responder</p>
                  <input type="text" placeholder="Pesquisar..." value={buscaFiltro.responsavel} onChange={(e) => setBuscaFiltro((p) => ({ ...p, responsavel: e.target.value }))} className={searchInputClass} />
                  <ul className={listClass} role="list">
                    {opResponsavelFiltrado.map((v) => (
                      <li key={v}>
                        <label className={itemClass}>
                          <input type="checkbox" checked={filtros.responsavel.includes(v)} onChange={() => toggle('responsavel', v)} className="rounded border-slate-300 dark:border-slate-600" />
                          <span className="text-slate-700 dark:text-slate-300">{v === 'josenildo' ? 'josenildo' : 'Outros'}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className={labelClass}>Leitura</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFiltros((p) => ({ ...p, leitura: 'nao_lidos' }))}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                        filtros.leitura === 'nao_lidos'
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      Não lidos
                    </button>
                    <button
                      type="button"
                      onClick={() => setFiltros((p) => ({ ...p, leitura: 'lidos' }))}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                        filtros.leitura === 'lidos'
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      Lidos
                    </button>
                    <button
                      type="button"
                      onClick={() => setFiltros((p) => ({ ...p, leitura: 'todos' }))}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                        filtros.leitura === 'todos'
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      Todos
                    </button>
                  </div>
                </div>
                <div>
                  <p className={labelClass}>Entrega em 7 dias</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setFiltros((p) => ({ ...p, entrega7d: 'sim' }))}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                        filtros.entrega7d === 'sim'
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      Sim
                    </button>
                    <button
                      type="button"
                      onClick={() => setFiltros((p) => ({ ...p, entrega7d: 'nao' }))}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                        filtros.entrega7d === 'nao'
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      Não
                    </button>
                    <button
                      type="button"
                      onClick={() => setFiltros((p) => ({ ...p, entrega7d: 'todos' }))}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                        filtros.entrega7d === 'todos'
                          ? 'bg-primary-600 border-primary-600 text-white'
                          : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      Todos
                    </button>
                  </div>
                </div>
              </div>
              {temFiltro && (
                <button
                  type="button"
                  onClick={() =>
                    setFiltros({
                      pedido: [],
                      criadoPor: [],
                      ultimaRespostaPor: [],
                      formaEntrega: [],
                      responsavel: [],
                      entrega7d: 'todos',
                      leitura: 'todos',
                    })
                  }
                  className="text-sm text-primary-600 dark:text-primary-400 hover:underline self-center"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>
        );
      })()}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/50 bg-slate-50 dark:bg-slate-800/30 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400">Nenhum pedido encontrado.</div>
        ) : (
          <>
            <style>{`
              @keyframes sycro-blink-red {
                0%, 100% { border-color: rgb(239 68 68); box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.5); }
                50% { border-color: rgb(239 68 68 / 0.4); box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.15); }
              }
              .sycro-card-unread { animation: sycro-blink-red 1.2s ease-in-out infinite; }
            `}</style>
            <div className="flex gap-4 p-4 min-h-[420px] w-full">
              {KANBAN_LANES.map(({ status, label, headerClass }) => (
                <div
                  key={status}
                  data-lane={status}
                  className="flex-1 min-w-0 flex flex-col rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50"
                >
                  <div className={`px-3 py-2 border-b rounded-t-xl flex items-center justify-between ${headerClass}`}>
                    <span className="font-medium">{label}</span>
                    <span className="text-xs opacity-90 bg-black/10 dark:bg-white/20 px-2 py-0.5 rounded">
                      {ordersByLane(status).length}
                    </span>
                  </div>
                  <div className="p-2 space-y-2 min-h-[320px] overflow-y-auto max-h-[calc(100vh - 280px)] flex-1">
                    {ordersByLane(status).map((o) => {
                      const within7 = isPromisedWithin7Days(o.current_promised_date);
                      const unread = !o.read_by_me && o.status !== 'FINISHED';
                      const loginNorm = (login ?? '').toLowerCase();
                      const grupoNorm = (grupo ?? '').toLowerCase();
                      const isAdminGrupo = grupoNorm === 'admin' || grupoNorm === 'administrador';
                      const isControlTagUser = isAdminGrupo || loginNorm === 'josenildo' || loginNorm === 'viniciusrodrigues';
                      const farolUsers = ['wellingtonsousa', 'francelino', 'marcosamorim', 'gilvania'];
                      const isFarolUser = farolUsers.includes(loginNorm);
                      const tagDesejado = !!o.tag_disponivel;
                      const showTag = isControlTagUser || (isFarolUser && tagDesejado);
                      const tagDisabled = o.status === 'FINISHED';
                      return (
                        <div
                          key={o.id}
                          className={`rounded-lg border-2 bg-white dark:bg-slate-800 shadow-sm hover:border-primary-400 dark:hover:border-primary-500 ${
                            unread ? 'sycro-card-unread border-red-500' : 'border-slate-200 dark:border-slate-600'
                          }`}
                        >
                          <div className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-1.5 min-w-0">
                                <span
                                  title={o.read_by_me ? 'Lido' : 'Não lido'}
                                  className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${o.read_by_me ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                  aria-hidden
                                />
                                <div className="flex flex-col min-w-0">
                                  <span className="font-medium text-slate-800 dark:text-slate-200 text-sm truncate">{o.order_number}</span>
                                  <p className="text-xs text-slate-600 dark:text-slate-400 truncate" title={o.cliente_name ?? '—'}>
                                    {o.cliente_name ?? '—'}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-1 justify-end">
                                {within7 && o.status !== 'FINISHED' && (
                                  <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 flex-shrink-0">
                                    Entrega em 7 dias
                                  </span>
                                )}
                                {(() => {
                                  const fm = (o.delivery_method ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
                                  const direcionadoJosenildo =
                                    (fm.includes('entrega') && fm.includes('grande')) ||
                                    (fm.includes('retirada') && fm.includes('moveis')) ||
                                    fm.includes('so aco');
                                  return direcionadoJosenildo ? (
                                    <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-primary-100 dark:bg-primary-900/50 text-primary-800 dark:text-primary-200 flex-shrink-0">
                                      Responsável por responder: josenildo
                                    </span>
                                  ) : (
                                    <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-primary-100 dark:bg-primary-900/50 text-primary-800 dark:text-primary-200 flex-shrink-0">
                                      Responsável por responder: PCP
                                    </span>
                                  );
                                })()}
                                {o.is_urgent ? (
                                  <>
                                    <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 flex-shrink-0">Urgente</span>
                                    <span className="inline-flex flex-shrink-0 text-red-600 dark:text-red-400" title="Urgente" aria-hidden>
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                                    </span>
                                  </>
                                ) : null}
                              </div>
                            </div>
                            {showTag && (
                              <div className="flex justify-end mt-1">
                                {isControlTagUser && !tagDisabled ? (
                                  <button
                                    type="button"
                                    disabled={tagLoadingOrderId === o.id}
                                    onClick={() => {
                                      if (o.tag_disponivel) {
                                        setModalEditarTagDisponivel(false);
                                        setModalEditar(o);
                                        setSycroOrderRead(o.id, true).then(() => carregar()).catch(() => {});
                                      } else {
                                        acionarTagDisponivel(o, true);
                                      }
                                    }}
                                    className={`inline-flex px-2 py-1 rounded text-xs font-medium border transition ${
                                      o.tag_disponivel
                                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                                        : 'bg-slate-500/20 text-slate-300 dark:text-slate-400 border-slate-500/30'
                                    }`}
                                  >
                                    {o.tag_disponivel ? 'DISPONÍVEL' : 'NÃO DISPONÍVEL'}
                                  </button>
                                ) : (
                                  <span
                                    className={`inline-flex px-2 py-1 rounded text-xs font-medium border ${
                                      o.tag_disponivel
                                        ? 'bg-emerald-600 text-white border-emerald-700'
                                        : 'bg-slate-500/20 text-slate-300 dark:text-slate-400 border-slate-500/30'
                                    }`}
                                  >
                                    {o.tag_disponivel ? 'DISPONÍVEL' : 'NÃO DISPONÍVEL'}
                                  </span>
                                )}
                              </div>
                            )}
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{o.delivery_method}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">Data original: {formatDate(o.data_original ?? o.current_promised_date)}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-500">Previsão atual: {formatDate(o.previsao_atual ?? o.current_promised_date)}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-500">Criador: {o.creator_name ?? '—'}</p>
                            {(o.last_responder_name || o.last_response_at) ? (
                              <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                                Última resposta: {o.last_responder_name ?? '—'}
                                {o.last_response_at ? ` em ${formatDateTime(o.last_response_at)}` : ''}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                              <button type="button" onClick={() => { abrirHistorico(o); setSycroOrderRead(o.id, true).then(() => carregar()).catch(() => {}); }} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">Histórico</button>
                              {o.can_respond !== false ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setModalEditarTagDisponivel(null);
                                    setModalEditar(o);
                                    setSycroOrderRead(o.id, true).then(() => carregar()).catch(() => {});
                                  }}
                                  className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                                >
                                  Atualizar
                                </button>
                              ) : (
                                <span className="text-xs text-slate-500 dark:text-slate-400">Apenas visualização</span>
                              )}
                              {o.read_by_me && o.status !== 'FINISHED' && (
                                <button type="button" onClick={() => setSycroOrderRead(o.id, false).then(() => carregar()).catch(() => {})} className="text-xs text-slate-500 dark:text-slate-400 hover:underline">Marcar como não lida</button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal Novo Pedido */}
      {modalNovo && (
        <ModalNovoPedido
          onClose={() => setModalNovo(false)}
          onSuccess={() => {
            setModalNovo(false);
            carregar();
            setToast('Pedido criado.');
            setTimeout(() => setToast(null), 3000);
          }}
          saving={saving}
          setSaving={setSaving}
        />
      )}

      {/* Modal Atualizar */}
      {modalEditar && (
        <ModalAtualizarPedido
          order={modalEditar}
          tagDisponivelToSet={modalEditarTagDisponivel}
          onClose={() => {
            setModalEditar(null);
            setModalEditarTagDisponivel(null);
          }}
          onSuccess={() => {
            setModalEditar(null);
            setModalEditarTagDisponivel(null);
            carregar();
            setToast('Pedido atualizado.');
            setTimeout(() => setToast(null), 3000);
          }}
          saving={saving}
          setSaving={setSaving}
        />
      )}

      {/* Modal Histórico */}
      {modalHistorico && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setModalHistorico(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-historico-title"
        >
          <div
            className="rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-600 shrink-0">
              <h2 id="modal-historico-title" className="text-lg font-semibold text-slate-800 dark:text-slate-100">
                Histórico — {modalHistorico.order_number}
              </h2>
              <button
                type="button"
                onClick={() => setModalHistorico(null)}
                className="rounded-lg p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-700 transition"
                aria-label="Fechar"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1 min-h-0">
              {history.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400 text-sm">Nenhum registro.</p>
              ) : (
                <ul className="space-y-4">
                  {history.map((h) => {
                    const prevDateFormatted = h.previous_date ? formatDate(h.previous_date) : null;
                    const newDateFormatted = h.new_date ? formatDate(h.new_date) : null;
                    const mostraNovaPrevisao = !!newDateFormatted;
                    const isCreate = h.action_type === 'CREATE';
                    const isUpdate = h.action_type === 'UPDATE';
                    const dateChanged = !!(h.previous_date && h.new_date && h.previous_date !== h.new_date);
                    return (
                      <li key={h.id} className="relative pl-4 pb-1 border-l-2 border-primary-500 dark:border-primary-400 last:pb-0">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          {h.action_type === 'AUTO_ATENDIDO'
                            ? 'Atendido automaticamente'
                            : h.action_type === 'AJUSTE_PREVISAO'
                              ? 'Ajuste de previsão'
                              : h.action_type === 'TAG_DISPONIVEL_TRUE'
                                ? 'Tag: DISPONÍVEL'
                                : h.action_type === 'TAG_DISPONIVEL_FALSE'
                                  ? 'Tag: NÃO DISPONÍVEL'
                              : h.action_type}
                        </span>
                        {h.user_name && <span className="text-slate-600 dark:text-slate-400"> — {h.user_name}</span>}
                        {h.product_code && (
                          <span className="text-slate-600 dark:text-slate-400" title={h.product_code === 'Todos os itens' ? 'Alteração aplicada a todos os itens' : 'Códigos dos produtos'}>
                            · {h.product_code === 'Todos os itens' ? 'Todos os itens' : `Cód. ${h.product_code}`}
                          </span>
                        )}
                        <span className="block text-xs text-slate-500 dark:text-slate-500 mt-0.5">{formatDateTime(h.created_at)}</span>
                        {isCreate ? (
                          <div className="mt-1 space-y-0.5">
                            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                              Data original: {formatDate(modalHistorico.data_original ?? modalHistorico.current_promised_date)}
                            </p>
                            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">
                              Previsão atual: {formatDate(modalHistorico.previsao_atual ?? modalHistorico.current_promised_date)}
                            </p>
                          </div>
                        ) : (
                          isUpdate ? (
                            mostraNovaPrevisao ? (
                              dateChanged ? (
                                <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 font-medium">
                                  {prevDateFormatted && newDateFormatted ? `Nova previsão ${prevDateFormatted} alterada para ${newDateFormatted}` : `Nova previsão alterada para ${newDateFormatted}`}
                                </p>
                              ) : (
                                <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 font-medium">
                                  Previsão atual: {newDateFormatted}
                                </p>
                              )
                            ) : null
                          ) : (
                            mostraNovaPrevisao && (
                              <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 font-medium">
                                {prevDateFormatted && newDateFormatted && h.previous_date !== h.new_date
                                  ? `Nova previsão ${prevDateFormatted} alterada para ${newDateFormatted}`
                                  : `Nova previsão alterada para ${newDateFormatted}`}
                              </p>
                            )
                          )
                        )}
                        {h.observation && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">{h.observation}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Notificações */}
      {modalNotif && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setModalNotif(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-semibold text-slate-800 dark:text-slate-200">Notificações</h3>
              <div className="flex items-center gap-2">
                <button type="button" onClick={marcarLidas} className="text-sm text-primary-600 dark:text-primary-400 hover:underline">Marcar como lidas</button>
                <button type="button" onClick={() => setModalNotif(false)} className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">✕</button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              {notifications.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400 text-sm">Nenhuma notificação.</p>
              ) : (
                <ul className="space-y-2">
                  {notifications.map((n) => (
                    <li key={n.id} className={`text-sm py-2 px-3 rounded-lg ${n.is_read ? 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400' : 'bg-primary-50 dark:bg-primary-900/20 text-slate-800 dark:text-slate-200'}`}>
                      {n.message}
                      <span className="block text-xs text-slate-500 dark:text-slate-500 mt-1">{formatDateTime(n.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModalNovoPedido({
  onClose,
  onSuccess,
  saving,
  setSaving,
}: {
  onClose: () => void;
  onSuccess: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
}) {
  const [pedidosErpList, setPedidosErpList] = useState<SycroOrderPedidoErp[]>([]);
  const [pedidosErpOptions, setPedidosErpOptions] = useState<OptionItem[]>([]);
  const [selectedPedido, setSelectedPedido] = useState<OptionItem | null>(null);
  const [loadingPedidos, setLoadingPedidos] = useState(false);
  const [searchPedidoLoading, setSearchPedidoLoading] = useState(false);
  const [delivery_method, setDelivery_method] = useState('');
  const [observation, setObservation] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [itensPedido, setItensPedido] = useState<ItemPedido[]>([]);
  const [loadingItens, setLoadingItens] = useState(false);
  const [selectedIdPedidos, setSelectedIdPedidos] = useState<Set<string>>(new Set());

  const selectedPedidoFull = selectedPedido ? pedidosErpList.find((p) => p.id === selectedPedido.id) : null;

  useEffect(() => {
    let cancelled = false;
    setLoadingPedidos(true);
    getSycroOrderPedidosErp()
      .then((list) => {
        if (cancelled) return;
        setPedidosErpList(list);
        const opts: OptionItem[] = list.map((p) => ({
          id: p.id,
          nome: p.nome,
          descricao: `Cliente: ${p.cliente ?? '—'} — Emissão: ${formatDate(p.dataEmissao)}`,
        }));
        setPedidosErpOptions(opts);
      })
      .catch(() => {
        if (!cancelled) setPedidosErpList([]);
        if (!cancelled) setPedidosErpOptions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingPedidos(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleSearchPedido = useCallback((term: string) => {
    const t = term.trim();
    if (!t) {
      setSearchPedidoLoading(false);
      getSycroOrderPedidosErp().then((list) => {
        setPedidosErpList(list);
        setPedidosErpOptions(list.map((p) => ({
          id: p.id,
          nome: p.nome,
          descricao: `Cliente: ${p.cliente ?? '—'} — Emissão: ${formatDate(p.dataEmissao)}`,
        })));
      }).catch(() => {});
      return;
    }
    setSearchPedidoLoading(true);
    getSycroOrderPedidosErp({ nome: t })
      .then((list) => {
        setPedidosErpList(list);
        setPedidosErpOptions(list.map((p) => ({
          id: p.id,
          nome: p.nome,
          descricao: `Cliente: ${p.cliente ?? '—'} — Emissão: ${formatDate(p.dataEmissao)}`,
        })));
      })
      .catch(() => {
        setPedidosErpList([]);
        setPedidosErpOptions([]);
      })
      .finally(() => setSearchPedidoLoading(false));
  }, []);

  const handleSelectPedido = (value: OptionItem | null) => {
    setSelectedPedido(value);
    const pedido = value ? pedidosErpList.find((p) => p.id === value.id) : null;
    setDelivery_method(pedido?.rota ?? '');
  };

  useEffect(() => {
    const pdRaw = (selectedPedido?.nome ?? '').trim();
    // Normaliza para extrair apenas números (ex.: "PD 47483" -> "47483"),
    // evitando problemas com espaços/formatos diferentes do rótulo exibido.
    const pdDigits = pdRaw.replace(/\D+/g, '');
    const pd = pdDigits || pdRaw;
    if (!pdRaw) {
      setItensPedido([]);
      setSelectedIdPedidos(new Set());
      return;
    }
    let cancelled = false;
    setLoadingItens(true);
    listarPedidos({ pd, limit: 500 })
      .then((res) => {
        if (cancelled) return;
        const itens: ItemPedido[] = (res.data ?? [])
          .map((row: Record<string, unknown>) => ({
            id_pedido: String(row.id_pedido ?? '').trim(),
            cod: String(row.Cod ?? row.cod ?? '—').trim(),
            descricao: String(row['Descricao do produto'] ?? row.descricao ?? '—').trim(),
          }))
          .filter((i) => i.id_pedido);
        const itensOrdenados = [...itens].sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
        setItensPedido(itensOrdenados);
        setSelectedIdPedidos(new Set(itensOrdenados.map((i) => i.id_pedido)));
      })
      .catch(() => {
        if (cancelled) return;
        setItensPedido([]);
        setSelectedIdPedidos(new Set());
        // Se a listagem falhar (ex.: permissões), manter UI coerente e mostrar motivo ao usuário.
        setErro('Erro ao carregar os itens do pedido. Verifique suas permissões e tente novamente.');
      })
      .finally(() => {
        if (!cancelled) setLoadingItens(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPedido?.nome]);

  const toggleItemNovo = (id: string) => {
    setSelectedIdPedidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const order_number = selectedPedido?.nome ?? '';
    if (!order_number.trim() || !delivery_method.trim()) {
      setErro('Selecione o pedido (ERP) e a forma de entrega.');
      return;
    }
    if (selectedIdPedidos.size === 0) {
      setErro('Selecione ao menos um item do pedido.');
      return;
    }
    setSaving(true);
    try {
      const dataOriginal = selectedPedidoFull?.dataOriginalEntrega;
      const promisedDate = (dataOriginal && String(dataOriginal).trim().slice(0, 10)) || new Date().toISOString().slice(0, 10);
      await createSycroOrderOrder({
        order_number: order_number.trim(),
        delivery_method: delivery_method.trim(),
        promised_date: promisedDate,
        observation: observation.trim() || undefined,
        id_pedidos: [...selectedIdPedidos],
      });
      onSuccess();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao criar pedido.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit} className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Novo Pedido</h3>
          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Número do pedido *</label>
            <SingleSelectWithSearch
              label=""
              placeholder="Pesquisar e selecionar pedido (ERP)..."
              options={pedidosErpOptions}
              value={selectedPedido}
              onChange={handleSelectPedido}
              onSearchChange={handleSearchPedido}
              searchLoading={searchPedidoLoading}
              labelClass="sr-only"
              inputClass="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm"
              listMaxHeight="180px"
              clearable
            />
            {(loadingPedidos || searchPedidoLoading) && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {loadingPedidos ? 'Carregando pedidos do ERP...' : 'Buscando...'}
              </p>
            )}
          </div>
          {selectedPedidoFull && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data Original de Entrega</label>
              <p className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 text-slate-700 dark:text-slate-300 text-sm">
                {selectedPedidoFull.dataOriginalEntrega ? formatDate(selectedPedidoFull.dataOriginalEntrega) : '—'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Conforme Gerenciador de Pedidos</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Forma de entrega *</label>
            <input
              type="text"
              value={delivery_method}
              onChange={(e) => setDelivery_method(e.target.value)}
              placeholder="Preenchido pela rota do pedido ao selecionar"
              disabled={!!selectedPedidoFull}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 disabled:opacity-80 disabled:cursor-not-allowed disabled:bg-slate-100 dark:disabled:bg-slate-800/70"
              required
            />
            {(() => {
              const fm = delivery_method.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
              const direcionadoJosenildo =
                (fm.includes('entrega') && fm.includes('grande')) ||
                (fm.includes('retirada') && fm.includes('moveis')) ||
                fm.includes('so aco');
              return direcionadoJosenildo ? (
                <p className="mt-1.5 text-sm text-primary-600 dark:text-primary-400 font-medium">
                  Responsável por responder: josenildo
                </p>
              ) : null;
            })()}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Comentários</label>
            <textarea value={observation} onChange={(e) => setObservation(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Itens do pedido</label>
            {loadingItens ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-2">Carregando itens...</p>
            ) : itensPedido.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-2">Nenhum item encontrado para este pedido.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setSelectedIdPedidos(new Set(itensPedido.map((i) => i.id_pedido)))}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Selecionar todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIdPedidos(new Set())}
                    className="text-xs text-slate-500 dark:text-slate-400 hover:underline"
                  >
                    Limpar seleção
                  </button>
                </div>
                <div className="overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-lg p-2 max-h-40 bg-slate-50 dark:bg-slate-800/50">
                  {itensPedido.map((item) => (
                    <label key={item.id_pedido} className="flex items-start gap-2 py-1.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded px-2">
                      <input
                        type="checkbox"
                        checked={selectedIdPedidos.has(item.id_pedido)}
                        onChange={() => toggleItemNovo(item.id_pedido)}
                        className="mt-1 rounded border-slate-300 dark:border-slate-600"
                      />
                      <span className="text-sm text-slate-800 dark:text-slate-200">
                        <strong>{item.cod}</strong> — {item.descricao}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Escolha quais itens esse card vai acompanhar (evita duplicidade por itens).</p>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50">Criar</button>
          </div>
        </form>
      </div>
    </div>
  );
}

type DialogStep = null | 'todos_itens' | 'sim_motivo' | 'nao_itens';

interface ItemPedido {
  id_pedido: string;
  cod: string;
  descricao: string;
}

function ModalAtualizarPedido({
  order,
  tagDisponivelToSet,
  onClose,
  onSuccess,
  saving,
  setSaving,
}: {
  order: Order;
  tagDisponivelToSet?: boolean | null;
  onClose: () => void;
  onSuccess: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
}) {
  const { login, grupo } = useAuth();
  const podeGerenciarMotivos = login === 'master' || login === 'admin' || login === 'marquesfilho' || grupo === 'admin' || grupo === 'Administrador';
  const isAdminGrupo = (grupo ?? '').toLowerCase() === 'admin' || (grupo ?? '').toLowerCase() === 'administrador';
  const isCommentOnlyUser = ['wellingtonsousa', 'francelino', 'marcosamorim', 'gilvania'].includes((login ?? '').toLowerCase()) && !isAdminGrupo;

  const [querInformarNovaData, setQuerInformarNovaData] = useState<'sim' | 'nao' | null>(null);
  const [new_date, setNew_date] = useState(order.current_promised_date);
  const [observation, setObservation] = useState('');
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionCandidates, setMentionCandidates] = useState<Array<{ login: string; nome: string | null }>>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const q = mentionQuery.trim();
    if (!q || q.length < 2 || !mentionOpen) {
      setMentionCandidates([]);
      return;
    }
    let cancelled = false;
    setMentionLoading(true);
    searchSycroOrderUsers(q)
      .then((list) => {
        if (cancelled) return;
        setMentionCandidates(list);
      })
      .catch(() => {
        if (cancelled) return;
        setMentionCandidates([]);
      })
      .finally(() => {
        if (cancelled) return;
        setMentionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mentionQuery, mentionOpen, isCommentOnlyUser]);

  const [dialogStep, setDialogStep] = useState<DialogStep>(null);
  const [motivos, setMotivos] = useState<MotivoSugestao[]>([]);
  const [loadingMotivos, setLoadingMotivos] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [itensPedido, setItensPedido] = useState<ItemPedido[]>([]);
  const [loadingItens, setLoadingItens] = useState(false);
  const [selectedIdPedidos, setSelectedIdPedidos] = useState<Set<string>>(new Set());
  const [observacaoItens, setObservacaoItens] = useState('');
  const [observacaoSim, setObservacaoSim] = useState('');
  const [abrirGerenciarMotivos, setAbrirGerenciarMotivos] = useState(false);

  const novaDataPreenchida = new_date.trim() !== '';
  const dataAlterada = novaDataPreenchida && new_date.trim() !== order.current_promised_date.trim();

  const carregarMotivos = useCallback(() => {
    setLoadingMotivos(true);
    listarMotivosSugestao()
      .then(setMotivos)
      .catch(() => setMotivos([]))
      .finally(() => setLoadingMotivos(false));
  }, []);

  const handleSalvarClick = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (isCommentOnlyUser) {
      if (!observation.trim()) {
        setErro('Comentário é obrigatório.');
        return;
      }
      submitDireto();
      return;
    }
    if (querInformarNovaData === null) {
      setErro('Selecione "sim" ou "Não".');
      return;
    }
    if (querInformarNovaData !== 'sim') {
      if (!observation.trim()) {
        setErro('Comentário é obrigatório quando não informar uma nova data prometida.');
        return;
      }
      submitDireto();
      return;
    }
    if (dataAlterada) {
      setDialogStep('todos_itens');
      return;
    }
    // Escolheu informar nova data, mas não alterou: salva apenas com comentário (opcional)
    submitDireto();
  };

  const submitDireto = async (payload?: { motivo?: string; id_pedidos?: string[]; observacao?: string }) => {
    setSaving(true);
    try {
      await updateSycroOrderOrder(order.id, {
        ...(isCommentOnlyUser ? {} : (querInformarNovaData === 'sim' ? { new_date: new_date.trim() || undefined } : {})),
        ...(tagDisponivelToSet === undefined || tagDisponivelToSet === null ? {} : { tag_disponivel: tagDisponivelToSet }),
        comentario: observation.trim() || undefined,
        observacao: payload?.observacao?.trim() || undefined,
        motivo: payload?.motivo?.trim() || undefined,
        id_pedidos: payload?.id_pedidos?.length ? payload.id_pedidos : undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao atualizar.');
    } finally {
      setSaving(false);
    }
  };

  const handleTodosItensSim = () => {
    setDialogStep('sim_motivo');
    carregarMotivos();
  };

  const handleTodosItensNao = () => {
    setDialogStep('nao_itens');
    setLoadingItens(true);
    listarPedidos({ pd: order.order_number, limit: 500 })
      .then((res) => {
        const itens: ItemPedido[] = (res.data ?? []).map((row: Record<string, unknown>) => ({
          id_pedido: String(row.id_pedido ?? '').trim(),
          cod: String(row.Cod ?? row.cod ?? '—').trim(),
          descricao: String(row['Descricao do produto'] ?? row.descricao ?? '—').trim(),
        })).filter((i) => i.id_pedido);
        const itensOrdenados = [...itens].sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
        setItensPedido(itensOrdenados);
        setSelectedIdPedidos(new Set(itensOrdenados.map((i) => i.id_pedido)));
      })
      .catch(() => setItensPedido([]))
      .finally(() => setLoadingItens(false));
    carregarMotivos();
  };

  const toggleItem = (id: string) => {
    setSelectedIdPedidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmitSimMotivo = (e: React.FormEvent) => {
    e.preventDefault();
    const motivoTrim = motivo.trim();
    if (!motivoTrim) {
      setErro('Selecione um motivo.');
      return;
    }
    setErro(null);
    submitDireto({ motivo: motivoTrim, observacao: observacaoSim.trim() || undefined });
  };

  const handleSubmitNaoItens = (e: React.FormEvent) => {
    e.preventDefault();
    const motivoTrim = motivo.trim();
    if (!motivoTrim) {
      setErro('Selecione um motivo.');
      return;
    }
    const ids = [...selectedIdPedidos];
    if (ids.length === 0) {
      setErro('Selecione ao menos um item do pedido.');
      return;
    }
    setErro(null);
    submitDireto({ motivo: motivoTrim, id_pedidos: ids, observacao: observacaoItens.trim() || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {dialogStep === null && (
          <form onSubmit={handleSalvarClick} className="p-4 space-y-4 overflow-y-auto">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">Atualizar — {order.order_number}</h3>
            {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
            {!isCommentOnlyUser && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Deseja informar uma nova data prometida?</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setQuerInformarNovaData((p) => (p === 'sim' ? null : 'sim'))}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                      querInformarNovaData === 'sim'
                        ? 'bg-primary-600 border-primary-600 text-white'
                        : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuerInformarNovaData((p) => (p === 'nao' ? null : 'nao'))}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
                      querInformarNovaData === 'nao'
                        ? 'bg-primary-600 border-primary-600 text-white'
                        : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    Não
                  </button>
                </div>
                {querInformarNovaData === 'sim' && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nova data prometida</label>
                    <input
                      type="date"
                      value={new_date}
                      onChange={(e) => setNew_date(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                    />
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Comentários</label>
              <div className="relative">
                <textarea
                  value={observation}
                  onChange={(e) => {
                    const next = e.target.value;
                    setObservation(next);
                    const m = next.match(/@([a-zA-Z0-9_.]+)$/);
                    if (m && (m[1] ?? '').trim()) {
                      setMentionQuery(String(m[1] ?? '').trim());
                      setMentionOpen(true);
                    } else {
                      setMentionQuery('');
                      setMentionOpen(false);
                      setMentionCandidates([]);
                    }
                  }}
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />
                {mentionOpen && mentionCandidates.length > 0 && !mentionLoading && (
                  <div className="absolute left-0 right-0 z-20 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg">
                    {mentionCandidates.map((u) => (
                      <button
                        key={u.login}
                        type="button"
                        onClick={() => {
                          setObservation((prev) => (prev ? prev.replace(/@([a-zA-Z0-9_.]+)$/, `@${u.login}`) : `@${u.login}`));
                          setMentionQuery('');
                          setMentionOpen(false);
                          setMentionCandidates([]);
                        }}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-800 dark:text-slate-200"
                      >
                        @{u.login}{u.nome ? ` — ${u.nome}` : ''}
                      </button>
                    ))}
                  </div>
                )}
                {mentionOpen && mentionLoading && (
                  <div className="absolute left-0 right-0 z-20 mt-1 px-3 py-2 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-600">
                    Buscando...
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm">Cancelar</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50">Salvar</button>
            </div>
          </form>
        )}

        {dialogStep === 'todos_itens' && (
          <div className="p-4 space-y-4">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">Atualizar — {order.order_number}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">A alteração deve ser para todos os itens do pedido?</p>
            <div className="flex gap-3">
              <button type="button" onClick={handleTodosItensSim} className="flex-1 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium">Sim</button>
              <button type="button" onClick={handleTodosItensNao} className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium">Não</button>
            </div>
            <button type="button" onClick={() => setDialogStep(null)} className="text-sm text-slate-500 dark:text-slate-400 hover:underline">Voltar</button>
          </div>
        )}

        {dialogStep === 'sim_motivo' && (
          <form onSubmit={handleSubmitSimMotivo} className="p-4 space-y-4 overflow-y-auto">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200">Atualizar — {order.order_number}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">Alteração para todos os itens. Selecione o motivo.</p>
            {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Motivo</label>
                {podeGerenciarMotivos && (
                  <button type="button" onClick={() => setAbrirGerenciarMotivos(true)} className="text-xs text-primary-600 dark:text-primary-400 hover:underline" title="Gerenciar motivos">Gerenciar motivos</button>
                )}
              </div>
              <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" required>
                <option value="">Selecione um motivo</option>
                {motivos.map((m) => (
                  <option key={m.id} value={m.descricao}>{m.descricao}</option>
                ))}
              </select>
              {loadingMotivos && <p className="text-xs text-slate-500 mt-1">Carregando motivos...</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observação</label>
              <textarea value={observacaoSim} onChange={(e) => setObservacaoSim(e.target.value)} rows={2} placeholder="Opcional" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-500" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDialogStep('todos_itens')} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm">Voltar</button>
              <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50">Salvar</button>
            </div>
          </form>
        )}

        {dialogStep === 'nao_itens' && (
          <form onSubmit={handleSubmitNaoItens} className="p-4 flex flex-col min-h-0 flex-1 overflow-hidden">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 shrink-0">Atualizar — {order.order_number}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 shrink-0 mb-2">Selecione os itens que devem receber o ajuste e o motivo.</p>
            {erro && <p className="text-sm text-red-600 dark:text-red-400 shrink-0">{erro}</p>}
            {loadingItens ? (
              <p className="text-sm text-slate-500 py-4">Carregando itens...</p>
            ) : (
              <>
                <div className="mb-3 overflow-y-auto flex-1 min-h-0 border border-slate-200 dark:border-slate-600 rounded-lg p-2 max-h-48">
                  {itensPedido.map((item) => (
                    <label key={item.id_pedido} className="flex items-start gap-2 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded px-2">
                      <input type="checkbox" checked={selectedIdPedidos.has(item.id_pedido)} onChange={() => toggleItem(item.id_pedido)} className="mt-1 rounded border-slate-300 dark:border-slate-600" />
                      <span className="text-sm text-slate-800 dark:text-slate-200"><strong>{item.cod}</strong> — {item.descricao}</span>
                    </label>
                  ))}
                </div>
                <div className="shrink-0 mb-3">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observação</label>
                  <textarea value={observacaoItens} onChange={(e) => setObservacaoItens(e.target.value)} rows={2} placeholder="Opcional" className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-500" />
                </div>
                <div className="shrink-0 mb-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Motivo</label>
                    {podeGerenciarMotivos && (
                      <button type="button" onClick={() => setAbrirGerenciarMotivos(true)} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">Gerenciar motivos</button>
                    )}
                  </div>
                  <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" required>
                    <option value="">Selecione um motivo</option>
                    {motivos.map((m) => (
                      <option key={m.id} value={m.descricao}>{m.descricao}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2 shrink-0">
                  <button type="button" onClick={() => setDialogStep('todos_itens')} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm">Voltar</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50">Salvar</button>
                </div>
              </>
            )}
          </form>
        )}

        {abrirGerenciarMotivos && podeGerenciarMotivos && (
          <ModalGerenciarMotivos
            onClose={() => setAbrirGerenciarMotivos(false)}
            onError={(msg) => setErro(msg)}
            onAtualizado={carregarMotivos}
          />
        )}
      </div>
    </div>
  );
}
