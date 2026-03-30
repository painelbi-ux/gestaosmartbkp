import { useEffect, useState, useCallback, useRef } from 'react';
import CardsResumo from '../components/CardsResumo';
import CardsResumoFinanceiro from '../components/CardsResumoFinanceiro';
import FiltroPedidos, { type FiltrosPedidosState, defaultFiltros } from '../components/FiltroPedidos';
import TabelaPedidos from '../components/TabelaPedidos';
import { loadFiltrosDashboard, saveFiltrosDashboard } from '../utils/persistFiltros';
import ModalAjustePrevisao from '../components/ModalAjustePrevisao';
import {
  listarPedidos,
  obterResumo,
  obterResumoFinanceiro,
  type Pedido,
  type Resumo,
  type ResumoFinanceiro,
} from '../api/pedidos';
import { logout } from '../api/auth';

const PAGE_SIZE = 100;

const filtrosIniciais: FiltrosPedidosState = {
  ...defaultFiltros,
  data_ini: '',
  data_fim: '',
};

function toApiFiltros(f: FiltrosPedidosState) {
  return {
    cliente: f.cliente?.trim() || undefined,
    data_ini: f.data_ini || undefined,
    data_fim: f.data_fim || undefined,
    atrasados: f.atrasados || undefined,
    observacoes: f.observacoes?.trim() || undefined,
    pd: f.pd?.trim() || undefined,
    grupo_produto: f.grupo_produto?.trim() || undefined,
    municipio_entrega: f.municipio_entrega?.trim() || undefined,
  };
}

export default function Dashboard() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [resumoFinanceiro, setResumoFinanceiro] = useState<ResumoFinanceiro | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingResumo, setLoadingResumo] = useState(true);
  const [loadingResumoFinanceiro, setLoadingResumoFinanceiro] = useState(true);
  const [loadingPedidos, setLoadingPedidos] = useState(true);
  const [filtros, setFiltros] = useState<FiltrosPedidosState>(() => loadFiltrosDashboard(filtrosIniciais));
  const filtrosRef = useRef<FiltrosPedidosState>(filtrosIniciais);
  const [modalPedido, setModalPedido] = useState<Pedido | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mostrarFiltros, setMostrarFiltros] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const carregarResumo = useCallback(async () => {
    setLoadingResumo(true);
    try {
      const r = await obterResumo();
      setResumo(r);
    } catch {
      setResumo(null);
    } finally {
      setLoadingResumo(false);
    }
  }, []);

  const carregarResumoFinanceiro = useCallback(async () => {
    setLoadingResumoFinanceiro(true);
    try {
      const r = await obterResumoFinanceiro();
      setResumoFinanceiro(r);
    } catch {
      setResumoFinanceiro(null);
    } finally {
      setLoadingResumoFinanceiro(false);
    }
  }, []);

  const carregarPedidos = useCallback(async (pagina: number = 1, filtrosParaUsar?: FiltrosPedidosState) => {
    const efetivos = filtrosParaUsar ?? filtros;
    setLoadingPedidos(true);
    try {
      const result = await listarPedidos({
        ...toApiFiltros(efetivos),
        page: pagina,
        limit: PAGE_SIZE,
      });
      const data = Array.isArray(result?.data) ? result.data : (Array.isArray(result) ? result : []);
      setPedidos(data);
      setTotal(typeof result?.total === 'number' ? result.total : data.length);
      setPage(pagina);
    } catch {
      setPedidos([]);
      setTotal(0);
    } finally {
      setLoadingPedidos(false);
    }
  }, [filtros]);

  useEffect(() => {
    carregarResumo();
  }, [carregarResumo]);

  useEffect(() => {
    carregarResumoFinanceiro();
  }, [carregarResumoFinanceiro]);

  useEffect(() => {
    carregarPedidos(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFiltrosComRef = useCallback((novo: FiltrosPedidosState) => {
    filtrosRef.current = novo;
    setFiltros(novo);
  }, []);

  const aplicarFiltros = useCallback(() => {
    carregarPedidos(1, filtrosRef.current);
  }, [carregarPedidos]);

  useEffect(() => {
    filtrosRef.current = filtros;
  }, [filtros]);

  useEffect(() => {
    saveFiltrosDashboard(filtros);
  }, [filtros]);

  const handleAjusteSuccess = (atualizado: Pedido) => {
    setPedidos((prev) =>
      prev.map((p) => (p.id_pedido === atualizado.id_pedido ? atualizado : p))
    );
    carregarResumo();
    carregarResumoFinanceiro();
    setToast('Previsão atualizada com sucesso.');
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // rede/servidor: logout() já removeu token local
    }
    const base = import.meta.env.BASE_URL ?? '/';
    const entrar = base === '/' ? '/entrar' : `${base.replace(/\/$/, '')}/entrar`;
    window.location.replace(entrar);
  };

  return (
    <div className="min-h-screen bg-slate-900">
      <header className="border-b border-slate-700/50 bg-slate-800/50 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-100">Gestor de Pedidos — Dashboard</h1>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg bg-slate-600 hover:bg-slate-500 px-4 py-2 text-sm font-medium text-slate-200 transition"
          >
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <CardsResumoFinanceiro resumo={resumoFinanceiro} loading={loadingResumoFinanceiro} />
        <CardsResumo resumo={resumo} loading={loadingResumo} />
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setMostrarFiltros((v) => !v)}
            className="inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-700 p-2 text-slate-200 hover:bg-slate-600"
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
        {mostrarFiltros && (
          <FiltroPedidos filtros={filtros} onChange={setFiltrosComRef} onAplicar={aplicarFiltros} />
        )}
        <TabelaPedidos
          pedidos={pedidos}
          loading={loadingPedidos}
          onAjustar={setModalPedido}
        />
        {total > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-800/50 px-4 py-3 text-sm text-slate-300">
            <span>
              Exibindo {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total} registros
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => carregarPedidos(page - 1, filtrosRef.current)}
                disabled={page <= 1 || loadingPedidos}
                className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-200 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <span className="text-slate-400">
                Página {page} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => carregarPedidos(page + 1, filtrosRef.current)}
                disabled={page >= totalPages || loadingPedidos}
                className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-slate-200 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </main>

      {modalPedido && (
        <ModalAjustePrevisao
          pedido={modalPedido}
          onClose={() => setModalPedido(null)}
          onSuccess={handleAjusteSuccess}
          onError={(msg) => setToast(msg)}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-slate-700 border border-slate-600 px-4 py-2 text-slate-100 shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
