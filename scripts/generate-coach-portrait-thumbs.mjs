import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import {
  BUILTIN_COACH_IDS,
  COACH_THUMB_CROPS,
  THUMB_SIZE,
  coverCropRect,
  sourceFileForCoach,
  thumbFileForCoach,
} from './coachPortraitCrop.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTRAIT_DIR = path.join(ROOT, 'public', 'coach-portraits');

async function buildThumb(coachId) {
  const fileName = sourceFileForCoach(coachId);
  const inputPath = path.join(PORTRAIT_DIR, fileName);
  const outputPath = path.join(PORTRAIT_DIR, thumbFileForCoach(coachId));
  const cropCfg = COACH_THUMB_CROPS[coachId] ?? { focusY: 14 };
  const meta = await sharp(inputPath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error(`Missing dimensions for ${fileName}`);

  const crop = coverCropRect(width, height, THUMB_SIZE, cropCfg.focusY);

  let pipeline = sharp(inputPath)
    .resize(crop.scaledWidth, crop.scaledHeight, { kernel: sharp.kernel.lanczos3 })
    .extract({ left: crop.left, top: crop.top, width: THUMB_SIZE, height: THUMB_SIZE });
  if (cropCfg.post) pipeline = pipeline.modulate(cropCfg.post);

  await pipeline
    .sharpen({ sigma: 0.35, m1: 0.5, m2: 0.4 })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);

  const outStat = fs.statSync(outputPath);
  console.log(`${fileName} -> ${path.basename(outputPath)} (${THUMB_SIZE}x${THUMB_SIZE}, focusY=${cropCfg.focusY}, ${Math.round(outStat.size / 1024)}KB)`);
}

const argCoach = process.argv[2]?.toLowerCase();
const coaches = argCoach ? [argCoach] : BUILTIN_COACH_IDS;

for (const coachId of coaches) {
  const fileName = sourceFileForCoach(coachId);
  if (!fs.existsSync(path.join(PORTRAIT_DIR, fileName))) {
    console.warn(`Skip missing ${fileName}`);
    continue;
  }
  await buildThumb(coachId);
}
