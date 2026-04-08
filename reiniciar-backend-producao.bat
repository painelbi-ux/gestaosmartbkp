@echo off
chcp 65001 >nul
:: Executar como Administrador para conseguir encerrar o processo na porta 5173
net session >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo Solicitando permissoes de Administrador...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b 0
)

echo ========================================
echo   Reiniciar Backend (producao) - libera 5173 + sobe API :4000
echo ========================================
echo.

set PORT=5173
set SCRIPT_DIR=%~dp0

:: Encerra TODOS os processos que usam a porta 5173 (com direito de admin)
echo [1/2] Encerrando processos na porta %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "5173" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a 2>nul
    echo   Encerrado PID %%a
)
timeout /t 3 /nobreak >nul

:: Tenta de novo por si ainda restou algum
for /f "tokens=5" %%a in ('netstat -ano ^| findstr "5173" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a 2>nul
    echo   Encerrado PID %%a (segunda passada)
)
timeout /t 2 /nobreak >nul
echo.

:: Verifica se a porta está livre; se não, tenta PowerShell (força maior)
netstat -ano | findstr "5173" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo Tentando encerrar via PowerShell...
    powershell -Command "Get-NetTCPConnection -LocalPort %PORT% -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"
    timeout /t 3 /nobreak >nul
)
netstat -ano | findstr "5173" | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo.
    echo *** ERRO: Ainda ha processo na porta %PORT%.
    echo 1. Feche QUALQUER janela CMD/PowerShell que esteja rodando o backend.
    echo 2. Ou reinicie a VPS e depois execute este script como Administrador.
    echo.
    pause
    exit /b 1
)

echo [2/2] Iniciando backend em: %SCRIPT_DIR%backend
cd /d "%SCRIPT_DIR%backend"
if not exist dist\server.js (
    echo ERRO: dist\server.js nao encontrado. Execute "npm run build" na pasta backend.
    pause
    exit /b 1
)

set NODE_ENV=production
echo.
echo ========================================
echo   Servidor subindo.
echo   DEVE aparecer: "Build: pedidos-no-csrf-v1"
echo   Se aparecer "EADDRINUSE", a porta ainda esta em uso.
echo   API (se APP_PORT=4000): http://170.84.146.147:4000/health
echo   Ou desenvolvimento com Vite: http://170.84.146.147:5173
echo   Pressione Ctrl+C para parar
echo ========================================
echo.

node dist/server.js

pause
