@echo off
cd /d "%~dp0"
echo Encerrando processos nas portas 4000, 5180, 5173, 5174, 5051...
powershell -NoProfile -Command "$ports=4000,5180,5173,5174,5051; foreach($p in $ports){ Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"
echo Iniciando backend (producao)...
cd backend
set NODE_ENV=production
node dist/server.js
pause
