@echo off
setlocal enabledelayedexpansion

:: Script para verificar el estado de Airplay
echo ========================================
echo   Estado de Airplay
echo ========================================
echo.

:: Verificar si existe el archivo PID
if exist ".airplay.pid" (
    set /p PID=<.airplay.pid
    echo [PID FILE] !PID!

    :: Verificar si el proceso existe
    tasklist /FI "PID eq !PID!" 2>nul | find "!PID!" >nul
    if errorlevel 1 (
        echo [STATUS] DETENIDO (PID file obsoleto)
        echo [WARNING] El archivo PID existe pero el proceso no esta corriendo
        set APP_RUNNING=false
    ) else (
        echo [STATUS] CORRIENDO
        echo [INFO] El proceso esta activo
        set APP_RUNNING=true
    )
) else (
    echo [PID FILE] No encontrado
    set APP_RUNNING=false
)

echo.
echo [PUERTO 3000]
netstat -aon | find ":3000" | find "LISTENING" >nul
if errorlevel 1 (
    echo [STATUS] No hay procesos escuchando en puerto 3000
    if "!APP_RUNNING!"=="true" (
        echo [WARNING] Inconsistencia: PID existe pero puerto no esta en uso
    )
) else (
    echo [STATUS] Puerto 3000 en uso
    echo [PROCESOS]
    for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
        echo   - PID: %%a
        tasklist /FI "PID eq %%a" /FO TABLE /NH 2>nul
    )
    set APP_RUNNING=true
)

echo.
echo [URL] http://localhost:3000
echo [LOGS] logs\app.log

:: Verificar si el archivo de log existe y mostrar las ultimas lineas
if exist "logs\app.log" (
    echo.
    echo [ULTIMAS LINEAS DEL LOG]
    echo ----------------------------------------
    powershell -Command "Get-Content logs\app.log -Tail 10 -ErrorAction SilentlyContinue"
)

echo.
echo ========================================
if "!APP_RUNNING!"=="true" (
    echo   La aplicacion esta CORRIENDO
    exit /b 0
) else (
    echo   La aplicacion esta DETENIDA
    exit /b 1
)
