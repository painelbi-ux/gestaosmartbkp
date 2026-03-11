import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import Login from './pages/Login';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import PedidosPage from './pages/PedidosPage';
import RelatoriosPage from './pages/RelatoriosPage';
import UsuariosPage from './pages/UsuariosPage';
import WhatsAppConnectPage from './pages/WhatsAppConnectPage';
import StatusApiPage from './pages/StatusApiPage';
import HeatmapPage from './pages/HeatmapPage';
import IntegracaoPage from './pages/IntegracaoPage';
import AlteracaoDataEntregaCompraPage from './pages/integracao/AlteracaoDataEntregaCompraPage';
import ComprasPage from './pages/ComprasPage';
import ColetasPrecosPage from './pages/compras/ColetasPrecosPage';
import ComprasDashboardPage from './pages/compras/ComprasDashboardPage';
import PrecificacaoPage from './pages/PrecificacaoPage';
import ResumoFinanceiroPage from './pages/financeiro/ResumoFinanceiroPage';
import ErrorBoundary from './components/ErrorBoundary';
import { getStoredToken } from './api/client';
import { checkAuth } from './api/auth';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<boolean | null>(null);

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
          <Route index element={<DashboardPage />} />
          <Route path="pedidos" element={<ErrorBoundary><PedidosPage /></ErrorBoundary>} />
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
          <Route path="usuarios" element={<UsuariosPage />} />
          <Route path="whatsapp" element={<WhatsAppConnectPage />} />
          <Route path="situacao-api" element={<StatusApiPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
