-- AlterTable
ALTER TABLE "grupo_usuario" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN "permissoes" TEXT;

