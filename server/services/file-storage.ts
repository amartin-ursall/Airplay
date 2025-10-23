import * as fs from 'fs/promises';
import * as path from 'path';
import { homedir } from 'os';
import type { FileMetadata } from '../../shared/types';

const BASE_DIR = path.join(homedir(), 'Documents', 'ConversacionesAirplay');

export class FileStorageService {
  /**
   * Crea el nombre de la carpeta de conversación basado en los nombres de los usuarios
   * Ejemplo: "Alberto-Alfonso"
   */
  static getConversationFolderName(userName1: string, userName2: string): string {
    return [userName1, userName2].sort().join('-');
  }

  /**
   * Obtiene el path completo de la carpeta de conversación
   */
  static getConversationPath(userName1: string, userName2: string): string {
    const folderName = this.getConversationFolderName(userName1, userName2);
    return path.join(BASE_DIR, folderName);
  }

  /**
   * Obtiene el path de la carpeta de archivos
   */
  static getFilesPath(userName1: string, userName2: string): string {
    return path.join(this.getConversationPath(userName1, userName2), 'Archivos');
  }

  /**
   * Genera el nombre del archivo con formato: dd-mm-yyyy_emisor_receptor.ext
   */
  static generateFileName(senderName: string, receiverName: string, originalName: string): string {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();

    const ext = path.extname(originalName);
    return `${day}-${month}-${year}_${senderName}_${receiverName}${ext}`;
  }

  /**
   * Asegura que existe la estructura de carpetas para una conversación
   */
  static async ensureConversationFolders(userName1: string, userName2: string): Promise<void> {
    const conversationPath = this.getConversationPath(userName1, userName2);
    const filesPath = this.getFilesPath(userName1, userName2);

    await fs.mkdir(conversationPath, { recursive: true });
    await fs.mkdir(filesPath, { recursive: true });
  }

  /**
   * Guarda un archivo en la carpeta correspondiente
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
   * Lee un archivo de la carpeta de archivos
   */
  static async getFile(
    userName1: string,
    userName2: string,
    fileName: string
  ): Promise<Buffer | null> {
    try {
      const filesPath = this.getFilesPath(userName1, userName2);
      const filePath = path.join(filesPath, fileName);
      const data = await fs.readFile(filePath);
      return data;
    } catch (error) {
      console.error(`[FileStorage] Error reading file ${fileName}:`, error);
      return null;
    }
  }

  /**
   * Lista todos los archivos de una conversación
   */
  static async listFiles(userName1: string, userName2: string): Promise<string[]> {
    try {
      const filesPath = this.getFilesPath(userName1, userName2);
      const files = await fs.readdir(filesPath);
      return files;
    } catch (error) {
      // Si la carpeta no existe, retornar array vacío
      return [];
    }
  }

  /**
   * Verifica si un archivo existe
   */
  static async fileExists(
    userName1: string,
    userName2: string,
    fileName: string
  ): Promise<boolean> {
    try {
      const filesPath = this.getFilesPath(userName1, userName2);
      const filePath = path.join(filesPath, fileName);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
