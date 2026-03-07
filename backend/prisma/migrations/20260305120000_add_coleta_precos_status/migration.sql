-- Add missing columns to coleta_precos (status and related approval fields)
ALTER TABLE "coleta_precos" ADD COLUMN "status" TEXT DEFAULT 'Em cotação';
ALTER TABLE "coleta_precos" ADD COLUMN "dataEnvioAprovacao" DATETIME;
ALTER TABLE "coleta_precos" ADD COLUMN "justificativaCancelamento" TEXT;
ALTER TABLE "coleta_precos" ADD COLUMN "dataCancelamento" DATETIME;
