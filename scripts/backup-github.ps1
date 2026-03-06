# Backup automático do projeto para o GitHub (painelbi-ux/gestaosmartbkp).
# Agendado para rodar à meia-noite. Só faz commit se houver alterações.

$ErrorActionPreference = "Stop"
$GitExe = "C:\Program Files\Git\bin\git.exe"
$PastaProjeto = Split-Path $PSScriptRoot -Parent
Set-Location $PastaProjeto

& $GitExe add .
$status = & $GitExe status --porcelain 2>&1
if (-not $status) {
    # Nada para commitar
    exit 0
}

$msg = "Backup automatico " + (Get-Date -Format "yyyy-MM-dd HH:mm")
& $GitExe commit -m $msg 2>&1 | Out-Null
$null = & $GitExe push 2>&1
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "Backup enviado ao GitHub com sucesso."
