/**
 * Migração única: lê orders, order_history e notifications do crm.db (SQLite)
 * e insere no banco do gestorpedidosSoAco (Prisma). Não migra users.
 *
 * Uso: npx tsx scripts/migrate-sycroorder-from-crm.ts [caminho/para/crm.db]
 * Se não passar caminho, usa ./crm.db na raiz do backend.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/config/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultCrmPath = path.resolve(__dirname, '../../crm.db');

async function main() {
  const crmPath = process.argv[2] ?? defaultCrmPath;
  let db: { prepare: (sql: string) => { all: (args?: unknown[]) => unknown[]; run: (...args: unknown[]) => { lastInsertRowid: number } }; close: () => void };

  try {
    const betterSqlite3 = await import('better-sqlite3');
    db = betterSqlite3.default(crmPath) as typeof db;
  } catch (e) {
    console.error('Instale better-sqlite3 para rodar a migração: npm i -D better-sqlite3');
    console.error('Ou passe o caminho do crm.db: npx tsx scripts/migrate-sycroorder-from-crm.ts C:\\caminho\\crm.db');
    process.exit(1);
  }

  type OldUser = { id: number; name: string };
  type OldOrder = { id: number; order_number: string; delivery_method: string; current_promised_date: string; status: string; is_urgent: number; created_by: number | null; created_at: string };
  type OldHistory = { id: number; order_id: number; user_id: number | null; action_type: string; previous_date: string | null; new_date: string | null; observation: string | null; created_at: string };
  type OldNotif = { id: number; user_id: number; message: string; order_id: number | null; is_read: number; created_at: string };

  const users = (db.prepare('SELECT id, name FROM users').all() || []) as OldUser[];
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const orders = (db.prepare('SELECT * FROM orders ORDER BY id').all() || []) as OldOrder[];
  const historyRows = (db.prepare('SELECT * FROM order_history ORDER BY id').all() || []) as OldHistory[];
  const notifs = (db.prepare('SELECT * FROM notifications ORDER BY id').all() || []) as OldNotif[];

  const oldToNewOrderId = new Map<number, number>();

  for (const o of orders) {
    const creatorName = o.created_by != null ? userMap.get(o.created_by) ?? null : null;
    const created = await prisma.sycroOrderOrder.create({
      data: {
        order_number: o.order_number,
        delivery_method: o.delivery_method,
        current_promised_date: o.current_promised_date,
        status: o.status === 'PENDING' || o.status === 'FINISHED' || o.status === 'ESCALATED' ? o.status : 'PENDING',
        is_urgent: o.is_urgent ?? 0,
        created_by: null,
        creator_name: creatorName,
      },
    });
    oldToNewOrderId.set(o.id, created.id);
  }

  for (const h of historyRows) {
    const newOrderId = oldToNewOrderId.get(h.order_id);
    if (newOrderId == null) continue;
    const userName = h.user_id != null ? userMap.get(h.user_id) ?? null : null;
    await prisma.sycroOrderHistory.create({
      data: {
        order_id: newOrderId,
        user_id: null,
        user_name: userName,
        action_type: h.action_type || 'UPDATE',
        previous_date: h.previous_date,
        new_date: h.new_date,
        observation: h.observation,
      },
    });
  }

  // Notifications: user_id do crm não existe no gestor; ignoramos ou associamos ao primeiro usuário do sistema
  const primeiroUsuario = await prisma.usuario.findFirst({ select: { id: true } });
  for (const n of notifs) {
    const newOrderId = n.order_id != null ? oldToNewOrderId.get(n.order_id) ?? null : null;
    const userId = primeiroUsuario?.id ?? 1;
    try {
      await prisma.sycroOrderNotification.create({
        data: {
          user_id: userId,
          message: n.message,
          order_id: newOrderId,
          is_read: n.is_read ?? 0,
        },
      });
    } catch {
      // Se user_id não existir, pula
    }
  }

  db.close();
  console.log(`Migração concluída: ${orders.length} pedidos, ${historyRows.length} históricos, ${notifs.length} notificações (notificações associadas ao primeiro usuário).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
