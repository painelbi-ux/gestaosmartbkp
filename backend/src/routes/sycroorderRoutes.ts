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
  getOrderHistory,
  setOrderRead,
  getNotifications,
  markNotificationsRead,
} from '../controllers/sycroorderController.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission(PERMISSOES.PEDIDOS_VER));

router.get('/orders', getOrders);
router.get('/order-numbers', getOrderNumbers);
router.get('/pedidos-erp', getPedidosErp);
router.post('/orders', createOrder);
router.patch('/orders/:id', updateOrder);
router.put('/orders/:id/read', setOrderRead);
router.get('/orders/:id/history', getOrderHistory);
router.get('/notifications', getNotifications);
router.post('/notifications/read', markNotificationsRead);

export default router;
