import { buildCoachInstruction } from './chessAi';
import { isBoardVisionEnabled, publishBoardVisionTrack } from './boardVision';
import { getConvaiApiKey } from './convaiApiKey';
import { COACHES, type CoachConfig, type CoachId, type DifficultyConfig } from './coachConfig';
import { debugLog } from './debugLog';
const SUPPRESSED_RESPONSE_PATTERN = /^\s*(silent|human):?\s*[.!?]*\s*$/i;
const PROMPT_LEAK_PATTERN = /^\s*(human|system|user)\s*:/i;

export type ConvaiResponse = {
  coachId: CoachId;
  characterName: string;
  text: string;
};

type RunLlmMode = 'auto' | 'true' | 'false';

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
  llmNoResponse: boolean;
  hasFlushed: boolean;
  isThinking: boolean;
  unsubFns: Array<() => void>;
  lipsyncIndex: number;
  lipsyncLastTime: number;
  lipsyncAccum: number;
  lipsyncActive: boolean;
  lastConversationId: number;
  turnEnded: boolean;
  lastTurnEndAt: number;
  lastFinalTextAt: number;
  ttsExpectedUntil: number;
  lastSpeechEndedAt: number;
  staticPolicy: string;
  endUserId: string;
  boardVisionPublished: boolean;
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
    llmNoResponse: false,
    hasFlushed: false,
    isThinking: false,
    unsubFns: [],
    lipsyncIndex: 0,
    lipsyncLastTime: 0,
    lipsyncAccum: 0,
    lipsyncActive: false,
    lastConversationId: -1,
    turnEnded: false,
    lastTurnEndAt: 0,
    lastFinalTextAt: 0,
    ttsExpectedUntil: 0,
    lastSpeechEndedAt: 0,
    staticPolicy: '',
    endUserId: '',
    boardVisionPublished: false,
  };
}

class ChessConvaiManager {
  private readonly staleReadyMs = 8000;
  private pool = new Map<string, CoachConnection>();
  private activeCoachId: CoachId = 'arjun';
  private speakingCoachId: CoachId | '' = '';
  private responseListeners = new Set<ResponseListener>();
  private statusListeners = new Set<StatusListener>();
  private speechQueue: Promise<void> = Promise.resolve();
  private streamDebounce: ReturnType<typeof setTimeout> | null = null;
  private lastSpeechEndedAt = 0;
  private speechWaitGeneration = 0;
  private micEnabled = false;
  private convaiTurnInFlight = false;

  constructor() {
    for (const coach of COACHES) this.pool.set(coach.id, createConnection(coach));
  }

  private ensureConnection(coach: CoachConfig): CoachConnection {
    let conn = this.pool.get(coach.id);
    if (!conn) {
      conn = createConnection(coach);
      this.pool.set(coach.id, conn);
    } else {
      conn.coach = coach;
    }
    return conn;
  }

  async connectCoach(
    coach: CoachConfig,
    options: {
      waitForBotReady?: boolean;
      readyWaitMs?: number;
      reconnectIfStale?: boolean;
      endUserId?: string;
      staticPolicy?: string;
    } = {},
  ): Promise<void> {
    this.activeCoachId = coach.id as CoachId;
    const conn = this.ensureConnection(coach);

    if (options.staticPolicy) conn.staticPolicy = options.staticPolicy;
    if (options.endUserId) conn.endUserId = options.endUserId;

    const needsReconnectForUser = Boolean(
      options.endUserId &&
      conn.connected &&
      conn.endUserId &&
      conn.endUserId !== options.endUserId,
    );

    await this.disconnectOtherCoaches(coach.id);

    if (conn.connecting || conn.connected) {
      if (needsReconnectForUser) {
        await this.disconnectOne(conn);
      } else if (conn.connected && options.reconnectIfStale && this.isReadyStale(conn)) {
        debugLog('Convai', `[${coach.name}] BOT READY stale after connect; reconnecting before speech`);
        await this.disconnectOne(conn);
      } else {
        if (options.waitForBotReady) await this.waitForReady(conn, options.readyWaitMs ?? 3000);
        if (conn.connected && conn.staticPolicy) await this.seedStaticCoachPolicy(coach, conn.staticPolicy);
        this.emitStatus();
        return;
      }
    }

    if (conn.connecting) {
      if (options.waitForBotReady) await this.waitForReady(conn, options.readyWaitMs ?? 3000);
      this.emitStatus();
      return;
    }

    const apiKey = getConvaiApiKey();
    if (!apiKey) {
      debugLog('Convai', `[${coach.name}] Missing Convai API key`);
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
        apiKey,
        characterId: coach.characterId,
        endUserId: conn.endUserId || undefined,
        enableVideo: isBoardVisionEnabled(),
        enableLipsync: true,
        enableEmotion: true,
        blendshapeConfig: { format: 'arkit', frames_buffer_duration: 0.25 },
        ttsEnabled: true,
        startWithAudioOn: false,
        keepInContext: true,
        dynamicInfo: conn.staticPolicy || undefined,
      });

      conn.unsubFns.push(
        client.on('message', (msg: any) => {
          const type: string = msg?.type ?? 'unknown';
          const content: string = msg?.content ?? '';
          if (type !== 'bot-llm-text') {
            debugLog('Convai', `[${coach.name}] MSG type="${type}" content="${String(content).slice(0, 80)}"`);
          }
          if (type === 'llm-no-response') {
            this.markLlmNoResponse(conn);
            return;
          }
          if (type === 'bot-llm-text' && content) {
            if (PROMPT_LEAK_PATTERN.test(content)) {
              debugLog('Convai', `[${coach.name}] Suppressing prompt-leak shaped response`);
              this.suppressResponse(conn, 'prompt-leak');
              return;
            }
            const suppressedWord = this.getSuppressedResponseWord(content);
            if (suppressedWord) {
              this.suppressResponse(conn, suppressedWord);
              return;
            }
            conn.streamBuffer = content;
            conn.lastEmittedText = content;
            if (content.length > conn.longestResponseText.length) conn.longestResponseText = content;
            // Emit every chunk so the caption streams in smoothly as text arrives.
            // `content` is cumulative, so each emit shows the text grown so far.
            this.emitResponse(conn, content);
            conn.hasFlushed = true;
            if (this.streamDebounce) clearTimeout(this.streamDebounce);
            this.streamDebounce = setTimeout(() => this.flushStream(conn), 200);
          }
        }),
      );

      conn.unsubFns.push(
        client.on('stateChange', (sdkState: any) => {
          const wasSpeaking = conn.isSpeaking;
          conn.isSpeaking = Boolean(sdkState.isSpeaking);
          conn.isThinking = Boolean(sdkState.isThinking);

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
            const endedAt = Date.now();
            conn.lastSpeechEndedAt = endedAt;
            this.lastSpeechEndedAt = endedAt;
            setTimeout(() => {
              if (!conn.isSpeaking) {
                this.finishLipsyncIfEnded(conn);
                if (!conn.lipsyncActive) {
                  const quietAt = Date.now();
                  conn.lastSpeechEndedAt = quietAt;
                  this.lastSpeechEndedAt = quietAt;
                }
                this.emitStatus();
              }
            }, 120);
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

      conn.unsubFns.push(client.on('llmNoResponse', () => {
        this.markLlmNoResponse(conn);
      }));

      conn.unsubFns.push(client.on('blendshapes', () => {
        conn.lipsyncActive = true;
        this.speakingCoachId = conn.coach.id;
      }));

      conn.unsubFns.push(client.on('blendshapeStatsReceived', () => {
        if (!conn.isSpeaking) this.finishLipsyncIfEnded(conn);
      }));

      conn.unsubFns.push(client.on('metrics', (metricsData: any) => {
        debugLog('Convai', `[${coach.name}] metrics`, metricsData);
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

      if (isBoardVisionEnabled() && !conn.boardVisionPublished) {
        const published = await publishBoardVisionTrack(client);
        conn.boardVisionPublished = published;
      }

      setTimeout(() => {
        document.querySelectorAll('audio').forEach((el) => {
          if (el.paused) el.play().catch(() => {});
        });
      }, 1500);

      if (conn.staticPolicy) await this.seedStaticCoachPolicy(coach, conn.staticPolicy);
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

  async seedStaticCoachPolicy(coach: CoachConfig, instruction: string): Promise<void> {
    const conn = this.pool.get(coach.id);
    if (!conn?.client || !instruction.trim()) return;
    conn.staticPolicy = instruction;
    if (typeof conn.client.updateContext === 'function') {
      conn.client.updateContext({ text: instruction, mode: 'replace', run_llm: 'false' });
    } else {
      conn.client.updateDynamicInfo(instruction);
    }
    debugLog('Convai', `[${coach.name}] Static policy seeded len=${instruction.length}`);
  }

  async runCoachTurn(
    coach: CoachConfig,
    dynamicInfo: string,
    options: { runLlm?: RunLlmMode; preflightSilence?: boolean; maxWaitMs?: number; waitForFullSpeech?: boolean } = {},
  ): Promise<string> {
    const runLlm = options.runLlm ?? 'auto';
    return this.runExclusiveSpeech(async () => {
      this.convaiTurnInFlight = true;
      this.emitStatus();
      try {
        this.activeCoachId = coach.id;
        await this.connectCoach(coach, {
          waitForBotReady: true,
          readyWaitMs: 3500,
          reconnectIfStale: true,
          staticPolicy: this.pool.get(coach.id)?.staticPolicy,
          endUserId: this.pool.get(coach.id)?.endUserId,
        });
        if (options.preflightSilence !== false) {
          await this.waitForGlobalSilence(`${coach.name} turn preflight`, 150, 300);
        }
        let response = await this.sendContextTurn(coach, dynamicInfo, runLlm, options.maxWaitMs, options.waitForFullSpeech);
        if (!response.trim() && runLlm === 'true') {
          const conn = this.pool.get(coach.id);
          if (conn && !conn.llmNoResponse && !conn.responseSuppressed) {
            debugLog('Convai', `[${coach.name}] Forced turn empty; reconnecting once`);
            await this.disconnectOne(conn);
            await this.connectCoach(coach, {
              waitForBotReady: true,
              readyWaitMs: 3500,
              staticPolicy: conn.staticPolicy,
              endUserId: conn.endUserId,
            });
            response = await this.sendContextTurn(coach, dynamicInfo, runLlm, options.maxWaitMs, options.waitForFullSpeech);
          }
        }
        const conn = this.pool.get(coach.id);
        if (conn) return this.getBestResponseText(conn) || response;
        return response;
      } finally {
        this.convaiTurnInFlight = false;
        this.emitStatus();
      }
    });
  }

  async speakCoachMessage(coach: CoachConfig, message: string, dynamicInfo: string): Promise<string> {
    return this.runExclusiveSpeech(async () => {
      this.convaiTurnInFlight = true;
      this.emitStatus();
      try {
        this.activeCoachId = coach.id;
        await this.connectCoach(coach, {
          waitForBotReady: true,
          readyWaitMs: 3500,
          reconnectIfStale: true,
          staticPolicy: this.pool.get(coach.id)?.staticPolicy,
          endUserId: this.pool.get(coach.id)?.endUserId,
        });
        await this.waitForGlobalSilence(`${coach.name} turn preflight`, 150, 300);
        let response = await this.sendAndAwaitSpeech(coach, message, dynamicInfo);
        if (!response.trim()) {
          const conn = this.pool.get(coach.id);
          if (conn?.llmNoResponse || conn?.responseSuppressed) {
            return '';
          }
          if (conn && message.trim()) {
            debugLog('Convai', `[${coach.name}] Empty response, reconnecting once`);
            await this.disconnectOne(conn);
            await this.connectCoach(coach, {
              waitForBotReady: true,
              readyWaitMs: 3500,
              staticPolicy: conn.staticPolicy,
              endUserId: conn.endUserId,
            });
            response = await this.sendAndAwaitSpeech(coach, message, dynamicInfo);
          }
        }
        return response;
      } finally {
        this.convaiTurnInFlight = false;
        this.emitStatus();
      }
    });
  }

  async sendUserChat(coach: CoachConfig, difficulty: DifficultyConfig, message: string, dynamicInfo: string): Promise<string> {
    const staticPolicy = `${buildCoachInstruction(coach, difficulty, 'chat')}`;
    await this.seedStaticCoachPolicy(coach, staticPolicy);
    return this.speakCoachMessage(
      coach,
      `The student asks: "${message}". Answer using the current board context.`,
      dynamicInfo,
    );
  }

  async updateCoachContext(coach: CoachConfig, dynamicInfo: string): Promise<void> {
    this.activeCoachId = coach.id;
    await this.connectCoach(coach, {
      staticPolicy: this.pool.get(coach.id)?.staticPolicy,
      endUserId: this.pool.get(coach.id)?.endUserId,
    });
    await this.pushDynamicContext(coach, dynamicInfo, 'false');
  }

  async beginNewGame(
    coach: CoachConfig,
    difficulty: DifficultyConfig,
    sessionId: string,
    startingDynamicInfo: string,
  ): Promise<void> {
    const staticPolicy = buildCoachInstruction(coach, difficulty, 'move');
    const conn = this.pool.get(coach.id);
    if (conn) {
      conn.staticPolicy = staticPolicy;
      conn.endUserId = sessionId;
    }

    this.interruptBot(coach);
    await this.connectCoach(coach, {
      waitForBotReady: true,
      readyWaitMs: 3500,
      endUserId: sessionId,
      staticPolicy,
      reconnectIfStale: false,
    });

    const readyConn = this.pool.get(coach.id);
    if (!readyConn?.client) return;

    try { readyConn.client.resetSession?.(); } catch {}
    try {
      readyConn.client.updateContext?.({ mode: 'reset', run_llm: 'false' });
    } catch {}

    await this.seedStaticCoachPolicy(coach, staticPolicy);
    await this.pushDynamicContext(coach, startingDynamicInfo, 'false');
    debugLog('Convai', `[${coach.name}] New game session=${sessionId}`);
  }

  interruptBot(coach: CoachConfig): void {
    const conn = this.pool.get(coach.id);
    if (!conn) return;
    this.speechWaitGeneration++;
    try { conn.client?.sendInterruptMessage?.(); } catch {}
    conn.streamBuffer = '';
    conn.lastEmittedText = '';
    conn.longestResponseText = '';
    conn.turnEnded = true;
    conn.lastTurnEndAt = Date.now();
    conn.isThinking = false;
    conn.isSpeaking = false;
    conn.ttsExpectedUntil = 0;
    if (this.streamDebounce) {
      clearTimeout(this.streamDebounce);
      this.streamDebounce = null;
    }
    this.resetLipsyncState(conn);
    const endedAt = Date.now();
    conn.lastSpeechEndedAt = endedAt;
    this.lastSpeechEndedAt = endedAt;
    this.emitStatus();
    debugLog('Convai', `[${coach.name}] Bot interrupted`);
  }

  async speakWelcome(coach: CoachConfig, dynamicInfo: string): Promise<string> {
    return this.runCoachTurn(coach, dynamicInfo, { runLlm: 'true', preflightSilence: false, waitForFullSpeech: true, maxWaitMs: 12000 });
  }

  async speakGameOver(coach: CoachConfig, dynamicInfo: string): Promise<string> {
    this.interruptBot(coach);
    return this.runCoachTurn(coach, dynamicInfo, { runLlm: 'true', preflightSilence: false, waitForFullSpeech: true, maxWaitMs: 20000 });
  }

  private estimateSpeechMs(text: string): number {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.min(12000, Math.max(1400, words * 420 + 500));
  }

  private ensureTtsExpectedUntil(conn: CoachConnection): void {
    const text = this.getBestResponseText(conn);
    if (!text.trim()) return;
    const anchor = conn.lastFinalTextAt > 0 ? conn.lastFinalTextAt : Date.now();
    const expectedEnd = anchor + this.estimateSpeechMs(text);
    if (conn.ttsExpectedUntil < expectedEnd) {
      conn.ttsExpectedUntil = expectedEnd;
    }
  }

  private speechElapsedMs(conn: CoachConnection, text: string): number {
    if (conn.lastFinalTextAt <= 0) return 0;
    return Date.now() - conn.lastFinalTextAt;
  }

  private isSpeechEstimateComplete(conn: CoachConnection, text: string): boolean {
    if (!text.trim() || conn.lastFinalTextAt <= 0) return false;
    return this.speechElapsedMs(conn, text) >= this.estimateSpeechMs(text);
  }

  private isLipsyncConversationEnded(conn: CoachConnection): boolean {
    const queue = conn.client?.blendshapeQueue;
    return Boolean(queue?.isConversationEnded?.());
  }

  private isCoachAudioPlaying(): boolean {
    for (const el of document.querySelectorAll('audio')) {
      if (el.muted || el.volume === 0 || el.readyState < 2) continue;
      if (!el.paused && !el.ended && el.currentTime > 0.01) return true;
    }
    return false;
  }

  private isCoachAudioActive(conn: CoachConnection): boolean {
    return conn.isSpeaking || this.isCoachAudioPlaying();
  }

  private markSpeechEnded(conn: CoachConnection, coachName: string, reason: string): void {
    conn.lipsyncActive = false;
    const endedAt = Date.now();
    conn.lastSpeechEndedAt = endedAt;
    this.lastSpeechEndedAt = endedAt;
    debugLog('Convai', `[${coachName}] Speech finished (${reason})`);
  }

  async waitUntilSpeechFinished(coach: CoachConfig, maxWaitMs = 15000): Promise<void> {
    const conn = this.pool.get(coach.id);
    if (!conn) return;

    const initialText = this.getBestResponseText(conn);
    if (!initialText.trim() && !this.isCoachAudioActive(conn)) return;

    this.ensureTtsExpectedUntil(conn);

    const waitGeneration = this.speechWaitGeneration;
    const start = Date.now();
    let sawSpeechActivity = conn.isSpeaking || conn.lipsyncActive || this.isCoachAudioPlaying();
    let audioQuietMs = sawSpeechActivity ? 0 : 0;
    let lastText = initialText;
    let textStableMs = 0;
    let lastPollLogAt = 0;

    while (Date.now() - start < maxWaitMs) {
      if (this.speechWaitGeneration !== waitGeneration) {
        debugLog('Convai', `[${coach.name}] Speech wait aborted (interrupted)`);
        return;
      }

      const text = this.getBestResponseText(conn);
      const audioActive = this.isCoachAudioActive(conn);

      const now = Date.now();
      if (now - lastPollLogAt >= 500) {
        lastPollLogAt = now;
        debugLog(
          'Convai',
          `[${coach.name}] speech-wait poll: isSpeaking=${conn.isSpeaking} audio=${this.isCoachAudioPlaying()} lipsync=${conn.lipsyncActive} sawActivity=${sawSpeechActivity} audioQuietMs=${audioQuietMs} textStableMs=${textStableMs} elapsed=${now - start}`,
        );
      }

      if (audioActive || conn.lipsyncActive) {
        sawSpeechActivity = true;
      }

      if (audioActive) {
        audioQuietMs = 0;
      } else if (sawSpeechActivity) {
        audioQuietMs += 50;
      }

      if (text === lastText) {
        textStableMs += 50;
      } else {
        textStableMs = 0;
        lastText = text;
        if (text.trim()) {
          conn.lastFinalTextAt = Date.now();
          conn.ttsExpectedUntil = conn.lastFinalTextAt + this.estimateSpeechMs(text);
        }
      }

      const textSettled = textStableMs >= 400;
      const audioQuiet = audioQuietMs >= 350;
      const estimateComplete = this.isSpeechEstimateComplete(conn, text);
      const sdkReportedEnd = conn.lastSpeechEndedAt >= start && textSettled;
      const lipsyncEnded = sawSpeechActivity && this.isLipsyncConversationEnded(conn);

      // Speech clearly started and audio has gone quiet.
      if (text.trim() && textSettled && sawSpeechActivity && audioQuiet) {
        this.markSpeechEnded(conn, coach.name, `audio quiet ${audioQuietMs}ms after speech activity`);
        return;
      }

      // Blendshape queue reports playback ended after we saw activity.
      if (text.trim() && textSettled && lipsyncEnded && audioQuietMs >= 200) {
        this.markSpeechEnded(conn, coach.name, 'blendshape conversation ended');
        return;
      }

      // SDK reported end after speech activity.
      if (sdkReportedEnd && sawSpeechActivity && audioQuiet) {
        this.markSpeechEnded(conn, coach.name, 'SDK end signal');
        return;
      }

      // Fallback when SDK/audio signals are unreliable: full estimated duration since last FINAL.
      if (text.trim() && textSettled && estimateComplete && audioQuietMs >= 250) {
        this.markSpeechEnded(conn, coach.name, `TTS estimate complete (${this.speechElapsedMs(conn, text)}ms)`);
        return;
      }

      // Last-resort fallback: the SDK never reported any audio/lipsync activity for this turn
      // (isSpeaking stuck false, no playable <audio>, no blendshapes — the historical too-slow
      // bug). Rather than hang until the hard timeout, release once the FINAL text has been
      // stable and the full estimated speech duration has elapsed since it arrived: the audio
      // either already played undetected or never will. The word-count estimate (~143 wpm) is
      // deliberately on the slow side, so this still over-waits rather than cutting speech off.
      if (text.trim() && textSettled && !sawSpeechActivity && estimateComplete) {
        this.markSpeechEnded(conn, coach.name, `TTS estimate complete, no activity detected (${this.speechElapsedMs(conn, text)}ms)`);
        return;
      }

      await this.sleep(50);
    }

    conn.lipsyncActive = false;
    const endedAt = Date.now();
    conn.lastSpeechEndedAt = endedAt;
    this.lastSpeechEndedAt = endedAt;
    debugLog('Convai', `[${coach.name}] waitUntilSpeechFinished timed out after ${maxWaitMs}ms`);
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
    const coaches: Record<string, { connected: boolean; botReady: boolean; connecting: boolean; speaking: boolean; thinking: boolean }> = {};
    for (const [id, conn] of this.pool) {
      coaches[id] = {
        connected: conn.connected,
        botReady: conn.botReady,
        connecting: conn.connecting,
        speaking: conn.isSpeaking,
        thinking: conn.isThinking,
      };
    }
    return {
      activeCoachId: this.activeCoachId,
      connected: Boolean(active?.connected),
      botReady: Boolean(active?.botReady),
      connecting: Boolean(active?.connecting),
      speaking: Boolean(active?.isSpeaking),
      thinking: Boolean(active?.isThinking),
      convaiTurnInFlight: this.convaiTurnInFlight,
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

  private async pushDynamicContext(coach: CoachConfig, dynamicInfo: string, runLlm: RunLlmMode): Promise<void> {
    const conn = this.pool.get(coach.id);
    if (!conn?.client || !conn.connected || !dynamicInfo.trim()) return;
    if (typeof conn.client.updateContext === 'function') {
      conn.client.updateContext({ text: dynamicInfo, mode: 'replace', run_llm: runLlm });
    } else {
      conn.client.updateDynamicInfo(dynamicInfo);
    }
    debugLog('Convai', `[${coach.name}] Dynamic context len=${dynamicInfo.length} run_llm=${runLlm}`);
  }

  private async sendContextTurn(
    coach: CoachConfig,
    dynamicInfo: string,
    runLlm: RunLlmMode,
    maxWaitMs?: number,
    requireFullSpeech = false,
  ): Promise<string> {
    const conn = this.pool.get(coach.id);
    if (!conn?.client || !conn.connected) return '';

    await this.waitForReady(conn, 2000);
    const readyConn = this.pool.get(coach.id);
    if (!readyConn?.client || !readyConn.connected) return '';

    this.resetResponseState(readyConn);
    this.activeCoachId = coach.id;
    try { readyConn.client.blendshapeQueue?.startConversation?.(); } catch {}

    const sessionId = readyConn.client.conversationSessionId ?? 'unknown';
    debugLog('Convai', `[${coach.name}] Context turn session=${sessionId} run_llm=${runLlm}`);
    await this.pushDynamicContext(coach, dynamicInfo, runLlm);

    const turnBudgetMs = maxWaitMs ?? (requireFullSpeech ? 15000 : 8000);
    const turnStart = Date.now();
    const remainingBudget = () => Math.max(0, turnBudgetMs - (Date.now() - turnStart));
    const textBudgetMs = requireFullSpeech
      ? Math.min(10000, remainingBudget())
      : remainingBudget();

    const isAutoContextTurn = runLlm === 'auto';
    const response = await this.waitForResponseCompletion(readyConn, isAutoContextTurn, textBudgetMs, requireFullSpeech);
    if (requireFullSpeech && response.trim()) {
      const speechBudget = Math.max(remainingBudget(), 4000);
      await this.waitUntilSpeechFinished(coach, speechBudget);
    }
    return response;
  }

  private async sendAndAwaitSpeech(coach: CoachConfig, message: string, dynamicInfo: string): Promise<string> {
    const conn = this.pool.get(coach.id);
    if (!conn?.client || !conn.connected) return '';

    await this.waitForReady(conn, 2000);
    if (!conn.botReady && this.isReadyStale(conn)) {
      debugLog('Convai', `[${coach.name}] BOT READY still pending on stale session; reconnecting`);
      await this.disconnectOne(conn);
      await this.connectCoach(coach, {
        waitForBotReady: true,
        readyWaitMs: 3500,
        staticPolicy: conn.staticPolicy,
        endUserId: conn.endUserId,
      });
    }

    const readyConn = this.pool.get(coach.id);
    if (!readyConn?.client || !readyConn.connected) return '';

    this.resetResponseState(readyConn);
    this.activeCoachId = coach.id;

    if (!message.trim()) {
      return this.sendContextTurn(coach, dynamicInfo, 'auto');
    }

    if (dynamicInfo.trim()) {
      await this.pushDynamicContext(coach, dynamicInfo, 'false');
    }

    const sessionId = readyConn.client.conversationSessionId ?? 'unknown';
    debugLog('Convai', `[${coach.name}] User turn session=${sessionId}: "${message.slice(0, 100)}"`);
    try { readyConn.client.blendshapeQueue?.startConversation?.(); } catch {}
    readyConn.client.sendUserTextMessage(message);

    const turnBudgetMs = 12000;
    const turnStart = Date.now();
    const remainingBudget = () => Math.max(0, turnBudgetMs - (Date.now() - turnStart));
    const response = await this.waitForResponseCompletion(readyConn, false, remainingBudget(), true);
    const speechBudget = remainingBudget();
    if (response.trim() && speechBudget > 0) {
      await this.waitUntilSpeechFinished(coach, speechBudget);
    }
    debugLog('Convai', `[${coach.name}] Speech done. Response: "${response.slice(0, 100)}"`);
    return this.getBestResponseText(readyConn) || response;
  }

  private resetResponseState(conn: CoachConnection): void {
    conn.lastEmittedText = '';
    conn.streamBuffer = '';
    conn.longestResponseText = '';
    conn.responseSuppressed = false;
    conn.responseSuppressedReason = '';
    conn.llmNoResponse = false;
    conn.hasFlushed = false;
    conn.turnEnded = false;
    conn.lastTurnEndAt = 0;
    conn.lastFinalTextAt = 0;
    conn.ttsExpectedUntil = 0;
    this.resetLipsyncState(conn);
  }

  private async waitForFinalText(conn: CoachConnection, maxWaitMs: number, stableMs = 400): Promise<void> {
    if (maxWaitMs <= 0) return;
    const start = Date.now();
    let stableFor = 0;
    let lastText = this.getBestResponseText(conn);
    while (Date.now() - start < maxWaitMs) {
      if (conn.llmNoResponse || conn.responseSuppressed) return;
      this.captureLatestText(conn);
      const current = this.getBestResponseText(conn);
      if (current === lastText) {
        stableFor += 50;
      } else {
        stableFor = 0;
        lastText = current;
        if (current.trim()) {
          conn.lastFinalTextAt = Date.now();
          conn.ttsExpectedUntil = conn.lastFinalTextAt + this.estimateSpeechMs(current);
        }
      }
      if (current.trim() && conn.turnEnded && stableFor >= 200) return;
      if (current.trim() && stableFor >= stableMs) return;
      await this.sleep(50);
    }
  }

  private async waitForResponseCompletion(
    conn: CoachConnection,
    isAutoContextTurn = false,
    maxWaitMs?: number,
    requireFullSpeech = false,
  ): Promise<string> {
    const budgetMs = maxWaitMs ?? 30000;
    const deadline = Date.now() + budgetMs;
    const remaining = () => Math.max(0, deadline - Date.now());
    const pastDeadline = () => Date.now() >= deadline;

    let everSpoke = false;
    const initialCap = Math.min(isAutoContextTurn ? 2500 : 4000, budgetMs);
    const initialStart = Date.now();
    while (Date.now() - initialStart < initialCap) {
      if (pastDeadline()) break;
      await this.sleep(100);
      if (conn.llmNoResponse) return '';
      if (conn.responseSuppressed) return '';
      if (conn.turnEnded) break;
      if (conn.isSpeaking) {
        everSpoke = true;
        break;
      }
      this.captureLatestText(conn);
      if (conn.lastEmittedText && !requireFullSpeech) break;
      if (requireFullSpeech && conn.longestResponseText.trim() && conn.turnEnded) break;
    }

    if (!everSpoke && !conn.lastEmittedText && !conn.turnEnded && remaining() > 0) {
      await this.waitForTurnEndOrFirstText(conn, Math.min(isAutoContextTurn ? 1500 : 2000, remaining()));
      if (conn.llmNoResponse) return '';
      if (conn.responseSuppressed) return '';
      if (conn.isSpeaking) everSpoke = true;
    }

    // Only treat "no text yet" as a silent abstain on fast turns. When the caller must wait
    // for the full spoken line (coach moves: auto + requireFullSpeech), an empty buffer at
    // this point usually means the LLM response is still in flight — the transcript and TTS
    // routinely arrive ~7-8s after the context push. Abstaining here is exactly what made the
    // coach move before her line started. Genuine silence is signalled by llmNoResponse /
    // responseSuppressed, which waitForFinalText below honours as an immediate exit.
    if (
      isAutoContextTurn &&
      !requireFullSpeech &&
      !conn.lastEmittedText &&
      !conn.streamBuffer &&
      !conn.longestResponseText &&
      !conn.isSpeaking
    ) {
      debugLog('Convai', `[${conn.coach.name}] Auto-context turn yielded no text; treating as silent abstain`);
      return '';
    }

    if (requireFullSpeech) {
      await this.waitForFinalText(conn, remaining(), 400);
    } else if ((conn.isSpeaking || everSpoke || conn.lastEmittedText) && remaining() > 0) {
      let silentMs = 0;
      const speakingCap = Math.min(isAutoContextTurn ? 8000 : 20000, remaining());
      const speakingStart = Date.now();
      while (Date.now() - speakingStart < speakingCap) {
        if (pastDeadline()) break;
        await this.sleep(100);
        if (conn.llmNoResponse) return '';
        if (conn.responseSuppressed) return '';

        if (
          isAutoContextTurn &&
          !conn.isSpeaking &&
          !conn.lastEmittedText &&
          !conn.streamBuffer &&
          !conn.longestResponseText &&
          silentMs >= 500
        ) {
          debugLog('Convai', `[${conn.coach.name}] Auto-context turn flickered isSpeaking without text; exiting fast`);
          return '';
        }

        if (!conn.isSpeaking) {
          silentMs += 100;
          if (conn.turnEnded && silentMs >= 300) break;
          if (silentMs >= 1500) break;
        } else {
          silentMs = 0;
        }
      }
      if (remaining() > 0) {
        await this.waitForTurnEndOrStableText(
          conn,
          Math.min(isAutoContextTurn ? 1000 : 2000, remaining()),
          isAutoContextTurn ? 300 : 500,
        );
      }
    } else if (conn.lastEmittedText && remaining() > 0) {
      await this.waitForTurnEndOrStableText(
        conn,
        Math.min(isAutoContextTurn ? 1000 : 2000, remaining()),
        isAutoContextTurn ? 300 : 500,
      );
    }

    this.captureLatestText(conn);
    this.ensureTtsExpectedUntil(conn);
    if ((everSpoke || conn.lastEmittedText) && !requireFullSpeech) {
      this.lastSpeechEndedAt = Date.now();
      await this.waitForGlobalSilence(
        `${conn.coach.name} post-speech`,
        80,
        Math.min(isAutoContextTurn ? 200 : 250, remaining()),
      );
    }
    return this.getBestResponseText(conn);
  }

  private async waitForTurnEndOrFirstText(conn: CoachConnection, maxWaitMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      await this.sleep(100);
      if (conn.llmNoResponse) return;
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
      await this.sleep(100);
      if (conn.llmNoResponse) return;
      if (conn.responseSuppressed) return;
      const current = conn.longestResponseText || conn.lastEmittedText || conn.streamBuffer;
      if (current === lastText) {
        stableFor += 100;
      } else {
        stableFor = 0;
        lastText = current;
      }
      if (conn.turnEnded && stableFor >= 200) return;
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
    conn.lastFinalTextAt = Date.now();
    conn.ttsExpectedUntil = conn.lastFinalTextAt + this.estimateSpeechMs(text);
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

  private markLlmNoResponse(conn: CoachConnection): void {
    if (conn.llmNoResponse) return;
    conn.llmNoResponse = true;
    conn.streamBuffer = '';
    conn.lastEmittedText = '';
    conn.longestResponseText = '';
    conn.turnEnded = true;
    conn.lastTurnEndAt = Date.now();
    conn.isThinking = false;
    if (this.streamDebounce) {
      clearTimeout(this.streamDebounce);
      this.streamDebounce = null;
    }
    this.resetLipsyncState(conn);
    this.lastSpeechEndedAt = Date.now();
    this.emitStatus();
    debugLog('Convai', `[${conn.coach.name}] LLM chose no response`);
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
    const stale = !conn.isSpeaking
      && conn.lastFinalTextAt > 0
      && Date.now() - conn.lastFinalTextAt >= 2000;
    if (!ended && !stale) return false;
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
    conn.boardVisionPublished = false;
    this.resetLipsyncState(conn);
    conn.streamBuffer = '';
    conn.lastEmittedText = '';
    conn.longestResponseText = '';
    conn.responseSuppressed = false;
    conn.responseSuppressedReason = '';
    conn.llmNoResponse = false;
    conn.turnEnded = false;
    conn.lastTurnEndAt = 0;
    conn.isThinking = false;
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
