# Classic Chess

Classic Chess is a Convai-powered chess coaching app built with React, TypeScript, Vite, Stockfish, chess.js, Three.js, and React Three Fiber.

## What Is In The App

- Quick Play chess against a coach
- Puzzles with AI and hinting
- Saved sessions with replay
- Post-game analysis
- Local custom coach creator for Convai Core API
- Four coach personas: Magnus, Sofia, Arjun, and Leila

## Key Files

- App shell and screens: [src/App.tsx](/c:/Users/akshi/Downloads/playtika/Classic%20Chess/src/App.tsx)
- Coach configuration: [src/coachConfig.ts](/c:/Users/akshi/Downloads/playtika/Classic%20Chess/src/coachConfig.ts)
- Convai manager: [src/convaiManager.ts](/c:/Users/akshi/Downloads/playtika/Classic%20Chess/src/convaiManager.ts)
- Convai Core API helpers: [src/convaiCoreApi.ts](/c:/Users/akshi/Downloads/playtika/Classic%20Chess/src/convaiCoreApi.ts)
- Board prompts and analysis helpers: [src/chessAi.ts](/c:/Users/akshi/Downloads/playtika/Classic%20Chess/src/chessAi.ts)
- Persona files for manual Convai setup: [docs/coach_personas/](/c:/Users/akshi/Downloads/playtika/Classic%20Chess/docs/coach_personas)

## Convai Models

The model dropdown should stay aligned with the Convai Core AI Settings docs.

Current model codes in the app:
`gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-4o`, `gpt-4o-mini`, `claude-opus-4.1`, `claude-opus-4`, `claude-4-sonnet`, `claude-3-7-sonnet`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.0-flash`, `gemma-3n-e4b`, `gemma-3n-e2b`, `llama-4-maverick`, `llama-4-scout`, `llama-3-70B`.

## Run

```bash
npm install
npm run dev
```

## TTS Notation Convention

The coach speaks via Convai TTS. Raw chess notation sounds wrong when read aloud — `e4` is read as "uh 4" and `a-file` as "uh file". The prompt rules enforce:

- File letters are capitalized: `"the A file"`, `"the E file"`
- Square names separate letter from digit with a space: `"E 4"`, `"D 5"`
- Piece moves are spelled out: `"knight to F 3"`, `"bishop takes E 5"`

A capital letter makes TTS read it as the letter name rather than an article. These rules live in `buildCoachInstruction` and `buildDynamicCoachInfo` in [src/chessAi.ts](src/chessAi.ts). If a specific word still sounds wrong, add a custom pronunciation entry in the Convai platform dashboard.

## Notes For The Next Agent

- The plan tracker lives in [docs/chess_feedback_implementation_plan.md](/c:/Users/akshi/Downloads/playtika/Classic%20Chess/docs/chess_feedback_implementation_plan.md).
- GitHub Pages support was improved by setting Vite `base` to `./` and adding a local favicon.
