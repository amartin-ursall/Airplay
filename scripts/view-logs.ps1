# Script para ver logs en tiempo real de la aplicación Airplay

# Cambiar al directorio del proyecto
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

$LogsDir = Join-Path $ProjectRoot "logs"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  Visor de Logs - Airplay" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Verificar que el directorio de logs existe
if (-not (Test-Path $LogsDir)) {
    Write-Host "[ERROR] El directorio de logs no existe" -ForegroundColor Red
    Write-Host "Asegurate de que la aplicacion se haya ejecutado al menos una vez" -ForegroundColor Yellow
    exit 1
}

$BackendLog = Join-Path $LogsDir "backend-out.log"
$BackendErrLog = Join-Path $LogsDir "backend-error.log"
$FrontendLog = Join-Path $LogsDir "frontend-out.log"
$FrontendErrLog = Join-Path $LogsDir "frontend-error.log"

# Verificar que existan los archivos de log
$logs = @(
    @{ Name = "Backend (Output)"; Path = $BackendLog; Number = 1 },
    @{ Name = "Backend (Errors)"; Path = $BackendErrLog; Number = 2 },
    @{ Name = "Frontend (Output)"; Path = $FrontendLog; Number = 3 },
    @{ Name = "Frontend (Errors)"; Path = $FrontendErrLog; Number = 4 }
)

$availableLogs = @()
foreach ($log in $logs) {
    if (Test-Path $log.Path) {
        $availableLogs += $log
    }
}

if ($availableLogs.Count -eq 0) {
    Write-Host "[ERROR] No se encontraron archivos de log" -ForegroundColor Red
    Write-Host "Asegurate de que la aplicacion se haya ejecutado al menos una vez" -ForegroundColor Yellow
    exit 1
}

# Mostrar opciones
Write-Host "Selecciona el log que deseas ver:`n" -ForegroundColor White
foreach ($log in $availableLogs) {
    $size = (Get-Item $log.Path).Length
    $sizeKB = [math]::Round($size / 1KB, 2)
    Write-Host "  $($log.Number). $($log.Name) ($sizeKB KB)" -ForegroundColor Cyan
}
Write-Host "  5. Todos los logs (combinados)" -ForegroundColor Cyan
Write-Host "  6. Ver ultimas 50 lineas de cada log" -ForegroundColor Cyan
Write-Host "  0. Salir`n" -ForegroundColor Gray

$selection = Read-Host "Opcion"

switch ($selection) {
    "1" {
        Write-Host "`n[INFO] Mostrando: Backend (Output)" -ForegroundColor Green
        Write-Host "Presiona Ctrl+C para salir`n" -ForegroundColor Yellow
        Get-Content $BackendLog -Wait -Tail 20
    }
    "2" {
        Write-Host "`n[INFO] Mostrando: Backend (Errors)" -ForegroundColor Green
        Write-Host "Presiona Ctrl+C para salir`n" -ForegroundColor Yellow
        Get-Content $BackendErrLog -Wait -Tail 20
    }
    "3" {
        Write-Host "`n[INFO] Mostrando: Frontend (Output)" -ForegroundColor Green
        Write-Host "Presiona Ctrl+C para salir`n" -ForegroundColor Yellow
        Get-Content $FrontendLog -Wait -Tail 20
    }
    "4" {
        Write-Host "`n[INFO] Mostrando: Frontend (Errors)" -ForegroundColor Green
        Write-Host "Presiona Ctrl+C para salir`n" -ForegroundColor Yellow
        Get-Content $FrontendErrLog -Wait -Tail 20
    }
    "5" {
        Write-Host "`n[INFO] Mostrando: Todos los logs (modo interleaved)" -ForegroundColor Green
        Write-Host "NOTA: Este modo no es en tiempo real" -ForegroundColor Yellow
        Write-Host "Presiona cualquier tecla para continuar...`n" -ForegroundColor Gray
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

        # Combinar todos los logs con timestamps
        $allLogs = @()

        if (Test-Path $BackendLog) {
            $content = Get-Content $BackendLog
            foreach ($line in $content) {
                $allLogs += "[BACKEND] $line"
            }
        }

        if (Test-Path $BackendErrLog) {
            $content = Get-Content $BackendErrLog
            foreach ($line in $content) {
                $allLogs += "[BACKEND-ERROR] $line"
            }
        }

        if (Test-Path $FrontendLog) {
            $content = Get-Content $FrontendLog
            foreach ($line in $content) {
                $allLogs += "[FRONTEND] $line"
            }
        }

        if (Test-Path $FrontendErrLog) {
            $content = Get-Content $FrontendErrLog
            foreach ($line in $content) {
                $allLogs += "[FRONTEND-ERROR] $line"
            }
        }

        $allLogs | Out-Host -Paging
    }
    "6" {
        Write-Host "`n========================================" -ForegroundColor Cyan
        Write-Host "  Ultimas 50 lineas de cada log" -ForegroundColor Cyan
        Write-Host "========================================`n" -ForegroundColor Cyan

        if (Test-Path $BackendLog) {
            Write-Host "`n--- Backend (Output) ---" -ForegroundColor Green
            Get-Content $BackendLog -Tail 50
        }

        if (Test-Path $BackendErrLog) {
            Write-Host "`n--- Backend (Errors) ---" -ForegroundColor Red
            Get-Content $BackendErrLog -Tail 50
        }

        if (Test-Path $FrontendLog) {
            Write-Host "`n--- Frontend (Output) ---" -ForegroundColor Green
            Get-Content $FrontendLog -Tail 50
        }

        if (Test-Path $FrontendErrLog) {
            Write-Host "`n--- Frontend (Errors) ---" -ForegroundColor Red
            Get-Content $FrontendErrLog -Tail 50
        }

        Write-Host "`n========================================" -ForegroundColor Cyan
        Read-Host "`nPresiona Enter para continuar"
    }
    "0" {
        Write-Host "Saliendo..." -ForegroundColor Yellow
        exit 0
    }
    default {
        Write-Host "[ERROR] Opcion invalida" -ForegroundColor Red
        exit 1
    }
}
