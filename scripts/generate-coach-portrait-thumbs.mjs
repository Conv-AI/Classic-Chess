import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTRAIT_DIR = path.join(ROOT, 'public', 'coach-portraits');
const THUMB_SIZE = 192;

/** Mirrors CSS object-fit: cover + object-position: center {focusY}%. */
function coverCropRect(width, height, size, focusYPercent) {
  const scale = Math.max(size / width, size / height);
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const left = Math.round(Math.min(Math.max((scaledWidth - size) / 2, 0), scaledWidth - size));
  const focusY = height * (focusYPercent / 100);
  const top = Math.round(Math.min(Math.max(scale * focusY - size / 2, 0), scaledHeight - size));
  return {
    scaledWidth: Math.round(scaledWidth),
    scaledHeight: Math.round(scaledHeight),
    left,
    top,
  };
}

const PORTRAIT_FOCUS = {
  'magnus.png': 12,
  'sofia.png': 14,
  'arjun.png': 15,
  'leila.png': 13,
};

async function buildThumb(fileName) {
  const inputPath = path.join(PORTRAIT_DIR, fileName);
  const outputPath = path.join(PORTRAIT_DIR, fileName.replace(/\.png$/i, '-thumb.png'));
  const meta = await sharp(inputPath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error(`Missing dimensions for ${fileName}`);

  const focusY = PORTRAIT_FOCUS[fileName] ?? 14;
  const crop = coverCropRect(width, height, THUMB_SIZE, focusY);

  await sharp(inputPath)
    .resize(crop.scaledWidth, crop.scaledHeight, { kernel: sharp.kernel.lanczos3 })
    .extract({ left: crop.left, top: crop.top, width: THUMB_SIZE, height: THUMB_SIZE })
    .sharpen({ sigma: 0.35, m1: 0.5, m2: 0.4 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);

  const outStat = fs.statSync(outputPath);
  console.log(`${fileName} -> ${path.basename(outputPath)} (${THUMB_SIZE}x${THUMB_SIZE}, ${Math.round(outStat.size / 1024)}KB)`);
}

const portraits = fs
  .readdirSync(PORTRAIT_DIR)
  .filter((name) => name.endsWith('.png') && !name.endsWith('-thumb.png'));

for (const fileName of portraits) {
  await buildThumb(fileName);
}
