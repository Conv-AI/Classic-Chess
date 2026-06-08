let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

export type UiSoundKind =
  | 'tap'
  | 'nav'
  | 'back'
  | 'confirm'
  | 'toggle'
  | 'send'
  | 'yourTurn';

type Tone = { freq: number; at: number; dur: number };

const SOUND_PROFILES: Record<UiSoundKind, { tones: Tone[]; volume: number }> = {
  tap: {
    volume: 0.028,
    tones: [{ freq: 440, at: 0, dur: 0.06 }],
  },
  nav: {
    volume: 0.038,
    tones: [
      { freq: 392, at: 0, dur: 0.07 },
      { freq: 523.25, at: 0.06, dur: 0.1 },
    ],
  },
  back: {
    volume: 0.034,
    tones: [
      { freq: 523.25, at: 0, dur: 0.07 },
      { freq: 392, at: 0.07, dur: 0.1 },
    ],
  },
  confirm: {
    volume: 0.042,
    tones: [
      { freq: 440, at: 0, dur: 0.08 },
      { freq: 554.37, at: 0.07, dur: 0.12 },
    ],
  },
  toggle: {
    volume: 0.032,
    tones: [
      { freq: 466.16, at: 0, dur: 0.05 },
      { freq: 587.33, at: 0.05, dur: 0.08 },
    ],
  },
  send: {
    volume: 0.04,
    tones: [
      { freq: 523.25, at: 0, dur: 0.07 },
      { freq: 659.25, at: 0.06, dur: 0.11 },
    ],
  },
  yourTurn: {
    volume: 0.045,
    tones: [
      { freq: 523.25, at: 0, dur: 0.1 },
      { freq: 659.25, at: 0.08, dur: 0.2 },
    ],
  },
};

function playTone(ctx: AudioContext, tone: Tone, volume: number, start: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  const t0 = start + tone.at;
  osc.frequency.setValueAtTime(tone.freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + tone.dur + 0.02);
}

/** Calm, premium UI sounds — each kind has a distinct gentle chime. */
export function playUiSound(kind: UiSoundKind): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const profile = SOUND_PROFILES[kind];
  const now = ctx.currentTime;
  for (const tone of profile.tones) {
    playTone(ctx, tone, profile.volume, now);
  }
}

/** @deprecated Use playUiSound('yourTurn') */
export function playYourTurnSound(): void {
  playUiSound('yourTurn');
}

/** Unlock audio on first user gesture (call from click handlers). */
export function unlockUiAudio(): void {
  void getAudioContext()?.resume();
}
