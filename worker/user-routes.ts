import { Hono, Context } from "hono";
import type { Env } from './core-utils';
import { UserEntity, ConversationEntity } from "./entities";
import { ok, bad } from './core-utils';
import type { User, Message, FileMetadata } from "@shared/types";


function getUserId(c: Context<{ Bindings: Env }>): string | undefined {
  return c.req.header('X-User-Id');
}
async function updateUserPresence(env: Env, userId: string) {
  const userEntity = new UserEntity(env, userId);
  if (await userEntity.exists()) {
    await userEntity.setLastSeen(Date.now());
  }
}

export function userRoutes(app: Hono<{ Bindings: Env }>) {
  app.use('/api/*', async (c, next) => {
    const userId = getUserId(c);
    if (userId) {
      await updateUserPresence(c.env, userId);
    }
    await next();
  });
  app.post('/api/users/login', async (c) => {
    const { name } = (await c.req.json()) as { name?: string };
    if (!name || typeof name !== 'string' || !name.trim()) return bad(c, 'name required');
    const userId = crypto.randomUUID();
    const user: User = { id: userId, name: name.trim(), online: true };
    await UserEntity.create(c.env, user);
    await updateUserPresence(c.env, userId);
    c.header('X-User-Id', userId);
    return ok(c, user);
  });
  app.get('/api/users', async (c) => {
    const allUsers = await UserEntity.list(c.env);
    const now = Date.now();
    const usersWithStatus = allUsers.items.map(user => {
      const isOnline = user.lastSeen ? (now - user.lastSeen < 30000) : false;
      return { ...user, online: isOnline };
    });
    return ok(c, usersWithStatus);
  });
  app.get('/api/conversations/:userId', async (c) => {
    const currentUserId = getUserId(c);
    const otherUserId = c.req.param('userId');
    if (!currentUserId) return bad(c, 'Unauthorized: Missing X-User-Id header');
    const conversationId = ConversationEntity.getConversationId(currentUserId, otherUserId);
    const conversationEntity = new ConversationEntity(c.env, conversationId);
    if (!(await conversationEntity.exists())) {
      const initialState = {
        id: conversationId,
        participants: [currentUserId, otherUserId],
        messages: [],
      };
      await conversationEntity.save(initialState);
      return ok(c, initialState);
    }
    return ok(c, await conversationEntity.getState());
  });
  app.post('/api/messages', async (c) => {
    const currentUserId = getUserId(c);
    if (!currentUserId) return bad(c, 'Unauthorized: Missing X-User-Id header');
    const { recipientId, content, type, file } = (await c.req.json()) as {
      recipientId?: string; content?: string; type?: 'text' | 'file'; file?: FileMetadata;
    };
    if (!recipientId || !content || !type) return bad(c, 'recipientId, content, and type required');
    const conversationId = ConversationEntity.getConversationId(currentUserId, recipientId);
    const conversationEntity = new ConversationEntity(c.env, conversationId);
    if (!(await conversationEntity.exists())) {
      await conversationEntity.save({ id: conversationId, participants: [currentUserId, recipientId], messages: [] });
    }
    const message = await conversationEntity.addMessage(currentUserId, content, type, file);
    return ok(c, message);
  });
  // FILE TRANSFER ROUTES
  app.post('/api/files/initiate', async (c) => {
    const currentUserId = getUserId(c);
    if (!currentUserId) return bad(c, 'Unauthorized: Missing X-User-Id header');
    const { recipientId, file } = (await c.req.json()) as { recipientId: string; file: FileMetadata };
    if (!recipientId || !file) return bad(c, 'recipientId and file metadata required');
    const fileId = crypto.randomUUID();
    const conversationId = ConversationEntity.getConversationId(currentUserId, recipientId);
    const conversationEntity = new ConversationEntity(c.env, conversationId);
    await conversationEntity.initiateFileUpload(fileId, file);
    return ok(c, { fileId });
  });
  app.post('/api/files/upload/:fileId/:chunkIndex', async (c) => {
    const currentUserId = getUserId(c);
    if (!currentUserId) return bad(c, 'Unauthorized: Missing X-User-Id header');
    const { fileId, chunkIndex } = c.req.param();
    const index = parseInt(chunkIndex, 10);
    const chunkData = await c.req.arrayBuffer();
    const { recipientId } = (await c.req.json()) as { recipientId: string };
    if (!recipientId) return bad(c, 'recipientId required');
    const conversationId = ConversationEntity.getConversationId(currentUserId, recipientId);
    const conversationEntity = new ConversationEntity(c.env, conversationId);
    const isComplete = await conversationEntity.uploadFileChunk(fileId, index, chunkData);
    if (isComplete) {
      const fileMeta = await conversationEntity.getFileMetadata(fileId);
      if (fileMeta) {
        await conversationEntity.addMessage(currentUserId, fileId, 'file', fileMeta);
      }
    }
    return ok(c, { success: true });
  });
  app.get('/api/files/:fileId', async (c) => {
    const currentUserId = getUserId(c);
    if (!currentUserId) return bad(c, 'Unauthorized: Missing X-User-Id header');
    const { fileId } = c.req.param();
    const { otherUserId } = c.req.query();
    if (!otherUserId) return bad(c, 'otherUserId query parameter required');
    const conversationId = ConversationEntity.getConversationId(currentUserId, otherUserId);
    const conversationEntity = new ConversationEntity(c.env, conversationId);
    const file = await conversationEntity.getCompletedFile(fileId);
    if (!file) return c.notFound();
    c.header('Content-Type', file.meta.type);
    c.header('Content-Disposition', `attachment; filename="${file.meta.name}"`);
    return c.body(file.stream);
  });
}