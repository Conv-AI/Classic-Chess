import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const LOG_FILE = path.resolve(__dirname, 'debug.log');

function logServerPlugin(datasetToolsEnabled: boolean): Plugin {
  return {
    name: 'chess-log-server',
    configureServer(server) {
      // Truncate debug.log on every dev-server start so the file only contains the most
      // recent run. Previous sessions are gone — keep what's useful, ditch the noise.
      fs.writeFileSync(LOG_FILE, `=== Debug log session started ${new Date().toISOString()} ===\n`);

      server.middlewares.use('/api/log', (req, res) => {
        if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const lines: string[] = JSON.parse(body);
            fs.appendFileSync(LOG_FILE, lines.join('\n') + '\n');
          } catch {}
          res.writeHead(204);
          res.end();
        });
      });

      if (datasetToolsEnabled) {
        const DATASET_FILE = path.resolve(__dirname, 'dataset.json');

        server.middlewares.use('/api/dataset', (req, res) => {
          if (req.method === 'GET') {
            try {
              if (fs.existsSync(DATASET_FILE)) {
                const data = fs.readFileSync(DATASET_FILE, 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(data);
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end('[]');
              }
            } catch {
              res.writeHead(500);
              res.end('Error reading dataset');
            }
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
            req.on('end', () => {
              try {
                const item = JSON.parse(body);
                let dataset: unknown[] = [];
                if (fs.existsSync(DATASET_FILE)) {
                  const parsed = JSON.parse(fs.readFileSync(DATASET_FILE, 'utf-8'));
                  if (Array.isArray(parsed)) dataset = parsed;
                }
                dataset.push(item);
                fs.writeFileSync(DATASET_FILE, JSON.stringify(dataset, null, 2), 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, count: dataset.length }));
              } catch {
                res.writeHead(400);
                res.end('Invalid JSON or write error');
              }
            });
            return;
          }

          if (req.method === 'DELETE') {
            let body = '';
            req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
            req.on('end', () => {
              try {
                const payload = JSON.parse(body);
                if (payload.clearAll) {
                  fs.writeFileSync(DATASET_FILE, '[]', 'utf-8');
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, count: 0 }));
                } else if (payload.timestamp) {
                  let dataset: Array<{ timestamp?: string }> = [];
                  if (fs.existsSync(DATASET_FILE)) {
                    const parsed = JSON.parse(fs.readFileSync(DATASET_FILE, 'utf-8'));
                    if (Array.isArray(parsed)) dataset = parsed;
                  }
                  const filtered = dataset.filter((entry) => entry.timestamp !== payload.timestamp);
                  fs.writeFileSync(DATASET_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, count: filtered.length }));
                } else {
                  res.writeHead(400);
                  res.end('Missing clearAll or timestamp');
                }
              } catch {
                res.writeHead(400);
                res.end('Invalid delete payload');
              }
            });
            return;
          }

          res.writeHead(405);
          res.end();
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const datasetToolsEnabled = mode === 'dataset';

  return {
    base: './',
    define: {
      __DATASET_TOOLS_ENABLED__: JSON.stringify(datasetToolsEnabled),
    },
    plugins: [react(), logServerPlugin(datasetToolsEnabled)],
  };
});
