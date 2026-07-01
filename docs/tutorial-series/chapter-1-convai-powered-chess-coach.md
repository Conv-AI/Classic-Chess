# Convai Powered Chess Coach

## Objective

- Introduce the demo.
- Show Convai inside the actual game loop.
- Establish app/Convai responsibility split.
- Preview chapters 2-4.
- Clarify Convai actions.
- Code refs:
  - Built-in coaches and default Leila: [`src/coachConfig.ts`](../../src/coachConfig.ts#L98)
  - Quick Play start path: [`src/App.tsx`](../../src/App.tsx#L321)
  - Convai connection manager: [`src/convaiManager.ts`](../../src/convaiManager.ts#L210)

> **Speaking notes**
>
> "This first chapter is the overview. I am showing Classic Chess as a Convai demo: a playable chess coach where Convai is connected to game state, voice, chat, mic, memory, vision, and the 3D avatar."

## Demo Sequence

- Open Classic Chess menu.
- Show coach picker:
  - Leila.
  - Arjun.
  - Sofia.
  - Magnus.
  - Custom coaches if available.
- Select Leila.
- Start Quick Play.
- Loading sequence:
  - 3D portrait loads.
  - Convai connects to selected character.
  - Game prepares board state.
  - Welcome context is prepared.
- Board appears.
- Coach welcome line plays.
- Player makes first move as White.
- Coach responds as Black.
- Show coach card:
  - 3D avatar.
  - Spoken line.
  - Caption text.
  - Chat button.
  - Mic toggle.
  - Sign-in/memory path.
- Code refs:
  - Coach list and Leila default: [`src/coachConfig.ts`](../../src/coachConfig.ts#L98)
  - Start Quick Play: [`src/App.tsx`](../../src/App.tsx#L321)
  - Welcome context builder: [`src/chessAi.ts`](../../src/chessAi.ts#L621)
  - Begin new Convai game/session: [`src/convaiManager.ts`](../../src/convaiManager.ts#L780)
  - Coach card/avatar entry: [`src/CoachCard.tsx`](../../src/CoachCard.tsx#L243)

> **Speaking notes**
>
> "I will start from the menu, pick Leila, and start Quick Play. While loading, the app prepares the avatar, connects to the Convai character, and builds the first board context. When the board appears, the same Convai character gives the welcome line and then responds during the game."

## Demo Claim

- Convai is not shown as a side chat widget.
- Convai is integrated into:
  - Game state.
  - Coach identity.
  - Spoken feedback.
  - Chat.
  - Mic.
  - Memory.
  - Avatar lipsync.
  - Visual board context.
- Code refs:
  - Dynamic board context: [`src/chessAi.ts`](../../src/chessAi.ts#L519)
  - Chat path: [`src/convaiManager.ts`](../../src/convaiManager.ts#L675)
  - Mic toggle: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1369)
  - Board vision: [`src/boardVision.ts`](../../src/boardVision.ts#L205)
  - Lipsync frame path: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1318)

> **Speaking notes**
>
> "The point is that Convai is embedded into the product. The coach is connected to the board state, not sitting outside the app. The same Convai character handles spoken coaching, chat, mic input, memory, vision context, and the avatar's lipsync."

## App Responsibilities

- Legal chess rules.
- Move validation.
- Board state.
- FEN.
- Move history.
- Difficulty.
- Tactical facts.
- Stockfish coach move.
- Applying the coach move to the board.
- Saved games and UI state.
- Code refs:
  - Player move validation and history update: [`src/App.tsx`](../../src/App.tsx#L901)
  - Stockfish coach move selection: [`src/App.tsx`](../../src/App.tsx#L922)
  - Coach move application: [`src/App.tsx`](../../src/App.tsx#L983)
  - Difficulty settings: [`src/coachConfig.ts`](../../src/coachConfig.ts#L45)
  - Tactical/speech analysis: [`src/chessAi.ts`](../../src/chessAi.ts#L145)

> **Speaking notes**
>
> "The chess app stays authoritative for the board. It validates moves, keeps the FEN and history, asks Stockfish for the coach move, and applies the final board mutation."

## Convai Responsibilities

- Coach persona.
- In-character response.
- Spoken coaching.
- Text chat.
- Mic conversation.
- Live transcription.
- TTS.
- Audio playback.
- Blendshape/lipsync data.
- Long-term memory through stable `endUserId`.
- Vision context from board canvas.
- Actions support:
  - Convai supports actions.
  - Web SDK supports `actionConfig`.
  - Convai Action API supports actions, objects, characters.
  - Products can use Convai action responses to trigger in-app behavior.
- Demo-specific decision:
  - Board moves stay in app logic for deterministic chess legality.
- Code refs:
  - Convai client setup: [`src/convaiManager.ts`](../../src/convaiManager.ts#L338)
  - Message and streamed text handling: [`src/convaiManager.ts`](../../src/convaiManager.ts#L360)
  - `AudioRenderer`: [`src/convaiManager.ts`](../../src/convaiManager.ts#L510)
  - User transcription event: [`src/convaiManager.ts`](../../src/convaiManager.ts#L479)
  - Memory write helper: [`src/convaiManager.ts`](../../src/convaiManager.ts#L720)
  - Profile memory helper: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1832)
  - Local Convai docs for `actionConfig`: [`docs/convai_web-sdk_documentation.md`](../convai_web-sdk_documentation.md#L1405)
  - Coach move application after Convai turn: [`src/App.tsx`](../../src/App.tsx#L983)

> **Speaking notes**
>
> "Convai handles the coach side: persona, generated response, speech, chat, mic transcription, audio playback, lipsync frames, memory, and visual context. Convai can also drive actions through actionConfig and the Action API, but in this demo board moves stay in app logic so chess legality stays deterministic."

## Runtime Flow

```text
Player move
-> app validates move
-> Stockfish selects coach move
-> app builds context
-> app sends context to Convai
-> Convai responds or stays silent
-> TTS and lipsync play
-> app applies coach move
```

- Code refs:
  - Player move: [`src/App.tsx`](../../src/App.tsx#L901)
  - Coach move function: [`src/App.tsx`](../../src/App.tsx#L918)
  - Dynamic context build: [`src/App.tsx`](../../src/App.tsx#L928)
  - Coach mode Convai turn: [`src/App.tsx`](../../src/App.tsx#L934)
  - Game mode Convai turn/silent refresh: [`src/App.tsx`](../../src/App.tsx#L958)
  - Coach move application: [`src/App.tsx`](../../src/App.tsx#L983)

> **Speaking notes**
>
> "The turn flow is: player move, app validation, Stockfish reply, dynamic context, Convai turn, voice and lipsync, then the app applies the coach move."

## Convai Features Shown In Chapter 1

- Character selection.
- Convai character connection.
- Spoken welcome.
- Turn commentary.
- Chat.
- Mic.
- Memory/sign-in.
- Reallusion avatar.
- Lipsync.
- Vision context.
- Actions support, conceptually.
- Code refs:
  - Coach config: [`src/coachConfig.ts`](../../src/coachConfig.ts#L98)
  - Convai session setup: [`src/convaiManager.ts`](../../src/convaiManager.ts#L317)
  - Welcome flow: [`src/convaiManager.ts`](../../src/convaiManager.ts#L842)
  - Chat: [`src/App.tsx`](../../src/App.tsx#L1061)
  - Mic button: [`src/MicButton.tsx`](../../src/MicButton.tsx#L20)
  - Avatar component: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L170)
  - Board vision: [`src/boardVision.ts`](../../src/boardVision.ts#L205)

> **Speaking notes**
>
> "In the overview I will call out the specific Convai features visible in the demo: character connection, TTS, streamed text, chat, mic, memory, vision, lipsync, and action support."

## Chapter Map

- Chapter 2:
  - Convai dashboard character creation.
  - Built-in coach personas.
  - Static policy.
  - Dynamic context.
  - Vision Dynamic Context.
- Chapter 3:
  - Live turn loop.
  - Coach mode.
  - Game mode.
  - Hints.
  - Chat.
  - Mic.
  - TTS.
  - Audio.
  - Lipsync.
  - Avatar rendering.
- Chapter 4:
  - Guest identity.
  - Google sign-in.
  - Convai sign-in.
  - Long-term memory.
  - Custom coaches.
  - Core API.
  - Auth tokens.
- Code refs:
  - Chapter 2 context/policy: [`src/chessAi.ts`](../../src/chessAi.ts#L519)
  - Chapter 3 live interaction: [`src/App.tsx`](../../src/App.tsx#L918)
  - Chapter 4 identity/memory: [`src/auth.ts`](../../src/auth.ts#L41)

> **Speaking notes**
>
> "After the overview, I will go into setup, runtime interaction, and personalization. That gives the team a complete picture of how the Convai demo is put together."

## Reallusion References

- External setup resources:
  - https://www.youtube.com/watch?v=5tYyeXPo5vg
  - https://convai.com/blog/bring-ai-online-with-reallusion-avatars-using-threejs-react
- Positioning:
  - These cover creating/exporting Reallusion characters for web.
  - This tutorial covers connecting those characters to live Convai app state.
- Code refs:
  - Reallusion runtime component: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L170)
  - Idle cleanup: [`src/sanitizeIdleClip.ts`](../../src/sanitizeIdleClip.ts#L93)
  - Lipsync mapping: [`src/cc4Lipsync.ts`](../../src/cc4Lipsync.ts#L495)

> **Speaking notes**
>
> "For character creation and export, I will point people to Convai's Reallusion tutorial. In this series I am focusing on the app integration: loading the character, connecting it to Convai, and driving voice and lipsync."

## References

- Convai Web SDK:
  - https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk
- Convai Action API:
  - https://docs.convai.com/api-docs/api-reference/core-api-reference/character-crafting-apis/action-api
- Reallusion video:
  - https://www.youtube.com/watch?v=5tYyeXPo5vg
- Reallusion article:
  - https://convai.com/blog/bring-ai-online-with-reallusion-avatars-using-threejs-react
- Code refs:
  - Local Convai SDK docs: [`docs/convai_web-sdk_documentation.md`](../convai_web-sdk_documentation.md#L1)
  - Technical blog: [`docs/technical-blog.md`](../technical-blog.md#L1)

> **Speaking notes**
>
> "I will keep these references available for viewers who want the official SDK details, action docs, and Reallusion setup path."
