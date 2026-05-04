-- Snapshot de análises Ressup Almox (grade + dados Nomus)
CREATE TABLE "ressup_almox_analise" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioLogin" TEXT NOT NULL,
    "resumoFiltros" TEXT,
    "linhaCount" INTEGER NOT NULL DEFAULT 0,
    "payload" TEXT NOT NULL
);

CREATE INDEX "ressup_almox_analise_createdAt_idx" ON "ressup_almox_analise"("createdAt");
