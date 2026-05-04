import { buildCoachInstruction } from './chessAi';
import { COACHES, type CoachConfig, type CoachId, type DifficultyConfig } from './coachConfig';
import { debugLog } from './debugLog';

const API_KEY = import.meta.env.VITE_CONVAI_API_KEY as string;

export type ConvaiResponse = {
  coachId: CoachId;
  characterName: string;
  text: string;
};

type ResponseListener = (response: ConvaiResponse) => void;
type StatusListener = (status: ReturnType<ChessConvaiManager['getStatus']>) => void;

type CoachConnection = {
  coach: CoachConfig;
  client: any;
  audioRenderer: any;
  connected: boolean;
  connecting: boolean;
  botReady: boolean;
  isSpeaking: boolean;
  streamBuffer: string;
  lastEmittedText: string;
  longestResponseText: string;
  hasFlushed: boolean;
  unsubFns: Array<() => void>;
  lipsyncIndex: number;
  lipsyncLastTime: number;
  lipsyncAccum: number;
  lipsyncActive: boolean;
  lastConversationId: number;
};

function createConnection(coach: CoachConfig): CoachConnection {
  return {
    coach,
    client: null,
    audioRenderer: null,
    connected: false,
    connecting: false,
    botReady: false,
    isSpeaking: false,
    streamBuffer: '',
    lastEmittedText: '',
    longestResponseText: '',
    hasFlushed: false,
    unsubFns: [],
    lipsyncIndex: 0,
    lipsyncLastTime: 0,
    lipsyncAccum: 0,
    lipsyncActive: false,
    lastConversationId: -1,
  };
}

class ChessConvaiManager {
  private pool = new Map<CoachId, CoachConnection>();
  private activeCoachId: CoachId = 'arjun';
  private speakingCoachId: CoachId | '' = '';
  private responseListeners = new Set<ResponseListener>();
  private statusListeners = new Set<StatusListener>();
  private speechQueue: Promise<void> = Promise.resolve();
  private streamDebounce: ReturnType<typeof setTimeout> | null = null;
  private lastSpeechEndedAt = 0;

  constructor() {
    for (const coach of COACHES) this.pool.set(coach.id, createConnection(coach));
  }

  async connectCoach(coach: CoachConfig): Promise<void> {
    this.activeCoachId = coach.id;
    const conn = this.pool.get(coach.id);
    if (!conn) return;
    await this.disconnectOtherCoaches(coach.id);
    if (conn.connecting || conn.connected) {
      await this.waitForReady(conn, 12000);
      this.emitStatus();
      return;
    }
    if (!API_KEY) {
      debugLog('Convai', `[${coach.name}] Missing VITE_CONVAI_API_KEY`);
      this.emitStatus();
      return;
    }

    conn.connecting = true;
    this.emitStatus();

    try {
      debugLog('Convai', `[${coach.name}] Connecting (${coach.characterId})...`);
      const sdk = await import('@convai/web-sdk/vanilla');
      const { ConvaiClient, AudioRenderer } = sdk;

      const client = new ConvaiClient({
        apiKey: API_KEY,
        characterId: coach.characterId,
        enableLipsync: true,
        enableEmotion: true,
        blendshapeConfig: { format: 'arkit' },
        ttsEnabled: true,
        startWithAudioOn: false,
      });

      conn.unsubFns.push(
        client.on('message', (msg: any) => {
          const type: string = msg?.type ?? 'unknown';
          const content: string = msg?.content ?? '';
          if (type !== 'bot-llm-text') {
            debugLog('Convai', `[${coach.name}] MSG type="${type}" content="${String(content).slice(0, 80)}"`);
          }
          if (type === 'bot-llm-text' && content) {
            conn.streamBuffer = content;
            conn.lastEmittedText = content;
            if (content.length > conn.longestResponseText.length) conn.longestResponseText = content;
            if (this.streamDebounce) clearTimeout(this.streamDebounce);
            this.streamDebounce = setTimeout(() => this.flushStream(conn), 800);
          }
        }),
      );

      conn.unsubFns.push(
        client.on('stateChange', (sdkState: any) => {
          const wasSpeaking = conn.isSpeaking;
          conn.isSpeaking = Boolean(sdkState.isSpeaking);

          if (conn.isSpeaking && !wasSpeaking) {
            conn.lipsyncActive = true;
            this.speakingCoachId = conn.coach.id;
            this.lastSpeechEndedAt = 0;
            const conversationId = client.conversationSessionId ?? 0;
            if (conversationId !== conn.lastConversationId) {
              conn.lipsyncIndex = 0;
              conn.lipsyncAccum = 0;
              conn.lipsyncLastTime = 0;
              conn.lastConversationId = conversationId;
            }
          }

          if (wasSpeaking && !conn.isSpeaking) {
            this.flushStream(conn);
            setTimeout(() => {
              if (!conn.isSpeaking) {
                conn.lipsyncActive = false;
                this.lastSpeechEndedAt = Date.now();
                if (this.speakingCoachId === conn.coach.id) this.speakingCoachId = '';
                this.emitStatus();
              }
            }, 500);
          }

          this.emitStatus();
        }),
      );

      conn.unsubFns.push(client.on('botReady', () => {
        conn.botReady = true;
        debugLog('Convai', `[${coach.name}] BOT READY`);
        this.emitStatus();
      }));

      conn.unsubFns.push(client.on('error', (err: any) => {
        debugLog('Convai', `[${coach.name}] error:`, err?.message || err);
      }));

      await client.connect();
      conn.client = client;
      conn.connected = true;

      try {
        conn.audioRenderer = new AudioRenderer(client.room);
        debugLog('Convai', `[${coach.name}] AudioRenderer created`);
      } catch (err) {
        debugLog('Convai', `[${coach.name}] AudioRenderer failed:`, err);
      }

      try {
        await client.audioControls.enableAudio();
        debugLog('Convai', `[${coach.name}] audio enabled`);
      } catch (err) {
        debugLog('Convai', `[${coach.name}] enableAudio failed:`, err);
      }

      setTimeout(() => {
        document.querySelectorAll('audio').forEach((el) => {
          if (el.paused) el.play().catch(() => {});
        });
      }, 1500);

      await this.waitForReady(conn, 20000);
    } catch (err) {
      debugLog('Convai', `[${coach.name}] Connection failed:`, err);
    } finally {
      conn.connecting = false;
      this.emitStatus();
    }
  }

  unlockAudio(): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        void ctx.resume();
      }
      document.querySelectorAll('audio').forEach((el) => el.play().catch(() => {}));
    } catch {}
  }

  async speakCoachMessage(coach: CoachConfig, message: string, dynamicInfo: string): Promise<string> {
    return this.runExclusiveSpeech(async () => {
      this.activeCoachId = coach.id;
      await this.connectCoach(coach);
      await this.waitForGlobalSilence(`${coach.name} turn preflight`, 300, 3000);
      let response = await this.sendAndAwaitSpeech(coach, message, dynamicInfo);
      if (!response.trim()) {
        const conn = this.pool.get(coach.id);
        if (conn) {
          debugLog('Convai', `[${coach.name}] Empty response, reconnecting once`);
          await this.disconnectOne(conn);
          await this.connectCoach(coach);
          response = await this.sendAndAwaitSpeech(coach, message, dynamicInfo);
        }
      }
      return response;
    });
  }

  async sendUserChat(coach: CoachConfig, difficulty: DifficultyConfig, message: string, dynamicInfo: string): Promise<string> {
    return this.speakCoachMessage(
      coach,
      [
        buildCoachInstruction(coach, difficulty, 'chat'),
        `You asked me this: "${message}".`,
        'Reply in first person as the coach. Address the student as "you".',
        'Stay grounded in the current chess position. Avoid raw SAN, file-rank square names, and notation aloud unless needed for text clarity.',
      ].join(' '),
      dynamicInfo,
    );
  }

  getLipsyncFrame(coachId: CoachId): Float32Array | null {
    const conn = this.pool.get(coachId);
    if (!conn?.client || !conn.lipsyncActive) return null;
    if (this.speakingCoachId && this.speakingCoachId !== coachId) return null;
    const queue = conn.client.blendshapeQueue;
    if (!queue) return null;

    const now = performance.now();
    if (conn.lipsyncLastTime > 0) {
      conn.lipsyncAccum += ((now - conn.lipsyncLastTime) / 1000) * 60;
    }
    conn.lipsyncLastTime = now;

    let frame: Float32Array | null = null;
    while (conn.lipsyncAccum >= 1) {
      const next = queue.getFrame(conn.lipsyncIndex);
      if (next) {
        frame = next;
        conn.lipsyncIndex++;
        conn.lipsyncAccum -= 1;
      } else {
        conn.lipsyncAccum = 0;
        break;
      }
    }
    return frame;
  }

  getIsSpeaking(coachId?: CoachId): boolean {
    if (coachId) return Boolean(this.pool.get(coachId)?.isSpeaking);
    for (const conn of this.pool.values()) if (conn.isSpeaking) return true;
    return false;
  }

  getStatus() {
    const active = this.pool.get(this.activeCoachId);
    const coaches: Record<string, { connected: boolean; botReady: boolean; connecting: boolean; speaking: boolean }> = {};
    for (const [id, conn] of this.pool) {
      coaches[id] = {
        connected: conn.connected,
        botReady: conn.botReady,
        connecting: conn.connecting,
        speaking: conn.isSpeaking,
      };
    }
    return {
      activeCoachId: this.activeCoachId,
      connected: Boolean(active?.connected),
      botReady: Boolean(active?.botReady),
      connecting: Boolean(active?.connecting),
      speaking: Boolean(active?.isSpeaking),
      coaches,
    };
  }

  onResponse(listener: ResponseListener): () => void {
    this.responseListeners.add(listener);
    return () => this.responseListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => this.statusListeners.delete(listener);
  }

  private async sendAndAwaitSpeech(coach: CoachConfig, message: string, dynamicInfo: string): Promise<string> {
    const conn = this.pool.get(coach.id);
    if (!conn?.client || !conn.connected) return '';

    await this.waitForReady(conn, 2500);
    if (!conn.botReady) debugLog('Convai', `[${coach.name}] BOT READY still pending; sending anyway`);

    conn.client.updateDynamicInfo({ text: dynamicInfo });
    conn.lastEmittedText = '';
    conn.streamBuffer = '';
    conn.longestResponseText = '';
    conn.hasFlushed = false;
    this.activeCoachId = coach.id;

    debugLog('Convai', `[${coach.name}] Speaking: "${message.slice(0, 100)}"`);
    conn.client.sendUserTextMessage(message);
    const response = await this.waitForResponseCompletion(conn);
    debugLog('Convai', `[${coach.name}] Speech done. Response: "${response.slice(0, 100)}"`);
    return response;
  }

  private async waitForResponseCompletion(conn: CoachConnection): Promise<string> {
    let everSpoke = false;
    for (let i = 0; i < 30; i++) {
      await this.sleep(500);
      if (conn.isSpeaking) {
        everSpoke = true;
        break;
      }
      if (conn.lastEmittedText) break;
    }

    if (conn.isSpeaking || everSpoke) {
      let silentMs = 0;
      for (let i = 0; i < 70; i++) {
        await this.sleep(500);
        if (!conn.isSpeaking) {
          silentMs += 500;
          if (silentMs >= 900) break;
        } else {
          silentMs = 0;
        }
      }
      await this.sleep(150);
    } else if (conn.lastEmittedText) {
      await this.sleep(700);
    }

    this.lastSpeechEndedAt = Date.now();
    this.captureLatestText(conn);
    await this.waitForGlobalSilence(`${conn.coach.name} post-speech`, 250, 1500);
    return this.getBestResponseText(conn);
  }

  private captureLatestText(conn: CoachConnection): void {
    if (this.streamDebounce) {
      clearTimeout(this.streamDebounce);
      this.streamDebounce = null;
    }
    if (!conn.streamBuffer) return;
    const text = conn.streamBuffer;
    conn.lastEmittedText = text;
    if (text.length > conn.longestResponseText.length) conn.longestResponseText = text;
    conn.streamBuffer = '';
    conn.hasFlushed = true;
    debugLog('Convai', `[${conn.coach.name}] FINAL: "${text.slice(0, 180)}"`);
  }

  private flushStream(conn: CoachConnection): void {
    this.captureLatestText(conn);
    const text = this.getBestResponseText(conn);
    if (!text) return;
    for (const listener of this.responseListeners) {
      listener({ coachId: conn.coach.id, characterName: conn.coach.name, text });
    }
  }

  private getBestResponseText(conn: CoachConnection): string {
    const latest = conn.lastEmittedText.trim();
    const longest = conn.longestResponseText.trim();
    if (!latest) return longest;
    if (!longest) return latest;
    if (longest.includes(latest)) return longest;
    if (latest.includes(longest)) return latest;
    return latest.length >= longest.length ? latest : longest;
  }

  private runExclusiveSpeech<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.speechQueue;
    let release!: () => void;
    this.speechQueue = new Promise<void>((resolve) => {
      release = resolve;
    });

    return (async () => {
      await previous.catch(() => {});
      try {
        return await task();
      } finally {
        release();
      }
    })();
  }

  private async waitForGlobalSilence(context: string, minQuietMs = 900, maxWaitMs = 15000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const quietFor = this.lastSpeechEndedAt === 0 ? minQuietMs : Date.now() - this.lastSpeechEndedAt;
      if (!this.getIsSpeaking() && quietFor >= minQuietMs) return;
      await this.sleep(150);
    }
    debugLog('Convai', `[${context}] Silence gate timed out, continuing`);
  }

  private async waitForReady(conn: CoachConnection, maxWaitMs: number): Promise<void> {
    const start = Date.now();
    while (!conn.botReady && Date.now() - start < maxWaitMs) {
      await this.sleep(500);
    }
  }

  private async disconnectOne(conn: CoachConnection): Promise<void> {
    for (const unsub of conn.unsubFns) {
      try { unsub(); } catch {}
    }
    conn.unsubFns = [];
    if (conn.audioRenderer) {
      try { conn.audioRenderer.destroy(); } catch {}
      conn.audioRenderer = null;
    }
    if (conn.client) {
      try { await conn.client.disconnect(); } catch {}
      conn.client = null;
    }
    conn.connected = false;
    conn.botReady = false;
    conn.isSpeaking = false;
    conn.lipsyncActive = false;
    conn.streamBuffer = '';
    conn.lastEmittedText = '';
    conn.longestResponseText = '';
    this.emitStatus();
  }

  private async disconnectOtherCoaches(activeCoachId: CoachId): Promise<void> {
    const disconnects: Array<Promise<void>> = [];
    for (const [coachId, conn] of this.pool) {
      if (coachId === activeCoachId) continue;
      if (!conn.connected && !conn.connecting && !conn.client) continue;
      disconnects.push(this.disconnectOne(conn));
    }
    await Promise.all(disconnects);
  }

  private emitStatus(): void {
    const status = this.getStatus();
    for (const listener of this.statusListeners) listener(status);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const chessConvai = new ChessConvaiManager();
