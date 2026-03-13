import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import {
  getOrders,
  getPedidosErp,
  createOrder,
  updateOrder,
  getOrderHistory,
  getNotifications,
  markNotificationsRead,
} from '../controllers/sycroorderController.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission(PERMISSOES.PEDIDOS_VER));

router.get('/orders', getOrders);
router.get('/pedidos-erp', getPedidosErp);
router.post('/orders', createOrder);
router.patch('/orders/:id', updateOrder);
router.get('/orders/:id/history', getOrderHistory);
router.get('/notifications', getNotifications);
router.post('/notifications/read', markNotificationsRead);

export default router;
