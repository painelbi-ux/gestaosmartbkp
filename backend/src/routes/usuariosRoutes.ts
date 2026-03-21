import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateCsrf } from '../middleware/csrf.js';
import { PERMISSOES } from '../config/permissoes.js';
import { listarUsuarios, criarUsuario, atualizarUsuario, excluirUsuario } from '../controllers/usuariosController.js';

const router = Router();
router.use(requireAuth);

router.get('/', requirePermission(PERMISSOES.USUARIOS_TELA_VER, PERMISSOES.USUARIOS_TOTAL, PERMISSOES.USUARIOS_GERENCIAR), listarUsuarios);
router.post('/', validateCsrf, requirePermission(PERMISSOES.USUARIOS_CRIAR, PERMISSOES.USUARIOS_TOTAL, PERMISSOES.USUARIOS_GERENCIAR), criarUsuario);
// PUT é por ação (senha/nome/grupo/foto/inativar/permissoes) e a validação granular acontece no controller.
router.put('/:id', validateCsrf, atualizarUsuario);
router.delete('/:id', validateCsrf, requirePermission(PERMISSOES.USUARIOS_EXCLUIR, PERMISSOES.USUARIOS_TOTAL, PERMISSOES.USUARIOS_GERENCIAR), excluirUsuario);

export default router;
