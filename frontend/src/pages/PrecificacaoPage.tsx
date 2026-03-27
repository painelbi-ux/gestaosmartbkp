import { useState, useEffect, useCallback, useMemo } from 'react';
import { MensagemSemRegistrosInline } from '../components/MensagemSemRegistros';
import ModalPrecificar from '../components/precificacao/ModalPrecificar';
import ModalResultadoPrecificacao from '../components/precificacao/ModalResultadoPrecificacao';
import {
  listPrecificacoes,
  getPrecificacaoResultado,
  type PrecificacaoListItem,
  type PrecificacaoIniciarResponse,
} from '../api/engenharia';

export type PrecificacaoRow = PrecificacaoListItem;

function formatarData(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', {
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

export default function PrecificacaoPage() {
  const [precificacoes, setPrecificacoes] = useState<PrecificacaoRow[]>([]);
  const [filtroDraft, setFiltroDraft] = useState({
    codigoProduto: '',
    descricaoProduto: '',
    usuario: '',
    data: '',
  });
  const [filtroAplicado, setFiltroAplicado] = useState({
    codigoProduto: '',
    descricaoProduto: '',
    usuario: '',
    data: '',
  });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modalPrecificarAberto, setModalPrecificarAberto] = useState(false);
  const [resultadoModal, setResultadoModal] = useState<{
    idPrecificacao: number;
    codigoProduto: string;
    descricaoProduto: string;
    ncmCodigo?: string | null;
    dataPrecificacao?: string;
    usuario?: string;
    itens: PrecificacaoIniciarResponse['itens'];
    valoresCampos?: Record<string, string> | null;
    ticketCrmId?: number | null;
  } | null>(null);

  const carregarLista = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data, error } = await listPrecificacoes();
      if (error) setErro(error);
      else setPrecificacoes(data);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
      setPrecificacoes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarLista();
  }, [carregarLista]);

  const precificacoesFiltradas = useMemo(() => {
    const cod = filtroAplicado.codigoProduto.trim().toLowerCase();
    const desc = filtroAplicado.descricaoProduto.trim().toLowerCase();
    const user = filtroAplicado.usuario.trim().toLowerCase();
    const data = filtroAplicado.data.trim().toLowerCase();
    if (!cod && !desc && !user && !data) return precificacoes;
    return precificacoes.filter((p) => {
      const pcod = (p.codigoProduto ?? '').toLowerCase();
      const pdesc = (p.descricaoProduto ?? '').toLowerCase();
      const puser = (p.usuario ?? '').toLowerCase();
      const pdate = (p.data ?? '').toLowerCase();
      if (cod && !pcod.includes(cod)) return false;
      if (desc && !pdesc.includes(desc)) return false;
      if (user && !puser.includes(user)) return false;
      if (data && !pdate.includes(data)) return false;
      return true;
    });
  }, [precificacoes, filtroAplicado]);

  const aplicarFiltros = () => {
    setFiltroAplicado({ ...filtroDraft });
  };

  const limparFiltros = () => {
    const empty = { codigoProduto: '', descricaoProduto: '', usuario: '', data: '' };
    setFiltroDraft(empty);
    setFiltroAplicado(empty);
  };

  const handleIniciado = useCallback((data: PrecificacaoIniciarResponse) => {
    setPrecificacoes((prev) => [
      {
        id: data.precificacao.id,
        codigoProduto: data.precificacao.codigoProduto ?? '',
        descricaoProduto: data.precificacao.descricaoProduto ?? '',
        data: data.precificacao.data,
        usuario: data.precificacao.usuario ?? '',
      },
      ...prev,
    ]);
    setResultadoModal({
      idPrecificacao: data.precificacao.id,
      codigoProduto: data.precificacao.codigoProduto ?? '',
      descricaoProduto: data.precificacao.descricaoProduto ?? '',
      ncmCodigo: data.precificacao.ncmCodigo ?? null,
      dataPrecificacao: data.precificacao.data ?? '',
      usuario: data.precificacao.usuario ?? '',
      itens: Array.isArray(data.itens) ? data.itens : [],
      valoresCampos: data.precificacao.valoresCampos ?? undefined,
      ticketCrmId: data.precificacao.ticketCrmId ?? null,
    });
  }, []);

  const handleAbrirResultado = useCallback(async (id: number) => {
    const { data, error } = await getPrecificacaoResultado(id);
    if (error || !data) {
      setErro(error ?? 'Não foi possível carregar o resultado.');
      return;
    }
    setResultadoModal({
      idPrecificacao: data.precificacao.id,
      codigoProduto: data.precificacao.codigoProduto ?? '',
      descricaoProduto: data.precificacao.descricaoProduto ?? '',
      ncmCodigo: data.precificacao.ncmCodigo ?? null,
      dataPrecificacao: data.precificacao.data ?? '',
      usuario: data.precificacao.usuario ?? '',
      itens: Array.isArray(data.itens) ? data.itens : [],
      valoresCampos: data.precificacao.valoresCampos ?? null,
      ticketCrmId: data.precificacao.ticketCrmId ?? null,
    });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Precificação</h2>
        <button
          type="button"
          onClick={() => setModalPrecificarAberto(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition"
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
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Precificar
        </button>
      </div>

      {erro && (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {erro}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 min-w-[180px]">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Código do Produto</span>
            <input
              type="text"
              placeholder="Filtrar..."
              value={filtroDraft.codigoProduto}
              onChange={(e) => setFiltroDraft((p) => ({ ...p, codigoProduto: e.target.value }))}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1 min-w-[260px] flex-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Descrição do Produto</span>
            <input
              type="text"
              placeholder="Filtrar..."
              value={filtroDraft.descricaoProduto}
              onChange={(e) => setFiltroDraft((p) => ({ ...p, descricaoProduto: e.target.value }))}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1 min-w-[160px]">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Usuário</span>
            <input
              type="text"
              placeholder="Filtrar..."
              value={filtroDraft.usuario}
              onChange={(e) => setFiltroDraft((p) => ({ ...p, usuario: e.target.value }))}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1 min-w-[180px]">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Data</span>
            <input
              type="text"
              placeholder="YYYY-MM-DD..."
              value={filtroDraft.data}
              onChange={(e) => setFiltroDraft((p) => ({ ...p, data: e.target.value }))}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </label>
          <button
            type="button"
            onClick={aplicarFiltros}
            className="text-sm px-3 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
            title="Filtrar na lista carregada"
          >
            Filtrar
          </button>
          {(filtroAplicado.codigoProduto || filtroAplicado.descricaoProduto || filtroAplicado.usuario || filtroAplicado.data) && (
            <button
              type="button"
              onClick={limparFiltros}
              className="text-sm px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              title="Limpar filtros"
            >
              Limpar filtros
            </button>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Mostrando {precificacoesFiltradas.length} de {precificacoes.length} registro(s)
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-primary-600 text-white">
              <tr>
                <th className="py-3 px-4 font-semibold">#</th>
                <th className="py-3 px-4 font-semibold">Código do Produto</th>
                <th className="py-3 px-4 font-semibold">Descrição do Produto</th>
                <th className="py-3 px-4 font-semibold">Data</th>
                <th className="py-3 px-4 font-semibold">Usuário</th>
                <th className="py-3 px-4 font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="text-slate-700 dark:text-slate-200">
              {loading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500 dark:text-slate-400">
                    Carregando...
                  </td>
                </tr>
              )}
              {!loading && precificacoesFiltradas.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 px-4 text-center">
                    <MensagemSemRegistrosInline />
                  </td>
                </tr>
              )}
              {!loading &&
                precificacoesFiltradas.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30"
                  >
                    <td className="py-3 px-4 font-medium tabular-nums">{p.id}</td>
                    <td className="py-3 px-4">{p.codigoProduto}</td>
                    <td className="py-3 px-4">{p.descricaoProduto}</td>
                    <td className="py-3 px-4">{formatarData(p.data)}</td>
                    <td className="py-3 px-4">{p.usuario || '—'}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleAbrirResultado(p.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 text-xs font-medium transition"
                          title="Ver resultado da precificação"
                        >
                          Ver resultado
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalPrecificarAberto && (
        <ModalPrecificar
          onClose={() => setModalPrecificarAberto(false)}
          onIniciado={handleIniciado}
        />
      )}

      {resultadoModal && (
        <ModalResultadoPrecificacao
          idPrecificacao={resultadoModal.idPrecificacao}
          codigoProduto={resultadoModal.codigoProduto}
          descricaoProduto={resultadoModal.descricaoProduto}
          ncmCodigo={resultadoModal.ncmCodigo}
          dataPrecificacao={resultadoModal.dataPrecificacao}
          usuario={resultadoModal.usuario}
          itens={resultadoModal.itens}
          initialValores={resultadoModal.valoresCampos ?? undefined}
          initialTicketCrmId={resultadoModal.ticketCrmId ?? null}
          onTicketSalvo={(ticketCrmId) =>
            setResultadoModal((r) => (r ? { ...r, ticketCrmId } : null))
          }
          onClose={() => setResultadoModal(null)}
        />
      )}
    </div>
  );
}
