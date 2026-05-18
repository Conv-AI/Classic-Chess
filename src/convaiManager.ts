import { buildCoachInstruction } from './chessAi';
import { COACHES, type CoachConfig, type CoachId, type DifficultyConfig } from './coachConfig';
import { debugLog } from './debugLog';

const API_KEY = import.meta.env.VITE_CONVAI_API_KEY as string;
const SUPPRESSED_RESPONSE_PATTERN = /\b(silent|human)\b/i;

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
  connectedAt: number;
  isSpeaking: boolean;
  streamBuffer: string;
  lastEmittedText: string;
  longestResponseText: string;
  responseSuppressed: boolean;
  responseSuppressedReason: string;
  hasFlushed: boolean;
  unsubFns: Array<() => void>;
  lipsyncIndex: number;
  lipsyncLastTime: number;
  lipsyncAccum: number;
  lipsyncActive: boolean;
  lastConversationId: number;
  turnEnded: boolean;
  lastTurnEndAt: number;
};

function createConnection(coach: CoachConfig): CoachConnection {
  return {
    coach,
    client: null,
    audioRenderer: null,
    connected: false,
    connecting: false,
    botReady: false,
    connectedAt: 0,
    isSpeaking: false,
    streamBuffer: '',
    lastEmittedText: '',
    longestResponseText: '',
    responseSuppressed: false,
    responseSuppressedReason: '',
    hasFlushed: false,
    unsubFns: [],
    lipsyncIndex: 0,
    lipsyncLastTime: 0,
    lipsyncAccum: 0,
    lipsyncActive: false,
    lastConversationId: -1,
    turnEnded: false,
    lastTurnEndAt: 0,
  };
}

class ChessConvaiManager {
  private readonly staleReadyMs = 8000;
  private pool = new Map<CoachId, CoachConnection>();
  private activeCoachId: CoachId = 'arjun';
  private speakingCoachId: CoachId | '' = '';
  private responseListeners = new Set<ResponseListener>();
  private statusListeners = new Set<StatusListener>();
  private speechQueue: Promise<void> = Promise.resolve();
  private streamDebounce: ReturnType<typeof setTimeout> | null = null;
  private lastSpeechEndedAt = 0;
  private micEnabled = false;

  constructor() {
    for (const coach of COACHES) this.pool.set(coach.id, createConnection(coach));
  }

  async connectCoach(
    coach: CoachConfig,
    options: { waitForBotReady?: boolean; readyWaitMs?: number; reconnectIfStale?: boolean } = {},
  ): Promise<void> {
    this.activeCoachId = coach.id;
    const conn = this.pool.get(coach.id);
    if (!conn) return;
    await this.disconnectOtherCoaches(coach.id);
    if (conn.connecting || conn.connected) {
      if (conn.connected && options.reconnectIfStale && this.isReadyStale(conn)) {
        debugLog('Convai', `[${coach.name}] BOT READY stale after connect; reconnecting before speech`);
        await this.disconnectOne(conn);
      } else {
        if (options.waitForBotReady) await this.waitForReady(conn, options.readyWaitMs ?? 3000);
        this.emitStatus();
        return;
      }
    }
    if (conn.connecting) {
      if (options.waitForBotReady) await this.waitForReady(conn, options.readyWaitMs ?? 3000);
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
        blendshapeConfig: { format: 'arkit', frames_buffer_duration: 0.25 },
        ttsEnabled: true,
        startWithAudioOn: false,
        keepInContext: false,
      });

      conn.unsubFns.push(
        client.on('message', (msg: any) => {
          const type: string = msg?.type ?? 'unknown';
          const content: string = msg?.content ?? '';
          if (type !== 'bot-llm-text') {
            debugLog('Convai', `[${coach.name}] MSG type="${type}" content="${String(content).slice(0, 80)}"`);
          }
          if (type === 'bot-llm-text' && content) {
            const suppressedWord = this.getSuppressedResponseWord(content);
            if (suppressedWord) {
              this.suppressResponse(conn, suppressedWord);
              return;
            }
            conn.streamBuffer = content;
            conn.lastEmittedText = content;
            if (content.length > conn.longestResponseText.length) conn.longestResponseText = content;
            if (this.streamDebounce) clearTimeout(this.streamDebounce);
            // 1500 ms is large enough that we do not flush a mid-stream partial as a "final" line
            // (which caused the on-screen text to appear cut). The audio is rendered by Convai
            // independently, so we are free to wait for a stable text snapshot before notifying.
            this.streamDebounce = setTimeout(() => this.flushStream(conn), 1500);
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
            // Convai briefly toggles isSpeaking off between TTS audio chunks (e.g. between
            // sentences or while waiting on the LLM). Treating that transient as "speech over"
            // caused the next user message to fire and abort the in-flight TTS mid-sentence.
            // We now require the speaking flag to stay off for a full second AND only update
            // lastSpeechEndedAt then, so the speech queue stays gated.
            setTimeout(() => {
              if (!conn.isSpeaking) {
                this.lastSpeechEndedAt = Date.now();
                this.finishLipsyncIfEnded(conn);
                this.emitStatus();
              }
            }, 1000);
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

      conn.unsubFns.push(client.on('turnEnd', (payload: any) => {
        conn.turnEnded = true;
        conn.lastTurnEndAt = Date.now();
        const sessionId = payload?.sessionId ?? client.conversationSessionId ?? 'unknown';
        debugLog('Convai', `[${coach.name}] turnEnd session=${sessionId}`);
        this.captureLatestText(conn);
      }));

      conn.unsubFns.push(client.on('blendshapes', () => {
        conn.lipsyncActive = true;
        this.speakingCoachId = conn.coach.id;
      }));

      conn.unsubFns.push(client.on('blendshapeStatsReceived', () => {
        if (!conn.isSpeaking) this.finishLipsyncIfEnded(conn);
      }));

      await client.connect();
      conn.client = client;
      conn.connected = true;
      conn.connectedAt = Date.now();

      try {
        conn.audioRenderer = new AudioRenderer(client.room);
        debugLog('Convai', `[${coach.name}] AudioRenderer created`);
      } catch (err) {
        debugLog('Convai', `[${coach.name}] AudioRenderer failed:`, err);
      }

      // Mic is off by default. The user enables it explicitly with setMicEnabled(true).

      setTimeout(() => {
        document.querySelectorAll('audio').forEach((el) => {
          if (el.paused) el.play().catch(() => {});
        });
      }, 1500);

      if (options.waitForBotReady) await this.waitForReady(conn, options.readyWaitMs ?? 5000);
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
      await this.connectCoach(coach, { waitForBotReady: true, readyWaitMs: 3500, reconnectIfStale: true });
      // Wait longer for any previous TTS to fully render. Sending a new user message while
      // Convai is still streaming audio causes it to abort the prior turn mid-sentence.
      await this.waitForGlobalSilence(`${coach.name} turn preflight`, 350, 1500);
      let response = await this.sendAndAwaitSpeech(coach, message, dynamicInfo);
      if (!response.trim()) {
        const conn = this.pool.get(coach.id);
        if (conn?.responseSuppressed) {
          debugLog('Convai', `[${coach.name}] Suppressed response skipped; applying move without speech`);
        } else if (conn) {
          debugLog('Convai', `[${coach.name}] Empty response, reconnecting once`);
          await this.disconnectOne(conn);
          await this.connectCoach(coach, { waitForBotReady: true, readyWaitMs: 3500 });
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
        `Student question: "${message}".`,
        'Please answer as the chess coach using the current board context.',
      ].join(' '),
      `${buildCoachInstruction(coach, difficulty, 'chat')} ${dynamicInfo}`,
    );
  }

  async updateCoachContext(coach: CoachConfig, dynamicInfo: string): Promise<void> {
    this.activeCoachId = coach.id;
    await this.connectCoach(coach);
    const conn = this.pool.get(coach.id);
    if (!conn?.client || !conn.connected || !dynamicInfo.trim()) return;
    conn.client.updateDynamicInfo(dynamicInfo);
    debugLog('Convai', `[${coach.name}] Dynamic info updated len=${dynamicInfo.length} context="${dynamicInfo.slice(0, 120)}"`);
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
        this.finishLipsyncIfEnded(conn);
        break;
      }
    }
    if (!frame) this.finishLipsyncIfEnded(conn);
    return frame;
  }

  getMicEnabled(): boolean {
    return this.micEnabled;
  }

  async setMicEnabled(enabled: boolean): Promise<void> {
    this.micEnabled = enabled;
    const conn = this.pool.get(this.activeCoachId);
    if (!conn?.client) { this.emitStatus(); return; }
    try {
      if (enabled) {
        debugLog('Convai', `[Mic] Enabling microphone`);
        await conn.client.audioControls?.enableAudio?.();
      } else {
        debugLog('Convai', `[Mic] Disabling microphone`);
        await conn.client.audioControls?.disableAudio?.();
      }
    } catch (err) {
      debugLog('Convai', `[Mic] Toggle failed:`, err);
    }
    this.emitStatus();
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
      micEnabled: this.micEnabled,
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

    await this.waitForReady(conn, 2000);
    if (!conn.botReady && this.isReadyStale(conn)) {
      debugLog('Convai', `[${coach.name}] BOT READY still pending on stale session; reconnecting`);
      await this.disconnectOne(conn);
      await this.connectCoach(coach, { waitForBotReady: true, readyWaitMs: 3500 });
    }

    const readyConn = this.pool.get(coach.id);
    if (!readyConn?.client || !readyConn.connected) return '';
    if (!readyConn.botReady) debugLog('Convai', `[${coach.name}] BOT READY still pending; sending anyway`);

    readyConn.client.updateDynamicInfo(dynamicInfo);
    this.resetResponseState(readyConn);
    this.activeCoachId = coach.id;

    const sessionId = readyConn.client.conversationSessionId ?? 'unknown';
    debugLog('Convai', `[${coach.name}] Speaking session=${sessionId}: "${message.slice(0, 100)}"`);
    readyConn.client.sendUserTextMessage(message);
    const response = await this.waitForResponseCompletion(readyConn);
    debugLog('Convai', `[${coach.name}] Speech done. Response: "${response.slice(0, 100)}"`);
    return response;
  }

  private resetResponseState(conn: CoachConnection): void {
    conn.lastEmittedText = '';
    conn.streamBuffer = '';
    conn.longestResponseText = '';
    conn.responseSuppressed = false;
    conn.responseSuppressedReason = '';
    conn.hasFlushed = false;
    conn.turnEnded = false;
    conn.lastTurnEndAt = 0;
    this.resetLipsyncState(conn);
  }

  private async waitForResponseCompletion(conn: CoachConnection): Promise<string> {
    let everSpoke = false;
    for (let i = 0; i < 20; i++) {
      await this.sleep(250);
      if (conn.responseSuppressed) return '';
      if (conn.turnEnded) break;
      if (conn.isSpeaking) {
        everSpoke = true;
        break;
      }
      this.captureLatestText(conn);
      if (conn.lastEmittedText) break;
    }

    if (!everSpoke && !conn.lastEmittedText && !conn.turnEnded) {
      await this.waitForTurnEndOrFirstText(conn, 2500);
      if (conn.responseSuppressed) return '';
      if (conn.isSpeaking) everSpoke = true;
    }

    if (conn.isSpeaking || everSpoke) {
      let silentMs = 0;
      // Prefer Convai's turn-end signal, but keep a short silence fallback so a missing
      // turnEnd event does not make the chess move feel frozen after the coach has spoken.
      for (let i = 0; i < 50; i++) {
        await this.sleep(500);
        if (conn.responseSuppressed) return '';
        if (!conn.isSpeaking) {
          silentMs += 500;
          if (conn.turnEnded && silentMs >= 800) break;
          if (silentMs >= 2500) break;
        } else {
          silentMs = 0;
        }
      }
      await this.waitForTurnEndOrStableText(conn, 2500, 700);
    } else if (conn.lastEmittedText) {
      await this.waitForTurnEndOrStableText(conn, 2500, 700);
    }

    this.lastSpeechEndedAt = Date.now();
    this.captureLatestText(conn);
    // Slightly larger post-speech silence window so any straggling audio finishes before
    // the speech queue releases the next entry.
    await this.waitForGlobalSilence(`${conn.coach.name} post-speech`, 300, 1200);
    return this.getBestResponseText(conn);
  }

  private async waitForTurnEndOrFirstText(conn: CoachConnection, maxWaitMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      await this.sleep(200);
      if (conn.responseSuppressed) return;
      this.captureLatestText(conn);
      if (conn.turnEnded || conn.isSpeaking || conn.lastEmittedText || conn.longestResponseText || conn.streamBuffer) return;
    }
  }

  private async waitForTurnEndOrStableText(conn: CoachConnection, maxWaitMs: number, stableMs: number): Promise<void> {
    const start = Date.now();
    let stableFor = 0;
    let lastText = conn.longestResponseText || conn.lastEmittedText || conn.streamBuffer;
    while (Date.now() - start < maxWaitMs) {
      await this.sleep(200);
      if (conn.responseSuppressed) return;
      const current = conn.longestResponseText || conn.lastEmittedText || conn.streamBuffer;
      if (current === lastText) {
        stableFor += 200;
      } else {
        stableFor = 0;
        lastText = current;
      }
      if (conn.turnEnded && stableFor >= 400) return;
      if (stableFor >= stableMs) return;
    }
  }

  private captureLatestText(conn: CoachConnection): void {
    if (conn.responseSuppressed) return;
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
    if (conn.responseSuppressed) return;
    this.captureLatestText(conn);
    const text = this.getBestResponseText(conn);
    if (!text) return;
    this.emitResponse(conn, text);
  }

  private emitResponse(conn: CoachConnection, text: string): void {
    for (const listener of this.responseListeners) {
      listener({ coachId: conn.coach.id, characterName: conn.coach.name, text });
    }
  }

  private getBestResponseText(conn: CoachConnection): string {
    if (conn.responseSuppressed) return '';
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

  private isReadyStale(conn: CoachConnection): boolean {
    return conn.connected && !conn.botReady && conn.connectedAt > 0 && Date.now() - conn.connectedAt >= this.staleReadyMs;
  }

  private getSuppressedResponseWord(text: string): string | null {
    return text.match(SUPPRESSED_RESPONSE_PATTERN)?.[1]?.toLowerCase() ?? null;
  }

  private suppressResponse(conn: CoachConnection, word: string): void {
    if (conn.responseSuppressed) return;
    conn.responseSuppressed = true;
    conn.responseSuppressedReason = word;
    conn.streamBuffer = '';
    conn.lastEmittedText = '';
    conn.longestResponseText = '';
    conn.turnEnded = true;
    conn.lastTurnEndAt = Date.now();
    if (this.streamDebounce) {
      clearTimeout(this.streamDebounce);
      this.streamDebounce = null;
    }
    try { conn.client?.sendInterruptMessage?.(); } catch {}
    this.resetLipsyncState(conn);
    this.lastSpeechEndedAt = Date.now();
    this.emitResponse(conn, '');
    this.emitStatus();
    debugLog('Convai', `[${conn.coach.name}] Suppressed bot response containing "${word}"; interrupted audio`);
  }

  private resetLipsyncState(conn: CoachConnection): void {
    conn.lipsyncIndex = 0;
    conn.lipsyncLastTime = 0;
    conn.lipsyncAccum = 0;
    conn.lipsyncActive = false;
    conn.lastConversationId = -1;
    try { conn.client?.blendshapeQueue?.reset?.(); } catch {}
    if (this.speakingCoachId === conn.coach.id) this.speakingCoachId = '';
  }

  private finishLipsyncIfEnded(conn: CoachConnection): boolean {
    const queue = conn.client?.blendshapeQueue;
    const ended = Boolean(queue?.isConversationEnded?.());
    if (!ended) return false;
    conn.lipsyncActive = false;
    conn.lipsyncLastTime = 0;
    conn.lipsyncAccum = 0;
    if (this.speakingCoachId === conn.coach.id) this.speakingCoachId = '';
    this.emitStatus();
    return true;
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
    conn.connectedAt = 0;
    conn.isSpeaking = false;
    this.resetLipsyncState(conn);
    conn.streamBuffer = '';
    conn.lastEmittedText = '';
    conn.longestResponseText = '';
    conn.responseSuppressed = false;
    conn.responseSuppressedReason = '';
    conn.turnEnded = false;
    conn.lastTurnEndAt = 0;
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
