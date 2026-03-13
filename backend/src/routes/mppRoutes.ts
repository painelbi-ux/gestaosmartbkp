import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import { getMpp } from '../controllers/mppController.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission(PERMISSOES.PEDIDOS_VER));

router.get('/', getMpp);

export default router;
