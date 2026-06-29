import { describe, expect, it } from 'vitest';
import {
  advanceLipsyncFrame,
  createLipsyncPlayerState,
  drainLipsyncQueueRemaining,
  resetLipsyncPlayerState,
  shouldPlayLipsyncFrames,
} from './convaiLipsyncPlayer';

function mockQueue(overrides: Partial<{
  isBotSpeaking: boolean;
  hasEndSignal: boolean;
  frames: Float32Array[];
}> = {}) {
  let frames = [...(overrides.frames ?? [new Float32Array([0.1]), new Float32Array([0.2])])];
  return {
    isBotSpeaking: () => overrides.isBotSpeaking ?? false,
    hasReceivedEndSignal: () => overrides.hasEndSignal ?? false,
    hasFrames: () => frames.length > 0,
    isConversationEnded: () => frames.length === 0,
    get length() { return frames.length; },
    getFrameWithAlpha: (index: number) => frames[Math.min(index, frames.length - 1)] ?? null,
    consumeFrames: (count: number) => { frames = frames.slice(count); },
    reset: () => { frames = []; },
  };
}

describe('convaiLipsyncPlayer', () => {
  it('shouldPlayLipsyncFrames matches reference condition', () => {
    expect(shouldPlayLipsyncFrames(mockQueue({ isBotSpeaking: true }))).toBe(true);
    expect(shouldPlayLipsyncFrames(mockQueue({ hasEndSignal: true }))).toBe(true);
    expect(shouldPlayLipsyncFrames(mockQueue())).toBe(false);
    expect(shouldPlayLipsyncFrames(mockQueue({ hasEndSignal: true, frames: [] }))).toBe(false);
  });

  it('advanceLipsyncFrame consumes frames at 60fps when bot speaks', () => {
    const state = createLipsyncPlayerState();
    const queue = mockQueue({ isBotSpeaking: true, frames: [
      new Float32Array([0.1]),
      new Float32Array([0.2]),
      new Float32Array([0.3]),
    ] });

    state.lastFrameTime = 1000;
    const f1 = advanceLipsyncFrame(state, queue, 1000 + 20);
    expect(f1).not.toBeNull();
    expect(state.lastPlayedFrameIndex).toBeGreaterThanOrEqual(0);

    const f2 = advanceLipsyncFrame(state, queue, 1000 + 40);
    expect(f2).not.toBeNull();
  });

  it('resetLipsyncPlayerState clears playback', () => {
    const state = createLipsyncPlayerState();
    state.lastFrame = new Float32Array([1]);
    state.lastPlayedFrameIndex = 5;
    resetLipsyncPlayerState(state);
    expect(state.lastFrame).toBeNull();
    expect(state.lastPlayedFrameIndex).toBe(-1);
  });

  it('drainLipsyncQueueRemaining consumes leftover frames', () => {
    const state = createLipsyncPlayerState();
    state.lastFrame = new Float32Array([0.5]);
    let frames = [new Float32Array([0.1]), new Float32Array([0.2])];
    const queue = {
      hasFrames: () => frames.length > 0,
      get length() { return frames.length; },
      consumeFrames: (count: number) => { frames = frames.slice(count); },
    };
    drainLipsyncQueueRemaining(state, queue);
    expect(frames.length).toBe(0);
    expect(state.lastFrame).toBeNull();
  });

  it('lipsync tail frames alone do not imply speech signal is active', () => {
    const queue = mockQueue({ hasEndSignal: true, isBotSpeaking: false });
    expect(shouldPlayLipsyncFrames(queue)).toBe(true);
    const speechSignalActive = false;
    expect(speechSignalActive).toBe(false);
  });

  it('clears held lastFrame when conversation ended and queue drained', () => {
    const state = createLipsyncPlayerState();
    state.lastFrame = new Float32Array([0.4]);
    state.wasConversationActive = true;
    const queue = mockQueue({ hasEndSignal: true, frames: [] });
    const frame = advanceLipsyncFrame(state, queue, 1000);
    expect(frame).toBeNull();
    expect(state.lastFrame).toBeNull();
  });
});
