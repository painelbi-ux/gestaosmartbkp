import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import { getDfcAgendamentosEfetivos, getDfcAgendamentosDetalhe } from '../controllers/financeiroController.js';

const router = Router();
router.use(requireAuth);

const verFinanceiro = requirePermission(PERMISSOES.FINANCEIRO_VER);

router.get('/dfc/agendamentos-efetivos', verFinanceiro, getDfcAgendamentosEfetivos);
router.get('/dfc/agendamentos-efetivos-detalhe', verFinanceiro, getDfcAgendamentosDetalhe);

export default router;
