/**
 * Integração Nomus: consulta de tickets (id, titulo, cliente, vendedor, municipio, UF).
 * Somente leitura.
 */

import { getNomusPool } from '../config/nomusDb.js';

const SQL_LISTA =
  `SELECT t.id, t.titulo
   FROM ticket t
   ORDER BY t.datacriacao DESC
   LIMIT 2000`;

const SQL_TICKET_POR_ID = `
SELECT
  t.id,
  t.titulo,
  p.nome AS cliente,
  UPPER(vr.valor) AS vendedorrep,
  m.nome AS municipio,
  m.UF,
  t.datacriacao,
  UPPER(tc2.valor) AS tipopessoa
FROM ticket t
LEFT JOIN pessoa p ON p.id = t.idParceiro
LEFT JOIN ticket_campopersonalizado tc1 ON tc1.idTicket = t.id
LEFT JOIN municipio m ON m.id = p.idMunicipio
LEFT JOIN (
  SELECT ticket_campopersonalizado.idTicket, ticket_campopersonalizado.valor
  FROM ticket_campopersonalizado
  WHERE ticket_campopersonalizado.idCampoPersonalizado = 5
) vr ON vr.idTicket = t.id
LEFT JOIN (
  SELECT ticket_campopersonalizado.idTicket, ticket_campopersonalizado.valor
  FROM ticket_campopersonalizado
  WHERE ticket_campopersonalizado.idCampoPersonalizado = 6
) tc2 ON tc2.idTicket = t.id
WHERE t.id = ?
`;

export interface TicketItem {
  id: number;
  titulo: string | null;
}

export interface TicketDetalhe {
  id: number;
  titulo: string | null;
  cliente: string | null;
  vendedorrep: string | null;
  municipio: string | null;
  UF: string | null;
  datacriacao: string | null;
  tipopessoa: string | null;
}

export async function listarTickets(): Promise<{ data: TicketItem[]; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { data: [], erro: 'NOMUS_DB_URL não configurado' };
  try {
    const [rows] = await pool.query<Record<string, unknown>[]>(SQL_LISTA);
    const list = Array.isArray(rows) ? rows : [];
    const data: TicketItem[] = list.map((r) => ({
      id: Number(r.id ?? 0),
      titulo: r.titulo != null ? String(r.titulo) : null,
    })).filter((t) => t.id > 0);
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ticketRepository] listarTickets:', msg);
    return { data: [], erro: msg };
  }
}

export async function obterTicketPorId(id: number): Promise<{ data: TicketDetalhe | null; erro?: string }> {
  const pool = getNomusPool();
  if (!pool) return { data: null, erro: 'NOMUS_DB_URL não configurado' };
  if (!Number.isFinite(id) || id < 1) return { data: null };
  try {
    const [rows] = await pool.query<Record<string, unknown>[]>(SQL_TICKET_POR_ID, [id]);
    const list = Array.isArray(rows) ? rows : [];
    const r = list[0];
    if (!r) return { data: null };
    const data: TicketDetalhe = {
      id: Number(r.id ?? 0),
      titulo: r.titulo != null ? String(r.titulo) : null,
      cliente: r.cliente != null ? String(r.cliente) : null,
      vendedorrep: r.vendedorrep != null ? String(r.vendedorrep) : null,
      municipio: r.municipio != null ? String(r.municipio) : null,
      UF: r.UF != null ? String(r.UF) : null,
      datacriacao: r.datacriacao != null ? String(r.datacriacao) : null,
      tipopessoa: r.tipopessoa != null ? String(r.tipopessoa) : null,
    };
    return { data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ticketRepository] obterTicketPorId:', msg);
    return { data: null, erro: msg };
  }
}
