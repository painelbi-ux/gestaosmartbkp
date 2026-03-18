import { useState, useEffect, useCallback } from 'react';
import {
  listarTickets,
  obterTicketPorId,
  type TicketItem,
  type TicketDetalhe,
} from '../../api/integracao';

const labelClass = 'block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1';
const valueClass = 'text-sm text-slate-800 dark:text-slate-200';

function formatDate(s: string | null): string {
  if (!s?.trim()) return '—';
  const trimmed = s.trim().slice(0, 19);
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ConsultaTicketPage() {
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [ticketId, setTicketId] = useState<string>('');
  const [detalhe, setDetalhe] = useState<TicketDetalhe | null>(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregarTickets = useCallback(async () => {
    setLoadingTickets(true);
    setErro(null);
    try {
      const data = await listarTickets();
      setTickets(data);
      if (data.length > 0 && !ticketId) setTicketId(String(data[0].id));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar lista de tickets.');
      setTickets([]);
    } finally {
      setLoadingTickets(false);
    }
  }, []);

  useEffect(() => {
    carregarTickets();
  }, [carregarTickets]);

  useEffect(() => {
    const id = ticketId ? parseInt(ticketId, 10) : 0;
    if (!Number.isFinite(id) || id < 1) {
      setDetalhe(null);
      return;
    }
    setLoadingDetalhe(true);
    setErro(null);
    obterTicketPorId(id)
      .then((d) => setDetalhe(d ?? null))
      .catch((e) => {
        setErro(e instanceof Error ? e.message : 'Erro ao carregar detalhe do ticket.');
        setDetalhe(null);
      })
      .finally(() => setLoadingDetalhe(false));
  }, [ticketId]);

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Consulta por Ticket</h1>

      {/* Acima da grade: select do ID + informações */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-4 space-y-4">
        <div>
          <label htmlFor="ticket-select" className={labelClass}>
            Ticket (ID)
          </label>
          <select
            id="ticket-select"
            value={ticketId}
            onChange={(e) => setTicketId(e.target.value)}
            disabled={loadingTickets}
            className="w-full max-w-xs rounded-lg bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-100 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent disabled:opacity-50"
          >
            <option value="">Selecione...</option>
            {tickets.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.id} {t.titulo ? ` — ${t.titulo.length > 60 ? t.titulo.slice(0, 60) + '…' : t.titulo}` : ''}
              </option>
            ))}
          </select>
        </div>

        {erro && (
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            {erro}
          </div>
        )}

        {loadingDetalhe && ticketId && (
          <p className="text-sm text-slate-500 dark:text-slate-400">Carregando informações...</p>
        )}

        {!loadingDetalhe && detalhe && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-200 dark:border-slate-600">
            <div>
              <span className={labelClass}>Cliente</span>
              <p className={valueClass}>{detalhe.cliente ?? '—'}</p>
            </div>
            <div>
              <span className={labelClass}>Vendedor</span>
              <p className={valueClass}>{detalhe.vendedorrep ?? '—'}</p>
            </div>
            <div>
              <span className={labelClass}>Município</span>
              <p className={valueClass}>{detalhe.municipio ?? '—'}</p>
            </div>
            <div>
              <span className={labelClass}>UF</span>
              <p className={valueClass}>{detalhe.UF ?? '—'}</p>
            </div>
          </div>
        )}
      </div>

      {/* Grade: uma linha com o ticket selecionado */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-600">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Grade</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[600px]">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="py-3 px-4 font-semibold">ID</th>
                <th className="py-3 px-4 font-semibold">Título</th>
                <th className="py-3 px-4 font-semibold">Cliente</th>
                <th className="py-3 px-4 font-semibold">Vendedor</th>
                <th className="py-3 px-4 font-semibold">Município</th>
                <th className="py-3 px-4 font-semibold">UF</th>
                <th className="py-3 px-4 font-semibold">Data criação</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-200">
              {!detalhe && !loadingDetalhe && (
                <tr>
                  <td colSpan={7} className="py-8 px-4 text-center text-slate-500 dark:text-slate-400">
                    Selecione um ticket acima para exibir os dados na grade.
                  </td>
                </tr>
              )}
              {loadingDetalhe && ticketId && (
                <tr>
                  <td colSpan={7} className="py-8 px-4 text-center text-slate-500 dark:text-slate-400">
                    Carregando...
                  </td>
                </tr>
              )}
              {detalhe && !loadingDetalhe && (
                <tr className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                  <td className="py-3 px-4 font-medium tabular-nums">{detalhe.id}</td>
                  <td className="py-3 px-4 max-w-[200px] truncate" title={detalhe.titulo ?? ''}>
                    {detalhe.titulo ?? '—'}
                  </td>
                  <td className="py-3 px-4">{detalhe.cliente ?? '—'}</td>
                  <td className="py-3 px-4">{detalhe.vendedorrep ?? '—'}</td>
                  <td className="py-3 px-4">{detalhe.municipio ?? '—'}</td>
                  <td className="py-3 px-4">{detalhe.UF ?? '—'}</td>
                  <td className="py-3 px-4">{formatDate(detalhe.datacriacao)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
