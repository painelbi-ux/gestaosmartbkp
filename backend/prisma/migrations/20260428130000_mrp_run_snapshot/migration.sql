-- MRP runs/history + immutable snapshot rows
CREATE TABLE "mrp_run" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uid" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "observacoes" TEXT,
    "scenario_type" TEXT NOT NULL,
    "scenario_file_name" TEXT,
    "scenario_payload_json" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AGUARDANDO_PROCESSAMENTO',
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" DATETIME,
    "created_by_user_id" INTEGER,
    "processed_by_user_id" INTEGER,
    "created_by_login" TEXT,
    "processed_by_login" TEXT,
    CONSTRAINT "mrp_run_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "mrp_run_processed_by_user_id_fkey" FOREIGN KEY ("processed_by_user_id") REFERENCES "usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "mrp_run_uid_key" ON "mrp_run"("uid");
CREATE INDEX "mrp_run_status_idx" ON "mrp_run"("status");
CREATE INDEX "mrp_run_created_at_idx" ON "mrp_run"("created_at");
CREATE INDEX "mrp_run_processed_at_idx" ON "mrp_run"("processed_at");
CREATE INDEX "mrp_run_created_by_user_id_idx" ON "mrp_run"("created_by_user_id");
CREATE INDEX "mrp_run_processed_by_user_id_idx" ON "mrp_run"("processed_by_user_id");

CREATE TABLE "mrp_snapshot_row" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "run_id" INTEGER NOT NULL,
    "row_json" TEXT NOT NULL,
    "codigo" TEXT,
    "componente" TEXT,
    "coleta" TEXT,
    "item_critico" TEXT,
    "data_necessidade" TEXT,
    "data_ruptura" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mrp_snapshot_row_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "mrp_run" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "mrp_snapshot_row_run_id_idx" ON "mrp_snapshot_row"("run_id");
CREATE INDEX "mrp_snapshot_row_codigo_idx" ON "mrp_snapshot_row"("codigo");
CREATE INDEX "mrp_snapshot_row_data_necessidade_idx" ON "mrp_snapshot_row"("data_necessidade");
CREATE INDEX "mrp_snapshot_row_data_ruptura_idx" ON "mrp_snapshot_row"("data_ruptura");
