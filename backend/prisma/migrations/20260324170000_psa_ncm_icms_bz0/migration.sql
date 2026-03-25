-- CreateTable
CREATE TABLE "psa_ncm_icms_bz0" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "idLegado" INTEGER,
    "ncmNormalizado" TEXT NOT NULL,
    "icmsefetivo" REAL NOT NULL,
    "aliquotaicms" REAL NOT NULL,
    "reducaobc" REAL NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "psa_ncm_icms_bz0_ncmNormalizado_key" ON "psa_ncm_icms_bz0"("ncmNormalizado");
