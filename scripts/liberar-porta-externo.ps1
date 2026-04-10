# Libera no Firewall do Windows: 5180 (interno) e 5173, 5174, 5051 (externos) + 4000 API
# Execute como Administrador
$ErrorActionPreference = 'Stop'
foreach ($porta in @(5180, 5173, 5174, 5051, 4000)) {
  $nome = "Gestor Pedidos TCP $porta"
  Remove-NetFirewallRule -DisplayName $nome -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $nome -Direction Inbound -Protocol TCP -LocalPort $porta -Action Allow -Profile Any
  Write-Host "OK porta $porta"
}
Write-Host ""
Write-Host "Interno: http://SEU_IP:5180"
Write-Host "Externos: http://SEU_IP:5173 | :5174 | :5051"
