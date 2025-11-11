/**
 * Rutas de API para salas temporales
 */

import { Hono } from 'hono';
import { db } from '../db/database';
import { sanitizeUsername } from '../utils/sanitization';
import { getWebSocketService } from '../services/websocket-service';
import { v4 as uuidv4 } from 'uuid';

export function roomRoutes(app: Hono) {
  /**
   * POST /api/rooms/create
   * Crea una nueva sala temporal
   */
  app.post('/api/rooms/create', async (c) => {
    try {
      const { userId, roomName, isPermanent, description, avatarUrl } = await c.req.json();

      if (!userId || !roomName) {
        return c.json({ success: false, error: 'userId and roomName are required' }, 400);
      }

      // Verificar que el usuario existe
      const user = db.getUser(userId);
      if (!user) {
        return c.json({ success: false, error: 'User not found' }, 404);
      }

      // Sanitizar nombre de la sala
      const sanitizedRoomName = sanitizeUsername(roomName);
      const sanitizedDescription = description ? description.trim().substring(0, 500) : undefined;

      // Crear sala
      const roomId = uuidv4();
      const { id, code } = db.createRoom(roomId, sanitizedRoomName, userId, {
        isPermanent: Boolean(isPermanent),
        description: sanitizedDescription,
        avatarUrl: avatarUrl || undefined
      });

      // Obtener sala completa
      const room = db.getRoomById(id);

      // Notificar por WebSocket
      const wsService = getWebSocketService();
      if (wsService) {
        wsService.broadcastToAll({
          type: 'room:created',
          payload: { room },
          timestamp: Date.now()
        });
      }

      console.log(`[Rooms] Sala creada: ${sanitizedRoomName} (${code})`);

      return c.json({
        success: true,
        data: {
          id: room.id,
          code: room.code,
          name: room.name,
          createdBy: room.createdBy,
          createdAt: room.createdAt,
          expiresAt: room.expiresAt,
          participants: room.participants
        }
      });
    } catch (error) {
      console.error('[Rooms] Error al crear sala:', error);
      return c.json({ success: false, error: 'Failed to create room' }, 500);
    }
  });

  /**
   * POST /api/rooms/join
   * Unirse a una sala por código
   */
  app.post('/api/rooms/join', async (c) => {
    try {
      const { userId, code } = await c.req.json();

      if (!userId || !code) {
        return c.json({ success: false, error: 'userId and code are required' }, 400);
      }

      // Verificar que el usuario existe
      const user = db.getUser(userId);
      if (!user) {
        return c.json({ success: false, error: 'User not found' }, 404);
      }

      // Buscar sala por código
      const room = db.getRoomByCode(code.trim());
      if (!room) {
        return c.json({ success: false, error: 'Room not found or expired' }, 404);
      }

      // Verificar si el usuario ya está en la sala
      const isAlreadyParticipant = room.participants.some((p: any) => p.userId === userId);
      if (isAlreadyParticipant) {
        return c.json({
          success: true,
          data: {
            id: room.id,
            code: room.code,
            name: room.name,
            createdBy: room.createdBy,
            createdAt: room.createdAt,
            expiresAt: room.expiresAt,
            participants: room.participants
          },
          message: 'Already in room'
        });
      }

      // Agregar usuario a la sala
      const success = db.addParticipantToRoom(room.id, userId);
      if (!success) {
        return c.json({ success: false, error: 'Failed to join room' }, 500);
      }

      // Obtener sala actualizada
      const updatedRoom = db.getRoomById(room.id);

      // Notificar por WebSocket a todos los participantes
      const wsService = getWebSocketService();
      if (wsService) {
        // Notificar a los participantes existentes
        for (const participant of room.participants) {
          wsService.sendToClient(participant.userId, {
            type: 'room:participant:joined',
            payload: {
              roomId: room.id,
              user: {
                id: user.id,
                name: user.name
              }
            },
            timestamp: Date.now()
          });
        }
      }

      console.log(`[Rooms] Usuario ${user.name} unido a sala ${room.name}`);

      return c.json({
        success: true,
        data: {
          id: updatedRoom.id,
          code: updatedRoom.code,
          name: updatedRoom.name,
          createdBy: updatedRoom.createdBy,
          createdAt: updatedRoom.createdAt,
          expiresAt: updatedRoom.expiresAt,
          participants: updatedRoom.participants
        }
      });
    } catch (error) {
      console.error('[Rooms] Error al unirse a sala:', error);
      return c.json({ success: false, error: 'Failed to join room' }, 500);
    }
  });

  /**
   * GET /api/rooms/:roomId
   * Obtiene información de una sala
   */
  app.get('/api/rooms/:roomId', async (c) => {
    try {
      const roomId = c.req.param('roomId');
      const userId = c.req.query('userId');

      if (!userId) {
        return c.json({ success: false, error: 'userId is required' }, 400);
      }

      const room = db.getRoomById(roomId);
      if (!room) {
        return c.json({ success: false, error: 'Room not found or expired' }, 404);
      }

      // Verificar que el usuario es participante
      const isParticipant = room.participants.some((p: any) => p.userId === userId);
      if (!isParticipant) {
        return c.json({ success: false, error: 'Not a participant of this room' }, 403);
      }

      // Obtener mensajes
      const messages = db.getRoomMessages(roomId);

      // Obtener información de los usuarios participantes
      const participantsInfo = room.participants.map((p: any) => {
        const user = db.getUser(p.userId);
        return {
          userId: p.userId,
          userName: user?.name || 'Unknown',
          joinedAt: p.joinedAt,
          online: user?.online || false
        };
      });

      return c.json({
        success: true,
        data: {
          room: {
            id: room.id,
            code: room.code,
            name: room.name,
            createdBy: room.createdBy,
            createdAt: room.createdAt,
            expiresAt: room.expiresAt,
            participants: participantsInfo
          },
          messages
        }
      });
    } catch (error) {
      console.error('[Rooms] Error al obtener sala:', error);
      return c.json({ success: false, error: 'Failed to get room' }, 500);
    }
  });

  /**
   * POST /api/rooms/:roomId/messages
   * Envía un mensaje a una sala
   */
  app.post('/api/rooms/:roomId/messages', async (c) => {
    try {
      const roomId = c.req.param('roomId');
      const { userId, content } = await c.req.json();

      if (!userId || !content) {
        return c.json({ success: false, error: 'userId and content are required' }, 400);
      }

      const room = db.getRoomById(roomId);
      if (!room) {
        return c.json({ success: false, error: 'Room not found or expired' }, 404);
      }

      // Verificar que el usuario es participante
      const isParticipant = room.participants.some((p: any) => p.userId === userId);
      if (!isParticipant) {
        return c.json({ success: false, error: 'Not a participant of this room' }, 403);
      }

      // Sanitizar contenido
      const sanitizedContent = content
        .trim()
        .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
        .substring(0, 10000);

      // Crear mensaje
      const message = {
        id: uuidv4(),
        roomId,
        senderId: userId,
        content: sanitizedContent,
        timestamp: Date.now(),
        type: 'text' as const
      };

      db.addMessageToRoom(roomId, message);

      // Notificar por WebSocket a todos los participantes excepto el emisor
      const wsService = getWebSocketService();
      if (wsService) {
        for (const participant of room.participants) {
          if (participant.userId !== userId) {
            wsService.sendToClient(participant.userId, {
              type: 'room:message:new',
              payload: { roomId, message },
              timestamp: Date.now()
            });
          }
        }
      }

      return c.json({ success: true, data: message });
    } catch (error) {
      console.error('[Rooms] Error al enviar mensaje:', error);
      return c.json({ success: false, error: 'Failed to send message' }, 500);
    }
  });

  /**
   * POST /api/rooms/:roomId/leave
   * Salir de una sala
   */
  app.post('/api/rooms/:roomId/leave', async (c) => {
    try {
      const roomId = c.req.param('roomId');
      const { userId } = await c.req.json();

      if (!userId) {
        return c.json({ success: false, error: 'userId is required' }, 400);
      }

      const room = db.getRoomById(roomId);
      if (!room) {
        return c.json({ success: false, error: 'Room not found or expired' }, 404);
      }

      // Remover participante
      db.removeParticipantFromRoom(roomId, userId);

      // Notificar por WebSocket
      const wsService = getWebSocketService();
      const user = db.getUser(userId);
      if (wsService && user) {
        for (const participant of room.participants) {
          if (participant.userId !== userId) {
            wsService.sendToClient(participant.userId, {
              type: 'room:participant:left',
              payload: {
                roomId,
                user: {
                  id: user.id,
                  name: user.name
                }
              },
              timestamp: Date.now()
            });
          }
        }
      }

      // Si era el creador y no quedan participantes, eliminar la sala
      const updatedRoom = db.getRoomById(roomId);
      if (updatedRoom && updatedRoom.participants.length === 0) {
        db.deleteRoom(roomId);
        console.log(`[Rooms] Sala ${room.name} eliminada (sin participantes)`);
      }

      return c.json({ success: true, data: { success: true } });
    } catch (error) {
      console.error('[Rooms] Error al salir de sala:', error);
      return c.json({ success: false, error: 'Failed to leave room' }, 500);
    }
  });

  /**
   * GET /api/rooms
   * Obtiene las salas del usuario
   */
  app.get('/api/rooms', async (c) => {
    try {
      const userId = c.req.query('userId');

      if (!userId) {
        return c.json({ success: false, error: 'userId is required' }, 400);
      }

      const rooms = db.getUserRooms(userId);

      // Agregar información adicional de cada sala
      const roomsWithDetails = rooms.map(room => {
        const participants = db.getRoomById(room.id)?.participants || [];
        const participantCount = participants.length;

        return {
          id: room.id,
          code: room.code,
          name: room.name,
          createdBy: room.createdBy,
          createdAt: room.createdAt,
          expiresAt: room.expiresAt,
          participantCount
        };
      });

      return c.json({ success: true, data: roomsWithDetails });
    } catch (error) {
      console.error('[Rooms] Error al obtener salas:', error);
      return c.json({ success: false, error: 'Failed to get rooms' }, 500);
    }
  });
}
