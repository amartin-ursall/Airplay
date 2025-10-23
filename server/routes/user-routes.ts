import { Hono } from 'hono';
import type { User, Conversation } from '../../shared/types';
import { db, InMemoryDB } from '../db/in-memory-db';

function getUserId(c: any): string | undefined {
  return c.req.header('X-User-Id');
}

async function updateUserPresence(userId: string) {
  db.updateUserLastSeen(userId, Date.now());
}

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

      // Verificar si el nombre ya existe (case-insensitive)
      const existingUser = db.getUserByName(trimmedName);
      if (existingUser) {
        console.log(`[Login] Username "${trimmedName}" already exists`);
        return c.json({
          success: false,
          error: 'Este nombre de usuario ya está en uso. Por favor, elige otro.'
        }, 409); // 409 Conflict
      }

      const userId = crypto.randomUUID();
      const user: User = {
        id: userId,
        name: trimmedName,
        online: true,
        lastSeen: Date.now()
      };

      db.createUser(user);
      await updateUserPresence(userId);

      console.log(`[Login] New user created: "${trimmedName}" (${userId})`);
      c.header('X-User-Id', userId);
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
        content: content.trim(),
        timestamp: Date.now(),
        type: 'text' as const
      };

      // Agregar a la conversación en memoria
      db.addMessageToConversation(conversationId, message);

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
}
