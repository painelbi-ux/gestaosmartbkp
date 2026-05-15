/**
 * Conexão MySQL somente leitura com o Nomus (weberp_soaco).
 * Nenhuma alteração é feita no banco Nomus; apenas SELECT.
 * Usa parsing explícito da URL para tratar senha com # e @ corretamente.
 */

import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

function parseNomusUrl(url: string): mysql.PoolOptions {
  try {
    const u = new URL(url);
    const port = u.port ? Number(u.port) : 3306;
    const database = (u.pathname || '/').replace(/^\//, '') || 'weberp_soaco';
    return {
      host: u.hostname,
      port: Number.isNaN(port) ? 3306 : port,
      user: decodeURIComponent(u.username || ''),
      password: decodeURIComponent(u.password || ''),
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 15000,
    };
  } catch {
    return { uri: url, waitForConnections: true, connectionLimit: 5, queueLimit: 0 };
  }
}

export function getNomusPool(): mysql.Pool | null {
  const url = process.env.NOMUS_DB_URL;
  if (!url || url.trim() === '') return null;
  if (!pool) {
    const opts = parseNomusUrl(url.trim());
    pool = mysql.createPool(opts);
  }
  return pool;
}

export function isNomusEnabled(): boolean {
  return !!process.env.NOMUS_DB_URL?.trim();
}
