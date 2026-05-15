-- CreateTable SupportTicketRead (lido/não lido por usuário; padrão usado em SycroOrder)
CREATE TABLE "support_ticket_read" (
    "ticketId" INTEGER NOT NULL,
    "userLogin" TEXT NOT NULL,
    "readAt" DATETIME,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("ticketId", "userLogin"),
    CONSTRAINT "support_ticket_read_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "support_ticket_read_userLogin_idx" ON "support_ticket_read"("userLogin");
