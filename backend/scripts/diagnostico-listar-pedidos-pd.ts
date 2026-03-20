/**
 * Diagnostico: verifica se listarPedidos filtra por PD corretamente.
 *
 * Uso: npx tsx scripts/diagnostico-listar-pedidos-pd.ts
 */
import { listarPedidos } from '../src/data/pedidosRepository.js';

async function main() {
  const tests = ['PD 47483', '47483', 'PD47483', ' pd 47483 '];
  for (const t of tests) {
    const res = await listarPedidos({ pd: t, limit: 500 });
    console.log(`pd="${t}" => total=${res.total} returned=${res.data.length} erroConexao=${res.erroConexao ?? 'none'}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // listarPedidos usa cache interna; nada para desconectar aqui
  });

