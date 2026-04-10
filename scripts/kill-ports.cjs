/**
 * Libera as portas do stack dev antes de subir os servidores.
 * API 4000, Vite interno 5180, Vite externos 5173 + 5174 + 5051.
 */
const { execSync } = require('child_process');
const ports = [4000, 5180, 5173, 5174, 5051];

if (process.platform === 'win32') {
  const list = ports.join(',');
  try {
    execSync(
      `powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${list} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Start-Sleep -Seconds 2"`,
      { stdio: 'inherit' }
    );
    console.log('Portas 4000, 5180, 5173, 5174, 5051 liberadas.');
  } catch (e) {
    // Ignora erro (ex.: nenhum processo nas portas)
  }
} else {
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
