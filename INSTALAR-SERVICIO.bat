@echo off
echo ==================================================
echo   Instalador de Servicio Airplay
echo ==================================================
echo.
echo Este script instalara Airplay como servicio permanente
echo Se requieren privilegios de administrador
echo.
echo Presiona cualquier tecla para continuar o cierra esta ventana para cancelar...
pause >nul

REM Ejecutar el script de PowerShell como administrador
powershell -ExecutionPolicy Bypass -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -File \"%~dp0scripts\install-service.ps1\"' -Verb RunAs"
