@echo off
REM Script para detener Airplay que se ejecuta en segundo plano (Windows Batch)
REM Este script llama al script PowerShell correspondiente

echo.
echo ========================================
echo   Deteniendo Airplay
echo ========================================
echo.

REM Ejecutar el script PowerShell con política de ejecución bypass
powershell -ExecutionPolicy Bypass -File "%~dp0stop-background.ps1"

REM Verificar si hubo error
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [WARN] Hubo un problema al detener la aplicacion
    echo Es posible que algunos procesos sigan en ejecucion
    pause
    exit /b 1
)

echo.
echo Presiona cualquier tecla para cerrar esta ventana...
pause > nul
