#Requires -RunAsAdministrator
# Entrada TCP: API 4000, interno 5180, externos 5173 + 5174 + 5051 (todos os perfis).
$ErrorActionPreference = 'Stop'
$names = @(
  'Gestor Pedidos 5173 (WAN+LAN)', 'Gestor Pedidos 5174 (WAN+LAN)', 'Gestor Pedidos 5051 (WAN+LAN)',
  'Gestor Pedidos 5180 (WAN+LAN)', 'Gestor Pedidos Backend 4000',
  'Gestor Pedidos 5173', 'Gestor Pedidos 5174', 'Gestor Pedidos 5051'
)
foreach ($name in $names) {
  Remove-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
}
foreach ($port in @(5173, 5174, 5051, 5180, 4000)) {
  New-NetFirewallRule -DisplayName "Gestor Pedidos TCP $port (WAN+LAN)" -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Domain,Private,Public -RemoteAddress Any | Out-Null
}
Write-Host 'OK: TCP 5173, 5174, 5051 (externos), 5180, 4000 — Domain+Private+Public.'
Write-Host 'MikroTik: dst-nat WAN -> 10.80.1.187 nas portas que usar (5173, 5174 e/ou 5051).'
