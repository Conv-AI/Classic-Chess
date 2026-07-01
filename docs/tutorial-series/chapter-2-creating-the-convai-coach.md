# Chapter 2: Creating the Convai Coach: Character, Persona, Voice, Context, and Vision

## Objective

- Explain coach setup.
- Cover dashboard character creation.
- Cover app-level coach config.
- Cover static policy.
- Cover dynamic context.
- Cover Vision Dynamic Context.
- Code refs:
  - Coach type/config: [`src/coachConfig.ts`](../../src/coachConfig.ts#L10)
  - Built-in coaches: [`src/coachConfig.ts`](../../src/coachConfig.ts#L98)
  - Static policy builder: [`src/chessAi.ts`](../../src/chessAi.ts#L729)
  - Dynamic context builder: [`src/chessAi.ts`](../../src/chessAi.ts#L519)
  - Board vision publisher: [`src/boardVision.ts`](../../src/boardVision.ts#L205)

> **Speaking notes**
>
> "This chapter is about how a Convai character becomes a coach in the app: dashboard character setup, local coach config, static coaching policy, live board context, and optional vision."

## System Layers

```text
Convai dashboard character
+ app coach config
+ static policy
+ dynamic board context
+ vision context
= in-game coach
```

- Code refs:
  - App coach config: [`src/coachConfig.ts`](../../src/coachConfig.ts#L10)
  - Static policy: [`src/chessAi.ts`](../../src/chessAi.ts#L729)
  - Dynamic context: [`src/chessAi.ts`](../../src/chessAi.ts#L519)
  - Vision session: [`src/boardVision.ts`](../../src/boardVision.ts#L319)

> **Speaking notes**
>
> "The coach is built from layers. The Convai dashboard defines the character, the app config maps that character to the chess product, static policy defines how the coach teaches, dynamic context tells Convai the current board, and vision provides a visual board signal."

## Convai Dashboard Setup

- Create one Convai character per built-in coach.
- Configure:
  - Name.
  - Backstory.
  - Voice.
  - Model.
  - Personality.
  - Speaking style.
  - Vision setting.
  - Memory setting.
  - Actions if needed.
- Dashboard output needed by app:
  - Character ID.
  - Voice/persona behavior.
  - Enabled features.
- Code refs:
  - Character IDs stored per coach: [`src/coachConfig.ts`](../../src/coachConfig.ts#L98)
  - Character ID selection for guest/signed-in paths: [`src/coachConfig.ts`](../../src/coachConfig.ts#L195)
  - Convai client uses `characterId`: [`src/convaiManager.ts`](../../src/convaiManager.ts#L338)

> **Speaking notes**
>
> "In the Convai dashboard, each coach starts as a separate character with its own voice, backstory, model settings, and enabled features. The app stores the returned character ID and uses it when creating the Convai client."

## Built-In Coaches

| Coach | Role | Focus | Default Use |
| --- | --- | --- | --- |
| Leila | Strategist | Plans, pawn structures, piece activity, slow advantages | Default coach |
| Arjun | Patient teacher | Basics, piece safety, opening principles, confidence | New/beginner |
| Sofia | Tactician | Checks, captures, threats, attacks, combinations | Intermediate/advanced |
| Magnus | Grandmaster | Sparse comments, positional play, conversion, endgames | Advanced/expert |

- Code refs:
  - Coach definitions: [`src/coachConfig.ts`](../../src/coachConfig.ts#L98)
  - Default coach is Leila: [`src/coachConfig.ts`](../../src/coachConfig.ts#L200)
  - Difficulty options: [`src/coachConfig.ts`](../../src/coachConfig.ts#L45)

> **Speaking notes**
>
> "Leila, Arjun, Sofia, and Magnus are not just different portraits. Each one maps to a different Convai character and a different teaching style. Leila is the default strategist, Arjun is beginner-friendly, Sofia is tactical, and Magnus is sparse and advanced."

## App Coach Config

- Per coach:
  - Convai character ID.
  - Model file.
  - Idle animation file.
  - Portrait image.
  - Accent color.
  - Difficulty range.
  - Voice style text.
  - Chess focus text.
  - Prompt style.
  - Hint style.
- Purpose:
  - Connect Convai character to app UI.
  - Connect Convai character to chess teaching behavior.
  - Connect Convai character to avatar assets.
- Code refs:
  - `CoachConfig` shape: [`src/coachConfig.ts`](../../src/coachConfig.ts#L10)
  - Built-in coach values: [`src/coachConfig.ts`](../../src/coachConfig.ts#L98)
  - Custom coaches converted into same shape: [`src/customCoaches.ts`](../../src/customCoaches.ts#L32)

> **Speaking notes**
>
> "The local coach config is the bridge between Convai and the game UI. It tells the app which Convai character to connect to, which avatar assets to load, which difficulty levels fit, and how to describe the coach's teaching style."

## Coach Is Not Just A Skin

- Different Convai character.
- Different voice.
- Different persona.
- Different teaching focus.
- Different prompt style.
- Different hint style.
- Different difficulty range.
- Different memory scope.
- Code refs:
  - Persona and hint style fields: [`src/coachConfig.ts`](../../src/coachConfig.ts#L98)
  - Prompt style injected in static policy: [`src/chessAi.ts`](../../src/chessAi.ts#L729)
  - Memory scope uses character plus end user: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1832)

> **Speaking notes**
>
> "Changing coaches changes the Convai character, the voice style, the prompt style, the hint style, the difficulty fit, and the memory scope. It is not only a visual swap."

## Static Policy

- Seed once.
- Keep stable across turns.
- Includes:
  - Coach name.
  - Coach title.
  - First-person POV.
  - Student/player relationship.
  - Difficulty level.
  - Curriculum.
  - Explanation depth.
  - Coach specialty.
  - Prompt style.
  - TTS notation rules.
  - Move-commentary rules.
  - Hint rules.
  - Chat rules.
- Code refs:
  - Static policy builder: [`src/chessAi.ts`](../../src/chessAi.ts#L729)
  - Static policy sent to Convai silently: [`src/convaiManager.ts`](../../src/convaiManager.ts#L545)
  - Game loop seeds policy before move coaching: [`src/App.tsx`](../../src/App.tsx#L930)

> **Speaking notes**
>
> "Static policy is the standing instruction set. It says who the coach is, how they speak, what level they are teaching, and how to format chess language for TTS. The app seeds it into Convai separately from the changing board context."

## Static Policy Details

- POV:
  - Coach says "I" for coach.
  - Coach says "you" for student.
  - Avoid "your opponent" for the student.
  - Avoid third-person references to the player.
- TTS notation:
  - Avoid: `e4`, `Nf3`, `Bxe5`, `a-file`.
  - Use: "E 4", "knight to F 3", "bishop takes E 5", "the A file".
- Coaching length:
  - Usually 1-2 sentences.
  - Short enough for spoken delivery.
- Teaching:
  - Match selected difficulty.
  - Name concrete chess concepts when the position supports them.
  - Avoid bland move narration.
- Code refs:
  - Pronoun and TTS rules: [`src/chessAi.ts`](../../src/chessAi.ts#L729)
  - Move-mode constraints: [`src/chessAi.ts`](../../src/chessAi.ts#L742)
  - Hint-mode constraints: [`src/chessAi.ts`](../../src/chessAi.ts#L765)
  - Chat-mode constraints: [`src/chessAi.ts`](../../src/chessAi.ts#L775)

> **Speaking notes**
>
> "The static policy handles repeated behavior rules: first-person coach voice, no inverted player/opponent language, spoken-friendly chess notation, and short teaching responses."

## Dynamic Context

- Built before coach speech.
- Replaced/refreshed during game.
- Gives Convai current game state.
- Code refs:
  - Dynamic context builder: [`src/chessAi.ts`](../../src/chessAi.ts#L519)
  - Built during coach move: [`src/App.tsx`](../../src/App.tsx#L928)
  - Pushed to Convai via `updateContext`: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1462)

> **Speaking notes**
>
> "Dynamic context is the live board packet. Before Convai speaks, the app summarizes the current position and replaces the context so the coach is grounded in the actual board."

## Dynamic Context Fields

- Coach identity.
- Coach teaching style.
- Student level.
- Curriculum.
- Whose turn.
- Position status:
  - Normal.
  - Check.
  - Checkmate.
  - Draw.
  - Stalemate.
- FEN.
- Recent move history.
- Latest move.
- Legal move count.
- Material balance.
- Tactical summary:
  - Checks.
  - Captures.
  - Promotions.
  - Loose pieces.
  - Defended pieces.
  - Undefended pieces.
  - King safety.
  - Pawn shield changes.
- Planned coach move from Stockfish.
- Recent topics to avoid repeating.
- Code refs:
  - Field assembly: [`src/chessAi.ts`](../../src/chessAi.ts#L519)
  - Tactical/context facts: [`src/chessAi.ts`](../../src/chessAi.ts#L145)
  - Planned move description: [`src/chessAi.ts`](../../src/chessAi.ts#L798)
  - Recent topic suppression in game loop: [`src/App.tsx`](../../src/App.tsx#L927)

> **Speaking notes**
>
> "The dynamic context includes FEN, whose turn it is, recent history, the latest move, legal move count, material, tactical facts, the coach identity, the student level, and the coach's planned Stockfish move."

## Problems Dynamic Context Solves

- Board state accuracy.
- Current-turn accuracy.
- Piece ownership.
- Check ownership.
- Capture ownership.
- Avoiding stale commentary.
- Avoiding invented tactics.
- Avoiding wrong "you/I" attribution.
- TTS-friendly chess language.
- Code refs:
  - Role context and ownership text: [`src/chessAi.ts`](../../src/chessAi.ts#L532)
  - Attribution cheatsheet: [`src/chessAi.ts`](../../src/chessAi.ts#L687)
  - Current check ownership: [`src/chessAi.ts`](../../src/chessAi.ts#L826)
  - Move ownership helper: [`src/chessAi.ts`](../../src/chessAi.ts#L809)

> **Speaking notes**
>
> "The context prevents common LLM errors: swapping who captured what, saying the wrong side is in check, reacting to an old move, or inventing tactics that are not on the board."

## Latest Move Anchor

- Explicitly marks latest move.
- Recent history is background.
- Latest move is current discussion target.
- Use cases:
  - Prevent old castling praise.
  - Prevent commenting on a move from several turns ago.
  - Prevent stale tactical commentary.
- Code refs:
  - Latest move anchor builder: [`src/chessAi.ts`](../../src/chessAi.ts#L646)
  - Dynamic context includes latest anchor: [`src/chessAi.ts`](../../src/chessAi.ts#L554)

> **Speaking notes**
>
> "The latest move anchor is a guardrail. It tells Convai exactly which move just happened, so the coach does not praise or critique something from the older move history."

## Attribution Rules

- Student = White.
- Coach = Black.
- "You" = student.
- "I" = coach.
- If student gives check:
  - Coach should say "I am in check."
  - Coach should not say "you are in check."
- If coach has a capture:
  - Coach should say "I can take..."
  - Coach should not say "you can take..."
- Code refs:
  - Move ownership helper: [`src/chessAi.ts`](../../src/chessAi.ts#L809)
  - Check ownership helper: [`src/chessAi.ts`](../../src/chessAi.ts#L826)
  - Attribution cheatsheet: [`src/chessAi.ts`](../../src/chessAi.ts#L687)

> **Speaking notes**
>
> "The app writes context from the coach's point of view. The student is White, the coach is Black, 'you' means the student, and 'I' means the coach."

## Context Update Modes

- Silent refresh:
  - Update context.
  - No speech.
  - Used for routine positions.
- Forced response:
  - Update context.
  - Require speech.
  - Used for welcome, hints, chat, game over.
- Auto response:
  - Update context.
  - Convai decides whether to speak.
  - Used in Coach mode.
- Code refs:
  - Silent context update: [`src/convaiManager.ts`](../../src/convaiManager.ts#L710)
  - Forced/user message speech path: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1511)
  - Auto context turn: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1470)
  - Game loop mode split: [`src/App.tsx`](../../src/App.tsx#L934)

> **Speaking notes**
>
> "The same context system supports three modes: silent refresh, forced speech, and auto speech where Convai decides whether to answer."

## `run_llm` Concept

- `false`:
  - Replace/update context silently.
- `true`:
  - Trigger response.
- `auto`:
  - Let Convai decide whether response is needed.
- Code refs:
  - Type definition: [`src/convaiManager.ts`](../../src/convaiManager.ts#L44)
  - Context push with `run_llm`: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1462)
  - Coach mode uses `auto`: [`src/App.tsx`](../../src/App.tsx#L934)
  - Game mode forced speech uses `true`: [`src/App.tsx`](../../src/App.tsx#L962)

> **Speaking notes**
>
> "`run_llm` is the switch. False updates silently, true forces a response, and auto lets Convai decide if the context deserves a response."

## Vision Dynamic Context

- App renders board to canvas.
- App publishes canvas to Convai video controls.
- Vision frames sent silently.
- Text context still carries exact chess facts.
- Code refs:
  - Render from DOM: [`src/boardVision.ts`](../../src/boardVision.ts#L74)
  - Render from FEN: [`src/boardVision.ts`](../../src/boardVision.ts#L117)
  - Capture stream: [`src/boardVision.ts`](../../src/boardVision.ts#L196)
  - Publish canvas: [`src/boardVision.ts`](../../src/boardVision.ts#L205)
  - Convai client video/vision config: [`src/convaiManager.ts`](../../src/convaiManager.ts#L338)

> **Speaking notes**
>
> "The demo also publishes the board as visual context. The app renders the board to a canvas and sends that canvas into the Convai session, while text context still carries the exact chess facts."

## Vision Flow

```text
Board DOM or FEN
-> offscreen canvas
-> Convai video controls
-> silent visual context
-> character receives board view
```

- Code refs:
  - Canvas update from FEN: [`src/boardVision.ts`](../../src/boardVision.ts#L262)
  - `publishCanvas` call: [`src/boardVision.ts`](../../src/boardVision.ts#L296)
  - Ensure/retry board vision: [`src/boardVision.ts`](../../src/boardVision.ts#L319)
  - Manager ensures board vision after bot ready: [`src/convaiManager.ts`](../../src/convaiManager.ts#L744)

> **Speaking notes**
>
> "The vision flow is board to canvas, canvas to Convai, and silent visual context alongside the text context."

## Vision Setup Notes

- Enable vision on Convai character.
- App-side canvas publishing alone is not enough.
- Use vision with text context, not as a replacement for FEN/tactical facts.
- Code refs:
  - Vision config in client: [`src/convaiManager.ts`](../../src/convaiManager.ts#L346)
  - Vision response mode silent: [`src/convaiManager.ts`](../../src/convaiManager.ts#L352)
  - Board vision publish guard: [`src/boardVision.ts`](../../src/boardVision.ts#L212)

> **Speaking notes**
>
> "Vision has to be enabled on the Convai character, and the app also has to publish the canvas. In this demo, vision is a companion signal; FEN and tactical text stay authoritative."

## Talking Point: Text Context Versus Vision

- Text context:
  - Precise.
  - Best for FEN, legal moves, exact tactics.
- Vision context:
  - Visual state.
  - Pattern for object/scene/UI awareness.
- In this demo:
  - Both are used.
  - Text remains authoritative for chess facts.
- Code refs:
  - Text context builder: [`src/chessAi.ts`](../../src/chessAi.ts#L519)
  - Board vision canvas: [`src/boardVision.ts`](../../src/boardVision.ts#L205)

> **Speaking notes**
>
> "For chess, structured text is still the precise source of truth. Vision shows how Convai can also receive a visual view of the app state."

## References

- Convai Web SDK:
  - https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk
- Code refs:
  - Local Web SDK reference: [`docs/convai_web-sdk_documentation.md`](../convai_web-sdk_documentation.md#L1)
  - Technical blog context section: [`docs/technical-blog.md`](../technical-blog.md#L50)

> **Speaking notes**
>
> "For this chapter, the relevant references are the Convai Web SDK docs, the local SDK reference, and the code paths for coach config, context, and board vision."
