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
  setOrderResponsible,
  setOrderTagDisponivel,
  getOrderHistory,
  setOrderRead,
  getNotifications,
  markNotificationsRead,
  setNotificationRead,
  searchSycroOrderUsers,
  listUsersResponsavelCard,
} from '../controllers/sycroorderController.js';

const router = Router();
router.use(requireAuth);

// Autocomplete de menções precisa funcionar para qualquer usuário autenticado
// que esteja usando a tela, então não aplicamos `PEDIDOS_VER` aqui.
router.get('/users', searchSycroOrderUsers);

// Comunicação PD com permissões granulares.
const canVerTela = requirePermission(PERMISSOES.COMUNICACAO_TELA_VER, PERMISSOES.COMUNICACAO_TOTAL, PERMISSOES.PEDIDOS_VER, PERMISSOES.COMUNICACAO_VER);
const canCriarCard = requirePermission(PERMISSOES.COMUNICACAO_NOVO_PEDIDO, PERMISSOES.COMUNICACAO_TOTAL, PERMISSOES.PEDIDOS_EDITAR, PERMISSOES.PEDIDOS_VER, PERMISSOES.COMUNICACAO_VER);
const canVerHistorico = requirePermission(PERMISSOES.COMUNICACAO_HISTORICO_VER, PERMISSOES.COMUNICACAO_TOTAL, PERMISSOES.PEDIDOS_VER, PERMISSOES.COMUNICACAO_VER);
const canAtualizarCard = requirePermission(
  PERMISSOES.COMUNICACAO_ATUALIZAR_CARD,
  PERMISSOES.COMUNICACAO_TOTAL,
  PERMISSOES.PEDIDOS_EDITAR,
  PERMISSOES.PEDIDOS_VER,
  PERMISSOES.COMUNICACAO_VER
);
const canControlarTag = requirePermission(
  PERMISSOES.COMUNICACAO_TAG_CONTROLAR,
  PERMISSOES.COMUNICACAO_TOTAL
);
const canEditarResponsavel = requirePermission(
  PERMISSOES.COMUNICACAO_EDITAR_RESPONSAVEL_CARD,
  PERMISSOES.COMUNICACAO_TOTAL
);

router.get('/users-responsavel', canVerTela, listUsersResponsavelCard);
router.get('/orders', canVerTela, getOrders);
router.get('/order-numbers', canCriarCard, getOrderNumbers);
router.get('/pedidos-erp', canCriarCard, getPedidosErp);
router.post('/orders', canCriarCard, createOrder);
router.patch('/orders/:id', canAtualizarCard, updateOrder);
router.patch('/orders/:id/responsavel', canEditarResponsavel, setOrderResponsible);
router.put('/orders/:id/tag-disponivel', canControlarTag, setOrderTagDisponivel);
router.put('/orders/:id/read', canAtualizarCard, setOrderRead);
router.get('/orders/:id/history', canVerHistorico, getOrderHistory);
router.get('/notifications', canVerTela, getNotifications);
router.post('/notifications/read', canVerTela, markNotificationsRead);
router.patch('/notifications/:id/read', canVerTela, setNotificationRead);

export default router;
