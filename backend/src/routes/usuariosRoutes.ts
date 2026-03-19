import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateCsrf } from '../middleware/csrf.js';
import { PERMISSOES } from '../config/permissoes.js';
import { listarUsuarios, criarUsuario, atualizarUsuario } from '../controllers/usuariosController.js';

const router = Router();
router.use(requireAuth);
router.use(requirePermission(PERMISSOES.USUARIOS_GERENCIAR));

router.get('/', listarUsuarios);
router.post('/', validateCsrf, criarUsuario);
router.put('/:id', validateCsrf, atualizarUsuario);

export default router;
