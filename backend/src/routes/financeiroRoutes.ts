import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import {
  getDfcAgendamentosEfetivos,
  getDfcAgendamentosDetalhe,
  getDfcKpis,
  getPainelComercial,
  getPainelComercialItensPedido,
  getPoliticaComercialPainel,
  putPoliticaComercialPainel,
} from '../controllers/financeiroController.js';

const router = Router();
router.use(requireAuth);

const verFinanceiro = requirePermission(PERMISSOES.FINANCEIRO_VER);

router.get('/dfc/agendamentos-efetivos', verFinanceiro, getDfcAgendamentosEfetivos);
router.get('/dfc/agendamentos-efetivos-detalhe', verFinanceiro, getDfcAgendamentosDetalhe);
router.get('/dfc/kpis', verFinanceiro, getDfcKpis);
router.get('/painel-comercial/itens-pedido', verFinanceiro, getPainelComercialItensPedido);
router.get('/painel-comercial/politica', verFinanceiro, getPoliticaComercialPainel);
router.put('/painel-comercial/politica', verFinanceiro, putPoliticaComercialPainel);
router.get('/painel-comercial', verFinanceiro, getPainelComercial);

export default router;
