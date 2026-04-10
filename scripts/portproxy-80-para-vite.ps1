#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Redireciona a porta TCP 80 deste Windows para o Vite (ex.: 127.0.0.1:5180).
  Assim quem acessa http://10.80.1.187/ ou http://www.gsmartsoaco.com.br/ (com hosts interno)
  na LAN cai no mesmo Vite, sem precisar digitar :5180.

  A Internet (MikroTik WAN:80 -> PC) normalmente já encaminha direto para a porta do Vite;
  este script resolve o caso em que o tráfego vai direto ao IP LAN na porta 80.

.NOTAS
  - Desative ou libere a porta 80 se o IIS / "Serviço de publicação World Wide Web" estiver em uso.
  - Serviço necessário: "Auxiliar IP" (iphlpsvc).

.USO
  .\portproxy-80-para-vite.ps1              # default: redireciona 80 -> 5180
  .\portproxy-80-para-vite.ps1 -VitePort 5173
  .\portproxy-80-para-vite.ps1 -Remove
#>
param(
  [int] $VitePort = 5180,
  [switch] $Remove
)

$ErrorActionPreference = 'Stop'
$fwName = 'Gestor Pedidos TCP 80 (portproxy para Vite)'

function Remove-PortProxy80 {
  netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=80 2>$null
  Remove-NetFirewallRule -DisplayName $fwName -ErrorAction SilentlyContinue
}

if ($Remove) {
  Remove-PortProxy80
  Write-Host 'OK: redirecionamento 80 removido e regra de firewall removida.'
  netsh interface portproxy show all
  exit 0
}

if ($VitePort -lt 1 -or $VitePort -gt 65535) {
  Write-Error 'VitePort inválido.'
  exit 1
}

Remove-PortProxy80

$ip = Get-Service -Name iphlpsvc -ErrorAction SilentlyContinue
if ($ip -and $ip.Status -ne 'Running') {
  Start-Service iphlpsvc
  Write-Host 'Serviço Auxiliar IP iniciado.'
}

netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=80 connectaddress=127.0.0.1 connectport=$VitePort
New-NetFirewallRule -DisplayName $fwName -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Domain,Private,Public -RemoteAddress Any | Out-Null

Write-Host @"
OK: TCP 80 -> 127.0.0.1:$VitePort
Regra de firewall: $fwName

Teste na própria máquina: http://127.0.0.1/
Na LAN: http://10.80.1.187/ (ajuste o IP se for outro)

netsh interface portproxy show all
"@
netsh interface portproxy show all
