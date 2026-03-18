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

// Permissão "Ver pedidos" para todas as rotas GET
const verPedidos = requirePermission(PERMISSOES.PEDIDOS_VER);
const verFinanceiro = requirePermission(PERMISSOES.FINANCEIRO_VER);

// Rate limit para rotas de escrita (ajustar previsão)
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Muitas requisições. Tente novamente em breve.' },
});

const editar = requirePermission(PERMISSOES.PEDIDOS_EDITAR);

router.get('/', verPedidos, getPedidos);
router.get('/export', editar, getPedidosExport);
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
router.post('/limpar-historico', editar, writeLimiter, limparHistorico);
router.post('/ajustar-previsao-lote', editar, writeLimiter, ajustarPrevisaoLote);
router.post('/:id/ajustar-previsao', editar, writeLimiter, ajustarPrevisao);

export default router;
