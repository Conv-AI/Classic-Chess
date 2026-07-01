# Chapter 3: Live Interaction: Coaching, Chat, Mic, Voice, Lipsync, and Avatar Presence

## Objective

- Explain the live Convai runtime after a game starts.
- Cover:
  - Player move to Convai coaching moment.
  - Coach mode.
  - Game mode.
  - Hints.
  - Chat.
  - Mic.
  - Response streaming.
  - TTS.
  - `AudioRenderer`.
  - Speech completion timing.
  - Convai blendshape/lipsync data.
  - Reallusion avatar performance.
- Keep the focus on Convai feature flow.
- Keep chess logic secondary.
- Code refs:
  - Player move entry: [`src/App.tsx`](../../src/App.tsx#L901)
  - Coach move entry: [`src/App.tsx`](../../src/App.tsx#L924)
  - Convai turn runner: [`src/convaiManager.ts`](../../src/convaiManager.ts#L555)
  - Avatar component: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L170)

> **Speaking notes**
>
> "This chapter covers the live interaction loop: how a move becomes a Convai coaching moment, how the same character handles hints, chat, mic, voice, lipsync, and how the Reallusion avatar turns Convai output into a visible performance."

## Main Turn Flow

```text
Player move
-> app validates move
-> app selects coach move
-> app builds dynamic context
-> app updates Convai
-> Convai responds, stays silent, or waits for a user prompt
-> TTS/audio/lipsync run
-> app applies coach move
```

- App remains authoritative for board mutation.
- Convai remains authoritative for character response.
- Dynamic context is the handoff between the two systems.
- Code refs:
  - Player move validation: [`src/App.tsx`](../../src/App.tsx#L901)
  - Coach move selection/context build: [`src/App.tsx`](../../src/App.tsx#L924)
  - Dynamic context builder: [`src/chessAi.ts`](../../src/chessAi.ts#L519)
  - Convai context turn: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1470)
  - Coach move application: [`src/App.tsx`](../../src/App.tsx#L983)

> **Speaking notes**
>
> "The runtime handoff is simple: the app validates the chess move and builds the truth packet; Convai turns that packet into coach behavior; the app applies the board move after the character moment has completed."

## Player Move To Convai Moment

- Player plays White.
- Coach plays Black.
- App validates the move against chess rules.
- App records move history.
- App asks the engine for the coach reply.
- App builds dynamic context that includes:
  - Current FEN.
  - Last player move.
  - Planned coach move.
  - Tactical facts.
  - Recent topics.
  - Difficulty.
  - Coach identity.
- Convai receives the current board context before speaking.
- Code refs:
  - Player move function: [`src/App.tsx`](../../src/App.tsx#L901)
  - Coach move function: [`src/App.tsx`](../../src/App.tsx#L924)
  - Recent topic tracking: [`src/App.tsx`](../../src/App.tsx#L927)
  - Context construction during coach turn: [`src/App.tsx`](../../src/App.tsx#L928)
  - Tactical analysis: [`src/chessAi.ts`](../../src/chessAi.ts#L145)

> **Speaking notes**
>
> "A player move is not sent to Convai as a vague event. The app converts it into a full board snapshot: FEN, history, tactical analysis, difficulty, the coach persona, and the coach's planned move."

## Coach Move Timing

- Coach move is selected before Convai speaks.
- Coach move is applied after the speech window.
- Reason:
  - The response should feel intentional.
  - The board should not change in the middle of a sentence.
  - The student should hear the idea before seeing the reply move.
- Timing depends on:
  - TTS state.
  - Audio playback.
  - Blendshape queue.
  - Maximum speech wait budget.
- Code refs:
  - Coach move selected before Convai turn: [`src/App.tsx`](../../src/App.tsx#L924)
  - Coach mode Convai turn: [`src/App.tsx`](../../src/App.tsx#L934)
  - Game mode Convai turn: [`src/App.tsx`](../../src/App.tsx#L958)
  - Board move applied after response path: [`src/App.tsx`](../../src/App.tsx#L983)
  - Speech wait helper: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1166)

> **Speaking notes**
>
> "The move is known before the coach talks, but the board waits. That timing makes the coach feel like they are explaining or reacting deliberately, instead of the game jumping ahead during the spoken line."

## Coach Mode

- Convai receives full board context every turn.
- `run_llm` is set to `auto`.
- Convai decides whether the position deserves a response.
- Valid outcomes:
  - Spoken coaching.
  - Text caption update.
  - No-response event.
  - Silent turn.
- Best for:
  - Adaptive pacing.
  - Letting Convai judge teaching moments.
  - Showing Convai as an active coach.
- Code refs:
  - Coach mode branch: [`src/App.tsx`](../../src/App.tsx#L934)
  - `runCoachTurn`: [`src/convaiManager.ts`](../../src/convaiManager.ts#L555)
  - Auto context turn: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1470)
  - `llmNoResponse` listener: [`src/convaiManager.ts`](../../src/convaiManager.ts#L487)

> **Speaking notes**
>
> "In Coach mode, the app gives Convai the full board context and uses auto response mode. Convai can speak when there is something useful to say, or stay silent when the turn does not need coaching."

## Game Mode

- App decides when speech should happen.
- Convai still receives context updates.
- App looks for teaching moments:
  - Captures.
  - Checks.
  - Promotions.
  - Hanging pieces.
  - Major tactical swings.
  - King safety changes.
  - Pawn shield movement.
  - Opening-development issues.
  - Repeated piece moves.
- Routine positions use silent context refresh.
- Best for:
  - Quieter pacing.
  - More app-controlled speaking cadence.
- Code refs:
  - Game mode branch: [`src/App.tsx`](../../src/App.tsx#L958)
  - Silent refresh path: [`src/App.tsx`](../../src/App.tsx#L996)
  - Context update helper: [`src/convaiManager.ts`](../../src/convaiManager.ts#L710)
  - Tactical analysis source: [`src/chessAi.ts`](../../src/chessAi.ts#L145)

> **Speaking notes**
>
> "In Game mode, the app is stricter about pacing. Convai still stays current through silent context refreshes, but the app only asks for speech when the position has a clear teaching moment."

## Silence

- Silence is a valid Convai outcome.
- Routine positions can update context without generating speech.
- No-response should not be treated as an error.
- Silence keeps the game playable.
- Silence prevents the coach from narrating every move.
- Line to use:

```text
Silence is part of the pacing model, not a failure state.
```

- Code refs:
  - `llmNoResponse` state: [`src/convaiManager.ts`](../../src/convaiManager.ts#L67)
  - `llmNoResponse` event listener: [`src/convaiManager.ts`](../../src/convaiManager.ts#L487)
  - Silent context update: [`src/convaiManager.ts`](../../src/convaiManager.ts#L710)
  - Silent refresh in Game mode: [`src/App.tsx`](../../src/App.tsx#L996)

> **Speaking notes**
>
> "The demo treats silence as a design feature. Convai can receive the latest state and still not speak, which keeps the coach from becoming constant narration."

## Hints

- User-initiated.
- Uses current board context.
- Uses candidate/best move data from app logic.
- Convai explains the hint in the selected coach voice.
- Hint levels:
  - Level 1: broad direction.
  - Level 2: motif or concept.
  - Level 3: direct move guidance.
- App controls:
  - Hint count.
  - Board state.
  - Candidate move source.
  - Reveal progression.
- Convai controls:
  - Natural explanation.
  - Persona-specific phrasing.
  - Spoken delivery.
- Code refs:
  - Hint action: [`src/App.tsx`](../../src/App.tsx#L1024)
  - Hint button wiring: [`src/App.tsx`](../../src/App.tsx#L1386)
  - Hint prompt policy: [`src/chessAi.ts`](../../src/chessAi.ts#L765)
  - Forced speech helper: [`src/convaiManager.ts`](../../src/convaiManager.ts#L624)

> **Speaking notes**
>
> "Hints are explicit user-driven Convai turns. The app chooses the hint level and supplies the position; Convai turns that into a coach-specific explanation."

## Chat

- User-initiated.
- Uses same Convai character.
- Uses same session pipeline.
- App sends current context before the question.
- Chat can answer:
  - "Why did you play that?"
  - "What should I look for?"
  - "Was my last move a mistake?"
  - "What is the plan?"
- Chat answer should stay tied to current board context.
- Code refs:
  - Chat action: [`src/App.tsx`](../../src/App.tsx#L1061)
  - Chat UI send wiring: [`src/App.tsx`](../../src/App.tsx#L1337)
  - Chat manager method: [`src/convaiManager.ts`](../../src/convaiManager.ts#L675)
  - Context-before-question comment: [`src/convaiManager.ts`](../../src/convaiManager.ts#L685)
  - Chat prompt policy: [`src/chessAi.ts`](../../src/chessAi.ts#L775)

> **Speaking notes**
>
> "Chat is not a separate bot. It is the same Convai coach, with the current board context refreshed before the question is sent."

## Mic

- User explicitly toggles mic.
- Convai Web SDK handles live voice input.
- App listens for transcription changes.
- Spoken user questions can enter the same character session.
- Mic starts off.
- Use case:
  - Player asks a question verbally during the game.
- Code refs:
  - Mic button component: [`src/MicButton.tsx`](../../src/MicButton.tsx#L20)
  - Mic toggle manager method: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1369)
  - User transcription listener: [`src/convaiManager.ts`](../../src/convaiManager.ts#L479)
  - Mic UI entry in coach card: [`src/CoachCard.tsx`](../../src/CoachCard.tsx#L68)

> **Speaking notes**
>
> "Mic input uses the same Convai session. When the user turns the mic on, the Web SDK provides transcription events, and the player can talk to the coach instead of typing."

## Same Character Session

```text
Welcome
+ automatic coaching
+ hints
+ typed chat
+ mic input
+ game-over response
= same Convai coach
```

- Same selected coach identity.
- Same Convai character ID.
- Same context refresh strategy.
- Same audio/lipsync/avatar pipeline.
- Code refs:
  - Connect selected coach: [`src/convaiManager.ts`](../../src/convaiManager.ts#L210)
  - New game welcome path: [`src/convaiManager.ts`](../../src/convaiManager.ts#L780)
  - Coach turn path: [`src/convaiManager.ts`](../../src/convaiManager.ts#L555)
  - Chat path: [`src/convaiManager.ts`](../../src/convaiManager.ts#L675)
  - End-game response path: [`src/convaiManager.ts`](../../src/convaiManager.ts#L932)

> **Speaking notes**
>
> "The important integration point is continuity. Welcome, coaching, hints, chat, mic, and game-over messages all come from the selected Convai coach rather than from disconnected systems."

## Response Streaming

- Convai text arrives during the response lifecycle.
- Caption/coach line can update before final audio finishes.
- App keeps stable response text to reduce flicker.
- Purpose:
  - Show text early.
  - Avoid clipped captions.
  - Avoid replacing final text with shorter partial output.
- Code refs:
  - Convai client setup and message handlers: [`src/convaiManager.ts`](../../src/convaiManager.ts#L338)
  - Response path in context turn: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1470)
  - User message response path: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1511)

> **Speaking notes**
>
> "The response is not only a final text blob. The app listens through the Convai response lifecycle so captions can appear while the spoken answer is being produced."

## TTS

- Convai generates spoken output.
- TTS is enabled on the Convai client.
- Static policy keeps responses speech-friendly.
- TTS notation rules reduce awkward chess pronunciation.
- Coach responses stay short for live gameplay.
- Code refs:
  - `ttsEnabled`: [`src/convaiManager.ts`](../../src/convaiManager.ts#L356)
  - Static policy builder: [`src/chessAi.ts`](../../src/chessAi.ts#L729)
  - TTS notation rules: [`src/chessAi.ts`](../../src/chessAi.ts#L742)
  - Speech send path: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1511)

> **Speaking notes**
>
> "Convai TTS is part of the character experience. The app gives Convai spoken-friendly instructions, so chess notation becomes something a voice can pronounce clearly."

## AudioRenderer

- Used for custom UI playback.
- Attaches Convai bot audio tracks to browser audio.
- Lets the demo avoid the default Convai widget UI.
- Keeps product UI custom:
  - Coach card.
  - Avatar.
  - Caption.
  - Chat drawer.
  - Mic button.
- Code refs:
  - `AudioRenderer` imported from SDK: [`src/convaiManager.ts`](../../src/convaiManager.ts#L336)
  - `AudioRenderer` creation: [`src/convaiManager.ts`](../../src/convaiManager.ts#L510)
  - Coach card UI: [`src/CoachCard.tsx`](../../src/CoachCard.tsx#L68)

> **Speaking notes**
>
> "Because the demo uses a custom interface, the Convai audio still needs to be rendered into the browser. `AudioRenderer` handles bot voice playback while the UI remains fully custom."

## Speech Completion

- App waits for:
  - SDK speaking state.
  - Browser audio completion.
  - Blendshape queue drain.
  - Stuck-audio checks.
  - Maximum wait budget.
- Goals:
  - Do not cut off the coach.
  - Do not apply the board move too early.
  - Do not leave a long dead gap after speech.
- Code refs:
  - Speech wait helper: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1166)
  - Speech wait used in context turn: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1506)
  - Speech wait used in user-message path: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1556)
  - Board move waits for response path: [`src/App.tsx`](../../src/App.tsx#L983)

> **Speaking notes**
>
> "The app does not rely on one signal only. It waits across speaking state, audio, lipsync activity, and a timeout budget so the coach move lands after the voice performance."

## Lipsync

- Convai provides blendshape frames.
- Demo consumes frames for the selected coach.
- Frames drive the Reallusion portrait.
- Format used by the app:
  - ARKit-style blendshape channels.
- App maps blendshape channels to CC4 morphs and jaw motion.
- Code refs:
  - Lipsync frame access: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1318)
  - Frame consumption in avatar loop: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L245)
  - CC4 frame application: [`src/cc4Lipsync.ts`](../../src/cc4Lipsync.ts#L495)
  - 60fps frame player: [`src/convaiLipsyncPlayer.ts`](../../src/convaiLipsyncPlayer.ts#L63)

> **Speaking notes**
>
> "Convai is also providing facial performance data. The app consumes the blendshape frames and maps them onto the Reallusion CC4 portrait so the mouth follows the generated voice."

## Lipsync Flow

```text
Convai TTS
-> blendshape frames
-> 60fps consume loop
-> CC4 morph and jaw mapping
-> avatar mouth movement
```

- TTS and lipsync are tied to the same Convai response.
- Avatar reads the current coach's frame stream.
- The frame stream is consumed continuously while speaking.
- Code refs:
  - Convai TTS enabled: [`src/convaiManager.ts`](../../src/convaiManager.ts#L356)
  - Lipsync frame getter: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1318)
  - Avatar frame loop: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L235)
  - CC4 mesh binding: [`src/cc4Lipsync.ts`](../../src/cc4Lipsync.ts#L268)

> **Speaking notes**
>
> "The lipsync pipeline starts with the Convai spoken response, then the blendshape stream is consumed in the render loop and translated into the CC4 morph targets."

## Lipsync Details

- Single playback clock.
- Smooth frame transitions.
- Decay mouth after speech.
- Reapply morphs after idle animation.
- Reapply jaw after idle animation.
- Tune per asset.
- Adjust:
  - Jaw.
  - Teeth.
  - Tongue.
  - Lower lip.
  - Thin lips on Leila.
- Reduce noisy upper-face channels:
  - Brows.
  - Cheeks.
  - Squint.
  - Nose.
- Code refs:
  - Lipsync profiles: [`src/cc4Lipsync.ts`](../../src/cc4Lipsync.ts#L87)
  - ARKit to CC4 mapping: [`src/cc4Lipsync.ts`](../../src/cc4Lipsync.ts#L119)
  - Main CC4 apply function: [`src/cc4Lipsync.ts`](../../src/cc4Lipsync.ts#L495)
  - Reapply morphs after mixer: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L277)
  - Reapply jaw after mixer: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L283)

> **Speaking notes**
>
> "The detailed mapping is asset-specific. Convai gives the expressive data, and the app tunes how those channels land on each CC4 model so speech looks stable in a portrait view."

## Avatar Rendering

- Uses Reallusion/CC4 GLB assets.
- Uses Three.js / React Three Fiber.
- Rendered in the coach card portrait.
- Uses:
  - Character model.
  - Idle animation.
  - Lighting.
  - Framing.
  - Adaptive render quality.
  - Mobile rendering guards.
- Code refs:
  - Coach card portrait scene: [`src/CoachCard.tsx`](../../src/CoachCard.tsx#L240)
  - Portrait scene wrapper: [`src/PortraitScene.tsx`](../../src/PortraitScene.tsx#L14)
  - Reallusion component: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L170)
  - Animation setup: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L225)

> **Speaking notes**
>
> "The avatar layer is the visual endpoint of the Convai response. The selected coach loads as a Reallusion portrait, receives the idle animation, and then overlays Convai-driven lipsync while the voice plays."

## Idle Cleanup

- Raw idle clips can create portrait problems:
  - Head drift.
  - Eye movement.
  - Jaw noise.
  - Hip/body sway.
  - Framing instability.
- App sanitizes idle animation:
  - Locks key bones.
  - Keeps face framed.
  - Keeps gaze stable.
  - Leaves room for lipsync to control the mouth.
- Code refs:
  - Idle clip sanitizer: [`src/sanitizeIdleClip.ts`](../../src/sanitizeIdleClip.ts#L93)
  - Sanitizer applied to loaded animations: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L183)
  - Animation playback: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L225)

> **Speaking notes**
>
> "The idle animation is cleaned up because this is a tight portrait. The model needs to feel alive without drifting out of frame or fighting the Convai-driven mouth movement."

## Blink

- Procedural blink is local.
- Blink is separate from Convai lipsync.
- Reasons:
  - Stable blink timing.
  - No conflict with speech morphs.
  - Avatar remains alive while silent.
- Code refs:
  - Blink function: [`src/portraitBlink.ts`](../../src/portraitBlink.ts#L79)
  - Blink state in avatar: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L177)
  - Blink applied each frame: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L273)

> **Speaking notes**
>
> "Blink is handled locally. Convai drives the voice and lipsync; the app adds simple procedural blink so the portrait still feels present when the coach is silent."

## Presence Stack

```text
Dynamic context = relevance
Persona = identity
TTS = voice
AudioRenderer = playback
Blendshapes = facial performance
Reallusion avatar = embodiment
Memory = continuity
Chat/mic = direct interaction
```

- The demo combines multiple Convai features into one coach layer.
- Each feature contributes to the character feeling present:
  - Context keeps answers relevant.
  - Persona keeps tone consistent.
  - TTS gives voice.
  - Audio playback makes voice audible in custom UI.
  - Blendshapes animate the face.
  - Memory supports continuity.
  - Chat/mic support direct interaction.
- Code refs:
  - Context: [`src/chessAi.ts`](../../src/chessAi.ts#L519)
  - Persona/static policy: [`src/chessAi.ts`](../../src/chessAi.ts#L729)
  - Audio: [`src/convaiManager.ts`](../../src/convaiManager.ts#L510)
  - Lipsync: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L245)
  - Memory: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1832)

> **Speaking notes**
>
> "The final experience is not one Convai feature in isolation. It is context, persona, voice, playback, blendshapes, memory, chat, mic, and avatar rendering working as one coach."

## Scope Guard

- Do not explain morph-target implementation line by line.
- Do not deep dive into Three.js internals.
- Do not turn this into a chess engine tutorial.
- Keep focus on Convai feature pipeline:
  - Context.
  - Speech.
  - Audio.
  - Blendshapes.
  - Avatar response.
- Code refs:
  - Convai runtime manager: [`src/convaiManager.ts`](../../src/convaiManager.ts#L210)
  - App turn loop: [`src/App.tsx`](../../src/App.tsx#L924)
  - Avatar runtime: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L170)

> **Speaking notes**
>
> "For the tutorial, I will name the avatar implementation pieces only as reference. The main point is the Convai runtime pipeline: context in, character response out, voice and blendshape performance on the avatar."

## References

- Convai Web SDK:
  - https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk
- Convai Reallusion + Three.js/React video:
  - https://www.youtube.com/watch?v=5tYyeXPo5vg
- Convai Reallusion + Three.js/React article:
  - https://convai.com/blog/bring-ai-online-with-reallusion-avatars-using-threejs-react
- Code refs:
  - Local Web SDK docs: [`docs/convai_web-sdk_documentation.md`](../convai_web-sdk_documentation.md#L1)
  - Reallusion runtime: [`src/ReallusionCharacter.tsx`](../../src/ReallusionCharacter.tsx#L170)

> **Speaking notes**
>
> "The references for this chapter are the Convai Web SDK docs and Convai's Reallusion material. The code references show where the demo connects Convai audio, response handling, lipsync, and avatar rendering."
