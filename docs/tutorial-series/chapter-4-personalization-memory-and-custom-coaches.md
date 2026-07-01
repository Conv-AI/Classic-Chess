# Chapter 4: Personalization: Sign-In, Long-Term Memory, Convai Auth, and Custom Coaches

## Objective

- Explain the personalization layer around Convai.
- Cover:
  - Guest identity.
  - Google sign-in.
  - Convai sign-in.
  - Stable `endUserId`.
  - Long-term memory.
  - Per-user/per-character memory scope.
  - Custom coach creation.
  - Convai Core API.
  - Production auth-token pattern.
- Keep Convai memory and identity as the main subject.
- Code refs:
  - Guest and signed-in identity mapping: [`src/auth.ts`](../../src/auth.ts#L41)
  - Convai client receives `endUserId`: [`src/convaiManager.ts`](../../src/convaiManager.ts#L338)
  - Game memory summary: [`src/App.tsx`](../../src/App.tsx#L102)
  - Custom coach creation: [`src/convaiCoreApi.ts`](../../src/convaiCoreApi.ts#L105)

> **Speaking notes**
>
> "This chapter is about personalization: how the demo gives Convai a stable user identity, how memory is attached to that identity, how Google and Convai sign-in fit in, and how custom coaches are created through the Convai Core API."

## Identity Requirement

- Convai can speak with current context without long-term identity.
- Long-term memory needs a stable `endUserId`.
- The same person should reconnect with the same `endUserId`.
- The `endUserId` is passed into the Convai client session.
- Signed-in identity also carries profile metadata.
- Code refs:
  - Stable guest ID: [`src/auth.ts`](../../src/auth.ts#L41)
  - Signed-in identity mapping: [`src/auth.ts`](../../src/auth.ts#L92)
  - Resolve Convai connection ID: [`src/auth.ts`](../../src/auth.ts#L56)
  - `endUserId` passed to Convai client: [`src/convaiManager.ts`](../../src/convaiManager.ts#L338)

> **Speaking notes**
>
> "For Convai memory, identity is the anchor. The app can always give Convai the live board context, but memory needs a stable `endUserId` so future sessions attach to the same person."

## Memory Scope

```text
character_id + endUserId = memory scope
```

- Memory is scoped by user and character.
- Same user can have different memory with different coaches.
- Examples:
  - Leila can remember strategic weaknesses.
  - Sofia can remember tactical misses.
  - Arjun can remember beginner learning needs.
  - Magnus can remember advanced conversion issues.
- Code refs:
  - Character ID resolution: [`src/coachConfig.ts`](../../src/coachConfig.ts#L195)
  - Convai client character and user fields: [`src/convaiManager.ts`](../../src/convaiManager.ts#L338)
  - Profile memory helper: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1832)
  - Built-in coach character IDs: [`src/coachConfig.ts`](../../src/coachConfig.ts#L98)

> **Speaking notes**
>
> "The practical memory scope is the selected Convai character plus the user ID. That means the same student can build different learning history with Leila, Sofia, Arjun, or Magnus."

## Identity Paths

| Path | Purpose | Memory/Personalization Role |
| --- | --- | --- |
| Guest | Start immediately | Stable device/session identity for low-friction play |
| Google sign-in | Player identity | Stable user identity, profile metadata, memory writes |
| Convai sign-in | Convai account flow | Stable user identity plus Convai account access for builders |

- All paths feed the Convai connection pipeline.
- Signed-in paths produce profile metadata.
- Guest path avoids blocking the demo.
- Code refs:
  - Guest ID path: [`src/auth.ts`](../../src/auth.ts#L41)
  - Google sign-in path: [`src/AuthSignInModal.tsx`](../../src/AuthSignInModal.tsx#L109)
  - Convai sign-in path: [`src/AuthSignInModal.tsx`](../../src/AuthSignInModal.tsx#L139)
  - Auth user to Convai identity: [`src/auth.ts`](../../src/auth.ts#L92)

> **Speaking notes**
>
> "There are three identity paths. Guest mode keeps the demo instant, Google gives player identity and memory continuity, and Convai sign-in supports users who want their Convai account connected to the experience."

## Guest Identity

- No account required.
- Creates a stable browser/device identity.
- Lets the app connect to Convai without blocking gameplay.
- Good for:
  - Demo friction.
  - Quick testing.
  - First-time users.
- Limits:
  - Not portable across devices.
  - Not equivalent to a full signed-in profile.
  - Memory writes are treated differently from signed-in identity in this demo.
- Code refs:
  - Stable guest ID creation: [`src/auth.ts`](../../src/auth.ts#L41)
  - Guest fallback in connection ID resolver: [`src/auth.ts`](../../src/auth.ts#L56)
  - Convai connection uses resolved ID: [`src/convaiManager.ts`](../../src/convaiManager.ts#L338)

> **Speaking notes**
>
> "Guest identity is for immediacy. The app still gives Convai a stable connection ID for this browser, but signed-in identity is the stronger path for persistent personalization."

## Google Sign-In

- Maps Google user to Convai-facing `endUserId`.
- Uses stable Google user identifier.
- Adds metadata:
  - Name.
  - Email.
  - Picture.
  - Provider.
- Enables:
  - Profile memory.
  - Post-game learning memory.
  - User-specific coaching continuity.
- Code refs:
  - Google credential sign-in: [`src/auth.ts`](../../src/auth.ts#L127)
  - Google UI callback: [`src/AuthSignInModal.tsx`](../../src/AuthSignInModal.tsx#L109)
  - User identity metadata: [`src/auth.ts`](../../src/auth.ts#L92)
  - Memory eligibility helper: [`src/auth.ts`](../../src/auth.ts#L31)

> **Speaking notes**
>
> "Google sign-in turns the player into a stable Convai end user. The app maps the Google identity into `endUserId` and passes profile metadata so memory can become user-specific."

## Convai Sign-In

- Lets users sign in with a Convai account.
- Converts Convai session identity into the same app auth shape.
- Applies Convai account access to the experience.
- Useful for:
  - Convai users testing the demo.
  - Builder workflows.
  - Custom coach creation.
- Code refs:
  - Convai redirect start: [`src/convaiAuth.ts`](../../src/convaiAuth.ts#L305)
  - Convai session restore: [`src/convaiAuth.ts`](../../src/convaiAuth.ts#L331)
  - Convai session to app user: [`src/convaiAuth.ts`](../../src/convaiAuth.ts#L363)
  - Apply session access: [`src/convaiAuth.ts`](../../src/convaiAuth.ts#L377)
  - Auth button session handling: [`src/AuthButton.tsx`](../../src/AuthButton.tsx#L40)

> **Speaking notes**
>
> "Convai sign-in is the builder-friendly path. A Convai account session becomes the same identity shape the app uses for memory and can also enable Convai-backed creation flows."

## Long-Term Memory Entries

- Profile memory:

```text
The student's name is Maya.
```

- Learning memory:

```text
In an Intermediate game, the student struggled with king safety after moving flank pawns.
```

- Game memory is written after a completed game summary.
- Profile memory is checked/seeded during connection.
- Memory should be durable and useful later.
- Code refs:
  - Game memory text builder: [`src/App.tsx`](../../src/App.tsx#L102)
  - Game memory write call: [`src/App.tsx`](../../src/App.tsx#L798)
  - Memory write helper: [`src/convaiManager.ts`](../../src/convaiManager.ts#L720)
  - Profile memory helper: [`src/convaiManager.ts`](../../src/convaiManager.ts#L1832)

> **Speaking notes**
>
> "The demo writes memory as compact facts. Profile memory can make the coach address the student naturally, and post-game learning memory gives future sessions a useful coaching signal."

## Memory Rules

- Store:
  - Short facts.
  - Durable learning signals.
  - Repeated weaknesses.
  - Stable user preferences.
  - Profile details the coach can use naturally.
- Avoid:
  - Full transcripts.
  - Every move.
  - Temporary tactical details.
  - Duplicate facts.
  - Generic praise.
- Reason:
  - Memory should improve future coaching.
  - Memory should not become noisy.
- Code refs:
  - Concise game memory builder: [`src/App.tsx`](../../src/App.tsx#L102)
  - Post-game memory call: [`src/App.tsx`](../../src/App.tsx#L798)
  - Memory helper boundary: [`src/convaiManager.ts`](../../src/convaiManager.ts#L720)

> **Speaking notes**
>
> "The memory design is intentionally restrained. Save facts that will change future coaching, not giant transcripts or every move from the game."

## Custom Coach Creator

- Uses Convai Core API.
- User inputs:
  - Name.
  - Backstory.
  - Speaking style.
  - Sample dialogue.
  - Voice.
  - Language.
  - Model.
  - Temperature.
- App actions:
  - Fetch voices.
  - Fetch languages.
  - Filter voices by selected language.
  - Create Convai character.
  - Update character settings.
  - Store returned character ID.
  - Add coach to picker.
- Code refs:
  - Custom coach form defaults: [`src/App.tsx`](../../src/App.tsx#L2111)
  - Fetch voice/language options: [`src/App.tsx`](../../src/App.tsx#L2188)
  - Create custom coach submit: [`src/App.tsx`](../../src/App.tsx#L2213)
  - Save returned coach: [`src/App.tsx`](../../src/App.tsx#L2224)
  - Core API create/update: [`src/convaiCoreApi.ts`](../../src/convaiCoreApi.ts#L105)

> **Speaking notes**
>
> "Custom coaches are created through Convai's Core API. The user defines the persona, voice, language, model, and speaking style; the app creates the Convai character and stores the returned character ID."

## Custom Coach Core API Details

- Voice list comes from Convai TTS voices.
- Language list comes from Convai supported languages.
- Voices are filtered against the selected language.
- Model choices are exposed in the app.
- Character creation sends:
  - Name.
  - Voice.
  - Backstory.
  - Speaking style.
  - Sample dialogue.
- Character update sends:
  - Model.
  - Temperature.
  - Language codes.
- Code refs:
  - Model options: [`src/convaiCoreApi.ts`](../../src/convaiCoreApi.ts#L41)
  - Default model: [`src/convaiCoreApi.ts`](../../src/convaiCoreApi.ts#L61)
  - Voice-language filter: [`src/convaiCoreApi.ts`](../../src/convaiCoreApi.ts#L73)
  - Fetch voices: [`src/convaiCoreApi.ts`](../../src/convaiCoreApi.ts#L93)
  - Fetch languages: [`src/convaiCoreApi.ts`](../../src/convaiCoreApi.ts#L99)
  - Create/update character: [`src/convaiCoreApi.ts`](../../src/convaiCoreApi.ts#L105)

> **Speaking notes**
>
> "The Core API flow is create then configure. First the app creates the Convai character with persona and voice details; then it updates model, temperature, and language settings."

## Custom Coach Pipeline

```text
User defines coach
-> app calls Convai Core API
-> Convai character is created
-> app stores character ID
-> coach appears in picker
-> game connects to character
-> same context/chat/mic/avatar pipeline
```

- Custom coaches join the same app pipeline as built-in coaches.
- Same dynamic context.
- Same static policy shape.
- Same chat flow.
- Same mic flow.
- Same hint flow.
- Same Convai connection manager.
- Uses a placeholder/default avatar path unless a custom avatar asset is supplied.
- Code refs:
  - Save custom coach: [`src/customCoaches.ts`](../../src/customCoaches.ts#L27)
  - Convert stored coach to `CoachConfig`: [`src/customCoaches.ts`](../../src/customCoaches.ts#L32)
  - Merge built-in and custom coaches: [`src/coachConfig.ts`](../../src/coachConfig.ts#L216)
  - Convai connection uses coach config: [`src/convaiManager.ts`](../../src/convaiManager.ts#L210)

> **Speaking notes**
>
> "Once a custom coach has a Convai character ID, it behaves like the built-in coaches. It uses the same context, same chat and mic paths, same memory shape, and the same Convai runtime manager."

## Built-In Versus Custom Coaches

- Built-in coaches:
  - Authored manually.
  - Dedicated Convai character IDs.
  - Tuned personas.
  - Specific difficulty ranges.
  - Matching portraits/assets.
- Custom coaches:
  - User-generated.
  - Created through Core API.
  - Stored into the local coach list.
  - Use shared pipeline.
  - Receive same board context.
  - Use same chat/mic/hint flow.
- Code refs:
  - Built-in coach definitions: [`src/coachConfig.ts`](../../src/coachConfig.ts#L98)
  - Difficulty ranges: [`src/coachConfig.ts`](../../src/coachConfig.ts#L45)
  - Stored custom coach conversion: [`src/customCoaches.ts`](../../src/customCoaches.ts#L32)
  - All coaches returned together: [`src/coachConfig.ts`](../../src/coachConfig.ts#L216)

> **Speaking notes**
>
> "Built-in coaches are polished examples. Custom coaches prove that the same Convai-powered coach pipeline can be extended by users through character creation."

## Core API Positioning

- Convai dashboard:
  - Manual authoring.
  - Polished built-in characters.
  - Persona and voice review.
  - Character setup before demo use.
- Convai Core API:
  - App-driven character creation.
  - User-generated personas.
  - Dynamic product workflows.
  - Programmatic voice/model/language choices.
- Code refs:
  - Built-in dashboard-backed coaches: [`src/coachConfig.ts`](../../src/coachConfig.ts#L98)
  - Core API wrapper: [`src/convaiCoreApi.ts`](../../src/convaiCoreApi.ts#L105)
  - Custom coach UI submit: [`src/App.tsx`](../../src/App.tsx#L2213)

> **Speaking notes**
>
> "Use the dashboard for authored, polished characters. Use the Core API when the product needs to create or update Convai characters from inside the app."

## Production Auth Tokens

- This example does not implement Convai's backend auth-token pattern.
- For production-style deployments, point readers to Convai Web SDK Auth Tokens documentation.
- Production flow:

```text
Frontend requests a Convai auth token from backend
-> backend performs the secure Convai token exchange
-> backend returns a short-lived auth token
-> frontend connects to Convai with that token
-> backend can extend or revoke the token
```

- Purpose:
  - Keep privileged Convai access on a backend server.
  - Use short-lived credentials in the browser session.
  - Support revoke/extend flows.
- Code/documentation refs:
  - Local Auth Tokens docs: [`docs/convai_web-sdk_documentation.md`](../convai_web-sdk_documentation.md#L2351)
  - Server-side token generation section: [`docs/convai_web-sdk_documentation.md`](../convai_web-sdk_documentation.md#L2388)
  - SDK token usage section: [`docs/convai_web-sdk_documentation.md`](../convai_web-sdk_documentation.md#L2427)
  - Token field reference: [`docs/convai_web-sdk_documentation.md`](../convai_web-sdk_documentation.md#L2485)

> **Speaking notes**
>
> "This example does not implement Convai's backend auth-token pattern. For production, use Convai's Auth Tokens flow: the frontend asks your backend for a short-lived token, and the backend handles the secure exchange with Convai."

## Auth Token Points

- Auth tokens are:
  - Short-lived.
  - Scoped.
  - Revocable.
  - Extendable.
- Backend responsibilities:
  - Request token.
  - Extend token if needed.
  - Revoke token when needed.
- Frontend responsibility:
  - Use returned token to initialize the Web SDK session.
- Code/documentation refs:
  - Why auth tokens matter: [`docs/convai_web-sdk_documentation.md`](../convai_web-sdk_documentation.md#L2359)
  - Extend token: [`docs/convai_web-sdk_documentation.md`](../convai_web-sdk_documentation.md#L2444)
  - Revoke token: [`docs/convai_web-sdk_documentation.md`](../convai_web-sdk_documentation.md#L2460)
  - API endpoint summary: [`docs/convai_web-sdk_documentation.md`](../convai_web-sdk_documentation.md#L2493)

> **Speaking notes**
>
> "The auth-token model is the production path: short-lived, scoped, revocable tokens issued through a backend, then used by the frontend Convai Web SDK session."

## Scope Guard

- Keep focus on Convai personalization.
- Cover identity only as it affects Convai:
  - `endUserId`.
  - Metadata.
  - Memory.
  - Custom character creation.
  - Auth-token pattern.
- Do not turn this into:
  - General OAuth tutorial.
  - General account-system tutorial.
  - Storage implementation walkthrough.
  - Chess game-state tutorial.
- Code refs:
  - Identity mapping: [`src/auth.ts`](../../src/auth.ts#L92)
  - Convai connection: [`src/convaiManager.ts`](../../src/convaiManager.ts#L338)
  - Memory write: [`src/convaiManager.ts`](../../src/convaiManager.ts#L720)
  - Custom coach API: [`src/convaiCoreApi.ts`](../../src/convaiCoreApi.ts#L105)

> **Speaking notes**
>
> "I will keep the chapter centered on Convai: identity as `endUserId`, memory as user-character continuity, Convai sign-in as account access, and Core API as the custom coach creation path."

## References

- Convai Web SDK Auth Tokens:
  - https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk/auth-tokens
- Convai Core API docs:
  - https://docs.convai.com/api-docs/api-reference/core-api-reference
- Convai Web SDK:
  - https://docs.convai.com/api-docs/plugins-and-integrations/web-plugins/convai-web-sdk
- Code refs:
  - Local Auth Tokens docs: [`docs/convai_web-sdk_documentation.md`](../convai_web-sdk_documentation.md#L2351)
  - Core API wrapper: [`src/convaiCoreApi.ts`](../../src/convaiCoreApi.ts#L105)
  - Identity helpers: [`src/auth.ts`](../../src/auth.ts#L41)

> **Speaking notes**
>
> "The key references are Convai Auth Tokens for production authentication, Convai Core API for custom coaches, and the local identity/memory paths in the demo."
