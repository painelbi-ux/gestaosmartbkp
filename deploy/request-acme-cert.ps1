#Requires -RunAsAdministrator
<#
  Emite certificado Let's Encrypt (HTTP-01) para gsmartsoaco.com.br + www.
  PRÉ-REQUISITO OBRIGATÓRIO (HTTP-01): a porta TCP 80 do IP público deve chegar a ESTE PC na 80.
  Só ter 5173/5180 abertas no MikroTik NÃO basta para Let's Encrypt por HTTP — ou abra a 80 ou use validação DNS-01.
  Se o Let's Encrypt falhar com "Connection refused" no :80, o problema é NAT no MikroTik ou firewall da operadora,
  não o Windows — veja comentários no final deste script.

  Antes de rodar:
  1) Backend no ar (npm run dev na raiz ou start:production) — a app serve /.well-known a partir de backend/var
  2) Portproxy 80->4000 OU Node escutando direto na 80
  3) Regra de firewall inbound TCP 80

  Depois de sucesso: copie/ajuste deploy/ssl/*.pem para fullchain.pem e privkey.pem (ou defina SSL_CERT_FILE / SSL_KEY_FILE no backend/.env)
  e reinicie o backend. Ative no .env: COOKIE_SECURE=true e FORCE_HTTPS_REDIRECT=true
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $root 'backend\src\server.ts'))) { $root = 'C:\gestorpedidosSoAco' }

$wacsExe = Join-Path $PSScriptRoot 'wacs\wacs.exe'
if (-not (Test-Path $wacsExe)) {
  Write-Host 'Baixando win-acme...'
  $zip = Join-Path $PSScriptRoot 'wacs.zip'
  Invoke-WebRequest -Uri 'https://github.com/win-acme/win-acme/releases/download/v2.2.9.1701/win-acme.v2.2.9.1701.x64.pluggable.zip' -OutFile $zip -UseBasicParsing
  $wDir = Join-Path $PSScriptRoot 'wacs'
  Expand-Archive -Path $zip -DestinationPath $wDir -Force
  $wacsExe = Join-Path $wDir 'wacs.exe'
}

$webroot = Join-Path $root 'backend\var'
$sslOut = Join-Path $PSScriptRoot 'ssl'
New-Item -ItemType Directory -Force -Path (Join-Path $webroot '.well-known\acme-challenge'), $sslOut | Out-Null

$email = if ($env:ACME_EMAIL) { $env:ACME_EMAIL } else { 'admin@gsmartsoaco.com.br' }
Write-Host "Conta ACME (e-mail): $email — defina ACME_EMAIL se quiser outro."

Write-Host @'

=== DIAGNÓSTICO ===
Se Let's Encrypt mostrar "Connection refused" em 170.84.146.147:80:
  • No MikroTik, crie dst-nat da interface WAN: TCP destino porta 80 -> 10.80.1.187 porta 80
  • O mesmo para 443 quando for usar HTTPS
  • Algumas operadoras bloqueiam entrada na 80 — nesse caso use validação DNS-01 (Cloudflare API, etc.) ou outra porta + DNS

Exemplo MikroTik (ajuste WAN e IP interno):
  /ip firewall nat add chain=dstnat protocol=tcp dst-port=80 in-interface=<WAN> action=dst-nat to-addresses=10.80.1.187 to-ports=80
  /ip firewall nat add chain=dstnat protocol=tcp dst-port=443 in-interface=<WAN> action=dst-nat to-addresses=10.80.1.187 to-ports=443

'@

& $wacsExe `
  --accepttos `
  --verbose `
  --closeonfinish `
  --emailaddress $email `
  --source manual `
  --commonname gsmartsoaco.com.br `
  --host www.gsmartsoaco.com.br `
  --validation filesystem `
  --webroot $webroot `
  --store pemfiles `
  --pemfilespath $sslOut `
  --pemfilesname gsmartsoaco

Write-Host @'

Se o certificado foi criado, o win-acme grava em deploy/ssl/ (prefixo gsmartsoaco):
  gsmartsoaco-chain.pem  (certificado + cadeia — use como SSL)
  gsmartsoaco-key.pem    (chave privada)
O Node detecta esses nomes automaticamente. Alternativa: fullchain.pem + privkey.pem na mesma pasta.

Ative também:
  COOKIE_SECURE=true
  FORCE_HTTPS_REDIRECT=true

Reabra firewall TCP 443 se ainda não existir:
  New-NetFirewallRule -DisplayName "Gestor Pedidos HTTPS 443" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow

'@
