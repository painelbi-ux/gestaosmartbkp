/**
 * Libera as portas 4000, 5180 e 5173 antes de subir os servidores.
 * Assim "npm run dev" não falha com EADDRINUSE nem usa 5175/5181.
 */
const { execSync } = require('child_process');
const ports = [4000, 5180, 5173];

if (process.platform === 'win32') {
  const list = ports.join(',');
  try {
    execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${list} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Start-Sleep -Seconds 2"`,
      { stdio: 'inherit' }
    );
    console.log('Portas 4000, 5180, 5173 liberadas.');
  } catch (e) {
    // Ignora erro (ex.: nenhum processo nas portas)
  }
} else {
  // Linux/macOS: tenta liberar com lsof + kill
  for (const port of ports) {
    try {
      const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
      if (pids) {
        execSync(`kill -9 ${pids}`, { stdio: 'inherit' });
        console.log(`Porta ${port} liberada.`);
      }
    } catch (_) {}
  }
}
