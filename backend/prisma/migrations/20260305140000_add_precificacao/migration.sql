-- CreateTable
CREATE TABLE "precificacao" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "idProduto" INTEGER NOT NULL,
    "codigoProduto" TEXT,
    "descricaoProduto" TEXT,
    "data" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario" TEXT
);

-- CreateTable
CREATE TABLE "precificacao_item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "precificacaoId" INTEGER NOT NULL,
    "idprodutopai" INTEGER,
    "codigopai" TEXT,
    "descricaopai" TEXT,
    "idcomponente" INTEGER,
    "codigocomponente" TEXT,
    "componente" TEXT,
    "qtd" REAL NOT NULL,
    CONSTRAINT "precificacao_item_precificacaoId_fkey" FOREIGN KEY ("precificacaoId") REFERENCES "precificacao" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "precificacao_idProduto_idx" ON "precificacao"("idProduto");
CREATE INDEX "precificacao_data_idx" ON "precificacao"("data");
CREATE INDEX "precificacao_item_precificacaoId_idx" ON "precificacao_item"("precificacaoId");
