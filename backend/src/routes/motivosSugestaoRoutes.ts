import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateCsrf } from '../middleware/csrf.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import {
  getMotivosSugestao,
  postMotivoSugestao,
  putMotivoSugestao,
  deleteMotivoSugestao,
} from '../controllers/motivosSugestaoController.js';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission(PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_AJUSTAR_PREVISAO, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER), getMotivosSugestao);
router.post(
  '/',
  validateCsrf,
  requirePermission(PERMISSOES.PCP_MOTIVO_CRIAR, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_EDITAR),
  postMotivoSugestao
);
router.put(
  '/:id',
  validateCsrf,
  requirePermission(PERMISSOES.PCP_MOTIVO_EDITAR, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_EDITAR),
  putMotivoSugestao
);
router.delete(
  '/:id',
  validateCsrf,
  requirePermission(PERMISSOES.PCP_MOTIVO_EXCLUIR, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_EDITAR),
  deleteMotivoSugestao
);

export default router;
