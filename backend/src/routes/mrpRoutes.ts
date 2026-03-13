import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import { getMrp } from '../controllers/mrpController.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission(PERMISSOES.PEDIDOS_VER));

router.get('/', getMrp);

export default router;
