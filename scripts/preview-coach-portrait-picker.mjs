/**
 * Build a 2×2 coach-picker preview PNG for visual inspection.
 * Output: misc/portrait-picker-preview.png (and per-coach strips in misc/portrait-debug/)
 *
 * Usage: node scripts/preview-coach-portrait-picker.mjs
 */
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
const OUT_DIR = path.join(ROOT, 'misc', 'portrait-debug');
const PREVIEW_PATH = path.join(ROOT, 'misc', 'portrait-picker-preview.png');

const PICKER_AVATAR_PX = 56;
const CARD_W = 280;
const CARD_H = 72;
const GRID_COLS = 2;
const GRID_ROWS = 2;
const PAD = 24;
const GAP = 16;

const COACH_LABELS = {
  magnus: ['Magnus', 'The Grandmaster'],
  sofia: ['Sofia', 'The Tactician'],
  arjun: ['Arjun', 'The Patient Teacher'],
  leila: ['Leila', 'The Strategist'],
};

/** How the menu displays pre-baked thumbs (no second object-position pass). */
async function renderMenuAvatar(thumbPath) {
  return sharp(thumbPath)
    .resize(PICKER_AVATAR_PX, PICKER_AVATAR_PX, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
}

async function buildThumbFromSource(coachId) {
  const sourceName = sourceFileForCoach(coachId);
  const sourcePath = path.join(PORTRAIT_DIR, sourceName);
  const cropCfg = COACH_THUMB_CROPS[coachId] ?? { focusY: 14 };
  const meta = await sharp(sourcePath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const crop = coverCropRect(width, height, THUMB_SIZE, cropCfg.focusY);
  let pipeline = sharp(sourcePath)
    .resize(crop.scaledWidth, crop.scaledHeight, { kernel: sharp.kernel.lanczos3 })
    .extract({ left: crop.left, top: crop.top, width: THUMB_SIZE, height: THUMB_SIZE });
  if (cropCfg.post) pipeline = pipeline.modulate(cropCfg.post);
  return pipeline.png().toBuffer();
}

function roundedRectSvg(w, h, r, fill, stroke) {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
    </svg>`,
  );
}

function circleMaskSvg(diameter) {
  const r = diameter / 2;
  return Buffer.from(
    `<svg width="${diameter}" height="${diameter}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${r}" cy="${r}" r="${r}" fill="white"/>
    </svg>`,
  );
}

async function analyzeThumb(buffer, coachId) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const rowMean = (y0, y1) => {
    let sum = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels;
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        count++;
      }
    }
    return count ? sum / count : 0;
  };
  const edgeMean = (x0, x1, y0, y1) => {
    let sum = 0;
    let count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * channels;
        sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
        count++;
      }
    }
    return count ? sum / count : 0;
  };

  const topMean = rowMean(0, Math.max(1, Math.floor(height * 0.12)));
  const midMean = rowMean(Math.floor(height * 0.35), Math.floor(height * 0.55));
  const leftEdge = edgeMean(0, Math.max(1, Math.floor(width * 0.08)), Math.floor(height * 0.55), Math.floor(height * 0.9));
  const rightEdge = edgeMean(Math.floor(width * 0.92), width, Math.floor(height * 0.55), Math.floor(height * 0.9));
  const skinTone = (v) => v >= 90 && v <= 185;
  const edgeSkinLike = skinTone(leftEdge) && skinTone(rightEdge) && Math.abs(leftEdge - rightEdge) < 18;

  return {
    coachId,
    topMean: Math.round(topMean),
    midMean: Math.round(midMean),
    leftEdge: Math.round(leftEdge),
    rightEdge: Math.round(rightEdge),
    /** Lower face dominates while upper band is much darker — chin-only crop. */
    headClippedSuspect: midMean > topMean + 28,
    /** Symmetric skin at lower sides — horizontal T-pose arms in circle. */
    tPoseSuspect: edgeSkinLike,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(PREVIEW_PATH), { recursive: true });

  const canvasW = PAD * 2 + GRID_COLS * CARD_W + (GRID_COLS - 1) * GAP;
  const canvasH = PAD * 2 + GRID_ROWS * CARD_H + (GRID_ROWS - 1) * GAP;
  const composites = [];
  const reports = [];

  for (let i = 0; i < BUILTIN_COACH_IDS.length; i++) {
    const coachId = BUILTIN_COACH_IDS[i];
    const col = i % GRID_COLS;
    const row = Math.floor(i / GRID_COLS);
    const cardX = PAD + col * (CARD_W + GAP);
    const cardY = PAD + row * (CARD_H + GAP);
    const avatarX = cardX + 12;
    const avatarY = cardY + Math.round((CARD_H - PICKER_AVATAR_PX) / 2);

    const thumbPath = path.join(PORTRAIT_DIR, thumbFileForCoach(coachId));
    const sourcePath = path.join(PORTRAIT_DIR, sourceFileForCoach(coachId));
    if (!fs.existsSync(thumbPath)) throw new Error(`Missing thumb: ${thumbPath}`);
    if (!fs.existsSync(sourcePath)) throw new Error(`Missing source: ${sourcePath}`);

    const thumbBuf = await fs.promises.readFile(thumbPath);
    const bakedBuf = await buildThumbFromSource(coachId);
    const menuBuf = await renderMenuAvatar(thumbPath);

    const stats = await analyzeThumb(thumbBuf, coachId);
    reports.push(stats);

    const sourceSmall = await sharp(sourcePath).resize(192, 256, { fit: 'inside' }).png().toBuffer();
    const menuLarge = await sharp(menuBuf).resize(112, 112, { kernel: sharp.kernel.nearest }).png().toBuffer();
    const stripW = 192 + 192 + 112 + 32;
    await sharp({
      create: { width: stripW, height: 280, channels: 3, background: { r: 34, g: 34, b: 34 } },
    })
      .composite([
        { input: sourceSmall, left: 8, top: 12 },
        { input: bakedBuf, left: 216, top: 44 },
        { input: menuLarge, left: 424, top: 84 },
      ])
      .png()
      .toFile(path.join(OUT_DIR, `${coachId}-pipeline.png`));

    const cardBg = roundedRectSvg(CARD_W, CARD_H, 14, '#2a241c', '#c9a22755');
    composites.push({ input: cardBg, left: cardX, top: cardY });

    const avatarCircle = await sharp(menuBuf)
      .composite([{ input: circleMaskSvg(PICKER_AVATAR_PX), blend: 'dest-in' }])
      .png()
      .toBuffer();
    composites.push({ input: avatarCircle, left: avatarX, top: avatarY });

    const [name, title] = COACH_LABELS[coachId];
    const labelSvg = Buffer.from(
      `<svg width="200" height="48" xmlns="http://www.w3.org/2000/svg">
        <text x="0" y="20" fill="#f4efe6" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700">${name}</text>
        <text x="0" y="40" fill="#c9a227" font-family="Segoe UI, Arial, sans-serif" font-size="12">${title}</text>
      </svg>`,
    );
    composites.push({ input: labelSvg, left: cardX + 80, top: cardY + 14 });
  }

  await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: '#1a1510',
    },
  })
    .composite(composites)
    .png()
    .toFile(PREVIEW_PATH);

  const reportPath = path.join(OUT_DIR, 'portrait-analysis.json');
  fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2));

  console.log(`Preview: ${PREVIEW_PATH}`);
  console.log(`Debug strips: ${OUT_DIR}`);
  console.log('Heuristic analysis (open preview PNG to confirm visually):');
  for (const r of reports) {
    const flags = [
      r.headClippedSuspect ? 'HEAD_CLIP?' : null,
      r.tPoseSuspect ? 'T_POSE?' : null,
    ].filter(Boolean).join(' ') || 'ok';
    console.log(`  ${r.coachId}: ${flags}  top=${r.topMean} mid=${r.midMean} edges=${r.leftEdge}/${r.rightEdge}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
