import * as fs from 'fs/promises';
import * as path from 'path';
import type { Message } from '../../shared/types';
import { FileStorageService } from './file-storage';

export class MessageStorageService {
  /**
   * Obtiene el path del archivo de mensajes
   */
  static getMessagesFilePath(userName1: string, userName2: string): string {
    const conversationPath = FileStorageService.getConversationPath(userName1, userName2);
    return path.join(conversationPath, 'mensajes.txt');
  }

  /**
   * Formatea un mensaje para guardarlo en el archivo de texto
   */
  static formatMessage(message: Message, senderName: string): string {
    const date = new Date(message.timestamp);
    const dateStr = date.toLocaleString('es-ES');

    if (message.type === 'text') {
      return `[${dateStr}] ${senderName}: ${message.content}\n`;
    } else if (message.type === 'file' && message.file) {
      return `[${dateStr}] ${senderName} envió el archivo: ${message.file.name} (${message.file.size} bytes)\n`;
    }

    return '';
  }

  /**
   * Guarda un mensaje en el archivo de texto
   */
  static async saveMessage(
    userName1: string,
    userName2: string,
    message: Message,
    senderName: string
  ): Promise<void> {
    await FileStorageService.ensureConversationFolders(userName1, userName2);

    const messagesFile = this.getMessagesFilePath(userName1, userName2);
    const formattedMessage = this.formatMessage(message, senderName);

    // Agregar el mensaje al final del archivo
    await fs.appendFile(messagesFile, formattedMessage, 'utf-8');
    console.log(`[MessageStorage] Saved message to: ${messagesFile}`);
  }

  /**
   * Lee todos los mensajes del archivo de texto
   */
  static async getMessages(userName1: string, userName2: string): Promise<string> {
    try {
      const messagesFile = this.getMessagesFilePath(userName1, userName2);
      const content = await fs.readFile(messagesFile, 'utf-8');
      return content;
    } catch (error) {
      // Si el archivo no existe, retornar string vacío
      return '';
    }
  }

  /**
   * Parsea los mensajes del archivo de texto y los convierte a objetos Message
   * (Útil para migrar o cargar mensajes históricos)
   */
  static parseMessagesFromFile(content: string): Array<{
    timestamp: Date;
    sender: string;
    content: string;
    type: 'text' | 'file';
  }> {
    const lines = content.split('\n').filter(line => line.trim());
    const messages = [];

    for (const line of lines) {
      // Formato: [dd/mm/yyyy, hh:mm:ss] Sender: Content
      const match = line.match(/^\[(.*?)\]\s+(.*?):\s+(.*)$/);
      if (match) {
        const [, dateStr, sender, content] = match;
        const timestamp = new Date(dateStr);

        // Detectar si es un mensaje de archivo
        const isFile = content.startsWith('envió el archivo:');

        messages.push({
          timestamp,
          sender,
          content,
          type: isFile ? 'file' as const : 'text' as const
        });
      }
    }

    return messages;
  }
}
