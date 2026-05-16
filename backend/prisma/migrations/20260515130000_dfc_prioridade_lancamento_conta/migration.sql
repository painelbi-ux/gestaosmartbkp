-- Adiciona idContaFinanceiro (Nomus contafinanceiro.id) como cache local da conta do lançamento
ALTER TABLE "dfc_prioridade_lancamento" ADD COLUMN "idContaFinanceiro" INTEGER;
CREATE INDEX "dfc_prioridade_lancamento_idContaFinanceiro_idx"
  ON "dfc_prioridade_lancamento" ("idContaFinanceiro");
