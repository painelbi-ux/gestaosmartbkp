# Libera as portas 5180 (interno) e 5173 (externo) no Firewall do Windows
# Execute como Administrador: PowerShell -ExecutionPolicy Bypass -File scripts\liberar-porta-externo.ps1

foreach ($porta in @(5180, 5173)) {
    $regra = "GestorPedidos-Frontend-$porta"
    $existe = Get-NetFirewallRule -DisplayName $regra -ErrorAction SilentlyContinue
    if ($existe) {
        Write-Host "Regra '$regra' já existe."
    } else {
        New-NetFirewallRule -DisplayName $regra -Direction Inbound -Protocol TCP -LocalPort $porta -Action Allow
        Write-Host "Porta $porta liberada."
    }
}
Write-Host "Interno: http://SEU_IP:5180  |  Externo: http://SEU_IP:5173"
Write-Host "Para ver o IP: ipconfig"
