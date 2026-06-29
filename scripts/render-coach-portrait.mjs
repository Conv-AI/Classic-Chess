/**
 * Render menu portrait PNGs from coach GLB files (Playwright + Three.js).
 * Usage: node scripts/render-coach-portrait.mjs [coachId]
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const PORTRAIT_DIR = path.join(PUBLIC, 'coach-portraits');
const THREE_VENDOR = path.join(ROOT, 'node_modules/three');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

function startStaticServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://localhost');
        let filePath = '';
        if (url.pathname === '/' || url.pathname === '/capture') {
          filePath = path.join(ROOT, 'scripts', 'portrait-capture.html');
        } else if (url.pathname.startsWith('/vendor/three/')) {
          filePath = path.join(THREE_VENDOR, url.pathname.replace('/vendor/three/', ''));
        } else if (url.pathname.startsWith('/draco/')) {
          filePath = path.join(THREE_VENDOR, 'examples/jsm/libs/draco/gltf', url.pathname.replace('/draco/', ''));
        } else {
          filePath = path.join(PUBLIC, decodeURIComponent(url.pathname.replace(/^\//, '')));
        }

        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

async function renderCoachPortrait(coachId) {
  const { server, port } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });

  try {
    await page.goto(`http://127.0.0.1:${port}/capture?coach=${encodeURIComponent(coachId)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 300000,
    });
    await page.waitForFunction(() => window.__PORTRAIT_READY__ === true, { timeout: 300000 });

    const error = await page.evaluate(() => window.__PORTRAIT_ERROR__ || '');
    if (error) throw new Error(error);

    const dataUrl = await page.evaluate(() => window.__PORTRAIT_DATA_URL__);
    if (!dataUrl?.startsWith('data:image/png;base64,')) {
      throw new Error('Portrait render did not produce a PNG data URL');
    }

    const pngBuffer = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    const outputPath = path.join(PORTRAIT_DIR, `${coachId}.png`);
    await sharp(pngBuffer)
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(outputPath);

    const stat = fs.statSync(outputPath);
    console.log(`Rendered ${coachId}.png (1200x1600, ${Math.round(stat.size / 1024)}KB) -> ${outputPath}`);
  } finally {
    await browser.close();
    server.close();
  }
}

const coachId = (process.argv[2] || 'leila').toLowerCase();
await renderCoachPortrait(coachId);
