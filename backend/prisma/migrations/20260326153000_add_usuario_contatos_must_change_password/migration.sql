-- Add optional contact fields and forced password change flag
ALTER TABLE "usuario" ADD COLUMN "email" TEXT;
ALTER TABLE "usuario" ADD COLUMN "telefone" TEXT;
ALTER TABLE "usuario" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
