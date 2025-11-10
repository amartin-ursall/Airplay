import { FtpSrv } from 'ftp-srv';
import { homedir } from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { Conversation } from '../../shared/types';
import { sanitizeUsername } from '../utils/sanitization';

const BASE_DIR = path.join(homedir(), 'Documents', 'ftp', 'Airplay');

export class FTPServerService {
  private ftpServer: any;
  private port: number;
  private host: string;

  constructor(port: number = 21, host: string = '0.0.0.0') {
    this.port = port;
    this.host = host;
  }

  async start(): Promise<void> {
    // Crear el directorio base si no existe
    await fs.mkdir(BASE_DIR, { recursive: true });
    console.log(`[FTP] Directorio base creado/verificado: ${BASE_DIR}`);
    this.ftpServer = new FtpSrv({
      url: `ftp://${this.host}:${this.port}`,
      pasv_url: `ftp://${this.host}`,
      pasv_min: 1024,
      pasv_max: 1048,
      greeting: ['Bienvenido al servidor FTP de Airplay'],
      anonymous: false // Requiere autenticación
    });

    // Configurar autenticación
    this.ftpServer.on('login', ({ connection, username, password }: any, resolve: any, reject: any) => {
      // Autenticación simple (puedes mejorar esto con una base de datos)
      // Por defecto, permitimos cualquier usuario con la contraseña 'airplay'
      if (password === 'airplay') {
        console.log(`[FTP] Usuario conectado: ${username}`);

        // Dar acceso a la carpeta base
        // ftp-srv incluye su propio sistema de archivos por defecto
        resolve({
          root: BASE_DIR
        });
      } else {
        console.log(`[FTP] Autenticación fallida para: ${username}`);
        reject(new Error('Credenciales inválidas'));
      }
    });

    // Eventos de logging
    this.ftpServer.on('client-error', ({ connection, context, error }: any) => {
      console.error(`[FTP] Error del cliente ${connection.ip}:`, error);
    });

    // Iniciar servidor
    await this.ftpServer.listen();
    console.log(`[FTP] Servidor FTP iniciado en ftp://${this.host}:${this.port}`);
    console.log(`[FTP] Directorio raíz: ${BASE_DIR}`);
    console.log(`[FTP] Contraseña por defecto: 'airplay'`);
  }

  async stop(): Promise<void> {
    if (this.ftpServer) {
      await this.ftpServer.close();
      console.log('[FTP] Servidor FTP detenido');
    }
  }

  /**
   * Sincroniza las conversaciones existentes creando sus carpetas en el FTP
   * Los nombres de usuario son sanitizados para prevenir vulnerabilidades
   */
  static async syncExistingConversations(conversations: Conversation[], userNamesMap: Map<string, string>): Promise<void> {
    console.log(`[FTP] Sincronizando ${conversations.length} conversaciones existentes...`);

    for (const conversation of conversations) {
      try {
        const [userId1, userId2] = conversation.participants;
        const userName1 = userNamesMap.get(userId1);
        const userName2 = userNamesMap.get(userId2);

        if (!userName1 || !userName2) {
          console.warn(`[FTP] Saltando conversación ${conversation.id}: usuarios no encontrados`);
          continue;
        }

        // Sanitizar nombres de usuario antes de crear carpetas
        const sanitizedName1 = sanitizeUsername(userName1);
        const sanitizedName2 = sanitizeUsername(userName2);

        // Crear carpeta de conversación
        const folderName = [sanitizedName1, sanitizedName2].sort().join('-');
        const conversationPath = path.join(BASE_DIR, folderName);
        const filesPath = path.join(conversationPath, 'Archivos');

        await fs.mkdir(conversationPath, { recursive: true });
        await fs.mkdir(filesPath, { recursive: true });

        console.log(`[FTP] Carpeta creada/verificada: ${folderName}`);
      } catch (error) {
        console.error(`[FTP] Error al sincronizar conversación ${conversation.id}:`, error);
      }
    }

    console.log('[FTP] Sincronización de conversaciones completada');
  }
}

// Función para iniciar el servidor FTP
export async function startFTPServer(port: number = 21, host: string = '0.0.0.0'): Promise<FTPServerService> {
  const ftpService = new FTPServerService(port, host);
  await ftpService.start();
  return ftpService;
}
