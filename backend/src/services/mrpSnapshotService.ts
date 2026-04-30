import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../config/prisma.js';
import { getNomusPool, isNomusEnabled } from '../config/nomusDb.js';
import { somarQtdeTotalComponenteMppPorCodigoSemFiltro } from '../controllers/mppController.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_FILE = 'mrpQuery.sql';

function resolveSqlPath(): string {
  const candidates = [
    join(__dirname, '..', 'data', SQL_FILE),
    join(process.cwd(), 'src', 'data', SQL_FILE),
    join(process.cwd(), 'dist', 'data', SQL_FILE),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new Error(`Arquivo ${SQL_FILE} não encontrado.`);
}

let sqlCache: string | null = null;
function getMrpSql(): string {
  if (sqlCache) return sqlCache;
  sqlCache = readFileSync(resolveSqlPath(), 'utf-8').trim();
  return sqlCache;
}

export type MrpScenarioRow = {
  id_pedido: string;
  previsao_nova: string;
  /** Código do produto (coluna Cod) — reforça o vínculo com o pai no ERP. */
  cod_produto?: string | null;
  /** Quantidade pendente no arquivo (ex.: Qtde Pendente Real); senão o backend busca no ERP. */
  qtde_pendente?: number | null;
};

function normalizePdDigits(pd: string): string {
  const s = String(pd ?? '').trim();
  const digits = s.replace(/\D+/g, '');
  return digits || s;
}

function normalizeIdChave(value: string): string {
  return String(value ?? '').trim();
}

function normalizeIsoDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1]!;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function tryApplyScenarioDate(row: Record<string, unknown>, iso: string): void {
  if ('dataNecessidade' in row) row.dataNecessidade = iso;
  if ('dataEntrega' in row) row.dataEntrega = iso;
  if ('Data Necessidade' in row) row['Data Necessidade'] = iso;
  if ('Data Entrega' in row) row['Data Entrega'] = iso;
}

export async function buildMrpSnapshotRows(args: {
  scenarioType: 'REAL' | 'SIMULADO';
  scenarioRows?: MrpScenarioRow[] | null;
}): Promise<Array<Record<string, unknown>>> {
  const pool = getNomusPool();
  if (!pool || !isNomusEnabled()) {
    throw new Error('ERP (Nomus) não configurado.');
  }

  const sql = getMrpSql();
  const [rowsRaw] = await pool.query(sql);
  const rows = (Array.isArray(rowsRaw) ? rowsRaw : []) as Array<Record<string, unknown>>;

  let scenarioMap: Map<string, string> | null = null;
  if (args.scenarioType === 'SIMULADO') {
    scenarioMap = new Map();
    for (const s of args.scenarioRows ?? []) {
      const idChave = normalizeIdChave(String(s.id_pedido ?? ''));
      const dt = normalizeIsoDate(s.previsao_nova);
      if (!idChave || !dt) continue;
      scenarioMap.set(idChave, dt);
    }
  }

  const { totais } = await somarQtdeTotalComponenteMppPorCodigoSemFiltro(pool);
  const out: Array<Record<string, unknown>> = [];
  for (const src of rows) {
    const row = { ...src } as Record<string, unknown>;
    if (scenarioMap && scenarioMap.size > 0) {
      const idChave = normalizeIdChave(String(row.idChave ?? row.id_pedido ?? ''));
      let dt = scenarioMap.get(idChave);
      if (!dt) {
        const pdRaw = String(row.PD ?? row.pd ?? '').trim();
        const pdNorm = normalizePdDigits(pdRaw);
        dt = scenarioMap.get(pdNorm);
      }
      if (dt) {
        tryApplyScenarioDate(row, dt);
      }
    }
    const cod = String(row.codigocomponente ?? row.Cod ?? row.cod ?? '').trim();
    if (cod && Number.isFinite(Number(totais[cod]))) {
      row.empenhoTotal = Number(totais[cod]).toFixed(2);
    } else if (row.empenhoTotal == null) {
      row.empenhoTotal = '—';
    }
    out.push(row);
  }
  return out;
}

export async function persistMrpSnapshotRows(
  runId: number,
  rows: Array<Record<string, unknown>>
): Promise<void> {
  if (rows.length === 0) return;
  const BATCH = 250;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await prisma.mrpSnapshotRow.createMany({
      data: chunk.map((r) => {
        const codigo = String(r.codigocomponente ?? r.Cod ?? r.cod ?? '').trim() || null;
        const componente = String(r.componente ?? r['Descricao do produto'] ?? '').trim() || null;
        const coleta = String(r.coleta ?? r.Coleta ?? '').trim() || null;
        const itemCritico = String(r.itemcritico ?? r.item_critico ?? '').trim() || null;
        const dataNecessidade = normalizeIsoDate(r.dataNecessidade ?? r['Data Necessidade']);
        const dataRuptura = normalizeIsoDate(r.dataRuptura ?? r['Data Ruptura']);
        return {
          run_id: runId,
          row_json: JSON.stringify(r),
          codigo,
          componente,
          coleta,
          item_critico: itemCritico,
          data_necessidade: dataNecessidade,
          data_ruptura: dataRuptura,
        };
      }),
    });
  }
}
