-- Adiciona campos de status e processamento à análise Ressup Almox
ALTER TABLE "ressup_almox_analise" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'em_processamento';
ALTER TABLE "ressup_almox_analise" ADD COLUMN "processadoAt" DATETIME;
ALTER TABLE "ressup_almox_analise" ADD COLUMN "usuarioLoginProcessado" TEXT;

CREATE INDEX "ressup_almox_analise_status_idx" ON "ressup_almox_analise"("status");
