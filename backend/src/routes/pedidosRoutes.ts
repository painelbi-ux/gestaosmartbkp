import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import {
  getPedidos,
  getPedidosExport,
  getResumo,
  getResumoFinanceiro,
  getResumoFinanceiroGrade,
  getResumoStatusPorTipoF,
  getTabelaStatusPorTipoF,
  getResumoObservacoes,
  getResumoMotivos,
  getFiltrosOpcoes,
  getMapaMunicipios,
  ajustarPrevisao,
  ajustarPrevisaoLote,
  getHistorico,
  limparHistorico,
  sincronizar,
  checkIdPedidosEmSycro,
} from '../controllers/pedidosController.js';

const router = Router();
router.use(requireAuth);

// Visualização do gerenciador/recursos (PCP/Dashboard/Heatmap).
// Compatibilidade: Comunicação PD precisa listar itens para criação de cards.
const verPedidos = requirePermission(
  PERMISSOES.PCP_VER_TELA,
  PERMISSOES.PCP_TOTAL,
  PERMISSOES.DASHBOARD_VER,
  PERMISSOES.HEATMAP_VER,
  PERMISSOES.COMUNICACAO_TELA_VER,
  PERMISSOES.COMUNICACAO_NOVO_PEDIDO,
  // legado
  PERMISSOES.PEDIDOS_VER,
  PERMISSOES.COMUNICACAO_VER
);

const verFinanceiro = requirePermission(PERMISSOES.FINANCEIRO_VER, PERMISSOES.PCP_TOTAL);

// Rate limit para rotas de escrita (ajustar previsão)
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Muitas requisições. Tente novamente em breve.' },
});

const editarPcp = requirePermission(PERMISSOES.PCP_AJUSTAR_PREVISAO, PERMISSOES.PCP_IMPORTAR_XLSX, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_EDITAR);
const exportarXlsxPcp = requirePermission(PERMISSOES.PCP_EXPORTAR_XLSX, PERMISSOES.PCP_EXPORTAR_GRADE, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_EDITAR);
const ajustarUnicoPcp = requirePermission(PERMISSOES.PCP_AJUSTAR_PREVISAO, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_EDITAR);
const ajustarLotePcp = requirePermission(PERMISSOES.PCP_IMPORTAR_XLSX, PERMISSOES.PCP_AJUSTAR_PREVISAO, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_EDITAR);

router.get('/', verPedidos, getPedidos);
router.get('/export', exportarXlsxPcp, getPedidosExport);
router.get('/resumo', verPedidos, getResumo);
router.get('/resumo-financeiro', verPedidos, getResumoFinanceiro);
router.get('/resumo-financeiro-grade', verFinanceiro, getResumoFinanceiroGrade);
router.get('/resumo-status-tipof', verPedidos, getResumoStatusPorTipoF);
router.get('/tabela-status-tipof', verPedidos, getTabelaStatusPorTipoF);
router.get('/observacoes-resumo', verPedidos, getResumoObservacoes);
router.get('/resumo-motivos', verPedidos, getResumoMotivos);
router.get('/filtros-opcoes', verPedidos, getFiltrosOpcoes);
router.get('/mapa-municipios', verPedidos, getMapaMunicipios);
router.get('/:id/historico', verPedidos, getHistorico);
router.post('/check-sycro', verPedidos, checkIdPedidosEmSycro);

// Sincronizar: qualquer usuário autenticado (evita 403 ao acessar por IP externo)
router.post('/sincronizar', writeLimiter, sincronizar);
router.post('/limpar-historico', editarPcp, writeLimiter, limparHistorico);
router.post('/ajustar-previsao-lote', ajustarLotePcp, writeLimiter, ajustarPrevisaoLote);
router.post('/:id/ajustar-previsao', ajustarUnicoPcp, writeLimiter, ajustarPrevisao);

export default router;
