@echo off
echo ========================================
echo    Iniciando Airplay Completo
echo    (Servidor Backend + Frontend)
echo ========================================
echo.

echo Instalando dependencias (si es necesario)...
call npm install

echo.
echo Iniciando Backend en puerto 5000...
start "Airplay Backend" cmd /k npm run server:dev

timeout /t 3 /nobreak >nul

echo.
echo Iniciando Frontend en puerto 3000...
start "Airplay Frontend" cmd /k npm run dev

echo.
echo ========================================
echo    Servidores iniciados!
echo ========================================
echo.
echo Backend API:  http://localhost:5000
echo Frontend:     http://localhost:3000
echo FTP:          ftp://localhost:2121
echo.
echo Usuario FTP: cualquier nombre
echo Password:    airplay
echo.
echo Presiona cualquier tecla para cerrar esta ventana
echo (Los servidores seguiran corriendo en sus propias ventanas)
pause >nul
