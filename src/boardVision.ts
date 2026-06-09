import { debugLog } from './debugLog';

const BOARD_VISION_ENABLED = import.meta.env.VITE_CONVAI_BOARD_VISION === 'true';
const DEFAULT_BOARD_SELECTOR = '.game-stage .chess-board';
const FALLBACK_BOARD_SELECTOR = '.chess-board';
const DEFAULT_FPS = 2;
const LIVE_REDRAW_MS = 500;

type BoardOrientation = 'w' | 'b';

const PIECE_GLYPHS: Record<string, string> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
  P: '♙',
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞',
  p: '♟',
};

export type BoardVisionSession = {
  refresh: () => boolean;
  updateFromFen: (fen: string, orientation?: BoardOrientation) => boolean;
  stop: () => void;
  isPublished: () => boolean;
};

export function isBoardVisionEnabled(): boolean {
  return BOARD_VISION_ENABLED;
}

/**
 * Experimental: capture the chess board DOM for Convai vision.
 * Requires enableVideo on the Convai client and vision enabled on the character in the dashboard.
 * Web SDK has no sendImage API — vision uses video/screen-share pipelines.
 */
export async function captureBoardCanvas(selector = '.chess-board'): Promise<HTMLCanvasElement | null> {
  const boardEl = findBoardElement(selector);
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

function findBoardElement(selector = DEFAULT_BOARD_SELECTOR): HTMLElement | null {
  return (
    document.querySelector(selector)
    ?? document.querySelector(FALLBACK_BOARD_SELECTOR)
  ) as HTMLElement | null;
}

async function waitForBoardElement(selector = DEFAULT_BOARD_SELECTOR, timeoutMs = 1500): Promise<HTMLElement | null> {
  const start = Date.now();
  let boardEl = findBoardElement(selector);
  while (!boardEl && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    boardEl = findBoardElement(selector);
  }
  return boardEl;
}

function sizeCanvasForBoard(canvas: HTMLCanvasElement, boardEl: HTMLElement): { width: number; height: number } {
  const rect = boardEl.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}

function renderBoardFromDom(
  boardEl: HTMLElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  const squares = boardEl.querySelectorAll('.square');
  if (!squares.length) return false;
  ctx.clearRect(0, 0, width, height);
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

function renderBoardFromFen(
  fen: string,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  orientation: BoardOrientation,
): boolean {
  const placement = fen.trim().split(/\s+/)[0];
  if (!placement) return false;

  const ranks = placement.split('/');
  if (ranks.length !== 8) return false;

  ctx.clearRect(0, 0, width, height);
  const squareW = width / 8;
  const squareH = height / 8;

  for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
    for (let fileIndex = 0; fileIndex < 8; fileIndex++) {
      const visualFile = orientation === 'w' ? fileIndex : 7 - fileIndex;
      const visualRank = orientation === 'w' ? rankIndex : 7 - rankIndex;
      const isLight = (rankIndex + fileIndex) % 2 === 0;
      ctx.fillStyle = isLight ? '#e3cfa6' : '#6d7a55';
      ctx.fillRect(visualFile * squareW, visualRank * squareH, squareW, squareH);
    }
  }

  for (let fenRankIndex = 0; fenRankIndex < 8; fenRankIndex++) {
    const rankText = ranks[fenRankIndex];
    let fileIndex = 0;
    for (const token of rankText) {
      const empty = Number(token);
      if (Number.isInteger(empty) && empty > 0) {
        fileIndex += empty;
        continue;
      }

      if (fileIndex > 7) return false;
      const visualFile = orientation === 'w' ? fileIndex : 7 - fileIndex;
      const visualRank = orientation === 'w' ? fenRankIndex : 7 - fenRankIndex;
      const x = visualFile * squareW;
      const y = visualRank * squareH;

      const glyph = PIECE_GLYPHS[token];
      if (glyph) {
        const isWhite = token === token.toUpperCase();
        ctx.fillStyle = isWhite ? '#f8f8f2' : '#1a1a1a';
        ctx.strokeStyle = isWhite ? '#333' : '#f8f8f2';
        ctx.lineWidth = 1;
        ctx.font = `bold ${Math.floor(squareH * 0.62)}px "Segoe UI Symbol", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const cx = x + squareW / 2;
        const cy = y + squareH / 2;
        ctx.strokeText(glyph, cx, cy);
        ctx.fillText(glyph, cx, cy);
      }

      fileIndex += 1;
    }
    if (fileIndex !== 8) return false;
  }

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
 * Publish a live board canvas track to the Convai LiveKit room.
 * The canvas is redrawn while connected, so the published track follows moves
 * instead of freezing at the initial DOM snapshot.
 */
export async function publishBoardVisionTrack(client: any, selector = DEFAULT_BOARD_SELECTOR): Promise<BoardVisionSession | null> {
  if (!BOARD_VISION_ENABLED) return null;

  const boardEl = await waitForBoardElement(selector);
  if (!boardEl) {
    debugLog('BoardVision', 'Board element not found');
    return null;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const { width, height } = sizeCanvasForBoard(canvas, boardEl);
  if (!renderBoardFromDom(boardEl, ctx, width, height)) return null;

  const stream = createBoardMediaStream(canvas, DEFAULT_FPS);
  if (!stream) return null;

  const room = client?.room;
  const localParticipant = room?.localParticipant;
  if (!localParticipant?.publishTrack) {
    debugLog('BoardVision', 'Room does not expose publishTrack — vision spike needs manual screen-share test');
    stream.getTracks().forEach((track) => track.stop());
    return null;
  }

  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return null;

  let published = false;
  let latestFen = '';
  let latestOrientation: BoardOrientation = 'w';
  let redrawTimer: ReturnType<typeof window.setInterval> | null = null;

  const requestFrame = () => {
    (videoTrack as CanvasCaptureMediaStreamTrack & { requestFrame?: () => void }).requestFrame?.();
  };

  const refresh = () => {
    const currentBoard = findBoardElement(selector);
    if (!currentBoard) return false;
    const nextSize = sizeCanvasForBoard(canvas, currentBoard);
    const rendered = latestFen
      ? renderBoardFromFen(latestFen, ctx, nextSize.width, nextSize.height, latestOrientation)
      : renderBoardFromDom(currentBoard, ctx, nextSize.width, nextSize.height);
    if (rendered) requestFrame();
    return rendered;
  };

  const updateFromFen = (fen: string, orientation: BoardOrientation = 'w') => {
    if (!fen.trim()) return false;
    latestFen = fen;
    latestOrientation = orientation;
    const currentBoard = findBoardElement(selector);
    if (currentBoard) sizeCanvasForBoard(canvas, currentBoard);
    const rendered = renderBoardFromFen(latestFen, ctx, canvas.width, canvas.height, latestOrientation);
    if (rendered) requestFrame();
    return rendered;
  };

  const stop = () => {
    if (redrawTimer) {
      window.clearInterval(redrawTimer);
      redrawTimer = null;
    }
    try { localParticipant.unpublishTrack?.(videoTrack); } catch {}
    stream.getTracks().forEach((track) => track.stop());
    published = false;
  };

  try {
    await localParticipant.publishTrack(videoTrack, { name: 'chess-board', simulcast: false });
    published = true;
    redrawTimer = window.setInterval(refresh, LIVE_REDRAW_MS);
    debugLog('BoardVision', `Published live board video track to Convai room (${width}x${height} @ ${DEFAULT_FPS}fps)`);
    return {
      refresh,
      updateFromFen,
      stop,
      isPublished: () => published,
    };
  } catch (err) {
    debugLog('BoardVision', 'publishTrack failed', err);
    stream.getTracks().forEach((track) => track.stop());
    return null;
  }
}
