-- CreateTable SycroOrder (orders, history, notifications)
CREATE TABLE "sycro_order_order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "order_number" TEXT NOT NULL,
    "delivery_method" TEXT NOT NULL,
    "current_promised_date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "is_urgent" INTEGER NOT NULL DEFAULT 0,
    "created_by" INTEGER,
    "creator_name" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sycro_order_order_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "sycro_order_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "order_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "user_name" TEXT,
    "action_type" TEXT NOT NULL,
    "previous_date" TEXT,
    "new_date" TEXT,
    "observation" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sycro_order_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sycro_order_order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sycro_order_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "sycro_order_notification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "order_id" INTEGER,
    "is_read" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sycro_order_notification_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "usuario" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sycro_order_notification_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sycro_order_order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "sycro_order_order_created_by_idx" ON "sycro_order_order"("created_by");
CREATE INDEX "sycro_order_order_status_idx" ON "sycro_order_order"("status");
CREATE INDEX "sycro_order_order_created_at_idx" ON "sycro_order_order"("created_at");

CREATE INDEX "sycro_order_history_order_id_idx" ON "sycro_order_history"("order_id");
CREATE INDEX "sycro_order_history_user_id_idx" ON "sycro_order_history"("user_id");

CREATE INDEX "sycro_order_notification_user_id_idx" ON "sycro_order_notification"("user_id");
CREATE INDEX "sycro_order_notification_order_id_idx" ON "sycro_order_notification"("order_id");
