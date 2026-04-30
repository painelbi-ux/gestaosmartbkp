/**
 * Horizonte MRP para cenário simulado: consumo só a partir das datas do arquivo importado
 * e da lista de materiais (BOM) dos produtos das linhas do cenário. Não usa resumo MPP global.
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Pool } from 'mysql2/promise';
import { mppDiaIsoDataPrevisao, obterEstoqueSetoresPorCodigoProduto } from '../controllers/mppController.js';
import { listarPcSaldoReceberTodos } from '../controllers/pcSaldoReceberController.js';
import type { MrpHorizonteCelula, MrpHorizonteLinha, MrpHorizonteResultado } from './mrpHorizonteService.js';
import type { MrpScenarioRow } from './mrpSnapshotService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_DIAS_HORIZONTE = 400;

function isoDateOnlyValid(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function hojeIsoLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addOneDayIso(iso: string): string {
  const [y, mo, da] = iso.split('-').map(Number);
  const dt = new Date(y, mo - 1, da);
  dt.setDate(dt.getDate() + 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function enumerateDaysInclusive(inicioIso: string, fimIso: string): string[] {
  if (inicioIso > fimIso) return [];
  const out: string[] = [];
  let cur = inicioIso;
  let guard = 0;
  while (cur <= fimIso && guard++ < MAX_DIAS_HORIZONTE + 5) {
    out.push(cur);
    if (cur === fimIso) break;
    cur = addOneDayIso(cur);
  }
  return out;
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

function numHorizonte(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/\s/g, '');
  if (!s) return 0;
  let n = Number(s);
  if (Number.isFinite(n)) return n;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
    n = Number(s);
  }
  return Number.isFinite(n) ? n : 0;
}

let bomSqlCache: string | null = null;
function getBomListaMateriaisSql(): string {
  if (bomSqlCache) return bomSqlCache;
  const candidates = [
    join(__dirname, '..', 'data', 'bomListaMateriaisAcabado.sql'),
    join(process.cwd(), 'src', 'data', 'bomListaMateriaisAcabado.sql'),
    join(process.cwd(), 'dist', 'data', 'bomListaMateriaisAcabado.sql'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      bomSqlCache = readFileSync(p, 'utf-8').trim();
      return bomSqlCache;
    }
  }
  throw new Error('Arquivo bomListaMateriaisAcabado.sql não encontrado.');
}

/** Últimos dois segmentos numéricos: idPedido, idProduto (formato idChave do Gestor). */
function parseIdPedidoIdProdutoFromChave(idChave: string): { idPedido: number; idProduto: number } | null {
  const parts = String(idChave ?? '')
    .trim()
    .split('-')
    .filter((p) => p.length > 0);
  if (parts.length < 2) return null;
  const idProduto = Number(parts[parts.length - 1]);
  const idPedido = Number(parts[parts.length - 2]);
  if (!Number.isFinite(idProduto) || !Number.isFinite(idPedido)) return null;
  return { idPedido, idProduto };
}

async function resolverIdProdutoPai(
  pool: Pool,
  idChave: string,
  codProduto?: string | null
): Promise<number | null> {
  const parsed = parseIdPedidoIdProdutoFromChave(idChave);
  const c = codProduto?.trim();
  if (c) {
    const [rows] = await pool.query(
      'SELECT id FROM produto WHERE TRIM(nome) = ? AND ativo = 1 LIMIT 1',
      [c]
    );
    const arr = Array.isArray(rows) ? rows : [];
    const id = Number((arr[0] as Record<string, unknown> | undefined)?.id);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return parsed?.idProduto ?? null;
}

async function sumPendenteItemPedido(pool: Pool, idPedido: number, idProduto: number): Promise<number> {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(GREATEST(ip.qtde - COALESCE(ip.qtdeAtendida, 0), 0)), 0) AS p
     FROM itempedido ip
     WHERE ip.idPedido = ? AND ip.idProduto = ?`,
    [idPedido, idProduto]
  );
  const arr = Array.isArray(rows) ? rows : [];
  return numHorizonte((arr[0] as Record<string, unknown> | undefined)?.p);
}

type MergedCenario = {
  id_pedido: string;
  dataEntregaIso: string;
  qtdeAcc: number;
  cod_produto?: string | null;
};

function mergeScenarioRows(rows: MrpScenarioRow[]): Map<string, MergedCenario> {
  const map = new Map<string, MergedCenario>();
  for (const r of rows) {
    const dt = normalizeIsoDate(r.previsao_nova);
    if (!dt) continue;
    const id_pedido = String(r.id_pedido ?? '').trim();
    if (!id_pedido) continue;
    const qRaw = r.qtde_pendente;
    const addQ = qRaw != null && Number.isFinite(Number(qRaw)) && Number(qRaw) > 0 ? Number(qRaw) : 0;
    const prev = map.get(id_pedido);
    if (!prev) {
      map.set(id_pedido, {
        id_pedido,
        dataEntregaIso: dt,
        qtdeAcc: addQ,
        cod_produto: r.cod_produto ?? null,
      });
    } else {
      map.set(id_pedido, {
        id_pedido,
        dataEntregaIso: dt,
        qtdeAcc: prev.qtdeAcc + addQ,
        cod_produto: (r.cod_produto ?? prev.cod_produto) || null,
      });
    }
  }
  return map;
}

function addConsumo(
  consumoPorCodDia: Map<string, Map<string, number>>,
  cod: string,
  diaIso: string,
  q: number
): void {
  if (!cod || !diaIso || !Number.isFinite(q) || q === 0) return;
  if (!consumoPorCodDia.has(cod)) consumoPorCodDia.set(cod, new Map());
  const m = consumoPorCodDia.get(cod)!;
  m.set(diaIso, (m.get(diaIso) ?? 0) + q);
}

export async function computarHorizonteCenarioSimulado(
  pool: Pool,
  horizonteFimIso: string,
  scenarioRows: MrpScenarioRow[]
): Promise<{ ok: true; data: MrpHorizonteResultado } | { ok: false; error: string }> {
  if (!isoDateOnlyValid(horizonteFimIso)) {
    return { ok: false, error: 'Parâmetro horizonte_fim deve ser YYYY-MM-DD.' };
  }
  const hoje = hojeIsoLocal();
  if (horizonteFimIso < hoje) {
    return { ok: false, error: 'Horizonte de Produção deve ser maior ou igual à data de hoje.' };
  }

  const merged = mergeScenarioRows(scenarioRows);
  if (merged.size === 0) {
    return { ok: false, error: 'Cenário simulado sem linhas válidas (idChave e Nova previsão).' };
  }

  let fimCalendario = horizonteFimIso;
  for (const v of merged.values()) {
    if (v.dataEntregaIso > fimCalendario) fimCalendario = v.dataEntregaIso;
  }

  const datas = enumerateDaysInclusive(hoje, fimCalendario);
  if (datas.length === 0) {
    return { ok: false, error: 'Intervalo de datas inválido.' };
  }
  if (datas.length > MAX_DIAS_HORIZONTE) {
    return {
      ok: false,
      error: `Horizonte máximo de ${MAX_DIAS_HORIZONTE} dias. Reduza o intervalo ou as datas do cenário.`,
    };
  }
  const setDias = new Set(datas);

  const consumoPorCodDia = new Map<string, Map<string, number>>();
  const componentePorCod = new Map<string, string>();
  const bomSql = getBomListaMateriaisSql();

  for (const m of merged.values()) {
    const idProdutoPai = await resolverIdProdutoPai(pool, m.id_pedido, m.cod_produto);
    if (idProdutoPai == null) continue;

    const parsed = parseIdPedidoIdProdutoFromChave(m.id_pedido);
    let qtde = m.qtdeAcc;
    if (qtde <= 0 && parsed) {
      qtde = await sumPendenteItemPedido(pool, parsed.idPedido, idProdutoPai);
    }
    if (qtde <= 0) continue;

    const diaEntrega = m.dataEntregaIso;
    if (!setDias.has(diaEntrega)) {
      // data do arquivo fora do intervalo [hoje, fim] — não deveria ocorrer pois estendemos fim
      continue;
    }

    const [bomRaw] = await pool.query(bomSql, [idProdutoPai]);
    const bomList = Array.isArray(bomRaw) ? (bomRaw as Record<string, unknown>[]) : [];
    for (const br of bomList) {
      const cod = String(br.codigocomponente ?? '').trim();
      const qMult = numHorizonte(br.qtd);
      if (!cod || qMult <= 0) continue;
      const consumo = qMult * qtde;
      addConsumo(consumoPorCodDia, cod, diaEntrega, consumo);
      const comp = String(br.componente ?? '').trim();
      if (comp && (!componentePorCod.has(cod) || comp.length > (componentePorCod.get(cod) ?? '').length)) {
        componentePorCod.set(cod, comp);
      }
    }
  }

  const codigosOrdenados = [...consumoPorCodDia.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (codigosOrdenados.length === 0) {
    return {
      ok: true,
      data: {
        dataInicio: hoje,
        dataFim: fimCalendario,
        datas,
        linhas: [],
      },
    };
  }

  const codigoSet = new Set(codigosOrdenados);
  const estoqueSetores = await obterEstoqueSetoresPorCodigoProduto(pool);

  const pcRows = await listarPcSaldoReceberTodos(pool, {
    codigoProduto: '',
    dataEntregaIni: hoje,
    dataEntregaFim: fimCalendario,
  });
  const entradaPorCodDia = new Map<string, Map<string, number>>();
  for (const row of pcRows) {
    const cod = String(row.codigoProduto ?? '').trim();
    if (!cod || !codigoSet.has(cod)) continue;
    const dia = mppDiaIsoDataPrevisao(row.dataEntrega);
    if (!dia || !isoDateOnlyValid(dia) || !setDias.has(dia)) continue;
    const ent = numHorizonte(row.saldoaReceber);
    if (!entradaPorCodDia.has(cod)) entradaPorCodDia.set(cod, new Map());
    const mm = entradaPorCodDia.get(cod)!;
    mm.set(dia, (mm.get(dia) ?? 0) + ent);
  }

  const linhas: MrpHorizonteLinha[] = [];
  for (const cod of codigosOrdenados) {
    const saldoBase = estoqueSetores.get(cod) ?? 0;
    const mapC = consumoPorCodDia.get(cod);
    const mapE = entradaPorCodDia.get(cod);
    const dias: MrpHorizonteCelula[] = [];
    for (const d of datas) {
      const consumo = mapC?.get(d) ?? 0;
      const saldoEstoque = saldoBase;
      const entrada = mapE?.get(d) ?? 0;
      const necessidade = Math.max(0, consumo - (saldoEstoque + entrada));
      dias.push({ data: d, consumo, saldoEstoque, entrada, necessidade });
    }
    linhas.push({
      codigo: cod,
      componente: componentePorCod.get(cod) ?? '',
      dias,
    });
  }

  return {
    ok: true,
    data: {
      dataInicio: hoje,
      dataFim: fimCalendario,
      datas,
      linhas,
    },
  };
}
