-- CreateTable
CREATE TABLE "ressup_almox_snapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario_login" TEXT,
    "titulo" TEXT,
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "nomus_erro" TEXT
);

-- CreateTable
CREATE TABLE "ressup_almox_row" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "snapshot_id" INTEGER NOT NULL,
    "id_produto" INTEGER NOT NULL,
    "id_solicitacao" INTEGER,
    "dados_json" TEXT NOT NULL,
    "qtde_aprovada" REAL,
    "descricao_produto" TEXT NOT NULL DEFAULT '',
    "descricao_lc" TEXT NOT NULL DEFAULT '',
    "und_medida" TEXT NOT NULL DEFAULT '',
    "und_medida_lc" TEXT NOT NULL DEFAULT '',
    "nome_coleta" TEXT NOT NULL DEFAULT '',
    "nome_coleta_lc" TEXT NOT NULL DEFAULT '',
    "item_critico" TEXT NOT NULL DEFAULT '',
    "item_critico_lc" TEXT NOT NULL DEFAULT '',
    "qtde_emp" REAL,
    "cm" REAL,
    "qtde_solicit" REAL,
    "estoq_atual" REAL,
    "qtde_ultm_comp" REAL,
    "data_ultm_entr" TEXT,
    "preco_ant" REAL,
    "est_seg" REAL,
    "pc_pend" REAL,
    "ag_pag" REAL,
    CONSTRAINT "ressup_almox_row_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "ressup_almox_snapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ressup_almox_snapshot_created_at_idx" ON "ressup_almox_snapshot"("created_at");

-- CreateIndex
CREATE INDEX "ressup_almox_row_snapshot_id_idx" ON "ressup_almox_row"("snapshot_id");

-- CreateIndex
CREATE INDEX "ressup_almox_row_id_produto_idx" ON "ressup_almox_row"("id_produto");
