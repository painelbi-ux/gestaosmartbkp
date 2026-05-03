-- Remove feature Ressup Almox (tabelas locais SQLite)
PRAGMA foreign_keys=OFF;
DROP TABLE IF EXISTS "ressup_almox_row";
DROP TABLE IF EXISTS "ressup_almox_snapshot";
PRAGMA foreign_keys=ON;
