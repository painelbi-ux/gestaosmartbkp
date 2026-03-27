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

// Tickets são usados dentro da Precificação (Engenharia). Liberamos leitura para quem pode ver/gerar precificação,
// sem precisar habilitar o módulo Integração no menu.
router.get(
  '/tickets',
  requirePermission(PERMISSOES.INTEGRACAO_VER, PERMISSOES.PRECIFICACAO_VER, PERMISSOES.PRECIFICACAO_GERAR),
  getTickets
);
router.get(
  '/tickets/:id',
  requirePermission(PERMISSOES.INTEGRACAO_VER, PERMISSOES.PRECIFICACAO_VER, PERMISSOES.PRECIFICACAO_GERAR),
  getTicketById
);

router.get('/faturamento-diario/mensagem', requirePermission(PERMISSOES.INTEGRACAO_VER), getMensagemFaturamentoDiario);
router.post('/faturamento-diario/enviar', requirePermission(PERMISSOES.INTEGRACAO_VER), postEnviarFaturamentoDiario);

export default router;
