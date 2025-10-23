# Cambios Realizados en AetherLink

## Resumen de Cambios

Se han implementado las siguientes mejoras en la aplicación AetherLink para convertirla en un sistema exclusivo de transferencia de archivos entre usuarios online:

---

## 1. **Solo usuarios online visibles**

### Cambio
- Ahora solo se muestran en la lista de usuarios aquellos que están actualmente conectados (online)
- Los usuarios offline no aparecen en la lista

### Archivos modificados
- `src/components/aetherlink/UserList.tsx:21`

### Código
```typescript
const otherUsers = users.filter(u => u.id !== currentUser?.id && u.online);
```

---

## 2. **Eliminación de mensajes de texto**

### Cambio
- Se eliminó completamente la funcionalidad de envío de mensajes de texto
- La aplicación ahora es exclusivamente para transferencia de archivos

### Archivos modificados
- `src/components/aetherlink/ChatPanel.tsx`
  - Eliminado el textarea para escribir mensajes
  - Eliminado el botón de enviar mensaje
  - Eliminada la función `handleSendMessage`
  - Reemplazado por un botón grande de "Upload File"

- `worker/user-routes.ts:62`
  - Eliminado el endpoint `POST /api/messages` para mensajes de texto

### Interfaz actualizada
```typescript
// Antes: Campo de texto + botón de archivo + botón de enviar
// Ahora: Solo botón de "Upload File" (grande y prominente)
```

---

## 3. **Actualización de tipos**

### Cambio
- El tipo `Message` ahora solo soporta archivos (type: 'file')
- El campo `file` ahora es obligatorio (no opcional)

### Archivos modificados
- `shared/types.ts:17-26`

### Código actualizado
```typescript
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string; // File ID
  timestamp: number;
  type: 'file'; // Solo 'file', ya no 'text' | 'file'
  file: FileMetadata; // Ahora obligatorio
  progress?: number;
}
```

---

## 4. **Almacenamiento persistente de archivos**

### Cambio
- Los archivos ahora se almacenan en el Durable Object con persistencia completa
- Los archivos se guardan por conversación
- Estructura de almacenamiento organizada por participantes de la conversación

### Archivos modificados
- `worker/entities.ts:14-90`

### Nuevos métodos implementados

```typescript
class ConversationEntity {
  // Genera nombre de conversación basado en nombres de usuarios
  static getConversationName(userId1: string, userId2: string, userNames: Map<string, string>): string

  // Inicia la carga de un archivo
  async initiateFileUpload(fileId: string, file: FileMetadata): Promise<void>

  // Sube un chunk del archivo
  async uploadFileChunk(fileId: string, chunkIndex: number, chunkData: ArrayBuffer): Promise<boolean>

  // Obtiene metadata del archivo
  async getFileMetadata(fileId: string): Promise<FileMetadata | null>

  // Obtiene archivo completo para descarga
  async getCompletedFile(fileId: string): Promise<{ meta: FileMetadata; stream: ReadableStream } | null>
}
```

### Estructura de almacenamiento
Los archivos se almacenan en el estado de la conversación:
```typescript
{
  fileUploads: {
    [fileId]: {
      meta: FileMetadata,
      chunks: { [index]: Uint8Array },
      totalChunks: number,
      uploadedChunks: number
    }
  }
}
```

---

## 5. **Actualización del sistema de carga de archivos**

### Cambio
- Ahora se envía el `X-Recipient-Id` en los headers al cargar chunks
- Mejor manejo de errores y progreso de carga

### Archivos modificados
- `src/components/aetherlink/ChatPanel.tsx:85-104`
- `worker/user-routes.ts:75-96`

### Headers de carga
```typescript
headers: {
  'Content-Type': 'application/octet-stream',
  'X-User-Id': currentUser.id,
  'X-Recipient-Id': activeConversationId  // Nuevo header
}
```

---

## 6. **Cliente API mejorado**

### Cambio
- El cliente API ahora automáticamente incluye el `X-User-Id` en todos los requests
- Lee el usuario del localStorage y lo envía en cada petición

### Archivos modificados
- `src/lib/api-client.ts:3-23`

### Código
```typescript
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const storedUser = localStorage.getItem('aetherlink-user');
  const userId = storedUser ? JSON.parse(storedUser).id : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>)
  };

  if (userId) {
    headers['X-User-Id'] = userId;
  }

  const res = await fetch(path, { ...init, headers })
  // ... resto del código
}
```

---

## 7. **Componente Message actualizado**

### Cambio
- El componente ahora solo muestra archivos
- Descarga mejorada con query parameter `otherUserId`
- Mejor detección del estado de completado del archivo

### Archivos modificados
- `src/components/aetherlink/Message.tsx:20-80`

### Mejoras
```typescript
// URL de descarga actualizada
const downloadUrl = `/api/files/${message.content}?otherUserId=${activeConversationId}`;

// Mejor detección de completado
const isComplete = message.progress === 100 || message.progress === undefined;
```

---

## 8. **Corrección de errores de entidades**

### Cambio
- Agregado campo `lastSeen` al `initialState` de `UserEntity`
- Agregado método `setLastSeen()` para actualizar la última conexión

### Archivos modificados
- `worker/entities.ts:3-13`
- `worker/user-routes.ts:30`

### Código
```typescript
export class UserEntity extends IndexedEntity<User> {
  static readonly initialState: User = {
    id: "",
    name: "",
    online: false,
    lastSeen: 0  // Agregado
  };

  async setLastSeen(lastSeen: number): Promise<void> {
    await this.patch({ lastSeen });
  }
}
```

---

## Cómo funciona ahora la aplicación

### Flujo de usuario

1. **Login**: El usuario ingresa su nombre y se crea una sesión
2. **Lista de usuarios**: Solo ve usuarios que están online en ese momento
3. **Selección de usuario**: Hace clic en un usuario online para iniciar transferencia
4. **Transferencia de archivos**:
   - Solo puede enviar archivos (no mensajes de texto)
   - Click en "Upload File"
   - Selecciona un archivo (máx 1GB)
   - El archivo se sube en chunks de 5MB
   - Barra de progreso muestra el avance
5. **Descarga**: Click en el botón de descarga en el mensaje del archivo
6. **Persistencia**: Los archivos quedan almacenados en el servidor y se pueden descargar en cualquier momento

### Características técnicas

- **Almacenamiento**: Cloudflare Durable Objects (persistente)
- **Tamaño máximo**: 1GB por archivo
- **Chunk size**: 5MB
- **Formato de chunks**: Uint8Array almacenado en el estado del Durable Object
- **Organización**: Archivos organizados por conversación (par de usuarios)
- **Nombres de conversación**: Generados a partir de los nombres de los dos usuarios (ordenados alfabéticamente)

---

## Endpoints API actualizados

### Eliminados
- `POST /api/messages` - Envío de mensajes de texto (eliminado)

### Actualizados
- `POST /api/files/upload/:fileId/:chunkIndex` - Ahora requiere header `X-Recipient-Id`

### Sin cambios
- `POST /api/users/login` - Login de usuario
- `GET /api/users` - Lista de usuarios
- `GET /api/conversations/:userId` - Obtener conversación
- `POST /api/files/initiate` - Iniciar carga de archivo
- `GET /api/files/:fileId` - Descargar archivo

---

## Notas importantes

1. **Persistencia de archivos**: Los archivos se almacenan en el Durable Object y persisten entre sesiones
2. **Solo usuarios online**: La transferencia solo es posible con usuarios que tienen la app abierta
3. **Sin mensajes de texto**: La aplicación es exclusivamente para transferir archivos
4. **Cloudflare Workers**: La app está diseñada para desplegarse en Cloudflare Workers con Durable Objects
5. **Límites de almacenamiento**: Ten en cuenta los límites de Cloudflare Durable Objects para almacenamiento

---

## Próximos pasos recomendados (opcional)

1. **Almacenamiento en R2**: Migrar archivos grandes a Cloudflare R2 para mejor escalabilidad
2. **Límite de tiempo**: Agregar expiración automática de archivos
3. **Categorización**: Organizar archivos por carpetas/categorías
4. **Búsqueda**: Agregar búsqueda de archivos
5. **Vista de carpetas**: Mostrar archivos organizados por conversación
