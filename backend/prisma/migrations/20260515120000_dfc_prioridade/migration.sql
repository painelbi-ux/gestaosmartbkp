-- DFC — Prioridade de pagamento
-- Tabelas locais (SQLite). Por empresa (idEmpresa Nomus).
-- prioridade: 1=Prioritário, 2=Reprogramar +30d, 3=Reprogramar indefinido, 4=Não pagar.

CREATE TABLE "dfc_prioridade_conta" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "idEmpresa" INTEGER NOT NULL,
  "idContaFinanceiro" INTEGER NOT NULL,
  "prioridade" INTEGER NOT NULL,
  "observacao" TEXT,
  "usuario" TEXT NOT NULL,
  "atualizadoEm" DATETIME NOT NULL,
  "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "dfc_prioridade_conta_idEmpresa_idContaFinanceiro_key"
  ON "dfc_prioridade_conta" ("idEmpresa", "idContaFinanceiro");
CREATE INDEX "dfc_prioridade_conta_prioridade_idx"
  ON "dfc_prioridade_conta" ("prioridade");
CREATE INDEX "dfc_prioridade_conta_idEmpresa_idx"
  ON "dfc_prioridade_conta" ("idEmpresa");

CREATE TABLE "dfc_prioridade_lancamento" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "idEmpresa" INTEGER NOT NULL,
  "tipoRef" TEXT NOT NULL,
  "idRef" INTEGER NOT NULL,
  "prioridade" INTEGER NOT NULL,
  "observacao" TEXT,
  "usuario" TEXT NOT NULL,
  "atualizadoEm" DATETIME NOT NULL,
  "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "dfc_prioridade_lancamento_idEmpresa_tipoRef_idRef_key"
  ON "dfc_prioridade_lancamento" ("idEmpresa", "tipoRef", "idRef");
CREATE INDEX "dfc_prioridade_lancamento_prioridade_idx"
  ON "dfc_prioridade_lancamento" ("prioridade");
CREATE INDEX "dfc_prioridade_lancamento_idEmpresa_tipoRef_idx"
  ON "dfc_prioridade_lancamento" ("idEmpresa", "tipoRef");
