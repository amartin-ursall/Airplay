@echo off
REM Script para ver logs de Airplay (Windows Batch)
REM Este script llama al script PowerShell correspondiente

powershell -ExecutionPolicy Bypass -File "%~dp0view-logs.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Hubo un error al mostrar los logs
    pause
)
