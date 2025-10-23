# Airplay - Servidor Node.js Local

## Descripción

Esta aplicación ha sido migrada de Cloudflare Workers a un servidor Node.js local para soportar:

- **Almacenamiento de archivos** en sistema de archivos local
- **Persistencia de mensajes** en archivos `.txt`
- **Servidor FTP** para acceso a archivos
- **Organización por conversaciones** con estructura de carpetas

## Estructura de Carpetas

Los archivos y mensajes se almacenan en:

```
C:\Users\[usuario]\Documents\ConversacionesAirplay\
├── Alberto-Alfonso\              # Carpeta de conversación (nombres ordenados alfabéticamente)
│   ├── Archivos\                 # Carpeta con los archivos compartidos
│   │   ├── 23-01-2025_Alberto_Alfonso.pdf
│   │   ├── 23-01-2025_Alfonso_Alberto.jpg
│   │   └── ...
│   └── mensajes.txt              # Historial de mensajes en texto plano
├── Alberto-Carlos\
│   ├── Archivos\
│   └── mensajes.txt
└── ...
```

### Nomenclatura de Archivos

Los archivos se guardan con el formato:
```
dd-mm-yyyy_emisor_receptor.extensión
```

Ejemplo: `23-01-2025_Alberto_Alfonso.pdf`

### Formato de Mensajes

Los mensajes se guardan en `mensajes.txt` con el formato:
```
[23/01/2025, 14:30:45] Alberto: Hola, ¿cómo estás?
[23/01/2025, 14:31:12] Alfonso: Muy bien, gracias
[23/01/2025, 14:32:00] Alberto envió el archivo: documento.pdf (1234567 bytes)
```

## Instalación

### 1. Instalar dependencias

```bash
npm install
```

### 2. Iniciar el servidor

#### Modo desarrollo (con auto-reload):
```bash
npm run server:dev
```

#### Modo producción:
```bash
npm run server
```

### 3. Iniciar el frontend (en otra terminal)

```bash
npm run dev
```

## Servidores

### Servidor HTTP (API)
- **URL**: `http://localhost:3000`
- **Puerto**: 3000
- Compatible con el frontend de Vite

### Servidor FTP
- **Host**: `ftp://localhost:2121`
- **Puerto**: 2121 (alternativo al 21 para evitar permisos de administrador)
- **Usuario**: cualquier nombre
- **Contraseña**: `airplay`
- **Directorio raíz**: `C:\Users\[usuario]\Documents\ConversacionesAirplay\`

## Conectarse al FTP

### Windows - FileZilla
1. Abrir FileZilla
2. Host: `localhost`
3. Puerto: `2121`
4. Usuario: `admin` (o cualquier nombre)
5. Contraseña: `airplay`
6. Conectar

### Windows - Explorador de Archivos
1. Abrir Explorador de Archivos
2. En la barra de dirección escribir: `ftp://localhost:2121`
3. Ingresar credenciales cuando se soliciten

### Linux/Mac - Terminal
```bash
ftp localhost 2121
# Usuario: admin
# Contraseña: airplay
```

## API Endpoints

### Usuarios

- **POST** `/api/users/login` - Crear/Login usuario
  ```json
  { "name": "Alberto" }
  ```

- **GET** `/api/users` - Obtener todos los usuarios

### Conversaciones

- **GET** `/api/conversations/:userId` - Obtener conversación con otro usuario
  - Header: `X-User-Id: [tu-user-id]`

### Mensajes

- **POST** `/api/messages` - Enviar mensaje de texto
  ```json
  {
    "recipientId": "user-id",
    "content": "Hola!"
  }
  ```
  - Header: `X-User-Id: [tu-user-id]`

### Archivos

- **POST** `/api/files/initiate` - Iniciar subida de archivo
  ```json
  {
    "recipientId": "user-id",
    "file": {
      "name": "documento.pdf",
      "size": 1234567,
      "type": "application/pdf"
    }
  }
  ```

- **POST** `/api/files/upload/:fileId/:chunkIndex` - Subir chunk de archivo
  - Header: `X-User-Id: [tu-user-id]`
  - Header: `X-Recipient-Id: [recipient-user-id]`
  - Body: ArrayBuffer del chunk

- **GET** `/api/files/:fileId?otherUserId=[user-id]` - Descargar archivo
  - Header: `X-User-Id: [tu-user-id]`

- **GET** `/api/files/list/:userId` - Listar archivos de conversación
  - Header: `X-User-Id: [tu-user-id]`

## Características

### ✅ Implementado

- ✅ Almacenamiento de archivos en sistema de archivos
- ✅ Organización por conversaciones (carpetas con nombres de usuarios)
- ✅ Nomenclatura de archivos: `dd-mm-yyyy_emisor_receptor.ext`
- ✅ Persistencia de mensajes en archivos `.txt`
- ✅ Servidor FTP funcional
- ✅ API REST compatible con frontend existente
- ✅ Subida de archivos por chunks (256KB)
- ✅ Descargas de archivos

### 🔄 Base de Datos

Actualmente usa **base de datos en memoria**:
- Los usuarios y conversaciones se almacenan en RAM
- Los mensajes y archivos se persisten en disco
- **IMPORTANTE**: Al reiniciar el servidor se pierden usuarios y conversaciones (pero NO los archivos y mensajes en disco)

Para producción se recomienda agregar:
- SQLite para persistencia de usuarios y conversaciones
- O migrar a PostgreSQL/MySQL

## Seguridad

### Autenticación FTP

Por defecto, cualquier usuario con la contraseña `airplay` puede acceder al FTP.

**Para cambiar la contraseña**, editar `server/services/ftp-server.ts`:

```typescript
if (password === 'TU_NUEVA_CONTRASEÑA') {
  // ...
}
```

**Para agregar múltiples usuarios**, modificar la función de login:

```typescript
const users = {
  'alberto': 'password123',
  'alfonso': 'password456'
};

if (users[username] === password) {
  // ...
}
```

## Troubleshooting

### Puerto FTP ocupado

Si el puerto 2121 está ocupado, cambiar en `server/index.ts`:

```typescript
const ftpPort = 3121; // Usar otro puerto
```

### Permisos de carpetas

Asegurarse de que el usuario tiene permisos de escritura en:
```
C:\Users\[usuario]\Documents\
```

### FTP no inicia

El servidor continuará funcionando sin FTP si hay algún error. Revisar logs en consola.

## Migración desde Cloudflare

El frontend existente es compatible sin cambios. Solo cambiar:

1. La URL del API a `http://localhost:3000`
2. Verificar que `vite.config.ts` no tiene proxy a Cloudflare Workers

## Estructura del Proyecto

```
Airplay/
├── server/                      # Nuevo backend Node.js
│   ├── index.ts                # Servidor principal
│   ├── db/
│   │   └── in-memory-db.ts     # Base de datos en memoria
│   ├── routes/
│   │   ├── user-routes.ts      # Rutas de usuarios
│   │   └── file-routes.ts      # Rutas de archivos
│   └── services/
│       ├── file-storage.ts     # Servicio de almacenamiento
│       ├── message-storage.ts  # Servicio de mensajes
│       └── ftp-server.ts       # Servidor FTP
├── src/                         # Frontend React
├── shared/                      # Tipos compartidos
├── worker/                      # ⚠️ DEPRECATED - Cloudflare Workers
└── package.json
```

## Licencia

MIT
