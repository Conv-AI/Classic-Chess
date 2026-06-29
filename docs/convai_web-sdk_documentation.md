# Convai Web SDK — implementation reference

> **SDK version in this repo:** `@convai/web-sdk@1.6.0-beta.1`
>
> **Classic Chess integration:** wired through `src/convaiManager.ts` (per-coach connection pool, dynamic context, vision, lipsync). See also [technical-blog.md](technical-blog.md) and the README **Portrait & Lipsync** section.

## Classic Chess integration summary

### Connection pool (`convaiManager.ts`)

- One `ConvaiClient` per coach persona; only the active coach stays connected.
- Connect config enables **Vision Dynamic Context**, lipsync (ARKit), and emotions.
- `AudioRenderer` attaches bot audio to the LiveKit room.

```typescript
const client = new ConvaiClient({
  apiKey,
  characterId,
  endUserId,
  enableVideo: true,
  enableLipsync: true,
  enableEmotion: true,
  blendshapeConfig: { format: 'arkit' },
  visionInputConfig: {
    enabled: true,
    sampleIntervalSecs: 1,
    bufferFrames: 5,
    replacePreviousVisionContext: true,
  },
  respondModes: { vision: 'silent' },
  keepInContext: true,
});
```

### Text dynamic context (`chessAi.ts` → `pushDynamicContext`)

- **Static policy** — coaching instructions seeded once via `seedStaticCoachPolicy` (`run_llm: 'false'`).
- **Per-turn board state** — `buildDynamicCoachInfo()` formats FEN, move history, tactics, Stockfish plan.
- Sent with `client.updateContext({ text, mode: 'replace', run_llm })` where `run_llm` is `'auto'` (coach decides), `'true'` (forced speech), or `'false'` (silent refresh).
- Before each text push, `refreshBoardVision()` redraws the offscreen chess canvas.

### Vision Dynamic Context (`boardVision.ts`)

- Offscreen canvas renders the board from FEN or DOM snapshot.
- Published via `client.videoControls.publishCanvas(canvas, { source: 'canvas', name: 'chess-board', fps: 1 })`.
- Vision frames flow silently (`respondModes.vision: 'silent'`) alongside text context.
- **Dashboard:** enable vision on each Convai character.

### Lipsync (`cc4Lipsync.ts` → `ReallusionCharacter.tsx`)

Shared by **all coaches** (Magnus/Vincent, Sofia/Cassandra, Arjun/Tyler, Leila/Danielle, custom coaches) via one `ReallusionCharacter` component and per-asset `LIPSYNC_PROFILES`.

Improvements ported from Convai neurosync reference (`misc/convai-lipsync-reference/`):

| # | Reference pattern | Our implementation |
|---|-------------------|-------------------|
| 1 | Frame lerp smoothing (0.8) | `lerpFrame()` in `cc4Lipsync.ts` |
| 2 | Reapply after idle mixer | Second `useFrame(..., 1)` calls `reapplyCC4LipsyncFrame()` |
| 3 | Jaw_Open → V_Open (skip heavy Jaw_Open morph) | `buildMorphAccum()` drives `V_Open` from ARKit jaw; caps `Jaw_Open` morph |
| 4 | Mouth_Close attenuation (×0.4) | ARKit index 18 scaled in `buildMorphAccum()` |
| 5 | Lower-lip down attenuation (×0.7) | ARKit indices 37/38 scaled |
| 6 | CC4 C_* correctives (product) | `cc4Correctives.ts` applied per mesh after base morphs |
| 7 | Jaw bone smooth open (0.35) | `jawOpenSmooth` + `CC_Base_JawRoot` rotation |
| 8 | Teeth/tongue bone rotation | `cc4TeethMotion.ts` — Teeth02 + Tongue03 Z rotation |
| 9 | Non-mouth channel gain (0.6) | `NON_MOUTH_ATTENUATION` on cheek/etc. channels |
| 10 | Interrupt snap-to-neutral | `consumeLipsyncNormalize()` + `snapCC4LipsyncNeutral()` |
| 11 | Single-clock 60fps consume loop | `convaiLipsyncPlayer.ts` — `advanceLipsyncFrame()` via `consumeFrames` + `getFrameWithAlpha` (no mixed `getFrameAtTime` tail) |

Playback: `convaiManager.getLipsyncFrame()` delegates to `advanceLipsyncFrame()`. Clock starts when `startBotSpeaking()` runs on the SDK `isSpeaking` rising edge. Tail frames play while `hasReceivedEndSignal() && hasFrames()` (reference condition).

### Mobile portrait rendering

- `isMobilePortrait()` enables material downgrade (Physical → Standard), zero env-map on skin, and skips HDR `Environment` on coarse-pointer devices (fixes black-face GLES issues on some phones).

### Required dashboard settings

| Setting | Purpose |
|---------|---------|
| Vision enabled on character | Chess board canvas context |
| LTM enabled + `endUserId` | Signed-in memory (Google auth flow) |
| Guest clone IDs (`VITE_CONVAI_GUEST_CHARACTER_*`) | Anonymous play without LTM writes |

---

## Official Convai Web SDK documentation

The sections below are synced from [docs.convai.com](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk). Source URLs are listed per section.


---

## Web SDK Overview

> Source: https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk

> For the complete documentation index, see [llms.txt](https://docs.convai.com/api-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk.md).

# Convai Web SDK

## Introduction

The **Convai Web SDK (`@convai/web-sdk`)** brings the new Convai backend to the browser, enabling fast, natural, hands-free AI interactions across modern web experiences.\
Built for production apps, immersive sites, and interactive worlds, the SDK handles real-time audio, text, optional video, character actions, and emotion signals — giving developers the tools to create responsive, intelligent AI characters directly on the web.

With built-in voice capture, speech detection, a ready-to-use chat widget, and full custom UI support, Convai makes it simple to integrate lifelike assistants, companions, and NPCs into any web environment.

{% embed url="<https://youtu.be/fK8R0SzuvNI>" %}
Build Browser-Based Conversational AI Avatars with the Convai Web SDK, Three.JS, and React
{% endembed %}

## What’s New

The Web SDK introduces a streamlined, high-performance interaction pipeline powered by Convai’s newest backend:

* **Hands-free voice conversations**\
  Natural, continuous dialogue without push-to-talk.
* **Low-latency responses**\
  Faster streaming replies for smooth, real-time interaction.
* **Emotion and action signalling**\
  Characters can express mood and trigger contextual behaviours.
* **Optional video and screen sharing**\
  Add richer visual context when your experience requires it.
* **Pre-built ConvaiWidget**\
  A polished, complete UI for audio, text, and video chat.
* **Custom UI and full control APIs**\
  Build your own interface and behaviour logic with exposed hooks and state.
* **Modern web integration**\
  Designed for Web-based frameworks and tooling.
* Long-term memory\
  Per-user memory that persists across sessions via the MemoryManager API.
* Binary file transfer\
  Send images and files directly to the character via uploadFile().

### Core Concepts

At a high level, the SDK is organised into a few core pieces:

1. **ConvaiClient**\
   The brain. Manages connection, state, messages, audio/video/screen-share control, and blendshape queue.
2. **ConvaiWidget**\
   A complete, prebuilt interface for text + voice + optional video/screen share.
3. **AudioRenderer** **(Critical for audio playback)**\
   Attaches the bot's audio tracks to the user's speakers.
   * Required for custom UIs
   * Already built in to `ConvaiWidget`
4. **BlendshapeQueue** **(Essential for facial animation)**\
   Manages buffering and time-based retrieval of facial blendshape data.
   * Provides 60fps blendshape streams synchronized with speech
   * Supports ARKit (61 elements) and MetaHuman (251 elements) formats
   * Optional custom mapping for any character rig
5. **Connection Type**\
   Determines what's possible:
   * `"audio"` (default) – audio-only conversations
   * `"video"` – audio + video + screen share
6. MemoryManager
   * Per-user long-term memory. List, add, and delete memories tied to an endUserId.
   * endUserId.\
     Returned by client.memoryManager — null if no endUserId is set.

***

### Architecture

```
┌─────────────────────────────────────────────────┐
│  ConvaiWidget (UI Layer)                        │
│  ├─ Chat Interface                              │
│  ├─ Voice Mode                                  │
│  └─ Video/Screen Share UI                       │
└─────────────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│  ConvaiClient (Core Logic)                      │
│  ├─ Connection Management                       │
│  ├─ Message Handling                            │
│  ├─ State Management                            │
│  └─ Audio/Video Controls                        │
│  └─ Blendshape Queue Management                 │
└─────────────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│  WebRTC Room (Communication Layer)              │
│  ├─ Real-time Audio/Video Streaming             │
│  ├─ Blendshape Data Streaming (60fps)           │
│  ├─ Track Management                            │
│  └─ Network Communication                       │
└─────────────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│  AudioRenderer (Critical for Playback)         │
│  ├─ Attaches audio tracks to DOM               │
│  ├─ Manages audio elements                     │
│  └─ Enables bot voice playback                 │
└─────────────────────────────────────────────────┘
```

***

#### What's Included

* **React SDK**
  * `useConvaiClient` hook for easy client lifecycle
  * `<ConvaiWidget />` for full UI
  * `<AudioRenderer />` + `AudioContext` for custom UIs
  * Access to `blendshapeQueue` for facial animation
* **Vanilla SDK**
  * `ConvaiClient` class for direct control
  * `AudioRenderer` class for playback
  * Optional `createConvaiWidget()` helper
  * `BlendshapeQueue` API for facial animation
* **Lipsync & Facial Animation**
  * Real-time blendshape streaming at 60fps
  * Support for ARKit (61) and MetaHuman (251) formats
  * Declarative name-based mapping system
  * Helper functions and preset configurations
  * Works with Three.js, Babylon.js, Unity WebGL, and custom engines
* **Video & Screen Share**
  * Camera and screen share support when `enableVideo: true`
  * Fine-grained video and screen share controls
* **TypeScript-first**
  * Full type definitions for configs, state, messages, and control APIs<br>

{% hint style="success" %}

#### Performance Optimization

To achieve the lowest possible latency, we recommend configuring your Core AI settings to use the `gemini-flash-2.5-beta` model. This model is optimized for speed and is ideal for real-time applications where response time is critical.
{% endhint %}

<figure><img src="/files/58FVOGH2Wa5poQZgRfKV" alt=""><figcaption></figcaption></figure>

## Conclusion

The **Convai Web SDK (`@convai/web-sdk`)** marks a major step forward in bringing real-time AI interaction to the browser. With speech, actions, emotions, and optional video all running on the latest Convai backend, you can build fast, responsive, and deeply interactive AI characters across any web experience.

Start building today and bring the next generation of AI-powered interaction to the open web.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter, and the optional `goal` query parameter:

```
GET https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk.md?ask=<question>&goal=<endgoal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is optional and describes the broader end goal you are ultimately trying to accomplish on behalf of the user. GitBook uses it to tailor the answer towards what is most useful for that goal.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

---

## ConvaiClient Core API

> Source: https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/convaiclient-core-api

> For the complete documentation index, see [llms.txt](https://docs.convai.com/api-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/convaiclient-core-api.md).

# ConvaiClient (Core API)

## Creating a Client

```ts
const client = new ConvaiClient();
```

You configure it when calling `connect()`.

***

## Connecting

```ts
await client.connect({
  apiKey: string;                    // Required: Your API key
  characterId: string;                // Required: Character ID
  endUserId?: string;                 // Optional: For memory & analytics
  url?: string;                       // Optional: Custom API endpoint
  enableVideo?: boolean;              // Enable video/screenshare (default: false)
  startWithVideoOn?: boolean;         // Start with camera on (default: false)
  startWithAudioOn?: boolean;         // Start with mic on (default: false)
  ttsEnabled?: boolean;               // Enable TTS (default: true)
  enableLipsync?: boolean;            // Enable blendshapes (default: false)
  blendshapeConfig?: {
    format?: 'arkit' | 'mha';         // Blendshape format (default: 'mha')
  };
  actionConfig?: {                    // Optional: Character actions
    actions: string[];
    characters: Array<{ name: string; bio: string }>;
    objects: Array<{ name: string; description: string }>;
    currentAttentionObject?: string;
  };
});
```

***

## Connection Methods

```ts
await client.disconnect();
await client.reconnect(); // Uses last provided config
client.resetSession();    // Clears history
```

***

## Messaging

```ts
client.sendUserTextMessage('Hello');
client.sendTriggerMessage('greet_user', 'Optional payload');

client.updateTemplateKeys({ user: 'Alex' });
client.updateDynamicInfo({ text: 'User is on the blog page' });

client.toggleTts(true);  // Enable/disable TTS
```

***

## Media Controls

All controls are async.

```ts
// Audio
await client.audioControls.toggleAudio();
await client.audioControls.muteAudio();
await client.audioControls.unmuteAudio();
await client.audioControls.setAudioDevice('device-id');

// Video
await client.videoControls.toggleVideo();
await client.videoControls.enableVideo();
await client.videoControls.disableVideo();

// Screen share
await client.screenShareControls.toggleScreenShare();
```

***

## Core Properties

```ts
client.state                 // Connection + activity state
client.connectionType        // 'audio' | 'video' | null
client.isBotReady            // Bot ready for messages

client.chatMessages          // Array of ChatMessage
client.userTranscription     // Live speech-to-text
client.characterSessionId    // Session ID

client.room       
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter, and the optional `goal` query parameter:

```
GET https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/convaiclient-core-api.md?ask=<question>&goal=<endgoal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is optional and describes the broader end goal you are ultimately trying to accomplish on behalf of the user. GitBook uses it to tailor the answer towards what is most useful for that goal.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

---

## Events & Message Handling

> Source: https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/events-and-message-handling

> For the complete documentation index, see [llms.txt](https://docs.convai.com/api-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/events-and-message-handling.md).

# Events & Message Handling

## Events

### State Changes

```ts
client.on('stateChange', (state) => {
  console.log(state.agentState, state.isConnected);
});
```

### New Messages

```ts
client.on('message', (message) => {
  console.log('Message:', message.type, message.content);
});
```

### Messages Updated

```ts
client.on('messagesChange', (messages) => {
  console.log('Total messages:', messages.length);
});
```

### Real-time Transcription

```ts
client.on('userTranscriptionChange', (text) => {
  console.log('You said:', text);
});
```

### Lifecycle Events

```ts
client.on('connect', () => console.log('Connected'));
client.on('disconnect', () => console.log('Disconnected'));
client.on('botReady', () => console.log('Bot is ready'));
```

### Errors

```ts
client.on('error', (err) => {
  console.error('Convai error:', err);
});
```

***

## Message Types

Convai messages include:

* `user-transcription`
* `bot-llm-text`
* `bot-emotion`
* `action`
* `behavior-tree`

Only some are shown in UIs (usually transcription + bot text).

***

## Removing Listeners

```ts
const unsub = client.on('message', handler);
unsub(); // Remove listener
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter, and the optional `goal` query parameter:

```
GET https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/events-and-message-handling.md?ask=<question>&goal=<endgoal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is optional and describes the broader end goal you are ultimately trying to accomplish on behalf of the user. GitBook uses it to tailor the answer towards what is most useful for that goal.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

---

## Real-time Lipsync

> Source: https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/real-time-lipsync

> For the complete documentation index, see [llms.txt](https://docs.convai.com/api-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/real-time-lipsync.md).

# Real-time Lipsync

## Enable Lipsync

Create a client with lipsync configuration:

```typescript
import { ConvaiClient } from '@convai/web-sdk/vanilla';

const client = new ConvaiClient({
  apiKey: 'your-api-key',
  characterId: 'your-character-id',
  enableLipsync: true,          // Enable blendshape streaming
  blendshapeFormat: 'mha',      // 'arkit' or 'mha' (default: 'mha')
});

// Connect to start receiving blendshapes
await client.connect();
```

## Configuration Options

### ConvaiConfig

```typescript
interface ConvaiConfig {
  // ... other options
  
  /**
   * Enable lipsync/facial animation blendshapes (default: false).
   * When enabled, streams real-time blendshape data at 60fps.
   */
  enableLipsync?: boolean;
  
  /**
   * Blendshape format to receive from server (default: 'mha').
   * 'arkit' - 61 elements (52 blendshapes + 9 rotation values)
   * 'mha' - 251 elements (MetaHuman format)
   */
  blendshapeFormat?: 'arkit' | 'mha';
}
```

### Example with All Options

```typescript
const client = new ConvaiClient({
  apiKey: 'your-api-key',
  characterId: 'your-character-id',
  enableVideo: true,
  enableLipsync: true,
  blendshapeFormat: 'arkit',
  startWithVideoOn: false,
});
```

## Create Lipsync Player

Implement a player class to handle the animation loop:

```typescript
class LipsyncPlayer {
  private client: ConvaiClient;
  private isPlaying: boolean = false;
  private animationFrameId: number | null = null;
  private startTime: number = 0;
  
  constructor(
    client: ConvaiClient, 
    private onFrame: (frame: Float32Array) => void
  ) {
    this.client = client;
    
    // Track when bot starts speaking to sync timing
    client.on('speakingChange', (isSpeaking) => {
      if (isSpeaking) {
        this.startTime = performance.now();
      }
    });
  }

  start(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.animate();
  }

  stop(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private animate = (): void => {
    if (!this.isPlaying) return;

    const queue = this.client.blendshapeQueue;
    
    if (queue.hasFrames() && queue.isConversationActive()) {
      // Calculate elapsed time since bot started speaking
      const elapsedTime = (performance.now() - this.startTime) / 1000;
      
      // Get frame based on elapsed time (synced with audio)
      const result = queue.getFrameAtTime(elapsedTime);
      
      if (result) {
        this.onFrame(result.frame);
      }
    }

    this.animationFrameId = requestAnimationFrame(this.animate);
  };
}

// Usage
const lipsyncPlayer = new LipsyncPlayer(client, (blendshapes) => {
  applyBlendshapesToCharacter(blendshapes, character.morphTargetInfluences);
});

lipsyncPlayer.start();

// Helper function: Map blendshapes to your character's morph targets
function applyBlendshapesToCharacter(frame: Float32Array, influences: number[]) {
  // Simple direct mapping (first N blendshapes to first N morph targets)
  const maxIndex = Math.min(frame.length, influences.length);
  for (let i = 0; i < maxIndex; i++) {
    influences[i] = frame[i];
  }
  
  // OR custom mapping if your character's morphs are in different order:
  // influences[10] = frame[17]; // Map jawOpen (ARKit index 17) to your jaw morph (index 10)
  // influences[15] = frame[18]; // Map mouthClose (ARKit index 18) to your mouth morph (index 15)
}
```

BlendQueue functions:

```tsx
// TIME-BASED ACCESS (Most important for real usage!)
queue.getFrameAtTime(elapsedSeconds) // Returns { frame, frameIndex }

// STATE CHECKS
queue.isConversationActive() // Is bot speaking?
queue.isConversationEnded()  // Did stats arrive?
queue.isAllFramesConsumed()  // Playback complete?

// STATISTICS
queue.getTurnStats()         // TurnStats object
queue.getTimeLeftMs()        // Remaining time in ms
queue.getFramesConsumed()    // How many frames played
queue.getDebugInfo()         // Complete state snapshot

// INTERRUPTION
queue.interrupt()     // Called automatically on sendInterruptMessage()
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter, and the optional `goal` query parameter:

```
GET https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/real-time-lipsync.md?ask=<question>&goal=<endgoal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is optional and describes the broader end goal you are ultimately trying to accomplish on behalf of the user. GitBook uses it to tailor the answer towards what is most useful for that goal.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

---

## Building a Custom UI

> Source: https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/building-a-custom-ui-typescript

> For the complete documentation index, see [llms.txt](https://docs.convai.com/api-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/building-a-custom-ui-typescript.md).

# Building a Custom UI (TypeScript)

## Example HTML

```html
<div id="status">Disconnected</div>
<button id="connect">Connect</button>

<div id="chat"></div>

<input id="input" type="text" placeholder="Type message..." disabled />
<button id="send" disabled>Send</button>
```

***

## TypeScript Implementation

```ts
import {
  ConvaiClient,
  type ConvaiClientState,
  type ChatMessage
} from '@convai/web-sdk/vanilla';

const client = new ConvaiClient();

const statusEl = document.getElementById('status') as HTMLDivElement;
const connectBtn = document.getElementById('connect') as HTMLButtonElement;
const chatEl = document.getElementById('chat') as HTMLDivElement;
const inputEl = document.getElementById('input') as HTMLInputElement;
const sendBtn = document.getElementById('send') as HTMLButtonElement;

// State updates
client.on('stateChange', (state) => {
  updateStatus(state);
  updateControls(state);
});

// New messages
client.on('message', (msg) => {
  if (msg.type === 'user-transcription' || msg.type === 'bot-llm-text') {
    addMessageToUI(msg);
  }
});

function updateStatus(state: ConvaiClientState) {
  if (!state.isConnected) return statusEl.textContent = 'Disconnected';
  statusEl.textContent = state.agentState;
}

function updateControls(state: ConvaiClientState) {
  const connected = state.isConnected;
  connectBtn.disabled = connected;
  inputEl.disabled = !connected;
  sendBtn.disabled = !connected;
}

function addMessageToUI(msg: ChatMessage) {
  const div = document.createElement('div');
  div.className = msg.type === 'user-transcription' ? 'user' : 'bot';
  div.textContent = msg.content;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

// Connect logic
connectBtn.addEventListener('click', async () => {
  await client.connect({
    apiKey: 'your-api-key',
    characterId: 'your-character-id',
    // endUserId: 'user-uuid', // Optional for memory
  });
});

// Send message
function sendMessage() {
  const text = inputEl.value.trim();
  if (text) {
    client.sendUserTextMessage(text);
    inputEl.value = '';
  }
}

sendBtn.addEventListener('click', sendMessage);
inputEl.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendMessage();
});
```

***

## Adding Audio/Video Controls

```ts
await client.audioControls.toggleAudio();
await client.videoControls.toggleVideo();
await client.screenShareControls.toggleScreenShare();
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter, and the optional `goal` query parameter:

```
GET https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/building-a-custom-ui-typescript.md?ask=<question>&goal=<endgoal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is optional and describes the broader end goal you are ultimately trying to accomplish on behalf of the user. GitBook uses it to tailor the answer towards what is most useful for that goal.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

---

## Best Practices & Type Definitions

> Source: https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/best-practices-and-type-definitions

> For the complete documentation index, see [llms.txt](https://docs.convai.com/api-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/best-practices-and-type-definitions.md).

# Best Practices & Type Definitions

## Best Practices

### 1. Check connection before sending messages

```ts
if (client.state.isConnected) {
  client.sendUserTextMessage('Hello');
}
```

### 2. Handle errors

```ts
try {
  await client.connect(config);
} catch (err) {
  console.error('Connection failed', err);
}
```

### 3. Unsubscribe from events when needed

```ts
const off = client.on('message', handler);
off();
```

### 4. Disconnect on cleanup

```ts
window.addEventListener('beforeunload', () => {
  client.disconnect();
});
```

### 5. Keep UI responsive with stateChange

```ts
client.on('stateChange', updateUI);
```

***

## **Core Types:**

```typescript
import type {
  ConvaiClient,
  ConvaiConfig,
  ConvaiClientState,
  ChatMessage,
  IConvaiClient,
} from '@convai/web-sdk';
```

**Control Interfaces:**

```typescript
import type {
  AudioControls,
  VideoControls,
  ScreenShareControls,
} from '@convai/web-sdk';
```

**Lipsync Types:**

```typescript
import type {
  BlendshapeQueue,
  BlendshapeMapper,
  BlendshapeFormat,
  BlendshapeMappingConfig,
  BlendshapeNameMapping,
  OptimizedBlendshapeOutput,
} from '@convai/web-sdk';
```

**Configuration Interface:**

```typescript
interface ConvaiConfig {
  apiKey: string;                    // Required: Your API key
  characterId: string;                // Required: Character ID
  endUserId?: string;                 // Optional: For memory & analytics
  url?: string;                       // Optional: Custom API endpoint
  enableVideo?: boolean;              // Enable video/screenshare (default: false)
  startWithVideoOn?: boolean;         // Start with camera on (default: false)
  startWithAudioOn?: boolean;         // Start with mic on (default: false)
  ttsEnabled?: boolean;               // Enable TTS (default: true)
  enableLipsync?: boolean;            // Enable blendshapes (default: false)
  blendshapeConfig?: {
    format?: 'arkit' | 'mha';         // Blendshape format (default: 'mha')
  };
  actionConfig?: {                    // Optional: Character actions
    actions: string[];
    characters: Array<{ name: string; bio: string }>;
    objects: Array<{ name: string; description: string }>;
    currentAttentionObject?: string;
  };
}
```

***

## Client State Management

The `ConvaiClientState` interface provides complete visibility into the conversation state:

```typescript
interface ConvaiClientState {
  isConnected: boolean;     // Connected to character
  isConnecting: boolean;    // Connection in progress
  isListening: boolean;     // Listening to user
  isThinking: boolean;      // Processing response
  isSpeaking: boolean;      // Character speaking
  agentState: string;       // Combined state
}
```

**Agent State Values:**

* `'disconnected'` - Not connected
* `'connected'` - Connected but idle
* `'listening'` - Actively listening to user
* `'thinking'` - Processing user input
* `'speaking'` - Character is responding

**Usage:**

```typescript
// React
const { state } = convaiClient;
if (state.isSpeaking) {
  console.log('Character is speaking');
}

// Vanilla
client.on('stateChange', (state) => {
  console.log('State:', state.agentState);
});
```

***

## Event System

The SDK uses an event-driven architecture for state changes and messages:

**Available Events:**

| Event                     | Parameters                   | Description                       |
| ------------------------- | ---------------------------- | --------------------------------- |
| `stateChange`             | `(state: ConvaiClientState)` | Connection/activity state changed |
| `message`                 | `(message: ChatMessage)`     | New message received              |
| `messagesChange`          | `(messages: ChatMessage[])`  | Message history updated           |
| `connect`                 | `()`                         | Successfully connected            |
| `disconnect`              | `()`                         | Disconnected from character       |
| `error`                   | `(error: Error)`             | Error occurred                    |
| `botReady`                | `()`                         | Bot is ready to receive messages  |
| `userTranscriptionChange` | `(transcription: string)`    | User speech transcription updated |

**Usage:**

```typescript
// Subscribe to events
const unsubscribe = client.on('stateChange', (state) => {
  console.log('State changed:', state);
});

// Unsubscribe
unsubscribe();

// Or manually
client.off('stateChange', callback);
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter, and the optional `goal` query parameter:

```
GET https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/best-practices-and-type-definitions.md?ask=<question>&goal=<endgoal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is optional and describes the broader end goal you are ultimately trying to accomplish on behalf of the user. GitBook uses it to tailor the answer towards what is most useful for that goal.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

---

## Mappings Reference

> Source: https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/mappings-reference

> For the complete documentation index, see [llms.txt](https://docs.convai.com/api-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/mappings-reference.md).

# Mappings Reference

## **ARKit (61 morphs)**

52 facial blendshapes + 9 rotation values (head + eyes)

```json
[  "EyeBlinkLeft", "EyeLookDownLeft", "EyeLookInLeft", "EyeLookOutLeft",  
"EyeLookUpLeft", "EyeSquintLeft", "EyeWideLeft", "EyeBlinkRight",  "EyeLookDownRight",
 "EyeLookInRight", "EyeLookOutRight", "EyeLookUpRight",  "EyeSquintRight", "EyeWideRight", 
"JawForward", "JawRight", "JawLeft",  "JawOpen", "MouthClose", "MouthFunnel", "MouthPucker", 
"MouthRight",  "MouthLeft", "MouthSmileLeft", "MouthSmileRight", "MouthFrownLeft",  
"MouthFrownRight", "MouthDimpleLeft", "MouthDimpleRight", "MouthStretchLeft",  
"MouthStretchRight", "MouthRollLower", "MouthRollUpper", "MouthShrugLower",  
"MouthShrugUpper", "MouthPressLeft", "MouthPressRight", "MouthLowerDownLeft",  
"MouthLowerDownRight", "MouthUpperUpLeft", "MouthUpperUpRight", "BrowDownLeft",  
"BrowDownRight", "BrowInnerUp", "BrowOuterUpLeft", "BrowOuterUpRight",  "CheekPuff", 
"CheekSquintLeft", "CheekSquintRight", "NoseSneerLeft",  "NoseSneerRight", "TongueOut", 
"HeadYaw", "HeadPitch", "HeadRoll",  "LeftEyeYaw", "LeftEyePitch", "LeftEyeRoll", 
"RightEyeYaw",  "RightEyePitch", "RightEyeRoll"]
```

## MetaHuman (251 Morphs)

### Categorized Overview

```typescript
// MetaHuman (251 morphs) — Unreal Engine MetaHuman CTRL_expressions_*
[
  // Brows (0–7) — 8 controls
  "CTRL_expressions_browDownL", "CTRL_expressions_browDownR",
  "CTRL_expressions_browRaiseInL", "CTRL_expressions_browRaiseInR",
  // ... 4 more brow controls

  // Ears (8–9) — 2 controls
  "CTRL_expressions_earUpL", "CTRL_expressions_earUpR",

  // Eyes (10–42) — 33 controls
  "CTRL_expressions_eyeBlinkL", "CTRL_expressions_eyeBlinkR",
  "CTRL_expressions_eyeLookUpL", "CTRL_expressions_eyeLookUpR",
  "CTRL_expressions_eyePupilWideL", "CTRL_expressions_eyePupilWideR",
  // ... 27 more eye controls

  // Eyelashes (43–50) — 8 controls
  "CTRL_expressions_eyelashesUpINL",   "CTRL_expressions_eyelashesUpINR",
  "CTRL_expressions_eyelashesDownOUTL","CTRL_expressions_eyelashesDownOUTR",
  // ... 4 more eyelash controls

  // Jaw (51–64) — 14 controls
  "CTRL_expressions_jawOpen", // most important for lipsync
  "CTRL_expressions_jawLeft", "CTRL_expressions_jawRight",
  "CTRL_expressions_jawClenchL", "CTRL_expressions_jawClenchR",
  // ... 9 more jaw controls

  // Mouth (65–192) — 128 controls (detailed lipsync)
  "CTRL_expressions_mouthFunnelDL", "CTRL_expressions_mouthFunnelDR",
  "CTRL_expressions_mouthCornerUpL","CTRL_expressions_mouthCornerUpR",
  "CTRL_expressions_mouthLipsPressL","CTRL_expressions_mouthLipsPressR",
  "CTRL_expressions_mouthUpperLipRaiseL","CTRL_expressions_mouthUpperLipRaiseR",
  // ... 120 more mouth controls

  // Neck & Throat (193–206) — 14 controls
  "CTRL_expressions_neckStretchL", "CTRL_expressions_neckStretchR",
  "CTRL_expressions_neckSwallowPh1","CTRL_expressions_neckSwallowPh2",
  "CTRL_expressions_neckThroatInhale","CTRL_expressions_neckThroatExhale",
  // ... 8 more neck/throat controls

  // Nose (207–218) — 12 controls
  "CTRL_expressions_noseWrinkleL", "CTRL_expressions_noseWrinkleR",
  "CTRL_expressions_noseNostrilDilateL","CTRL_expressions_noseNostrilDilateR",
  // ... 8 more nose controls

  // Teeth (219–230) — 12 controls
  "CTRL_expressions_teethUpD", "CTRL_expressions_teethUpU",
  "CTRL_expressions_teethFwdD","CTRL_expressions_teethFwdU",
  // ... 8 more teeth controls

  // Tongue (231–250) — 20 controls
  "CTRL_expressions_tongueOut", "CTRL_expressions_tongueIn",
  "CTRL_expressions_tongueTipUp","CTRL_expressions_tongueTipDown",
  "CTRL_expressions_tongueLeft","CTRL_expressions_tongueRight",
  // ... 14 more tongue controls
]
```

### MetaHuman 251 Blendshape array in JSON format

```json
[
  "CTRL_expressions_browDownL",
  "CTRL_expressions_browDownR",
  "CTRL_expressions_browLateralL",
  "CTRL_expressions_browLateralR",
  "CTRL_expressions_browRaiseInL",
  "CTRL_expressions_browRaiseInR",
  "CTRL_expressions_browRaiseOuterL",
  "CTRL_expressions_browRaiseOuterR",
  "CTRL_expressions_earUpL",
  "CTRL_expressions_earUpR",
  "CTRL_expressions_eyeBlinkL",
  "CTRL_expressions_eyeBlinkR",
  "CTRL_expressions_eyeCheekRaiseL",
  "CTRL_expressions_eyeCheekRaiseR",
  "CTRL_expressions_eyeFaceScrunchL",
  "CTRL_expressions_eyeFaceScrunchR",
  "CTRL_expressions_eyeLidPressL",
  "CTRL_expressions_eyeLidPressR",
  "CTRL_expressions_eyeLookDownL",
  "CTRL_expressions_eyeLookDownR",
  "CTRL_expressions_eyeLookLeftL",
  "CTRL_expressions_eyeLookLeftR",
  "CTRL_expressions_eyeLookRightL",
  "CTRL_expressions_eyeLookRightR",
  "CTRL_expressions_eyeLookUpL",
  "CTRL_expressions_eyeLookUpR",
  "CTRL_expressions_eyeLowerLidDownL",
  "CTRL_expressions_eyeLowerLidDownR",
  "CTRL_expressions_eyeLowerLidUpL",
  "CTRL_expressions_eyeLowerLidUpR",
  "CTRL_expressions_eyeParallelLookDirection",
  "CTRL_expressions_eyePupilNarrowL",
  "CTRL_expressions_eyePupilNarrowR",
  "CTRL_expressions_eyePupilWideL",
  "CTRL_expressions_eyePupilWideR",
  "CTRL_expressions_eyeRelaxL",
  "CTRL_expressions_eyeRelaxR",
  "CTRL_expressions_eyeSquintInnerL",
  "CTRL_expressions_eyeSquintInnerR",
  "CTRL_expressions_eyeUpperLidUpL",
  "CTRL_expressions_eyeUpperLidUpR",
  "CTRL_expressions_eyeWidenL",
  "CTRL_expressions_eyeWidenR",
  "CTRL_expressions_eyelashesDownINL",
  "CTRL_expressions_eyelashesDownINR",
  "CTRL_expressions_eyelashesDownOUTL",
  "CTRL_expressions_eyelashesDownOUTR",
  "CTRL_expressions_eyelashesUpINL",
  "CTRL_expressions_eyelashesUpINR",
  "CTRL_expressions_eyelashesUpOUTL",
  "CTRL_expressions_eyelashesUpOUTR",
  "CTRL_expressions_jawBack",
  "CTRL_expressions_jawChinCompressL",
  "CTRL_expressions_jawChinCompressR",
  "CTRL_expressions_jawChinRaiseDL",
  "CTRL_expressions_jawChinRaiseDR",
  "CTRL_expressions_jawChinRaiseUL",
  "CTRL_expressions_jawChinRaiseUR",
  "CTRL_expressions_jawClenchL",
  "CTRL_expressions_jawClenchR",
  "CTRL_expressions_jawFwd",
  "CTRL_expressions_jawLeft",
  "CTRL_expressions_jawOpen",
  "CTRL_expressions_jawOpenExtreme",
  "CTRL_expressions_jawRight",
  "CTRL_expressions_mouthCheekBlowL",
  "CTRL_expressions_mouthCheekBlowR",
  "CTRL_expressions_mouthCheekSuckL",
  "CTRL_expressions_mouthCheekSuckR",
  "CTRL_expressions_mouthCornerDepressL",
  "CTRL_expressions_mouthCornerDepressR",
  "CTRL_expressions_mouthCornerDownL",
  "CTRL_expressions_mouthCornerDownR",
  "CTRL_expressions_mouthCornerNarrowL",
  "CTRL_expressions_mouthCornerNarrowR",
  "CTRL_expressions_mouthCornerPullL",
  "CTRL_expressions_mouthCornerPullR",
  "CTRL_expressions_mouthCornerRounderDL",
  "CTRL_expressions_mouthCornerRounderDR",
  "CTRL_expressions_mouthCornerRounderUL",
  "CTRL_expressions_mouthCornerRounderUR",
  "CTRL_expressions_mouthCornerSharpenDL",
  "CTRL_expressions_mouthCornerSharpenDR",
  "CTRL_expressions_mouthCornerSharpenUL",
  "CTRL_expressions_mouthCornerSharpenUR",
  "CTRL_expressions_mouthCornerUpL",
  "CTRL_expressions_mouthCornerUpR",
  "CTRL_expressions_mouthCornerWideL",
  "CTRL_expressions_mouthCornerWideR",
  "CTRL_expressions_mouthDimpleL",
  "CTRL_expressions_mouthDimpleR",
  "CTRL_expressions_mouthDown",
  "CTRL_expressions_mouthFunnelDL",
  "CTRL_expressions_mouthFunnelDR",
  "CTRL_expressions_mouthFunnelUL",
  "CTRL_expressions_mouthFunnelUR",
  "CTRL_expressions_mouthLeft",
  "CTRL_expressions_mouthLipsBlowL",
  "CTRL_expressions_mouthLipsBlowR",
  "CTRL_expressions_mouthLipsPressL",
  "CTRL_expressions_mouthLipsPressR",
  "CTRL_expressions_mouthLipsPullDL",
  "CTRL_expressions_mouthLipsPullDR",
  "CTRL_expressions_mouthLipsPullUL",
  "CTRL_expressions_mouthLipsPullUR",
  "CTRL_expressions_mouthLipsPurseDL",
  "CTRL_expressions_mouthLipsPurseDR",
  "CTRL_expressions_mouthLipsPurseUL",
  "CTRL_expressions_mouthLipsPurseUR",
  "CTRL_expressions_mouthLipsPushDL",
  "CTRL_expressions_mouthLipsPushDR",
  "CTRL_expressions_mouthLipsPushUL",
  "CTRL_expressions_mouthLipsPushUR",
  "CTRL_expressions_mouthLipsStickyLPh1",
  "CTRL_expressions_mouthLipsStickyLPh2",
  "CTRL_expressions_mouthLipsStickyLPh3",
  "CTRL_expressions_mouthLipsStickyRPh1",
  "CTRL_expressions_mouthLipsStickyRPh2",
  "CTRL_expressions_mouthLipsStickyRPh3",
  "CTRL_expressions_mouthLipsThickDL",
  "CTRL_expressions_mouthLipsThickDR",
  "CTRL_expressions_mouthLipsThickInwardDL",
  "CTRL_expressions_mouthLipsThickInwardDR",
  "CTRL_expressions_mouthLipsThickInwardUL",
  "CTRL_expressions_mouthLipsThickInwardUR",
  "CTRL_expressions_mouthLipsThickUL",
  "CTRL_expressions_mouthLipsThickUR",
  "CTRL_expressions_mouthLipsThinDL",
  "CTRL_expressions_mouthLipsThinDR",
  "CTRL_expressions_mouthLipsThinInwardDL",
  "CTRL_expressions_mouthLipsThinInwardDR",
  "CTRL_expressions_mouthLipsThinInwardUL",
  "CTRL_expressions_mouthLipsThinInwardUR",
  "CTRL_expressions_mouthLipsThinUL",
  "CTRL_expressions_mouthLipsThinUR",
  "CTRL_expressions_mouthLipsTightenDL",
  "CTRL_expressions_mouthLipsTightenDR",
  "CTRL_expressions_mouthLipsTightenUL",
  "CTRL_expressions_mouthLipsTightenUR",
  "CTRL_expressions_mouthLipsTogetherDL",
  "CTRL_expressions_mouthLipsTogetherDR",
  "CTRL_expressions_mouthLipsTogetherUL",
  "CTRL_expressions_mouthLipsTogetherUR",
  "CTRL_expressions_mouthLipsTowardsDL",
  "CTRL_expressions_mouthLipsTowardsDR",
  "CTRL_expressions_mouthLipsTowardsUL",
  "CTRL_expressions_mouthLipsTowardsUR",
  "CTRL_expressions_mouthLowerLipBiteL",
  "CTRL_expressions_mouthLowerLipBiteR",
  "CTRL_expressions_mouthLowerLipDepressL",
  "CTRL_expressions_mouthLowerLipDepressR",
  "CTRL_expressions_mouthLowerLipRollInL",
  "CTRL_expressions_mouthLowerLipRollInR",
  "CTRL_expressions_mouthLowerLipRollOutL",
  "CTRL_expressions_mouthLowerLipRollOutR",
  "CTRL_expressions_mouthLowerLipShiftLeft",
  "CTRL_expressions_mouthLowerLipShiftRight",
  "CTRL_expressions_mouthLowerLipTowardsTeethL",
  "CTRL_expressions_mouthLowerLipTowardsTeethR",
  "CTRL_expressions_mouthPressDL",
  "CTRL_expressions_mouthPressDR",
  "CTRL_expressions_mouthPressUL",
  "CTRL_expressions_mouthPressUR",
  "CTRL_expressions_mouthRight",
  "CTRL_expressions_mouthSharpCornerPullL",
  "CTRL_expressions_mouthSharpCornerPullR",
  "CTRL_expressions_mouthStickyDC",
  "CTRL_expressions_mouthStickyDINL",
  "CTRL_expressions_mouthStickyDINR",
  "CTRL_expressions_mouthStickyDOUTL",
  "CTRL_expressions_mouthStickyDOUTR",
  "CTRL_expressions_mouthStickyUC",
  "CTRL_expressions_mouthStickyUINL",
  "CTRL_expressions_mouthStickyUINR",
  "CTRL_expressions_mouthStickyUOUTL",
  "CTRL_expressions_mouthStickyUOUTR",
  "CTRL_expressions_mouthStretchL",
  "CTRL_expressions_mouthStretchLipsCloseL",
  "CTRL_expressions_mouthStretchLipsCloseR",
  "CTRL_expressions_mouthStretchR",
  "CTRL_expressions_mouthUp",
  "CTRL_expressions_mouthUpperLipBiteL",
  "CTRL_expressions_mouthUpperLipBiteR",
  "CTRL_expressions_mouthUpperLipRaiseL",
  "CTRL_expressions_mouthUpperLipRaiseR",
  "CTRL_expressions_mouthUpperLipRollInL",
  "CTRL_expressions_mouthUpperLipRollInR",
  "CTRL_expressions_mouthUpperLipRollOutL",
  "CTRL_expressions_mouthUpperLipRollOutR",
  "CTRL_expressions_mouthUpperLipShiftLeft",
  "CTRL_expressions_mouthUpperLipShiftRight",
  "CTRL_expressions_mouthUpperLipTowardsTeethL",
  "CTRL_expressions_mouthUpperLipTowardsTeethR",
  "CTRL_expressions_neckDigastricDown",
  "CTRL_expressions_neckDigastricUp",
  "CTRL_expressions_neckMastoidContractL",
  "CTRL_expressions_neckMastoidContractR",
  "CTRL_expressions_neckStretchL",
  "CTRL_expressions_neckStretchR",
  "CTRL_expressions_neckSwallowPh1",
  "CTRL_expressions_neckSwallowPh2",
  "CTRL_expressions_neckSwallowPh3",
  "CTRL_expressions_neckSwallowPh4",
  "CTRL_expressions_neckThroatDown",
  "CTRL_expressions_neckThroatExhale",
  "CTRL_expressions_neckThroatInhale",
  "CTRL_expressions_neckThroatUp",
  "CTRL_expressions_noseNasolabialDeepenL",
  "CTRL_expressions_noseNasolabialDeepenR",
  "CTRL_expressions_noseNostrilCompressL",
  "CTRL_expressions_noseNostrilCompressR",
  "CTRL_expressions_noseNostrilDepressL",
  "CTRL_expressions_noseNostrilDepressR",
  "CTRL_expressions_noseNostrilDilateL",
  "CTRL_expressions_noseNostrilDilateR",
  "CTRL_expressions_noseWrinkleL",
  "CTRL_expressions_noseWrinkleR",
  "CTRL_expressions_noseWrinkleUpperL",
  "CTRL_expressions_noseWrinkleUpperR",
  "CTRL_expressions_teethBackD",
  "CTRL_expressions_teethBackU",
  "CTRL_expressions_teethDownD",
  "CTRL_expressions_teethDownU",
  "CTRL_expressions_teethFwdD",
  "CTRL_expressions_teethFwdU",
  "CTRL_expressions_teethLeftD",
  "CTRL_expressions_teethLeftU",
  "CTRL_expressions_teethRightD",
  "CTRL_expressions_teethRightU",
  "CTRL_expressions_teethUpD",
  "CTRL_expressions_teethUpU",
  "CTRL_expressions_tongueBendDown",
  "CTRL_expressions_tongueBendUp",
  "CTRL_expressions_tongueDown",
  "CTRL_expressions_tongueIn",
  "CTRL_expressions_tongueLeft",
  "CTRL_expressions_tongueNarrow",
  "CTRL_expressions_tongueOut",
  "CTRL_expressions_tonguePress",
  "CTRL_expressions_tongueRight",
  "CTRL_expressions_tongueRoll",
  "CTRL_expressions_tongueThick",
  "CTRL_expressions_tongueThin",
  "CTRL_expressions_tongueTipDown",
  "CTRL_expressions_tongueTipLeft",
  "CTRL_expressions_tongueTipRight",
  "CTRL_expressions_tongueTipUp",
  "CTRL_expressions_tongueTwistLeft",
  "CTRL_expressions_tongueTwistRight",
  "CTRL_expressions_tongueUp",
  "CTRL_expressions_tongueWide"
]
```


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter, and the optional `goal` query parameter:

```
GET https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/vanilla-typescript/mappings-reference.md?ask=<question>&goal=<endgoal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is optional and describes the broader end goal you are ultimately trying to accomplish on behalf of the user. GitBook uses it to tailor the answer towards what is most useful for that goal.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

---

## Actions

> Source: https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/actions

> For the complete documentation index, see [llms.txt](https://docs.convai.com/api-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/actions.md).

# Actions

### 1. Configure `actionConfig` at connect

```ts
const client = useConvaiClient({
  apiKey: '...',
  characterId: '...',
  actionConfig: {
    // Action names the character can emit
    actions: ['Move To', 'Pick Up', 'Drop', 'Follow', 'Wave', 'Attack'],

    // Objects in the scene the character can act on
    objects: [
      { name: 'sword',  description: 'A sharp steel sword on the ground' },
      { name: 'chest',  description: 'A wooden treasure chest in the corner' },
      { name: 'torch',  description: 'A flaming torch on the wall' },
    ],

    // Other characters the bot can reference or act on
    characters: [
      { name: 'Player', bio: 'The current user' },
      { name: 'Guard',  bio: 'A nearby guard NPC' },
    ],

    // Optional: object the character starts focused on
    current_attention_object: 'sword',
  },
});
```

Rules:

* `actions`, `objects`, and `characters` define the only valid affordances for this session.
* `current_attention_object` must match an entry in `objects[].name`.
* If the set of available actions or objects changes, reconnect with an updated `actionConfig`.

### 2. Receive `actionResponse`

Subscribe to `actionResponse` to get the character's action decisions after each turn.

```ts
client.on('actionResponse', ({ actions }) => {
  // actions: Array<{ name: string; target?: string }>
  // Empty array is a valid no-action response
  for (const action of actions) {
    dispatch(action.name, action.target);
  }
});
```

* Actions are ordered — execute them in sequence.
* `target` is optional; some actions (e.g. `"Wave"`) have no target.
* An empty `actions` array is not an error — the character simply chose not to act.

### 3. Update attention at runtime

Tell the character which object the player is currently looking at using `updateContext`. The character uses this to resolve "it", "that", "here".

```ts
// Player moved focus to the chest — update silently
client.updateContext({
  current_attention_object: 'chest',
  run_llm: 'false',
});

// Update attention and let the character respond
client.updateContext({
  text: 'The player is now looking at the lever.',
  current_attention_object: 'lever',
  run_llm: 'auto',
});

// Clear attention object
client.updateContext({
  current_attention_object: '',
  run_llm: 'false',
});
```

`current_attention_object` must match an entry in `actionConfig.objects[].name`.

***

### 4. Update descriptive scene context

Use `updateSceneMetadata` for environment changes the character should know about. This is **descriptive only** — it does not add new action targets.

```ts
client.updateSceneMetadata([
  { name: 'fog',  description: 'A thick fog has rolled in, visibility is low' },
  { name: 'rain', description: 'Heavy rain is falling outside' },
]);
```

If the character needs to act on something, it must be in `actionConfig.objects`.

***

### 5. Trigger actions programmatically

Use `sendTriggerMessage` to make the character speak and act without user input — for scripted events or cinematics.

```ts
// Named trigger defined in the Convai dashboard
client.sendTriggerMessage('greet_player');

// Trigger with a custom instruction
client.sendTriggerMessage('pickup_item', 'Pick up the sword and hand it to the player.');
```

***

### Full example

```ts
const client = useConvaiClient({
  apiKey: '...',
  characterId: '...',
  actionConfig: {
    actions: ['Move To', 'Pick Up', 'Drop', 'Follow'],
    objects: [
      { name: 'apple',  description: 'A green apple on a wooden crate' },
      { name: 'basket', description: 'A wicker basket near the player' },
    ],
    characters: [{ name: 'Player', bio: 'The current user' }],
    current_attention_object: 'apple',
  },
});

client.on('actionResponse', ({ actions }) => {
  for (const { name, target } of actions) {
    console.log(`[ACTION] ${name}${target ? ` → ${target}` : ''}`);
    // e.g. "Move To → apple", "Pick Up → apple", "Drop → basket"
  }
});

// Player selects the basket in the UI
client.updateContext({
  current_attention_object: 'basket',
  run_llm: 'false',
});

// Player says "put that in the basket"
// Character resolves "that" as apple, executes: Move To apple → Pick Up apple → Move To basket → Drop apple
```

***

### API reference

#### `actionConfig` (connect option)

| Field                      | Type                      | Description                         |
| -------------------------- | ------------------------- | ----------------------------------- |
| `actions`                  | `string[]`                | Action names the character can emit |
| `objects`                  | `{ name, description }[]` | Objects in the scene                |
| `characters`               | `{ name, bio }[]`         | Other characters                    |
| `current_attention_object` | `string?`                 | Initial focus object                |

#### `actionResponse` event

```ts
client.on('actionResponse', ({ actions }) => { ... });
// actions: Array<{ name: string; target?: string }>
```

#### `updateContext` (attention)

| Field                      | Type                               | Description                        |
| -------------------------- | ---------------------------------- | ---------------------------------- |
| `text`                     | `string?`                          | Optional context text              |
| `mode`                     | `"append" \| "replace" \| "reset"` | How to apply text                  |
| `run_llm`                  | `"true" \| "false" \| "auto"`      | Whether to trigger a response      |
| `current_attention_object` | `string?`                          | New focus object, or `""` to clear |

#### `updateSceneMetadata(items)`

| Field   | Type                      | Description                |
| ------- | ------------------------- | -------------------------- |
| `items` | `{ name, description }[]` | Descriptive scene elements |

#### `sendTriggerMessage(triggerName?, triggerMessage?)`

Programmatically triggers a character response. Both arguments are optional.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter, and the optional `goal` query parameter:

```
GET https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/actions.md?ask=<question>&goal=<endgoal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is optional and describes the broader end goal you are ultimately trying to accomplish on behalf of the user. GitBook uses it to tailor the answer towards what is most useful for that goal.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

---

## Emotions

> Source: https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/emotions

> For the complete documentation index, see [llms.txt](https://docs.convai.com/api-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/emotions.md).

# Emotions

### Enable at connect time

```ts
const client = useConvaiClient({
  apiKey: '...',
  characterId: '...',
  enableEmotion: true,
});
```

When `enableEmotion` is `true`, the SDK sends `emotion_config` to the server on connect. Without it, no `bot-emotion` frames are sent and `emotionChange` never fires.

***

### Subscribe to `emotionChange`

```ts
client.on('emotionChange', (emotion) => {
  if (emotion === null) {
    // Conversation reset — clear any emotion UI
    return;
  }
  console.log(emotion.emotion); // e.g. "Trust", "Grief", "Joy"
  console.log(emotion.scale);   // integer intensity: 1 (low) → 3 (high)
});
```

The event fires:

* After each character turn, with the detected emotion and scale
* With `null` when the conversation is reset (e.g. `resetSession()`)

***

### React

```tsx
import { useConvaiClient, ConvaiWidget } from '@convai/web-sdk';
import { useEffect, useState } from 'react';

export default function App() {
  const client = useConvaiClient({
    apiKey: '...',
    characterId: '...',
    enableEmotion: true,
  });

  const [emotion, setEmotion] = useState<{ emotion: string; scale?: number } | null>(null);

  useEffect(() => {
    return client.on('emotionChange', setEmotion);
  }, [client]);

  return (
    <>
      {emotion && (
        <div style={{ position: 'fixed', top: 20, right: 20 }}>
          {emotion.emotion} ({emotion.scale})
        </div>
      )}
      <ConvaiWidget convaiClient={client} />
    </>
  );
}
```

`client.on(...)` returns an unsubscribe function — returning it from `useEffect` cleans up automatically.

#### Via `state.emotion`

Emotion is also available synchronously on the reactive state object — no extra subscription needed if you already render from state:

```tsx
// emotion updates whenever stateChange fires — no useEffect required
<div>{client.state.emotion?.emotion}</div>
```

***

### Vanilla JS

```ts
import { ConvaiClient } from '@convai/web-sdk/core';
import { createConvaiWidget } from '@convai/web-sdk/vanilla';

const client = new ConvaiClient({
  apiKey: '...',
  characterId: '...',
  enableEmotion: true,
});

const emotionEl = document.querySelector('#emotion');

const unsubEmotion = client.on('emotionChange', (emotion) => {
  if (emotionEl) {
    emotionEl.textContent = emotion ? `${emotion.emotion} (${emotion.scale})` : '';
  }
});

createConvaiWidget(document.body, { convaiClient: client as any });

// On cleanup
// unsubEmotion();
```

***

### Fine-tuning detection

Control how aggressively emotions are detected via `emotionConfig`:

Two providers are supported: `"llm"` uses the language model to infer emotion from the response text; `"nrclex"` uses the NRC Emotion Lexicon, a word-level lexicon lookup that is faster but less context-aware.

```ts
// LLM provider (default) — no extra options
useConvaiClient({
  apiKey: '...',
  characterId: '...',
  enableEmotion: true,
  emotionConfig: { provider: 'llm' },
});

// NRCLex provider — supports intensity thresholds
useConvaiClient({
  apiKey: '...',
  characterId: '...',
  enableEmotion: true,
  emotionConfig: {
    provider: 'nrclex',
    min_word_threshold: 3,        // skip turns shorter than this
    low_intensity_threshold: 0.33,  // score below this → scale 1
    high_intensity_threshold: 0.66, // score above this → scale 3; between → scale 2
  },
});
```

#### `"llm"` config

| Field      | Type    | Description                                        |
| ---------- | ------- | -------------------------------------------------- |
| `provider` | `"llm"` | Infers emotion from response context using the LLM |

#### `"nrclex"` config

| Field                      | Type       | Default | Description                                          |
| -------------------------- | ---------- | ------- | ---------------------------------------------------- |
| `provider`                 | `"nrclex"` | —       | Word-level NRC Emotion Lexicon lookup                |
| `min_word_threshold`       | `number`   | `3`     | Skip detection on turns shorter than this word count |
| `low_intensity_threshold`  | `number`   | `0.33`  | Score boundary between scale 1 and scale 2           |
| `high_intensity_threshold` | `number`   | `0.66`  | Score boundary between scale 2 and scale 3           |

***

### API reference

#### `enableEmotion` (connect option)

| Field           | Type      | Default | Description                                                           |
| --------------- | --------- | ------- | --------------------------------------------------------------------- |
| `enableEmotion` | `boolean` | `false` | Enable emotion detection. Must be `true` for `emotionChange` to fire. |

#### `emotionChange` event

```ts
client.on('emotionChange', (emotion: { emotion: string; scale?: number } | null) => { ... });
```

| Field     | Type     | Description                                        |
| --------- | -------- | -------------------------------------------------- |
| `emotion` | `string` | Emotion label (e.g. `"Trust"`, `"Grief"`, `"Joy"`) |
| `scale`   | `number` | Intensity: `1` = low, `2` = medium, `3` = high     |

Fires `null` on conversation reset.

#### `state.emotion`

```ts
client.state.emotion // { emotion: string; scale?: number } | null
```

Same value as the last `emotionChange` payload. Reactive in the React hook via `stateChange`.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter, and the optional `goal` query parameter:

```
GET https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/emotions.md?ask=<question>&goal=<endgoal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is optional and describes the broader end goal you are ultimately trying to accomplish on behalf of the user. GitBook uses it to tailor the answer towards what is most useful for that goal.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

---

## Dynamic Context

> Source: https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/dynamic-context

> For the complete documentation index, see [llms.txt](https://docs.convai.com/api-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/dynamic-context.md).

# Dynamic Context

### Dynamic context at connect time

Pass initial context when connecting via `dynamicInfo`:

```ts
client.connect({
  apiKey: '...',
  characterId: '...',
  dynamicInfo: 'Player: Aria, Level: 5, Current zone: Eldenmere Forest',
});
```

By default this context is mutable and can be replaced during the session. To lock it in as a static system prompt:

```ts
{
  dynamicInfo: 'Game rules: PvP is disabled. Economy: inflation mode.',
  keepInContext: true, // persists as a fixed prompt for the session
}
```

***

### `updateContext`

The main method for mid-session context updates. Supports append, replace, and reset modes.

```ts
client.updateContext(options: ContextUpdateOptions)
```

#### Options

| Field                      | Type                               | Default    | Description                                                               |
| -------------------------- | ---------------------------------- | ---------- | ------------------------------------------------------------------------- |
| `text`                     | `string`                           | —          | Context text to inject. Required unless `mode` is `"reset"`               |
| `mode`                     | `"append" \| "replace" \| "reset"` | `"append"` | How to apply the context                                                  |
| `run_llm`                  | `"true" \| "false" \| "auto"`      | `"auto"`   | Whether to trigger a bot response                                         |
| `current_attention_object` | `string`                           | —          | Object the bot should focus on (must match `actionConfig.objects[].name`) |

#### Modes

**`append`** — adds to existing ephemeral context:

```ts
client.updateContext({
  text: 'User just picked up the magic sword.',
  mode: 'append',
  run_llm: 'false', // update silently, no bot response
});
```

**`replace`** — replaces the entire ephemeral context:

```ts
client.updateContext({
  text: 'Game state: Level 10, Boss fight initiated.',
  mode: 'replace',
  run_llm: 'auto', // let server decide whether to respond
});
```

**`reset`** — clears ephemeral context entirely:

```ts
client.updateContext({ mode: 'reset' });
```

#### Triggering a bot response

```ts
// Always respond
client.updateContext({
  text: 'A new challenger appears.',
  run_llm: 'true',
});

// Never respond (silent context update)
client.updateContext({
  text: 'User health: 10/100',
  run_llm: 'false',
});

// Server decides (default)
client.updateContext({
  text: 'Weather changed to stormy.',
  run_llm: 'auto',
});
```

#### Monitor token usage via `serverResponse`

The server sends back token counts after each `context-update`:

```ts
client.on('serverResponse', (response) => {
  if (response.event_type === 'context-update' && response.status === 'success') {
    const { remaining_tokens, max_tokens } = response.extras ?? {};
    console.log(`Context tokens: ${max_tokens - remaining_tokens} / ${max_tokens}`);
  }
});
```

***

### `updateDynamicInfo`

A simpler version of `updateContext` — always appends and never triggers a bot response.

```ts
client.updateDynamicInfo('Player health dropped to 30%.');
```

Equivalent to:

```ts
client.updateContext({ text: '...', mode: 'append', run_llm: 'false' });
```

Use `updateContext` for full control; `updateDynamicInfo` for quick silent updates.

***

### Template keys

Template keys replace placeholders in the character's system prompt. Useful for personalizing a prompt that was configured in the Convai dashboard.

If the dashboard prompt contains `{{player_name}}`:

```ts
client.updateTemplateKeys({
  player_name: 'Aria',
  current_quest: 'Find the lost artifact',
});
```

The character will use `Aria` and `Find the lost artifact` in its responses.

***

### File upload

Send a file directly to the character during an active session using `uploadFile`. The character receives the file as part of the conversation context and can respond to its contents.

```ts
await client.uploadFile(file, {
  onProgress: (pct) => console.log(`${pct}% uploaded`),
});
```

#### React

```tsx
const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;

  await client.uploadFile(file, {
    onProgress: (pct) => setProgress(pct),
  });
};
```

#### Vanilla JS

```ts
document.querySelector('#file-input').addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  await client.uploadFile(file, {
    onProgress: (pct) => progressBar.style.width = `${pct}%`,
  });
});
```

#### Options

| Field        | Type                    | Default         | Description                                     |
| ------------ | ----------------------- | --------------- | ----------------------------------------------- |
| `topic`      | `string`                | `"file-upload"` | Routing identifier for the upload channel       |
| `onProgress` | `(pct: number) => void` | —               | Called with upload progress as an integer 0–100 |

#### Supported formats

| Format | MIME type    |
| ------ | ------------ |
| JPEG   | `image/jpeg` |
| PNG    | `image/png`  |
| GIF    | `image/gif`  |
| WebP   | `image/webp` |

Maximum file size: **10 MB**. Files are sent as raw binary — not base64 encoded.

#### Error handling

`uploadFile` is async and throws on failure — always wrap it in a try/catch:

```ts
try {
  await client.uploadFile(file, { onProgress: setProgress });
} catch (err) {
  // Common reasons:
  // - Not connected (transport not ready)
  // - File type not supported (JPEG, PNG, GIF, WebP only)
  // - File exceeds 10 MB
  // - Network error mid-transfer
  console.error('Upload failed:', err);
}
```

Validate type and size before calling to give the user a fast local error rather than waiting for the transfer to fail:

```ts
const SUPPORTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

if (!SUPPORTED.includes(file.type)) throw new Error(`Unsupported type: ${file.type}`);
if (file.size > 10 * 1024 * 1024) throw new Error('File exceeds 10 MB');

await client.uploadFile(file, { onProgress: setProgress });
```

#### Notes

* Only works when connected with the WebRTC transport (`transport: "livekit"`, the default). Not supported on WebSocket transport.
* The method throws if called while not connected. Check `client.state.isConnected` first.

***

### Scene metadata

Use `updateSceneMetadata` for descriptive environment changes. This does **not** add new action targets — it only gives the bot narrative context.

```ts
client.updateSceneMetadata([
  { name: 'fog', description: 'A thick fog has rolled in, visibility is low.' },
  { name: 'ambience', description: 'Distant thunder and wind.' },
]);
```

If the bot needs to *act on* objects in the scene, they must be declared in `actionConfig.objects` at connect time. See Actions.

***

### Session management

#### Reset conversation

`resetSession()` clears the message history and starts a new conversation thread. The character forgets the current exchange but retains any long-term memories (if `endUserId` is set).

```ts
await client.disconnect();
client.resetSession();
await client.connect();
```

#### Idle timeout

The server disconnects idle sessions after a configurable timeout. Use `resetIdleTimer()` on any user interaction to keep the session alive.

```ts
// Call on clicks, keystrokes, or any user activity
document.addEventListener('click', () => {
  if (client.state.isConnected) {
    client.resetIdleTimer();
  }
});

// Listen for the warning before disconnection
client.on('idleWarning', ({ remainingSeconds }) => {
  showBanner(`Session expires in ${remainingSeconds}s — click to continue`);
});
```

***

### Long-term memory

When `endUserId` is provided, the character builds persistent memories across sessions. Access them via `client.memoryManager`.

```ts
const client = useConvaiClient({
  apiKey: '...',
  characterId: '...',
  endUserId: 'user-uuid or any unique userid', // enables memory
});

// After connecting:
const memory = client.memoryManager;

if (memory) {
  // List memories
  const { memories, total_count } = await memory.listMemories({ page: 1, pageSize: 20 });

  // Add a memory manually
  await memory.addMemories(['User is a software engineer who prefers TypeScript.']);

  // Delete a specific memory
  await memory.deleteMemory(memories[0].id);
}
```

See Memory API for the full reference.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter, and the optional `goal` query parameter:

```
GET https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/dynamic-context.md?ask=<question>&goal=<endgoal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is optional and describes the broader end goal you are ultimately trying to accomplish on behalf of the user. GitBook uses it to tailor the answer towards what is most useful for that goal.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

---

## Long Term Memory

> Source: https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/long-term-memory

> For the complete documentation index, see [llms.txt](https://docs.convai.com/api-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/long-term-memory.md).

# Long Term Memory

### Enable memory

This is a character based feature. Go to you convai dashboard -> Character -> Memory tab -> Memory Settings -> Enable Long Term Memory

<figure><img src="/files/76nWR8ZR9siyIbAa8kFL" alt=""><figcaption></figcaption></figure>

Pass `endUserId` when connecting:

```ts
const client = useConvaiClient({
  apiKey: 'YOUR_API_KEY',
  characterId: 'YOUR_CHARACTER_ID',
  endUserId: 'a1b2c3d4-...',  // any string — (UUID or email) preferred, e.g. 'user@example.com'
});
```

`client.memoryManager` becomes available after a successful connection.

### Access the manager

```ts
const memory = client.memoryManager;

if (!memory) {
  // endUserId was not provided, or client is not yet connected
  return;
}
```

***

### List memories

```ts
const result = await memory.listMemories({ page: 1, pageSize: 50 });

console.log(`Total: ${result.total_count}`);
console.log(`Has more: ${result.has_more}`);

result.memories.forEach(m => {
  console.log(`[${m.id}] ${m.memory}`);
  // m.created_at, m.updated_at (ISO timestamps)
});

// Paginate if needed
if (result.has_more) {
  const page2 = await memory.listMemories({ page: 2, pageSize: 50 });
}
```

#### Parameters

| Field      | Type     | Default | Range  |
| ---------- | -------- | ------- | ------ |
| `page`     | `number` | `1`     | 1–1000 |
| `pageSize` | `number` | `50`    | 1–100  |

***

### Add memories

Pass one or more strings to add as memories:

```ts
const result = await memory.addMemories([
  'User prefers dark mode UI.',
  'User is learning Spanish.',
  'User plays guitar as a hobby.',
]);

result.memories.forEach(m => {
  console.log(`Added: ${m.id} → ${m.memory}`);
});
```

The character will use these in future conversations automatically.

***

### Get a single memory

```ts
const m = await memory.getMemory('f4cbdb08-7062-4f3e-8eb2-9f5c80dfe64c');

console.log(m.memory);      // "User prefers dark mode UI."
console.log(m.created_at);  // ISO timestamp
console.log(m.updated_at);  // ISO timestamp
```

***

### Delete a memory

```ts
const result = await memory.deleteMemory('f4cbdb08-7062-4f3e-8eb2-9f5c80dfe64c');

if (result.deleted) {
  console.log('Deleted:', result.memory_id);
}
```

***

### Delete all memories

Removes all memories for the (character, user) pair. Deletion is asynchronous on the server.

```ts
const result = await memory.deleteAllMemories();
console.log(result.message); // "Memory deletion in progress..."

// Wait briefly and verify
await new Promise(r => setTimeout(r, 2000));
const check = await memory.listMemories();
console.log('Remaining:', check.total_count);
```

***

### Standalone usage

`MemoryManager` can be used independently of the client (e.g., in a backend admin tool):

```ts
import { MemoryManager } from '@convai/web-sdk/core';

const manager = new MemoryManager(
  'YOUR_API_KEY',      // or auth token
  'CHARACTER_ID',
  'END_USER_ID',
);

const memories = await manager.listMemories();
```

***

### Memory object shape

```ts
interface Memory {
  id: string;          // UUID
  memory: string;      // Text content
  created_at: string;  // ISO 8601 timestamp
  updated_at: string;  // ISO 8601 timestamp
}
```

***

### How automatic memory works

When `endUserId` is set, the Convai backend extracts meaningful facts from each conversation and stores them as memories. On future connections with the **same** `endUserId`, these memories are injected into the character's context so it "remembers" the user. This is why the value must be stable and unique per user — a UUID or email address both work well.

You do not need to call any Memory API methods for this to work. The explicit CRUD methods are for reading, seeding, or pruning memories from your application.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter, and the optional `goal` query parameter:

```
GET https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/long-term-memory.md?ask=<question>&goal=<endgoal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is optional and describes the broader end goal you are ultimately trying to accomplish on behalf of the user. GitBook uses it to tailor the answer towards what is most useful for that goal.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

---

## Auth Tokens

> Source: https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/auth-tokens

> For the complete documentation index, see [llms.txt](https://docs.convai.com/api-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/auth-tokens.md).

# Auth Tokens

### Why auth tokens matter

Your API key has full access to your Convai account. Shipping it in a client bundle means anyone who inspects the source can extract it and use it without restriction. Auth tokens are scoped, short-lived, and revocable — the right tool for production.

***

### Flow

```
Client                  Your server              Convai API
  |                         |                        |
  |  "start conversation"   |                        |
  |-----------------------> |                        |
  |                         |  POST /user/connect    |
  |                         |  CONVAI-API-KEY: ...   |
  |                         |----------------------->|
  |                         |  { apiAuthToken, ... } |
  |                         |<-----------------------|
  |  { authToken }          |                        |
  |<----------------------- |                        |
  |                         |                        |
  |  new ConvaiClient({ authToken })                 |
  |------------------------------------------------->|
```

The API key never leaves your server.

***

### 1. Generate a token (server-side)

```
POST https://api.convai.com/user/connect
CONVAI-API-KEY: <your-api-key>
Content-Type: application/json
```

**Response**

```json
{
  "apiAuthToken": "your_auth_token_here",
  "expirationTime": "2026-06-11T13:00:00Z"
}
```

The token is valid for **1 hour**. You can generate a new token while the current one is still active.

**Example (Python)**

```python
import requests

def get_auth_token(api_key: str) -> str:
    response = requests.post(
        "https://api.convai.com/user/connect",
        headers={
            "CONVAI-API-KEY": api_key,
            "Content-Type": "application/json",
        },
        json={},
    )
    response.raise_for_status()
    return response.json()["apiAuthToken"]
```

***

### 2. Use the token in the SDK

Pass `authToken` instead of `apiKey`. Everything else stays the same.

```ts
const client = useConvaiClient({
  // apiKey: '...',    ← never ship this in client code
  authToken: await fetchTokenFromYourServer(),
  characterId: '...',
  endUserId: 'user@example.com',
});
```

Once a session starts, the token is no longer checked for the duration of that session — the WebRTC/WebSocket connection persists independently.

***

### 3. Extend a token

If you need more time before the token expires, extend it from your server:

```
POST https://api.convai.com/user/extend-token
CONVAI-API-KEY: <your-api-key>
Content-Type: application/json

{
  "apiAuthToken": "your_auth_token_here"
}
```

***

### 4. Revoke a token

Revoke a token immediately — for example, when a user logs out:

```
POST https://api.convai.com/user/revoke-token
CONVAI-API-KEY: <your-api-key>
Content-Type: application/json

{
  "apiAuthToken": "your_auth_token_here"
}
```

Revoking a token does not end an already-active session.

***

### API reference

#### `ConvaiConfig`

| Field       | Type     | Description                                                         |
| ----------- | -------- | ------------------------------------------------------------------- |
| `apiKey`    | `string` | Your Convai API key. Use server-side only or during development.    |
| `authToken` | `string` | Short-lived auth token. Preferred for production client-side usage. |

Exactly one of `apiKey` or `authToken` must be set.

#### Token endpoints

| Endpoint                  | Description                       |
| ------------------------- | --------------------------------- |
| `POST /user/connect`      | Generate a new token (1 hour TTL) |
| `POST /user/extend-token` | Extend an existing token's expiry |
| `POST /user/revoke-token` | Immediately invalidate a token    |

All endpoints require `CONVAI-API-KEY` in the request header.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter, and the optional `goal` query parameter:

```
GET https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/auth-tokens.md?ask=<question>&goal=<endgoal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is optional and describes the broader end goal you are ultimately trying to accomplish on behalf of the user. GitBook uses it to tailor the answer towards what is most useful for that goal.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

---

## WebSocket Transport

> Source: https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/websocket-transport-layer

> For the complete documentation index, see [llms.txt](https://docs.convai.com/api-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/websocket-transport-layer.md).

# WebSocket Transport Layer

WebSocket transport is useful in mobile webviews with WebRTC restrictions, corporate networks that block UDP, or any platform where WebRTC is unsupported. It uses Pipecat under the hood and is fully opt-in — the pipecat packages are never bundled unless you explicitly import the transport subpath.

***

### When to use WebSocket transport

| Situation                                | Recommendation                                         |
| ---------------------------------------- | ------------------------------------------------------ |
| Standard web app                         | WebRTC (default) — lower latency, better audio quality |
| Mobile webview with WebRTC restrictions  | WebSocket                                              |
| Corporate network blocking UDP/STUN/TURN | WebSocket                                              |
| Bundle must not include `@pipecat-ai`    | WebRTC (default — no extra import needed)              |
| Fallback or testing path                 | WebSocket                                              |

***

### Setup

The WebSocket transport is **opt-in**. The pipecat packages (`@pipecat-ai/client-js`, `@pipecat-ai/websocket-transport`) are never bundled unless you explicitly import the transport subpath.

#### React

```tsx
// 1. Register the transport — must be imported before connect() is called
import '@convai/web-sdk/vanilla/websocket';

import { useConvaiClient, ConvaiWidget } from '@convai/web-sdk/react';

export default function App() {
  const client = useConvaiClient({
    apiKey: '...',
    characterId: '...',
    transport: 'websocket',
  });

  return <ConvaiWidget convaiClient={client} />;
}
```

#### Vanilla JS

```ts
// 1. Register the transport
import '@convai/web-sdk/vanilla/websocket';

import { ConvaiClient } from '@convai/web-sdk/vanilla';
import { createConvaiWidget } from '@convai/web-sdk/vanilla';

const client = new ConvaiClient({
  apiKey: '...',
  characterId: '...',
  transport: 'websocket',
});

createConvaiWidget(document.body, { convaiClient: client as any });
```

The import order matters — register before constructing the client.

***

### Bundle isolation

`ConvaiClient` itself contains zero pipecat imports. The WebSocket implementation lives entirely in the `@convai/web-sdk/vanilla/websocket` subpath. A bundler (Vite, webpack, Rollup) that sees no import of that subpath will not include `@pipecat-ai/client-js` or `@pipecat-ai/websocket-transport` in any chunk.

```
@convai/web-sdk/vanilla         → zero pipecat code
@convai/web-sdk/react           → zero pipecat code
@convai/web-sdk/vanilla/websocket → pipecat code (opt-in only)
```

If you call `connect()` with `transport: "websocket"` without importing the subpath first, the SDK throws a clear error:

```
[ConvaiClient] WebSocket transport is not registered.
Add `import '@convai/web-sdk/vanilla/websocket'` before calling connect().
```

***

### Feature comparison

| Feature                | WebRTC (default) | WebSocket          |
| ---------------------- | ---------------- | ------------------ |
| Works without UDP      | ✗                | ✓                  |
| Requires `@pipecat-ai` | ✗                | ✓ (opt-in subpath) |
| Mobile webview support | Varies           | Better             |

{% hint style="info" %}
File upload for websocket transport layer: coming soon
{% endhint %}

***

### Microphone behaviour

On WebRTC, the microphone is activated explicitly via `audioControls.enableAudio()` or the `startWithAudioOn` config flag.

On WebSocket, the Pipecat transport initialises the audio stream during `connect()`. The SDK defaults to mic-on at connection time and mutes immediately if `startWithAudioOn: false`:

```ts
// Mic starts muted — user unmutes via the widget or audioControls
const client = new ConvaiClient({
  transport: 'websocket',
  startWithAudioOn: false,
  ...
});
```

***

### API reference

#### Config

| Field       | Type                       | Default     | Description                                                               |
| ----------- | -------------------------- | ----------- | ------------------------------------------------------------------------- |
| `transport` | `"livekit" \| "websocket"` | `"livekit"` | Default uses WebRTC; `"websocket"` opts in to Pipecat WebSocket transport |

#### Static method

```ts
import { ConvaiClient } from '@convai/web-sdk/vanilla';

// Called automatically by the websocket subpath import.
// Only needed if you are registering a custom WebSocket transport implementation.
ConvaiClient.registerWebSocketTransport(factory);
```

`registerWebSocketTransport` accepts a factory with signature:

```ts
(onMessage: (payload: Uint8Array) => void, enableMic: boolean) => IWebSocketSession
```

This lets you swap in a custom WebSocket session implementation if needed.


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter, and the optional `goal` query parameter:

```
GET https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/websocket-transport-layer.md?ask=<question>&goal=<endgoal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is optional and describes the broader end goal you are ultimately trying to accomplish on behalf of the user. GitBook uses it to tailor the answer towards what is most useful for that goal.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

---

## Event Reference

> Source: https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/event-reference

> For the complete documentation index, see [llms.txt](https://docs.convai.com/api-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/event-reference.md).

# Event Reference

```ts
const unsub = client.on('botReady', () => {
  console.log('Bot is ready');
});

// Later
unsub();
// or
client.off('botReady', handler);
```

***

### Connection events

#### `connect`

Fires when the WebRTC/WebSocket transport connects. The bot may not be ready yet — wait for `botReady` before sending messages.

```ts
client.on('connect', () => {
  console.log('Transport connected');
});
```

#### `botReady`

Fires when the character has confirmed it is ready to receive messages. This is the correct signal to start interacting.

```ts
client.on('botReady', () => {
  client.sendUserTextMessage('Hello!');
});
```

#### `disconnect`

Fires when the session ends. Receives a `DisconnectReason` code.

```ts
client.on('disconnect', (reason) => {
  // reason: number (see DisconnectReason)
  // 1 = CLIENT_INITIATED (intentional), others may warrant reconnection
  if (reason !== 1) {
    client.reconnect();
  }
});
```

#### `stateChange`

Fires whenever any part of `ConvaiClientState` changes. Use this for UI updates.

```ts
client.on('stateChange', (state) => {
  // state.isConnected, state.isConnecting, state.isListening,
  // state.isThinking, state.isSpeaking, state.agentState,
  // state.emotion, state.endUserId, state.metrics, state.disconnectReason
  updateUI(state);
});
```

#### `error`

Fires on connection errors or bot-ready timeout.

```ts
client.on('error', (error: Error) => {
  console.error(error.message);
});
```

***

### Conversation events

#### `conversationStart`

Fires when a new conversation turn begins — either when the user sends a text message or starts speaking.

```ts
client.on('conversationStart', ({ sessionId, userMessage, timestamp }) => {
  // sessionId: incrementing turn counter
  // userMessage: text sent, or "[voice]" for voice turns
  // timestamp: Date.now() value
  console.log(`Turn ${sessionId} started`);
});
```

#### `turnEnd`

Fires when the bot finishes speaking for a turn.

```ts
client.on('turnEnd', ({ sessionId, duration, timestamp }) => {
  // duration: seconds the bot spoke
  console.log(`Turn ${sessionId} lasted ${duration}s`);
});
```

#### `message`

Fires for each new `ChatMessage` added to the conversation. The full history is also available in `client.chatMessages`.

```ts
client.on('message', (msg) => {
  // msg.type, msg.content, msg.id, msg.timestamp, msg.isStreaming
  if (msg.type === 'bot-output') {
    display(msg.content);
  }
});
```

#### `messagesChange`

Fires whenever the message array changes (includes message updates mid-stream).

```ts
client.on('messagesChange', (messages) => {
  renderHistory(messages);
});
```

#### `userTranscriptionChange`

Fires repeatedly as the user speaks, providing live speech-to-text.

```ts
client.on('userTranscriptionChange', (text) => {
  showLiveTranscript(text);
});
```

***

### Speaking events

#### `speakingChange`

Fires when the bot starts or stops speaking.

```ts
client.on('speakingChange', (isSpeaking) => {
  if (isSpeaking) {
    startLipsyncAnimation();
  } else {
    stopLipsyncAnimation();
  }
});
```

#### `botOutput`

Fires for each aggregated output chunk from the bot. Includes both spoken and unspoken text.

```ts
client.on('botOutput', ({ text, spoken, aggregatedBy }) => {
  // spoken: true when the TTS engine will read this text aloud
  // aggregatedBy: "sentence" or "word" indicating chunk granularity
  if (spoken) {
    addToSubtitles(text);
  }
});
```

#### `botTtsStarted`

Fires when the TTS engine starts producing audio.

```ts
client.on('botTtsStarted', () => {
  showSpeakingIndicator();
});
```

#### `botTtsStopped`

Fires when the TTS engine finishes.

```ts
client.on('botTtsStopped', () => {
  hideSpeakingIndicator();
});
```

#### `botTtsText`

Fires word-by-word as the bot speaks, synchronized with TTS audio.

```ts
client.on('botTtsText', ({ text }) => {
  highlightWord(text); // karaoke-style word highlighting
});
```

***

### Microphone events

#### `userMuteStarted`

Fires when the server-side mutes the user's microphone (e.g., when the bot starts speaking to prevent echo).

```ts
client.on('userMuteStarted', () => {
  showMicMutedIndicator();
});
```

#### `userMuteStopped`

Fires when the server un-mutes the user's microphone.

```ts
client.on('userMuteStopped', () => {
  hideMicMutedIndicator();
});
```

***

### Blendshape / lipsync events

These require `enableLipsync: true` in config.

#### `blendshapes`

Fires for each incoming blendshape chunk (10 frames by default). Use `client.blendshapeQueue` instead of handling raw chunks directly.

```ts
client.on('blendshapes', (data) => {
  // Low-level: raw chunk data before queue processing
});
```

#### `blendshapeStatsReceived`

Fires when the server sends end-of-turn blendshape statistics. Signals that no more frames are coming for this turn.

```ts
client.on('blendshapeStatsReceived', (stats) => {
  // stats.total_blendshapes, stats.total_audio_duration_ms
});
```

***

### Action events

Requires `actionConfig` in config.

#### `actionResponse`

Fires after each bot turn with the actions the bot decided to perform.

```ts
client.on('actionResponse', ({ actions }) => {
  for (const { name, target } of actions) {
    executeAction(name, target);
  }
});
```

See Actions for the complete guide.

***

### Server response events

#### `serverResponse`

Fires as an acknowledgment for every message you send to the server.

```ts
client.on('serverResponse', (response) => {
  // response.event_type: the message type you sent
  // response.status: "success" | "error" | "processing" | "pending"
  // response.message: human-readable result
  // response.extras: event-specific data (e.g., token counts for context-update)
  if (response.status === 'error') {
    console.error(`Server error on ${response.event_type}:`, response.message);
  }
});
```

#### `interactionCreated`

Fires early in the session lifecycle — before `botReady` — when the server assigns a unique interaction ID. This is the first message that carries both `interactionId` and `characterSessionId`, making it the right place to capture identifiers for analytics, logging, or session resumption.

```ts
client.on('interactionCreated', ({ interactionId, characterSessionId }) => {
  console.log('Interaction ID:', interactionId);       // e.g. "int_abc123def456"
  console.log('Character session:', characterSessionId); // e.g. "cs_xyz789"

  // Store for analytics / logging
  analytics.track('conversation_started', {
    interactionId,
    characterSessionId,
    timestamp: Date.now(),
  });
});
```

| Field                | Type     | Description                                                                            |
| -------------------- | -------- | -------------------------------------------------------------------------------------- |
| `interactionId`      | `string` | Unique identifier for this interaction. Use for analytics or log correlation.          |
| `characterSessionId` | `string` | Character session identifier. Same value as `client.characterSessionId` after connect. |

`interactionCreated` fires once per `connect()` call. If you reconnect, a new `interactionId` is issued.

***

### Session events

#### `idleWarning`

Fires before the server disconnects an idle session.

```ts
client.on('idleWarning', ({ remainingSeconds }) => {
  if (remainingSeconds !== null) {
    showWarning(`Session will close in ${remainingSeconds}s`);
  }
  // Reset the timer on any user activity
  client.resetIdleTimer();
});
```

#### `llmNoResponse`

Fires when the LLM deliberately chose not to respond (e.g., because the input didn't warrant a reply).

```ts
client.on('llmNoResponse', () => {
  // No response will arrive for this turn — update UI accordingly
  hideThinkingIndicator();
});
```

***

#### `metrics`

Fires with performance data after each turn.

```ts
client.on('metrics', (data) => {
  // Raw metrics from the server (latency, token counts, etc.)
  console.log('Turn metrics:', data);
});
```

***

### Audio track (WebSocket transport)

#### `botAudioTrack`

Fires when a new audio track is available from the bot (WebSocket transport only). Attach to an `<audio>` element to play.

```ts
client.on('botAudioTrack', (track: MediaStreamTrack) => {
  const audio = document.querySelector<HTMLAudioElement>('#bot-audio')!;
  audio.srcObject = new MediaStream([track]);
});
```

***

### Event quick-reference

| Event                     | Payload                                 | When                           |
| ------------------------- | --------------------------------------- | ------------------------------ |
| `connect`                 | —                                       | Transport connected            |
| `botReady`                | —                                       | Bot confirmed ready            |
| `disconnect`              | `DisconnectReason`                      | Session ended                  |
| `stateChange`             | `ConvaiClientState`                     | Any state change               |
| `error`                   | `Error`                                 | Connection or timeout error    |
| `conversationStart`       | `{ sessionId, userMessage, timestamp }` | New turn begins                |
| `turnEnd`                 | `{ sessionId, duration, timestamp }`    | Bot finishes speaking          |
| `message`                 | `ChatMessage`                           | New message                    |
| `messagesChange`          | `ChatMessage[]`                         | History updated                |
| `userTranscriptionChange` | `string`                                | Live STT update                |
| `speakingChange`          | `boolean`                               | Bot speaking state             |
| `botOutput`               | `{ text, spoken, aggregatedBy }`        | Aggregated bot chunk           |
| `botTtsStarted`           | —                                       | TTS begins                     |
| `botTtsStopped`           | —                                       | TTS ends                       |
| `botTtsText`              | `{ text }`                              | Word-by-word TTS               |
| `userMuteStarted`         | —                                       | Server muted user mic          |
| `userMuteStopped`         | —                                       | Server un-muted user mic       |
| `blendshapes`             | raw data                                | Blendshape chunk               |
| `blendshapeStatsReceived` | stats                                   | Turn end stats                 |
| `actionResponse`          | `{ actions }`                           | Bot action decisions           |
| `serverResponse`          | `ServerResponse`                        | Server acknowledgment          |
| `interactionCreated`      | `{ interactionId, characterSessionId }` | Session ID assigned            |
| `idleWarning`             | `{ remainingSeconds }`                  | Idle timeout warning           |
| `llmNoResponse`           | —                                       | LLM chose not to respond       |
| `metrics`                 | data                                    | Turn performance data          |
| `botAudioTrack`           | `MediaStreamTrack`                      | New audio track (WS transport) |


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter, and the optional `goal` query parameter:

```
GET https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/event-reference.md?ask=<question>&goal=<endgoal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is optional and describes the broader end goal you are ultimately trying to accomplish on behalf of the user. GitBook uses it to tailor the answer towards what is most useful for that goal.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.

---

## GLB/FBX Animations

> Source: https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/glb-fbx-animations-for-convai

> For the complete documentation index, see [llms.txt](https://docs.convai.com/api-docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/glb-fbx-animations-for-convai.md).

# GLB/FBX animations for Convai

### Mixamo

Mixamo is a free online service that provides a vast library of character animations that can be used in various 3D projects. Mixamo accepts only the .fbx file format for uploading animations. If you have an character in the .glb format, you'll need to convert it to .fbx first before uploading it to Mixamo.

#### GLB

1. Open Blender and navigate to `File > Import > GlTF 2.0 (.glb/.gltf)`.
2. Locate and select the .glb file you want to convert, then click `Import GlTF 2.0`.
3. Once the .glb file has been imported, navigate to `File > Export > FBX (.fbx)`.

<div><figure><img src="/files/RUkJ95MU8EW9zBMWjjKu" alt=""><figcaption><p>Imported GLB character</p></figcaption></figure> <figure><img src="/files/ExenOZXslZ23dUhCCiCY" alt=""><figcaption><p>Export as FBX</p></figcaption></figure></div>

{% hint style="info" %}
Any animation that is compatible with the character works. It should be in glb. or fbx. format.
{% endhint %}


---

# Agent Instructions
This documentation is published with GitBook. GitBook is the documentation platform designed so that both humans and AI agents can read, navigate, and reason over technical content effectively. Learn more at gitbook.com.

## Querying This Documentation
If you need additional information that is not directly available in this page, you can query the documentation dynamically by asking a question.

Perform an HTTP GET request on the current page URL with the `ask` query parameter, and the optional `goal` query parameter:

```
GET https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/glb-fbx-animations-for-convai.md?ask=<question>&goal=<endgoal>
```

`ask` is the immediate question: it should be specific, self-contained, and written in natural language.
`goal` is optional and describes the broader end goal you are ultimately trying to accomplish on behalf of the user. GitBook uses it to tailor the answer towards what is most useful for that goal.

The response will contain a direct answer to the question and relevant excerpts and sources from the documentation.

Use this mechanism when the answer is not explicitly present in the current page, you need clarification or additional context, or you want to retrieve related documentation sections.
