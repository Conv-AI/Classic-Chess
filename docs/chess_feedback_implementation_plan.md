# Chess Feedback Implementation Checklist

## Status Legend
- Coded: feature has been implemented in the app.
- Browser Tested by Me: Akshi tested it manually in the browser.
- Works for Me: Akshi confirmed it works.
- Broken Feedback: what failed during manual testing.
- Fix Given: summary of the code/change provided to fix that failure.
- Retest Result: whether the next manual test passed.

## Feature Checklist

| Feature | Coded | Browser Tested by Me | Works for Me | Broken Feedback | Fix Given | Retest Result | Notes |
|---|---|---|---|---|---|---|---|
| Mode separation: Quick Play / Puzzles / My Games / Custom Coach | [x] | [ ] | [ ] |  |  |  | Menu now routes to all four surfaces. |
| Coach selection: Magnus, Sofia, Arjun, Leila | [x] | [ ] | [ ] |  |  |  | Uses poker GLB assets under chess coach names. |
| Poker avatar/lip-sync reuse | [x] | [ ] | [ ] |  |  |  | Includes teeth motion and per-character profiles. |
| Stockfish skill selector | [x] | [ ] | [ ] |  |  |  | New, Beginner, Intermediate, Advanced, Expert. |
| Commentary redesign | [x] | [ ] | [ ] |  |  |  | Focuses prompts on player moves and key moments. |
| Three-level hint system | [x] | [ ] | [ ] |  |  |  | Tracks hints per game. |
| Session persistence | [x] | [ ] | [ ] |  |  |  | localStorage v1. |
| My Games replay viewer | [x] | [ ] | [ ] |  |  |  | Step through moves and jump by notation. |
| Post-game analysis | [x] | [ ] | [ ] |  |  |  | Accuracy, key moments, tips, opening. |
| Puzzles with AI | [x] | [ ] | [ ] |  |  |  | Puzzle bank, points, hints. |
| Custom coach creator | [x] | [ ] | [ ] |  |  |  | Local-only Convai Core API demo. |
| Coach persona text files | [x] | [ ] | [ ] |  |  |  | Copy manually into Convai account. |

## Bug / Fix Log

### Feature:
- Broken Feedback:
- Fix Given:
- Files Changed:
- Retest Result:
- Notes:

### Feature: Coach persona files and Convai character IDs
- Broken Feedback: Persona files were split into several small sections, and the app still used the old poker Convai character IDs.
- Fix Given: Rewrote each persona file into one Backstory block and one Speaking Style block with actor-friendly direction. Updated the four chess coach configs to use the new Convai character IDs.
- Files Changed: `docs/coach_personas/*.txt`, `src/coachConfig.ts`
- Retest Result:
- Notes: Male IDs are assigned to Magnus and Arjun. Female IDs are assigned to Sofia and Leila.

### Feature: One active coach per match
- Broken Feedback: The manager could keep previously selected coach sessions connected after switching coaches on a later match.
- Fix Given: `connectCoach` now disconnects every non-selected coach before connecting or reusing the selected coach, keeping one active Convai coach session for the match.
- Files Changed: `src/convaiManager.ts`
- Retest Result:
- Notes: The player still chooses a different coach from the menu before the next Quick Play round.

### Feature: UI polish and interaction fixes
- Broken Feedback: Piece selection did not switch cleanly, setup/replay/game layouts had excess empty space or overlap, puzzle mode felt sparse and lacked the coach avatar, review buttons used raw text symbols, custom coach dropdown colors were inconsistent, the browser tab had no favicon, and the loading screen could finish before the avatar rendered.
- Fix Given: Clicking another friendly piece now switches selection immediately. Main menu, game, puzzle, and review layouts are vertically centered and replay columns are constrained. Puzzle mode now includes the active coach window and cycles the full puzzle set when a difficulty has too few puzzles. Review controls use Lucide icon buttons. Select options inherit the dark theme. Added a favicon and a hidden avatar prewarm during loading so the game opens after the coach portrait has mounted.
- Files Changed: `src/App.tsx`, `src/styles.css`, `src/puzzles.ts`, `src/DanielleCoach.tsx`, `src/ReallusionCharacter.tsx`, `src/LoadingScreen.tsx`, `index.html`, `public/favicon.svg`, `vite.config.ts`, `package.json`
- Retest Result:
- Notes: Vite `base: './'` was added for GitHub Pages relative asset paths.

### Feature: Coach answer quality and first-person teaching
- Broken Feedback: Coaches sounded like third-person narrators and gave generic, low-value lines instead of grounded chess instruction.
- Fix Given: Rewrote persona files as first-person chess professor actor direction with concrete study topics. Added difficulty curriculum and explanation depth to the runtime dynamic info. Move, hint, and chat prompts now explicitly require "I/you" speech, forbid "the player/they/the coach", and ask for level-appropriate chess-class explanations referencing real concepts.
- Files Changed: `docs/coach_personas/*.txt`, `src/coachConfig.ts`, `src/chessAi.ts`, `src/App.tsx`, `src/convaiManager.ts`, `src/chessAi.test.ts`
- Retest Result:
- Notes: Local debug log was not present, so the fix targeted the prompt paths that generate the live Convai requests.

### Feature: Convai model dropdown completeness
- Broken Feedback: The LLM model section only exposed a small subset of the Convai Core AI Settings models.
- Fix Given: Expand the model option list to include every supported model currently listed in the Convai Core AI Settings API: GPT-4.1, GPT-4.1-mini, GPT-4.1-nano, GPT-4o, GPT-4o-mini, Claude-Opus-4.1, Claude-Opus-4, Claude-4-Sonnet, Claude-3.7-Sonnet, Gemini-2.5-Flash, Gemini-2.5-Flash-Lite, Gemini-2.0-Flash, Gemma-3n-e4b, Gemma-3n-e2b, Llama-4-Maverick, Llama-4-Scout, and Llama-3.3-70B.
- Files Changed: `src/convaiCoreApi.ts`
- Retest Result:
- Notes: Keep the UI list aligned with the Convai docs source of truth.

### Feature: Puzzle screen layout and audio playback
- Broken Feedback: The puzzle screen felt off-center, the left side was not grouped like a proper coach column, and voice replies were arriving as text without audio.
- Fix Given: Document the desired fix path for the next pass: move the coach window and puzzle hint card into a left column and keep the board in a right column, then inspect the Convai logs to determine why audio playback is missing despite text responses.
- Files Changed:
- Retest Result:
- Notes: This is a follow-up item for the next agent rather than a runtime patch in this turn.
