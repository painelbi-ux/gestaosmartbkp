/**
 * Alinha a coluna "Previsão atual" do Gerenciador (SQLite pedido_previsao_ajuste)
 * com a data do card Comunicação PD, quando o histórico do card foi atualizado mas
 * o ajuste não chegou a ser gravado (ex.: ids de item / PD incompatíveis antes da correção).
 *
 * Uso:
 *   cd backend && npx tsx scripts/alinhar-previsao-sycroorder-gerenciador.ts
 * Simular sem gravar:
 *   DRY_RUN=1 npx tsx scripts/alinhar-previsao-sycroorder-gerenciador.ts
 */
import { prisma } from '../src/config/prisma.js';
import { listarPedidos, registrarAjustesPrevisaoLote, type AjusteLoteItem } from '../src/data/pedidosRepository.js';

function parseJsonArray(value: string | null | undefined): string[] | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  try {
    const arr = JSON.parse(s);
    if (!Array.isArray(arr)) return null;
    return arr.map((x) => String(x ?? '').trim()).filter(Boolean);
  } catch {
    return null;
  }
}

function chavePedidoItem(id: string): string {
  const parts = String(id ?? '')
    .trim()
    .split('-');
  if (parts.length >= 3) {
    const pedido = parts[parts.length - 2]!.trim();
    const itemStr = parts[parts.length - 1]!.trim();
    const numItem = parseInt(itemStr, 10);
    const itemCanonico = Number.isNaN(numItem) ? itemStr : String(numItem);
    return `${pedido}-${itemCanonico}`;
  }
  if (parts.length === 2) return parts.join('-').trim();
  return String(id ?? '').trim();
}

function rowItemIdKey(row: Record<string, unknown>): string {
  return String(row['id_pedido'] ?? row['idChave'] ?? '').trim();
}

function resolveRelevantRowsForCard(
  rows: Array<Record<string, unknown>>,
  selectedItemIds: string[] | null,
  itemCodesJson: string | null | undefined
): Array<Record<string, unknown>> {
  if (!selectedItemIds || selectedItemIds.length === 0) {
    return rows;
  }
  const byStrict = rows.filter((r) => selectedItemIds.includes(rowItemIdKey(r)));
  if (byStrict.length > 0) return byStrict;
  const selCanon = new Set(selectedItemIds.map((id) => chavePedidoItem(id)));
  const byCanon = rows.filter((r) => selCanon.has(chavePedidoItem(rowItemIdKey(r))));
  if (byCanon.length > 0) return byCanon;
  const codes = parseJsonArray(itemCodesJson);
  if (codes && codes.length > 0) {
    const set = new Set(codes.map((c) => String(c).trim()).filter(Boolean));
    const byCode = rows.filter((r) => set.has(String(r['Cod'] ?? r['cod'] ?? '').trim()));
    if (byCode.length > 0) return byCode;
  }
  return [];
}

function normalizePdDigitsForCompare(pd: string): string {
  const s = String(pd ?? '').trim();
  const digits = s.replace(/\D+/g, '');
  return digits || s;
}

function gerenciadorRowMatchesOrderNumber(row: Record<string, unknown>, orderNumber: string): boolean {
  const rowPd = String(row['PD'] ?? row['pd'] ?? '').trim();
  const ord = String(orderNumber ?? '').trim();
  if (!rowPd || !ord) return false;
  const a = normalizePdDigitsForCompare(rowPd);
  const b = normalizePdDigitsForCompare(ord);
  return a.length > 0 && a === b;
}

function sortedUnique(arr: string[]): string[] {
  return [...new Set(arr.map((s) => String(s ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function parseTargetDateYmd(order: {
  current_promised_date: string;
  id: number;
  order_number: string;
  lastUpdateNewDate: string | null;
}): string | null {
  const fromHist = order.lastUpdateNewDate?.trim().slice(0, 10) ?? '';
  const fromCard = String(order.current_promised_date ?? '').trim().slice(0, 10);
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (fromHist && ymd.test(fromHist)) return fromHist;
  if (fromCard && ymd.test(fromCard)) return fromCard;
  console.warn(`  [ignorar] PD ${order.order_number} (#${order.id}): data alvo inválida`);
  return null;
}

async function main() {
  const dry = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
  console.log('Alinhar previsão Gerenciador ↔ Comunicação PD');
  if (dry) console.log('MODO DRY_RUN: nenhum registro será gravado.\n');

  const { data: gerenciadorList, erroConexao } = await listarPedidos({});
  if (erroConexao) {
    console.error('Falha ao carregar Gerenciador:', erroConexao);
    process.exit(1);
  }
  const rowsAll = (gerenciadorList ?? []) as Array<Record<string, unknown>>;

  const orders = await prisma.sycroOrderOrder.findMany({
    select: {
      id: true,
      order_number: true,
      current_promised_date: true,
      item_ids_json: true,
      item_codes_json: true,
      status: true,
    },
    orderBy: { id: 'asc' },
  });

  let cardsComItens = 0;
  let ajustesGravados = 0;
  let cardsSemLinhaGerenciador = 0;

  for (const order of orders) {
    const lastUpdate = await prisma.sycroOrderHistory.findFirst({
      where: { order_id: order.id, action_type: 'UPDATE' },
      orderBy: { created_at: 'desc' },
      select: { new_date: true },
    });

    const targetStr = parseTargetDateYmd({
      ...order,
      lastUpdateNewDate: lastUpdate?.new_date ?? null,
    });
    if (!targetStr) continue;

    const rowsDoPd = rowsAll.filter((row) => gerenciadorRowMatchesOrderNumber(row, order.order_number));
    if (rowsDoPd.length === 0) {
      cardsSemLinhaGerenciador += 1;
      continue;
    }

    const resolved = resolveRelevantRowsForCard(
      rowsDoPd,
      parseJsonArray(order.item_ids_json),
      order.item_codes_json
    );
    let idsPedido = sortedUnique(resolved.map((r) => rowItemIdKey(r)).filter(Boolean));
    if (idsPedido.length === 0) {
      idsPedido = sortedUnique(rowsDoPd.map((r) => rowItemIdKey(r)).filter(Boolean));
    }
    if (idsPedido.length === 0) {
      console.warn(`  [ignorar] PD ${order.order_number} (#${order.id}): sem id_pedido`);
      continue;
    }

    cardsComItens += 1;
    const previsaoNova = new Date(`${targetStr}T12:00:00.000Z`);
    const ajustes: AjusteLoteItem[] = idsPedido.map((id_pedido) => ({
      id_pedido,
      previsao_nova: previsaoNova,
      motivo: 'Correção: sincronizar com data do card Comunicação PD',
      observacao: `Script alinhar-previsao-sycroorder-gerenciador.ts — card #${order.id} (${order.status})`,
    }));

    if (dry) {
      console.log(
        `  [dry] ${order.order_number} (#${order.id}): ${idsPedido.length} itens → ${targetStr}`
      );
      continue;
    }

    const res = await registrarAjustesPrevisaoLote(ajustes, 'sistema');
    const n = res.applied?.length ?? 0;
    if (n > 0) {
      ajustesGravados += n;
      console.log(`  OK ${order.order_number} (#${order.id}): ${n} ajuste(s) → ${targetStr}`);
    }
  }

  console.log('\nResumo:');
  console.log(`  Cards com linhas no Gerenciador processados: ${cardsComItens}`);
  console.log(`  Registros novos em pedido_previsao_ajuste: ${ajustesGravados}`);
  console.log(`  Cards cujo PD não aparece no Gerenciador agora: ${cardsSemLinhaGerenciador}`);
  if (dry) console.log('  (dry-run: nada foi gravado)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
