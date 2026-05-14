declare module '@convai/web-sdk/vanilla' {
  export class ConvaiClient {
    constructor(config: any);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    sendUserTextMessage(text: string): void;
    updateDynamicInfo(dynamicInfo: string): void;
    updateContext?(options: { mode?: 'append' | 'replace' | 'reset'; run_llm?: 'true' | 'false' | 'auto'; text?: string }): void;
    on(event: string, callback: (...args: any[]) => void): () => void;
    get blendshapeQueue(): any;
    get conversationSessionId(): number;
    get room(): any;
    audioControls: {
      enableAudio(): Promise<void>;
      disableAudio(): Promise<void>;
    };
  }

  export class AudioRenderer {
    constructor(room: any);
    destroy(): void;
  }
}
