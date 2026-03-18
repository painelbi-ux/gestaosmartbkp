import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import {
  getPedidoCompraDataEntrega,
  getPedidoCompraDataEntregaFiltrosOpcoes,
  patchPedidoCompraDataEntregaItem,
  getHistoricoAlteracaoDataEntregaItem,
  getTickets,
  getTicketById,
  getMensagemFaturamentoDiario,
  postEnviarFaturamentoDiario,
} from '../controllers/integracaoController.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/pedido-compra-data-entrega',
  requirePermission(PERMISSOES.INTEGRACAO_VER),
  getPedidoCompraDataEntrega
);

router.get(
  '/pedido-compra-data-entrega/filtros-opcoes',
  requirePermission(PERMISSOES.INTEGRACAO_VER),
  getPedidoCompraDataEntregaFiltrosOpcoes
);

router.patch(
  '/pedido-compra-data-entrega/item/:idItemPedidoCompra',
  requirePermission(PERMISSOES.INTEGRACAO_EDITAR),
  patchPedidoCompraDataEntregaItem
);

router.get(
  '/pedido-compra-data-entrega/item/:idItemPedidoCompra/historico',
  requirePermission(PERMISSOES.INTEGRACAO_VER),
  getHistoricoAlteracaoDataEntregaItem
);

router.get('/tickets', requirePermission(PERMISSOES.INTEGRACAO_VER), getTickets);
router.get('/tickets/:id', requirePermission(PERMISSOES.INTEGRACAO_VER), getTicketById);

router.get('/faturamento-diario/mensagem', requirePermission(PERMISSOES.INTEGRACAO_VER), getMensagemFaturamentoDiario);
router.post('/faturamento-diario/enviar', requirePermission(PERMISSOES.INTEGRACAO_VER), postEnviarFaturamentoDiario);

export default router;
