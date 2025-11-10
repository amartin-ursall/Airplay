# Configuración de Aplicación en Segundo Plano

Este documento explica cómo configurar una aplicación para que se ejecute en segundo plano sin ventanas visibles en Windows, utilizando PowerShell.

## Contexto

La aplicación "Datos Sensibles" consta de dos componentes:
- **Backend**: Python Flask (puerto 5000)
- **Frontend**: Next.js (puerto 3030)

Inicialmente se intentó usar PM2 (Process Manager 2), pero presentó problemas de permisos en Windows (`EPERM //./pipe/rpc.sock`). Por ello, se creó una solución con scripts PowerShell nativos.

## Estructura de Archivos

```
proyecto/
├── ecosystem.config.js          # Configuración PM2 (referencia)
├── logs/                        # Directorio de logs
│   ├── backend-out.log
│   ├── backend-error.log
│   ├── frontend-out.log
│   ├── frontend-error.log
│   └── app-pids.txt            # PIDs de procesos en ejecución
└── scripts/
    ├── start-background.ps1     # Inicia app en segundo plano
    └── stop-background.ps1      # Detiene app en segundo plano
```

## Pasos para Implementar en Otra Aplicación

### 1. Crear el Script de Inicio (start-background.ps1)

```powershell
# Cambiar al directorio del proyecto
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# Verificar prerrequisitos (Node.js, Python, etc.)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js no esta instalado" -ForegroundColor Red
    exit 1
}

# Crear directorio de logs
$LogsDir = Join-Path $ProjectRoot "logs"
if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir | Out-Null
}

# Definir archivos de log
$BackendLog = Join-Path $LogsDir "backend-out.log"
$BackendErrLog = Join-Path $LogsDir "backend-error.log"

# Iniciar proceso en segundo plano (ejemplo: Backend Python)
$BackendDir = Join-Path $ProjectRoot "backend"
$PythonExe = Join-Path $BackendDir "venv\Scripts\pythonw.exe"  # pythonw.exe = sin ventana

$BackendProcess = Start-Process -FilePath $PythonExe `
    -ArgumentList "app.py" `
    -WorkingDirectory $BackendDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $BackendLog `
    -RedirectStandardError $BackendErrLog `
    -PassThru

# Guardar PID para poder detener después
$PidsFile = Join-Path $ProjectRoot "logs\app-pids.txt"
"BACKEND_PID=$($BackendProcess.Id)" | Out-File -FilePath $PidsFile -Encoding utf8
```

**Características clave:**
- **`-WindowStyle Hidden`**: Oculta la ventana del proceso
- **`-RedirectStandardOutput` / `-RedirectStandardError`**: Captura logs
- **`-PassThru`**: Devuelve el objeto del proceso para obtener su PID
- **`pythonw.exe`**: Versión de Python sin consola (Windows)

### 2. Crear el Script de Detención (stop-background.ps1)

```powershell
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# Leer PIDs guardados
$PidsFile = Join-Path $ProjectRoot "logs\app-pids.txt"
$BackendPid = $null

if (Test-Path $PidsFile) {
    $Content = Get-Content $PidsFile
    foreach ($Line in $Content) {
        if ($Line -match "BACKEND_PID=(\d+)") {
            $BackendPid = [int]$Matches[1]
        }
    }
}

# Detener proceso por PID
if ($BackendPid) {
    try {
        $Process = Get-Process -Id $BackendPid -ErrorAction SilentlyContinue
        if ($Process) {
            Stop-Process -Id $BackendPid -Force
            Write-Host "[OK] Backend detenido" -ForegroundColor Green
        }
    } catch {
        Write-Host "[ERROR] No se pudo detener: $_" -ForegroundColor Red
    }
}

# Método alternativo: Detener por puerto
$Connections = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue
if ($Connections) {
    foreach ($Conn in $Connections) {
        Stop-Process -Id $Conn.OwningProcess -Force
    }
}

# Limpiar archivo de PIDs
if (Test-Path $PidsFile) {
    Remove-Item $PidsFile -Force
}
```

### 3. Ejecutar los Scripts

**Iniciar aplicación:**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-background.ps1
```

**Detener aplicación:**
```powershell
powershell -ExecutionPolicy Bypass -File scripts\stop-background.ps1
```

**Ver logs en tiempo real:**
```powershell
Get-Content logs\backend-out.log -Wait
Get-Content logs\frontend-out.log -Wait
```

## Adaptación a Otros Tipos de Aplicaciones

### Aplicación Node.js / Next.js

```powershell
$NodeExe = (Get-Command node).Source
$FrontendProcess = Start-Process -FilePath $NodeExe `
    -ArgumentList "node_modules\next\dist\bin\next dev -p 3030" `
    -WorkingDirectory $ProjectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $FrontendLog `
    -RedirectStandardError $FrontendErrLog `
    -PassThru
```

### Aplicación Java

```powershell
$JavaExe = (Get-Command java).Source
$JavaProcess = Start-Process -FilePath $JavaExe `
    -ArgumentList "-jar app.jar" `
    -WorkingDirectory $AppDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $AppLog `
    -RedirectStandardError $AppErrLog `
    -PassThru
```

### Aplicación .NET

```powershell
$DotnetExe = (Get-Command dotnet).Source
$DotnetProcess = Start-Process -FilePath $DotnetExe `
    -ArgumentList "run --project myapp.csproj" `
    -WorkingDirectory $AppDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $AppLog `
    -RedirectStandardError $AppErrLog `
    -PassThru
```

## Verificaciones Adicionales

### Verificar si un Puerto Está en Uso

```powershell
function Test-PortInUse {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    return $null -ne $connections
}

if (Test-PortInUse -Port 5000) {
    Write-Host "[WARN] Puerto 5000 ya está en uso"
}
```

### Esperar a que un Proceso Inicie

```powershell
# Esperar 5 segundos
Start-Sleep -Seconds 5

# O verificar que el puerto esté activo
$MaxRetries = 10
$Retry = 0
while (-not (Test-PortInUse -Port 5000) -and $Retry -lt $MaxRetries) {
    Start-Sleep -Seconds 1
    $Retry++
}
```

## Ventajas de Esta Solución

1. **Sin ventanas visibles**: Los procesos se ejecutan completamente en segundo plano
2. **Logs centralizados**: Toda la salida se captura en archivos de log
3. **Gestión de PIDs**: Fácil detención de procesos
4. **Sin dependencias externas**: No requiere PM2 ni otras herramientas
5. **Nativo de Windows**: Usa PowerShell estándar
6. **Fallback por puerto**: Si se pierden los PIDs, se puede detener por puerto

## Desventajas vs PM2

1. **Sin reinicio automático**: Si un proceso falla, no se reinicia automáticamente
2. **Sin monitoreo**: No hay dashboard ni métricas integradas
3. **Sin clustering**: No soporta múltiples instancias automáticamente
4. **Sin rotación de logs**: Los logs crecen indefinidamente

## Alternativas para Producción

Para entornos de producción, considera:

1. **Windows Service**: Usar `sc.exe` o NSSM (Non-Sucking Service Manager)
2. **Tarea Programada**: Windows Task Scheduler con inicio en el arranque
3. **Docker**: Contenedores con restart policy
4. **PM2 con privilegios**: Ejecutar PowerShell/CMD como administrador

## Solución de Problemas

### Error: "No se puede ejecutar scripts en este sistema"

```powershell
# Cambiar política de ejecución (ejecutar como administrador)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### El proceso no se detiene

```powershell
# Detener por nombre de proceso
Get-Process python* | Stop-Process -Force
Get-Process node* | Stop-Process -Force
```

### Los logs no se escriben

- Verificar que el directorio `logs/` exista
- Verificar permisos de escritura
- Usar `-RedirectStandardOutput` y `-RedirectStandardError`

## Ejemplo Completo: Aplicación Full Stack

```powershell
# start-background.ps1 completo
$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

# Crear logs
$LogsDir = Join-Path $ProjectRoot "logs"
New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null

# Backend
$BackendProcess = Start-Process -FilePath "python.exe" `
    -ArgumentList "app.py" `
    -WorkingDirectory ".\backend" `
    -WindowStyle Hidden `
    -RedirectStandardOutput "logs\backend-out.log" `
    -RedirectStandardError "logs\backend-error.log" `
    -PassThru

# Esperar
Start-Sleep -Seconds 5

# Frontend
$FrontendProcess = Start-Process -FilePath "node.exe" `
    -ArgumentList ".\node_modules\next\dist\bin\next dev -p 3030" `
    -WindowStyle Hidden `
    -RedirectStandardOutput "logs\frontend-out.log" `
    -RedirectStandardError "logs\frontend-error.log" `
    -PassThru

# Guardar PIDs
@"
BACKEND_PID=$($BackendProcess.Id)
FRONTEND_PID=$($FrontendProcess.Id)
"@ | Out-File "logs\app-pids.txt" -Encoding utf8

Write-Host "Aplicación iniciada en segundo plano"
Write-Host "Backend PID: $($BackendProcess.Id)"
Write-Host "Frontend PID: $($FrontendProcess.Id)"
```

## Recursos Adicionales

- [Start-Process Documentation](https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process)
- [Get-NetTCPConnection Documentation](https://docs.microsoft.com/en-us/powershell/module/nettcpip/get-nettcpconnection)
- [PowerShell Redirection](https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_redirection)

## Resumen de Comandos Útiles

```powershell
# Iniciar aplicación
.\scripts\start-background.ps1

# Detener aplicación
.\scripts\stop-background.ps1

# Ver logs en tiempo real
Get-Content logs\backend-out.log -Wait -Tail 20

# Ver procesos activos
Get-Process | Where-Object { $_.ProcessName -match "python|node" }

# Ver puertos en uso
Get-NetTCPConnection | Where-Object { $_.LocalPort -in @(5000, 3030) }

# Detener todos los procesos Node
Get-Process node* | Stop-Process -Force

# Detener proceso por puerto
$Pid = (Get-NetTCPConnection -LocalPort 5000).OwningProcess
Stop-Process -Id $Pid -Force
```

---

**Nota**: Esta configuración fue creada como alternativa a PM2 debido a problemas de permisos en Windows. Para sistemas Linux/Mac, PM2 sigue siendo la opción recomendada.
