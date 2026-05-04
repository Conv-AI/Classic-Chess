  
**Chess Coach App**

Product Improvement Brief

# **Summary**

The current chess app provides a functional single-mode experience but significantly under-delivers on its potential as a Convai-powered coaching platform. This brief outlines a set of prioritised improvements that will elevate the product from a basic chess board into a genuinely compelling, coach-driven learning tool — one that showcases Convai’s conversational AI at its best.

The improvements fall into six themes:

* Mode separation — Quick Play vs. Puzzles with AI

* Adaptive difficulty via Stockfish skill levels

* Persistent sessions & chess.com-grade post-game analysis

* Curated AI coaching bots with distinct personalities

* User-created custom coaches (Convai’s flagship differentiator)

* Smarter, context-aware in-game commentary and hint system

# **Current State & Issues**

| CTA Mismatch | The “Start Lesson” button launches a game directly, creating a misleading expectation. Users are dropped into a board with no mode selection or skill calibration. |
| :---- | :---- |
| **No Difficulty Curve** | There is no player level selector. Stockfish runs at a fixed strength, making the game inaccessible for beginners and uninteresting for stronger players. |
| **No Persistence** | Games are not saved. There is no ability to review past games, replay moves, or track improvement over time. |
| **Repetitive AI Dialogue** | The AI coach narrates its own moves almost exclusively. Commentary like “I moved my knight to f3” adds no coaching value and becomes noise quickly. |
| **No Hint System** | Players have no way to ask for guidance mid-game. There is no structured hint or suggestion feature. |
| **Single Bot, Single Tone** | There is only one AI persona. No variety in coaching style, aggression, or communication approach. |

# **1\. Mode Separation: Quick Play & Puzzles with AI**

The entry screen should present two clear pathways. This sets user expectations and allows the two experiences to be designed independently.

| Quick Play | Puzzles with AI |
| ----- | ----- |
| Pick a bot coach & difficulty Full game against AI with live commentary Hint system available on request Post-game analysis & key moment review Session saved to user profile | Structured puzzles scaled to user level Points system: more points for unaided solves Progressive difficulty as points accumulate Coach commentary explains each puzzle concept Tracks solve rate, hints used, and speed |

# **2\. Player Skill Level & Stockfish Integration**

Before entering Quick Play, the user selects their level. This drives both the Stockfish engine setting and the tone/complexity of coach commentary.

| Level | Stockfish Setting | ELO Equivalent | Commentary Style |
| ----- | ----- | ----- | ----- |
| **New** | Skill Level 1–3 | ≤ 800 | Simple, encouraging, explains basic principles |
| **Beginner** | Skill Level 4–6 | 800–1200 | Tactical hints, reinforces patterns |
| **Intermediate** | Skill Level 10–14 | 1200–1600 | Strategic concepts, opening theory basics |
| **Advanced** | Skill Level 18–20 | 1600–2000 | Precise, concise, focuses on key turning points |
| **Expert** | Full strength | 2000+ | Minimal commentary, post-game deep analysis only |

# **3\. Session Storage & Post-Game Analysis**

Users should be able to sign in (or link a profile) so their games are persisted. After each game, a chess.com-style analysis panel should be available.

## **3a. Session Persistence**

* Each game is automatically saved to the user’s profile with timestamp, mode, opponent bot, and result.

* A “My Games” screen lists past sessions; clicking any game opens a replay viewer.

* Progress metrics tracked over time: win rate, accuracy trend, most common mistakes.

## **3b. Post-Game Analysis Panel**

After each game, surface a structured breakdown:

| Accuracy Score | An overall accuracy % for both sides, calculated by comparing each move to Stockfish’s top suggestion. Blunders, mistakes, and inaccuracies are counted separately. |
| :---- | :---- |
| **Key Moments** | A curated list of 3–5 critical turning points with move-by-move replay. The coach explains what happened and what the best continuation was. |
| **Opening Identification** | Detect and name the opening played (e.g. Sicilian Defence, King’s Indian). Link to a brief explanation. |
| **Improvement Tips** | 2–3 personalised tips generated from patterns in the game. E.g. “You left pieces undefended 4 times — try to check piece safety before each move.” |
| **Replay Controls** | Step through every move. Arrows to go forward/back. Click any move in the notation list to jump to that position. |

# **4\. Curated AI Coaching Bots**

Offer 4 distinct coaches, each with a different personality, communication style, and strategic approach. These should feel like real characters, not skins on the same model.

| Magnus *The Grandmaster* | Calm, precise, and slightly reserved. Magnus speaks only when it matters. He won’t flatter you, but when he says “good move” you’ll know you earned it. Focuses on positional understanding and long-term plans. Stockfish Level: Skill 18–20 (Advanced / Expert) Voice Style: *Measured, sparse, authoritative* |
| :---: | :---- |

| Sofia *The Tactician* | Sharp, energetic, and attack-oriented. Sofia loves combinations and will nudge you toward tactical opportunities. She’s encouraging but doesn’t let blunders slide — she’ll call them out plainly and show you why. Stockfish Level: Skill 12–16 (Intermediate / Advanced) Voice Style: *Punchy, direct, enthusiastic about tactics* |
| :---: | :---- |

| Arjun *The Patient Teacher* | Warm, detailed, and endlessly patient. Arjun is designed for newer players. He explains the ‘why’ behind every concept, celebrates small wins, and never makes you feel bad for a mistake — only helps you understand it. Stockfish Level: Skill 1–6 (New / Beginner) Voice Style: *Warm, nurturing, explanatory* |
| :---: | :---- |

| Leila *The Strategist* | Thoughtful, philosophical, and deep. Leila plays slow, positional chess and will guide you through long-term strategic thinking — pawn structures, piece activity, endgame technique. Less interested in fireworks, more in mastery. Stockfish Level: Skill 10–14 (Intermediate) Voice Style: *Reflective, considered, big-picture* |
| :---: | :---- |

# **5\. Commentary & Dialogue Redesign**

This is the most important UX change. The AI should be coaching the user, not narrating its own moves. The following principles should govern all in-game dialogue.

## **5a. Commenting on the User’s Moves (Primary Focus)**

The majority of commentary should be about what the user just did or is about to face:

| Situation | Current (BAD) | Target (GOOD) |
| :---- | :---- | :---- |
| **User opens centre** | *I moved my knight to f3.* | Nice — you’ve opened the centre. Now your bishops have scope. Think about where you want to castle. |
| **User hangs a piece** | *I captured your pawn on e5.* | Careful — your knight on d4 is undefended. If I take it, you’ll be down material. Want a hint? |
| **User plays a strong move** | *My queen retreats to d2.* | Great move. You’ve forced me back and kept your initiative. That’s exactly the kind of pressure that wins games. |
| **User is in trouble** | *I moved my rook to e1.* | You’re in a tricky spot. Your king side looks exposed. There’s a way through this — want a hint? |
| **After a blunder** | *I take your bishop.* | That’s a tough break. Leaving the bishop on g5 unguarded cost you a piece. It happens — let’s keep going. |

## **5b. Commenting on AI’s Own Moves (Minimal)**

The AI should only comment on its own moves when the move is significant — a sacrifice, a decisive capture, or a game-changing moment. Routine moves get no narration.

* **e.g. “I’m sacrificing my knight here — see if you can work out why.”** Defining moves only

* **e.g. “Your pawn on b5 was unguarded — I’m taking it.”** Captures of user’s hanging pieces

* **Routine moves like pawn pushes, castling, or retreats should happen silently.** Nothing else

# **6\. Hint System**

A “Ask for a Hint” button should be persistently available during Quick Play. Clicking it triggers the coach to offer structured guidance without giving the answer away immediately.

## **How It Works**

| Hint Level 1 | A directional nudge. “Think about your rook on f8 — it’s not doing much where it is.” |
| :---- | :---- |
| **Hint Level 2** | A concept-based clue. “There’s a pin available here that would put real pressure on their queen.” |
| **Hint Level 3** | The specific move with rationale. “Try Rd1. It pins their queen to their king and wins material.” |

Users progress through levels by asking again. This preserves the learning opportunity while ensuring players are never completely stuck.

* Hints used are tracked per game and shown in the post-game analysis.

* In Train with AI (puzzle mode), hints used reduce the points earned for a correct solve.

* Coach personality affects hint delivery tone (Arjun is encouraging; Magnus is terse).

# **7\. Custom Coaches — Convai’s Differentiator**

This is the feature that separates the product from every other chess app. Users can configure their own AI coach — built on Convai — with a custom personality, communication style, and full chess knowledge base.

## **What Users Configure**

* **Give the coach an identity.** Name & Avatar

* **Sliders or tags: e.g. Encouraging vs Direct, Verbose vs Minimal, Aggressive Style vs Positional Style.** Personality Tone

* **Emphasis areas: Tactics, Endgames, Openings, Time Management.** Teaching Focus

* **Where Convai supports it, native language delivery.** Language / Accent

* **All coaches — custom or standard — are grounded in the same chess knowledge base. Custom coaches inherit this automatically.** Chess KB Integration

## **Why This Showcases Convai**

Most apps have fixed bots. Convai enables the idea that any user can create a personalised coach tuned to how they learn. A grandparent can build a patient coach for their grandkid. A competitive player can build a brutally critical sparring partner. A club coach can build their coaching persona and share it with students.

This is a product story worth telling: “Create your perfect chess coach in 2 minutes.”

# **8\. Training Mode: Puzzles & Points**

Train with AI mode moves away from full games into a structured puzzle curriculum. Puzzles are sourced from a curated bank and scaled to the user’s selected level.

## **Puzzle Format**

| Puzzle Type | Tactics (find the winning move), Endgame technique, Opening principles, Defence (find the saving move) |
| :---- | :---- |
| **Difficulty Scaling** | Puzzle ELO is matched to the user’s selected level and adjusts dynamically based on solve rate |
| **Presentation** | The board is shown mid-position. The coach introduces the concept: “Black to move. There’s a tactic here that wins material. Take your time.” |
| **After Solving** | Coach explains the key idea, why it works, and names the pattern (e.g. “That’s a discovered attack — one of the most powerful tactics in chess.”) |
| **After Failing** | Coach walks through the solution step by step, explaining at each move what the idea is |

## **Points System**

| Action | Points | Notes |
| :---- | :---- | :---- |
| Solve without any hint | **\+100** | Full points, streak bonus applies |
| Solve after 1 hint | **\+60** | Partial credit |
| Solve after 2 hints | **\+30** | Partial credit |
| Solve after full walkthrough | **\+10** | Completion credit only |
| Fail / Skip | **\+0** | Coach explains; no penalty |
| 5-puzzle streak (no hints) | **\+50 Bonus** | Streak reward |

# **Priority Roadmap**

Suggested implementation order based on user impact vs. development effort:

| \# | Feature | Impact | Effort |
| ----- | :---- | :---- | :---- |
| **1** | Commentary redesign (coach’s voice focuses on user) | **Very High** | Low — prompt/logic change only |
| **2** | Mode separation \+ CTA fix | High | Low — UI restructure |
| **3** | Skill level selector \+ Stockfish mapping | High | Low — existing Stockfish API |
| **4** | Hint system (3-level) | High | Medium |
| **5** | 4 curated bot coaches with personalities | High | Medium |
| **6** | Session storage \+ replay viewer | High | Medium–High |
| **7** | Post-game analysis panel | **Very High** | High |
| **8** | Training mode: puzzles \+ points | High | High |
| **9** | Custom coach creator (Convai) | **Very High** | High — flagship feature |

# **Closing Note**

The chess platform as it stands is a working proof of concept. With these improvements, it becomes a genuinely differentiated product — one where Convai’s conversational AI does what no chess app currently does well: it talks to you like a real coach.

The custom coach creator in particular is a feature no competitor offers and speaks directly to Convai’s core capability. That alone is worth prioritising in an early demo or investor narrative.

Starting with the quick wins (commentary redesign, mode separation, level selector) will produce a dramatically better product in a short sprint, giving the team momentum before tackling the heavier session storage and custom coach features.