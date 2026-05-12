import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import RootEntry from './RootEntry';
import ErrorBoundary from './components/ErrorBoundary';
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
import DfcPage from './pages/financeiro/DfcPage';
import PainelFinanceiroComercialPage from './pages/financeiro/PainelFinanceiroComercialPage';
import RenegociacaoContratosPage from './pages/financeiro/RenegociacaoContratosPage';
import SycroOrderPage from './pages/pedidos/SycroOrderPage';
import MRPPage from './pages/pedidos/MRPPage';
import MRPManagerPage from './pages/pedidos/MRPManagerPage';
import MRPProdutosEmProcessoPage from './pages/pedidos/MRPProdutosEmProcessoPage';
import DashboardMRPPage from './pages/pedidos/DashboardMRPPage';
import MPPPage from './pages/pedidos/MPPPage';
import ProgramacaoSetorialPainelPage from './pages/pedidos/ProgramacaoSetorialPainelPage';
import RessupAlmoxAnalisePage from './pages/pedidos/RessupAlmoxAnalisePage';
import SuportePage from './pages/suporte/SuportePage';
import SuporteConfigPage from './pages/suporte/SuporteConfigPage';
import SemAcessoPage from './pages/SemAcessoPage';
import InicioPage from './pages/InicioPage';

const future = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

export const router = createBrowserRouter(
  [
    {
      path: '/entrar',
      element: <Navigate to="/" replace />,
    },
    {
      path: '/',
      element: (
        <AuthProvider>
          <RootEntry />
        </AuthProvider>
      ),
      children: [
        { index: true, element: <InicioPage /> },
        { path: 'pedidos', element: <ErrorBoundary><PedidosPage /></ErrorBoundary> },
        { path: 'pedidos/sycroorder', element: <ErrorBoundary><SycroOrderPage /></ErrorBoundary> },
        { path: 'pedidos/mrp', element: <ErrorBoundary><MRPManagerPage /></ErrorBoundary> },
        { path: 'pedidos/mrp/:id', element: <ErrorBoundary><MRPPage /></ErrorBoundary> },
        { path: 'pedidos/mrp-produtos-em-processo', element: <ErrorBoundary><MRPProdutosEmProcessoPage /></ErrorBoundary> },
        { path: 'pedidos/mrp-dashboard', element: <ErrorBoundary><DashboardMRPPage /></ErrorBoundary> },
        { path: 'pedidos/mpp', element: <ErrorBoundary><MPPPage /></ErrorBoundary> },
        { path: 'pedidos/programacao-setorial', element: <ErrorBoundary><ProgramacaoSetorialPainelPage /></ErrorBoundary> },
        { path: 'pedidos/ressup-almox', element: <ErrorBoundary><RessupAlmoxAnalisePage /></ErrorBoundary> },
        { path: 'suporte', element: <ErrorBoundary><SuportePage /></ErrorBoundary> },
        { path: 'suporte/configuracao', element: <ErrorBoundary><SuporteConfigPage /></ErrorBoundary> },
        { path: 'heatmap', element: <HeatmapPage /> },
        { path: 'compras', element: <ComprasPage /> },
        { path: 'compras/dashboard', element: <ComprasDashboardPage /> },
        { path: 'compras/coletas-precos', element: <ColetasPrecosPage /> },
        { path: 'precificacao', element: <Navigate to="/engenharia/precificacao" replace /> },
        { path: 'engenharia/precificacao', element: <PrecificacaoPage /> },
        { path: 'financeiro', element: <ResumoFinanceiroPage /> },
        { path: 'financeiro/resumo', element: <ResumoFinanceiroPage /> },
        { path: 'financeiro/dfc', element: <DfcPage /> },
        {
          path: 'financeiro/painel-financeiro-comercial',
          element: <PainelFinanceiroComercialPage />,
        },
        { path: 'financeiro/renegociacao-contratos', element: <RenegociacaoContratosPage /> },
        { path: 'relatorios', element: <RelatoriosPage /> },
        { path: 'integracao', element: <IntegracaoPage /> },
        { path: 'integracao/alteracao-data-entrega-compra', element: <AlteracaoDataEntregaCompraPage /> },
        { path: 'integracao/faturamento-diario', element: <FaturamentoDiarioPage /> },
        { path: 'usuarios', element: <UsuariosPage /> },
        { path: 'usuarios/grupos', element: <UsuariosPage /> },
        { path: 'whatsapp', element: <WhatsAppConnectPage /> },
        { path: 'situacao-api', element: <StatusApiPage /> },
        { path: 'sem-acesso', element: <SemAcessoPage /> },
      ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { future }
);
