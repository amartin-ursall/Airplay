/**
 * Servicio de base de datos SQLite para Airplay
 * Proporciona persistencia de datos para usuarios, conversaciones y mensajes
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';
import type { User, Conversation, Message, FileMetadata } from '../../shared/types';

// Ubicación de la base de datos
const DB_DIR = path.join(homedir(), 'Documents', 'Airplay');
const DB_PATH = path.join(DB_DIR, 'airplay.db');

export class SQLiteDatabase {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    // Crear el directorio si no existe
    if (!existsSync(DB_DIR)) {
      mkdirSync(DB_DIR, { recursive: true });
    }

    // Abrir/crear la base de datos
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging para mejor rendimiento

    console.log(`[SQLite] Base de datos inicializada en: ${dbPath}`);

    // Crear tablas si no existen
    this.initializeTables();
  }

  /**
   * Inicializa las tablas de la base de datos
   */
  private initializeTables(): void {
    // Tabla de usuarios
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        online INTEGER DEFAULT 1,
        last_seen INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Tabla de conversaciones
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Tabla de participantes de conversaciones
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_participants (
        conversation_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        PRIMARY KEY (conversation_id, user_id),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Tabla de mensajes
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('text', 'file')),
        file_name TEXT,
        file_size INTEGER,
        file_type TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Tabla de uploads de archivos en progreso (temporal)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_uploads (
        file_id TEXT PRIMARY KEY,
        metadata TEXT NOT NULL,
        total_chunks INTEGER NOT NULL,
        received_chunks INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      )
    `);

    // Tabla de chunks de archivos
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS file_chunks (
        file_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        chunk_data BLOB NOT NULL,
        PRIMARY KEY (file_id, chunk_index),
        FOREIGN KEY (file_id) REFERENCES file_uploads(file_id) ON DELETE CASCADE
      )
    `);

    // Tabla de salas temporales
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        avatar_url TEXT,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        expires_at INTEGER,
        is_permanent INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Tabla de participantes de salas
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS room_participants (
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        PRIMARY KEY (room_id, user_id),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Tabla de mensajes de sala
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS room_messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('text', 'file')),
        file_name TEXT,
        file_size INTEGER,
        file_type TEXT,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Índices para mejorar el rendimiento
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversation
      ON messages(conversation_id, timestamp);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_name
      ON users(name COLLATE NOCASE);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_users_last_seen
      ON users(last_seen);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_rooms_code
      ON rooms(code);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_rooms_expires_at
      ON rooms(expires_at);
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_room_messages_room
      ON room_messages(room_id, timestamp);
    `);

    console.log('[SQLite] Tablas inicializadas correctamente');
  }

  // ==================== USUARIOS ====================

  /**
   * Crea un nuevo usuario
   */
  createUser(user: User): void {
    const stmt = this.db.prepare(`
      INSERT INTO users (id, name, online, last_seen)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(user.id, user.name, user.online ? 1 : 0, user.lastSeen || Date.now());
    console.log(`[SQLite] Usuario creado: ${user.name} (${user.id})`);
  }

  /**
   * Obtiene un usuario por ID
   */
  getUser(userId: string): User | undefined {
    const stmt = this.db.prepare(`
      SELECT id, name, online, last_seen as lastSeen
      FROM users WHERE id = ?
    `);

    const row = stmt.get(userId) as any;
    if (!row) return undefined;

    return {
      id: row.id,
      name: row.name,
      online: Boolean(row.online),
      lastSeen: row.lastSeen
    };
  }

  /**
   * Obtiene un usuario por nombre (case-insensitive)
   */
  getUserByName(name: string): User | undefined {
    const stmt = this.db.prepare(`
      SELECT id, name, online, last_seen as lastSeen
      FROM users WHERE name = ? COLLATE NOCASE
    `);

    const row = stmt.get(name) as any;
    if (!row) return undefined;

    return {
      id: row.id,
      name: row.name,
      online: Boolean(row.online),
      lastSeen: row.lastSeen
    };
  }

  /**
   * Obtiene todos los usuarios
   */
  getAllUsers(): User[] {
    const stmt = this.db.prepare(`
      SELECT id, name, online, last_seen as lastSeen
      FROM users
      ORDER BY name
    `);

    const rows = stmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      online: Boolean(row.online),
      lastSeen: row.lastSeen
    }));
  }

  /**
   * Actualiza el último momento visto de un usuario
   */
  updateUserLastSeen(userId: string, lastSeen: number): void {
    const stmt = this.db.prepare(`
      UPDATE users SET last_seen = ?, online = 1 WHERE id = ?
    `);

    stmt.run(lastSeen, userId);
  }

  /**
   * Actualiza el estado online de un usuario
   */
  updateUserOnlineStatus(userId: string, online: boolean): void {
    const stmt = this.db.prepare(`
      UPDATE users SET online = ? WHERE id = ?
    `);

    stmt.run(online ? 1 : 0, userId);
  }

  // ==================== CONVERSACIONES ====================

  /**
   * Genera el ID de conversación de dos usuarios
   */
  static getConversationId(userId1: string, userId2: string): string {
    return [userId1, userId2].sort().join(':');
  }

  /**
   * Crea una nueva conversación
   */
  createConversation(conversation: Conversation): void {
    const transaction = this.db.transaction(() => {
      // Insertar conversación
      const stmtConv = this.db.prepare(`
        INSERT OR IGNORE INTO conversations (id) VALUES (?)
      `);
      stmtConv.run(conversation.id);

      // Insertar participantes
      const stmtPart = this.db.prepare(`
        INSERT OR IGNORE INTO conversation_participants (conversation_id, user_id)
        VALUES (?, ?)
      `);

      for (const participantId of conversation.participants) {
        stmtPart.run(conversation.id, participantId);
      }
    });

    transaction();
    console.log(`[SQLite] Conversación creada: ${conversation.id}`);
  }

  /**
   * Obtiene una conversación con todos sus mensajes
   */
  getConversation(conversationId: string): Conversation | undefined {
    // Obtener participantes
    const stmtParticipants = this.db.prepare(`
      SELECT user_id FROM conversation_participants
      WHERE conversation_id = ?
    `);

    const participantRows = stmtParticipants.all(conversationId) as any[];
    if (participantRows.length === 0) return undefined;

    const participants = participantRows.map(row => row.user_id);

    // Obtener mensajes
    const stmtMessages = this.db.prepare(`
      SELECT
        id, conversation_id as conversationId, sender_id as senderId,
        content, timestamp, type, file_name, file_size, file_type
      FROM messages
      WHERE conversation_id = ?
      ORDER BY timestamp ASC
    `);

    const messageRows = stmtMessages.all(conversationId) as any[];
    const messages: Message[] = messageRows.map(row => {
      const message: Message = {
        id: row.id,
        conversationId: row.conversationId,
        senderId: row.senderId,
        content: row.content,
        timestamp: row.timestamp,
        type: row.type as 'text' | 'file'
      };

      if (row.type === 'file' && row.file_name) {
        message.file = {
          name: row.file_name,
          size: row.file_size,
          type: row.file_type
        };
      }

      return message;
    });

    return {
      id: conversationId,
      participants,
      messages
    };
  }

  /**
   * Obtiene todas las conversaciones
   */
  getAllConversations(): Conversation[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT id FROM conversations
    `);

    const rows = stmt.all() as any[];
    return rows.map(row => this.getConversation(row.id)).filter(Boolean) as Conversation[];
  }

  /**
   * Agrega un mensaje a una conversación
   */
  addMessageToConversation(conversationId: string, message: Message): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (
        id, conversation_id, sender_id, content, timestamp, type,
        file_name, file_size, file_type
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      conversationId,
      message.senderId,
      message.content,
      message.timestamp,
      message.type,
      message.file?.name || null,
      message.file?.size || null,
      message.file?.type || null
    );

    console.log(`[SQLite] Mensaje agregado a conversación ${conversationId}`);
  }

  // ==================== FILE UPLOADS ====================

  /**
   * Inicia una subida de archivo
   */
  initiateFileUpload(fileId: string, metadata: FileMetadata, totalChunks: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO file_uploads (file_id, metadata, total_chunks)
      VALUES (?, ?, ?)
    `);

    stmt.run(fileId, JSON.stringify(metadata), totalChunks);
    console.log(`[SQLite] Upload iniciado: ${fileId}, ${totalChunks} chunks`);
  }

  /**
   * Agrega un chunk de archivo y retorna true si está completo
   */
  addFileChunk(fileId: string, chunkIndex: number, chunkData: ArrayBuffer): boolean {
    const transaction = this.db.transaction(() => {
      // Insertar chunk
      const stmtChunk = this.db.prepare(`
        INSERT OR REPLACE INTO file_chunks (file_id, chunk_index, chunk_data)
        VALUES (?, ?, ?)
      `);

      stmtChunk.run(fileId, chunkIndex, Buffer.from(chunkData));

      // Actualizar contador de chunks recibidos
      const stmtUpdate = this.db.prepare(`
        UPDATE file_uploads
        SET received_chunks = (
          SELECT COUNT(*) FROM file_chunks WHERE file_id = ?
        )
        WHERE file_id = ?
      `);

      stmtUpdate.run(fileId, fileId);

      // Verificar si está completo
      const stmtCheck = this.db.prepare(`
        SELECT received_chunks, total_chunks
        FROM file_uploads WHERE file_id = ?
      `);

      const result = stmtCheck.get(fileId) as any;
      return result && result.received_chunks >= result.total_chunks;
    });

    return transaction();
  }

  /**
   * Obtiene los metadatos de un archivo en upload
   */
  getFileMetadata(fileId: string): FileMetadata | undefined {
    const stmt = this.db.prepare(`
      SELECT metadata FROM file_uploads WHERE file_id = ?
    `);

    const row = stmt.get(fileId) as any;
    if (!row) return undefined;

    return JSON.parse(row.metadata);
  }

  /**
   * Obtiene el archivo completo ensamblando todos los chunks
   */
  getCompleteFile(fileId: string): Buffer | undefined {
    const stmt = this.db.prepare(`
      SELECT chunk_data FROM file_chunks
      WHERE file_id = ?
      ORDER BY chunk_index
    `);

    const rows = stmt.all(fileId) as any[];
    if (rows.length === 0) return undefined;

    const buffers = rows.map(row => row.chunk_data as Buffer);
    return Buffer.concat(buffers);
  }

  /**
   * Obtiene información de un upload en progreso
   */
  getFileUpload(fileId: string): { totalChunks: number; receivedChunks: number } | undefined {
    const stmt = this.db.prepare(`
      SELECT total_chunks, received_chunks FROM file_uploads WHERE file_id = ?
    `);

    const row = stmt.get(fileId) as any;
    if (!row) return undefined;

    return {
      totalChunks: row.total_chunks,
      receivedChunks: row.received_chunks
    };
  }

  /**
   * Elimina los datos temporales de un upload
   */
  deleteFileUpload(fileId: string): void {
    const transaction = this.db.transaction(() => {
      // Eliminar chunks (se eliminan automáticamente por ON DELETE CASCADE)
      const stmtUpload = this.db.prepare(`
        DELETE FROM file_uploads WHERE file_id = ?
      `);

      stmtUpload.run(fileId);
    });

    transaction();
    console.log(`[SQLite] Upload temporal eliminado: ${fileId}`);
  }

  /**
   * Limpia uploads antiguos (más de 24 horas)
   */
  cleanupOldUploads(): void {
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

    const stmt = this.db.prepare(`
      DELETE FROM file_uploads WHERE created_at < ?
    `);

    const result = stmt.run(oneDayAgo);
    if (result.changes > 0) {
      console.log(`[SQLite] ${result.changes} uploads antiguos eliminados`);
    }
  }

  // ==================== SALAS TEMPORALES ====================

  /**
   * Genera un código aleatorio de 6 dígitos para una sala
   */
  private generateRoomCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Crea una nueva sala (temporal o permanente)
   */
  createRoom(
    roomId: string,
    name: string,
    createdBy: string,
    options: {
      expiresInHours?: number;
      isPermanent?: boolean;
      description?: string;
      avatarUrl?: string;
    } = {}
  ): { id: string; code: string } {
    // Generar código único
    let code = this.generateRoomCode();
    let attempts = 0;
    while (this.getRoomByCode(code) && attempts < 10) {
      code = this.generateRoomCode();
      attempts++;
    }

    const { expiresInHours = 24, isPermanent = false, description, avatarUrl } = options;
    const expiresAt = isPermanent ? null : Date.now() + (expiresInHours * 60 * 60 * 1000);

    const transaction = this.db.transaction(() => {
      // Crear sala
      const stmtRoom = this.db.prepare(`
        INSERT INTO rooms (id, code, name, description, avatar_url, created_by, expires_at, is_permanent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmtRoom.run(roomId, code, name, description || null, avatarUrl || null, createdBy, expiresAt, isPermanent ? 1 : 0);

      // Agregar creador como participante
      const stmtParticipant = this.db.prepare(`
        INSERT INTO room_participants (room_id, user_id)
        VALUES (?, ?)
      `);
      stmtParticipant.run(roomId, createdBy);
    });

    transaction();
    console.log(`[SQLite] Sala ${isPermanent ? 'permanente' : 'temporal'} creada: ${name} (${roomId}) - Código: ${code}`);

    return { id: roomId, code };
  }

  /**
   * Obtiene una sala por código
   */
  getRoomByCode(code: string): any {
    const stmt = this.db.prepare(`
      SELECT id, code, name, description, avatar_url as avatarUrl, created_by as createdBy,
             created_at as createdAt, expires_at as expiresAt, is_permanent as isPermanent
      FROM rooms WHERE code = ?
    `);

    const room = stmt.get(code) as any;
    if (!room) return null;

    // Convertir isPermanent de number a boolean
    room.isPermanent = Boolean(room.isPermanent);

    // Verificar si expiró (solo para salas temporales)
    if (!room.isPermanent && room.expiresAt && room.expiresAt < Date.now()) {
      this.deleteRoom(room.id);
      return null;
    }

    // Obtener participantes
    const stmtParticipants = this.db.prepare(`
      SELECT user_id as userId, joined_at as joinedAt
      FROM room_participants WHERE room_id = ?
      ORDER BY joined_at ASC
    `);
    room.participants = stmtParticipants.all(room.id);

    return room;
  }

  /**
   * Obtiene una sala por ID
   */
  getRoomById(roomId: string): any {
    const stmt = this.db.prepare(`
      SELECT id, code, name, description, avatar_url as avatarUrl, created_by as createdBy,
             created_at as createdAt, expires_at as expiresAt, is_permanent as isPermanent
      FROM rooms WHERE id = ?
    `);

    const room = stmt.get(roomId) as any;
    if (!room) return null;

    // Convertir isPermanent de number a boolean
    room.isPermanent = Boolean(room.isPermanent);

    // Verificar si expiró (solo para salas temporales)
    if (!room.isPermanent && room.expiresAt && room.expiresAt < Date.now()) {
      this.deleteRoom(room.id);
      return null;
    }

    // Obtener participantes
    const stmtParticipants = this.db.prepare(`
      SELECT user_id as userId, joined_at as joinedAt
      FROM room_participants WHERE room_id = ?
      ORDER BY joined_at ASC
    `);
    room.participants = stmtParticipants.all(room.id);

    return room;
  }

  /**
   * Agrega un participante a una sala
   */
  addParticipantToRoom(roomId: string, userId: string): boolean {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO room_participants (room_id, user_id)
        VALUES (?, ?)
      `);
      stmt.run(roomId, userId);
      console.log(`[SQLite] Usuario ${userId} unido a sala ${roomId}`);
      return true;
    } catch (error) {
      console.error('[SQLite] Error al agregar participante:', error);
      return false;
    }
  }

  /**
   * Elimina un participante de una sala
   */
  removeParticipantFromRoom(roomId: string, userId: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM room_participants WHERE room_id = ? AND user_id = ?
    `);
    stmt.run(roomId, userId);
    console.log(`[SQLite] Usuario ${userId} removido de sala ${roomId}`);
  }

  /**
   * Agrega un mensaje a una sala
   */
  addMessageToRoom(roomId: string, message: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO room_messages (
        id, room_id, sender_id, content, timestamp, type,
        file_name, file_size, file_type
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      message.id,
      roomId,
      message.senderId,
      message.content,
      message.timestamp,
      message.type,
      message.file?.name || null,
      message.file?.size || null,
      message.file?.type || null
    );

    console.log(`[SQLite] Mensaje agregado a sala ${roomId}`);
  }

  /**
   * Obtiene todos los mensajes de una sala
   */
  getRoomMessages(roomId: string): any[] {
    const stmt = this.db.prepare(`
      SELECT
        id, room_id as roomId, sender_id as senderId,
        content, timestamp, type, file_name, file_size, file_type
      FROM room_messages
      WHERE room_id = ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(roomId) as any[];
    return rows.map(row => {
      const message: any = {
        id: row.id,
        roomId: row.roomId,
        senderId: row.senderId,
        content: row.content,
        timestamp: row.timestamp,
        type: row.type
      };

      if (row.type === 'file' && row.file_name) {
        message.file = {
          name: row.file_name,
          size: row.file_size,
          type: row.file_type
        };
      }

      return message;
    });
  }

  /**
   * Obtiene todas las salas activas (no expiradas y permanentes)
   */
  getActiveRooms(): any[] {
    const now = Date.now();
    const stmt = this.db.prepare(`
      SELECT id, code, name, description, avatar_url as avatarUrl, created_by as createdBy,
             created_at as createdAt, expires_at as expiresAt, is_permanent as isPermanent
      FROM rooms
      WHERE is_permanent = 1 OR expires_at > ?
      ORDER BY created_at DESC
    `);

    return stmt.all(now).map(room => ({
      ...room,
      isPermanent: Boolean(room.isPermanent)
    }));
  }

  /**
   * Obtiene las salas de un usuario
   */
  getUserRooms(userId: string): any[] {
    const now = Date.now();
    const stmt = this.db.prepare(`
      SELECT r.id, r.code, r.name, r.description, r.avatar_url as avatarUrl, r.created_by as createdBy,
             r.created_at as createdAt, r.expires_at as expiresAt, r.is_permanent as isPermanent
      FROM rooms r
      INNER JOIN room_participants rp ON r.id = rp.room_id
      WHERE rp.user_id = ? AND (r.is_permanent = 1 OR r.expires_at > ?)
      ORDER BY r.created_at DESC
    `);

    return stmt.all(userId, now).map(room => ({
      ...room,
      isPermanent: Boolean(room.isPermanent)
    }));
  }

  /**
   * Elimina una sala
   */
  deleteRoom(roomId: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM rooms WHERE id = ?
    `);
    stmt.run(roomId);
    console.log(`[SQLite] Sala eliminada: ${roomId}`);
  }

  /**
   * Limpia salas expiradas
   */
  cleanupExpiredRooms(): number {
    const now = Date.now();
    const stmt = this.db.prepare(`
      DELETE FROM rooms WHERE expires_at < ?
    `);

    const result = stmt.run(now);
    if (result.changes > 0) {
      console.log(`[SQLite] ${result.changes} salas expiradas eliminadas`);
    }
    return result.changes;
  }

  /**
   * Cierra la conexión a la base de datos
   */
  close(): void {
    this.db.close();
    console.log('[SQLite] Base de datos cerrada');
  }

  /**
   * Ejecuta VACUUM para optimizar la base de datos
   */
  vacuum(): void {
    this.db.exec('VACUUM');
    console.log('[SQLite] Base de datos optimizada (VACUUM)');
  }
}

// Instancia singleton de la base de datos
export const sqliteDb = new SQLiteDatabase();

// Limpiar uploads antiguos y salas expiradas al iniciar
sqliteDb.cleanupOldUploads();
sqliteDb.cleanupExpiredRooms();
