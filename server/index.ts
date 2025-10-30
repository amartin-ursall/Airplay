import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { userRoutes } from './routes/user-routes';
import { fileRoutes } from './routes/file-routes';
import { startFTPServer, FTPServerService } from './services/ftp-server';
import { db } from './db/in-memory-db';
import type { ClientErrorReport } from '../shared/types';

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

// Not found handler
app.notFound((c) => c.json({ success: false, error: 'Not Found' }, 404));

// Error handler
app.onError((err, c) => {
  console.error(`[ERROR] ${err}`);
  return c.json({ success: false, error: 'Internal Server Error' }, 500);
});

const port = 5000; // Puerto para backend API
const ftpPort = 5001; // Puerto FTP (puerto 21 requiere privilegios de administrador)

// Iniciar servidor HTTP con límites aumentados para soportar archivos grandes
console.log(`\n========================================`);
console.log(`🚀 Servidor HTTP (Backend API) iniciado`);
console.log(`   URL: http://localhost:${port}`);
console.log(`   Soporta archivos hasta 350MB (chunks de 512KB)`);
console.log(`   Timeout: 2 minutos por request`);
console.log(`========================================\n`);

serve({
  fetch: app.fetch,
  port,
  // Aumentar límites para soportar chunks de archivos grandes
  maxRequestBodySize: 512 * 1024 * 1024, // 512MB para estar seguros (chunks de 1MB + overhead)
  // Increase timeout for large file chunks
  requestTimeout: 120000 // 2 minutes timeout per request
});

// Iniciar servidor FTP
(async () => {
  try {
    await startFTPServer(ftpPort, '0.0.0.0');
    console.log(`\n========================================`);
    console.log(`📁 Servidor FTP iniciado`);
    console.log(`   Host: ftp://localhost:${ftpPort}`);
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
