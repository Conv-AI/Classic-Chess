import { debugLog } from './debugLog';

const BOARD_VISION_ENABLED = import.meta.env.VITE_CONVAI_BOARD_VISION === 'true';

export function isBoardVisionEnabled(): boolean {
  return BOARD_VISION_ENABLED;
}

/**
 * Experimental: capture the chess board DOM for Convai vision.
 * Requires enableVideo on the Convai client and vision enabled on the character in the dashboard.
 * Web SDK has no sendImage API — vision uses video/screen-share pipelines.
 */
export async function captureBoardCanvas(selector = '.chess-board'): Promise<HTMLCanvasElement | null> {
  const boardEl = document.querySelector(selector) as HTMLElement | null;
  if (!boardEl) {
    debugLog('BoardVision', 'Board element not found');
    return null;
  }

  const rect = boardEl.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const rendered = renderBoardFromDom(boardEl, ctx, width, height);
  if (!rendered) return null;
  debugLog('BoardVision', `Captured board ${width}x${height}`);
  return canvas;
}

function renderBoardFromDom(
  boardEl: HTMLElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  const squares = boardEl.querySelectorAll('.square');
  if (!squares.length) return false;
  const squareW = width / 8;
  const squareH = height / 8;

  squares.forEach((sq) => {
    const el = sq as HTMLElement;
    const style = getComputedStyle(el);
    const bg = style.backgroundColor || (el.classList.contains('light') ? '#f0d9b5' : '#b58863');
    const label = el.getAttribute('aria-label') ?? '';
    const file = label.charCodeAt(0) - 97;
    const rank = Number(label[1]);
    if (file < 0 || file > 7 || !rank) return;
    const row = 8 - rank;
    ctx.fillStyle = bg;
    ctx.fillRect(file * squareW, row * squareH, squareW, squareH);

    const piece = el.querySelector('.piece');
    if (piece) {
      ctx.fillStyle = piece.classList.contains('white-piece') ? '#f8f8f2' : '#1a1a1a';
      ctx.strokeStyle = piece.classList.contains('white-piece') ? '#333' : '#f8f8f2';
      ctx.lineWidth = 1;
      ctx.font = `bold ${Math.floor(squareH * 0.62)}px "Segoe UI Symbol", serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const glyph = piece.textContent ?? '';
      const cx = file * squareW + squareW / 2;
      const cy = row * squareH + squareH / 2;
      ctx.strokeText(glyph, cx, cy);
      ctx.fillText(glyph, cx, cy);
    }
  });

  return true;
}

export function createBoardMediaStream(canvas: HTMLCanvasElement, fps = 1): MediaStream | null {
  try {
    return canvas.captureStream(fps);
  } catch (err) {
    debugLog('BoardVision', 'captureStream failed', err);
    return null;
  }
}

/**
 * Attempt to publish a board video track to the Convai LiveKit room.
 * Returns true when a track was published; false when unsupported or failed.
 */
export async function publishBoardVisionTrack(client: any, selector = '.chess-board'): Promise<boolean> {
  if (!BOARD_VISION_ENABLED) return false;
  const canvas = await captureBoardCanvas(selector);
  if (!canvas) return false;
  const stream = createBoardMediaStream(canvas, 1);
  if (!stream) return false;

  const room = client?.room;
  const localParticipant = room?.localParticipant;
  if (!localParticipant?.publishTrack) {
    debugLog('BoardVision', 'Room does not expose publishTrack — vision spike needs manual screen-share test');
    return false;
  }

  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return false;

  try {
    await localParticipant.publishTrack(videoTrack, { name: 'chess-board', simulcast: false });
    debugLog('BoardVision', 'Published board video track to Convai room');
    return true;
  } catch (err) {
    debugLog('BoardVision', 'publishTrack failed', err);
    return false;
  }
}
