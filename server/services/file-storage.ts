import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import type { FileMetadata } from '../../shared/types';
import { sanitizeFilename, sanitizeUsername, isPathSafe } from '../utils/sanitization';

const BASE_DIR = path.join(homedir(), 'Documents', 'ftp', 'Airplay');
const ROOMS_DIR = path.join(BASE_DIR, 'rooms');

export class FileStorageService {
  /**
   * Crea el nombre de la carpeta de conversaci�n basado en los nombres de los usuarios
   * Ejemplo: "Alberto-Alfonso"
   * Los nombres son sanitizados para prevenir ataques de path traversal
   */
  static getConversationFolderName(userName1: string, userName2: string): string {
    const sanitized1 = sanitizeUsername(userName1);
    const sanitized2 = sanitizeUsername(userName2);
    return [sanitized1, sanitized2].sort().join('-');
  }

  /**
   * Obtiene el path completo de la carpeta de conversaci�n
   */
  static getConversationPath(userName1: string, userName2: string): string {
    const folderName = this.getConversationFolderName(userName1, userName2);
    return path.join(BASE_DIR, folderName);
  }

  /**
   * Obtiene el path de la carpeta de archivos para conversaciones
   */
  static getFilesPath(userName1: string, userName2: string): string {
    return path.join(this.getConversationPath(userName1, userName2), 'Archivos');
  }

  /**
   * Normaliza el identificador interno de una sala temporal para evitar path traversal
   */
  private static sanitizeRoomId(roomId: string): string {
    return roomId.replace(/[^a-zA-Z0-9_-]/g, '');
  }

  /**
   * Obtiene el path base donde se almacenar� el contenido de una sala temporal
   */
  static getRoomPath(roomId: string): string {
    const safeRoomId = this.sanitizeRoomId(roomId);
    return path.join(ROOMS_DIR, safeRoomId);
  }

  /**
   * Obtiene la carpeta de archivos para una sala temporal
   */
  static getRoomFilesPath(roomId: string): string {
    return path.join(this.getRoomPath(roomId), 'Archivos');
  }

  /**
   * Genera el nombre del archivo con formato: dd-mm-yyyy_emisor_receptor.ext
   * Los nombres y la extensi�n son sanitizados para prevenir vulnerabilidades
   */
  static generateFileName(senderName: string, receiverName: string, originalName: string): string {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    const sanitizedOriginal = sanitizeFilename(originalName);
    const ext = path.extname(sanitizedOriginal);

    const safeSenderName = sanitizeUsername(senderName);
    const safeReceiverName = sanitizeUsername(receiverName);

    return `${day}-${month}-${year}_${safeSenderName}_${safeReceiverName}${ext}`;
  }

  /**
   * Genera el nombre del archivo para salas temporales
   * Formato: dd-mm-yyyy_sala-123456_usuario.ext
   */
  static generateRoomFileName(roomCode: string, senderName: string, originalName: string): string {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    const sanitizedOriginal = sanitizeFilename(originalName);
    const ext = path.extname(sanitizedOriginal);
    const safeSenderName = sanitizeUsername(senderName);

    return `${day}-${month}-${year}_sala-${roomCode}_${safeSenderName}${ext}`;
  }

  /**
   * Asegura que existe la estructura de carpetas para una conversaci�n
   */
  static async ensureConversationFolders(userName1: string, userName2: string): Promise<void> {
    const conversationPath = this.getConversationPath(userName1, userName2);
    const filesPath = this.getFilesPath(userName1, userName2);

    await fs.mkdir(conversationPath, { recursive: true });
    await fs.mkdir(filesPath, { recursive: true });
  }

  /**
   * Asegura que existe la estructura de carpetas para una sala temporal
   */
  static async ensureRoomFolders(roomId: string): Promise<void> {
    const roomPath = this.getRoomPath(roomId);
    const filesPath = this.getRoomFilesPath(roomId);

    await fs.mkdir(roomPath, { recursive: true });
    await fs.mkdir(filesPath, { recursive: true });
  }

  /**
   * Guarda un archivo en la carpeta correspondiente de una conversaci�n
   */
  static async saveFile(
    userName1: string,
    userName2: string,
    senderName: string,
    receiverName: string,
    fileData: Buffer,
    metadata: FileMetadata
  ): Promise<string> {
    await this.ensureConversationFolders(userName1, userName2);

    const fileName = this.generateFileName(senderName, receiverName, metadata.name);
    const filesPath = this.getFilesPath(userName1, userName2);
    const filePath = path.join(filesPath, fileName);

    await fs.writeFile(filePath, fileData);
    console.log(`[FileStorage] Saved file: ${filePath}`);

    return fileName;
  }

  /**
   * Guarda un archivo dentro de la carpeta de una sala temporal
   */
  static async saveRoomFile(
    roomId: string,
    roomCode: string,
    senderName: string,
    fileData: Buffer,
    metadata: FileMetadata
  ): Promise<string> {
    await this.ensureRoomFolders(roomId);

    const fileName = this.generateRoomFileName(roomCode, senderName, metadata.name);
    const filesPath = this.getRoomFilesPath(roomId);
    const filePath = path.join(filesPath, fileName);

    await fs.writeFile(filePath, fileData);
    console.log(`[FileStorage] Saved room file: ${filePath}`);

    return fileName;
  }

  /**
   * Lee un archivo de la carpeta de archivos de una conversaci�n
   * Valida que el path no escape del directorio permitido
   */
  static async getFile(
    userName1: string,
    userName2: string,
    fileName: string
  ): Promise<Buffer | null> {
    try {
      const sanitizedFileName = sanitizeFilename(fileName);

      const filesPath = this.getFilesPath(userName1, userName2);
      const filePath = path.join(filesPath, sanitizedFileName);

      if (!isPathSafe(filesPath, filePath)) {
        console.error(`[FileStorage] Intento de path traversal detectado: ${fileName}`);
        return null;
      }

      const data = await fs.readFile(filePath);
      return data;
    } catch (error) {
      console.error(`[FileStorage] Error reading file ${fileName}:`, error);
      return null;
    }
  }

  /**
   * Lee un archivo almacenado dentro de una sala temporal
   */
  static async getRoomFile(roomId: string, fileName: string): Promise<Buffer | null> {
    try {
      const sanitizedFileName = sanitizeFilename(fileName);

      const filesPath = this.getRoomFilesPath(roomId);
      const filePath = path.join(filesPath, sanitizedFileName);

      if (!isPathSafe(filesPath, filePath)) {
        console.error(`[FileStorage] Intento de path traversal detectado en sala: ${fileName}`);
        return null;
      }

      const data = await fs.readFile(filePath);
      return data;
    } catch (error) {
      console.error(`[FileStorage] Error reading room file ${fileName}:`, error);
      return null;
    }
  }

  /**
   * Lista todos los archivos de una conversaci�n
   */
  static async listFiles(userName1: string, userName2: string): Promise<string[]> {
    try {
      const filesPath = this.getFilesPath(userName1, userName2);
      const files = await fs.readdir(filesPath);
      return files;
    } catch {
      return [];
    }
  }

  /**
   * Lista los archivos almacenados dentro de una sala temporal
   */
  static async listRoomFiles(roomId: string): Promise<string[]> {
    try {
      const filesPath = this.getRoomFilesPath(roomId);
      const files = await fs.readdir(filesPath);
      return files;
    } catch {
      return [];
    }
  }

  /**
   * Verifica si un archivo existe dentro de una conversaci�n
   */
  static async fileExists(
    userName1: string,
    userName2: string,
    fileName: string
  ): Promise<boolean> {
    try {
      const sanitizedFileName = sanitizeFilename(fileName);

      const filesPath = this.getFilesPath(userName1, userName2);
      const filePath = path.join(filesPath, sanitizedFileName);

      if (!isPathSafe(filesPath, filePath)) {
        console.error(`[FileStorage] Intento de path traversal detectado: ${fileName}`);
        return false;
      }

      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Verifica si un archivo existe dentro de una sala temporal
   */
  static async roomFileExists(roomId: string, fileName: string): Promise<boolean> {
    try {
      const sanitizedFileName = sanitizeFilename(fileName);

      const filesPath = this.getRoomFilesPath(roomId);
      const filePath = path.join(filesPath, sanitizedFileName);

      if (!isPathSafe(filesPath, filePath)) {
        console.error(`[FileStorage] Intento de path traversal detectado en sala: ${fileName}`);
        return false;
      }

      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
