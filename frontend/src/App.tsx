import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import PedidosPage from './pages/PedidosPage';
import RelatoriosPage from './pages/RelatoriosPage';
import UsuariosPage from './pages/UsuariosPage';
import WhatsAppConnectPage from './pages/WhatsAppConnectPage';
import StatusApiPage from './pages/StatusApiPage';
import HeatmapPage from './pages/HeatmapPage';
import IntegracaoPage from './pages/IntegracaoPage';
import AlteracaoDataEntregaCompraPage from './pages/integracao/AlteracaoDataEntregaCompraPage';
import FaturamentoDiarioPage from './pages/integracao/FaturamentoDiarioPage';
import ComprasPage from './pages/ComprasPage';
import ColetasPrecosPage from './pages/compras/ColetasPrecosPage';
import ComprasDashboardPage from './pages/compras/ComprasDashboardPage';
import PrecificacaoPage from './pages/PrecificacaoPage';
import ResumoFinanceiroPage from './pages/financeiro/ResumoFinanceiroPage';
import SycroOrderPage from './pages/pedidos/SycroOrderPage';
import MRPPage from './pages/pedidos/MRPPage';
import DashboardMRPPage from './pages/pedidos/DashboardMRPPage';
import MPPPage from './pages/pedidos/MPPPage';
import PCPedidoCompraPage from './pages/pedidos/PCPedidoCompraPage';
import ProgramacaoSetorialPainelPage from './pages/pedidos/ProgramacaoSetorialPainelPage';
import ErrorBoundary from './components/ErrorBoundary';
import { getStoredToken, SESSION_CLEARED_EVENT } from './api/client';
import { checkAuth } from './api/auth';
import SemAcessoPage from './pages/SemAcessoPage';
import InicioPage from './pages/InicioPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<boolean | null>(null);

  useEffect(() => {
    const onSessionCleared = () => setAuth(false);
    window.addEventListener(SESSION_CLEARED_EVENT, onSessionCleared);
    return () => window.removeEventListener(SESSION_CLEARED_EVENT, onSessionCleared);
  }, []);

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      setAuth(true);
      return;
    }
    checkAuth()
      .then(setAuth)
      .catch(() => setAuth(false));
  }, []);

  if (auth === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        <p className="text-slate-600 dark:text-slate-400">Carregando...</p>
      </div>
    );
  }
  if (!auth) return <Navigate to="/entrar" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/entrar" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<InicioPage />} />
          <Route path="pedidos" element={<ErrorBoundary><PedidosPage /></ErrorBoundary>} />
          <Route path="pedidos/sycroorder" element={<ErrorBoundary><SycroOrderPage /></ErrorBoundary>} />
          <Route path="pedidos/mrp" element={<ErrorBoundary><MRPPage /></ErrorBoundary>} />
          <Route path="pedidos/mrp-dashboard" element={<ErrorBoundary><DashboardMRPPage /></ErrorBoundary>} />
          <Route path="pedidos/pc" element={<ErrorBoundary><PCPedidoCompraPage /></ErrorBoundary>} />
          <Route path="pedidos/mpp" element={<ErrorBoundary><MPPPage /></ErrorBoundary>} />
          <Route path="pedidos/programacao-setorial" element={<ErrorBoundary><ProgramacaoSetorialPainelPage /></ErrorBoundary>} />
          <Route path="heatmap" element={<HeatmapPage />} />
          <Route path="compras" element={<ComprasPage />} />
          <Route path="compras/dashboard" element={<ComprasDashboardPage />} />
          <Route path="compras/coletas-precos" element={<ColetasPrecosPage />} />
          <Route path="precificacao" element={<Navigate to="/engenharia/precificacao" replace />} />
          <Route path="engenharia/precificacao" element={<PrecificacaoPage />} />
          <Route path="financeiro" element={<ResumoFinanceiroPage />} />
          <Route path="financeiro/resumo" element={<ResumoFinanceiroPage />} />
          <Route path="relatorios" element={<RelatoriosPage />} />
          <Route path="integracao" element={<IntegracaoPage />} />
          <Route path="integracao/alteracao-data-entrega-compra" element={<AlteracaoDataEntregaCompraPage />} />
          <Route path="integracao/faturamento-diario" element={<FaturamentoDiarioPage />} />
          <Route path="usuarios" element={<UsuariosPage />} />
          <Route path="usuarios/grupos" element={<UsuariosPage />} />
          <Route path="whatsapp" element={<WhatsAppConnectPage />} />
          <Route path="situacao-api" element={<StatusApiPage />} />
          <Route path="sem-acesso" element={<SemAcessoPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
