/** Per-coach lipsync playback state — single 60fps consume clock (Convai reference pattern). */

export type ConvaiLipsyncPlayerState = {
  lastFrameTime: number;
  accumulatedTimeMs: number;
  lastPlayedFrameIndex: number;
  wasConversationActive: boolean;
  hasEmittedConversationEnded: boolean;
  lastFrame: Float32Array | null;
};

const FRAME_DURATION_MS = 1000 / 60;
const FRAME_OFFSET = 0;

export function createLipsyncPlayerState(): ConvaiLipsyncPlayerState {
  return {
    lastFrameTime: 0,
    accumulatedTimeMs: 0,
    lastPlayedFrameIndex: -1,
    wasConversationActive: false,
    hasEmittedConversationEnded: false,
    lastFrame: null,
  };
}

export function resetLipsyncPlayerState(state: ConvaiLipsyncPlayerState): void {
  state.lastFrameTime = 0;
  state.accumulatedTimeMs = 0;
  state.lastPlayedFrameIndex = -1;
  state.wasConversationActive = false;
  state.hasEmittedConversationEnded = false;
  state.lastFrame = null;
}

/** Reference: isBotSpeaking || (hasReceivedEndSignal && hasFrames). */
export function shouldPlayLipsyncFrames(queue: {
  isBotSpeaking?: () => boolean;
  hasReceivedEndSignal?: () => boolean;
  hasFrames?: () => boolean;
} | null | undefined): boolean {
  if (!queue) return false;
  const isBotSpeaking = typeof queue.isBotSpeaking === 'function' ? queue.isBotSpeaking() : false;
  const hasEndSignal = typeof queue.hasReceivedEndSignal === 'function'
    ? queue.hasReceivedEndSignal()
    : false;
  const hasFrames = typeof queue.hasFrames === 'function' ? queue.hasFrames() : false;
  return isBotSpeaking || (hasEndSignal && hasFrames);
}

function getQueueLength(queue: {
  length?: number;
  getLength?: () => number;
}): number {
  if (typeof queue.length === 'number') return queue.length;
  if (typeof queue.getLength === 'function') return queue.getLength();
  return 0;
}

/**
 * Advance lipsync by one display tick. Returns the current blendshape frame to apply,
 * or the last held frame while waiting for the next 60fps slot.
 */
export function advanceLipsyncFrame(
  state: ConvaiLipsyncPlayerState,
  queue: {
    isBotSpeaking?: () => boolean;
    hasReceivedEndSignal?: () => boolean;
    hasFrames?: () => boolean;
    isConversationEnded?: () => boolean;
    length?: number;
    getLength?: () => number;
    getFrameWithAlpha?: (index: number) => Float32Array | null;
    consumeFrames?: (count: number) => void;
    reset?: () => void;
  },
  currentTime: number = performance.now(),
): Float32Array | null {
  const isBotSpeaking = typeof queue.isBotSpeaking === 'function' ? queue.isBotSpeaking() : false;
  const hasEndSignal = typeof queue.hasReceivedEndSignal === 'function'
    ? queue.hasReceivedEndSignal()
    : false;

  if (isBotSpeaking && !state.wasConversationActive) {
    state.lastFrameTime = currentTime;
    state.accumulatedTimeMs = 0;
    state.lastPlayedFrameIndex = -1;
    state.wasConversationActive = true;
    state.hasEmittedConversationEnded = false;
    state.lastFrame = null;
  }

  if (!isBotSpeaking && state.wasConversationActive && hasEndSignal) {
    state.wasConversationActive = false;
    state.lastFrameTime = 0;
    state.accumulatedTimeMs = 0;
    state.lastPlayedFrameIndex = -1;
    if (typeof queue.hasFrames === 'function' && !queue.hasFrames() && typeof queue.reset === 'function') {
      queue.reset();
    }
  }

  const isEnded = typeof queue.isConversationEnded === 'function' ? queue.isConversationEnded() : false;
  if (isEnded && !state.hasEmittedConversationEnded) {
    state.hasEmittedConversationEnded = true;
  }

  const shouldPlay = shouldPlayLipsyncFrames(queue);
  if (!shouldPlay) {
    return state.lastFrame;
  }

  if (state.lastFrameTime > 0 && shouldPlay) {
    const delta = currentTime - state.lastFrameTime;
    state.lastFrameTime = currentTime;

    if (typeof queue.hasFrames === 'function' && queue.hasFrames()) {
      if (state.lastPlayedFrameIndex === -1) {
        state.accumulatedTimeMs = 0;
      } else {
        state.accumulatedTimeMs += delta;
      }

      const targetFrameIndex = Math.floor(state.accumulatedTimeMs / FRAME_DURATION_MS);

      if (targetFrameIndex > state.lastPlayedFrameIndex) {
        const framesToSkip = targetFrameIndex - state.lastPlayedFrameIndex;
        const queueLength = getQueueLength(queue);

        if (framesToSkip > 1 && queueLength < framesToSkip) {
          const offsetIndex = Math.min(
            queueLength - 1 + FRAME_OFFSET,
            Math.max(0, queueLength - 1),
          );
          const frameToPlay = typeof queue.getFrameWithAlpha === 'function'
            ? queue.getFrameWithAlpha(offsetIndex)
            : null;
          if (frameToPlay) state.lastFrame = frameToPlay;
          if (typeof queue.consumeFrames === 'function' && queueLength > 0) {
            queue.consumeFrames(queueLength);
          }
        } else {
          const framesToConsume = Math.min(framesToSkip, queueLength);
          const baseFrameIndex = Math.min(framesToConsume - 1, Math.max(0, queueLength - 1));
          const frameIndex = Math.min(
            baseFrameIndex + FRAME_OFFSET,
            Math.max(0, queueLength - 1),
          );
          const frameToPlay = typeof queue.getFrameWithAlpha === 'function'
            ? queue.getFrameWithAlpha(frameIndex)
            : null;
          if (frameToPlay) state.lastFrame = frameToPlay;
          if (typeof queue.consumeFrames === 'function' && framesToConsume > 0) {
            queue.consumeFrames(framesToConsume);
          }
        }

        state.lastPlayedFrameIndex = targetFrameIndex;
      }
    }
  } else if (shouldPlay && state.lastFrameTime === 0) {
    state.lastFrameTime = currentTime;
  }

  return state.lastFrame;
}

export function isLipsyncPlayerActive(
  state: ConvaiLipsyncPlayerState,
  queue: Parameters<typeof shouldPlayLipsyncFrames>[0],
): boolean {
  return shouldPlayLipsyncFrames(queue) || state.lastFrame !== null;
}
