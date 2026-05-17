-- Tempo máximo de inatividade (minutos) antes do logout automático; null = desativado
ALTER TABLE "grupo_usuario" ADD COLUMN "logoutInatividadeMinutos" INTEGER;
