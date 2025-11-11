/**
 * Servicio de WebSocket para Airplay
 * Maneja conexiones en tiempo real para mensajes y actualizaciones de usuarios
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import type { Message } from '../../shared/types';

// Tipos de eventos de WebSocket
export type WSEventType =
  | 'auth'           // Cliente se autentica con su userId
  | 'message:new'    // Nuevo mensaje enviado
  | 'message:received' // Mensaje recibido por otro usuario
  | 'user:online'    // Usuario conectado
  | 'user:offline'   // Usuario desconectado
  | 'users:update'   // Lista de usuarios actualizada
  | 'typing:start'   // Usuario empieza a escribir
  | 'typing:stop'    // Usuario deja de escribir
  | 'room:created'   // Sala temporal creada
  | 'room:message:new' // Nuevo mensaje en sala
  | 'room:participant:joined' // Participante unido a sala
  | 'room:participant:left'   // Participante salió de sala
  | 'error'          // Error en el servidor
  | 'ping'           // Heartbeat del cliente
  | 'pong';          // Respuesta heartbeat del servidor

export interface WSMessage {
  type: WSEventType;
  payload?: any;
  timestamp?: number;
}

interface ClientConnection {
  ws: WebSocket;
  userId: string;
  lastSeen: number;
  isAlive: boolean;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Map<string, ClientConnection> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: any) {
    // Crear servidor WebSocket
    this.wss = new WebSocketServer({
      server,
      path: '/ws'
    });

    console.log('[WebSocket] Servidor WebSocket inicializado en /ws');

    // Configurar event listeners
    this.wss.on('connection', this.handleConnection.bind(this));

    // Iniciar heartbeat para detectar conexiones muertas
    this.startHeartbeat();
  }

  /**
   * Maneja una nueva conexión WebSocket
   */
  private handleConnection(ws: WebSocket, request: IncomingMessage): void {
    console.log('[WebSocket] Nueva conexión recibida');

    // Estado temporal hasta que el cliente se autentique
    let clientUserId: string | null = null;
    let isAlive = true;

    // Heartbeat: responder a pings del cliente
    ws.on('pong', () => {
      isAlive = true;
      if (clientUserId) {
        const client = this.clients.get(clientUserId);
        if (client) {
          client.isAlive = true;
          client.lastSeen = Date.now();
        }
      }
    });

    // Manejar mensajes del cliente
    ws.on('message', (data: Buffer) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());
        this.handleMessage(ws, message, (userId) => {
          clientUserId = userId;
        });
      } catch (error) {
        console.error('[WebSocket] Error parsing message:', error);
        this.sendError(ws, 'Invalid message format');
      }
    });

    // Manejar cierre de conexión
    ws.on('close', () => {
      if (clientUserId) {
        console.log(`[WebSocket] Cliente desconectado: ${clientUserId}`);
        this.removeClient(clientUserId);

        // Notificar a otros usuarios que este usuario se desconectó
        this.broadcast({
          type: 'user:offline',
          payload: { userId: clientUserId },
          timestamp: Date.now()
        }, clientUserId);
      }
    });

    // Manejar errores
    ws.on('error', (error) => {
      console.error('[WebSocket] Error en conexión:', error);
    });
  }

  /**
   * Maneja mensajes recibidos de los clientes
   */
  private handleMessage(
    ws: WebSocket,
    message: WSMessage,
    setUserId: (userId: string) => void
  ): void {
    switch (message.type) {
      case 'auth':
        // Cliente se autentica con su userId
        const { userId } = message.payload;
        if (!userId) {
          this.sendError(ws, 'Missing userId in auth message');
          return;
        }

        // Registrar cliente
        this.addClient(userId, ws);
        setUserId(userId);

        console.log(`[WebSocket] Cliente autenticado: ${userId}`);

        // Confirmar autenticación
        this.sendToClient(userId, {
          type: 'auth',
          payload: { success: true, userId },
          timestamp: Date.now()
        });

        // Notificar a otros usuarios que este usuario está online
        this.broadcast({
          type: 'user:online',
          payload: { userId },
          timestamp: Date.now()
        }, userId);
        break;

      case 'ping':
        // Responder a heartbeat del cliente
        this.send(ws, {
          type: 'pong',
          timestamp: Date.now()
        });
        break;

      case 'typing:start':
        // Reenviar evento de typing a destinatario
        const { recipientId: startRecipient } = message.payload;
        if (startRecipient) {
          this.sendToClient(startRecipient, {
            type: 'typing:start',
            payload: message.payload,
            timestamp: Date.now()
          });
        }
        break;

      case 'typing:stop':
        // Reenviar evento de typing a destinatario
        const { recipientId: stopRecipient } = message.payload;
        if (stopRecipient) {
          this.sendToClient(stopRecipient, {
            type: 'typing:stop',
            payload: message.payload,
            timestamp: Date.now()
          });
        }
        break;

      default:
        console.warn(`[WebSocket] Tipo de mensaje desconocido: ${message.type}`);
    }
  }

  /**
   * Agrega un cliente a la lista de conexiones activas
   */
  private addClient(userId: string, ws: WebSocket): void {
    // Si el usuario ya estaba conectado, cerrar la conexión anterior
    const existingClient = this.clients.get(userId);
    if (existingClient) {
      console.log(`[WebSocket] Cerrando conexión anterior de ${userId}`);
      existingClient.ws.close();
    }

    this.clients.set(userId, {
      ws,
      userId,
      lastSeen: Date.now(),
      isAlive: true
    });

    console.log(`[WebSocket] Cliente agregado: ${userId} (Total: ${this.clients.size})`);
  }

  /**
   * Elimina un cliente de la lista de conexiones activas
   */
  private removeClient(userId: string): void {
    this.clients.delete(userId);
    console.log(`[WebSocket] Cliente eliminado: ${userId} (Total: ${this.clients.size})`);
  }

  /**
   * Envía un mensaje a un cliente específico
   */
  public sendToClient(userId: string, message: WSMessage): boolean {
    const client = this.clients.get(userId);
    if (!client) {
      console.warn(`[WebSocket] Cliente no encontrado: ${userId}`);
      return false;
    }

    return this.send(client.ws, message);
  }

  /**
   * Envía un mensaje a través de WebSocket
   */
  private send(ws: WebSocket, message: WSMessage): boolean {
    if (ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('[WebSocket] Error enviando mensaje:', error);
      return false;
    }
  }

  /**
   * Envía un error a un cliente
   */
  private sendError(ws: WebSocket, error: string): void {
    this.send(ws, {
      type: 'error',
      payload: { error },
      timestamp: Date.now()
    });
  }

  /**
   * Envía un mensaje a todos los clientes excepto al remitente
   */
  public broadcast(message: WSMessage, excludeUserId?: string): void {
    let sent = 0;
    for (const [userId, client] of this.clients.entries()) {
      if (userId !== excludeUserId) {
        if (this.send(client.ws, message)) {
          sent++;
        }
      }
    }
    console.log(`[WebSocket] Broadcast enviado a ${sent} clientes`);
  }

  /**
   * Envía un mensaje a todos los clientes
   */
  public broadcastToAll(message: WSMessage): void {
    this.broadcast(message);
  }

  /**
   * Notifica un nuevo mensaje a los participantes de una conversación
   */
  public notifyNewMessage(message: Message, senderId: string): void {
    // Obtener el ID del destinatario
    // El conversationId tiene formato "userId1:userId2"
    const participantIds = message.conversationId.split(':');
    const recipientId = participantIds.find(id => id !== senderId);

    if (!recipientId) {
      console.warn('[WebSocket] No se pudo determinar destinatario del mensaje');
      return;
    }

    // Enviar notificación al destinatario
    this.sendToClient(recipientId, {
      type: 'message:new',
      payload: { message },
      timestamp: Date.now()
    });

    console.log(`[WebSocket] Notificación de mensaje enviada: ${senderId} -> ${recipientId}`);
  }

  /**
   * Notifica actualizaciones de usuarios a todos los clientes
   */
  public notifyUsersUpdate(): void {
    this.broadcastToAll({
      type: 'users:update',
      timestamp: Date.now()
    });
  }

  /**
   * Obtiene la lista de userIds conectados
   */
  public getConnectedUserIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Verifica si un usuario está conectado
   */
  public isUserConnected(userId: string): boolean {
    return this.clients.has(userId);
  }

  /**
   * Inicia el heartbeat para detectar conexiones muertas
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();

      for (const [userId, client] of this.clients.entries()) {
        // Si el cliente no respondió al último ping, marcarlo como muerto
        if (!client.isAlive) {
          console.log(`[WebSocket] Cliente sin respuesta, desconectando: ${userId}`);
          client.ws.terminate();
          this.removeClient(userId);

          // Notificar a otros usuarios
          this.broadcast({
            type: 'user:offline',
            payload: { userId },
            timestamp: now
          }, userId);
          continue;
        }

        // Marcar como no vivo y enviar ping
        client.isAlive = false;
        client.ws.ping();
      }
    }, 30000); // Cada 30 segundos

    console.log('[WebSocket] Heartbeat iniciado (cada 30s)');
  }

  /**
   * Detiene el heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      console.log('[WebSocket] Heartbeat detenido');
    }
  }

  /**
   * Cierra todas las conexiones y detiene el servidor
   */
  public close(): void {
    console.log('[WebSocket] Cerrando servidor WebSocket...');

    this.stopHeartbeat();

    // Cerrar todas las conexiones de clientes
    for (const [userId, client] of this.clients.entries()) {
      client.ws.close();
    }
    this.clients.clear();

    // Cerrar el servidor WebSocket
    this.wss.close(() => {
      console.log('[WebSocket] Servidor WebSocket cerrado');
    });
  }
}

// Instancia singleton (se inicializará desde server/index.ts)
let wsService: WebSocketService | null = null;

export function initWebSocketService(server: any): WebSocketService {
  if (!wsService) {
    wsService = new WebSocketService(server);
  }
  return wsService;
}

export function getWebSocketService(): WebSocketService | null {
  return wsService;
}
