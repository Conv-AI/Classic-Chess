# Classic Chess

Classic Chess is a React, TypeScript, Vite chess coaching app. It combines `chess.js` for board rules, Stockfish for coach moves, Convai for spoken coach dialogue, and Three.js / React Three Fiber for animated Reallusion coach avatars.

## Features

- Optional **Google sign-in** for Convai long-term memory — **published for external Google accounts** (guest play unchanged; see [docs/google-convai-memory-tutorial.md](docs/google-convai-memory-tutorial.md))
- **Quick Play** against Magnus, Sofia, Arjun, Leila, or custom coaches you create — **Leila** is the default coach
- **Menu coach headshots** — circular portrait avatars per coach (`public/coach-portraits/`), with sharp 192×192 thumbnails for the picker
- **3D coach portrait** — softer studio lighting, adaptive canvas DPR, optional bloom/vignette post-processing (`PortraitScene`)
- **Portrait animation polish** — idle bone locks (root/hip/spine/jaw/eyes), procedural blinking, per-asset CC4 lipsync profiles, jaw-bone speech on Leila (`cc-female.glb`), unified 60fps blendshape playback synced to TTS
- **AI coach speech** through Convai with two coaching strategies:
  - **Coach mode** (default) — Convai's LLM sees full board context every turn and decides whether to speak (`run_llm: 'auto'`)
  - **Game mode** — local heuristics in `analyzeCoachMoveContext()` pick teaching moments; the coach only speaks on captures, tactics, king safety, and similar events
- **Coaching Control** toggle on the menu (persisted in `localStorage`, defaults to **Coach**)
- **Corner chat drawer** — chat button on the coach card; drawer opens bottom-right during play and post-game analysis
- **Mic on coach card** — microphone toggle lives in the caption bar under the portrait (removed from the game topbar)
- **Turn feedback** — calm chime + subtle board pulse when it becomes your turn
- **UI sounds** — gentle chimes for navigation, confirm, toggle, send, and tap actions (`src/uiSounds.ts`)
- **API key management** — Convai key in `.env.convai.local` (local dev), GitHub Secret on deploy, in-app modal, or `localStorage`; masked key badge on the menu (`09***`)
- **Custom coach creator** — Convai Core API with language-filtered voices and verified model list (default: `gemini-2.5-flash-lite`)
- **Board vision** — chess board canvas is published via Convai Vision Dynamic Context (`@convai/web-sdk@1.6.0-beta.1`) so the coach sees the position alongside text context
- Microphone toggle for voice chat, off by default
- Puzzle mode with hints, five-puzzle groups, and mistake review
- Saved games and replay
- Post-game analysis with Menu button and coach chat
- Responsive desktop, ultrawide, and mobile layouts (turn-card panel scrolls when clipped on narrow viewports)
- **Loading cover** through Convai connect, game setup, and a short “taking your seat” pause — welcome speech starts ~1s after the board appears
- Portal-based tooltips (not clipped by card overflow)
- Optional **Dialogue Dataset** tooling (`npm run dev:dataset`)

## Character assets (Git LFS)

Coach avatars are Reallusion CC4 GLB files bundled under `public/` (~450 MB total). They are tracked with **Git LFS** because several character files exceed GitHub’s 100 MB per-file limit.

After cloning, install LFS and pull the models once:

```bash
git lfs install
git lfs pull
```

Files: `magnus.glb`, `sofia.glb`, `arjun.glb`, `cc-female.glb` (Leila coach) plus matching `*-animations.glb` idle clips. The app loads them from `public/` by default (no external CDN required).

Menu headshots live in `public/coach-portraits/` (`magnus.png`, `sofia.png`, etc.). The coach picker uses pre-generated `*-thumb.png` files (192×192, Lanczos downscale). After replacing a portrait source image, regenerate thumbs:

```bash
npm run portraits:thumbs
```

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
npm run portraits:thumbs   # regenerate menu headshot thumbnails after changing coach-portraits/*.png
```

Uses `@convai/web-sdk@1.6.0-beta.1`.

## Environment

**Local Convai API key** — copy [`.env.convai.local.example`](.env.convai.local.example) to `.env.convai.local` and paste your key. This file is gitignored (via `.env.*`) and is what `npm run dev` uses (loaded in `vite.config.ts`). Do not put the Convai key in `.env`.

**Other local settings** — copy [`.env.example`](.env.example) to `.env` for Google sign-in (`VITE_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID`). Never commit `.env` or `.env.convai.local`.

```bash
cp .env.convai.local.example .env.convai.local   # then edit — Convai API key
cp .env.example .env                             # Google client ID, optional guest clones
```

`.env.convai.local` takes priority over a key in `.env` or `localStorage` when present.

### GitHub Actions secrets (Pages deploy)

The deploy workflow (`.github/workflows/deploy-pages.yml`) injects secrets at **build time** — they are not stored in the repo.

1. Regenerate your Convai API key in the [Convai dashboard](https://convai.com) (revoke the old one if it was ever committed).
2. Open your GitHub repo → **Settings** → **Secrets and variables** → **Actions**.
3. Click **New repository secret** and add:
   - `VITE_CONVAI_API_KEY` — your new Convai API key (required for deploy).
   - `VITE_GOOGLE_CLIENT_ID` — Google OAuth Web client ID (optional; enables sign-in on the deployed site).
4. Push to `master` or run the **Deploy GitHub Pages** workflow manually.

**Important:** `VITE_*` variables are embedded in the built JavaScript bundle. GitHub Secrets keep the key out of git history, but anyone who loads your public Pages site can still extract it from the client bundle. For a fully private key, serve short-lived [Convai auth tokens](https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/auth-tokens) from a backend instead of baking `VITE_CONVAI_API_KEY` into the frontend.

Optional local overrides:

```bash
# Optional: LTM-disabled Convai character clones for anonymous guests (one per builtin coach)
# VITE_CONVAI_GUEST_CHARACTER_LEILA=...

# Optional: override character GLB asset base URL (defaults to bundled public/ assets)
# VITE_CHARACTER_ASSET_BASE_URL=https://...
```

Builtin coach character IDs live in [src/coachConfig.ts](src/coachConfig.ts). Custom coaches are saved locally and merged into the menu via `getAllCoaches()`. Each builtin coach has `portraitFile` and optional `portraitFocusY` for menu crop alignment.

Recommended LLM for live coaching: **Gemini 2.5 Flash Lite** or **Claude 4 Sonnet** (configure in the Convai dashboard for each character).

## Code Map

| File | Role |
| --- | --- |
| [src/App.tsx](src/App.tsx) | Screens, game loop, chat drawer, API key modal, custom coach creator, turn/UI sound wiring |
| [src/MenuScreen.tsx](src/MenuScreen.tsx) | Menu, coach/difficulty pickers with headshot avatars, coaching control toggle, API key badge |
| [src/CoachCard.tsx](src/CoachCard.tsx) | Avatar card, `PortraitScene` canvas, adaptive DPR, chat toggle, mic slot, optional dataset button |
| [src/PortraitScene.tsx](src/PortraitScene.tsx) | Portrait lighting, environment map, optional bloom/vignette post-FX |
| [src/ReallusionCharacter.tsx](src/ReallusionCharacter.tsx) | GLB avatar, ARKit→CC4 lipsync, idle sanitization, procedural blink, jaw-bone motion |
| [src/cc4Lipsync.ts](src/cc4Lipsync.ts) | Per-asset lipsync profiles, morph mapping, Leila thin-lip / nostril-safe tuning |
| [src/cc4Correctives.ts](src/cc4Correctives.ts) | CC4 C_* corrective morph products (optional per profile) |
| [src/cc4TeethMotion.ts](src/cc4TeethMotion.ts) | Jaw / teeth / tongue bone motion (`jawOnly` mode for Leila) |
| [src/convaiLipsyncPlayer.ts](src/convaiLipsyncPlayer.ts) | Single-clock 60fps blendshape consume loop (Convai reference pattern) |
| [src/isMobilePortrait.ts](src/isMobilePortrait.ts) | Mobile GLES portrait rendering guards |
| [src/portraitBlink.ts](src/portraitBlink.ts) | Procedural eye-blink morph driver for idle + speech |
| [src/sanitizeIdleClip.ts](src/sanitizeIdleClip.ts) | Portrait-safe idle clip cleanup (bone root, head/eye lock) |
| [src/MicButton.tsx](src/MicButton.tsx) | Shared Convai microphone toggle |
| [src/useOverflowScroll.tsx](src/useOverflowScroll.tsx) | `ScrollWhenClipped` — enables scroll only when panel content overflows |
| [src/ChatDrawer.tsx](src/ChatDrawer.tsx) | Fixed bottom-right chat panel |
| [src/Tooltip.tsx](src/Tooltip.tsx) | Viewport-aware portal tooltips |
| [src/uiSounds.ts](src/uiSounds.ts) | Web Audio UI chimes (`tap`, `nav`, `back`, `confirm`, `toggle`, `send`, `yourTurn`) |
| [src/auth.ts](src/auth.ts) | Google identity mapping, stable guest `endUserId`, LTM gating |
| [src/convaiEndUsers.ts](src/convaiEndUsers.ts) | Convai end-user list/delete API helpers and MAU-limit detection |
| [src/convaiApiKey.ts](src/convaiApiKey.ts) | API key from localStorage + env fallback |
| [src/customCoaches.ts](src/customCoaches.ts) | localStorage for user-created coaches |
| [src/convaiManager.ts](src/convaiManager.ts) | Convai lifecycle, static policy, dynamic context, speech queue, lipsync |
| [src/convaiCoreApi.ts](src/convaiCoreApi.ts) | Convai REST helpers (voices, languages, character create/update) |
| [src/chessAi.ts](src/chessAi.ts) | Board context, coach instructions, Game-mode speech gating, welcome variety |
| [src/boardVision.ts](src/boardVision.ts) | Optional board canvas → LiveKit video track |
| [src/coachConfig.ts](src/coachConfig.ts) | Personas, difficulties, `getAllCoaches()` |
| [src/storage.ts](src/storage.ts) | Sessions, puzzle progress, `coachingControlMode` (default: `coach`) |
| [src/debugLog.ts](src/debugLog.ts) | Browser → `debug.log` via `/api/log` |
| [scripts/generate-coach-portrait-thumbs.mjs](scripts/generate-coach-portrait-thumbs.mjs) | Build 192×192 menu headshots from `public/coach-portraits/*.png` |

## Portrait & Lipsync

- **Idle animation** — `sanitizePortraitIdleClip()` locks `CC_Base_BoneRoot`, hip, spine, head, jaw, and eye bones; strips drifting eye translation so the coach faces the camera without hip sway or nostril flicker.
- **Blinking** — procedural `Eye_Blink_L/R` morphs on all face meshes (`portraitBlink.ts`); starts after the portrait is framed (not during GLB load).
- **Lipsync playback** — `convaiLipsyncPlayer.ts` drives ARKit frames through one 60fps `consumeFrames` clock (reference `useLipsyncPlayer` pattern), avoiding dual `getFrameAtTime` + tail paths that desynced mouth from audio.
- **CC4 mapping** — `cc4Lipsync.ts` maps ARKit to CC4 mouth morphs with per-asset `LIPSYNC_PROFILES`; brow/squint/cheek channels attenuated so TTS noise does not twitch the upper face.
- **Leila (`cc-female.glb`)** — jaw-bone rotation (not face `Jaw_Open` morphs), hidden oral meshes, blocked nose/funnel/tongue morphs on the face mesh, boosted lower-lip / `V_Lip_Open` drive for thin lips.
- **Rendering** — `PortraitScene` uses soft directional lights, `apartment` environment, ACES tone mapping (exposure 0.94), and light bloom/vignette on desktop. `CoachCard` raises canvas DPR up to 3× based on portrait window size. Mobile uses material downgrade via `isMobilePortrait()`.

## Coaching Control

| | **Coach mode** (default) | **Game mode** |
| --- | --- | --- |
| Who decides | Convai LLM every turn | Local `analyzeCoachMoveContext()` heuristics |
| Context | Full dynamic board info each turn | Same info, but LLM only invoked on teaching moments |
| Best for | Conversational, adaptive coaching | Quieter games with commentary on notable moments |

Puzzles and chat always use explicit scripted prompts.

### Coach move timing

The coach applies her Stockfish move **only after** TTS finishes. `runCoachTurn` uses `waitForFullSpeech: true` and `waitUntilSpeechFinished()` (SDK speaking state, blendshape queue, stuck-audio detection, and queue `getTimeLeftMs` / `isAllFramesConsumed`) so moves follow speech without a multi-second gap or premature cut-off. The status line avoids a post-speech “thinking” flash by holding `recentCoachSpeech` until the Convai turn completes.

### Welcome lines

Opening greetings use varied casual lines from `buildWelcomeDynamicInfo()`. During Quick Play, setup runs behind the loading overlay; the board reveals with a brief pause, then the welcome line plays so players are not hit with speech during the screen transition.

## Convai Integration

- Static coaching policy seeded once with `keepInContext: true`; per-turn updates send **dynamic board state only** (reduces prompt leak and latency).
- `updateContext({ mode: 'replace', run_llm })` for coach-decides turns; `updateDynamicInfo` for silent context refresh in Game mode.
- Prompt-leak responses starting with `Human:` / `System:` / `User:` are suppressed.
- **End-user identity:** signed-in Google users connect as `google:{sub}` with LTM memory writes; guests use a stable per-browser `guest:{uuid}` in `localStorage` (no app-side LTM writes). Game session ids remain separate for saved games.
- On Convai **MAU limit** errors, the app deletes known end users via the Convai API and retries connect once.
- New game: `resetSession` + context reset; welcome is delivered after loading peels (Quick Play) or inline on rematch.
- Game-over modal waits until the coach finishes speaking.

## Custom Coach Creator

1. Open **Custom Coach** from the menu (API key required).
2. Voices and languages load automatically; the voice list **filters to the selected language**.
3. Default model: `gemini-2.5-flash-lite` (Convai-supported model codes only).
4. On success, the coach is saved to localStorage and appears in the menu coach picker (Leila portrait placeholder by default).

## Google Sign-In (production)

The OAuth consent screen is configured as **External** and **published**, so any Google account can sign in (not limited to a Workspace org or manual test-user list). Users may still see Google's unverified-app warning until Google verification completes; they can proceed via **Advanced → Go to Classic Chess (unsafe)**. See [docs/google-convai-memory-tutorial.md](docs/google-convai-memory-tutorial.md) for Cloud Console setup and troubleshooting.

## Menu Coach Portraits

Builtin coaches reference PNG headshots under `public/coach-portraits/`. Config fields:

- `portraitFile` — full-resolution source (used as fallback for custom coaches)
- `portraitFocusY` — vertical crop focus (percent from top) when generating thumbs

The picker loads `getCoachPortraitThumbUrl()` (`*-thumb.png`). Regenerate after changing sources with `npm run portraits:thumbs` (uses `sharp` dev dependency).

## Debug Logging

`debugLog(scope, message)` → console + batched POST to `/api/log` → `debug.log` in the project root.

Useful lines: `[Convai] BOT READY`, `FINAL`, `Coach move applied`, `Published live board video track`, `coachingControlMode -> coach|game`.

Copy-log button in the game topbar copies the in-browser log buffer.

## References

- [docs/tutorial-series/](docs/tutorial-series/) - 4-part Convai tutorial outline with speaker notes and code references
- [docs/google-convai-memory-tutorial.md](docs/google-convai-memory-tutorial.md)
- [docs/coach_personas/](docs/coach_personas/)
- [docs/convai_web-sdk_documentation.md](docs/convai_web-sdk_documentation.md)
- [docs/technical-blog.md](docs/technical-blog.md)
