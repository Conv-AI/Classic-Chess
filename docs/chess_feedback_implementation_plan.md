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
