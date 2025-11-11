@echo off
REM Wrapper para ejecutar el script de limpieza de base de datos

powershell -ExecutionPolicy Bypass -File "%~dp0clean-database.ps1"

pause
