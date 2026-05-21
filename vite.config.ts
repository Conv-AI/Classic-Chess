import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const LOG_FILE = path.resolve(__dirname, 'debug.log');

// Soft cap on debug.log size — older sessions are rotated out when the file gets too large,
// so the log keeps accumulating across `npm run dev` restarts but never grows unbounded.
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB

function rotateLogIfTooLarge(): void {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size <= MAX_LOG_BYTES) return;
    const rotated = LOG_FILE.replace(/\.log$/, `.${Date.now()}.log`);
    fs.renameSync(LOG_FILE, rotated);
  } catch {
    // File does not exist yet — nothing to rotate.
  }
}

function logServerPlugin(datasetToolsEnabled: boolean): Plugin {
  return {
    name: 'chess-log-server',
    configureServer(server) {
      // Append a session marker to debug.log instead of overwriting it. This keeps the logs
      // from previous dev-server runs available so reported bugs can be diagnosed even after
      // the user has restarted the server.
      rotateLogIfTooLarge();
      fs.appendFileSync(LOG_FILE, `\n=== Debug log session started ${new Date().toISOString()} ===\n`);

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
                let dataset = [];
                if (fs.existsSync(DATASET_FILE)) {
                  dataset = JSON.parse(fs.readFileSync(DATASET_FILE, 'utf-8'));
                }
                dataset.push(item);
                fs.writeFileSync(DATASET_FILE, JSON.stringify(dataset, null, 2), 'utf-8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, count: dataset.length }));
              } catch (err) {
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
                  let dataset = [];
                  if (fs.existsSync(DATASET_FILE)) {
                    dataset = JSON.parse(fs.readFileSync(DATASET_FILE, 'utf-8'));
                  }
                  const filtered = dataset.filter((d: any) => d.timestamp !== payload.timestamp);
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
