-- AlterTable
ALTER TABLE "sycro_order_order" ADD COLUMN "responsible_user_id" INTEGER;

-- CreateIndex
CREATE INDEX "sycro_order_order_responsible_user_id_idx" ON "sycro_order_order"("responsible_user_id");
