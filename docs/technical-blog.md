# Bringing Convai Characters Into Browser Games

Convai's Reallusion + Three.js workflow shows the core avatar loop: create a Reallusion character, export it for the web, render it in React/Three.js, and connect it to Convai for speech, personality, and real-time interaction.

Reference: https://convai.com/blog/bring-ai-online-with-reallusion-avatars-using-threejs-react

Our poker and chess prototypes build on that same idea, but put it inside playable game loops. The big picture is that the game engine owns the rules, while Convai owns the character performance. The game knows what is legal, what just happened, and what state the board or table is in. Convai turns that context into spoken, in-character behavior, streams the text response, plays generated voice, and provides lipsync data for the Reallusion avatar.

One important point up front: Convai does not have to be dialogue-only. In the demos below, some moves are selected by local game logic or Stockfish and then passed to Convai as dynamic context so the character can speak naturally around the decision. But you can also make the Convai character select the move. You send the current game state to Convai, the character returns a structured Action or selected move in the response stream, and the game parses that returned action before applying it.

The game should still validate the parsed action before changing state. For example, a poker character could return `call`, `fold`, or `raise_big`; a board-game character could return a selected move; and a custom game character could return any action schema you define. This lets Convai participate directly in both dialogue and decision-making.

```txt
Game engine
  -> validate local move, or ask Convai for a structured action
  -> build dynamic game context
  -> send prompt + dynamic info to Convai
  -> receive streaming text, voice, lipsync, and optionally an action
  -> animate the Reallusion avatar
  -> apply or display the move
```

## The Convai Layer

Both games use `@convai/web-sdk/vanilla` from the browser. A Convai client is created with a character ID, API key, TTS enabled, and ARKit-format lipsync enabled.

```ts
const client = new ConvaiClient({
  apiKey: API_KEY,
  characterId,
  enableLipsync: true,
  enableEmotion: true,
  blendshapeConfig: { format: 'arkit' },
  ttsEnabled: true,
  startWithAudioOn: false,
});
```

The main Convai features used by the games are:

- `sendUserTextMessage(...)` sends a turn prompt or chat message to the character.
- `updateDynamicInfo({ text })` refreshes the character's live game context.
- `bot-llm-text` messages provide streamed response text.
- `stateChange` tells the app when a character starts and stops speaking.
- `blendshapeQueue` provides ARKit lipsync frames for the avatar.
- `botReady` tells the app when the character is initialized.
- `AudioRenderer` handles voice playback from the Convai room.

This means Convai is not just a text chatbot. It is the speech layer, personality layer, conversation layer, action layer, and facial-performance data source.

## Dynamic Info: Keeping Characters Grounded

The most important integration detail is dynamic info. Before a character speaks, the game sends a compact summary of the current state.

For poker, this includes the hand number, betting phase, pot size, call amount, minimum raise, the character's chips, community cards, private hole cards, active players, recent table actions, recent dialogue, and the planned move.

For chess, this includes whose turn it is, whether the position is normal/check/draw/checkmate, legal move count, material balance, the last move, and Danielle's planned move.

This keeps Convai grounded in the actual game state. The character does not need to infer the board from scratch. The game tells Convai what matters, and Convai responds in character.

## Convai Actions: Letting Characters Choose Game Moves

Convai also supports structured Actions. This is important for game NPCs because the character can do more than speak: it can select an action from a list defined by the game.

In the poker prototype, the Convai manager defines possible actions like:

```ts
const VALID_ACTIONS = [
  'fold',
  'check',
  'call',
  'raise_small',
  'raise_big',
  'all_in',
];
```

The action config describes the characters, the poker table object, and the set of valid moves. Convai can then return an `action` message, which the game can normalize, validate, and apply.

```txt
Game sends state to Convai
  -> Convai character reasons about the situation
  -> Convai returns dialogue and/or a structured action
  -> Game validates the action
  -> Game applies the action if legal
```

There are two useful patterns:

- Convai-driven action: Convai receives the game state and chooses a structured action, such as `call` or `raise_big`.
- Local-engine action: The local poker AI, chess engine, or Stockfish chooses the legal move, then the move is sent to Convai through dynamic info so the character can speak naturally around it.

Both are valid. Convai-driven actions are great when you want the character's personality and reasoning to directly influence gameplay. Local-engine actions are useful when legality, strength, or deterministic behavior matters most. In our current chess flow, Stockfish chooses Danielle's move and Convai performs the coaching explanation. In poker, the code includes Convai action support, while the game can also use local AI and share the planned move as private context.

## Poker Example: Four Persistent Characters

The poker game has four Convai-backed opponents: Vincent, Tyler, Cassandra, and Danielle. Each has its own character ID, client connection, audio renderer, streamed text buffer, speaking state, lipsync index, pending action, and emotion state.

Instead of reconnecting whenever someone speaks, the poker game connects all four characters at game start and keeps those sessions alive. This matters because reconnecting every turn can add several seconds of latency. Persistent sessions make the poker table feel much more responsive.

Only one character is allowed to speak at a time. The manager tracks the currently speaking character and uses a promise queue so turns do not overlap. It waits for the table to go quiet before sending the next line.

The poker turn flow is:

```txt
Local poker engine reaches AI turn
  -> choose or request action
  -> build dynamic table info
  -> update Convai dynamic info
  -> send dialogue prompt
  -> wait for speech and lipsync to finish
  -> apply poker action
  -> update UI and event history
```

The prompt tells the character to use its planned move as private acting direction. That way a character can sound confident, nervous, dismissive, or aggressive without bluntly saying "I call" or "I raise" in the dialogue.

## Chess Example: Danielle as a Coach

The chess game uses a simpler one-character setup. Danielle is the only Convai character, so the manager owns one client, one audio renderer, one response stream, and one lipsync queue.

When the player moves, the app asks Stockfish for Danielle's reply. Then it builds dynamic coach info and sends Danielle a prompt that asks for one short, meaningful coaching sentence. The prompt also tells her not to pronounce raw notation like `e5`, `Bxf5`, or square names, because chess notation often sounds awkward in text-to-speech. If a word, name, or move still comes out badly, you can also add custom pronunciation guidance in the Convai platform so the TTS says it correctly instead of relying only on prompt wording.

The flow is:

```txt
Player moves
  -> chess.js validates the move
  -> Stockfish selects Danielle's reply
  -> app builds dynamic coach context
  -> Convai generates Danielle's spoken coaching line
  -> Danielle's avatar speaks with lipsync
  -> the planned move is applied to the board
```

This lets Danielle behave like a coach instead of a move generator. The chess engine provides strength and legality. Convai provides personality, voice, explanation, and presence.

## Streaming Text and Speech Completion

Convai responses can arrive as streamed text while the voice is playing. Both managers listen for `bot-llm-text` messages and store the latest response text.

Speech timing comes from `stateChange`. When `isSpeaking` becomes true, the avatar starts consuming lipsync frames. When it becomes false, the manager flushes the final text and waits for a short silence window before allowing another request.

The chess manager also stores the longest response text seen during the stream. This helps avoid clipped text bubbles when the streamed message updates in chunks.

## Reallusion Avatar Lipsync

Convai provides ARKit-style blendshape frames. Reallusion CC4 avatars use their own morph target names. The bridge between them is an `ARKIT_TO_CC4` mapping table.

Each frame:

```txt
Convai ARKit frame
  -> map ARKit index to CC4 morph name
  -> scale the value
  -> apply it to the matching SkinnedMesh morph target
  -> decay morphs smoothly after speech stops
```

Examples of CC4 morph targets include:

```txt
Jaw_Open
V_Open
Mouth_Smile_L
Mouth_Frown_R
Mouth_Pucker_Up_L
Eye_Blink_R
Brow_Drop_L
```

The poker implementation has more character-specific tuning because it supports four avatars. The chess implementation is smaller because it only drives Danielle.

## Recovering CC4 Morph Target Names

One Reallusion-specific detail is that CC4 GLB exports can store morph target names in `mesh.extras.targetNames`. Three.js may not automatically copy those into `morphTargetDictionary`.

The projects patch this after loading the GLB by reading the raw parser JSON and rebuilding the morph dictionary. Without this step, the model may render correctly, but lipsync will not know which morph target corresponds to which mouth shape.

```txt
Load GLB
  -> inspect parser JSON
  -> read mesh.extras.targetNames
  -> patch morphTargetDictionary
  -> apply ARKit-to-CC4 lipsync normally
```

This is one of the most important bridge pieces between Reallusion avatars and Convai lipsync.

## Why This Pattern Works

The clean mental model is:

```txt
Game engine = truth
Convai = character performance
Dynamic info = live memory
Actions = structured behavior
Prompt = direction
Lipsync = embodiment
```

Poker demonstrates the multi-character version: four persistent Convai agents, action support, turn queues, table memory, voice, emotion, and lipsync. Chess demonstrates the focused coach version: one persistent Convai agent, one board state, Stockfish-backed move choice, and short spoken explanations.

Together, they show a practical way to build browser games with believable AI characters. Keep rules and validation in code, use Convai for conversation and performance, and connect the two through dynamic info and optional structured actions.

## Conclusion

Convai works best here as the character layer that sits on top of deterministic game logic. That gives you the safety of local rules and the expressiveness of a live conversational agent. In poker, that means multiple persistent opponents who can speak, react, and even choose structured actions from table state. In chess, that means a coach who can explain moves naturally, stay short and meaningful, and speak with a consistent personality.

The overall pattern is reusable: keep the game authoritative, feed Convai rich state through dynamic info, use actions when you want structured decisions, and use Reallusion avatars to make the response feel embodied. That combination is what makes the demo feel like a game with real characters instead of just a game with chat text.
