-- CreateTable
CREATE TABLE "coleta_precos_vinculo_erro_operacional" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "coletaPrecosId" INTEGER NOT NULL,
    "usuario" TEXT NOT NULL,
    "vinculosJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coleta_precos_vinculo_erro_operacional_coletaPrecosId_fkey" FOREIGN KEY ("coletaPrecosId") REFERENCES "coleta_precos" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "coleta_precos_vinculo_erro_operacional_coletaPrecosId_idx" ON "coleta_precos_vinculo_erro_operacional"("coletaPrecosId");

-- CreateIndex
CREATE INDEX "coleta_precos_vinculo_erro_operacional_createdAt_idx" ON "coleta_precos_vinculo_erro_operacional"("createdAt");
