/**
 * Single source of truth for menu portrait thumb crops.
 * Used by generate-coach-portrait-thumbs.mjs, preview script, and coachPortraitCrop.test.ts.
 */

export const THUMB_SIZE = 192;

/** @typedef {{ focusY: number, thumbScale?: number, post?: { brightness?: number, saturation?: number } }} CoachThumbCrop */

/** @type {Record<string, CoachThumbCrop>} */
export const COACH_THUMB_CROPS = {
  magnus: { focusY: 14 },
  sofia: { focusY: 14 },
  arjun: { focusY: 15 },
  leila: { focusY: 14, post: { brightness: 1.06, saturation: 1.04 } },
};

export const BUILTIN_COACH_IDS = ['magnus', 'sofia', 'arjun', 'leila'];

/** Mirrors CSS object-fit: cover + object-position: center {focusY}% (thumb generation only). */
export function coverCropRect(width, height, size, focusYPercent) {
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

export function sourceFileForCoach(coachId) {
  return `${coachId}.png`;
}

export function thumbFileForCoach(coachId) {
  return `${coachId}-thumb.png`;
}
