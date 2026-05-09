-- CreateTable
CREATE TABLE "support_ticket" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ticketNumber" TEXT NOT NULL,
    "ownerLogin" TEXT NOT NULL,
    "ownerNome" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT,
    "prioridade" TEXT NOT NULL DEFAULT 'media',
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "customFieldsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastStatusChangeAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastStatusChangeBy" TEXT
);

-- CreateTable
CREATE TABLE "support_ticket_message" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ticketId" INTEGER NOT NULL,
    "authorLogin" TEXT NOT NULL,
    "authorNome" TEXT,
    "authorType" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_ticket_message_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "support_ticket_attachment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ticketId" INTEGER NOT NULL,
    "messageId" INTEGER,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_ticket_attachment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "support_ticket_attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "support_ticket_message" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "support_ticket_status_history" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ticketId" INTEGER NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_ticket_status_history_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "support_ticket_field_config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "optionsJson" TEXT,
    "placeholder" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "support_ticket_notification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userLogin" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_ticket_notification_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "support_ticket_ticketNumber_key" ON "support_ticket"("ticketNumber");
CREATE INDEX "support_ticket_ownerLogin_idx" ON "support_ticket"("ownerLogin");
CREATE INDEX "support_ticket_status_idx" ON "support_ticket"("status");
CREATE INDEX "support_ticket_prioridade_idx" ON "support_ticket"("prioridade");
CREATE INDEX "support_ticket_createdAt_idx" ON "support_ticket"("createdAt");

-- CreateIndex
CREATE INDEX "support_ticket_message_ticketId_idx" ON "support_ticket_message"("ticketId");
CREATE INDEX "support_ticket_message_createdAt_idx" ON "support_ticket_message"("createdAt");

-- CreateIndex
CREATE INDEX "support_ticket_attachment_ticketId_idx" ON "support_ticket_attachment"("ticketId");
CREATE INDEX "support_ticket_attachment_messageId_idx" ON "support_ticket_attachment"("messageId");

-- CreateIndex
CREATE INDEX "support_ticket_status_history_ticketId_idx" ON "support_ticket_status_history"("ticketId");
CREATE INDEX "support_ticket_status_history_changedAt_idx" ON "support_ticket_status_history"("changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "support_ticket_field_config_fieldKey_key" ON "support_ticket_field_config"("fieldKey");
CREATE INDEX "support_ticket_field_config_sortOrder_idx" ON "support_ticket_field_config"("sortOrder");

-- CreateIndex
CREATE INDEX "support_ticket_notification_userLogin_idx" ON "support_ticket_notification"("userLogin");
CREATE INDEX "support_ticket_notification_ticketId_idx" ON "support_ticket_notification"("ticketId");
CREATE INDEX "support_ticket_notification_createdAt_idx" ON "support_ticket_notification"("createdAt");
