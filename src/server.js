/**
 * Antigravity Sync Server
 * Provides REST and SSE/Streaming synchronization endpoints for multi-party collaboration.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SyncEngine, PARTIES } from './sync-engine.js';
import { AIStudioImporter } from './ai-studio-importer.js';
import { GeminiService } from './gemini-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const PORT = process.env.PORT || 3000;
const storagePath = path.join(rootDir, 'data', 'shared-state.json');

export const syncEngine = new SyncEngine({ storagePath });
export const geminiService = new GeminiService({ syncEngine });
geminiService.bindSyncEngine(syncEngine);

// Set initial sample workspace files in shared state
syncEngine.update(PARTIES.WORKSPACE, 'workspace.activeFiles', [
  'src/sync-engine.js',
  'src/gemini-service.js',
  'src/ai-studio-importer.js',
  'index.html'
]);

// SSE client subscribers
const sseClients = new Set();

syncEngine.on('change', (change) => {
  const data = JSON.stringify(change);
  for (const res of sseClients) {
    res.write(`event: change\ndata: ${data}\n\n`);
  }
});

syncEngine.on('conflict', (conflict) => {
  const data = JSON.stringify(conflict);
  for (const res of sseClients) {
    res.write(`event: conflict\ndata: ${data}\n\n`);
  }
});

export const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Party-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  // SSE Stream for Real-time multi-party synchronization
  if (url.pathname === '/api/sync/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`event: init\ndata: ${JSON.stringify(syncEngine.getSnapshot())}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // Get full shared state snapshot
  if (url.pathname === '/api/sync/state' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(syncEngine.getSnapshot()));
    return;
  }

  // Apply state update from any party
  if (url.pathname === '/api/sync/update' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const party = body.party || req.headers['x-party-id'] || PARTIES.CLIENT;
      const result = syncEngine.update(party, body.path, body.value, body.meta || {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, change: result, state: syncEngine.state }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // AI Studio Importer Endpoint
  if (url.pathname === '/api/import/ai-studio' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const imported = AIStudioImporter.parse(body.content || body);

      // Update sync engine with imported project settings
      syncEngine.update(PARTIES.WORKSPACE, 'gemini.systemPrompt', imported.systemInstruction);
      syncEngine.update(PARTIES.WORKSPACE, 'gemini.activeModel', imported.model);
      syncEngine.update(PARTIES.WORKSPACE, 'gemini.generationConfig', imported.generationConfig);
      syncEngine.update(PARTIES.WORKSPACE, 'shared.importedProject', {
        name: imported.name,
        tools: imported.tools,
        importedAt: imported.importedAt
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        project: imported,
        nodeCode: AIStudioImporter.toNodeCode(imported),
        pythonCode: AIStudioImporter.toPythonCode(imported)
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Gemini AI inference endpoint
  if (url.pathname === '/api/gemini/run' && req.method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const response = await geminiService.generate({
        prompt: body.prompt,
        systemInstruction: body.systemInstruction || syncEngine.getByPath('gemini.systemPrompt'),
        model: body.model || syncEngine.getByPath('gemini.activeModel'),
        config: body.config || {}
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Health and System Status Endpoint
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: process.uptime(),
      syncSequence: syncEngine.sequence,
      partiesOnline: Object.keys(syncEngine.state.parties).length,
      conflictsResolved: syncEngine.conflicts.length,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Static File Serving
  serveStaticFile(req, res, url.pathname);
});

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on('error', reject);
  });
}

function serveStaticFile(req, res, pathname) {
  let safePath = pathname === '/' ? '/index.html' : pathname;
  safePath = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(rootDir, safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // If route doesn't match a static file, fallback to index.html for SPA
    const fallbackPath = path.join(rootDir, 'index.html');
    if (fs.existsSync(fallbackPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(fallbackPath));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => {
    console.log(`Antigravity Sync & AI Studio Server listening on port ${PORT}`);
  });
}
