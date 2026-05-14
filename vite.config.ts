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

function logServerPlugin(): Plugin {
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
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), logServerPlugin()],
});
