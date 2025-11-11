import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { networkInterfaces } from 'os';
import { userRoutes } from './routes/user-routes';
import { fileRoutes } from './routes/file-routes';
import { roomRoutes } from './routes/room-routes';
import { startFTPServer, FTPServerService } from './services/ftp-server';
import { db } from './db/database';
import { initWebSocketService } from './services/websocket-service';
import type { ClientErrorReport } from '../shared/types';
import { createServer } from 'http';

const app = new Hono();

app.use('*', logger());
app.use('/api/*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-Recipient-Id']
}));

// Health check
app.get('/api/health', (c) => c.json({
  success: true,
  data: { status: 'healthy', timestamp: new Date().toISOString() }
}));

// Error reporting
app.post('/api/client-errors', async (c) => {
  try {
    const e = await c.req.json<ClientErrorReport>();
    if (!e.message) return c.json({ success: false, error: 'Missing required fields' }, 400);
    console.error('[CLIENT ERROR]', JSON.stringify(e, null, 2));
    return c.json({ success: true });
  } catch (error) {
    console.error('[CLIENT ERROR HANDLER] Failed:', error);
    return c.json({ success: false, error: 'Failed to process' }, 500);
  }
});

// Register routes
userRoutes(app);
fileRoutes(app);
roomRoutes(app);

// Not found handler
app.notFound((c) => c.json({ success: false, error: 'Not Found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error(`[ERROR] ${err}`);
  return c.json({ success: false, error: 'Internal Server Error' }, 500);
});

const port = 5001; // Puerto para backend API
const ftpPort = 2121; // Puerto FTP alternativo (puerto 21 requiere privilegios de administrador)
const hostname = '0.0.0.0'; // Escuchar en todas las interfaces de red

// Obtener direcciones IP locales
const getNetworkAddresses = () => {
  const nets = networkInterfaces();
  const addresses: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
};

// Iniciar servidor HTTP con límites aumentados para soportar archivos grandes
const networkAddresses = getNetworkAddresses();
console.log(`\n========================================`);
console.log(`🚀 Servidor HTTP (Backend API) iniciando...`);
console.log(`========================================\n`);

const serverInfo = serve({
  fetch: app.fetch,
  port,
  hostname, // Escuchar en todas las interfaces
  // Aumentar límites para soportar chunks de archivos grandes
  maxRequestBodySize: 512 * 1024 * 1024, // 512MB para estar seguros (chunks de 1MB + overhead)
  // Increase timeout for large file chunks
  requestTimeout: 120000 // 2 minutes timeout per request
});

// Inicializar WebSocket usando el servidor HTTP de Node
initWebSocketService(serverInfo);

console.log(`\n========================================`);
console.log(`✅ Servidor HTTP iniciado correctamente`);
console.log(`   Local:   http://localhost:${port}`);
networkAddresses.forEach(addr => {
  console.log(`   Network: http://${addr}:${port}`);
});
console.log(`   Archivos: hasta 350MB (chunks de 512KB)`);
console.log(`   Timeout: 2 minutos por request`);
console.log(`   Base de datos: SQLite con persistencia`);
console.log(`========================================\n`);

console.log(`========================================`);
console.log(`🔌 WebSocket iniciado correctamente`);
console.log(`   Local:   ws://localhost:${port}/ws`);
networkAddresses.forEach(addr => {
  console.log(`   Network: ws://${addr}:${port}/ws`);
});
console.log(`   Mensajes en tiempo real habilitados`);
console.log(`========================================\n`);

// Iniciar servidor FTP
(async () => {
  try {
    await startFTPServer(ftpPort, '0.0.0.0');
    const networkAddressesFTP = getNetworkAddresses();
    console.log(`\n========================================`);
    console.log(`📁 Servidor FTP iniciado`);
    console.log(`   Local:   ftp://localhost:${ftpPort}`);
    networkAddressesFTP.forEach(addr => {
      console.log(`   Network: ftp://${addr}:${ftpPort}`);
    });
    console.log(`   Usuario: cualquier nombre`);
    console.log(`   Contraseña: airplay`);
    console.log(`========================================\n`);

    // Sincronizar conversaciones existentes
    const conversations = db.getAllConversations();
    const users = db.getAllUsers();
    const userNamesMap = new Map(users.map(u => [u.id, u.name]));

    if (conversations.length > 0) {
      await FTPServerService.syncExistingConversations(conversations, userNamesMap);
    }
  } catch (error) {
    console.error('\n[ERROR] No se pudo iniciar el servidor FTP:', error);
    console.log('Continuando solo con servidor HTTP...\n');
  }
})();
