# Classic Chess

Classic Chess is a React, TypeScript, Vite chess coaching app. It combines `chess.js` for board rules, Stockfish for coach moves, Convai for spoken coach dialogue, and Three.js / React Three Fiber for animated coach avatars.

## Features

- Quick Play against a selected coach
- AI coach speech through Convai
- Microphone toggle for voice chat, off by default
- Puzzle mode with hints, five-puzzle groups, and mistake review
- Saved games and replay
- Post-game analysis
- Local custom coach creator through Convai Core API helpers
- Four coach personas: Magnus, Sofia, Arjun, and Leila

## Run

```bash
npm install
npm run dev
```

Build and test:

```bash
npm run build
npm run test
```

The project uses `@convai/web-sdk@^1.3.0`, which is the current stable npm version checked for this implementation.

## Environment

Create a local env file with the Convai API key:

```bash
VITE_CONVAI_API_KEY=your_key_here
```

Coach character IDs are configured in [src/coachConfig.ts](src/coachConfig.ts).

## Code Map

- [src/App.tsx](src/App.tsx): app screens, quick play, puzzles, chat drawer, mic buttons, and the main game loop.
- [src/chessAi.ts](src/chessAi.ts): chess evaluation helpers, legal target lookup, dynamic Convai context, coach instruction text, and local speech gating.
- [src/convaiManager.ts](src/convaiManager.ts): Convai client lifecycle, dynamic-info updates, text turns, audio renderer, lipsync frames, mic state, and status events.
- [src/coachConfig.ts](src/coachConfig.ts): coach persona metadata, character IDs, difficulty settings, and curriculum.
- [src/stockfishEngine.ts](src/stockfishEngine.ts): Stockfish move selection.
- [src/debugLog.ts](src/debugLog.ts): browser-to-file debug logging.
- [vite.config.ts](vite.config.ts): Vite config plus the dev-only `/api/log` middleware.
- [src/puzzles.ts](src/puzzles.ts): puzzle data and scoring.
- [src/storage.ts](src/storage.ts): local saved game sessions.
- [src/convaiCoreApi.ts](src/convaiCoreApi.ts): Convai Core API helpers used by the custom coach creator.

## Convai Integration

The app uses the vanilla Convai SDK from `@convai/web-sdk/vanilla`.

The manager creates one connection object per coach, but only the active coach stays connected. Switching coaches disconnects other coach sessions so audio, lipsync, and context do not cross streams.

Connection setup in [src/convaiManager.ts](src/convaiManager.ts):

- `startWithAudioOn: false`, so the microphone stays off until the user clicks the mic button.
- `ttsEnabled: true`, so text turns produce spoken audio.
- `enableLipsync: true` and `blendshapeConfig: { format: 'arkit' }`, so the avatar can consume blendshape frames.
- `keepInContext: false`, so dynamic info is mutable and replaceable rather than a permanent accumulating prompt.

## Dynamic Info

Convai SDK `1.3.0` documents `updateDynamicInfo(dynamicInfo: string)`. The code follows that signature.

Dynamic info is treated as fresh mutable board context, not permanent chat history:

1. `buildDynamicCoachInfo()` creates a complete current snapshot: coach identity, student level, FEN, recent move history, material, tactical scan, last move facts, neutral position facts, and the engine reply candidate.
2. `chessConvai.updateCoachContext()` calls `client.updateDynamicInfo(dynamicInfo)` for routine moves without triggering a response.
3. `chessConvai.speakCoachMessage()` also calls `updateDynamicInfo(dynamicInfo)` immediately before `sendUserTextMessage()` for spoken turns.
4. After any active speech turn fully completes, the coach move is applied.
5. After the coach move is on the board, the app sends another fresh dynamic-info update for the new board position.

Because `keepInContext` is `false`, each dynamic-info update overwrites the mutable game context rather than intentionally appending repeated old context.

`Position facts` are intentionally neutral. They describe what exists on the board, such as phase, move number, checks, captures, loose pieces, hanging material, king safety, pawn-shield damage, open files, repeated piece movement, and forcing replies. They do not tell Convai the exact lesson to teach.

## Speech Flow

Quick Play uses this flow:

1. User makes a legal move in `makePlayerMove()`.
2. `makeCoachMove()` asks Stockfish for the coach reply.
3. `buildDynamicCoachInfo()` builds a fresh context snapshot for Convai.
4. `analyzeCoachMoveContext()` decides locally whether this turn deserves speech.
5. Routine turns call `updateCoachContext()` only, then the coach move is applied.
6. Teaching turns call `speakCoachMessage()` with a short natural request, while full board context lives in dynamic info.
7. The coach move is applied and the updated board context is sent again.

Important design choice: the app does not send the full prompt as user text. User text stays short, so Convai should not treat system instructions as transcript content or produce labels like `Human:`.

The text turn for move coaching is deliberately generic:

```text
Please coach the current chess position if there is a meaningful teaching point.
```

Convai gets the board through dynamic info and infers the actual teaching angle itself.

## Routine Move Rules

Routine detection is local and difficulty-aware in `analyzeCoachMoveContext()`.

The analyzer checks:

- Phase and move number
- Captures, checks, promotions, and material swing
- Forcing replies available to the coach
- Loose pieces and currently capturable material
- Repeated piece moves and early queen moves
- Castling and uncastled kings with an opened center
- Aggressive flank pawn pushes, pawn-shield damage, opened king files, and too many early pawn moves

Always worth speaking:

- Checkmate or draw
- Check
- Promotion
- Coach check or promotion available
- Loose higher-value piece
- King pawn shield weakening

Difficulty-specific behavior:

- `new`: most talkative. Speaks for simple captures, early center control, development, castling, loose pieces, checks, and obvious pawn or king-safety lessons.
- `beginner`: speaks for captures, checks, loose pieces, castling, king safety, repeated-piece issues, early queen issues, and clear opening-principle mistakes.
- `intermediate`: moderate. Skips ordinary pawn captures, but speaks for meaningful captures, tactics, forcing replies, loose pieces, repeated-piece issues, aggressive flank pawn pushes, structural concessions, and king safety.
- `advanced`: sparse. Speaks for forcing moves, meaningful captures, structural concessions, loose material, king-safety changes, early queen problems, and real turning points.
- `expert`: quietest. Speaks mainly for game-ending states, checks, promotions, major captures, major loose material, defensive resources, or non-obvious king/pawn concessions.

For example, `exd5` as a normal pawn capture is routine at intermediate and above, while an early `F 2` to `F 4` type flank-pawn lunge can trigger speech because it changes the king shield and creates structural risk.

## Prompt And Voice Rules

Coach instruction text is generated by `buildCoachInstruction()`:

- Speak in first person as the selected coach.
- Address the student as `you`.
- Do not say `the player`, `they`, `them`, or `the coach`.
- Speak only when there is a real teaching point.
- Do not narrate the user's move or the coach's engine reply.
- Use level-appropriate curriculum from [src/coachConfig.ts](src/coachConfig.ts).

TTS notation rules:

- Use `the A file`, not `a-file`.
- Use `E 4`, not `e4`.
- Use `knight to F 3`, not `Nf3`.
- Use `bishop takes E 5`, not `Bxe5`.

## Chat Flow

Text chat uses `sendUserChat()` in [src/convaiManager.ts](src/convaiManager.ts).

The user message sent to Convai is short:

```text
Student question: "..."
Please answer as the chess coach using the current board context.
```

The full coach instruction and current board state are sent as dynamic info, not as transcribed user text.

## Microphone

The microphone is off by default.

The mic button appears:

- In the Quick Play topbar
- In the Quick Play chat drawer
- In Puzzle mode surfaces that expose chat

`chessConvai.setMicEnabled(true)` calls Convai `audioControls.enableAudio()`. Disabling calls `audioControls.disableAudio()`. The current state is exposed through `getStatus().micEnabled`.

## Avatar And Lipsync

Coach cards render GLB avatars through [src/DanielleCoach.tsx](src/DanielleCoach.tsx) and [src/ReallusionCharacter.tsx](src/ReallusionCharacter.tsx).

`convaiManager.getLipsyncFrame(coachId)` reads frames from `client.blendshapeQueue` while that coach is speaking. Only the active speaking coach receives frames.

## Puzzle Mode

Puzzles are grouped in batches of five.

1. The intro screen explains the interaction.
2. The player can ask up to three hints.
3. Correct non-review answers get very short confirmation.
4. Wrong answers are added to the review queue.
5. At group completion, the player can review mistakes or skip ahead.
6. Review mode asks the coach for one teaching sentence about why the correct move works.

## Debug Logging

In dev mode, `debugLog(scope, message)`:

1. Prints `[HH:MM:SS] [Scope] message` to the browser console.
2. Batches entries and posts them to `/api/log` every 200 ms.
3. Vite middleware writes them to `debug.log` in the project root.

The file is cleared when the dev server starts. Repeated `CoachCard` and `ReallusionCharacter` messages are deduplicated more aggressively than ordinary logs.

Useful log lines:

- `[Convai] [Name] Connecting`
- `[Convai] [Name] BOT READY`
- `[Convai] [Name] Dynamic info updated`
- `[makeCoachMove] planned="..." speech=yes/no reason=... phase=... facts=...`
- `[Convai] [Name] Speaking session=...`
- `[Convai] [Name] turnEnd session=...`
- `[Convai] [Name] FINAL`
- `[Convai] [Name] Speech done`

## References

- Convai SDK docs copied locally: [docs/convai_web-sdk_documentation.md](docs/convai_web-sdk_documentation.md)
- Installed SDK README: [node_modules/@convai/web-sdk/README.md](node_modules/@convai/web-sdk/README.md)
- Coach personas for manual Convai setup: [docs/coach_personas/](docs/coach_personas/)
- Ideal coach behavior reference: [docs/ideal_coach_experience.md](docs/ideal_coach_experience.md)
- Implementation notes: [docs/chess_feedback_implementation_plan.md](docs/chess_feedback_implementation_plan.md)
