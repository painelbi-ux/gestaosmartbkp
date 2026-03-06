# Compartilha a pasta do SQLite (backend/prisma) na rede para acesso externo ao banco.
# Execute como Administrador: botão direito no script -> "Executar com PowerShell" (como admin)
# ou em um PowerShell aberto como Admin: Set-ExecutionPolicy Bypass -Scope Process; & ".\scripts\compartilhar-pasta-sqlite.ps1"

$NomeShare = "SoAcoSQLite"
$PastaProjeto = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PastaPrisma = (Resolve-Path (Join-Path $PastaProjeto "backend\prisma")).Path

if (-not (Test-Path $PastaPrisma)) {
    Write-Host "Pasta nao encontrada: $PastaPrisma" -ForegroundColor Red
    exit 1
}

# Remover share antigo se existir (para reexecutar o script)
$shareExistente = Get-SmbShare -Name $NomeShare -ErrorAction SilentlyContinue
if ($shareExistente) {
    Remove-SmbShare -Name $NomeShare -Force
    Write-Host "Share anterior '$NomeShare' removido." -ForegroundColor Yellow
}

try {
    New-SmbShare -Name $NomeShare -Path $PastaPrisma -FullAccess "Everyone" -Description "Banco SQLite Gestor Pedidos (dev.db)"
    Write-Host ""
    Write-Host "Pasta compartilhada com sucesso." -ForegroundColor Green
    Write-Host "Pasta local: $PastaPrisma" -ForegroundColor Cyan
    $nomePC = $env:COMPUTERNAME
    Write-Host "Acesso na rede: \\$nomePC\$NomeShare" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Em outro PC: abra o Explorador de Arquivos e digite na barra de endereco:" -ForegroundColor White
    Write-Host "  \\$nomePC\$NomeShare" -ForegroundColor Yellow
    Write-Host "Ou use o IP deste PC no lugar de $nomePC (ex.: \\192.168.1.10\$NomeShare)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Arquivo do banco: dev.db (abrir com DBeaver, DB Browser for SQLite, etc.)" -ForegroundColor White
} catch {
    Write-Host "Erro ao compartilhar. Execute o PowerShell como Administrador." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
