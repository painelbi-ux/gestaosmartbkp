import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import {
  createMrpRun,
  deleteMrpRun,
  getMrp,
  getMrpHorizonte,
  getMrpMppQtdeTotalPorComponente,
  getMrpRun,
  getMrpRunRows,
  listMrpRuns,
  processMrpRun,
} from '../controllers/mrpController.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission(PERMISSOES.PCP_VER_TELA, PERMISSOES.PCP_TOTAL, PERMISSOES.PEDIDOS_VER));

router.get('/horizonte', getMrpHorizonte);
router.get('/mpp-qtde-total-por-componente', getMrpMppQtdeTotalPorComponente);
router.get('/runs', listMrpRuns);
router.post('/runs', createMrpRun);
router.post('/runs/:id/process', processMrpRun);
router.delete('/runs/:id', deleteMrpRun);
router.get('/runs/:id/rows', getMrpRunRows);
router.get('/runs/:id', getMrpRun);
router.get('/', getMrp);

export default router;
