import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import {
  getOrders,
  getOrderNumbers,
  getPedidosErp,
  createOrder,
  updateOrder,
  setOrderTagDisponivel,
  getOrderHistory,
  setOrderRead,
  getNotifications,
  markNotificationsRead,
  searchSycroOrderUsers,
} from '../controllers/sycroorderController.js';

const router = Router();
router.use(requireAuth);

// Autocomplete de menções precisa funcionar para qualquer usuário autenticado
// que esteja usando a tela, então não aplicamos `PEDIDOS_VER` aqui.
router.get('/users', searchSycroOrderUsers);

// Demais rotas continuam protegidas por PEDIDOS_VER.
router.get('/orders', requirePermission(PERMISSOES.PEDIDOS_VER), getOrders);
router.get('/order-numbers', requirePermission(PERMISSOES.PEDIDOS_VER), getOrderNumbers);
router.get('/pedidos-erp', requirePermission(PERMISSOES.PEDIDOS_VER), getPedidosErp);
router.post('/orders', requirePermission(PERMISSOES.PEDIDOS_VER), createOrder);
router.patch('/orders/:id', requirePermission(PERMISSOES.PEDIDOS_VER), updateOrder);
router.put('/orders/:id/tag-disponivel', requirePermission(PERMISSOES.PEDIDOS_VER), setOrderTagDisponivel);
router.put('/orders/:id/read', requirePermission(PERMISSOES.PEDIDOS_VER), setOrderRead);
router.get('/orders/:id/history', requirePermission(PERMISSOES.PEDIDOS_VER), getOrderHistory);
router.get('/notifications', requirePermission(PERMISSOES.PEDIDOS_VER), getNotifications);
router.post('/notifications/read', requirePermission(PERMISSOES.PEDIDOS_VER), markNotificationsRead);

export default router;
