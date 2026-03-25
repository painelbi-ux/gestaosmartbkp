-- Comunicação PD: estado "aguarda resposta" na capa do card
ALTER TABLE "sycro_order_order" ADD COLUMN "aguarda_resposta_pendente" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sycro_order_order" ADD COLUMN "aguarda_resposta_de_label" TEXT;
