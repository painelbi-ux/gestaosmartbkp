import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import {
  getProdutosPrecificacao,
  iniciarPrecificacao,
  listPrecificacoes,
  getPrecificacaoResultado,
  salvarPrecificacaoValores,
} from '../controllers/engenhariaController.js';

const router = Router();
router.use(requireAuth);

function async503(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((err) => {
      console.error('[engenhariaRoutes]', err instanceof Error ? err.message : String(err));
      if (!res.headersSent) res.status(503).json({ error: 'Serviço temporariamente indisponível. Tente novamente.' });
    });
  };
}

router.get(
  '/produtos-precificacao',
  requirePermission(PERMISSOES.PRECIFICACAO_VER),
  async503(getProdutosPrecificacao)
);

router.post(
  '/precificacao/iniciar',
  requirePermission(PERMISSOES.PRECIFICACAO_VER),
  async503(iniciarPrecificacao)
);

router.get(
  '/precificacao',
  requirePermission(PERMISSOES.PRECIFICACAO_VER),
  async503(listPrecificacoes)
);

router.get(
  '/precificacao/:id/resultado',
  requirePermission(PERMISSOES.PRECIFICACAO_VER),
  async503(getPrecificacaoResultado)
);

router.patch(
  '/precificacao/:id/valores',
  requirePermission(PERMISSOES.PRECIFICACAO_VER),
  async503(salvarPrecificacaoValores)
);

export default router;
