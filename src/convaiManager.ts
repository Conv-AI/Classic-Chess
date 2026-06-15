import {
  registerKnownEndUserId,
  resolveConvaiConnectionEndUserId,
  type UserIdentity,
  usesConvaiLongTermMemory,
} from './auth';
import { buildCoachInstruction } from './chessAi';
import { isBoardVisionEnabled, publishBoardVisionTrack, type BoardVisionSession } from './boardVision';
import { getConvaiApiKey } from './convaiApiKey';
import { deleteAllEndUsers, isMauLimitError } from './convaiEndUsers';
import {
  COACHES,
  resolveConvaiCharacterId,
  type CoachConfig,
  type CoachId,
  type DifficultyConfig,
} from './coachConfig';
import { debugLog } from './debugLog';
const SUPPRESSED_RESPONSE_PATTERN = /^\s*(silent|human):?\s*[.!?]*\s*$/i;
const PROMPT_LEAK_PATTERN = /^\s*(human|system|user)\s*:/i;
const MIN_SPEECH_WAIT_MS = 7000;
const WELCOME_TURN_BUDGET_MS = 20000;

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
  endUserMetadata: Record<string, unknown> | null;
  ltmEnabled: boolean;
  activeCharacterId: string;
  profileMemoryKey: string;
  boardVision: BoardVisionSession | null;
  lastConnectError: string;
  ltmRecoveryAttempted: boolean;
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
    endUserMetadata: null,
    ltmEnabled: false,
    activeCharacterId: '',
    profileMemoryKey: '',
    boardVision: null,
    lastConnectError: '',
    ltmRecoveryAttempted: false,
  };
}

function sameMetadata(a: Record<string, unknown> | null, b: Record<string, unknown> | null): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
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
  // A conversation epoch is bumped whenever a brand-new game starts. Speech tasks capture
  // the epoch when enqueued and bail if it changed before they run — this discards stale
  // queued turns (e.g. answers to messages sent during the previous game) so the coach
  // never parrots old context after "New game".
  private conversationEpoch = 0;
  // Monotonic id for user chat turns. Only the most recent pending chat is allowed to run,
  // so bombarding the coach with messages answers just the latest instead of stacking up.
  private latestChatSeq = 0;
  private userTranscript = '';
  private transcriptListeners = new Set<(text: string) => void>();
  private globalEndUserId = '';
  private globalEndUserMetadata: Record<string, unknown> | null = null;
  private globalLtmEnabled = false;

  constructor() {
    for (const coach of COACHES) this.pool.set(coach.id, createConnection(coach));
  }

  syncEndUserIdentity(identity: UserIdentity | null | undefined): void {
    this.globalLtmEnabled = usesConvaiLongTermMemory(identity);
    this.globalEndUserId = resolveConvaiConnectionEndUserId(identity);
    this.globalEndUserMetadata = this.globalLtmEnabled ? identity?.endUserMetadata ?? null : null;
    this.applyEndUserIdentityToPool();
    if (this.globalLtmEnabled) {
      debugLog('Convai', `Long-term memory enabled for endUserId=${this.globalEndUserId}`);
    } else {
      debugLog(
        'Convai',
        `Guest session — endUserId=${this.globalEndUserId} (stable per browser, no app-side LTM writes)`,
      );
    }
  }

  private applyEndUserIdentityToPool(): void {
    for (const conn of this.pool.values()) {
      conn.endUserId = this.globalEndUserId;
      conn.endUserMetadata = this.globalEndUserMetadata;
      conn.ltmEnabled = this.globalLtmEnabled;
    }
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
      endUserMetadata?: Record<string, unknown> | null;
      staticPolicy?: string;
    } = {},
  ): Promise<void> {
    this.activeCoachId = coach.id as CoachId;
    const conn = this.ensureConnection(coach);

    const targetCharacterId = resolveConvaiCharacterId(coach, this.globalLtmEnabled);
    const needsReconnectForUser = Boolean(
      conn.connected &&
      (
        conn.activeCharacterId !== targetCharacterId ||
        (options.endUserId !== undefined && conn.endUserId !== options.endUserId) ||
        (options.endUserMetadata !== undefined && !sameMetadata(conn.endUserMetadata, options.endUserMetadata ?? null))
      ),
    );

    if (options.staticPolicy) conn.staticPolicy = options.staticPolicy;
    if (options.endUserMetadata !== undefined) {
      this.globalEndUserMetadata = options.endUserMetadata ?? null;
    }
    if (options.endUserId !== undefined) {
      this.globalEndUserId = options.endUserId.trim();
      if (this.globalEndUserId) registerKnownEndUserId(this.globalEndUserId);
    }
    this.applyEndUserIdentityToPool();

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
        if (conn.connected) await this.ensureProfileMemory(conn);
        if (conn.connected && isBoardVisionEnabled() && !conn.boardVision && conn.client) {
          conn.boardVision = await publishBoardVisionTrack(conn.client);
        }
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
    conn.lastConnectError = '';

    try {
      await this.establishConvaiSession(coach, conn, options, apiKey);
      conn.ltmRecoveryAttempted = false;
    } catch (err) {
      const message = String((err as { message?: string })?.message ?? conn.lastConnectError ?? err ?? '');
      if (conn.client || conn.unsubFns.length > 0) {
        await this.disconnectOne(conn);
      }

      if (isMauLimitError(message) && !conn.ltmRecoveryAttempted) {
        conn.ltmRecoveryAttempted = true;
        debugLog('Convai', `[${coach.name}] MAU limit reached — deleting all end users and retrying once`);
        const { deleted, failed } = await deleteAllEndUsers([conn.endUserId, this.globalEndUserId]);
        debugLog('Convai', `[${coach.name}] MAU cleanup complete — deleted=${deleted} failed=${failed}`);
        conn.lastConnectError = '';
        try {
          await this.establishConvaiSession(coach, conn, options, apiKey);
          conn.ltmRecoveryAttempted = false;
        } catch (retryErr) {
          const retryMessage = String(
            (retryErr as { message?: string })?.message ?? conn.lastConnectError ?? retryErr ?? '',
          );
          if (conn.client || conn.unsubFns.length > 0) {
            await this.disconnectOne(conn);
          }
          debugLog('Convai', `[${coach.name}] Connection failed after MAU cleanup:`, retryMessage || retryErr);
        }
      } else {
        debugLog('Convai', `[${coach.name}] Connection failed:`, message || err);
      }
    } finally {
      conn.connecting = false;
      this.emitStatus();
    }
  }

  private async establishConvaiSession(
    coach: CoachConfig,
    conn: CoachConnection,
    options: {
      waitForBotReady?: boolean;
      readyWaitMs?: number;
    },
    apiKey: string,
  ): Promise<void> {
    const characterId = resolveConvaiCharacterId(coach, conn.ltmEnabled);
    const endUserId = conn.endUserId || undefined;
    const usingGuestClone = !conn.ltmEnabled && Boolean(coach.guestCharacterId?.trim());
    debugLog(
      'Convai',
      `[${coach.name}] Connecting character=${characterId} endUserId=${endUserId}${
        conn.ltmEnabled ? ' (LTM on)' : ' (guest, no LTM writes)'
      }${usingGuestClone ? ' [guest clone]' : ''}...`,
    );
    const sdk = await import('@convai/web-sdk/vanilla');
    const { ConvaiClient, AudioRenderer } = sdk;

    const client = new ConvaiClient({
      apiKey,
      characterId,
      endUserId,
      endUserMetadata: conn.ltmEnabled ? conn.endUserMetadata || undefined : undefined,
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
            // The coach is replying now, so the user's pending live transcript is done.
            if (this.userTranscript) this.emitTranscript('');
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
        const message = String(err?.message || err || '');
        conn.lastConnectError = message;
        debugLog('Convai', `[${coach.name}] error:`, message);
        if (/missing end_user_id/i.test(message)) {
          debugLog(
            'Convai',
            `[${coach.name}] Guest play requires LTM disabled on this Convai character, or a separate guest clone via VITE_CONVAI_GUEST_CHARACTER_${String(coach.id).toUpperCase()}.`,
          );
        } else if (isMauLimitError(message)) {
          debugLog(
            'Convai',
            `[${coach.name}] MAU limit reached — will delete all end users and retry once.`,
          );
        }
      }));

      conn.unsubFns.push(client.on('turnEnd', (payload: any) => {
        conn.turnEnded = true;
        conn.lastTurnEndAt = Date.now();
        const sessionId = payload?.sessionId ?? client.conversationSessionId ?? 'unknown';
        debugLog('Convai', `[${coach.name}] turnEnd session=${sessionId}`);
        this.captureLatestText(conn);
        if (this.userTranscript) this.emitTranscript('');
      }));

      // Live microphone transcription: stream the partial text to the UI and treat the user
      // starting to speak as a preemption, so any in-flight orchestrated turn (a welcome line,
      // a move comment) stops waiting and the user is given priority instead of looping.
      conn.unsubFns.push(
        client.on('userTranscriptionChange', (payload: any) => {
          const text = typeof payload === 'string'
            ? payload
            : String(payload?.text ?? payload?.transcription ?? payload?.content ?? '');
          this.handleUserTranscription(conn, text);
        }) ?? (() => {}),
      );

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
      if (isMauLimitError(conn.lastConnectError) || /missing end_user_id/i.test(conn.lastConnectError)) {
        throw new Error(conn.lastConnectError);
      }
      conn.client = client;
      conn.activeCharacterId = characterId;
      conn.connected = true;
      conn.connectedAt = Date.now();

      try {
        conn.audioRenderer = new AudioRenderer(client.room);
        debugLog('Convai', `[${coach.name}] AudioRenderer created`);
      } catch (err) {
        debugLog('Convai', `[${coach.name}] AudioRenderer failed:`, err);
      }

      if (isBoardVisionEnabled() && !conn.boardVision) {
        conn.boardVision = await publishBoardVisionTrack(client);
      }

      setTimeout(() => {
        document.querySelectorAll('audio').forEach((el) => {
          if (el.paused) el.play().catch(() => {});
        });
      }, 1500);

    if (conn.staticPolicy) await this.seedStaticCoachPolicy(coach, conn.staticPolicy);
    if (options.waitForBotReady) await this.waitForReady(conn, options.readyWaitMs ?? 5000);
    await this.ensureProfileMemory(conn);
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
    options: { runLlm?: RunLlmMode; preflightSilence?: boolean; maxWaitMs?: number; waitForFullSpeech?: boolean; guard?: () => boolean; skipConnect?: boolean } = {},
  ): Promise<string> {
    const runLlm = options.runLlm ?? 'auto';
    const startEpoch = this.conversationEpoch;
    const extraGuard = options.guard;
    const stillRelevant = () => startEpoch === this.conversationEpoch && (!extraGuard || extraGuard());
    return this.runExclusiveSpeech(async () => {
      if (!stillRelevant()) {
        debugLog('Convai', `[${coach.name}] Coach turn superseded before start; skipping`);
        return '';
      }
      this.convaiTurnInFlight = true;
      this.emitStatus();
      try {
        this.activeCoachId = coach.id;
        if (!options.skipConnect) {
          await this.connectCoach(coach, {
            waitForBotReady: true,
            readyWaitMs: 3500,
            reconnectIfStale: true,
            staticPolicy: this.pool.get(coach.id)?.staticPolicy,
            endUserId: this.pool.get(coach.id)?.endUserId,
            endUserMetadata: this.pool.get(coach.id)?.endUserMetadata ?? undefined,
          });
        }
        if (options.preflightSilence !== false) {
          await this.waitForGlobalSilence(`${coach.name} turn preflight`, 150, 300);
        }
        const genAtStart = this.speechWaitGeneration;
        let response = await this.sendContextTurn(coach, dynamicInfo, runLlm, options.maxWaitMs, options.waitForFullSpeech);
        // Only retry a genuinely empty forced turn — not one cut short by the user or a new
        // game. A bumped speech generation or changed epoch means we were interrupted, and
        // replaying the same line then would re-greet/re-explain on top of whatever the user
        // just triggered (the "welcome keeps playing" loop).
        if (
          !response.trim() &&
          runLlm === 'true' &&
          this.speechWaitGeneration === genAtStart &&
          stillRelevant()
        ) {
          const conn = this.pool.get(coach.id);
          if (conn && !conn.llmNoResponse && !conn.responseSuppressed) {
            debugLog('Convai', `[${coach.name}] Forced turn empty; reconnecting once`);
            await this.disconnectOne(conn);
            await this.connectCoach(coach, {
              waitForBotReady: true,
              readyWaitMs: 3500,
              staticPolicy: conn.staticPolicy,
              endUserId: conn.endUserId,
              endUserMetadata: conn.endUserMetadata ?? undefined,
            });
            if (stillRelevant()) {
              response = await this.sendContextTurn(coach, dynamicInfo, runLlm, options.maxWaitMs, options.waitForFullSpeech);
            }
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

  async speakCoachMessage(coach: CoachConfig, message: string, dynamicInfo: string, guard?: () => boolean): Promise<string> {
    const startEpoch = this.conversationEpoch;
    const stillRelevant = () => startEpoch === this.conversationEpoch && (!guard || guard());
    return this.runExclusiveSpeech(async () => {
      if (!stillRelevant()) {
        debugLog('Convai', `[${coach.name}] Message superseded before start; skipping`);
        return '';
      }
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
          endUserMetadata: this.pool.get(coach.id)?.endUserMetadata ?? undefined,
        });
        await this.waitForGlobalSilence(`${coach.name} turn preflight`, 150, 300);
        const genAtStart = this.speechWaitGeneration;
        let response = await this.sendAndAwaitSpeech(coach, message, dynamicInfo);
        if (!response.trim()) {
          const conn = this.pool.get(coach.id);
          if (conn?.llmNoResponse || conn?.responseSuppressed) {
            return '';
          }
          if (conn && message.trim() && this.speechWaitGeneration === genAtStart && stillRelevant()) {
            debugLog('Convai', `[${coach.name}] Empty response, reconnecting once`);
            await this.disconnectOne(conn);
            await this.connectCoach(coach, {
              waitForBotReady: true,
              readyWaitMs: 3500,
              staticPolicy: conn.staticPolicy,
              endUserId: conn.endUserId,
              endUserMetadata: conn.endUserMetadata ?? undefined,
            });
            if (stillRelevant()) {
              response = await this.sendAndAwaitSpeech(coach, message, dynamicInfo);
            }
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
    // The user gets priority: stop whatever the coach is currently saying right away, and
    // tag this turn so that if more messages arrive while it waits, only the newest one is
    // actually answered (older ones are skipped by the guard below). `dynamicInfo` carries
    // the live board context, which sendAndAwaitSpeech pushes before the question.
    const mySeq = ++this.latestChatSeq;
    const myEpoch = this.conversationEpoch;
    this.interruptBot(coach);
    this.emitTranscript('');
    const staticPolicy = `${buildCoachInstruction(coach, difficulty, 'chat')}`;
    await this.seedStaticCoachPolicy(coach, staticPolicy);
    return this.speakCoachMessage(
      coach,
      `The student asks: "${message}". Answer using the current board context.`,
      dynamicInfo,
      () => mySeq === this.latestChatSeq && myEpoch === this.conversationEpoch,
    );
  }

  async updateCoachContext(coach: CoachConfig, dynamicInfo: string): Promise<void> {
    this.activeCoachId = coach.id;
    await this.connectCoach(coach, {
      staticPolicy: this.pool.get(coach.id)?.staticPolicy,
      endUserId: this.pool.get(coach.id)?.endUserId,
      endUserMetadata: this.pool.get(coach.id)?.endUserMetadata ?? undefined,
    });
    await this.pushDynamicContext(coach, dynamicInfo, 'false');
  }

  async rememberGameSummary(coach: CoachConfig, memory: string): Promise<boolean> {
    const conn = this.pool.get(coach.id);
    const text = memory.trim();
    const manager = conn?.client?.memoryManager;
    if (!conn?.ltmEnabled || !text || !manager?.addMemories) return false;
    try {
      const exists = await this.memoryExists(manager, text);
      if (!exists) {
        await manager.addMemories([text]);
        debugLog('Convai', `[${coach.name}] Saved long-term memory: ${text}`);
      }
      return true;
    } catch (err) {
      debugLog('Convai', `[${coach.name}] Failed to save long-term memory:`, err);
      return false;
    }
  }

  refreshBoardVision(coach: CoachConfig, fen?: string): void {
    if (!isBoardVisionEnabled()) return;
    const conn = this.pool.get(coach.id);
    if (!conn?.boardVision) return;
    const refreshed = fen?.trim()
      ? conn.boardVision.updateFromFen(fen)
      : conn.boardVision.refresh();
    if (!refreshed) {
      debugLog('BoardVision', `[${coach.name}] Live board refresh skipped`);
    }
  }

  async beginNewGame(
    coach: CoachConfig,
    difficulty: DifficultyConfig,
    sessionId: string,
    startingDynamicInfo: string,
    identity?: UserIdentity | null,
    welcomeDynamicInfo?: string,
  ): Promise<string> {
    const staticPolicy = buildCoachInstruction(coach, difficulty, 'move');
    this.syncEndUserIdentity(identity);
    const endUserId = this.globalEndUserId;
    const endUserMetadata = this.globalEndUserMetadata;
    const conn = this.pool.get(coach.id);
    if (conn) {
      conn.staticPolicy = staticPolicy;
    }

    // New conversation: invalidate any speech turns still queued from the previous game and
    // drop pending user-chat sequencing, so nothing from the old game speaks into the new one.
    this.conversationEpoch++;
    this.latestChatSeq = 0;
    this.emitTranscript('');

    this.interruptBot(coach);
    await this.connectCoach(coach, {
      waitForBotReady: true,
      readyWaitMs: 3500,
      endUserId,
      endUserMetadata,
      staticPolicy,
      reconnectIfStale: false,
    });

    const readyConn = this.pool.get(coach.id);
    if (!readyConn?.client) return '';

    try { readyConn.client.resetSession?.(); } catch {}
    try {
      readyConn.client.updateContext?.({ mode: 'reset', run_llm: 'false' });
    } catch {}

    await this.seedStaticCoachPolicy(coach, staticPolicy);
    await this.pushDynamicContext(coach, startingDynamicInfo, 'false');
    debugLog(
      'Convai',
      `[${coach.name}] New game session=${sessionId} endUserId=${endUserId}${this.globalLtmEnabled ? ' (LTM on)' : ' (guest, LTM off)'}`,
    );

    if (!welcomeDynamicInfo?.trim()) return '';

    return this.runExclusiveSpeech(async () => {
      this.convaiTurnInFlight = true;
      this.emitStatus();
      try {
        return await this.deliverWelcomeLine(coach, welcomeDynamicInfo);
      } finally {
        this.convaiTurnInFlight = false;
        this.emitStatus();
      }
    });
  }

  private async deliverWelcomeLine(coach: CoachConfig, welcomeDynamicInfo: string): Promise<string> {
    const conn = this.pool.get(coach.id);
    if (!conn?.client || !conn.connected) return '';

    await this.waitForReady(conn, 2000);
    const genAtStart = this.speechWaitGeneration;
    let response = await this.sendContextTurn(
      coach,
      welcomeDynamicInfo,
      'true',
      WELCOME_TURN_BUDGET_MS,
      true,
    );

    const afterTurn = this.pool.get(coach.id);
    if (
      !response.trim() &&
      afterTurn &&
      !afterTurn.llmNoResponse &&
      !afterTurn.responseSuppressed &&
      this.speechWaitGeneration === genAtStart
    ) {
      debugLog('Convai', `[${coach.name}] Welcome line empty; reconnecting once`);
      const retryPolicy = afterTurn.staticPolicy;
      const retryEndUserId = afterTurn.endUserId;
      const retryMetadata = afterTurn.endUserMetadata;
      await this.disconnectOne(afterTurn);
      await this.connectCoach(coach, {
        waitForBotReady: true,
        readyWaitMs: 3500,
        staticPolicy: retryPolicy,
        endUserId: retryEndUserId,
        endUserMetadata: retryMetadata ?? undefined,
        reconnectIfStale: false,
      });
      if (this.speechWaitGeneration === genAtStart) {
        response = await this.sendContextTurn(
          coach,
          welcomeDynamicInfo,
          'true',
          WELCOME_TURN_BUDGET_MS,
          true,
        );
      }
    }

    const finalConn = this.pool.get(coach.id);
    return finalConn ? this.getBestResponseText(finalConn) || response : response;
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
    return this.runCoachTurn(coach, dynamicInfo, {
      runLlm: 'true',
      preflightSilence: false,
      waitForFullSpeech: true,
      maxWaitMs: WELCOME_TURN_BUDGET_MS,
      skipConnect: true,
    });
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

  private isCoachSpeechSignalActive(conn: CoachConnection): boolean {
    return conn.isSpeaking || conn.lipsyncActive;
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
    if (!initialText.trim() && !this.isCoachSpeechSignalActive(conn)) return;

    this.ensureTtsExpectedUntil(conn);

    const waitGeneration = this.speechWaitGeneration;
    const start = Date.now();
    let sawSpeechActivity = this.isCoachSpeechSignalActive(conn);
    let signalQuietMs = sawSpeechActivity ? 0 : 0;
    let lastText = initialText;
    let textStableMs = 0;
    let lastPollLogAt = 0;

    while (Date.now() - start < maxWaitMs) {
      if (this.speechWaitGeneration !== waitGeneration) {
        debugLog('Convai', `[${coach.name}] Speech wait aborted (interrupted)`);
        return;
      }

      const text = this.getBestResponseText(conn);
      const speechSignalActive = this.isCoachSpeechSignalActive(conn);
      const audioElementPlaying = this.isCoachAudioPlaying();

      const now = Date.now();
      if (now - lastPollLogAt >= 500) {
        lastPollLogAt = now;
        debugLog(
          'Convai',
          `[${coach.name}] speech-wait poll: isSpeaking=${conn.isSpeaking} audioEl=${audioElementPlaying} lipsync=${conn.lipsyncActive} sawActivity=${sawSpeechActivity} signalQuietMs=${signalQuietMs} textStableMs=${textStableMs} elapsed=${now - start}`,
        );
      }

      if (speechSignalActive) {
        sawSpeechActivity = true;
      }

      if (speechSignalActive) {
        signalQuietMs = 0;
      } else if (sawSpeechActivity) {
        signalQuietMs += 50;
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
      const signalQuiet = signalQuietMs >= 250;
      const estimateComplete = this.isSpeechEstimateComplete(conn, text);
      const sdkReportedEnd = conn.lastSpeechEndedAt >= start && textSettled;
      const lipsyncEnded = sawSpeechActivity && this.isLipsyncConversationEnded(conn);

      // Speech clearly started and the SDK/lipsync signals are now quiet. We do not
      // gate this on hidden <audio> elements because LiveKit audio elements can remain
      // "playing" while silent, which made coach moves wait until the hard timeout.
      if (text.trim() && textSettled && sawSpeechActivity && signalQuiet) {
        this.markSpeechEnded(conn, coach.name, `speech signal quiet ${signalQuietMs}ms after activity`);
        return;
      }

      // Blendshape queue reports playback ended after we saw activity.
      if (text.trim() && textSettled && lipsyncEnded && signalQuietMs >= 200) {
        this.markSpeechEnded(conn, coach.name, 'blendshape conversation ended');
        return;
      }

      // SDK reported end after speech activity.
      if (sdkReportedEnd && sawSpeechActivity && signalQuiet) {
        this.markSpeechEnded(conn, coach.name, 'SDK end signal');
        return;
      }

      // Fallback when SDK/audio signals are unreliable: full estimated duration since last FINAL.
      if (text.trim() && textSettled && estimateComplete && signalQuietMs >= 250) {
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
        this.emitTranscript('');
      }
    } catch (err) {
      debugLog('Convai', `[Mic] Toggle failed:`, err);
    }
    this.emitStatus();
  }

  /** Subscribe to live user speech transcription ('' when cleared). */
  onUserTranscript(listener: (text: string) => void): () => void {
    this.transcriptListeners.add(listener);
    listener(this.userTranscript);
    return () => this.transcriptListeners.delete(listener);
  }

  getUserTranscript(): string {
    return this.userTranscript;
  }

  private emitTranscript(text: string): void {
    if (text === this.userTranscript) return;
    this.userTranscript = text;
    for (const listener of this.transcriptListeners) listener(text);
  }

  private handleUserTranscription(conn: CoachConnection, rawText: string): void {
    const text = (rawText ?? '').trim();
    // Ignore echoes of text we sent programmatically (chat box / hints) — only genuine
    // live mic speech should drive the transcript + preemption.
    if (/^the student asks:/i.test(text)) return;
    // The user starting to speak preempts any in-flight orchestrated turn: bump the speech
    // generation so its wait/retry logic aborts instead of replaying over the user.
    if (text && !this.userTranscript) {
      this.speechWaitGeneration++;
      this.lastSpeechEndedAt = Date.now();
      debugLog('Convai', `[${conn.coach.name}] User started speaking (mic) — preempting`);
    }
    this.emitTranscript(text);
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
      ? Math.max(4000, remainingBudget() - MIN_SPEECH_WAIT_MS)
      : remainingBudget();

    const isAutoContextTurn = runLlm === 'auto';
    const response = await this.waitForResponseCompletion(readyConn, isAutoContextTurn, textBudgetMs, requireFullSpeech);
    if (requireFullSpeech && response.trim()) {
      const speechBudget = Math.max(remainingBudget(), MIN_SPEECH_WAIT_MS);
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
        endUserMetadata: conn.endUserMetadata ?? undefined,
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

  private async ensureProfileMemory(conn: CoachConnection): Promise<void> {
    const name = typeof conn.endUserMetadata?.name === 'string' ? conn.endUserMetadata.name.trim() : '';
    const manager = conn.client?.memoryManager;
    if (!conn.ltmEnabled || !name || !manager?.addMemories) return;

    const memory = `The student's name is ${name}.`;
    const key = `${conn.coach.characterId}:${conn.endUserId}:${memory}`;
    if (conn.profileMemoryKey === key) return;

    try {
      const exists = await this.memoryExists(manager, memory);
      if (!exists) await manager.addMemories([memory]);
      conn.profileMemoryKey = key;
      debugLog('Convai', `[${conn.coach.name}] Profile memory ready for ${conn.endUserId}`);
    } catch (err) {
      debugLog('Convai', `[${conn.coach.name}] Profile memory skipped:`, err);
    }
  }

  private async memoryExists(manager: any, text: string): Promise<boolean> {
    if (typeof manager.listMemories !== 'function') return false;
    try {
      const result = await manager.listMemories({ limit: 100 });
      const items = Array.isArray(result)
        ? result
        : Array.isArray(result?.memories)
          ? result.memories
          : Array.isArray(result?.items)
            ? result.items
            : Array.isArray(result?.data)
              ? result.data
              : [];
      const needle = text.toLowerCase();
      return items.some((item: unknown) => {
        if (typeof item === 'string') return item.toLowerCase() === needle;
        if (!item || typeof item !== 'object') return false;
        const value = String(
          (item as { text?: unknown; memory?: unknown; content?: unknown }).text ??
          (item as { text?: unknown; memory?: unknown; content?: unknown }).memory ??
          (item as { text?: unknown; memory?: unknown; content?: unknown }).content ??
          '',
        );
        return value.toLowerCase() === needle;
      });
    } catch {
      return false;
    }
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
    if (conn.boardVision) {
      try { conn.boardVision.stop(); } catch {}
      conn.boardVision = null;
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
