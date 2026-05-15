-- Adiciona campos de conclusão à análise Ressup Almox (terceiro status: concluido)
ALTER TABLE "ressup_almox_analise" ADD COLUMN "concluidoAt" DATETIME;
ALTER TABLE "ressup_almox_analise" ADD COLUMN "usuarioLoginConcluido" TEXT;
