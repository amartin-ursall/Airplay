@echo off
setlocal enabledelayedexpansion

:: Script para detener la aplicacion Airplay
echo [STOP] Deteniendo Airplay...

:: Buscar y matar todos los procesos de node.exe y npm en el puerto 3000
echo [INFO] Buscando procesos en puerto 3000...
set FOUND=0
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| find ":3000" ^| find "LISTENING"') do (
    set FOUND=1
    echo [INFO] Deteniendo proceso %%a
    taskkill /F /PID %%a >nul 2>&1
)

:: Matar procesos de npm y node relacionados
echo [INFO] Limpiando procesos de Node.js y npm...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM npm.cmd >nul 2>&1

:: Limpiar archivo PID
if exist ".airplay.pid" (
    del .airplay.pid
)

:: Esperar un momento
timeout /t 2 /nobreak > nul

:: Verificar si aun hay procesos
netstat -aon 2>nul | find ":3000" | find "LISTENING" >nul
if errorlevel 1 (
    if !FOUND!==1 (
        echo [SUCCESS] Aplicacion detenida completamente
    ) else (
        echo [INFO] No habia procesos corriendo en puerto 3000
    )
    echo [INFO] Puerto 3000 libre
    exit /b 0
) else (
    echo [WARNING] Puede que aun haya procesos corriendo en el puerto 3000
    echo [INFO] Intenta cerrar manualmente los procesos de Node.js desde el Administrador de tareas
    exit /b 1
)
