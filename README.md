# Classic Chess

Classic Chess is a React, TypeScript, Vite chess coaching app. It combines `chess.js` for board rules, Stockfish for coach moves, Convai for spoken coach dialogue, and Three.js / React Three Fiber for animated coach avatars.

## Features

- Quick Play against a selected coach
- AI coach speech through Convai with two selectable decision strategies:
  - **Game decides** — local heuristics in `analyzeCoachMoveContext` choose when the coach should speak
  - **Coach decides** — Convai's LLM sees the full position context every turn and chooses whether to chime in via `updateContext({ run_llm: 'auto' })`
- A persistent "Coaching Control" toggle on the menu screen to switch between the two strategies, with a tooltip explaining the difference
- Microphone toggle for voice chat, off by default
- Puzzle mode with hints, five-puzzle groups, and mistake review
- Saved games and replay
- Post-game analysis
- Local custom coach creator through Convai Core API helpers
- Four coach personas: Magnus, Sofia, Arjun, and Leila
- Optional **Dialogue Dataset** tooling (enabled via `npm run dev:dataset`) for capturing, labeling, and reviewing coach utterances

## Run

```bash
npm install
npm run dev
```

To run with the Dialogue Dataset tooling enabled (extra menu tile, ➕ button on the coach card, save modal, `/api/dataset` HTTP endpoint, and the Dataset screen):

```bash
npm run dev:dataset
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

- [src/App.tsx](src/App.tsx): app screens, quick play, puzzles, chat drawer, mic buttons, the main game loop, the coaching-control toggle wiring, and the dataset save modal/toast.
- [src/MenuScreen.tsx](src/MenuScreen.tsx): menu layout, mode tiles, coach/difficulty pickers, and the "Coaching Control" segmented toggle (Game vs Coach) in the bottom-right of the setup panel.
- [src/DatasetScreen.tsx](src/DatasetScreen.tsx): dialogue-dataset browser with per-entry board preview, dynamic-info inspection, mode/expected-response badges, delete-one and clear-all flows (compile-time eliminated unless `npm run dev:dataset` is used).
- [src/chessAi.ts](src/chessAi.ts): chess evaluation helpers, legal target lookup, dynamic Convai context, coach instruction text, and local speech gating (used by the Game-decides path).
- [src/convaiManager.ts](src/convaiManager.ts): Convai client lifecycle, dynamic-info updates, scripted text turns, auto-LLM context turns via `updateContext`, `llmNoResponse` handling, audio renderer, lipsync frames, mic state, and status events.
- [src/coachConfig.ts](src/coachConfig.ts): coach persona metadata, character IDs, difficulty settings, and curriculum.
- [src/stockfishEngine.ts](src/stockfishEngine.ts): Stockfish move selection.
- [src/debugLog.ts](src/debugLog.ts): browser-to-file debug logging.
- [vite.config.ts](vite.config.ts): mode-aware Vite config. The `chess-log-server` plugin hosts `/api/log` always, and `/api/dataset` (GET/POST/DELETE backed by `dataset.json`) when started in `--mode dataset`. The compile-time flag `__DATASET_TOOLS_ENABLED__` is injected via `define`.
- [src/puzzles.ts](src/puzzles.ts): puzzle data and scoring.
- [src/storage.ts](src/storage.ts): localStorage helpers for saved game sessions, puzzle progress, and the persisted `coachingControlMode` setting.
- [src/convaiCoreApi.ts](src/convaiCoreApi.ts): Convai Core API helpers used by the custom coach creator.
- [src/CoachCard.tsx](src/CoachCard.tsx): coach card with avatar, caption, and an optional ➕ button that opens the "Add Dialogue to Dataset" modal when dataset tooling is enabled.

## Convai Integration

The app uses the vanilla Convai SDK from `@convai/web-sdk/vanilla`.

The manager creates one connection object per coach, but only the active coach stays connected. Switching coaches disconnects other coach sessions so audio, lipsync, and context do not cross streams.

Connection setup in [src/convaiManager.ts](src/convaiManager.ts):

- `startWithAudioOn: false`, so the microphone stays off until the user clicks the mic button.
- `ttsEnabled: true`, so text turns produce spoken audio.
- `enableLipsync: true` and `blendshapeConfig: { format: 'arkit' }`, so the avatar can consume blendshape frames.
- `keepInContext: false`, so dynamic info is mutable and replaceable rather than a permanent accumulating prompt.

The manager subscribes to:

- `message` — including the special `llm-no-response` content type Convai emits when the LLM deliberately abstains.
- `stateChange` — keeps `isSpeaking` and `isThinking` flags in sync with the SDK.
- `botReady` — gates the first speech request until the character is initialised.
- `turnEnd` — primary signal that a turn is complete.
- `llmNoResponse` — fast path for cleanly aborting "thinking" waits when the LLM decides not to speak.
- `blendshapes` / `blendshapeStatsReceived` — drive lipsync activity and detect end of audio.

Suppression pattern: a strict whole-line regex `^\s*(silent|human):?\s*[.!?]*\s*$` interrupts any bot turn that comes back as just `Silent.` or `Human:` (a defence-in-depth catch for prompt leakage). Substrings like the word "human" inside a normal sentence are intentionally NOT suppressed any more.

## Dynamic Info and Three Update Paths

Convai SDK `1.3.0` exposes three ways to push context. The manager uses all three depending on intent:

| Helper | Call | Triggers LLM? | Used by |
| --- | --- | --- | --- |
| `updateCoachContext(coach, info)` | `client.updateDynamicInfo(info)` | No | Game-decides path, after every coach move (silent context refresh) |
| `speakCoachMessage(coach, prompt, info)` with non-empty `prompt` | `updateDynamicInfo(info)` then `sendUserTextMessage(prompt)` | Yes (scripted) | Hints, chat, Game-decides "should speak" turns, puzzle prompts |
| `speakCoachMessage(coach, '', info)` (empty `prompt`) | `client.updateContext({ text: info, mode: 'replace', run_llm: 'auto' })` | Yes, LLM decides | Coach-decides path, every coach move |

`buildDynamicCoachInfo()` builds a complete, neutral snapshot of the current position (FEN, recent move history, material, tactical scan, last move facts, neutral position facts, engine reply candidate). The same payload is reused across all three paths.

Because `keepInContext` is `false`, each `updateDynamicInfo` / `updateContext` call overwrites the mutable game context rather than appending. Position facts are intentionally neutral: they describe what exists on the board (phase, move number, checks, captures, loose pieces, hanging material, king safety, pawn-shield damage, open files, repeated piece movement, forcing replies). They do not tell Convai the exact lesson to teach.

## Coaching Control Toggle

The toggle lives at the bottom of the right-most column on the menu's setup panel, with a `?` info bubble whose tooltip explains the difference. The choice is persisted to `localStorage` under `classic-chess.coachingControlMode.v1` and defaults to **Game**.

The toggle only affects Quick Play. Puzzles always use explicit scripted prompts (correct/incorrect/hint), and the chat drawer always sends scripted user messages.

### Game-decides path (default)

1. User makes a legal move.
2. `makeCoachMove()` asks Stockfish for the coach reply.
3. `buildDynamicCoachInfo()` builds a fresh context snapshot.
4. `analyzeCoachMoveContext()` decides locally whether this turn deserves speech.
5. Routine turns call `updateCoachContext()` only (silent context push), then the coach move is applied.
6. Teaching turns call `speakCoachMessage()` with a short natural request, while full board context lives in dynamic info.
7. The coach move is applied and the updated board context is sent again with `updateCoachContext()`.

### Coach-decides path

1. User makes a legal move.
2. `makeCoachMove()` asks Stockfish for the coach reply (still needed for the move itself, but no local speech gating).
3. `buildDynamicCoachInfo()` builds the same fresh context snapshot.
4. `speakCoachMessage(coach, '', context)` is called with an empty prompt. The manager sends `client.updateContext({ text, mode: 'replace', run_llm: 'auto' })` — Convai's LLM looks at the new context and decides whether to chime in.
5. If the LLM speaks, the audio plays and lipsync runs as normal.
6. If the LLM abstains:
   - It fires `llmNoResponse` (the fast path — manager returns within ~4 s).
   - Or it silently does nothing (the manager detects no text after a short probe and bails fast, see "Auto-context fast-exit" below).
7. The coach move is then applied. No second silent `updateCoachContext` is needed because the `updateContext` call already replaced the context.

### Auto-context fast-exit

In the wild, Convai sometimes accepts an auto-LLM context update, briefly toggles `isSpeaking` while "thinking", and then silently decides not to respond without firing `llmNoResponse`. Naively waiting for a signal that never arrives produced ~20 s pauses between moves.

`waitForResponseCompletion(conn, isAutoContextTurn)` now takes a flag and applies tighter timing for auto-context turns:

- Shorter initial detection loop (2.5 s vs 4 s for scripted turns).
- After the initial probe, if there is no text in the buffer and no audio is playing, the manager treats it as a silent abstain and returns immediately.
- Inside the speaking-detection loop, if `isSpeaking` flips off and ~500 ms of silence elapses with no text ever having arrived, the manager also bails out fast.
- Speaking-detection max wait drops from 20 s to 8 s, and post-speech silence drops from 800 ms to 400 ms.

The end result: a silent abstention in coach-decides mode now resolves in ~4–5 s instead of ~20 s, matching the experience when `llmNoResponse` fires explicitly. When the LLM does choose to speak, the full TTS still plays without truncation.

## Speech Flow Summary

```
Player moves
  -> chess.js validates the move
  -> Stockfish selects the coach's reply
  -> app builds dynamic coach context
  -> mode === 'game' ? analyzeCoachMoveContext to decide speech : send empty message + updateContext (run_llm=auto)
  -> Convai may speak (lipsync + TTS) or abstain (llmNoResponse / silent)
  -> the planned coach move is applied to the board
  -> mode === 'game' ? silent updateCoachContext refresh : already done by updateContext
```

The text turn for scripted Game-decides move coaching is deliberately generic:

```text
Please coach the current chess position if there is a meaningful teaching point.
```

Convai gets the board through dynamic info and infers the actual teaching angle itself.

## Routine Move Rules (Game-decides only)

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

In Coach-decides mode none of this is checked — the LLM is given the full neutral context and chooses for itself.

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

Coach cards render GLB avatars through [src/CoachCard.tsx](src/CoachCard.tsx) and [src/ReallusionCharacter.tsx](src/ReallusionCharacter.tsx).

`convaiManager.getLipsyncFrame(coachId)` reads frames from `client.blendshapeQueue` while that coach is speaking. Only the active speaking coach receives frames.

## Puzzle Mode

The puzzle bank ships with **25** curated positions — **5 per difficulty** (`new`, `beginner`, `intermediate`, `advanced`, `expert`). Every entry includes a `positionSummary` string in `src/puzzles.ts` that describes the board in plain language (who moves, what pieces matter, what the tension is) so puzzles are easy to audit and extend. Each puzzle was human-audited per the methodology in `docs/AGENT_HANDOFF.md` — square-by-square inventory plus subjective tactical review — because automated tests can pass while puzzles feel broken when you actually play them. We deliberately do not ship a puzzle test suite: the earlier `puzzles.test.ts` / `puzzles.deep.test.ts` would pass on positions that still played as blunders (e.g. an old "Greek gift" puzzle whose solution gave up a bishop for a pawn with no follow-up), so they were removed in favour of human review.

Puzzles are grouped in batches of five.

1. The intro screen explains the interaction and announces which colour the player controls.
2. The board is flipped automatically when `puzzle.sideToMove` is `b` so the player's pieces are always at the bottom — earlier versions kept white at the bottom even when the player was meant to play Black, which was confusing.
3. The player can ask up to three hints.
4. Correct non-review answers get a very short confirmation.
5. Wrong answers and *skipped* puzzles are both added to the review queue, so the group-complete screen reports an honest `X of N solved cleanly` count — previously, skipping silently counted as a clean solve.
6. At group completion, the player can review mistakes or skip ahead. Only puzzles that were actually solved correctly are persisted to the per-difficulty `completedIds` progress list.
7. Review mode asks the coach for one teaching sentence about why the correct move works.

Puzzles always use explicit scripted prompts and are unaffected by the Coaching Control toggle.

## Dialogue Dataset Tools

Enabled exclusively when started with `npm run dev:dataset` (which sets Vite mode to `dataset` and flips the compile-time `__DATASET_TOOLS_ENABLED__` flag). In the default `npm run dev` build, every piece of the dataset machinery is dead-code-eliminated at build time.

### What gets added

- A fifth tile **Dialogue Dataset** in the menu mode-grid (the grid auto-fits between four and five columns).
- A ➕ button on the in-game coach card. Pressing it opens a small modal where you can label the latest exchange as `silent` (the coach should NOT have spoken) or `talk` (the coach SHOULD have spoken).
- A toast notification system for save/delete feedback.
- A new **Dataset** screen routed from the menu tile. It lists every logged exchange with the coach name, difficulty, timestamp, and either the coach's spoken line or "Silent". Selecting an entry shows:
  - A live `ChessBoard` reconstructed from the entry's FEN.
  - "Mode" badge (Game decides / Coach decides) and "Expected" badge (silent / talk).
  - The exact user prompt sent (if any), the dynamic-info payload, and the coach's output.
  - Per-entry delete and a clear-all action.

### What gets logged

`App.tsx` calls `setLastExchange(...)` after every LLM-invoked turn. That includes:

- Game-decides mode: only the `shouldSpeak` branch (no LLM call happened in the silent branch).
- Coach-decides mode: every coach move (because every coach move triggers `updateContext` with `run_llm: 'auto'`).
- Hints: always.
- User chat messages: always.

The payload posted to `/api/dataset` includes `coachId`, `coachName`, `difficultyId`, `fen`, `dynamicInfo` (the full LLM input), `prompt` (empty for coach-decides), `coachResponse`, `wasSilent`, `timestamp`, `sessionId`, `coachingControlMode`, and `expectedResponse`.

### Backend

[vite.config.ts](vite.config.ts) registers `/api/dataset` only when `mode === 'dataset'`. It supports:

- `GET /api/dataset` → returns the full `dataset.json` array (or `[]` if missing).
- `POST /api/dataset` → appends a single entry and returns `{ success: true, count }`.
- `DELETE /api/dataset` with `{ timestamp }` → deletes one entry.
- `DELETE /api/dataset` with `{ clearAll: true }` → empties the dataset.

`dataset.json` lives at the repo root and is `.gitignore`d so logged exchanges are never committed.

## Debug Logging

In dev mode, `debugLog(scope, message)`:

1. Prints `[HH:MM:SS] [Scope] message` to the browser console.
2. Batches entries and posts them to `/api/log` every 200 ms.
3. Vite middleware writes them to `debug.log` in the project root.

Older sessions are rotated out automatically once the log exceeds 5 MB. Repeated `CoachCard` and `ReallusionCharacter` messages are deduplicated more aggressively than ordinary logs.

Useful log lines:

- `[Convai] [Name] Connecting`
- `[Convai] [Name] BOT READY`
- `[Convai] [Name] Dynamic info updated`
- `[Convai] [Name] Context update auto-LLM turn session=...` — coach-decides mode push
- `[Convai] [Name] LLM chose no response` — explicit abstain via `llmNoResponse`
- `[Convai] [Name] Auto-context turn yielded no text; treating as silent abstain` — fast-exit when no explicit signal came
- `[makeCoachMove] [game-decides] planned="..." speech=yes/no reason=... phase=... facts=...`
- `[makeCoachMove] [coach-decides] dynamic context auto-LLM turn ...`
- `[Convai] [Name] Speaking session=...`
- `[Convai] [Name] turnEnd session=...`
- `[Convai] [Name] FINAL`
- `[Convai] [Name] Speech done`
- `[App] coachingControlMode -> game|coach` — fires whenever the menu toggle changes

## References

- Convai SDK docs copied locally: [docs/convai_web-sdk_documentation.md](docs/convai_web-sdk_documentation.md)
- Installed SDK README: [node_modules/@convai/web-sdk/README.md](node_modules/@convai/web-sdk/README.md)
- Coach personas for manual Convai setup: [docs/coach_personas/](docs/coach_personas/)
- Ideal coach behavior reference: [docs/ideal_coach_experience.md](docs/ideal_coach_experience.md)
- Implementation notes: [docs/chess_feedback_implementation_plan.md](docs/chess_feedback_implementation_plan.md)
- Technical blog post: [docs/technical-blog.md](docs/technical-blog.md)
