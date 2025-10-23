@echo off
setlocal

echo ====================================
echo   AIRPLAY - Informacion de Red
echo ====================================
echo.

:: Verificar si la aplicacion esta corriendo
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    echo [INFO] Aplicacion corriendo en puerto 3000
    echo [INFO] PID: %%a
    echo.
    echo [INFO] URLs de acceso:
    echo   Local:   http://localhost:3000
    echo.

    :: Obtener todas las IPs locales
    echo   Red:
    for /f "tokens=2 delims=:" %%b in ('ipconfig ^| findstr /i "IPv4"') do (
        for /f "tokens=1" %%c in ("%%b") do (
            echo            http://%%c:3000
        )
    )

    echo.
    echo [TIP] Comparte cualquiera de las URLs de Red con otros
    echo       dispositivos en tu misma red WiFi/LAN
    echo.
    echo [TIP] Asegurate de que tu firewall permita conexiones
    echo       entrantes en el puerto 3000
    exit /b 0
)

echo [ERROR] La aplicacion no esta corriendo
echo [INFO] Ejecuta start.bat primero
exit /b 1
