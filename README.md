# Classic Chess

Classic Chess is a React, TypeScript, Vite chess coaching app. It combines `chess.js` for board rules, Stockfish for coach moves, Convai for spoken coach dialogue, and Three.js / React Three Fiber for animated coach avatars.

## Features

- **Quick Play** against Magnus, Sofia, Arjun, Leila, or custom coaches you create
- **AI coach speech** through Convai with two coaching strategies:
  - **Coach mode** (default) — Convai's LLM sees full board context every turn and decides whether to speak (`run_llm: 'auto'`)
  - **Game mode** — local heuristics in `analyzeCoachMoveContext()` pick teaching moments; the coach only speaks on captures, tactics, king safety, and similar events
- **Coaching Control** toggle on the menu (persisted in `localStorage`, defaults to **Coach**)
- **Corner chat drawer** — chat button on the coach card; drawer opens bottom-right during play and post-game analysis
- **Turn feedback** — calm chime + subtle board pulse when it becomes your turn
- **UI sounds** — gentle chimes for navigation, confirm, toggle, send, and tap actions (`src/uiSounds.ts`)
- **API key management** — `VITE_CONVAI_API_KEY` in `.env` or a key saved in the browser; modal with Convai signup steps when no key is detected; masked key badge on the menu (`09***`)
- **Custom coach creator** — Convai Core API with language-filtered voices and verified model list (default: `gemini-2.5-flash-lite`)
- **Board vision** (experimental) — `VITE_CONVAI_BOARD_VISION=true` publishes a low-FPS board canvas stream to the Convai room
- Microphone toggle for voice chat, off by default
- Puzzle mode with hints, five-puzzle groups, and mistake review
- Saved games and replay
- Post-game analysis with Menu button and coach chat
- Responsive desktop, ultrawide, and mobile layouts
- Loading cover until the coach avatar has rendered
- Portal-based tooltips (not clipped by card overflow)
- Optional **Dialogue Dataset** tooling (`npm run dev:dataset`)

## Run

```bash
npm install
npm run dev
```

Dataset tooling (extra menu tile, coach-card ➕ button, `/api/dataset`, Dataset screen):

```bash
npm run dev:dataset
```

Build and test:

```bash
npm run build
npm run test
```

Uses `@convai/web-sdk@^1.3.0`.

## Environment

```bash
# Required for Convai (or add via in-app modal — stored in localStorage)
VITE_CONVAI_API_KEY=your_key_here

# Optional: publish board DOM as video to Convai room (also enable vision on character in Convai dashboard)
VITE_CONVAI_BOARD_VISION=true

# Optional: override character GLB asset base URL
# VITE_CHARACTER_ASSET_BASE_URL=https://...
```

Builtin coach character IDs live in [src/coachConfig.ts](src/coachConfig.ts). Custom coaches are saved locally and merged into the menu via `getAllCoaches()`.

Recommended LLM for live coaching: **Gemini 2.5 Flash Lite** or **Claude 4 Sonnet** — see [docs/convai-model-recommendation.md](docs/convai-model-recommendation.md).

## Code Map

| File | Role |
| --- | --- |
| [src/App.tsx](src/App.tsx) | Screens, game loop, chat drawer, API key modal, custom coach creator, turn/UI sound wiring |
| [src/MenuScreen.tsx](src/MenuScreen.tsx) | Menu, coach/difficulty pickers, coaching control toggle, API key badge |
| [src/CoachCard.tsx](src/CoachCard.tsx) | Avatar card, chat toggle, optional dataset button |
| [src/ChatDrawer.tsx](src/ChatDrawer.tsx) | Fixed bottom-right chat panel |
| [src/Tooltip.tsx](src/Tooltip.tsx) | Viewport-aware portal tooltips |
| [src/uiSounds.ts](src/uiSounds.ts) | Web Audio UI chimes (`tap`, `nav`, `back`, `confirm`, `toggle`, `send`, `yourTurn`) |
| [src/convaiApiKey.ts](src/convaiApiKey.ts) | API key from localStorage + env fallback |
| [src/customCoaches.ts](src/customCoaches.ts) | localStorage for user-created coaches |
| [src/convaiManager.ts](src/convaiManager.ts) | Convai lifecycle, static policy, dynamic context, speech queue, lipsync |
| [src/convaiCoreApi.ts](src/convaiCoreApi.ts) | Convai REST helpers (voices, languages, character create/update) |
| [src/chessAi.ts](src/chessAi.ts) | Board context, coach instructions, Game-mode speech gating, welcome variety |
| [src/boardVision.ts](src/boardVision.ts) | Optional board canvas → LiveKit video track |
| [src/coachConfig.ts](src/coachConfig.ts) | Personas, difficulties, `getAllCoaches()` |
| [src/storage.ts](src/storage.ts) | Sessions, puzzle progress, `coachingControlMode` (default: `coach`) |
| [src/debugLog.ts](src/debugLog.ts) | Browser → `debug.log` via `/api/log` |

## Coaching Control

| | **Coach mode** (default) | **Game mode** |
| --- | --- | --- |
| Who decides | Convai LLM every turn | Local `analyzeCoachMoveContext()` heuristics |
| Context | Full dynamic board info each turn | Same info, but LLM only invoked on teaching moments |
| Best for | Conversational, adaptive coaching | Quieter games with commentary on notable moments |

Puzzles and chat always use explicit scripted prompts.

### Coach move timing

The coach applies her Stockfish move **only after** TTS finishes. `runCoachTurn` uses `waitForFullSpeech: true` and `waitUntilSpeechFinished()` with short audio-tail detection (~120 ms) so moves follow speech promptly.

### Welcome lines

Opening greetings use varied casual lines from `buildWelcomeDynamicInfo()` — no repeated “you have white / show opening move” scripts.

## Convai Integration

- Static coaching policy seeded once with `keepInContext: true`; per-turn updates send **dynamic board state only** (reduces prompt leak and latency).
- `updateContext({ mode: 'replace', run_llm })` for coach-decides turns; `updateDynamicInfo` for silent context refresh in Game mode.
- Prompt-leak responses starting with `Human:` / `System:` / `User:` are suppressed.
- New game: `resetSession` + context reset + fresh `endUserId` per session.
- Game-over modal waits until the coach finishes speaking.

## Custom Coach Creator

1. Open **Custom Coach** from the menu (API key required).
2. Voices and languages load automatically; the voice list **filters to the selected language**.
3. Default model: `gemini-2.5-flash-lite` (Convai-supported model codes only).
4. On success, the coach is saved to localStorage and appears in the menu coach picker (Danielle avatar placeholder).

## Debug Logging

`debugLog(scope, message)` → console + batched POST to `/api/log` → `debug.log` in the project root.

Useful lines: `[Convai] BOT READY`, `FINAL`, `Coach move applied`, `Published live board video track`, `coachingControlMode -> coach|game`.

Copy-log button in the game topbar copies the in-browser log buffer.

## References

- [docs/convai-model-recommendation.md](docs/convai-model-recommendation.md)
- [docs/coach_personas/](docs/coach_personas/)
- [docs/convai_web-sdk_documentation.md](docs/convai_web-sdk_documentation.md)
