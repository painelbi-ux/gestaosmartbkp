import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import {
  getDfcAgendamentosEfetivos,
  getDfcAgendamentosDetalhe,
  getDfcDespesasPagamentoEmAberto,
  getDfcDespesasPagamentoFornecedorOpcoes,
  getDfcKpis,
  getPainelComercial,
  getPainelComercialItensPedido,
  getPoliticaComercialPainel,
  putPoliticaComercialPainel,
} from '../controllers/financeiroController.js';
import {
  deletePrioridadeContaCtrl,
  deletePrioridadeLancamentoCtrl,
  getOpcoesPrioridade,
  listPrioridadesConta,
  listPrioridadesLancamento,
  postPrioridadeContaLote,
  postPrioridadeLancamentoLote,
  putPrioridadeConta,
  putPrioridadeLancamento,
} from '../controllers/dfcPrioridadeController.js';

const router = Router();
router.use(requireAuth);

const verFinanceiro = requirePermission(PERMISSOES.FINANCEIRO_VER);

router.get('/dfc/agendamentos-efetivos', verFinanceiro, getDfcAgendamentosEfetivos);
router.get('/dfc/agendamentos-efetivos-detalhe', verFinanceiro, getDfcAgendamentosDetalhe);
router.get('/dfc/despesas-pagamento-em-aberto', verFinanceiro, getDfcDespesasPagamentoEmAberto);
router.get('/dfc/despesas-em-aberto-fornecedor-opcoes', verFinanceiro, getDfcDespesasPagamentoFornecedorOpcoes);
router.get('/dfc/kpis', verFinanceiro, getDfcKpis);

// Prioridade DFC (plano de contas + lançamento)
router.get('/dfc/prioridades/opcoes', verFinanceiro, getOpcoesPrioridade);
router.get('/dfc/prioridades/contas', verFinanceiro, listPrioridadesConta);
router.put('/dfc/prioridades/contas', verFinanceiro, putPrioridadeConta);
router.post('/dfc/prioridades/contas/lote', verFinanceiro, postPrioridadeContaLote);
router.delete('/dfc/prioridades/contas/:idEmpresa/:idContaFinanceiro', verFinanceiro, deletePrioridadeContaCtrl);
router.get('/dfc/prioridades/lancamentos', verFinanceiro, listPrioridadesLancamento);
router.put('/dfc/prioridades/lancamentos', verFinanceiro, putPrioridadeLancamento);
router.post('/dfc/prioridades/lancamentos/lote', verFinanceiro, postPrioridadeLancamentoLote);
router.delete('/dfc/prioridades/lancamentos/:idEmpresa/:tipoRef/:idRef', verFinanceiro, deletePrioridadeLancamentoCtrl);

router.get('/painel-comercial/itens-pedido', verFinanceiro, getPainelComercialItensPedido);
router.get('/painel-comercial/politica', verFinanceiro, getPoliticaComercialPainel);
router.put('/painel-comercial/politica', verFinanceiro, putPoliticaComercialPainel);
router.get('/painel-comercial', verFinanceiro, getPainelComercial);

export default router;
