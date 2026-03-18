-- CreateTable SycroOrderOrderRead (lido/não lido por usuário)
CREATE TABLE "sycro_order_order_read" (
    "order_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "read_at" DATETIME,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("order_id", "user_id"),
    CONSTRAINT "sycro_order_order_read_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sycro_order_order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sycro_order_order_read_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "sycro_order_order_read_user_id_idx" ON "sycro_order_order_read"("user_id");
