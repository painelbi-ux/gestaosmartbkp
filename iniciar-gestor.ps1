# Inicia o Gestor: backend + Vite interno (5180) + três externos (5173, 5174, 5051).
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Firewall (opcional, requer Admin)..." -ForegroundColor Cyan
$fw = Join-Path $PSScriptRoot "scripts\garantir-firewall-externo.ps1"
if (Test-Path $fw) {
  try {
    Start-Process powershell -Verb RunAs -ArgumentList "-ExecutionPolicy Bypass -File `"$fw`"" -Wait -ErrorAction SilentlyContinue
  } catch { }
}

Write-Host "npm run dev (raiz)..." -ForegroundColor Green
npm run dev
