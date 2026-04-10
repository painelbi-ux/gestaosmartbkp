#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Faz o Windows resolver gsmartsoaco.com.br / www para o IP LAN do servidor (ex.: 10.80.1.187).
  Assim você acessa pelo MESMO nome de fora, na rede interna, sem depender de NAT hairpin no roteador.

.USO
  1) PowerShell como Administrador na máquina que vai acessar o site (ou no servidor, se for só ele).
  2) Ajuste -LanIp se o PC do Gestor tiver outro IP fixo na LAN.

  Depois abra no browser (inclua a porta do Vite que você usa):
    http://www.gsmartsoaco.com.br:5180   — instância "interna" do npm run dev
    http://www.gsmartsoaco.com.br:5173   — instância "externa" do mesmo dev

  Para remover as linhas: .\adicionar-hosts-interno-gsmartsoaco.ps1 -Remove
#>
param(
  [string] $LanIp = '10.80.1.187',
  [switch] $Remove
)

$hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
$markerBegin = '# --- gestor-pedidos: interno LAN ---'
$markerEnd   = '# --- fim gestor-pedidos interno ---'

$block = @"
$markerBegin
$LanIp`tgsmartsoaco.com.br
$LanIp`twww.gsmartsoaco.com.br
$markerEnd
"@

if (-not (Test-Path -LiteralPath $hostsPath)) {
  Write-Error "Arquivo hosts não encontrado: $hostsPath"
  exit 1
}

$raw = Get-Content -LiteralPath $hostsPath -Raw -ErrorAction Stop
$enc = New-Object System.Text.UTF8Encoding($false)

if ($Remove) {
  if ($raw -notmatch [regex]::Escape($markerBegin)) {
    Write-Host "Nenhum bloco gestor-pedidos encontrado em hosts."
    exit 0
  }
  $pattern = "(?s)$([regex]::Escape($markerBegin)).*?$([regex]::Escape($markerEnd))\r?\n?"
  $new = [regex]::Replace($raw, $pattern, '').TrimEnd() + "`r`n"
  [System.IO.File]::WriteAllText($hostsPath, $new, $enc)
  Write-Host "Bloco removido de $hostsPath"
  exit 0
}

if ($raw -match [regex]::Escape($markerBegin)) {
  Write-Host "Bloco gestor-pedidos já existe; atualizando IP para $LanIp ..."
  $pattern = "(?s)$([regex]::Escape($markerBegin)).*?$([regex]::Escape($markerEnd))"
  $newContent = [regex]::Replace($raw, $pattern, $block.TrimEnd())
  if (-not $newContent.EndsWith("`n")) { $newContent += "`r`n" }
} else {
  $sep = if ($raw -match '\r?\n$') { '' } else { "`r`n" }
  $newContent = $raw.TrimEnd() + $sep + "`r`n" + $block + "`r`n"
}

[System.IO.File]::WriteAllText($hostsPath, $newContent, $enc)
Write-Host @"
OK: $hostsPath atualizado.
  Acesse na LAN (com a porta do Vite), por exemplo:
    http://www.gsmartsoaco.com.br:5180
    http://www.gsmartsoaco.com.br:5173
  (sem porta, o browser usa 80 — aí precisa de nginx/IIS na 80 ou NAT específico.)
"@
