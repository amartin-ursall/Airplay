# Script para limpiar la base de datos de Airplay
# Este script detiene los servidores y elimina todos los archivos de la base de datos SQLite

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Limpieza de Base de Datos - Airplay  " -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Detener procesos en puertos 3001 y 5001
Write-Host "[1/3] Deteniendo servidores..." -ForegroundColor Yellow
try {
    $processes = Get-NetTCPConnection -LocalPort 3001,5001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique
    if ($processes) {
        $processes | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
        Write-Host "   OK Servidores detenidos (puertos 3001 y 5001)" -ForegroundColor Green
    } else {
        Write-Host "   INFO No hay procesos corriendo en los puertos" -ForegroundColor Gray
    }
} catch {
    Write-Host "   INFO No se encontraron procesos activos" -ForegroundColor Gray
}
Write-Host ""

# Paso 2: Eliminar archivos de base de datos
Write-Host "[2/3] Eliminando archivos de base de datos..." -ForegroundColor Yellow

$dbPath = "$env:USERPROFILE\Documents\Airplay"
$dbFiles = @(
    "$dbPath\airplay.db",
    "$dbPath\airplay.db-shm",
    "$dbPath\airplay.db-wal"
)

$deletedCount = 0
foreach ($file in $dbFiles) {
    if (Test-Path $file) {
        try {
            Remove-Item $file -Force
            $fileName = Split-Path $file -Leaf
            Write-Host "   OK Eliminado: $fileName" -ForegroundColor Green
            $deletedCount++
        } catch {
            $fileName = Split-Path $file -Leaf
            Write-Host "   ERROR al eliminar: $fileName" -ForegroundColor Red
            Write-Host "     $_" -ForegroundColor Red
        }
    }
}

if ($deletedCount -eq 0) {
    Write-Host "   INFO No se encontraron archivos de base de datos" -ForegroundColor Gray
}
Write-Host ""

# Paso 3: Confirmar
Write-Host "[3/3] Resumen:" -ForegroundColor Yellow
Write-Host "   - Archivos eliminados: $deletedCount" -ForegroundColor Cyan
Write-Host "   - La base de datos se creara nuevamente al iniciar el servidor" -ForegroundColor Cyan
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OK Limpieza completada exitosamente   " -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Puedes iniciar el servidor nuevamente con:" -ForegroundColor White
Write-Host "  npm run dev" -ForegroundColor Yellow
Write-Host ""
