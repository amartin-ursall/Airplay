# Servidor FTP Genérico

Servidor FTP genérico y reutilizable que centraliza todos los archivos de tus aplicaciones en una estructura organizada.

## Estructura de Carpetas

El servidor FTP crea automáticamente la siguiente estructura en tu sistema:

```
~/Documents/ftp/
├── {appName1}/          # Archivos de la primera aplicación
├── {appName2}/          # Archivos de la segunda aplicación
└── {appNameN}/          # Archivos de la N aplicación
```

Si no especificas `appName`, los archivos se almacenan directamente en `~/Documents/ftp/`

## Instalación

### Dependencia NPM requerida

```bash
npm install ftp-srv
```

O añade a tu `package.json`:

```json
{
  "dependencies": {
    "ftp-srv": "^4.6.2"
  }
}
```

## Uso Básico

### Ejemplo Simple

```typescript
import { startFTPServer } from './ftp/ftp-server';

// Iniciar servidor FTP con configuración mínima
const ftpService = await startFTPServer({
  appName: 'MiApp',  // Creará ~/Documents/ftp/MiApp
  password: 'miPassword123'
});

console.log(`Servidor FTP iniciado en: ${ftpService.getBaseDir()}`);
```

### Ejemplo Completo con Todas las Opciones

```typescript
import { startFTPServer } from './ftp/ftp-server';

const ftpService = await startFTPServer({
  port: 2121,                    // Puerto FTP (default: 21)
  host: '0.0.0.0',               // Host (default: '0.0.0.0')
  appName: 'MiAplicacion',       // Nombre de tu app
  password: 'miPassword',        // Contraseña (default: 'ftp123')
  greeting: ['Bienvenido!'],     // Mensaje de bienvenida
  pasvMin: 1024,                 // Puerto pasivo mínimo (default: 1024)
  pasvMax: 1048,                 // Puerto pasivo máximo (default: 1048)

  // O directorio personalizado (ignora appName si se especifica)
  // baseDir: '/ruta/personalizada',

  // O autenticación personalizada
  // authenticateUser: (username, password) => {
  //   return myCustomAuth(username, password);
  // }
});
```

### Crear Carpetas Dentro del FTP

```typescript
// Crear una carpeta
await ftpService.createFolder('usuarios/Juan');

// Crear múltiples carpetas de una vez
await ftpService.createFolders([
  'conversaciones/usuario1-usuario2',
  'conversaciones/usuario1-usuario2/Archivos',
  'compartidos',
  'temporales'
]);
```

## Configuración Disponible

| Parámetro | Tipo | Default | Descripción |
|-----------|------|---------|-------------|
| `port` | number | 21 | Puerto del servidor FTP |
| `host` | string | '0.0.0.0' | Host del servidor |
| `appName` | string | undefined | Nombre de tu app (crea subcarpeta en ftp) |
| `baseDir` | string | ~/Documents/ftp/{appName} | Directorio base personalizado |
| `password` | string | 'ftp123' | Contraseña por defecto |
| `greeting` | string[] | ['Bienvenido al servidor FTP'] | Mensaje de bienvenida |
| `authenticateUser` | function | (u,p) => p === password | Función de autenticación personalizada |
| `pasvMin` | number | 1024 | Puerto pasivo mínimo |
| `pasvMax` | number | 1048 | Puerto pasivo máximo |

## Ejemplo de Integración (Ver index-example.ts)

El archivo `index-example.ts` muestra cómo integrar el servidor FTP en una aplicación existente (en este caso, ConversacionesAirplay).

Incluye:
- Configuración del servidor FTP con nombre de app
- Sincronización de datos existentes creando carpetas dinámicamente
- Manejo de errores

## Métodos Disponibles

### `startFTPServer(config)`
Inicia el servidor FTP con la configuración especificada.

```typescript
const ftpService = await startFTPServer({ appName: 'MiApp' });
```

### `ftpService.getBaseDir()`
Obtiene el directorio base configurado.

```typescript
console.log(ftpService.getBaseDir());
// ~/Documents/ftp/MiApp
```

### `ftpService.createFolder(path)`
Crea una carpeta dentro del directorio FTP.

```typescript
await ftpService.createFolder('subcarpeta/anidada');
```

### `ftpService.createFolders(paths)`
Crea múltiples carpetas de forma secuencial.

```typescript
await ftpService.createFolders(['carpeta1', 'carpeta2', 'carpeta3']);
```

### `ftpService.stop()`
Detiene el servidor FTP.

```typescript
await ftpService.stop();
```

## Autenticación Personalizada

Puedes implementar tu propia lógica de autenticación:

```typescript
const ftpService = await startFTPServer({
  appName: 'MiApp',
  authenticateUser: (username, password) => {
    // Consultar base de datos, validar tokens, etc.
    const user = myDatabase.findUser(username);
    return user && user.validatePassword(password);
  }
});
```

## Casos de Uso

### Múltiples Apps Compartiendo el Mismo Servidor FTP

```typescript
// App 1: Sistema de mensajería
const app1Ftp = await startFTPServer({
  port: 2121,
  appName: 'Mensajeria',
  password: 'msg123'
});

// App 2: Gestión de documentos
const app2Ftp = await startFTPServer({
  port: 2122,
  appName: 'Documentos',
  password: 'doc123'
});

// Resultado:
// ~/Documents/ftp/Mensajeria/
// ~/Documents/ftp/Documentos/
```

## Notas Importantes

- El puerto 21 (puerto FTP estándar) requiere privilegios de administrador. Se recomienda usar puertos alternativos como 2121.
- El directorio base se crea automáticamente si no existe.
- La autenticación por defecto acepta cualquier usuario con la contraseña configurada.
- Todos los logs se muestran con el prefijo `[FTP]` para fácil identificación.

## Archivos

- `ftp-server.ts` - Servicio principal del servidor FTP (100% genérico)
- `index-example.ts` - Ejemplo de integración con una app real
- `README.md` - Esta documentación
