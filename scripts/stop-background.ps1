# Script para detener la aplicación Airplay que se ejecuta en segundo plano

# Cambiar al directorio del proyecto
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Deteniendo Airplay" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$LogsDir = Join-Path $ProjectRoot "logs"
$PidsFile = Join-Path $LogsDir "app-pids.txt"

$BackendPid = $null
$FrontendPid = $null
$StoppedCount = 0

# Leer PIDs guardados
if (Test-Path $PidsFile) {
    Write-Host "[INFO] Leyendo PIDs guardados..." -ForegroundColor Cyan
    $Content = Get-Content $PidsFile
    foreach ($Line in $Content) {
        if ($Line -match "BACKEND_PID=(\d+)") {
            $BackendPid = [int]$Matches[1]
        }
        elseif ($Line -match "FRONTEND_PID=(\d+)") {
            $FrontendPid = [int]$Matches[1]
        }
    }
} else {
    Write-Host "[WARN] No se encontro el archivo de PIDs" -ForegroundColor Yellow
    Write-Host "Intentando detener por puertos..." -ForegroundColor Yellow
}

# Función para detener un proceso por PID
function Stop-ProcessByPid {
    param(
        [int]$Pid,
        [string]$Name
    )

    if ($Pid) {
        try {
            $Process = Get-Process -Id $Pid -ErrorAction SilentlyContinue
            if ($Process) {
                Stop-Process -Id $Pid -Force
                Write-Host "[OK] $Name detenido (PID: $Pid)" -ForegroundColor Green
                return $true
            } else {
                Write-Host "[INFO] $Name no esta en ejecucion (PID: $Pid)" -ForegroundColor Gray
            }
        } catch {
            Write-Host "[ERROR] No se pudo detener $Name (PID: $Pid): $_" -ForegroundColor Red
        }
    }
    return $false
}

# Función para detener procesos por puerto
function Stop-ProcessByPort {
    param(
        [int]$Port,
        [string]$Name
    )

    try {
        $Connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
        if ($Connections) {
            foreach ($Conn in $Connections) {
                $ProcessId = $Conn.OwningProcess
                $Process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
                if ($Process) {
                    Stop-Process -Id $ProcessId -Force
                    Write-Host "[OK] $Name detenido (Puerto: $Port, PID: $ProcessId)" -ForegroundColor Green
                    return $true
                }
            }
        } else {
            Write-Host "[INFO] No hay procesos en el puerto $Port" -ForegroundColor Gray
        }
    } catch {
        Write-Host "[ERROR] No se pudo detener proceso en puerto $Port : $_" -ForegroundColor Red
    }
    return $false
}

# Detener Backend por PID
if (Stop-ProcessByPid -Pid $BackendPid -Name "Backend") {
    $StoppedCount++
} else {
    # Intentar detener por puerto 5001 (API) y 2121 (FTP)
    Write-Host "[INFO] Intentando detener Backend por puerto..." -ForegroundColor Cyan
    if (Stop-ProcessByPort -Port 5001 -Name "Backend (API)") {
        $StoppedCount++
    }
    # El FTP corre en el mismo proceso, pero lo verificamos por si acaso
    Stop-ProcessByPort -Port 2121 -Name "Backend (FTP)" | Out-Null
}

# Detener Frontend por PID
if (Stop-ProcessByPid -Pid $FrontendPid -Name "Frontend") {
    $StoppedCount++
} else {
    # Intentar detener por puerto 3001
    Write-Host "[INFO] Intentando detener Frontend por puerto..." -ForegroundColor Cyan
    if (Stop-ProcessByPort -Port 3001 -Name "Frontend") {
        $StoppedCount++
    }
}

# Método adicional: Buscar procesos de Node.js que podrían ser de la aplicación
# Solo si no se detuvo nada con los métodos anteriores
if ($StoppedCount -eq 0) {
    Write-Host "`n[WARN] No se encontraron procesos mediante PIDs o puertos" -ForegroundColor Yellow
    Write-Host "[INFO] Buscando procesos Node.js relacionados con Airplay..." -ForegroundColor Cyan

    $NodeProcesses = Get-Process node -ErrorAction SilentlyContinue
    if ($NodeProcesses) {
        Write-Host "Se encontraron $($NodeProcesses.Count) proceso(s) de Node.js:" -ForegroundColor Yellow
        $NodeProcesses | ForEach-Object {
            Write-Host "  - PID: $($_.Id) | Memoria: $([math]::Round($_.WorkingSet64 / 1MB, 2)) MB" -ForegroundColor Gray
        }

        $KillAll = Read-Host "`n¿Deseas detener TODOS los procesos de Node.js? (s/N)"
        if ($KillAll -eq "s" -or $KillAll -eq "S") {
            $NodeProcesses | ForEach-Object {
                Stop-Process -Id $_.Id -Force
                Write-Host "[OK] Proceso Node.js detenido (PID: $($_.Id))" -ForegroundColor Green
            }
            $StoppedCount = $NodeProcesses.Count
        }
    } else {
        Write-Host "[INFO] No se encontraron procesos de Node.js" -ForegroundColor Gray
    }
}

# Limpiar archivo de PIDs
if (Test-Path $PidsFile) {
    Remove-Item $PidsFile -Force
    Write-Host "[OK] Archivo de PIDs eliminado" -ForegroundColor Green
}

# Resumen
Write-Host "`n========================================" -ForegroundColor Green
if ($StoppedCount -gt 0) {
    Write-Host "  Airplay detenido correctamente" -ForegroundColor Green
    Write-Host "  $StoppedCount proceso(s) detenido(s)" -ForegroundColor Green
} else {
    Write-Host "  No se encontraron procesos activos" -ForegroundColor Yellow
}
Write-Host "========================================`n" -ForegroundColor Green

# Verificar que los puertos estén liberados
Start-Sleep -Seconds 1
$ports = @(3001, 5001, 2121)
$stillInUse = @()
foreach ($port in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) {
        $stillInUse += $port
    }
}

if ($stillInUse.Count -gt 0) {
    Write-Host "[WARN] Los siguientes puertos aun estan en uso:" -ForegroundColor Yellow
    $stillInUse | ForEach-Object { Write-Host "  - Puerto $_" -ForegroundColor Yellow }
    Write-Host "Puede que necesites reiniciar manualmente algunos procesos`n" -ForegroundColor Yellow
}
