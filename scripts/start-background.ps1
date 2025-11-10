# Script para iniciar la aplicación Airplay en segundo plano
# Frontend: Vite (puerto 3001)
# Backend: Server Node.js + FTP (puertos 5001 y 2121)

# Cambiar al directorio del proyecto
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Iniciando Airplay en segundo plano" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Verificar que Node.js está instalado
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js no esta instalado" -ForegroundColor Red
    Write-Host "Por favor, instala Node.js desde https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# Verificar que npm está instalado
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] npm no esta instalado" -ForegroundColor Red
    exit 1
}

# Crear directorio de logs si no existe
$LogsDir = Join-Path $ProjectRoot "logs"
if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir | Out-Null
    Write-Host "[OK] Directorio de logs creado" -ForegroundColor Green
}

# Definir archivos de log
$FrontendLog = Join-Path $LogsDir "frontend-out.log"
$FrontendErrLog = Join-Path $LogsDir "frontend-error.log"
$BackendLog = Join-Path $LogsDir "backend-out.log"
$BackendErrLog = Join-Path $LogsDir "backend-error.log"
$PidsFile = Join-Path $LogsDir "app-pids.txt"

# Verificar si ya hay procesos en ejecución
if (Test-Path $PidsFile) {
    Write-Host "[WARN] La aplicacion ya parece estar en ejecucion" -ForegroundColor Yellow
    Write-Host "Si crees que esto es un error, ejecuta stop-background.ps1 primero" -ForegroundColor Yellow
    $Continue = Read-Host "¿Deseas continuar de todos modos? (s/N)"
    if ($Continue -ne "s" -and $Continue -ne "S") {
        Write-Host "Cancelado por el usuario" -ForegroundColor Yellow
        exit 0
    }
}

# Función para verificar si un puerto está en uso
function Test-PortInUse {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connections
}

# Verificar si los puertos ya están en uso
$ports = @(3001, 5001, 2121)
$portsInUse = @()
foreach ($port in $ports) {
    if (Test-PortInUse -Port $port) {
        $portsInUse += $port
    }
}

if ($portsInUse.Count -gt 0) {
    Write-Host "[WARN] Los siguientes puertos ya estan en uso:" -ForegroundColor Yellow
    $portsInUse | ForEach-Object { Write-Host "  - Puerto $_" -ForegroundColor Yellow }
    Write-Host "Intenta detener la aplicacion primero con stop-background.ps1" -ForegroundColor Yellow
    exit 1
}

# Obtener el ejecutable de Node.js
$NodeExe = (Get-Command node).Source

Write-Host "[INFO] Iniciando Backend (Server + FTP)..." -ForegroundColor Cyan

# Iniciar Backend (tsx server/index.ts)
$BackendProcess = Start-Process -FilePath $NodeExe `
    -ArgumentList "node_modules\tsx\dist\cli.mjs", "server/index.ts" `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $BackendLog `
    -RedirectStandardError $BackendErrLog `
    -PassThru

if (-not $BackendProcess) {
    Write-Host "[ERROR] No se pudo iniciar el Backend" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Backend iniciado (PID: $($BackendProcess.Id))" -ForegroundColor Green

# Esperar a que el backend esté listo (puerto 5001)
Write-Host "[INFO] Esperando a que el Backend este listo..." -ForegroundColor Cyan
$MaxRetries = 30
$Retry = 0
while (-not (Test-PortInUse -Port 5001) -and $Retry -lt $MaxRetries) {
    Start-Sleep -Seconds 1
    $Retry++

    # Verificar si el proceso sigue vivo
    if (-not (Get-Process -Id $BackendProcess.Id -ErrorAction SilentlyContinue)) {
        Write-Host "[ERROR] El Backend se detuvo inesperadamente" -ForegroundColor Red
        Write-Host "Revisa el log: $BackendErrLog" -ForegroundColor Yellow
        exit 1
    }
}

if ($Retry -ge $MaxRetries) {
    Write-Host "[ERROR] El Backend no respondio a tiempo" -ForegroundColor Red
    Write-Host "Revisa el log: $BackendErrLog" -ForegroundColor Yellow
    Stop-Process -Id $BackendProcess.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "[OK] Backend listo en puerto 5001" -ForegroundColor Green

# Esperar un momento adicional para el servidor FTP
Start-Sleep -Seconds 2

Write-Host "[INFO] Iniciando Frontend (Vite)..." -ForegroundColor Cyan

# Iniciar Frontend (npm run dev)
$FrontendProcess = Start-Process -FilePath $NodeExe `
    -ArgumentList "node_modules\vite\bin\vite.js", "--host", "0.0.0.0", "--port", "3001" `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $FrontendLog `
    -RedirectStandardError $FrontendErrLog `
    -PassThru

if (-not $FrontendProcess) {
    Write-Host "[ERROR] No se pudo iniciar el Frontend" -ForegroundColor Red
    Write-Host "Deteniendo Backend..." -ForegroundColor Yellow
    Stop-Process -Id $BackendProcess.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "[OK] Frontend iniciado (PID: $($FrontendProcess.Id))" -ForegroundColor Green

# Esperar a que el frontend esté listo (puerto 3001)
Write-Host "[INFO] Esperando a que el Frontend este listo..." -ForegroundColor Cyan
$Retry = 0
while (-not (Test-PortInUse -Port 3001) -and $Retry -lt $MaxRetries) {
    Start-Sleep -Seconds 1
    $Retry++

    # Verificar si el proceso sigue vivo
    if (-not (Get-Process -Id $FrontendProcess.Id -ErrorAction SilentlyContinue)) {
        Write-Host "[ERROR] El Frontend se detuvo inesperadamente" -ForegroundColor Red
        Write-Host "Revisa el log: $FrontendErrLog" -ForegroundColor Yellow
        Write-Host "Deteniendo Backend..." -ForegroundColor Yellow
        Stop-Process -Id $BackendProcess.Id -Force -ErrorAction SilentlyContinue
        exit 1
    }
}

if ($Retry -ge $MaxRetries) {
    Write-Host "[ERROR] El Frontend no respondio a tiempo" -ForegroundColor Red
    Write-Host "Revisa el log: $FrontendErrLog" -ForegroundColor Yellow
    Stop-Process -Id $BackendProcess.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $FrontendProcess.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "[OK] Frontend listo en puerto 3001" -ForegroundColor Green

# Guardar PIDs para poder detener después
$PidsContent = @"
BACKEND_PID=$($BackendProcess.Id)
FRONTEND_PID=$($FrontendProcess.Id)
TIMESTAMP=$(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@

$PidsContent | Out-File -FilePath $PidsFile -Encoding utf8

# Obtener direcciones IP locales
$nets = Get-NetAdapter | Where-Object Status -eq "Up" | Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch "^127\." }
$ipAddresses = $nets | Select-Object -ExpandProperty IPAddress

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "  Airplay iniciado correctamente" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nBackend (API + FTP):" -ForegroundColor Cyan
Write-Host "  Local:   http://localhost:5001" -ForegroundColor White
foreach ($ip in $ipAddresses) {
    Write-Host "  Network: http://${ip}:5001" -ForegroundColor White
}
Write-Host "  FTP:     ftp://localhost:2121" -ForegroundColor White
Write-Host "`nFrontend (Vite):" -ForegroundColor Cyan
Write-Host "  Local:   http://localhost:3001" -ForegroundColor White
foreach ($ip in $ipAddresses) {
    Write-Host "  Network: http://${ip}:3001" -ForegroundColor White
}
Write-Host "`nProcesos:" -ForegroundColor Cyan
Write-Host "  Backend PID:  $($BackendProcess.Id)" -ForegroundColor White
Write-Host "  Frontend PID: $($FrontendProcess.Id)" -ForegroundColor White
Write-Host "`nLogs:" -ForegroundColor Cyan
Write-Host "  Backend:  logs\backend-out.log" -ForegroundColor White
Write-Host "  Frontend: logs\frontend-out.log" -ForegroundColor White
Write-Host "`nPara detener la aplicacion:" -ForegroundColor Cyan
Write-Host "  .\scripts\stop-background.ps1" -ForegroundColor White
Write-Host "`nPara ver logs en tiempo real:" -ForegroundColor Cyan
Write-Host "  .\scripts\view-logs.ps1" -ForegroundColor White
Write-Host "========================================`n" -ForegroundColor Green
