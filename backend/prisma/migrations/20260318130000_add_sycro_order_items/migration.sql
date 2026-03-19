-- Add columns to store referenced ERP item ids/codes per card
ALTER TABLE "sycro_order_order" ADD COLUMN "item_ids_json" TEXT;
ALTER TABLE "sycro_order_order" ADD COLUMN "item_codes_json" TEXT;

