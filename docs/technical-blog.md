# Bringing Convai Characters Into a Browser Chess Game

Convai's Reallusion + Three.js workflow shows the core avatar loop: create a Reallusion character, export it for the web, render it in React/Three.js, and connect it to Convai for speech, personality, and real-time interaction.

Reference: https://convai.com/blog/bring-ai-online-with-reallusion-avatars-using-threejs-react

Our chess prototype builds on that same idea, but puts it inside a playable game loop. The big picture is that the chess engine owns the rules, while Convai owns the character performance. The game knows what is legal, what just happened, and what state the board is in. Convai turns that context into spoken, in-character behavior, streams the text response, plays generated voice, and provides lipsync data for the Reallusion avatar.

```txt
Chess engine (chess.js + Stockfish)
  -> validate the player's move
  -> pick the coach's reply
  -> build dynamic game context
  -> send prompt + dynamic info to Convai
  -> receive streaming text, voice, and lipsync
  -> animate the Reallusion avatar
  -> apply the coach's move on the board
```

## The Convai Layer

The game uses `@convai/web-sdk@1.3.0` from the browser. A Convai client is created with a character ID, API key, TTS enabled, and ARKit-format lipsync enabled.

```ts
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
```

The main Convai features used by the game are:

- `sendUserTextMessage(...)` sends a turn prompt or chat message to the character.
- `updateDynamicInfo({ text })` refreshes the character's live game context.
- `updateContext({ text, mode, run_llm })` replaces context and optionally lets the LLM decide whether to respond.
- `bot-llm-text` messages provide streamed response text.
- `stateChange` tells the app when a character starts and stops speaking.
- `blendshapeQueue` provides ARKit lipsync frames for the avatar.
- `botReady` tells the app when the character is initialized.
- `AudioRenderer` handles voice playback from the Convai room.

Together these make Convai the speech layer, personality layer, conversation layer, and facial-performance data source.

## Dynamic Info: Keeping the Coach Grounded

The most important integration detail is dynamic info. Before the coach speaks, the game sends a compact summary of the current state. This includes the coach's identity and teaching style, the student's level and curriculum, whose turn it is, whether the position is normal / check / draw / checkmate, the current FEN, the recent move history (last ten moves), the legal move count, material balance, a tactical summary, the last move played, and the coach's planned next move.

This keeps Convai grounded in the actual game. The character does not need to infer the board from scratch. The game tells Convai what matters, and Convai responds in character.

## Letting the Player Choose Who Decides

Picking the *content* of the dynamic-info payload is only half the design. The other half is deciding **when the coach should speak at all**. The menu exposes a small "Coaching Control" segmented toggle (Game vs Coach) with an info tooltip:

- **Game**: the local `analyzeCoachMoveContext()` heuristic inspects every move (captures, hanging pieces, weakened king shield, repeated moves, opening-principle violations, and so on), and only sends a scripted prompt to Convai when there is a real teaching point. Routine moves silently refresh dynamic info so the coach stays grounded without speaking.
- **Coach**: the game pushes the full board context every turn and asks Convai's LLM to decide whether to chime in. The character can stay silent for several routine moves in a row and then comment when *it* spots something worth saying.

The choice is persisted to `localStorage` so each user keeps their preferred experience between sessions. Puzzles always use explicit scripted prompts and are intentionally unaffected — the toggle is a Quick Play decision.

The pattern matters beyond chess. It separates the question "who controls game state" (always the engine, for safety) from "who controls character timing" (a stylistic choice).

## Coach-Decides Mode With `updateContext`

The Coach-decides path leans on the `client.updateContext()` API in `@convai/web-sdk@1.3.0`. Unlike `updateDynamicInfo()`, `updateContext()` accepts a `run_llm` field with three values:

| `run_llm` | Effect |
| --- | --- |
| `"true"` | Treat the update as itself an event and respond immediately. |
| `"false"` | Replace the context silently; do not run the LLM. |
| `"auto"` | Replace the context and let the LLM decide whether a response is needed. |

The Coach-decides flow calls:

```ts
client.blendshapeQueue?.startConversation?.();
client.updateContext({
  text: dynamicInfo, // FEN + recent moves + neutral position facts + engine plan
  mode: 'replace',
  run_llm: 'auto',
});
```

The character then either streams a `bot-llm-text` response (which we render with lipsync just like a scripted turn), or fires the `llmNoResponse` event, which the manager treats as a clean abort so the chess board does not feel frozen between moves.

## Logging Dialogue for Iteration: The Dialogue Dataset

Picking the right balance of dynamic-info content, prompt style, and "should I speak?" heuristics is an iterative process. The prototype ships with a small, fully gated dataset tool to make those decisions evidence-based:

```bash
npm run dev:dataset
```

This is `vite --mode dataset`, which:

- Flips a compile-time `__DATASET_TOOLS_ENABLED__` flag via Vite's `define`.
- Registers a `/api/dataset` HTTP endpoint in the dev server (`GET` / `POST` / `DELETE`) backed by a local `dataset.json`.
- Surfaces a "Dialogue Dataset" tile on the menu and a small ➕ button on the coach card during gameplay.

When the toolkit is enabled, every LLM-invoked turn (Coach-decides turns, plus the Game-decides turns that actually triggered a prompt, plus all hints and chats) is captured in memory as a `lastExchange`. Hitting ➕ opens a small modal where you label whether the coach *should* have spoken (`silent` / `talk`) for this position. The labelled entry — coach, difficulty, FEN, the exact dynamic-info payload, the prompt, the actual response, the coaching mode, and the human label — is POSTed and persisted.

The Dataset screen then lets you browse logged exchanges with a per-entry board preview, the full LLM input it received, the coach's output, and side-by-side mode/expected badges. That makes it concrete to see where each mode agrees with the labeller and where it drifts.

Because the entire dataset stack is compile-time eliminated in regular `npm run dev`, end users never see any of this in the shipped build. It's a developer-only loop for tuning the most important and most subjective part of an LLM-driven character: when to keep your mouth shut.

The pattern is broadly reusable. Any LLM-driven NPC has a "should I speak now?" decision somewhere. Logging that decision with full context, labelling it after the fact, and inspecting the patterns is how you move from anecdotal tuning to a measurable, regressable signal.

## Multiple Coaches With a Connection Pool

The chess game supports four selectable coach personas — Magnus, Sofia, Arjun, and Leila — each backed by a separate Convai character ID. The manager keeps a connection pool with one entry per coach, so switching coaches mid-session doesn't pay the cost of reconnecting from scratch. Only one coach is active at a time, and the manager routes speech, dynamic info, and lipsync frames to the active coach.

Each coach has its own teaching style, hint approach, curriculum-level descriptions, and explanation depth — all injected into the prompt at runtime so the same Convai pipeline can feel like four different coaching personalities.

## TTS-Friendly Chess Notation

Raw chess notation like `e4`, `Nf3`, or `a-file` does not sound right when a TTS engine reads it. The letter `e` in `e4` tends to come out as the article "uh", and `a-file` is read as "uh file" rather than "Ay file". The fix is a prompt rule that tells the LLM to always capitalize file letters and separate letters from digits with a space: `"the E file"` instead of `"e-file"`, `"E 4"` instead of `"e4"`, `"knight to F 3"` instead of `"Nf3"`. With a capital letter the TTS reads it as the letter name, not an article or stray sound.

If a word or name still comes out badly despite prompt-level guidance, custom pronunciation entries in the Convai platform dashboard can correct specific terms at the voice level.

## Chess Turn Flow

```txt
Player moves
  -> chess.js validates the move
  -> Stockfish selects the coach's reply
  -> app builds dynamic coach context
  -> Convai generates the coach's spoken line
  -> the coach's avatar speaks with lipsync
  -> the planned move is applied to the board
```

This lets the coach behave like a real teacher instead of a move generator. The chess engine provides strength and legality. Convai provides personality, voice, explanation, and presence.

## Streaming Text and Speech Completion

Convai responses can arrive as streamed text while the voice is playing. The manager listens for `bot-llm-text` messages and stores the latest response text.

Speech timing combines SDK `stateChange`, lipsync activity, and a conservative word-count estimate. Coach moves use `waitForFullSpeech: true` so Stockfish replies are applied only after the spoken line finishes.

The manager also stores the longest response text seen during the stream. This helps avoid clipped text bubbles when the streamed message updates in chunks.

## Quick Play Loading and Welcome

Quick Play mounts the game board behind a loading overlay. Convai connects and `beginNewGame` runs setup while the overlay shows monotonic progress messages (connect → warm up → set up game → “Taking your seat…”).

The overlay peels before welcome speech. After the board appears, the app waits ~900 ms so the player can orient, then delivers the welcome line. This avoids bombarding the user during the screen transition while still hiding LLM latency behind loading.

## Reallusion Avatar Lipsync

Convai provides ARKit-style blendshape frames. Reallusion CC4 avatars use their own morph target names. The bridge between them is an `ARKIT_TO_CC4` mapping table.

Each frame:

```txt
Convai ARKit frame
  -> map ARKit index to CC4 morph name
  -> scale the value
  -> apply it to the matching SkinnedMesh morph target
  -> decay morphs smoothly after speech stops
```

Examples of CC4 morph targets include:

```txt
Jaw_Open
V_Open
Mouth_Smile_L
Mouth_Frown_R
Mouth_Pucker_Up_L
Eye_Blink_R
Brow_Drop_L
```

## Recovering CC4 Morph Target Names

One Reallusion-specific detail is that CC4 GLB exports can store morph target names in `mesh.extras.targetNames`. Three.js may not automatically copy those into `morphTargetDictionary`.

The chess app patches this after loading the GLB by reading the raw parser JSON and rebuilding the morph dictionary. Without this step, the model may render correctly, but lipsync will not know which morph target corresponds to which mouth shape.

```txt
Load GLB
  -> inspect parser JSON
  -> read mesh.extras.targetNames
  -> patch morphTargetDictionary
  -> apply ARKit-to-CC4 lipsync normally
```

This is one of the most important bridge pieces between Reallusion avatars and Convai lipsync.

## Why This Pattern Works

The clean mental model is:

```txt
Chess engine  = truth
Convai        = character performance
Dynamic info  = live memory
Prompt        = direction
Lipsync       = embodiment
```

The chess prototype demonstrates the focused coach version of this pattern: a persistent Convai connection per coach, a single authoritative board state, Stockfish-backed move choice, and short spoken explanations layered on top. Keep rules and validation in code, use Convai for conversation and performance, and connect the two through dynamic info.

## Conclusion

Convai works best here as the character layer that sits on top of deterministic game logic. That gives you the safety of local rules and the expressiveness of a live conversational agent. In this chess prototype, that means a coach who can explain moves naturally, stay short and meaningful, and speak with a consistent personality across four selectable teachers.

The overall pattern is reusable: keep the game authoritative, feed Convai rich state through dynamic info, and use Reallusion avatars to make the response feel embodied. That combination is what makes the demo feel like a chess game with a real coach instead of just a chess board with chat text.
