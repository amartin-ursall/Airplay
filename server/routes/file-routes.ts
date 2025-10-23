import { Hono } from 'hono';
import type { FileMetadata } from '../../shared/types';
import { db, InMemoryDB } from '../db/in-memory-db';
import { FileStorageService } from '../services/file-storage';
import { MessageStorageService } from '../services/message-storage';

const CHUNK_SIZE = 512 * 1024; // 512KB - must match client chunk size

function getUserId(c: any): string | undefined {
  return c.req.header('X-User-Id');
}

export function fileRoutes(app: Hono) {
  // Iniciar subida de archivo
  app.post('/api/files/initiate', async (c) => {
    try {
      const currentUserId = getUserId(c);

      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const { recipientId, file } = await c.req.json() as {
        recipientId: string;
        file: FileMetadata;
      };

      if (!recipientId || !file) {
        return c.json({ success: false, error: 'recipientId and file metadata required' }, 400);
      }

      const fileId = crypto.randomUUID();
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      db.initiateFileUpload(fileId, file, totalChunks);

      console.log(`[Backend] File upload initiated: ${fileId}, ${totalChunks} chunks`);
      return c.json({ success: true, data: { fileId } });
    } catch (error) {
      console.error('[FileInit] Error:', error);
      return c.json({ success: false, error: 'Failed to initiate file upload' }, 500);
    }
  });

  // Subir un chunk de archivo
  app.post('/api/files/upload/:fileId/:chunkIndex', async (c) => {
    const startTime = Date.now();
    try {
      const currentUserId = getUserId(c);

      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const { fileId, chunkIndex } = c.req.param();
      const recipientId = c.req.header('X-Recipient-Id');

      if (!recipientId) {
        return c.json({ success: false, error: 'X-Recipient-Id header required' }, 400);
      }

      const index = parseInt(chunkIndex, 10);

      // Add timeout protection for reading request body
      const chunkData = await Promise.race([
        c.req.arrayBuffer(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request body read timeout')), 100000) // 100s timeout
        )
      ]);

      const upload = db.getFileUpload(fileId);
      const totalChunks = upload?.totalChunks || 0;
      const progress = totalChunks > 0 ? Math.round(((index + 1) / totalChunks) * 100) : 0;

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      if (index % 10 === 0) {
        console.log(`[Backend] ✓ Chunk ${index + 1}/${totalChunks} (${progress}%) - ${chunkData.byteLength} bytes in ${duration}s`);
      }

      const isComplete = db.addFileChunk(fileId, index, chunkData);

      if (isComplete) {
        console.log(`[Backend] ✓ File upload 100% complete for fileId: ${fileId}`);
      }

      if (isComplete) {
        const fileMeta = db.getFileMetadata(fileId);
        const completeFile = db.getCompleteFile(fileId);

        if (fileMeta && completeFile) {
          const fileSizeMB = (fileMeta.size / (1024 * 1024)).toFixed(2);
          console.log(`[Backend] Processing complete file: ${fileMeta.name} (${fileSizeMB} MB)`);

          // Obtener nombres de usuarios
          const sender = db.getUser(currentUserId);
          const recipient = db.getUser(recipientId);

          if (sender && recipient) {
            // Guardar archivo en sistema de archivos
            console.log(`[Backend] Saving file to disk...`);
            const savedFileName = await FileStorageService.saveFile(
              sender.name,
              recipient.name,
              sender.name,
              recipient.name,
              completeFile,
              fileMeta
            );

            console.log(`[Backend] ✓ File saved to FTP: ${savedFileName}`);

            // Crear mensaje en la conversación
            const conversationId = InMemoryDB.getConversationId(currentUserId, recipientId);

            let conversation = db.getConversation(conversationId);
            if (!conversation) {
              conversation = {
                id: conversationId,
                participants: [currentUserId, recipientId],
                messages: []
              };
              db.createConversation(conversation);
            }

            const message = {
              id: crypto.randomUUID(),
              conversationId,
              senderId: currentUserId,
              content: savedFileName, // Guardar el nombre del archivo guardado
              timestamp: Date.now(),
              type: 'file' as const,
              file: fileMeta
            };

            db.addMessageToConversation(conversationId, message);

            // Persistir mensaje en archivo .txt
            await MessageStorageService.saveMessage(
              sender.name,
              recipient.name,
              message,
              sender.name
            );

            console.log('[Backend] Message added to conversation:', message);

            // Limpiar datos temporales
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

  // Descargar archivo
  app.get('/api/files/:fileId', async (c) => {
    try {
      const currentUserId = getUserId(c);

      if (!currentUserId) {
        return c.json({ success: false, error: 'Unauthorized: Missing X-User-Id header' }, 401);
      }

      const { fileId } = c.req.param();
      const otherUserId = c.req.query('otherUserId');

      if (!otherUserId) {
        return c.json({ success: false, error: 'otherUserId query parameter required' }, 400);
      }

      console.log(`[Backend] Download request for fileId: ${fileId} by user: ${currentUserId}`);

      // Obtener nombres de usuarios
      const currentUser = db.getUser(currentUserId);
      const otherUser = db.getUser(otherUserId);

      if (!currentUser || !otherUser) {
        return c.json({ success: false, error: 'Users not found' }, 404);
      }

      // El fileId es el nombre del archivo guardado
      const fileData = await FileStorageService.getFile(
        currentUser.name,
        otherUser.name,
        fileId
      );

      if (!fileData) {
        console.error(`[Backend] File not found: ${fileId}`);
        return c.notFound();
      }

      // Obtener el tipo de archivo de la extensión
      const ext = fileId.split('.').pop()?.toLowerCase() || '';
      const mimeTypes: Record<string, string> = {
        'pdf': 'application/pdf',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'txt': 'text/plain',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'zip': 'application/zip',
        'mp4': 'video/mp4',
        'mp3': 'audio/mpeg'
      };

      const contentType = mimeTypes[ext] || 'application/octet-stream';

      console.log(`[Backend] Sending file: ${fileId}, type: ${contentType}, size: ${fileData.length}`);

      c.header('Content-Type', contentType);
      c.header('Content-Disposition', `attachment; filename="${fileId}"`);
      c.header('Content-Length', fileData.length.toString());

      return c.body(fileData);
    } catch (error) {
      console.error('[FileDownload] Error:', error);
      return c.json({ success: false, error: 'Failed to download file' }, 500);
    }
  });

  // Listar archivos de una conversación
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
}
