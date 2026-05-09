-- CreateTable
CREATE TABLE "support_ticket_catalog_item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "blocksUserReply" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "support_ticket_catalog_item_kind_code_key" ON "support_ticket_catalog_item"("kind", "code");

-- CreateIndex
CREATE INDEX "support_ticket_catalog_item_kind_active_sortOrder_idx" ON "support_ticket_catalog_item"("kind", "active", "sortOrder");
