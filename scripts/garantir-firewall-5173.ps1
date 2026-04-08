#Requires -RunAsAdministrator
# Recria regra de entrada TCP 5173 (e 5180, 4000) em todos os perfis — útil se o acesso externo parar de funcionar.
$ErrorActionPreference = 'Stop'
foreach ($name in @('Gestor Pedidos 5173 (WAN+LAN)', 'Gestor Pedidos 5180 (WAN+LAN)', 'Gestor Pedidos Backend 4000')) {
    Remove-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
}
New-NetFirewallRule -DisplayName 'Gestor Pedidos 5173 (WAN+LAN)' -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Domain,Private,Public -RemoteAddress Any | Out-Null
New-NetFirewallRule -DisplayName 'Gestor Pedidos 5180 (WAN+LAN)' -Direction Inbound -Protocol TCP -LocalPort 5180 -Action Allow -Profile Domain,Private,Public -RemoteAddress Any | Out-Null
New-NetFirewallRule -DisplayName 'Gestor Pedidos Backend 4000' -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Domain,Private,Public -RemoteAddress Any | Out-Null
Write-Host 'OK: regras 5173, 5180 e 4000 (Domain+Private+Public).'
Write-Host 'Confirme: netstat -ano | findstr LISTENING | findstr ":5173"'
Write-Host 'MikroTik: dst-nat WAN tcp 5173 -> 10.80.1.187:5173'
