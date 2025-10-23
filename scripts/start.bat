@echo off
setlocal

:: Script para iniciar la aplicacion Airplay
echo [START] Iniciando Airplay...

:: Verificar si ya esta corriendo
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    echo [ERROR] La aplicacion ya esta corriendo en el puerto 3000 (PID: %%a)
    echo [INFO] Usa stop.bat para detenerla primero
    exit /b 1
)

:: Crear directorio para logs si no existe
if not exist "logs" mkdir logs

:: Guardar el PID en un archivo
echo [INFO] Verificando dependencias...
call npm install > logs\install.log 2>&1

:: Iniciar la aplicacion en segundo plano
echo [INFO] Iniciando servidor de desarrollo...
start /b cmd /c "npm run dev > logs\app.log 2>&1"

:: Esperar un momento para que inicie
timeout /t 3 /nobreak > nul

:: Buscar el PID del proceso
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    echo %%a > .airplay.pid
    echo [SUCCESS] Aplicacion iniciada correctamente
    echo [INFO] PID: %%a
    echo.
    echo [INFO] URLs de acceso:
    echo   Local:   http://localhost:3000

    :: Obtener la IP local
    for /f "tokens=2 delims=:" %%b in ('ipconfig ^| findstr /i "IPv4" ^| findstr /v "127.0.0.1"') do (
        for /f "tokens=1" %%c in ("%%b") do (
            echo   Red:     http://%%c:3000
        )
    )

    echo.
    echo [INFO] Comparte la URL de Red con otros dispositivos en tu red local
    echo [INFO] Logs: logs\app.log
    exit /b 0
)

echo [ERROR] No se pudo iniciar la aplicacion
echo [INFO] Revisa los logs en logs\app.log
exit /b 1
