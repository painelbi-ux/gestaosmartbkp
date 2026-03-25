/**
 * Importa o CSV PSA (NCM x ICMS) para a tabela local `psa_ncm_icms_bz0`.
 *
 * Uso:
 *   npx tsx scripts/import-psa-ncm-icms.ts
 *   npx tsx scripts/import-psa-ncm-icms.ts "C:\\caminho\\arquivo.csv"
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/config/prisma.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function normalizeNcmDigits(ncm: string): string {
  return ncm.replace(/\D/g, '');
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && c === ',') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

async function main() {
  const argPath = process.argv[2];
  const defaultPath = join(__dirname, '../data/psa_ncm_icms_bz0.csv');
  const filePath = argPath || defaultPath;

  const raw = readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');

  if (lines.length < 2) {
    console.error('CSV vazio ou sem dados.');
    process.exit(1);
  }

  const header = parseCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, '').toLowerCase());
  const idxId = header.indexOf('idncmicms');
  const idxEf = header.indexOf('icmsefetivo');
  const idxAliq = header.indexOf('aliquotaicms');
  const idxRed = header.indexOf('reducaobc');
  const idxNcm = header.indexOf('ncm');
  if (idxNcm < 0 || idxEf < 0) {
    console.error('Cabeçalho esperado: idncmicms, icmsefetivo, aliquotaicms, reducaobc, ncm');
    process.exit(1);
  }

  let upserted = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 2) continue;
    const ncmRaw = (cols[idxNcm] ?? '').replace(/^"|"$/g, '');
    const norm = normalizeNcmDigits(ncmRaw);
    if (!norm) continue;

    const idLegado = idxId >= 0 ? parseInt(cols[idxId] ?? '', 10) : NaN;
    const icmsefetivo = parseFloat(String(cols[idxEf] ?? '').replace(',', '.')) || 0;
    const aliquotaicms =
      idxAliq >= 0 ? parseFloat(String(cols[idxAliq] ?? '').replace(',', '.')) || 0 : 0;
    const reducaobc = idxRed >= 0 ? parseFloat(String(cols[idxRed] ?? '').replace(',', '.')) || 0 : 0;

    await prisma.psaNcmIcmsBz0.upsert({
      where: { ncmNormalizado: norm },
      create: {
        ncmNormalizado: norm,
        idLegado: Number.isFinite(idLegado) ? idLegado : null,
        icmsefetivo,
        aliquotaicms,
        reducaobc,
      },
      update: {
        idLegado: Number.isFinite(idLegado) ? idLegado : null,
        icmsefetivo,
        aliquotaicms,
        reducaobc,
      },
    });
    upserted += 1;
  }

  console.log(`Importação PSA NCM/ICMS concluída: ${upserted} registro(s) a partir de ${filePath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
