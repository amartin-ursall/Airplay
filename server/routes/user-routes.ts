import { Hono } from 'hono';
import type { User, Conversation } from '../../shared/types';
import { db, InMemoryDB } from '../db/database';
import { sanitizeUsername } from '../utils/sanitization';
import { getWebSocketService } from '../services/websocket-service';
import { FileStorageService } from '../services/file-storage';

function getUserId(c: any): string | undefined {
  return c.req.header('X-User-Id');
}

async function updateUserPresence(userId: string) {
  db.updateUserLastSeen(userId, Date.now());
}

function sanitizeRoomName(name: string): string {
  return name
    .replace(/[\x00-\x1F\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ROOM_AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const MAX_ROOM_AVATAR_SIZE = 2 * 1024 * 1024; // 2MB

export function userRoutes(app: Hono) {
  // Middleware para actualizar presencia
  app.use('/api/*', async (c, next) => {
    const userId = getUserId(c);
    if (userId) {
      await updateUserPresence(userId);
    }
    await next();
  });

  // Login / Crear usuario
  app.post('/api/users/login', async (c) => {
    try {
      const { name } = await c.req.json() as { name?: string };

      if (!name || typeof name !== 'string' || !name.trim()) {
        return c.json({ success: false, error: 'name required' }, 400);
      }

      const trimmedName = name.trim();

      // Validar longitud del nombre
      if (trimmedName.length < 2) {
        return c.json({ success: false, error: 'El nombre debe tener al menos 2 caracteres' }, 400);
      }

      if (trimmedName.length > 50) {
        return c.json({ success: false, error: 'El nombre no puede exceder 50 caracteres' }, 400);
      }

      // Sanitizar el nombre de usuario para prevenir path traversal y caracteres peligrosos
      const sanitizedName = sanitizeUsername(trimmedName);

      // Si el nombre sanitizado es muy diferente, advertir al usuario
      if (sanitizedName !== trimmedName) {
        console.log(`[Login] Username sanitized: "${trimmedName}" -> "${sanitizedName}"`);
      }

      // Verificar si el nombre ya existe (case-insensitive)
      const existingUser = db.getUserByName(sanitizedName);
      if (existingUser) {
        console.log(`[Login] Username "${sanitizedName}" already exists`);
        return c.json({
          success: false,
          error: 'Este nombre de usuario ya está en uso. Por favor, elige otro.'
        }, 409); // 409 Conflict
      }

      const userId = crypto.randomUUID();
      const user: User = {
        id: userId,
        name: sanitizedName,
        online: true,
        lastSeen: Date.now()
      };

      db.createUser(user);
      await updateUserPresence(userId);

      console.log(`[Login] New user created: "${sanitizedName}" (${userId})`);
      c.header('X-User-Id', userId);

      // Notificar a todos los clientes sobre el nuevo usuario
      const wsService = getWebSocketService();
      if (wsService) {
        wsService.notifyUsersUpdate();
      }

      return c.json({ success: true, data: user });
    } catch (error) {
      console.error('[Login] Error:', error);
      return c.json({ success: false, error: 'Failed to login' }, 500);
    }
  });

  // Obtener todos los usuarios
  app.get('/api/users', async (c) => {
    try {
      const allUsers = db.getAllUsers();
      const now = Date.now();

      const usersWithStatus = allUsers.map(user => {
        const isOnline = user.lastSeen ? (now - user.lastSeen < 30000) : false;
        return { ...user, online: isOnline };
      });

      return c.json({ success: true, data: usersWithStatus });
    } catch (error) {
      console.error('[Users] Error:', error);
      return c.json({ success: false, error: 'Failed to get users' }, 500);
    }
  });

  // Obtener conversación entre dos usuarios
  app.get('/api/conversations/:userId', async (c) => {
    try {
      const currentUserId = getUserId(c);
      const otherUserId = c.req.param('userId');

      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const conversationId = InMemoryDB.getConversationId(currentUserId, otherUserId);
      console.log(`[Backend] Fetching conversation: ${conversationId}`);

      let conversation = db.getConversation(conversationId);

      if (!conversation) {
        // Crear nueva conversación
        console.log('[Backend] Conversation does not exist, creating new one');
        conversation = {
          id: conversationId,
          participants: [currentUserId, otherUserId],
          messages: []
        };
        db.createConversation(conversation);
      }

      console.log(`[Backend] Returning conversation with ${conversation.messages.length} messages`);
      return c.json({ success: true, data: conversation });
    } catch (error) {
      console.error('[Conversation] Error:', error);
      return c.json({ success: false, error: 'Failed to get conversation' }, 500);
    }
  });

  // Enviar mensaje de texto
  app.post('/api/messages', async (c) => {
    try {
      const currentUserId = getUserId(c);

      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const { recipientId, content } = await c.req.json() as {
        recipientId: string;
        content: string;
      };

      if (!recipientId || !content || typeof content !== 'string') {
        return c.json({ success: false, error: 'recipientId and content required' }, 400);
      }

      // Sanitizar el contenido del mensaje (remover caracteres peligrosos pero mantener la legibilidad)
      const sanitizedContent = content
        .trim()
        .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remover caracteres de control
        .substring(0, 10000); // Limitar longitud a 10k caracteres

      if (!sanitizedContent) {
        return c.json({ success: false, error: 'El mensaje no puede estar vacío' }, 400);
      }

      console.log(`[Backend] Text message from ${currentUserId} to ${recipientId}`);

      const conversationId = InMemoryDB.getConversationId(currentUserId, recipientId);

      // Asegurarse de que la conversación existe
      let conversation = db.getConversation(conversationId);
      if (!conversation) {
        conversation = {
          id: conversationId,
          participants: [currentUserId, recipientId],
          messages: []
        };
        db.createConversation(conversation);
      }

      // Crear mensaje
      const message = {
        id: crypto.randomUUID(),
        conversationId,
        senderId: currentUserId,
        content: sanitizedContent,
        timestamp: Date.now(),
        type: 'text' as const
      };

      // Agregar a la conversación en memoria
      db.addMessageToConversation(conversationId, message);

      // Notificar a través de WebSocket
      const wsService = getWebSocketService();
      if (wsService) {
        wsService.notifyNewMessage(message, currentUserId);
      }

      // Persistir en archivo .txt
      const sender = db.getUser(currentUserId);
      const recipient = db.getUser(recipientId);

      console.log('[Backend] Attempting to persist message to file...');
      console.log('[Backend] Sender:', sender);
      console.log('[Backend] Recipient:', recipient);

      if (sender && recipient) {
        try {
          const { MessageStorageService } = await import('../services/message-storage');
          console.log('[Backend] MessageStorageService imported, calling saveMessage...');
          await MessageStorageService.saveMessage(
            sender.name,
            recipient.name,
            message,
            sender.name
          );
          console.log('[Backend] Message successfully persisted to file');
        } catch (error) {
          console.error('[Backend] ERROR persisting message to file:', error);
        }
      } else {
        console.error('[Backend] ERROR: sender or recipient not found');
        console.error('[Backend] sender:', sender, 'recipient:', recipient);
      }

      console.log('[Backend] Text message added:', message);
      return c.json({ success: true, data: { message } });
    } catch (error) {
      console.error('[Messages] Error:', error);
      return c.json({ success: false, error: 'Failed to send message' }, 500);
    }
  });

  // ================== SALAS TEMPORALES ==================

  // Listar salas en las que participa el usuario
  app.get('/api/rooms', async (c) => {
    try {
      const currentUserId = getUserId(c);
      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const userRooms = db.getUserRooms(currentUserId);
      const detailedRooms = userRooms.map((room: any) => db.getRoomById(room.id) || room);

      return c.json({ success: true, data: detailedRooms });
    } catch (error) {
      console.error('[Rooms] Error listing rooms:', error);
      return c.json({ success: false, error: 'Failed to list rooms' }, 500);
    }
  });

  // Crear una sala temporal
  app.post('/api/rooms', async (c) => {
    try {
      const currentUserId = getUserId(c);
      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const { name, expiresInHours } = await c.req.json() as {
        name?: string;
        expiresInHours?: number;
      };

      if (!name || typeof name !== 'string') {
        return c.json({ success: false, error: 'El nombre de la sala es obligatorio' }, 400);
      }

      const sanitizedName = sanitizeRoomName(name);
      if (sanitizedName.length < 3 || sanitizedName.length > 50) {
        return c.json({ success: false, error: 'El nombre debe tener entre 3 y 50 caracteres' }, 400);
      }

      let ttl = typeof expiresInHours === 'number' ? expiresInHours : 24;
      ttl = Math.max(1, Math.min(72, ttl)); // entre 1h y 72h

      const roomId = crypto.randomUUID();
      db.createRoom(roomId, sanitizedName, currentUserId, ttl);
      const room = db.getRoomById(roomId);

      if (!room) {
        return c.json({ success: false, error: 'No se pudo crear la sala' }, 500);
      }

      return c.json({ success: true, data: room });
    } catch (error) {
      console.error('[Rooms] Error creating room:', error);
      return c.json({ success: false, error: 'Failed to create room' }, 500);
    }
  });

  // Unirse a una sala mediante codigo
  app.post('/api/rooms/join', async (c) => {
    try {
      const currentUserId = getUserId(c);
      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const { code } = await c.req.json() as { code?: string };
      const trimmedCode = code?.trim();

      if (!trimmedCode) {
        return c.json({ success: false, error: 'El codigo es obligatorio' }, 400);
      }

      const room = db.getRoomByCode(trimmedCode);
      if (!room) {
        return c.json({ success: false, error: 'La sala no existe o expiró' }, 404);
      }

      const alreadyParticipant = room.participants?.some((p: any) => p.userId === currentUserId);
      if (!alreadyParticipant) {
        const added = db.addParticipantToRoom(room.id, currentUserId);
        if (!added) {
          return c.json({ success: false, error: 'No se pudo unir a la sala' }, 500);
        }
      }

      const updatedRoom = db.getRoomById(room.id);
      if (!updatedRoom) {
        return c.json({ success: false, error: 'Sala no encontrada' }, 404);
      }
      return c.json({ success: true, data: updatedRoom });
    } catch (error) {
      console.error('[Rooms] Error joining room:', error);
      return c.json({ success: false, error: 'Failed to join room' }, 500);
    }
  });

  // Obtener detalle de una sala (incluye mensajes)
  app.get('/api/rooms/:roomId', async (c) => {
    try {
      const currentUserId = getUserId(c);
      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const roomId = c.req.param('roomId');
      const room = db.getRoomById(roomId);

      if (!room) {
        return c.json({ success: false, error: 'Sala no encontrada' }, 404);
      }

      const isParticipant = room.participants?.some((p: any) => p.userId === currentUserId);
      if (!isParticipant) {
        return c.json({ success: false, error: 'No participas en esta sala' }, 403);
      }

      const messages = db.getRoomMessages(roomId);
      return c.json({ success: true, data: { room, messages } });
    } catch (error) {
      console.error('[Rooms] Error fetching room:', error);
      return c.json({ success: false, error: 'Failed to fetch room' }, 500);
    }
  });

  // Enviar mensaje de texto a una sala
  app.post('/api/rooms/:roomId/messages', async (c) => {
    try {
      const currentUserId = getUserId(c);
      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const roomId = c.req.param('roomId');
      const room = db.getRoomById(roomId);

      if (!room) {
        return c.json({ success: false, error: 'Sala no encontrada' }, 404);
      }

      const isParticipant = room.participants?.some((p: any) => p.userId === currentUserId);
      if (!isParticipant) {
        return c.json({ success: false, error: 'No participas en esta sala' }, 403);
      }

      const { content } = await c.req.json() as { content?: string };
      const sanitizedContent = (content ?? '')
        .trim()
        .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
        .substring(0, 10000);

      if (!sanitizedContent) {
        return c.json({ success: false, error: 'El mensaje no puede estar vacio' }, 400);
      }

      const message = {
        id: crypto.randomUUID(),
        roomId,
        senderId: currentUserId,
        content: sanitizedContent,
        timestamp: Date.now(),
        type: 'text' as const
      };

      db.addMessageToRoom(roomId, message);

      return c.json({ success: true, data: message });
    } catch (error) {
      console.error('[Rooms] Error sending room message:', error);
      return c.json({ success: false, error: 'Failed to send room message' }, 500);
    }
  });

  // Actualizar avatar de una sala
  app.put('/api/rooms/:roomId/avatar', async (c) => {
    try {
      const currentUserId = getUserId(c);
      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const roomId = c.req.param('roomId');
      const room = db.getRoomById(roomId);

      if (!room) {
        return c.json({ success: false, error: 'Sala no encontrada' }, 404);
      }

      const isParticipant = room.participants?.some((p: any) => p.userId === currentUserId);
      if (!isParticipant) {
        return c.json({ success: false, error: 'No participas en esta sala' }, 403);
      }

      const formData = await c.req.formData();
      const avatarFile = formData.get('avatar');

      if (!(avatarFile instanceof File)) {
        return c.json({ success: false, error: 'Archivo de avatar requerido' }, 400);
      }

      if (!ROOM_AVATAR_MIME_TYPES.includes(avatarFile.type as any)) {
        return c.json({ success: false, error: 'Formato de imagen no soportado (usa PNG, JPG o WEBP)' }, 400);
      }

      if (avatarFile.size === 0 || avatarFile.size > MAX_ROOM_AVATAR_SIZE) {
        return c.json({ success: false, error: 'La imagen debe pesar menos de 2MB' }, 400);
      }

      const arrayBuffer = await avatarFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      await FileStorageService.saveRoomAvatar(roomId, buffer, avatarFile.type);
      const avatarUrl = `/api/rooms/${roomId}/avatar?v=${Date.now()}`;
      db.updateRoomAvatar(roomId, avatarUrl);

      const updatedRoom = db.getRoomById(roomId);
      return c.json({ success: true, data: updatedRoom });
    } catch (error) {
      console.error('[Rooms] Error updating room avatar:', error);
      return c.json({ success: false, error: 'Failed to update room avatar' }, 500);
    }
  });

  // Obtener avatar de una sala
  app.get('/api/rooms/:roomId/avatar', async (c) => {
    try {
      const currentUserId = getUserId(c);
      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const roomId = c.req.param('roomId');
      const room = db.getRoomById(roomId);

      if (!room) {
        return c.json({ success: false, error: 'Sala no encontrada' }, 404);
      }

      const isParticipant = room.participants?.some((p: any) => p.userId === currentUserId);
      if (!isParticipant) {
        return c.json({ success: false, error: 'No participas en esta sala' }, 403);
      }

      const avatar = await FileStorageService.getRoomAvatar(roomId);
      if (!avatar) {
        return c.notFound();
      }

      c.header('Content-Type', avatar.mimeType);
      c.header('Cache-Control', 'public, max-age=604800');
      return c.body(avatar.buffer);
    } catch (error) {
      console.error('[Rooms] Error fetching room avatar:', error);
      return c.json({ success: false, error: 'Failed to fetch room avatar' }, 500);
    }
  });
}
