import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import { validateCsrf } from '../middleware/csrf.js';
import {
  getProgramacaoSetorialPlanning,
  getProgramacaoSetorialEstoque,
  listarProgramacoesSetoriais,
  criarProgramacaoSetorial,
  atualizarProgramacaoSetorial,
} from '../controllers/programacaoSetorialController.js';

const router = Router();

router.use(requireAuth);
router.use(requirePermission(PERMISSOES.PEDIDOS_VER));

router.get('/planning', getProgramacaoSetorialPlanning);
router.get('/estoque', getProgramacaoSetorialEstoque);
router.get('/registros', listarProgramacoesSetoriais);
router.post('/registros', validateCsrf, criarProgramacaoSetorial);
router.patch('/registros/:id', validateCsrf, atualizarProgramacaoSetorial);

export default router;

