import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { PERMISSOES } from '../config/permissoes.js';
import { getProdutosColeta, getRessupAlmoxRegistroPreview, postRessupAlmoxAnalise, putRessupAlmoxAnalise, patchRessupAlmoxAnaliseProcessar, patchRessupAlmoxAnaliseConcluir, getRessupAlmoxAnalises, getRessupAlmoxAnaliseById, getColetasPrecos, getColetasPrecosDebug, getOpcoesFiltroColetas, getOpcoesVinculoFinalizacao, getOpcoesVinculoErroOperacional, getDashboardErrosVinculoOperacional, getColetasBloqueantes, postCienciaColeta, postConfirmarColeta, getFornecedores, getCondicoesPagamento, getFormasPagamento, putColetaFornecedores, getPrecosColeta, getPrecosCotacao, postPrecosCotacao, patchObservacoesColeta, patchEnviarAprovacao, patchCancelarCotacao, patchReabrirColeta, patchFinalizarCotacao, patchRegistroQtdeAprovada, patchEnviarFinanceiro, deleteColetaPrecos, deleteColetaItem, deleteColetaTodosItens, postColetaItens } from '../controllers/comprasController.js';

const router = Router();
router.use(requireAuth);

/** Envolve handler async para nunca deixar rejeição sem resposta (evita 500). */
function async503(handler: RequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch((err) => {
      const cause = err instanceof Error ? err.message : String(err);
      console.error('[comprasRoutes]', cause, err instanceof Error ? err.stack : '');
      if (!res.headersSent) {
        res.status(503).json({
          error: 'Serviço temporariamente indisponível. Tente novamente.',
          cause,
        });
      }
    });
  };
}

router.get(
  '/produtos-coleta',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(getProdutosColeta)
);

router.get(
  '/ressup-almox/registro-preview',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(getRessupAlmoxRegistroPreview)
);

router.post(
  '/ressup-almox/analises',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(postRessupAlmoxAnalise)
);
router.get(
  '/ressup-almox/analises',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(getRessupAlmoxAnalises)
);
router.get(
  '/ressup-almox/analises/:id',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(getRessupAlmoxAnaliseById)
);
router.put(
  '/ressup-almox/analises/:id',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(putRessupAlmoxAnalise)
);
router.patch(
  '/ressup-almox/analises/:id/processar',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(patchRessupAlmoxAnaliseProcessar)
);
router.patch(
  '/ressup-almox/analises/:id/concluir',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(patchRessupAlmoxAnaliseConcluir)
);

router.get(
  '/coletas/opcoes-filtro',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(getOpcoesFiltroColetas)
);
router.get(
  '/coletas/opcoes-vinculo-finalizacao',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(getOpcoesVinculoFinalizacao)
);
router.get(
  '/coletas/opcoes-vinculo-erro-operacional',
  requirePermission(PERMISSOES.COMPRAS_VINCULO_FINALIZACAO_AMPLIADO),
  async503(getOpcoesVinculoErroOperacional)
);
router.get(
  '/coletas/debug',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(getColetasPrecosDebug)
);
router.get(
  '/coletas',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(getColetasPrecos)
);

router.get(
  '/dashboard/erros-vinculo-operacional',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(getDashboardErrosVinculoOperacional)
);

router.get(
  '/coletas-bloqueantes',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(getColetasBloqueantes)
);

router.post(
  '/coletas/:id/ciencia',
  requirePermission(PERMISSOES.COMPRAS_EDITAR),
  async503(postCienciaColeta)
);

router.post(
  '/confirmar-coleta',
  requirePermission(PERMISSOES.COMPRAS_EDITAR),
  async503(postConfirmarColeta)
);

router.get(
  '/fornecedores',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(getFornecedores)
);

router.get(
  '/condicoes-pagamento',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(getCondicoesPagamento)
);

router.get(
  '/formas-pagamento',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(getFormasPagamento)
);

router.delete(
  '/coletas/:id',
  requirePermission(PERMISSOES.COMPRAS_EDITAR),
  async503(deleteColetaPrecos)
);

router.put(
  '/coletas/:id/fornecedores',
  requirePermission(PERMISSOES.COMPRAS_EDITAR),
  async503(putColetaFornecedores)
);

router.get(
  '/coletas/:id/precos',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(getPrecosColeta)
);

router.get(
  '/coletas/:id/precos-cotacao',
  requirePermission(PERMISSOES.COMPRAS_VER),
  async503(getPrecosCotacao)
);

router.post(
  '/coletas/:id/precos-cotacao',
  requirePermission(PERMISSOES.COMPRAS_EDITAR),
  async503(postPrecosCotacao)
);

router.patch(
  '/coletas/:id/observacoes',
  requirePermission(PERMISSOES.COMPRAS_EDITAR),
  async503(patchObservacoesColeta)
);

router.patch(
  '/coletas/:id/enviar-aprovacao',
  requirePermission(PERMISSOES.COMPRAS_EDITAR),
  async503(patchEnviarAprovacao)
);

router.patch(
  '/coletas/:id/cancelar-cotacao',
  requirePermission(PERMISSOES.COMPRAS_EDITAR),
  async503(patchCancelarCotacao)
);

router.patch(
  '/coletas/:id/reabrir',
  requirePermission(PERMISSOES.COMPRAS_EDITAR),
  async503(patchReabrirColeta)
);

router.patch(
  '/coletas/:id/finalizar-cotacao',
  requirePermission(PERMISSOES.COMPRAS_EDITAR),
  async503(patchFinalizarCotacao)
);

router.patch(
  '/coletas/:id/registros/:registroId',
  requirePermission(PERMISSOES.COMPRAS_EDITAR),
  async503(patchRegistroQtdeAprovada)
);

router.patch(
  '/coletas/:id/enviar-financeiro',
  requirePermission(PERMISSOES.COMPRAS_EDITAR),
  async503(patchEnviarFinanceiro)
);

router.delete(
  '/coletas/:id/itens/todos',
  requirePermission(PERMISSOES.COMPRAS_EDITAR),
  async503(deleteColetaTodosItens)
);

router.delete(
  '/coletas/:id/itens/:idProduto',
  requirePermission(PERMISSOES.COMPRAS_EDITAR),
  async503(deleteColetaItem)
);

router.post(
  '/coletas/:id/itens',
  requirePermission(PERMISSOES.COMPRAS_EDITAR),
  async503(postColetaItens)
);

export default router;
