@echo off
REM Script para iniciar Airplay en segundo plano (Windows Batch)
REM Este script llama al script PowerShell correspondiente

echo.
echo ========================================
echo   Iniciando Airplay en segundo plano
echo ========================================
echo.

REM Ejecutar el script PowerShell con política de ejecución bypass
powershell -ExecutionPolicy Bypass -File "%~dp0start-background.ps1"

REM Verificar si hubo error
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Hubo un problema al iniciar la aplicacion
    echo Revisa los logs en la carpeta logs/
    pause
    exit /b 1
)

echo.
echo Presiona cualquier tecla para cerrar esta ventana...
pause > nul
