/**
 * Adaptador de base de datos para Airplay
 * Proporciona una interfaz unificada usando SQLite como backend
 * Mantiene compatibilidad con el código existente
 */

import type { User, Conversation, Message, FileMetadata } from '../../shared/types';
import { sqliteDb, SQLiteDatabase } from './sqlite-db';

/**
 * Clase Database que usa SQLite como backend
 * Mantiene la misma interfaz que InMemoryDB para compatibilidad
 */
class Database {
  private sqlite: SQLiteDatabase;

  constructor() {
    this.sqlite = sqliteDb;
    console.log('[Database] Sistema de persistencia SQLite inicializado');
  }

  // ========== USERS ==========

  createUser(user: User): void {
    this.sqlite.createUser(user);
  }

  getUser(userId: string): User | undefined {
    return this.sqlite.getUser(userId);
  }

  getAllUsers(): User[] {
    return this.sqlite.getAllUsers();
  }

  getUserByName(name: string): User | undefined {
    return this.sqlite.getUserByName(name);
  }

  updateUserLastSeen(userId: string, lastSeen: number): void {
    this.sqlite.updateUserLastSeen(userId, lastSeen);
  }

  setUserOnline(userId: string, online: boolean): void {
    this.sqlite.updateUserOnlineStatus(userId, online);
  }

  // ========== CONVERSATIONS ==========

  static getConversationId(userId1: string, userId2: string): string {
    return SQLiteDatabase.getConversationId(userId1, userId2);
  }

  getConversation(conversationId: string): Conversation | undefined {
    return this.sqlite.getConversation(conversationId);
  }

  createConversation(conversation: Conversation): void {
    this.sqlite.createConversation(conversation);
  }

  addMessageToConversation(conversationId: string, message: Message): void {
    this.sqlite.addMessageToConversation(conversationId, message);
  }

  getConversationMessages(conversationId: string): Message[] {
    const conversation = this.sqlite.getConversation(conversationId);
    return conversation ? conversation.messages : [];
  }

  getAllConversations(): Conversation[] {
    return this.sqlite.getAllConversations();
  }

  // ========== FILE UPLOADS (Temporary storage for chunked uploads) ==========

  initiateFileUpload(fileId: string, metadata: FileMetadata, totalChunks: number): void {
    this.sqlite.initiateFileUpload(fileId, metadata, totalChunks);
  }

  addFileChunk(fileId: string, chunkIndex: number, chunkData: ArrayBuffer): boolean {
    return this.sqlite.addFileChunk(fileId, chunkIndex, chunkData);
  }

  getFileUpload(fileId: string): { totalChunks: number; receivedChunks: number } | undefined {
    return this.sqlite.getFileUpload(fileId);
  }

  getCompleteFile(fileId: string): Buffer | null {
    const buffer = this.sqlite.getCompleteFile(fileId);
    return buffer || null;
  }

  deleteFileUpload(fileId: string): void {
    this.sqlite.deleteFileUpload(fileId);
  }

  getFileMetadata(fileId: string): FileMetadata | undefined {
    return this.sqlite.getFileMetadata(fileId);
  }

  // ========== UTILIDADES ==========

  /**
   * Limpia uploads antiguos (más de 24 horas)
   */
  cleanupOldUploads(): void {
    this.sqlite.cleanupOldUploads();
  }

  // ========== SALAS TEMPORALES ==========

  createRoom(roomId: string, name: string, createdBy: string, expiresInHours?: number): { id: string; code: string } {
    return this.sqlite.createRoom(roomId, name, createdBy, expiresInHours);
  }

  getRoomByCode(code: string): any {
    return this.sqlite.getRoomByCode(code);
  }

  getRoomById(roomId: string): any {
    return this.sqlite.getRoomById(roomId);
  }

  addParticipantToRoom(roomId: string, userId: string): boolean {
    return this.sqlite.addParticipantToRoom(roomId, userId);
  }

  removeParticipantFromRoom(roomId: string, userId: string): void {
    this.sqlite.removeParticipantFromRoom(roomId, userId);
  }

  updateRoomAvatar(roomId: string, avatarUrl: string | null): void {
    this.sqlite.updateRoomAvatar(roomId, avatarUrl);
  }

  addMessageToRoom(roomId: string, message: any): void {
    this.sqlite.addMessageToRoom(roomId, message);
  }

  getRoomMessages(roomId: string): any[] {
    return this.sqlite.getRoomMessages(roomId);
  }

  getActiveRooms(): any[] {
    return this.sqlite.getActiveRooms();
  }

  getUserRooms(userId: string): any[] {
    return this.sqlite.getUserRooms(userId);
  }

  deleteRoom(roomId: string): void {
    this.sqlite.deleteRoom(roomId);
  }

  cleanupExpiredRooms(): number {
    return this.sqlite.cleanupExpiredRooms();
  }

  /**
   * Optimiza la base de datos
   */
  optimize(): void {
    this.sqlite.vacuum();
  }

  /**
   * Cierra la conexión a la base de datos
   */
  close(): void {
    this.sqlite.close();
  }
}

// Exportar instancia singleton compatible con el código existente
export const db = new Database();
export { Database as InMemoryDB };

// Programar limpieza automática de uploads antiguos cada 6 horas
setInterval(() => {
  db.cleanupOldUploads();
}, 6 * 60 * 60 * 1000);

// Programar limpieza de salas expiradas cada hora
setInterval(() => {
  db.cleanupExpiredRooms();
}, 60 * 60 * 1000);

// Optimizar base de datos cada 24 horas
setInterval(() => {
  db.optimize();
}, 24 * 60 * 60 * 1000);

// Cerrar base de datos al cerrar la aplicación
process.on('SIGINT', () => {
  console.log('\n[Database] Cerrando base de datos...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Database] Cerrando base de datos...');
  db.close();
  process.exit(0);
});
