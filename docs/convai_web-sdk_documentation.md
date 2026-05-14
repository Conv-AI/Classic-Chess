# Local Copy Note

This file was refreshed from `node_modules/@convai/web-sdk/README.md` after updating the project to `@convai/web-sdk@1.3.0`, the latest stable npm release at the time of the update.

# @convai/web-sdk

`@convai/web-sdk` is a TypeScript-first SDK for building real-time conversational AI experiences with Convai characters on the web. It supports:

- React applications with ready-to-use hooks and widget components
- Vanilla TypeScript/JavaScript applications with a framework-agnostic widget
- Direct core client usage for custom UIs and advanced integrations
- Optional lipsync data pipelines for ARKit and MetaHuman rigs

This document is written as a complete implementation reference, from first setup to production hardening.

## Table of Contents

- [1. Package Entry Points](#1-package-entry-points)
- [2. Installation and Requirements](#2-installation-and-requirements)
- [3. Credentials and Environment Setup](#3-credentials-and-environment-setup)
- [4. Quick Start](#4-quick-start)
- [5. Build a Chatbot from Scratch](#5-build-a-chatbot-from-scratch)
- [6. Core Concepts and Lifecycle](#6-core-concepts-and-lifecycle)
- [7. Configuration Reference (`ConvaiConfig`)](#7-configuration-reference-convaiconfig)
- [8. Core API Reference (`ConvaiClient`)](#8-core-api-reference-convaiclient)
  - [Idle management and LLM silence handling](#idle-management-and-llm-silence-handling)
- [9. Memory Management API](#9-memory-management-api)
- [10. Message Semantics and Turn Completion](#10-message-semantics-and-turn-completion)
- [11. React API Reference](#11-react-api-reference)
- [12. Vanilla API Reference](#12-vanilla-api-reference)
- [13. Audio Integration Best Practices (Vanilla TypeScript)](#13-audio-integration-best-practices-vanilla-typescript)
- [14. Error Handling and Reliability Patterns](#14-error-handling-and-reliability-patterns)
- [15. Troubleshooting](#15-troubleshooting)
- [16. Lipsync Helpers Reference](#16-lipsync-helpers-reference)
- [17. Examples](#17-examples)

## 1. Package Entry Points

The SDK is published with multiple entry points for different integration styles.

### `@convai/web-sdk` (default)

Primary exports:

- `useConvaiClient`
- `ConvaiWidget`
- `useCharacterInfo`
- `useLocalCameraTrack`
- `ConvaiClient`
- `AudioRenderer` (re-export of LiveKit `RoomAudioRenderer` for React usage)
- `AudioContext` (re-export of LiveKit `RoomContext`)
- Core types re-exported from `core/types`:
  - `AudioSettings`
  - `ConvaiConfig`
  - `ChatMessage`
  - `ConvaiClientState`
  - `AudioControls`
  - `VideoControls`
  - `ScreenShareControls`
  - `IConvaiClient`
- All exports from `@convai/web-sdk/lipsync-helpers`

### `@convai/web-sdk/react`

React-focused entry point, equivalent to the default React API surface.

### `@convai/web-sdk/vanilla`

Vanilla/browser-focused exports:

- `ConvaiClient`
- `AudioRenderer` (vanilla audio playback manager)
- `createConvaiWidget`
- `destroyConvaiWidget`
- Types:
  - `VanillaWidget`
  - `VanillaWidgetOptions`
  - `IConvaiClient`
  - `ConvaiConfig`
  - `ConvaiClientState`
  - `ChatMessage`

### `@convai/web-sdk/core`

Framework-agnostic low-level API:

- `ConvaiClient`
- `AudioManager`
- `VideoManager`
- `ScreenShareManager`
- `MessageHandler`
- `MemoryManager`
- `BlendshapeQueue`
- `EventEmitter`
- Type alias: `ConvaiClientType`
- All core types from `core/types`
- `TurnStats` type

### `@convai/web-sdk/lipsync-helpers`

Dedicated helpers for blendshape formats and queue creation. Full function list is in [Section 13](#13-lipsync-helpers-reference).

## 2. Installation and Requirements

### Install

```bash
npm install @convai/web-sdk
```

or

```bash
pnpm add @convai/web-sdk
```

or

```bash
yarn add @convai/web-sdk
```

### Runtime requirements

- Modern browser with WebRTC support
- Secure context (`https://` or `http://localhost`) for microphone/camera/screen access

### Peer dependencies

If you are using React APIs:

- `react` `^18 || ^19`
- `react-dom` `^18 || ^19`

## 3. Credentials and Environment Setup

### Obtain credentials

1. Create/login to your Convai account.
2. Create or select a character.
3. Copy:
   - API key
   - Character ID

### Store credentials in environment variables

Do not hardcode credentials in source files.

```bash
# .env.local (example)
VITE_CONVAI_API_KEY=<YOUR_CONVAI_API_KEY>
VITE_CONVAI_CHARACTER_ID=<YOUR_CONVAI_CHARACTER_ID>
VITE_CONVAI_API_URL=<OPTIONAL_CONVAI_BASE_URL>
```

Use these values through your build system (`import.meta.env`, process env injection, or server-provided config).

## 4. Quick Start

### React

```tsx
import { ConvaiWidget, useConvaiClient } from "@convai/web-sdk";

export function App() {
  const convaiClient = useConvaiClient({
    apiKey: import.meta.env.VITE_CONVAI_API_KEY,
    characterId: import.meta.env.VITE_CONVAI_CHARACTER_ID,
    enableVideo: false,
    startWithAudioOn: false,
  });

  return <ConvaiWidget convaiClient={convaiClient} />;
}
```

### Vanilla TypeScript

```ts
import { ConvaiClient, createConvaiWidget } from "@convai/web-sdk/vanilla";

const client = new ConvaiClient({
  apiKey: import.meta.env.VITE_CONVAI_API_KEY,
  characterId: import.meta.env.VITE_CONVAI_CHARACTER_ID,
  enableVideo: false,
});

const widget = createConvaiWidget(document.body, {
  convaiClient: client,
  defaultVoiceMode: true,
  onConnect: () => console.log("Connected"),
  onDisconnect: () => console.log("Disconnected"),
});

window.addEventListener("beforeunload", () => {
  widget.destroy();
  void client.disconnect().catch(() => undefined);
});
```

## 5. Build a Chatbot from Scratch

This section shows an end-to-end approach you can use in production.

### A) React from scratch (custom connection flow)

#### Step 1: Create the client

```tsx
import { useConvaiClient } from "@convai/web-sdk";

const convaiClient = useConvaiClient({
  apiKey: import.meta.env.VITE_CONVAI_API_KEY,
  characterId: import.meta.env.VITE_CONVAI_CHARACTER_ID,
  endUserId: "<UNIQUE_END_USER_ID>",
  endUserMetadata: {
    name: "John Doe",
    age: "30",
    // Add any additional metadata you want to send
  },
  enableVideo: true,
  startWithVideoOn: false,
  startWithAudioOn: false,
  ttsEnabled: true,
  enableLipsync: true,
  blendshapeConfig: {
    format: "arkit",
    frames_buffer_duration: 0.5,
  },
});
```

#### Step 2: Connect from a user gesture with error handling

```tsx
async function handleConnect() {
  try {
    await convaiClient.connect();
  } catch (error) {
    console.error("Connection failed:", error);
  }
}
```

#### Step 3: Wait for readiness before sending text

```tsx
function sendMessage(text: string) {
  if (!convaiClient.state.isConnected || !convaiClient.isBotReady) return;
  convaiClient.sendUserTextMessage(text);
}
```

#### Step 4: Render the widget or your own UI

```tsx
import { ConvaiWidget } from "@convai/web-sdk";

<ConvaiWidget
  convaiClient={convaiClient}
  showVideo={true}
  showScreenShare={true}
  defaultVoiceMode={true}
/>;
```

#### Step 5: Subscribe to lifecycle events

```tsx
useEffect(() => {
  const unsubError = convaiClient.on("error", (error) => {
    console.error("Convai error:", error);
  });

  const unsubState = convaiClient.on("stateChange", (state) => {
    console.log("State:", state.agentState);
    
    // Access end user information from connection response
    if (state.endUserId) {
      console.log("End User ID:", state.endUserId);
    }
    
    if (state.endUserMetadata) {
      console.log("End User Metadata:", state.endUserMetadata);
      // Example: { name: 'John', age: '30' }
    }
  });

  const unsubMessages = convaiClient.on("messagesChange", (messages) => {
    console.log("Messages:", messages.length);
  });

  return () => {
    unsubError();
    unsubState();
    unsubMessages();
  };
}, [convaiClient]);
```

#### Step 6: Clean up on unmount

```tsx
useEffect(() => {
  return () => {
    void convaiClient.disconnect().catch(() => undefined);
  };
}, [convaiClient]);
```

### B) Vanilla TypeScript from scratch (widget + custom hooks)

#### Step 1: Initialize client and widget

```ts
import { ConvaiClient, createConvaiWidget } from "@convai/web-sdk/vanilla";

const client = new ConvaiClient({
  apiKey: "<YOUR_CONVAI_API_KEY>",
  characterId: "<YOUR_CHARACTER_ID>",
  endUserId: "<UNIQUE_END_USER_ID>",
  enableVideo: true,
  startWithVideoOn: false,
});

const widget = createConvaiWidget(document.body, {
  convaiClient: client,
  showVideo: true,
  showScreenShare: true,
  defaultVoiceMode: true,
  onConnect: () => console.log("Connected"),
  onDisconnect: () => console.log("Disconnected"),
  onMessage: (message) => console.log("Message:", message),
});
```

#### Step 2: Add explicit error listeners

```ts
const unsubError = client.on("error", (error) => {
  console.error("SDK error:", error);
});
```

#### Step 3: Add guarded send utility

```ts
function safeSend(text: string) {
  if (!text.trim()) return;
  if (!client.state.isConnected) return;
  if (!client.isBotReady) return;
  client.sendUserTextMessage(text);
}
```

#### Step 4: Cleanup

```ts
function destroy() {
  unsubError();
  widget.destroy();
  void client.disconnect().catch(() => undefined);
}
```

### C) Custom UI (framework-agnostic)

If you are not using the built-in widget:

- Use `ConvaiClient` from `@convai/web-sdk/core`
- Use `AudioRenderer` from `@convai/web-sdk/vanilla` for remote audio playback
- Render your own UI based on `stateChange`, `messagesChange`, and control manager events

```ts
import { ConvaiClient } from "@convai/web-sdk/core";
import { AudioRenderer } from "@convai/web-sdk/vanilla";

const client = new ConvaiClient({
  apiKey: "<YOUR_CONVAI_API_KEY>",
  characterId: "<YOUR_CHARACTER_ID>",
});

await client.connect();
const audioRenderer = new AudioRenderer(client.room);

// ... your custom UI logic

audioRenderer.destroy();
await client.disconnect();
```

## 6. Core Concepts and Lifecycle

### Connection lifecycle

1. `connect()` starts room and transport setup.
2. `state.isConnected` becomes true when room connection is established.
3. `botReady` event indicates the character is ready for interaction.
4. Messages stream through data events into `chatMessages`.
5. Audio/video/screen-share are managed through dedicated control managers.
6. `disconnect()` tears down the session.

### Activity lifecycle

- `state.isThinking`: model is generating response
- `state.isSpeaking`: model audio is currently speaking
- `state.agentState`: combined high-level state (`disconnected | connected | listening | thinking | speaking`)
- `state.endUserId`: end user ID returned from the connection response (if provided in config)
- `state.endUserMetadata`: end user metadata returned from the connection response (if provided in config)
- `state.metrics`: array of metrics events received during the current session (clears on `resetSession()`)

### Widget lifecycle

Both React and vanilla widgets:

- auto-connect on first user interaction
- expose optional callbacks/events
- need explicit cleanup on app teardown

## 7. Configuration Reference (`ConvaiConfig`)

| Field                                     | Type               | Required | Default              | Description                                                                         |
| ----------------------------------------- | ------------------ | -------- | -------------------- | ----------------------------------------------------------------------------------- |
| `apiKey`                                  | `string`           | Yes      | -                    | Convai API key.                                                                     |
| `characterId`                             | `string`           | Yes      | -                    | Target character identifier.                                                        |
| `endUserId`                               | `string`           | No       | `undefined`          | Stable end-user identity for memory/analytics continuity.                           |
| `endUserMetadata`                         | `Record<string, unknown>` | No | `undefined`          | Additional end-user metadata (e.g., name, age) sent with the connection request.    |
| `url`                                     | `string`           | No       | SDK internal default | Convai base URL. Set explicitly if your deployment requires a specific environment. |
| `enableVideo`                             | `boolean`          | No       | `false`              | Enables video-capable connection type.                                              |
| `startWithVideoOn`                        | `boolean`          | No       | `false`              | Auto-enable camera after connect.                                                   |
| `startWithAudioOn`                        | `boolean`          | No       | `false`              | Auto-enable microphone after connect.                                               |
| `ttsEnabled`                              | `boolean`          | No       | `true`               | Enables model text-to-speech output.                                                |
| `enableLipsync`                           | `boolean`          | No       | `false`              | Requests blendshape payloads for facial animation.                                  |
| `blendshapeConfig.format`                 | `"arkit" \| "mha"` | No       | `"mha"`              | Blendshape output format.                                                           |
| `blendshapeConfig.frames_buffer_duration` | `number`           | No       | server-defined       | Buffering hint for audio/blendshape synchronization.                                |
| `actionConfig`                            | object             | No       | `undefined`          | Action and scene-context metadata (actions, characters, objects, attention object). |
| `dynamicInfo`                             | `string`           | No       | `undefined`          | Dynamic contextual information about the current situation sent to the LLM.         |
| `keepInContext`                           | `boolean`          | No       | `false`              | Keep dynamic info in context as a static prompt. When true, persists throughout session; when false, allows updates via updateContext() or updateDynamicInfo(). |

## 8. Core API Reference (`ConvaiClient`)

Import:

```ts
import { ConvaiClient } from "@convai/web-sdk/core";
```

### ConvaiClient types

For TypeScript, use the types exported from the main package or core:

- **`IConvaiClient`** — Interface implemented by `ConvaiClient`. Use this when you need to type variables, props, or function parameters that accept the client (e.g. `client: IConvaiClient`).
- **`ConvaiClientState`** — Shape of `client.state` (connection and activity flags: `isConnected`, `isBotReady`, `agentState`, `emotion`, `endUserId`, `endUserMetadata`, `metrics`, etc.).
- **`ConvaiConfig`** — Configuration object for `new ConvaiClient(config)` and `client.connect(config)`.
- **`ChatMessage`** — Single message in `client.chatMessages`.
- **`ConvaiMetrics`** — Metrics event structure containing data, timestamp, and unique identifier.
- **`AudioControls`**, **`VideoControls`**, **`ScreenShareControls`** — Types for the control managers exposed as `client.audioControls`, `client.videoControls`, `client.screenShareControls`.

Example:

```ts
import type { IConvaiClient, ConvaiClientState, ConvaiConfig, ConvaiMetrics } from "@convai/web-sdk";
// or from "@convai/web-sdk/core" when using core-only
```

### Constructor

```ts
new ConvaiClient(config?: ConvaiConfig)
```

### Properties

| Property                | Type                         | Description                                              |
| ----------------------- | ---------------------------- | -------------------------------------------------------- |
| `state`                 | `ConvaiClientState`          | Real-time connection/activity state.                     |
| `connectionType`        | `"audio" \| "video" \| null` | Active transport mode.                                   |
| `apiKey`                | `string \| null`             | Active API key.                                          |
| `characterId`           | `string \| null`             | Active character ID.                                     |
| `speakerId`             | `string \| null`             | Resolved speaker identity.                               |
| `room`                  | `Room`                       | Internal LiveKit room instance.                          |
| `chatMessages`          | `ChatMessage[]`              | Conversation message store.                              |
| `userTranscription`     | `string`                     | Current non-final voice transcription text.              |
| `characterSessionId`    | `string \| null`             | Server conversation session identifier.                  |
| `isBotReady`            | `boolean`                    | Character readiness flag.                                |
| `audioControls`         | `AudioControls`              | Microphone controls.                                     |
| `videoControls`         | `VideoControls`              | Camera controls.                                         |
| `screenShareControls`   | `ScreenShareControls`        | Screen sharing controls.                                 |
| `blendshapeQueue`       | `BlendshapeQueue`            | Buffer queue for lipsync frames.                         |
| `conversationSessionId` | `number`                     | Incremental turn session ID used by conversation events. |
| `memoryManager`         | `MemoryManager \| null`      | Long-term memory API manager. See [Memory API docs](./docs/MEMORY_API.md). |

### Methods

| Method                 | Signature                                                           | Description                                                |
| ---------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `connect`              | `(config?: ConvaiConfig) => Promise<void>`                          | Connect using passed config or stored config.              |
| `disconnect`           | `() => Promise<void>`                                               | Disconnect and release session resources.                  |
| `reconnect`            | `() => Promise<void>`                                               | Disconnect then connect with stored config.                |
| `resetSession`         | `() => void`                                                        | Reset character session and clear conversation history.    |
| `sendUserTextMessage`  | `(text: string) => void`                                            | Send text message to character.                            |
| `sendTriggerMessage`   | `(triggerName?: string, triggerMessage?: string) => void`           | Send trigger/action message.                               |
| `sendInterruptMessage` | `() => void`                                                        | Interrupt current bot response.                            |
| `resetIdleTimer`       | `() => void`                                                        | Reset the server-side idle timer to prevent disconnection. |
| `updateTemplateKeys`   | `(templateKeys: Record<string, string>) => void`                    | Update runtime template variables.                         |
| `updateDynamicInfo`    | `(dynamicInfo: string) => void`                                     | Update dynamic context with a text description.            |
| `toggleTts`            | `(enabled: boolean) => void`                                        | Enable/disable TTS for subsequent responses.               |
| `on`                   | `(event: string, callback: (...args: any[]) => void) => () => void` | Subscribe to an event and receive an unsubscribe function. |
| `off`                  | `(event: string, callback: (...args: any[]) => void) => void`       | Remove a specific listener.                                |

### Common event names and payloads

| Event                     | Payload                                 | Notes                                                                                                           |
| ------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `stateChange`             | `ConvaiClientState`                     | Any state transition.                                                                                           |
| `message`                 | `ChatMessage`                           | Last message whenever `messagesChange` updates.                                                                 |
| `messagesChange`          | `ChatMessage[]`                         | Full message array update.                                                                                      |
| `userTranscriptionChange` | `string`                                | Live user speech text updates.                                                                                  |
| `speakingChange`          | `boolean`                               | Bot speaking started/stopped.                                                                                   |
| `botReady`                | `void`                                  | Bot can now receive interaction.                                                                                |
| `connect`                 | `void`                                  | Client connected.                                                                                               |
| `disconnect`              | `void`                                  | Client disconnected.                                                                                            |
| `error`                   | `unknown`                               | Error surfaced by client.                                                                                       |
| `conversationStart`       | `{ sessionId, userMessage, timestamp }` | Conversation turn started.                                                                                      |
| `turnEnd`                 | `{ sessionId, duration, timestamp }`    | Server signaled end of turn (bot stopped speaking). Same semantics as `BlendshapeQueue.hasReceivedEndSignal()`. |
| `blendshapes`             | `unknown`                               | Incoming blendshape chunk payload.                                                                              |
| `blendshapeStatsReceived` | `unknown`                               | End-of-turn blendshape stats marker.                                                                            |
| `metrics`                 | `Record<string, unknown>`               | Metrics data received from server. Multiple metrics events may occur per conversation.                          |
| `idleWarning`             | `{ remainingSeconds: number \| null }`  | Server warns that the session will be disconnected due to inactivity. `remainingSeconds` is the countdown until disconnection. Call `resetIdleTimer()` on any user activity to keep the session alive. |
| `llmNoResponse`           | `void`                                  | LLM explicitly chose not to respond (e.g. via an abstain tool call). Use this to clear any "thinking" indicator without expecting a reply. |

### Control manager APIs

#### `audioControls`

Properties:

- `isAudioEnabled`
- `isAudioMuted`
- `audioLevel`

Methods:

- `enableAudio()`
- `disableAudio()`
- `muteAudio()`
- `unmuteAudio()`
- `toggleAudio()`
- `setAudioDevice(deviceId)`
- `getAudioDevices()`
- `startAudioLevelMonitoring()`
- `stopAudioLevelMonitoring()`
- `on("audioStateChange", callback)`
- `off("audioStateChange", callback)`

#### `videoControls`

Properties:

- `isVideoEnabled`
- `isVideoHidden`

Methods:

- `enableVideo()`
- `disableVideo()`
- `hideVideo()`
- `showVideo()`
- `toggleVideo()`
- `setVideoDevice(deviceId)`
- `getVideoDevices()`
- `setVideoQuality("low" | "medium" | "high")`
- `on("videoStateChange", callback)`
- `off("videoStateChange", callback)`

#### `screenShareControls`

Properties:

- `isScreenShareEnabled`
- `isScreenShareActive`

Methods:

- `enableScreenShare()`
- `disableScreenShare()`
- `toggleScreenShare()`
- `enableScreenShareWithAudio()`
- `getScreenShareTracks()`
- `on("screenShareStateChange", callback)`
- `off("screenShareStateChange", callback)`

### Using `updateDynamicInfo` for real-time context

The `updateDynamicInfo` method allows you to send real-time context to the character using a simple text description.

#### Basic usage

```tsx
// Simple text description
convaiClient.updateDynamicInfo("Player health is low");
```

#### Advanced usage with detailed context

```tsx
// Game state example
convaiClient.updateDynamicInfo(
  "Player is in combat with 25% health and 40% stamina at battlefield location, 3 enemies nearby, equipped with sword"
);
```

#### Using in connect config

```tsx
const config: ConvaiConfig = {
  apiKey: 'your-api-key',
  characterId: 'your-character-id',
  dynamicInfo: "Initial game state: Player at spawn point, level 1, tutorial not complete",
  keepInContext: false, // Allow updates via updateDynamicInfo() (default behavior)
  // Set to true to make dynamicInfo behave as a static prompt for the session
  // Other config fields...
};

await convaiClient.connect(config);
```

#### Real-time updates example

```tsx
// Update context as game state changes
function updateCharacterContext(player: Player) {
  const contextText = `Player health: ${player.health}%, mana: ${player.mana}%, location: ${player.location}, status: ${player.status}`;
  
  convaiClient.updateDynamicInfo(contextText);
}

// Call whenever game state changes
player.on('stateChange', () => updateCharacterContext(player));
```

### Context management modes

There are three ways to manage the LLM's runtime context, each suited to a different update pattern.

#### Mode 1 — Static prompt via `keepInContext: true`

When you set `keepInContext: true` in the connect config (or pass `keep_in_context: true` in the `dynamic_info` payload), the `text` field is treated as a **static system prompt** for the lifetime of that WebRTC connection. The LLM receives it on every turn without you needing to resend it.

```tsx
await convaiClient.connect({
  apiKey: '...',
  characterId: '...',
  dynamicInfo: "This NPC is a blacksmith who only discusses weapons and armor.",
  keepInContext: true,  // persists as a static prompt for this session
});
```

> If you disconnect and reconnect, the static prompt is cleared — you must pass it again in the new `connect()` call.

#### Mode 2 — Mutable context via `keepInContext: false` (default)

When `keepInContext` is `false` (the default), the dynamic info is **not** kept as a standing prompt. You can overwrite or clear it at any time by calling `updateDynamicInfo()` again, or by sending a `context-update` / `update-dynamic-info` message directly.

```tsx
// Initial context at connect time (will be replaceable)
await convaiClient.connect({
  apiKey: '...',
  characterId: '...',
  dynamicInfo: "Player is at the starting zone.",
  keepInContext: false,
});

// Later — overwrite with fresh state
convaiClient.updateDynamicInfo("Player just entered the dungeon, health 80%.");

// Or clear it entirely
convaiClient.updateDynamicInfo("");
```

#### Mode 3 — Fine-grained context patches via `updateContext()`

`updateContext()` gives you surgical control over the system instruction. It supports three modes and a `run_llm` flag that controls whether the LLM is triggered after the update.

| Field     | Values                              | Description                                                  |
|-----------|-------------------------------------|--------------------------------------------------------------|
| `mode`    | `"append"` \| `"replace"` \| `"reset"` | How the text is applied to the existing context           |
| `run_llm` | `"true"` \| `"false"` \| `"auto"`  | `"true"` runs the LLM immediately; `"false"` only updates the prompt; `"auto"` lets the LLM decide whether a response is needed |
| `text`    | `string`                            | The context text to apply (omit for `"reset"` mode)         |

```tsx
// Append new information and run the LLM immediately
convaiClient.updateContext({
  text: "User just completed the dragon quest and received a golden sword.",
  mode: "append",
  run_llm: "true",
});

// Silently replace the full context without triggering a response
convaiClient.updateContext({
  text: "Game state: night-time, market district, raining.",
  mode: "replace",
  run_llm: "false",
});

// Clear context and let the LLM decide whether to acknowledge
convaiClient.updateContext({
  mode: "reset",
  run_llm: "auto",
});
```

**When to use each `run_llm` value:**

- `"true"` — the update is itself an event worth responding to (e.g. quest completion, NPC interaction).
- `"false"` — background state update the player won't notice (e.g. syncing health/location every few seconds).
- `"auto"` — the LLM reads the new context and decides on its own whether a response is appropriate.

### Accessing metrics data

The SDK exposes metrics events received from the server through the client state. Multiple metrics events can be received during a single conversation.

#### Accessing metrics from client state

```tsx
// Access metrics array from state
const metrics = convaiClient.state.metrics;

// Log all metrics
console.log('Total metrics received:', metrics.length);
metrics.forEach(metric => {
  console.log('Metric ID:', metric.id);
  console.log('Timestamp:', metric.timestamp);
  console.log('Data:', metric.data);
});

// Get latest metric
const latestMetric = metrics[metrics.length - 1];
if (latestMetric) {
  console.log('Latest metric data:', latestMetric.data);
}
```

#### Listening to metrics events in real-time

```tsx
  // Subscribe to metrics events
  const unsubMetrics = convaiClient.on('metrics', (metricsData) => {
    console.log('New metrics received:', metricsData);
    
    // Process metrics data
    if (metricsData.processingTime) {
      console.log('Processing time:', metricsData.processingTime);
    }
  });

// Cleanup
unsubMetrics();
```

#### Accessing metrics in React

```tsx
import { useConvaiClient } from '@convai/web-sdk';
import { useEffect, useState } from 'react';

function MetricsDisplay() {
  const convaiClient = useConvaiClient();
  const [metrics, setMetrics] = useState<ConvaiMetrics[]>([]);

  useEffect(() => {
    // Subscribe to state changes
    const unsubState = convaiClient.on('stateChange', (state) => {
      setMetrics(state.metrics);
    });

    // Or subscribe to individual metrics events
    const unsubMetrics = convaiClient.on('metrics', (metricsData) => {
      console.log('New metrics:', metricsData);
    });

    return () => {
      unsubState();
      unsubMetrics();
    };
  }, [convaiClient]);

  return (
    <div>
      <h3>Metrics ({metrics.length})</h3>
      {metrics.map(metric => (
        <div key={metric.id}>
          <p>Time: {new Date(metric.timestamp).toLocaleTimeString()}</p>
          <pre>{JSON.stringify(metric.data, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}
```

#### Clearing metrics

Metrics are automatically cleared when you call `resetSession()` or `disconnect()`:

```tsx
// Clear conversation history and metrics
convaiClient.resetSession();

// Or disconnect (also clears metrics)
await convaiClient.disconnect();
```

#### Analyzing aggregated metrics

```tsx
function analyzeMetrics(client: IConvaiClient) {
  const metrics = client.state.metrics;
  
  // Calculate average processing time if present
  const processingTimes = metrics
    .map(m => m.data.processingTime as number)
    .filter(t => typeof t === 'number');
  
  if (processingTimes.length > 0) {
    const avgTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
    console.log('Average processing time:', avgTime.toFixed(2), 'ms');
  }
  
  // Count metrics by type if available
  const metricsByType = metrics.reduce((acc, metric) => {
    const type = (metric.data.type as string) || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log('Metrics by type:', metricsByType);
}
```

### Idle management and LLM silence handling

#### Idle warnings and LLM no-response as chat messages

Both events automatically appear in `chatMessages` with distinct `type` values so you can handle them inline when rendering your message list — no extra event wiring required.

| `type`           | `content`                         | Purpose                                      |
|------------------|-----------------------------------|----------------------------------------------|
| `idle-warning`   | Remaining seconds as string, e.g. `"45"` | Display a warning prompt in the chat        |
| `llm-no-response`| `""` (always empty)               | Signal that no reply will come; hide or skip |

```tsx
// React — render chat messages with idle/no-response handling
{chatMessages.map((msg) => {
  if (msg.type === "idle-warning") {
    const seconds = parseInt(msg.content, 10);
    return (
      <SystemNotice key={msg.id} variant="warning">
        Session idle — disconnecting in {seconds}s.{" "}
        <button onClick={() => convaiClient.resetIdleTimer()}>Stay connected</button>
      </SystemNotice>
    );
  }

  if (msg.type === "llm-no-response") {
    // LLM chose not to reply — render nothing (or a subtle indicator)
    return null;
  }

  return <ChatBubble key={msg.id} message={msg} />;
})}
```

#### Receiving idle warnings via event

If you prefer to react outside the message list (e.g. a toast or overlay):

```ts
const unsubIdle = client.on("idleWarning", ({ remainingSeconds }) => {
  if (remainingSeconds !== null) {
    showToast(`Session will end in ${remainingSeconds}s due to inactivity.`);
  }
});
```

#### Resetting the idle timer

Call `resetIdleTimer()` whenever user activity is detected (clicks, keystrokes, UI interactions) to keep the session alive.

```ts
// Reset on any click anywhere on the page
document.addEventListener("click", () => client.resetIdleTimer());

// Or reset on specific UI interactions
sendButton.addEventListener("click", () => {
  client.resetIdleTimer();
  client.sendUserTextMessage(inputField.value);
});
```

#### React example — activity-aware idle management

```tsx
useEffect(() => {
  const handleActivity = () => {
    convaiClient.resetIdleTimer();
  };

  window.addEventListener("click", handleActivity);
  window.addEventListener("keydown", handleActivity);

  return () => {
    window.removeEventListener("click", handleActivity);
    window.removeEventListener("keydown", handleActivity);
  };
}, [convaiClient]);
```

#### Handling LLM no-response via event

When the LLM deliberately abstains from replying (e.g. via an abstain tool call), the server emits `llmNoResponse`. If you are driving a custom "thinking" indicator outside of `chatMessages`, use this event to dismiss it.

```ts
const unsubNoResponse = client.on("llmNoResponse", () => {
  setIsThinking(false);
});
```

### Advanced core classes (`@convai/web-sdk/core`)

These are exported for advanced and custom pipeline use-cases.

#### `BlendshapeQueue`

Buffer for lipsync frames. Use `isConversationEnded()` for definitive end-of-conversation: it returns true only when the server has sent `blendshape-turn-stats` and either all expected frames have been consumed or the queue is empty (handles dropped frames). Use `hasReceivedEndSignal()` when you only need to know that the server signaled end (e.g. to keep playing remaining frames).

Methods:

- `addChunk(blendshapes)`
- `getFrames()`
- `getFrame(index)`
- `getFrameWithAlpha(index)`
- `consumeFrames(count)`
- `hasFrames()`
- `isConversationActive()`
- `isConversationEnded()` — true when server signaled end and playback is complete (all frames consumed or queue empty)
- `hasReceivedEndSignal()` — true when server sent `blendshape-turn-stats` (does not check frame consumption)
- `startConversation()`
- `startBotSpeaking()`
- `stopBotSpeaking()`
- `isBotSpeaking()`
- `endConversation(stats?)`
- `interrupt()`
- `getTurnStats()`
- `getFramesConsumed()`
- `getTimeLeftMs()`
- `isAllFramesConsumed()`
- `reset()`
- `getFrameAtTime(elapsedTime)`
- `getDebugInfo()`

Properties:

- `length`

#### `MessageHandler`

Methods:

- `getBlendshapeQueue()`
- `getChatMessages()`
- `getUserTranscription()`
- `getIsBotResponding()`
- `getIsSpeaking()`
- `setRoom(room)`
- `reset()`
- inherited event APIs from `EventEmitter`:
  - `on(event, callback)`
  - `off(event, callback)`

#### `EventEmitter`

Methods:

- `on(event, callback)`
- `off(event, callback)`
- `emit(event, ...args)`
- `removeAllListeners()`
- `listenerCount(event)`

## 9. Memory Management API

The Convai SDK includes a comprehensive Memory Management API that enables long-term memory storage for characters. Memories are scoped to a `(character_id, end_user_id)` pair, allowing each user to have personalized experiences that persist across conversation sessions.

### Quick Start

```typescript
import { ConvaiClient } from "@convai/web-sdk/core";

const client = new ConvaiClient({
  apiKey: 'your-api-key',
  characterId: 'your-character-id',
  endUserId: 'user@example.com', // Required for memory operations
});

await client.connect();

// Access memory manager
const memoryManager = client.memoryManager;

if (memoryManager) {
  // Add memories
  await memoryManager.addMemories([
    'User prefers outdoor activities',
    'User is allergic to peanuts'
  ]);

  // List memories
  const memories = await memoryManager.listMemories();
  console.log(`Total memories: ${memories.total_count}`);
  
  // Get a specific memory
  const memory = await memoryManager.getMemory(memoryId);
  
  // Delete a memory
  await memoryManager.deleteMemory(memoryId);
}
```

### Requirements

The `memoryManager` is available when:
- You provide either an `apiKey` or `authToken` in the config
- You provide an `endUserId` in the config

### Memory Manager Methods

| Method | Description |
|--------|-------------|
| `addMemories(memories: string[])` | Add one or more memory strings |
| `listMemories(options?)` | List memories with pagination |
| `getMemory(memoryId: string)` | Fetch a single memory by ID |
| `deleteMemory(memoryId: string)` | Delete a single memory |
| `deleteAllMemories()` | Delete all memories for current user/character |
| `setEndUserId(endUserId: string)` | Switch to a different user context |
| `setCharacterId(characterId: string)` | Switch to a different character context |

### Standalone Usage

You can also use the `MemoryManager` independently:

```typescript
import { MemoryManager } from "@convai/web-sdk/core";

const memoryManager = new MemoryManager(
  'your-api-key',
  'your-character-id',
  'user@example.com'
);

const result = await memoryManager.addMemories(['User likes coffee']);
```

### Complete Documentation

For detailed documentation, examples, and API reference, see:
- **[Memory API Documentation](./docs/MEMORY_API.md)** - Complete guide with examples
- **[Memory API Usage Examples](./examples/memory-api-usage.ts)** - Runnable code examples

### Memory Types

All memory-related types are exported from the core package:

```typescript
import type {
  Memory,
  MemoryAddResponse,
  MemoryListResponse,
  MemoryGetResponse,
  MemoryDeleteResponse,
  MemoryDeleteAllResponse,
  MemoryError,
} from "@convai/web-sdk/core";
```

## 10. Message Semantics and Turn Completion

### `ChatMessage` model

`ChatMessage` includes:

- `id`
- `type`
- `content`
- `timestamp`
- `isStreaming?` — `true` while the message is still streaming (mutable), `false` when finalized

Supported message `type` values include:

- `user`
- `convai`
- `emotion`
- `behavior-tree`
- `action`
- `user-transcription`
- `bot-llm-text`
- `bot-emotion`
- `user-llm-text`
- `interrupt-bot`
- `idle-warning` — server idle-timeout warning; `content` holds remaining seconds as a numeric string (e.g. `"45"`). Render differently from normal bot messages to prompt user activity.
- `llm-no-response` — LLM deliberately chose not to respond; `content` is always `""`. Use the type to hide or suppress the message in your UI rather than showing an empty bubble.

### Recommended way to detect response completion

Use events instead of checking `isStreaming`:

- `turnEnd` for the server turn-end signal (bot stopped speaking; same as `hasReceivedEndSignal()`)
- `blendshapeStatsReceived` as additional completion marker when lipsync/animation output is enabled

When driving lipsync from `BlendshapeQueue`, use `blendshapeQueue.isConversationEnded()` for definitive end-of-conversation. It returns true only when the server has signaled end and playback is complete (all expected frames consumed or queue empty). Call `blendshapeQueue.reset()` and your `onConversationEnded` when it becomes true. Use `hasReceivedEndSignal()` only when you need the raw server signal (e.g. to decide whether to keep playing remaining frames).

Example:

```ts
type TurnCompletionOptions = {
  expectBlendshapes: boolean;
  onComplete: () => void;
};

function subscribeTurnCompletion(client: any, options: TurnCompletionOptions) {
  let spokenDone = false;
  let animationDone = !options.expectBlendshapes;

  const invokeOnCompleteIfReady = () => {
    if (spokenDone && animationDone) {
      options.onComplete();
    }
  };

  const unsubTurnEnd = client.on("turnEnd", () => {
    spokenDone = true;
    invokeOnCompleteIfReady();
  });

  const unsubBlendshapeStats = client.on("blendshapeStatsReceived", () => {
    animationDone = true;
    invokeOnCompleteIfReady();
  });

  return () => {
    unsubTurnEnd();
    unsubBlendshapeStats();
  };
}
```

When to use both signals: You only need to wait for both `turnEnd` and `blendshapeStatsReceived` when you use lipsync. Set `expectBlendshapes: false` when you do not use facial animation; then `animationDone` is effectively always true and completion runs as soon as `turnEnd` fires. Set `expectBlendshapes: true` when you drive lipsync from the queue; speech and blendshape data are separate pipelines and can finish in either order, so waiting for both ensures "turn complete" means both speech and animation are done before you run `onComplete`.

## 11. React API Reference

### `useConvaiClient(config?)`

Import:

```tsx
import { useConvaiClient } from "@convai/web-sdk";
```

Returns full `IConvaiClient` plus React-friendly reactive fields:

- `activity`
- `chatMessages`
- `isAudioMuted`
- `isVideoEnabled`
- `isScreenShareActive`

### `ConvaiWidget`

Import:

```tsx
import { ConvaiWidget } from "@convai/web-sdk";
```

Props:

| Prop               | Type                                                                                                                  | Default  | Description                                                        |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| `convaiClient`     | `IConvaiClient & { activity?: string; isAudioMuted: boolean; isVideoEnabled: boolean; isScreenShareActive: boolean }` | required | Client instance returned by `useConvaiClient`.                     |
| `showVideo`        | `boolean`                                                                                                             | `true`   | Shows video toggle in settings if connection type is video.        |
| `showScreenShare`  | `boolean`                                                                                                             | `true`   | Shows screen-share toggle in settings if connection type is video. |
| `defaultVoiceMode` | `boolean`                                                                                                             | `true`   | Opens in voice mode on first widget session.                       |

### `useCharacterInfo(characterId?, apiKey?)`

Returns:

- `name`
- `image`
- `isLoading`
- `error`

### `useLocalCameraTrack()`

Returns a LiveKit `TrackReferenceOrPlaceholder` for local camera rendering in custom React video UIs.

### React audio utility exports

- `AudioRenderer` from LiveKit React components
- `AudioContext` from LiveKit React components

## 12. Vanilla API Reference

### `createConvaiWidget(container, options)`

```ts
import { createConvaiWidget } from "@convai/web-sdk/vanilla";
```

Creates and mounts a complete floating chat widget.

#### `VanillaWidgetOptions`

| Field              | Type                             | Required | Default     | Description                                        |
| ------------------ | -------------------------------- | -------- | ----------- | -------------------------------------------------- |
| `convaiClient`     | `IConvaiClient`                  | No\*     | -           | Existing client instance.                          |
| `apiKey`           | `string`                         | No\*     | -           | Used only when `convaiClient` is not provided.     |
| `characterId`      | `string`                         | No\*     | -           | Used only when `convaiClient` is not provided.     |
| `enableVideo`      | `boolean`                        | No       | `false`     | Used for auto-created client only.                 |
| `startWithVideoOn` | `boolean`                        | No       | `false`     | Used for auto-created client only.                 |
| `enableLipsync`    | `boolean`                        | No       | `false`     | Used for auto-created client only.                 |
| `blendshapeConfig` | object                           | No       | `undefined` | Used for auto-created client only.                 |
| `showVideo`        | `boolean`                        | No       | `true`      | Show video toggle in settings.                     |
| `showScreenShare`  | `boolean`                        | No       | `true`      | Show screen-share toggle in settings.              |
| `defaultVoiceMode` | `boolean`                        | No       | `true`      | Start in voice mode when opened.                   |
| `onConnect`        | `() => void`                     | No       | `undefined` | Called when widget client connects.                |
| `onDisconnect`     | `() => void`                     | No       | `undefined` | Called when widget client disconnects.             |
| `onMessage`        | `(message: ChatMessage) => void` | No       | `undefined` | Called on each message change with latest message. |

\* You must provide either `convaiClient` OR both `apiKey` and `characterId`.

#### Return type: `VanillaWidget`

- `element`: root widget element
- `client`: resolved client instance
- `destroy()`: unmount and cleanup
- `update?`: optional future extension field

### `destroyConvaiWidget(widget)`

Convenience wrapper that calls `widget.destroy()`.

### `AudioRenderer` (vanilla)

`AudioRenderer` listens to LiveKit room track subscriptions and auto-attaches remote audio tracks to hidden `audio` elements for playback. Use one renderer instance per active room session and destroy it during cleanup.

## 13. Audio Integration Best Practices (Vanilla TypeScript)

This section provides the recommended integration for stable audio playback.

### Recommended reference implementation

```ts
import { ConvaiClient } from "@convai/web-sdk/core";
import { AudioRenderer } from "@convai/web-sdk/vanilla";

class ConvaiAudioSession {
  private client: ConvaiClient;
  private audioRenderer: AudioRenderer | null = null;
  private audioContext: AudioContext | null = null;

  constructor() {
    this.client = new ConvaiClient({
      apiKey: "<YOUR_CONVAI_API_KEY>",
      characterId: "<YOUR_CHARACTER_ID>",
      ttsEnabled: true,
    });
  }

  async connectFromUserGesture(): Promise<void> {
    await this.client.connect();

    // Required for remote audio playback wiring.
    this.audioRenderer = new AudioRenderer(this.client.room);

    // Optional: if your app performs WebAudio analysis/effects.
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  async disconnect(): Promise<void> {
    if (this.audioRenderer) {
      this.audioRenderer.destroy();
      this.audioRenderer = null;
    }

    await this.client.disconnect();

    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
}
```

### AudioContext guidance

- Create/resume `AudioContext` only after user interaction in browsers that enforce autoplay policy.
- If you are not processing audio with WebAudio, you do not need a custom `AudioContext`; `AudioRenderer` is enough for playback.
- Always close your custom `AudioContext` in teardown.

### Lifecycle and cleanup order

Recommended shutdown order:

1. Stop UI input loops/listeners
2. Destroy `AudioRenderer`
3. Disconnect `ConvaiClient`
4. Close custom `AudioContext` (if created)

### Common failure modes and fixes

| Symptom                 | Likely cause                              | Recommended action                                                                    |
| ----------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| No AI audio output      | `AudioRenderer` not created               | Instantiate `new AudioRenderer(client.room)` immediately after successful connect.    |
| No AI audio output      | Browser autoplay restriction              | Trigger connect/playback from a user click, and resume `AudioContext` if suspended.   |
| No AI audio output      | TTS disabled                              | Ensure `ttsEnabled` is true for sessions that need speech output.                     |
| Intermittent playback   | Multiple renderers or stale room instance | Use one renderer per session and always destroy old renderer before reconnecting.     |
| Works once, then silent | Incomplete cleanup on previous session    | Destroy renderer and disconnect client on teardown; avoid reusing invalid room state. |
| Random muted behavior   | App-side muting of remote tracks          | Verify no custom code is muting remote publications or media elements.                |

## 14. Error Handling and Reliability Patterns

### Pattern 1: Centralized SDK error handling

```ts
const unsubError = client.on("error", (error) => {
  console.error("Convai SDK error:", error);
  // Optional: route to telemetry/monitoring
});
```

### Pattern 2: Retry connect with exponential backoff

```ts
async function connectWithRetry(
  client: any,
  attempts = 3,
  initialDelayMs = 500,
): Promise<void> {
  let delay = initialDelayMs;

  for (let i = 1; i <= attempts; i++) {
    try {
      await client.connect();
      return;
    } catch (error) {
      if (i === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}
```

### Pattern 3: Safe send guard

```ts
function safeSendText(client: any, text: string) {
  if (!text.trim()) return;
  if (!client.state.isConnected) return;
  if (!client.isBotReady) return;
  client.sendUserTextMessage(text);
}
```

### Pattern 4: Protect media control calls

```ts
async function safeToggleMic(client: any) {
  try {
    await client.audioControls.toggleAudio();
  } catch (error) {
    console.error("Failed to toggle microphone:", error);
  }
}
```

### Pattern 5: Always unsubscribe listeners

```ts
const unsubscribers = [
  client.on("stateChange", () => {}),
  client.on("messagesChange", () => {}),
];

function cleanupListeners() {
  for (const unsub of unsubscribers) unsub();
}
```

## 15. Troubleshooting

### Connection issues

- Verify API key and character ID are valid.
- Ensure requests are allowed from your browser origin.
- Set `url` explicitly if your environment does not use the SDK default endpoint.
- Listen to `error` and inspect failed network calls in browser devtools.

### `connect()` succeeds but bot never responds

- Wait for `botReady` before sending messages.
- Confirm `ttsEnabled` and message flow are configured as expected.
- Verify `messagesChange` receives content.

### Audio does not play

- Ensure an `AudioRenderer` is active for the connected room (vanilla custom UI).
- Ensure playback starts from a user gesture path to satisfy autoplay policies.
- Confirm no custom muting code is muting remote tracks.

### Microphone does not capture user voice

- Ensure app is served over secure context.
- Verify browser microphone permission.
- Handle permission errors from `audioControls.enableAudio()/unmuteAudio()`.

### Video or screen share controls fail

- Use `enableVideo: true` in config when you need video capabilities.
- Screen share can be blocked by browser policy or user denial.
- Wrap calls in `try/catch` and provide fallback UX.

### Lipsync appears out of sync or shape

- Validate blendshape format (`arkit` vs `mha`) matches your rig expectations.
- Tune `frames_buffer_duration` so you atleast have some duration of blendshapes before the audio starts playing.
- Align lipsync start and stop with the queue: start playback when the bot starts speaking (`isBotSpeaking()` true) and treat the turn as finished when `blendshapeQueue.isConversationEnded()` is true before resetting.
- Drive blendshape application from a single loop (e.g. `requestAnimationFrame`) and advance frame index at 60fps so mouth movement stays in sync with audio.

## 17. Examples

Repository examples:

- `examples/react-three-fiber`
- `examples/three-vanilla`
- `examples/README.md` for example-level setup notes
