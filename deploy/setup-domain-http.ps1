# Requer PowerShell como Administrador.
# Encaminha a porta 80 (HTTP) para o backend Node na 4000, para http://gsmartsoaco.com.br funcionar sem :4000 na URL.
#
# No roteador (MikroTik): NAT dst-address=IP_PUBLICO protocol=tcp dst-port=80 -> to-addresses=10.80.1.187 to-ports=80
# (Se o NAT só encaminhar 80->4000 no IP interno, não use este script — nesse caso o roteador já manda tráfego direto para a 4000.)
#
# Serviço necessário: "Auxiliar de IP" (iphlpsvc) em execução.

$ErrorActionPreference = 'Stop'
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error 'Execute este script como Administrador.'
}

$listenPort = 80
$backendPort = 4000

# Remove regra antiga na mesma escuta (idempotente)
netsh interface portproxy delete v4tov4 listenport=$listenPort listenaddress=0.0.0.0 2>$null
netsh interface portproxy add v4tov4 listenport=$listenPort listenaddress=0.0.0.0 connectport=$backendPort connectaddress=127.0.0.1

$ruleName = 'Gestor Pedidos HTTP 80 (dominio)'
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $listenPort -Action Allow
}

Set-Service -Name iphlpsvc -StartupType Automatic
Start-Service -Name iphlpsvc -ErrorAction SilentlyContinue

Write-Host 'Portproxy configurado:'
netsh interface portproxy show all
Write-Host "`nTeste: http://127.0.0.1/health e http://10.80.1.187/health"
