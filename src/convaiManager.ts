import { debugLog } from './debugLog';

const API_KEY = import.meta.env.VITE_CONVAI_API_KEY as string;

export type ConvaiResponse = {
  characterName: string;
  text: string;
};

type ResponseListener = (response: ConvaiResponse) => void;
type StatusListener = (status: ReturnType<ChessConvaiManager['getStatus']>) => void;

const DANIELLE = {
  name: 'Danielle',
  characterId: '468a8ac4-2879-11f1-a19f-42010a7be02c',
};

class ChessConvaiManager {
  private client: any = null;
  private audioRenderer: any = null;
  private connected = false;
  private connecting = false;
  private botReady = false;
  private isSpeaking = false;
  private streamBuffer = '';
  private lastEmittedText = '';
  private hasFlushed = false;
  private unsubFns: Array<() => void> = [];
  private responseListeners = new Set<ResponseListener>();
  private statusListeners = new Set<StatusListener>();
  private streamDebounce: ReturnType<typeof setTimeout> | null = null;
  private lipsyncIndex = 0;
  private lipsyncLastTime = 0;
  private lipsyncAccum = 0;
  private lipsyncActive = false;
  private lastConversationId = -1;
  private speechQueue: Promise<void> = Promise.resolve();
  private lastSpeechEndedAt = 0;

  async connect(): Promise<void> {
    if (this.connecting || this.connected) {
      await this.waitForReady(12000);
      return;
    }
    if (!API_KEY) {
      debugLog('Convai', '[Danielle] Missing VITE_CONVAI_API_KEY');
      return;
    }

    this.connecting = true;
    this.emitStatus();

    try {
      debugLog('Convai', `[Danielle] Connecting (${DANIELLE.characterId})...`);
      const sdk = await import('@convai/web-sdk/vanilla');
      const { ConvaiClient, AudioRenderer } = sdk;

      const client = new ConvaiClient({
        apiKey: API_KEY,
        characterId: DANIELLE.characterId,
        enableLipsync: true,
        enableEmotion: true,
        blendshapeConfig: { format: 'arkit' },
        ttsEnabled: true,
        startWithAudioOn: false,
      });

      this.unsubFns.push(
        client.on('message', (msg: any) => {
          const type: string = msg?.type ?? 'unknown';
          const content: string = msg?.content ?? '';
          if (type !== 'bot-llm-text') {
            debugLog('Convai', `[Danielle] MSG type="${type}" content="${String(content).slice(0, 80)}"`);
          }
          if (type === 'bot-llm-text' && content) {
            this.streamBuffer = content;
            if (this.streamDebounce) clearTimeout(this.streamDebounce);
            this.streamDebounce = setTimeout(() => this.flushStream(), 800);
          }
        }),
      );

      this.unsubFns.push(
        client.on('messagesChange', (messages: any[]) => {
          if (!Array.isArray(messages) || messages.length === 0) return;
          for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            if (msg?.type === 'bot-llm-text' && typeof msg.content === 'string' && msg.content.trim()) {
              this.streamBuffer = msg.content;
              if (this.streamDebounce) clearTimeout(this.streamDebounce);
              this.streamDebounce = setTimeout(() => this.flushStream(), 800);
              break;
            }
          }
        }),
      );

      this.unsubFns.push(
        client.on('stateChange', (sdkState: any) => {
          const wasSpeaking = this.isSpeaking;
          this.isSpeaking = Boolean(sdkState.isSpeaking);
          this.emitStatus();

          if (this.isSpeaking && !wasSpeaking) {
            this.lipsyncActive = true;
            const conversationId = client.conversationSessionId ?? 0;
            if (conversationId !== this.lastConversationId) {
              this.lipsyncIndex = 0;
              this.lipsyncAccum = 0;
              this.lipsyncLastTime = 0;
              this.lastConversationId = conversationId;
            }
          }

          if (wasSpeaking && !this.isSpeaking) {
            this.flushStream();
            setTimeout(() => {
              if (!this.isSpeaking) {
                this.lipsyncActive = false;
                this.lastSpeechEndedAt = Date.now();
                this.emitStatus();
              }
            }, 500);
          }
        }),
      );

      this.unsubFns.push(client.on('botReady', () => {
        debugLog('Convai', '[Danielle] BOT READY');
        this.botReady = true;
        this.emitStatus();
      }));

      this.unsubFns.push(client.on('error', (err: any) => {
        debugLog('Convai', '[Danielle] error:', err?.message || err);
      }));

      await client.connect();
      this.client = client;
      this.connected = true;
      debugLog('Convai', '[Danielle] Connected!');
      this.emitStatus();

      try {
        this.audioRenderer = new AudioRenderer(client.room);
        debugLog('Convai', '[Danielle] AudioRenderer created');
      } catch (err) {
        debugLog('Convai', '[Danielle] AudioRenderer failed:', err);
      }

      setTimeout(() => {
        document.querySelectorAll('audio').forEach((el) => {
          if (el.paused) el.play().catch(() => {});
        });
      }, 1500);

      await this.waitForReady(20000);
    } catch (err) {
      debugLog('Convai', '[Danielle] Connection failed:', err);
    } finally {
      this.connecting = false;
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

  async speakCoachMessage(message: string, dynamicInfo: string): Promise<string> {
    return this.runExclusiveSpeech(async () => {
      await this.waitForSilence('Danielle turn preflight');
      let response = await this.sendAndAwaitSpeech(message, dynamicInfo);
      if (!response.trim()) {
        debugLog('Convai', '[Danielle] Empty speech response, reconnecting and retrying once');
        await this.disconnect();
        await this.connect();
        response = await this.sendAndAwaitSpeech(message, dynamicInfo);
      }
      return response;
    });
  }

  getLipsyncFrame(): Float32Array | null {
    if (!this.client || !this.lipsyncActive) return null;
    const queue = this.client.blendshapeQueue;
    if (!queue) return null;

    const now = performance.now();
    if (this.lipsyncLastTime > 0) {
      this.lipsyncAccum += ((now - this.lipsyncLastTime) / 1000) * 60;
    }
    this.lipsyncLastTime = now;

    let frame: Float32Array | null = null;
    while (this.lipsyncAccum >= 1) {
      const next = queue.getFrame(this.lipsyncIndex);
      if (next) {
        frame = next;
        this.lipsyncIndex++;
        this.lipsyncAccum -= 1;
      } else {
        this.lipsyncAccum = 0;
        break;
      }
    }
    return frame;
  }

  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }

  getStatus() {
    return {
      connected: this.connected,
      botReady: this.botReady,
      connecting: this.connecting,
      speaking: this.isSpeaking,
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

  async disconnect(): Promise<void> {
    for (const unsub of this.unsubFns) {
      try { unsub(); } catch {}
    }
    this.unsubFns = [];
    if (this.audioRenderer) {
      try { this.audioRenderer.destroy(); } catch {}
      this.audioRenderer = null;
    }
    if (this.client) {
      try { await this.client.disconnect(); } catch {}
      this.client = null;
    }
    this.connected = false;
    this.botReady = false;
    this.isSpeaking = false;
    this.lipsyncActive = false;
    this.streamBuffer = '';
    this.lastEmittedText = '';
    this.emitStatus();
  }

  private async sendAndAwaitSpeech(message: string, dynamicInfo: string): Promise<string> {
    await this.connect();
    if (!this.client || !this.connected) return '';

    await this.waitForReady(6000);
    if (!this.botReady) {
      debugLog('Convai', '[Danielle] BOT READY still pending, sending on connected client');
    }

    this.client.updateDynamicInfo({ text: dynamicInfo });
    this.lastEmittedText = '';
    this.streamBuffer = '';
    this.hasFlushed = false;

    debugLog('Convai', `[Danielle] Speaking: "${message.slice(0, 100)}"`);
    this.client.sendUserTextMessage(message);
    const response = await this.waitForResponseCompletion();
    debugLog('Convai', `[Danielle] Speech done. Response: "${response.slice(0, 100)}"`);
    return response;
  }

  private async waitForResponseCompletion(): Promise<string> {
    let everSpoke = false;
    for (let i = 0; i < 30; i++) {
      await this.sleep(500);
      if (this.isSpeaking) {
        everSpoke = true;
        break;
      }
      if (this.lastEmittedText) break;
    }

    if (this.isSpeaking || everSpoke) {
      let silentMs = 0;
      for (let i = 0; i < 80; i++) {
        await this.sleep(500);
        if (!this.isSpeaking) {
          silentMs += 500;
          if (silentMs >= 1500) break;
        } else {
          silentMs = 0;
        }
      }
      await this.sleep(500);
    } else if (this.lastEmittedText) {
      await this.sleep(3000);
    }

    this.lastSpeechEndedAt = Date.now();
    this.flushStream();
    await this.waitForSilence('Danielle post-speech', 1000, 5000);
    return this.lastEmittedText || '';
  }

  private flushStream(): void {
    if (this.streamDebounce) {
      clearTimeout(this.streamDebounce);
      this.streamDebounce = null;
    }
    if (!this.streamBuffer || this.hasFlushed) return;
    const text = this.streamBuffer;
    this.lastEmittedText = text;
    this.streamBuffer = '';
    this.hasFlushed = true;
    debugLog('Convai', `[Danielle] FINAL: "${text.slice(0, 100)}"`);
    for (const listener of this.responseListeners) {
      listener({ characterName: DANIELLE.name, text });
    }
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

  private async waitForSilence(context: string, minQuietMs = 1200, maxWaitMs = 15000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      const quietFor = this.lastSpeechEndedAt === 0 ? minQuietMs : Date.now() - this.lastSpeechEndedAt;
      if (!this.isSpeaking && quietFor >= minQuietMs) return;
      await this.sleep(150);
    }
    debugLog('Convai', `[${context}] Silence gate timed out, continuing`);
  }

  private async waitForReady(maxWaitMs: number): Promise<void> {
    const start = Date.now();
    while (!this.botReady && Date.now() - start < maxWaitMs) {
      await this.sleep(500);
    }
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
