import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import { getPcSaldoReceber } from '../controllers/pcSaldoReceberController.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission(PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER));

router.get('/', getPcSaldoReceber);

export default router;
