import { Hono } from 'hono';
import type { FileMetadata } from '../../shared/types';
import { db, InMemoryDB } from '../db/database';
import { FileStorageService } from '../services/file-storage';
import { MessageStorageService } from '../services/message-storage';
import { sanitizeFilename, isFilenameSafe } from '../utils/sanitization';
import { getWebSocketService } from '../services/websocket-service';

const CHUNK_SIZE = 512 * 1024; // 512KB - must match client chunk size

function getUserId(c: any): string | undefined {
  return c.req.header('X-User-Id');
}

function ensureRoomAccess(userId: string, roomId: string) {
  const room = db.getRoomById(roomId);
  if (!room) {
    return { error: { status: 404, message: 'Sala no encontrada o expirada' } } as const;
  }

  const isParticipant = room.participants?.some((p: any) => p.userId === userId);
  if (!isParticipant) {
    return { error: { status: 403, message: 'No participas en esta sala' } } as const;
  }

  return { room } as const;
}

export function fileRoutes(app: Hono) {
  // Iniciar subida de archivo (directo o sala)
  app.post('/api/files/initiate', async (c) => {
    try {
      const currentUserId = getUserId(c);

      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const { recipientId, roomId, file } = await c.req.json() as {
        recipientId?: string;
        roomId?: string;
        file: FileMetadata;
      };

      if (!file) {
        return c.json({ success: false, error: 'file metadata required' }, 400);
      }

      const hasRecipient = Boolean(recipientId);
      const hasRoom = Boolean(roomId);

      if ((hasRecipient && hasRoom) || (!hasRecipient && !hasRoom)) {
        return c.json({ success: false, error: 'Provide either recipientId or roomId' }, 400);
      }

      if (hasRoom) {
        const result = ensureRoomAccess(currentUserId, roomId!);
        if ('error' in result) {
          return c.json({ success: false, error: result.error.message }, result.error.status);
        }
      }

      if (!file.name || !isFilenameSafe(file.name)) {
        console.warn(`[Backend] Unsafe filename detected: ${file.name}`);
        return c.json({ success: false, error: 'Invalid filename' }, 400);
      }

      const sanitizedFile = {
        ...file,
        name: sanitizeFilename(file.name)
      };

      const fileId = crypto.randomUUID();
      const totalChunks = Math.ceil(sanitizedFile.size / CHUNK_SIZE);

      db.initiateFileUpload(fileId, sanitizedFile, totalChunks);

      console.log(`[Backend] File upload initiated: ${fileId}, ${totalChunks} chunks, name: ${sanitizedFile.name}`);
      return c.json({ success: true, data: { fileId } });
    } catch (error) {
      console.error('[FileInit] Error:', error);
      return c.json({ success: false, error: 'Failed to initiate file upload' }, 500);
    }
  });

  // Subir chunks (directo o sala)
  app.post('/api/files/upload/:fileId/:chunkIndex', async (c) => {
    const startTime = Date.now();
    try {
      const currentUserId = getUserId(c);

      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const { fileId, chunkIndex } = c.req.param();
      const recipientId = c.req.header('X-Recipient-Id');
      const roomId = c.req.header('X-Room-Id');

      const hasRecipient = Boolean(recipientId);
      const hasRoom = Boolean(roomId);

      if ((hasRecipient && hasRoom) || (!hasRecipient && !hasRoom)) {
        return c.json({ success: false, error: 'Provide either X-Recipient-Id or X-Room-Id header' }, 400);
      }

      let roomContext: { id: string; code: string } | null = null;
      if (hasRoom) {
        const result = ensureRoomAccess(currentUserId, roomId!);
        if ('error' in result) {
          return c.json({ success: false, error: result.error.message }, result.error.status);
        }
        roomContext = { id: result.room.id, code: result.room.code };
      }

      const index = parseInt(chunkIndex, 10);

      const chunkData = await Promise.race([
        c.req.arrayBuffer(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request body read timeout')), 100000)
        )
      ]);

      const upload = db.getFileUpload(fileId);
      const totalChunks = upload?.totalChunks || 0;
      const progress = totalChunks > 0 ? Math.round(((index + 1) / totalChunks) * 100) : 0;

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      if (index % 10 === 0) {
        console.log(`[Backend] 🔁 Chunk ${index + 1}/${totalChunks} (${progress}%) - ${chunkData.byteLength} bytes in ${duration}s`);
      }

      const isComplete = db.addFileChunk(fileId, index, chunkData);

      if (isComplete) {
        console.log(`[Backend] ✅ File upload 100% complete for fileId: ${fileId}`);
        const fileMeta = db.getFileMetadata(fileId);
        const completeFile = db.getCompleteFile(fileId);

        if (fileMeta && completeFile) {
          const fileSizeMB = (fileMeta.size / (1024 * 1024)).toFixed(2);
          console.log(`[Backend] Processing complete file: ${fileMeta.name} (${fileSizeMB} MB)`);

          const sender = db.getUser(currentUserId);
          if (!sender) {
            return c.json({ success: false, error: 'Sender not found' }, 404);
          }

          if (hasRecipient) {
            const recipient = db.getUser(recipientId!);
            if (!recipient) {
              return c.json({ success: false, error: 'Recipient not found' }, 404);
            }

            const savedFileName = await FileStorageService.saveFile(
              sender.name,
              recipient.name,
              sender.name,
              recipient.name,
              completeFile,
              fileMeta
            );

            const conversationId = InMemoryDB.getConversationId(currentUserId, recipientId!);
            let conversation = db.getConversation(conversationId);
            if (!conversation) {
              conversation = {
                id: conversationId,
                participants: [currentUserId, recipientId!],
                messages: []
              };
              db.createConversation(conversation);
            }

            const message = {
              id: crypto.randomUUID(),
              conversationId,
              senderId: currentUserId,
              content: savedFileName,
              timestamp: Date.now(),
              type: 'file' as const,
              file: fileMeta
            };

            db.addMessageToConversation(conversationId, message);

            const wsService = getWebSocketService();
            if (wsService) {
              wsService.notifyNewMessage(message, currentUserId);
            }

            await MessageStorageService.saveMessage(
              sender.name,
              recipient.name,
              message,
              sender.name
            );

            console.log('[Backend] Message added to conversation:', message.id);
            db.deleteFileUpload(fileId);
          } else if (roomContext) {
            const savedFileName = await FileStorageService.saveRoomFile(
              roomContext.id,
              roomContext.code,
              sender.name,
              completeFile,
              fileMeta
            );

            const message = {
              id: crypto.randomUUID(),
              roomId: roomContext.id,
              senderId: currentUserId,
              content: savedFileName,
              timestamp: Date.now(),
              type: 'file' as const,
              file: fileMeta
            };

            db.addMessageToRoom(roomContext.id, message);
            console.log('[Backend] File added to temp room:', message.id);
            // Future: notify via WebSocket when clients soportan salas
            db.deleteFileUpload(fileId);
          }
        }
      }

      return c.json({ success: true, data: { success: true, isComplete } });
    } catch (error) {
      console.error('[FileUpload] Error:', error);
      return c.json({ success: false, error: 'Failed to upload chunk' }, 500);
    }
  });

  // Descargar archivo (directo o sala)
  app.get('/api/files/:fileId', async (c) => {
    try {
      const currentUserId = getUserId(c);

      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const { fileId } = c.req.param();
      const otherUserId = c.req.query('otherUserId');
      const roomId = c.req.query('roomId');

      const hasRecipient = Boolean(otherUserId);
      const hasRoom = Boolean(roomId);

      if ((hasRecipient && hasRoom) || (!hasRecipient && !hasRoom)) {
        return c.json({ success: false, error: 'Provide either otherUserId or roomId' }, 400);
      }

      if (!isFilenameSafe(fileId)) {
        console.warn(`[Backend] Unsafe filename in download request: ${fileId}`);
        return c.json({ success: false, error: 'Invalid filename' }, 400);
      }

      let fileData: Buffer | null = null;

      if (hasRecipient) {
        console.log(`[Backend] Download request for fileId: ${fileId} by user: ${currentUserId}`);

        const currentUser = db.getUser(currentUserId);
        const otherUser = db.getUser(otherUserId!);

        if (!currentUser || !otherUser) {
          return c.json({ success: false, error: 'Users not found' }, 404);
        }

        fileData = await FileStorageService.getFile(
          currentUser.name,
          otherUser.name,
          fileId
        );
      } else if (roomId) {
        const result = ensureRoomAccess(currentUserId, roomId);
        if ('error' in result) {
          return c.json({ success: false, error: result.error.message }, result.error.status);
        }
        fileData = await FileStorageService.getRoomFile(roomId, fileId);
      }

      if (!fileData) {
        console.error(`[Backend] File not found: ${fileId}`);
        return c.notFound();
      }

      const ext = fileId.split('.').pop()?.toLowerCase() || '';
      const mimeTypes: Record<string, string> = {
        pdf: 'application/pdf',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        bmp: 'image/bmp',
        svg: 'image/svg+xml',
        txt: 'text/plain',
        doc: 'application/msword',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xls: 'application/vnd.ms-excel',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        zip: 'application/zip',
        mp4: 'video/mp4',
        mp3: 'audio/mpeg'
      };

      const contentType = mimeTypes[ext] || 'application/octet-stream';

      c.header('Content-Type', contentType);
      c.header('Content-Disposition', `attachment; filename="${fileId}"`);
      c.header('Content-Length', fileData.length.toString());

      return c.body(fileData);
    } catch (error) {
      console.error('[FileDownload] Error:', error);
      return c.json({ success: false, error: 'Failed to download file' }, 500);
    }
  });

  // Listar archivos de una conversacion directa
  app.get('/api/files/list/:userId', async (c) => {
    try {
      const currentUserId = getUserId(c);

      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const otherUserId = c.req.param('userId');

      const currentUser = db.getUser(currentUserId);
      const otherUser = db.getUser(otherUserId);

      if (!currentUser || !otherUser) {
        return c.json({ success: false, error: 'Users not found' }, 404);
      }

      const files = await FileStorageService.listFiles(currentUser.name, otherUser.name);

      return c.json({ success: true, data: files });
    } catch (error) {
      console.error('[FileList] Error:', error);
      return c.json({ success: false, error: 'Failed to list files' }, 500);
    }
  });

  // Buscar archivos en una conversación o sala
  app.get('/api/files/search', async (c) => {
    try {
      const currentUserId = getUserId(c);

      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const otherUserId = c.req.query('otherUserId');
      const roomId = c.req.query('roomId');
      const query = c.req.query('query')?.toLowerCase() || '';
      const fileType = c.req.query('type');

      const hasRecipient = Boolean(otherUserId);
      const hasRoom = Boolean(roomId);

      if ((hasRecipient && hasRoom) || (!hasRecipient && !hasRoom)) {
        return c.json({ success: false, error: 'Provide either otherUserId or roomId' }, 400);
      }

      let messages: any[] = [];

      if (hasRecipient) {
        const conversationId = InMemoryDB.getConversationId(currentUserId, otherUserId!);
        const conversation = db.getConversation(conversationId);
        messages = conversation?.messages || [];
      } else if (roomId) {
        const result = ensureRoomAccess(currentUserId, roomId);
        if ('error' in result) {
          return c.json({ success: false, error: result.error.message }, result.error.status);
        }
        messages = db.getRoomMessages(roomId);
      }

      // Filter only file messages
      let fileMessages = messages.filter(msg => msg.type === 'file' && msg.file);

      // Apply search query filter
      if (query) {
        fileMessages = fileMessages.filter(msg =>
          msg.file?.name.toLowerCase().includes(query)
        );
      }

      // Apply file type filter
      if (fileType) {
        fileMessages = fileMessages.filter(msg => {
          const ext = msg.file?.name.toLowerCase().substring(msg.file.name.lastIndexOf('.'));
          const mimeType = msg.file?.type;

          switch (fileType) {
            case 'images':
              return mimeType?.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'].includes(ext || '');
            case 'videos':
              return mimeType?.startsWith('video/') || ['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext || '');
            case 'audio':
              return mimeType?.startsWith('audio/') || ['.mp3', '.wav', '.ogg', '.m4a'].includes(ext || '');
            case 'documents':
              return ['.pdf', '.doc', '.docx', '.txt', '.md', '.xls', '.xlsx', '.ppt', '.pptx'].includes(ext || '');
            case 'archives':
              return ['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext || '');
            default:
              return true;
          }
        });
      }

      // Sort by timestamp (newest first)
      fileMessages.sort((a, b) => b.timestamp - a.timestamp);

      return c.json({ success: true, data: fileMessages });
    } catch (error) {
      console.error('[FileSearch] Error:', error);
      return c.json({ success: false, error: 'Failed to search files' }, 500);
    }
  });
}
