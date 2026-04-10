@echo off
chcp 65001 >nul
echo ========================================
echo   Liberar portas 3000, 5180, 5173, 5174, 5051 no Firewall (Windows)
echo   Execute como ADMINISTRADOR (clique direito ^> Executar como administrador)
echo ========================================
echo.

netsh advfirewall firewall delete rule name="Gestor Pedidos 3000" >nul 2>&1
netsh advfirewall firewall add rule name="Gestor Pedidos 3000" dir=in action=allow protocol=TCP localport=3000 profile=any
if %ERRORLEVEL% neq 0 (echo ERRO ao criar regra 3000. Execute como Administrador. & pause & exit /b 1)
echo OK: Porta 3000 liberada.

netsh advfirewall firewall delete rule name="Gestor Pedidos 5180" >nul 2>&1
netsh advfirewall firewall add rule name="Gestor Pedidos 5180" dir=in action=allow protocol=TCP localport=5180 profile=any
if %ERRORLEVEL% neq 0 (echo ERRO ao criar regra 5180. & pause & exit /b 1)
echo OK: Porta 5180 liberada.

netsh advfirewall firewall delete rule name="Gestor Pedidos 5173" >nul 2>&1
netsh advfirewall firewall add rule name="Gestor Pedidos 5173" dir=in action=allow protocol=TCP localport=5173 profile=any
echo OK: Porta 5173 liberada.

netsh advfirewall firewall delete rule name="Gestor Pedidos 5174" >nul 2>&1
netsh advfirewall firewall add rule name="Gestor Pedidos 5174" dir=in action=allow protocol=TCP localport=5174 profile=any
echo OK: Porta 5174 liberada.

netsh advfirewall firewall delete rule name="Gestor Pedidos 5051" >nul 2>&1
netsh advfirewall firewall add rule name="Gestor Pedidos 5051" dir=in action=allow protocol=TCP localport=5051 profile=any
echo OK: Porta 5051 liberada.

echo.
echo Preferível: scripts\garantir-firewall-externo.ps1 (inclui 4000).
echo Externo (MikroTik): encaminhe 5173, 5174 e/ou 5051 para o IP do PC.
echo.
pause
