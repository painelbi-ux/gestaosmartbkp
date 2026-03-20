CREATE TABLE "programacao_setorial_registro" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "nome" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDENTE',
  "observacao" TEXT,
  "criadoPor" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "programacao_setorial_registro_status_idx" ON "programacao_setorial_registro"("status");
CREATE INDEX "programacao_setorial_registro_createdAt_idx" ON "programacao_setorial_registro"("createdAt");
