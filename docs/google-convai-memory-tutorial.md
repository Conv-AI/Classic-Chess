# Google Login and Convai Long-Term Memory

This guide explains how the optional Google sign-in feature works, how to set it up locally, and how it maps a Google account to Convai long-term memory.

It is written as both a tutorial and an implementation handoff. If another agent or engineer needs to continue this work, start here.

## What Was Added

The app now supports optional Google sign-in without blocking guest play.

The implementation adds:

- A top-right Google sign-in/account control.
- Real Google Identity Services popup login.
- Server-side Google ID token verification through Vite dev middleware.
- An HTTP-only local session cookie for signed-in dev sessions.
- A static-host fallback for GitHub Pages that derives the same user identity from Google's browser credential when `/api/auth/*` is unavailable.
- A stable Convai `endUserId` based on the verified Google `sub`.
- Convai `endUserMetadata` with the user's name/email/avatar.
- Conservative Convai memory writes:
  - one profile memory with the student's name,
  - one concise post-game learning memory after analysis.
- A guest fallback with a **stable per-browser** Convai `endUserId` (`guest:{uuid}` in `localStorage`) so anonymous users on the same device keep a consistent connect identity without app-side LTM writes.
- Automatic **MAU-limit recovery**: on Convai “speaker limit reached” errors, delete known end users via the Convai API and retry connect once (`src/convaiEndUsers.ts`).

Important files:

- `src/AuthButton.tsx`: renders Google sign-in, avatar, and sign-out UI.
- `src/auth.ts`: maps verified Google users into Convai-facing identity.
- `src/auth.test.ts`: tests the Google user -> Convai identity mapping.
- `src/App.tsx`: stores auth state and passes identity into game/puzzle flows.
- `src/convaiManager.ts`: passes `endUserId`/`endUserMetadata` to `ConvaiClient`, MAU recovery, welcome delivery, and writes memories.
- `src/convaiEndUsers.ts`: list/delete end-user helpers and MAU error detection.
- `src/coachConfig.ts`: coach personas, portrait paths, default coach (Sofia), guest character ID resolution.
- `src/MenuScreen.tsx`: menu coach picker (headshot thumbnails are cosmetic; unrelated to LTM).
- `vite.config.ts`: local auth endpoints and Google token verification.
- `package.json`: adds `google-auth-library`.

## Google Cloud Setup

Do this once for the Google account/project you want to use.

1. Go to Google Cloud Console.
2. Create a new project or select an existing project.
3. Open the OAuth/Auth consent screen setup.
4. Configure the consent screen:
   - App name: something like `Classic Chess`.
   - User support email: your Google account.
   - Developer contact email: your Google account.
5. If Google asks for app type, use `External` unless you are inside a Google Workspace org and intentionally want internal-only access.
6. If the app is in testing mode, add your own Google account as a test user.
7. Go to Credentials.
8. Create an OAuth 2.0 Client ID.
9. Choose application type `Web application`.
10. Add authorized JavaScript origins.

For local development, add the origin you actually open in the browser:

```text
http://localhost:5173
http://127.0.0.1:5173
```

If Vite chooses another port because `5173` is busy, add that origin too. For example:

```text
http://127.0.0.1:5174
```

For deployment, add the deployed site origin, for example:

```text
https://your-domain.example
```

You do not need a client secret for this browser popup flow. The browser receives a Google ID token. Local dev verifies that token with the Vite middleware; static GitHub Pages decodes the browser credential as a demo-friendly fallback.

## Local Environment Setup

Set both env vars before starting Vite:

```bash
VITE_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

Why there are two variables:

- `VITE_GOOGLE_CLIENT_ID` is exposed to the browser by Vite. It lets Google Identity Services render and initialize the sign-in button.
- `GOOGLE_CLIENT_ID` is read by the Vite dev middleware. It verifies that Google issued the ID token for this specific app.
- GitHub Pages only needs `VITE_GOOGLE_CLIENT_ID` at build time because it cannot run the Vite middleware.

For PowerShell, you can start the app like this:

```powershell
$env:VITE_GOOGLE_CLIENT_ID="your-web-client-id.apps.googleusercontent.com"
$env:GOOGLE_CLIENT_ID="your-web-client-id.apps.googleusercontent.com"
npm run dev
```

If you already have a `.env` workflow in this repo, you can also place the same values there.

## How To Test Locally

1. Install dependencies:

```bash
npm install
```

2. Set the Google env vars.
3. Start Vite:

```bash
npm run dev
```

4. Open the URL printed by Vite.
5. Confirm the Google sign-in control appears at the top right.
6. Click sign in and choose your Google account.
7. Start Quick Play.
8. Confirm the coach can naturally use your Google profile name.
9. Finish or resign a game so post-game analysis runs.
10. Start another game with the same coach.
11. Confirm the app reconnects using the same Convai identity, so the coach can use long-term memory for that signed-in user.

Also test guest mode:

1. Remove or omit `VITE_GOOGLE_CLIENT_ID`.
2. Restart Vite.
3. Confirm the login control is hidden.
4. Start Quick Play and Puzzles.
5. Confirm the app still works as before.

## Runtime Flow

The login flow is:

1. `AuthButton` loads Google's script:

```text
https://accounts.google.com/gsi/client
```

2. It initializes Google Identity Services with:

```ts
ux_mode: 'popup'
auto_select: false
```

This means there is no forced login and no automatic One Tap prompt. The user only sees login when they click the sign-in control.

3. Google returns an ID token credential to the browser callback.
4. The browser sends that credential to:

```text
POST /api/auth/google
```

5. The Vite dev middleware verifies the token with `google-auth-library`.
6. If verification succeeds, the server creates a local session id and stores this sanitized user profile in memory:

```ts
{
  id: googleSub,
  name,
  email,
  picture
}
```

7. The server sets an HTTP-only cookie:

```text
classic_chess_auth=...
```

8. The browser can later call:

```text
GET /api/auth/me
```

to restore the signed-in user after refresh.

9. Sign-out calls:

```text
POST /api/auth/logout
```

and clears the local session cookie.

On GitHub Pages, `/api/auth/google`, `/api/auth/me`, and `/api/auth/logout` do not exist because Pages is static hosting. In that case the app falls back to decoding the Google ID token payload in the browser, stores the sanitized profile in `localStorage`, and still maps the Google `sub` to the same Convai `endUserId`.

This fallback is good enough for a public demo where the goal is long-term memory continuity. It is not a replacement for server verification in a production security model.

## Identity Mapping

The app deliberately uses Google `sub`, not email, as the stable identity key.

Reason:

- `sub` is stable for that Google account and OAuth client.
- Email can change.
- Email is personally identifiable and should not be used as the primary storage key if a stable opaque id is available.

The mapping happens in `src/auth.ts`:

```ts
endUserId = `google:${user.id}`
```

For a signed-in user, the Convai identity looks like:

```ts
{
  displayName: user.name,
  endUserId: `google:${googleSub}`,
  endUserMetadata: {
    name: user.name,
    email: user.email,
    picture: user.picture,
    provider: 'google'
  }
}
```

For a guest user, `authUserToIdentity(null)` returns `null`. The app still connects with a stable browser id from `getStableGuestEndUserId()`:

```ts
endUserId = `guest:${crypto.randomUUID()}` // created once, stored in localStorage
```

Guests do **not** receive app-side LTM memory writes (`usesConvaiLongTermMemory` is false). Game session ids (`game-…`) remain separate and are used only for saved-game metadata, not as the Convai connect id.

## Convai Integration

Convai memory requires an `endUserId`. The local Convai documentation says long-term memories are scoped to:

```text
(character_id, end_user_id)
```

That means:

- Leila + your Google identity gets one memory scope.
- Another coach + your same Google identity gets a different memory scope.
- Guest browsers reuse the same `guest:{uuid}` connect id across games on that device (no cross-browser sharing).

Optional **guest character clones**: if your primary Convai characters require LTM/`end_user_id`, set `VITE_CONVAI_GUEST_CHARACTER_<COACH>` env vars to LTM-disabled clone character IDs (see `resolveConvaiCharacterId` in `src/coachConfig.ts`).

The manager passes identity into `ConvaiClient`:

```ts
new ConvaiClient({
  apiKey,
  characterId: coach.characterId,
  endUserId,
  endUserMetadata,
  ...
})
```

The app now separates:

- **game session id:** still unique per saved game (`game-…`),
- **Convai end user id:** `google:{sub}` when signed in, or stable `guest:{uuid}` per browser when not.

### MAU limit recovery

Convai API keys have a monthly active user (MAU) cap per character. When connect fails with an MAU-limit error, `convaiManager` calls `deleteAllEndUsers()` (Convai delete API + local known-id registry fallback) and retries the session once. See `src/convaiEndUsers.ts`.

## Where Identity Is Applied

Quick Play:

- `App.startQuickPlay()` connects Convai and keeps the **loading overlay** through game setup.
- `ChessGame` runs `beginNewGame` setup behind the overlay, then peels loading with a short “Taking your seat…” pause.
- Welcome speech is delivered **after** the board is visible (`POST_REVEAL_WELCOME_MS` ≈ 900 ms) so players are not bombarded during the transition.
- `resolveConvaiConnectionEndUserId(userIdentity)` is passed into every `connectCoach` call.
- If the user signs in while already in a game, `ChessGame` reconnects the active coach with the new identity and refreshes board context.

Puzzles:

- `PuzzleScreen` passes `userIdentity` into `chessConvai.connectCoach`.
- This keeps puzzle coaching under the same signed-in Convai identity.

Custom Coach:

- No special login changes were needed.
- Custom coach creation uses Convai API operations, not long-term memory for a conversation.

My Games:

- No special login changes were needed.
- Saved games remain local browser storage.

## Memory Writes

The implementation is intentionally conservative.

On signed-in coach connection:

- `convaiManager.ensureProfileMemory()` tries to save:

```text
The student's name is {name}.
```

- It checks existing memories first to avoid duplicates.
- It caches the profile-memory key for the current connection so reconnects do not repeatedly write the same memory.

After completed game analysis:

- `App.buildLongTermGameMemory()` creates one short lesson-style memory from the analysis summary.
- Example shape:

```text
In a Intermediate chess game, the student had 2 mistakes; useful coaching focus: scan checks, captures, and threats before quiet moves.
```

- `chessConvai.rememberGameSummary()` writes that string through Convai `memoryManager.addMemories`.
- It also checks existing memories first when possible.

This is designed for tutorial/demo clarity without saving a giant transcript or every move.

## GitHub Pages Deployment

GitHub Pages works with the static fallback.

Before pushing:

1. Make sure Google Cloud Authorized JavaScript origins includes the exact Pages origin:

```text
https://special-bassoon-6q8o6jm.pages.github.io
```

No trailing slash.

2. Make sure `.env` includes:

```bash
VITE_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

3. If `.env` is still ignored by git and you intentionally want to commit it, force-add it:

```bash
git add -f .env
```

4. Commit and push to `master`.
5. GitHub Actions will read `VITE_` values from `.env`, build the app, and deploy `dist` to Pages.
6. On the deployed site, Google sign-in uses the static fallback and Convai memory still gets:

```ts
endUserId = `google:${googleSub}`
```

## Production Notes

The current auth server lives in Vite dev middleware. That is good for local development. GitHub Pages uses the browser-only fallback. Neither should be treated as a full production auth backend.

Before deploying this as a real site:

1. Move these endpoints to your production app server or serverless functions:
   - `POST /api/auth/google`
   - `GET /api/auth/me`
   - `POST /api/auth/logout`
2. Keep server-side Google ID token verification.
3. Keep the session cookie HTTP-only.
4. Use a persistent session store instead of the current in-memory `Map`.
5. Set the cookie `Secure` flag in production HTTPS.
6. Add the deployed origin in Google Cloud authorized JavaScript origins.
7. Do not put a Google client secret in the browser.

Static hosting alone cannot securely verify Google ID tokens because verification must happen server-side. It can still decode the Google credential for a demo identity, which is what this app now does on GitHub Pages.

## Useful Debug Checklist

If the Google button does not show:

- Confirm `VITE_GOOGLE_CLIENT_ID` is set before starting Vite.
- Restart Vite after changing env vars.
- Check the browser console for Google script errors.
- Confirm the current origin is listed in Google Cloud authorized JavaScript origins.

If sign-in opens but fails:

- Confirm `GOOGLE_CLIENT_ID` is set on the server process.
- Confirm `GOOGLE_CLIENT_ID` matches `VITE_GOOGLE_CLIENT_ID`.
- Confirm your Google account is a test user if the app is still in testing mode.
- Check the Vite terminal for `Google auth failed`.

If Convai does not remember:

- Confirm the user is signed in before connecting the coach.
- Confirm `connectCoach` is receiving `endUserId: google:{sub}`.
- Confirm the Convai API key is configured.
- Confirm Convai `client.memoryManager` exists after connection.
- Remember that memory is per coach character id and end user id.

If the coach does not say the user's name:

- Confirm `endUserMetadata.name` is present.
- Confirm `addStudentContext()` is adding the signed-in profile line.
- Avoid forcing every response to use the name; the current prompt says to use it naturally and not overuse it.

## Suggested Follow-Up Work

Good next improvements:

- Add a small debug-only identity badge showing current Convai `endUserId`.
- Add a memory management screen for listing/deleting Convai memories.
- Add a user-visible consent toggle before saving post-game learning memories.
- Move auth endpoints into real production serverless routes.
- Add an integration test around `/api/auth/google` with a mocked Google verifier.
- Code-split the app bundle if the Vite chunk-size warning becomes a priority.
