import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import { getMrp, getMrpHorizonte, getMrpMppQtdeTotalPorComponente } from '../controllers/mrpController.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission(PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER));

router.get('/horizonte', getMrpHorizonte);
router.get('/mpp-qtde-total-por-componente', getMrpMppQtdeTotalPorComponente);
router.get('/', getMrp);

export default router;
