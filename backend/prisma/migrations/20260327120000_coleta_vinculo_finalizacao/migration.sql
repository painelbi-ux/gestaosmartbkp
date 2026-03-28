-- Coletas existentes: não exigem vínculo (comportamento anterior). Novas coletas usam default true no Prisma.
ALTER TABLE "coleta_precos" ADD COLUMN "requerVinculoFinalizacao" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "coleta_precos" ADD COLUMN "finalizacaoTipoRegistro" TEXT;
ALTER TABLE "coleta_precos" ADD COLUMN "finalizacaoIdRegistro" INTEGER;
UPDATE "coleta_precos" SET "requerVinculoFinalizacao" = 0;
