import { useEffect, useState, useCallback } from 'react';
import {
  getSycroOrderOrders,
  getSycroOrderPedidosErp,
  createSycroOrderOrder,
  updateSycroOrderOrder,
  getSycroOrderHistory,
  getSycroOrderNotifications,
  markSycroOrderNotificationsRead,
  type SycroOrderOrder as Order,
  type SycroOrderHistoryItem,
  type SycroOrderNotification,
  type SycroOrderPedidoErp,
} from '../../api/sycroorder';
import SingleSelectWithSearch, { type OptionItem } from '../../components/SingleSelectWithSearch';

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
  { status: 'ESCALATED', label: 'Respondido', headerClass: 'bg-amber-400 text-slate-900 border-amber-500 dark:bg-amber-500 dark:text-slate-900 dark:border-amber-600' },
  { status: 'FINISHED', label: 'Atendido', headerClass: 'bg-green-500 text-white border-green-600 dark:bg-green-600 dark:border-green-700' },
];

export default function SycroOrderPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalNovo, setModalNovo] = useState(false);
  const [modalEditar, setModalEditar] = useState<Order | null>(null);
  const [modalHistorico, setModalHistorico] = useState<Order | null>(null);
  const [modalNotif, setModalNotif] = useState(false);
  const [history, setHistory] = useState<SycroOrderHistoryItem[]>([]);
  const [notifications, setNotifications] = useState<SycroOrderNotification[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTargetLane, setDropTargetLane] = useState<Order['status'] | null>(null);

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

  const filtered = orders.filter((o) => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return (
      o.order_number.toLowerCase().includes(term) ||
      (o.creator_name ?? '').toLowerCase().includes(term) ||
      (o.delivery_method ?? '').toLowerCase().includes(term)
    );
  });

  /** Pedidos por faixa, com entrega em 7 dias e urgentes no topo */
  const ordersByLane = (status: Order['status']) => {
    const lane = filtered.filter((o) => o.status === status);
    return [...lane].sort((a, b) => {
      const aPrioridade = (isPromisedWithin7Days(a.current_promised_date) || a.is_urgent) ? 1 : 0;
      const bPrioridade = (isPromisedWithin7Days(b.current_promised_date) || b.is_urgent) ? 1 : 0;
      return bPrioridade - aPrioridade;
    });
  };

  const moveOrder = useCallback(async (orderId: number, newStatus: Order['status']) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order || order.status === newStatus) return;
    if (newStatus === 'PENDING' && order.status !== 'PENDING') {
      setToast('Não é possível voltar para Aberto após a primeira resposta.');
      setTimeout(() => setToast(null), 4000);
      return;
    }
    setSaving(true);
    try {
      await updateSycroOrderOrder(orderId, { status: newStatus, new_date: order.current_promised_date });
      await carregar();
      setToast('Status atualizado.');
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar status.';
      setToast(msg.includes('primeira resposta') ? msg : 'Erro ao atualizar status.');
      setTimeout(() => setToast(null), 4000);
    } finally {
      setSaving(false);
    }
  }, [orders, carregar]);

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
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">SycroOrder</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={abrirNotificacoes}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700/50 transition"
          >
            Notificações
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

      {toast && (
        <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-2 text-sm text-green-800 dark:text-green-200">
          {toast}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <input
          type="text"
          placeholder="Buscar por número, criador, entrega..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-400 text-sm w-64"
        />
      </div>

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
              .sycro-card-urgent-7d { animation: sycro-blink-red 1.2s ease-in-out infinite; }
            `}</style>
            <div className="flex gap-4 p-4 min-h-[420px] w-full">
              {KANBAN_LANES.map(({ status, label, headerClass }) => (
                <div
                  key={status}
                  data-lane={status}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setDropTargetLane(status);
                  }}
                  onDragLeave={() => setDropTargetLane(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropTargetLane(null);
                    const id = e.dataTransfer.getData('application/sycroorder-order-id');
                    if (id) {
                      const order = orders.find((o) => o.id === Number(id));
                      if (status === 'PENDING' && order && order.status !== 'PENDING') {
                        setToast('Não é possível voltar para Aberto após a primeira resposta.');
                        setTimeout(() => setToast(null), 4000);
                      } else {
                        moveOrder(Number(id), status);
                      }
                    }
                    setDraggedId(null);
                  }}
                  className={`flex-1 min-w-0 flex flex-col rounded-xl border-2 transition-colors ${
                    dropTargetLane === status
                      ? 'border-primary-500 bg-primary-50/50 dark:bg-primary-900/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50'
                  }`}
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
                      return (
                        <div
                          key={o.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/sycroorder-order-id', String(o.id));
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggedId(o.id);
                          }}
                          onDragEnd={() => setDraggedId(null)}
                          className={`rounded-lg border-2 bg-white dark:bg-slate-800 shadow-sm cursor-grab active:cursor-grabbing ${
                            draggedId === o.id ? 'opacity-50' : 'hover:border-primary-400 dark:hover:border-primary-500'
                          } ${within7 ? 'sycro-card-urgent-7d border-red-500' : 'border-slate-200 dark:border-slate-600'}`}
                        >
                          <div className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-medium text-slate-800 dark:text-slate-200 text-sm">{o.order_number}</span>
                              <div className="flex flex-wrap gap-1 justify-end">
                                {within7 && (
                                  <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 flex-shrink-0">
                                    Entrega em 7 dias
                                  </span>
                                )}
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
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{o.delivery_method}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">Data: {formatDate(o.current_promised_date)}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-500">Criador: {o.creator_name ?? '—'}</p>
                            {(o.last_responder_name || o.last_response_at) ? (
                              <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">
                                Última resposta: {o.last_responder_name ?? '—'}
                                {o.last_response_at ? ` em ${formatDateTime(o.last_response_at)}` : ''}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                              <button type="button" onClick={() => abrirHistorico(o)} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">Histórico</button>
                              <button type="button" onClick={() => setModalEditar(o)} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">Atualizar</button>
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
          onClose={() => setModalEditar(null)}
          onSuccess={() => {
            setModalEditar(null);
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
                  {history.map((h) => (
                    <li key={h.id} className="relative pl-4 pb-1 border-l-2 border-primary-500 dark:border-primary-400 last:pb-0">
                      <span className="font-medium text-slate-800 dark:text-slate-200">{h.action_type}</span>
                      {h.user_name && <span className="text-slate-600 dark:text-slate-400"> — {h.user_name}</span>}
                      <span className="block text-xs text-slate-500 dark:text-slate-500 mt-0.5">{formatDateTime(h.created_at)}</span>
                      {h.observation && <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">{h.observation}</p>}
                    </li>
                  ))}
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
  const [promised_date, setPromised_date] = useState('');
  const [observation, setObservation] = useState('');
  const [is_urgent, setIs_urgent] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const order_number = selectedPedido?.nome ?? '';
    if (!order_number.trim() || !delivery_method.trim() || !promised_date.trim()) {
      setErro('Selecione o pedido (ERP), forma de entrega e data prometida.');
      return;
    }
    setSaving(true);
    try {
      await createSycroOrderOrder({
        order_number: order_number.trim(),
        delivery_method: delivery_method.trim(),
        promised_date: promised_date.trim(),
        observation: observation.trim() || undefined,
        is_urgent,
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
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data prometida *</label>
            <input type="date" value={promised_date} onChange={(e) => setPromised_date(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observação</label>
            <textarea value={observation} onChange={(e) => setObservation(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="urgent" checked={is_urgent} onChange={(e) => setIs_urgent(e.target.checked)} className="rounded border-slate-300 dark:border-slate-600" />
            <label htmlFor="urgent" className="text-sm text-slate-700 dark:text-slate-300">Urgente</label>
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

function ModalAtualizarPedido({
  order,
  onClose,
  onSuccess,
  saving,
  setSaving,
}: {
  order: Order;
  onClose: () => void;
  onSuccess: () => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
}) {
  const [status, setStatus] = useState<Order['status']>(order.status);
  const [new_date, setNew_date] = useState(order.current_promised_date);
  const [observation, setObservation] = useState('');
  const [is_urgent, setIs_urgent] = useState(!!order.is_urgent);
  const [erro, setErro] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setSaving(true);
    try {
      await updateSycroOrderOrder(order.id, { status, new_date, observation: observation.trim() || undefined, is_urgent });
      onSuccess();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao atualizar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit} className="p-4 space-y-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-200">Atualizar — {order.order_number}</h3>
          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as Order['status'])} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200">
              {order.status === 'PENDING' && <option value="PENDING">Aberto</option>}
              <option value="ESCALATED">Respondido</option>
              <option value="FINISHED">Atendido</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nova data prometida</label>
            <input type="date" value={new_date} onChange={(e) => setNew_date(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observação</label>
            <textarea value={observation} onChange={(e) => setObservation(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="urgent-upd" checked={is_urgent} onChange={(e) => setIs_urgent(e.target.checked)} className="rounded border-slate-300 dark:border-slate-600" />
            <label htmlFor="urgent-upd" className="text-sm text-slate-700 dark:text-slate-300">Urgente</label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium disabled:opacity-50">Salvar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
