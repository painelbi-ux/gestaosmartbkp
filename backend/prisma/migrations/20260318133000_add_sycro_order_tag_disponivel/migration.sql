-- Add availability tag for Comunicação PD
ALTER TABLE "sycro_order_order" ADD COLUMN "tag_disponivel" INTEGER NOT NULL DEFAULT 0;

