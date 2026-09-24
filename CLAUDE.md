# CLAUDE.md

Guidance for Claude Code (and humans) working on Ski Coach AI. Read this
first; README.md explains the architecture and DEPLOY.md the first-time setup.
This repo is public: never put keys, passcodes or personal data in it.

## What this is

Voice notes for ski coaches, filed by skier and summarized by AI. A Vite +
React web app wrapped as an iOS app with **Capacitor 8** (not React Native,
not Unity), plus an Express + Postgres API. The working branch is
**`capacitor`**; `main` is the old Replit prototype.

## Product rules (decided with the owner, don't change them unannounced)

- **Offline-first is a hard requirement.** It's used on mountainsides with
  signal that comes and goes. Every user action writes to on-device SQLite plus
  a durable outbox (`client/src/data`) and never waits on the network. The
  sync engine (`client/src/sync/engine.ts`) retries forever with backoff and
  flushes when signal returns or the app is reopened. New features go through
  the outbox too.
- **Keys:** our OpenAI key lives only on the server (Render env). Users can
  instead sign in with their own OpenAI key, which is stored in the iOS
  Keychain and sent as `X-OpenAI-Key` only on AI requests. Never embed a key
  in the app.
- **Sign-in:** either a shared demo passcode (`DEMO_PASSCODE`, AI on our key,
  rate-limited) or bring-your-own key. The account id is the device id.
- **Speech-to-text:** on-device Apple Speech first (works offline), then
  OpenAI `gpt-transcribe` plus AI skier routing when online. The coach's own
  edits and manual assignments always win (`server/merge.ts`).
- **Add skier by voice** (Add Skier page): the on-device transcript goes to
  `POST /api/ai/parse-skier`, which returns name, age, level and notes, and the
  skier is saved straight away. With no signal or no sign-in,
  `client/src/lib/parse-skier.ts` parses it on the phone instead. If the name
  or level is missing, the form is pre-filled for the coach to finish.
- **Home layout:** quick voice notes are recorded from the big center mic in
  the bottom nav (Skiers | mic | Settings). "Add skier" is the + in the Home
  header.
- **Archived skiers** keep all their notes but are excluded from voice-note
  name matching: the phone only guesses among active skiers
  (`listSkiers`), and the server's AI routing roster skips archived ones. This
  lets several skiers share a name as long as only one is active.
- **Skier photos** are optional. The phone resizes them (the coach positions it in
  a circle, then it's saved as a 640px square plus a 192px thumbnail, as JPEG
  data URLs) and keeps them in the local
  `skier_photos` table. They upload one at a time through the ordered data lane
  (`PUT /api/skiers/:id/photo`) and download after a pull whenever the server's
  `photoUpdatedAt` is newer.
- **Skier page layout, top to bottom:** photo card (tappable circle photo
  with a cropper, name, level and age, how to spot them), the AI summary, then
  the notes. The mic is pinned alone in a bottom bar (`RecordBar`), and every
  note recorded there is filed under that skier. There's deliberately no
  typed-note box.
- **Ski vs snowboard:** each skier has a current `equipment` (`ski` or
  `snowboard`). Every note and every summary carries its own equipment, so a
  person who does both has two separate sets.
  - The skier page's switch picks which set is shown, and the pinned mic
    records into it.
  - Quick notes from Home, and any note assigned to a skier (by the coach or
    the AI), take that skier's current equipment.
  - Summaries are generated only from notes with the same equipment.
  - Older app builds that don't send `equipment` keep what the server already
    has.
- No Replit (hosting or auth).

## Where things run

| What | Where |
|---|---|
| API server | Render web service `skicoach-api` (`srv-daq4pp8473hc73cksfh0`), https://skicoach-api.onrender.com, free plan (sleeps after 15 min idle, ~50s cold start). Config in `render.yaml`; secrets set in the Render dashboard. |
| Database | Neon Postgres, schema `skicoach`. Migrations in `migrations/` are applied automatically when the server starts. |
| iOS builds | Codemagic, workflow `ios-testflight` in `codemagic.yaml`, run from a **personal** Codemagic account (the free minutes don't apply to teams). |
| Distribution | TestFlight internal testing. Bundle id `com.tandoproductions.skicoachai`. |

Server env vars: `DATABASE_URL`, `TOKEN_SECRET`, `DEMO_PASSCODE`,
`OPENAI_API_KEY`, `OPENAI_TRANSCRIBE_MODEL` (default `gpt-transcribe`),
`OPENAI_TEXT_MODEL` (default `gpt-5.6-luna`), `OPENAI_REASONING_EFFORT`,
`AI_RATE_LIMIT_PER_HOUR`. See `.env.example`.

## Shipping changes

- **Server:** push to `capacitor`. Render deploys automatically in about 2
  minutes. Check it with `render deploys list srv-daq4pp8473hc73cksfh0 -o json`
  (look for status `live` and your commit).
- **App (anything under `client/`, `plugins/`, `ios/`):** push to `capacitor`,
  then **the owner starts a build in Codemagic** (branch `capacitor`,
  workflow "iOS to TestFlight"). Claude can't trigger Codemagic. The build
  runs tests, builds the web app with `VITE_API_BASE`, runs `cap sync ios`,
  bumps the build number from TestFlight and uploads. Allow ~15 minutes for the
  build plus 10–30 minutes of Apple processing, then update through the
  TestFlight app. JS-only changes still need a new build (there's no live
  update).
- **Before pushing:** `npm test`, `npm run check`, `npm run build`. Check
  `git status` so `.env` is never committed.
- **Schema change:** edit `shared/schema.ts`, run `npm run db:generate`,
  commit the new migration.

## Debugging production

Work from evidence: server logs plus the exact error text shown on the phone
(Settings → failed items). Don't guess.

- **Render CLI:** install from github.com/render-oss/cli releases, then run
  `render login` and `render workspace set`. Tail logs with
  `render logs -r srv-daq4pp8473hc73cksfh0 --limit 200 -o text` (add
  `--start <ISO time>`; filter out the `/api/health` noise).
- **Log markers:**
  - `[transcribe]`: upload size, type and auth mode
  - `[api-error]`: status, code and reason for a refused request
  - `[openai-error]`: OpenAI's status, code and message

  Keys and note text are never logged.
- If the phone reports a failure but the server has no matching request, the
  failure happened on the device.

## Gotchas learned the hard way

- **Swift can't be compiled on Windows.** `plugins/voice-note` (recorder plus
  on-device speech) is first compiled on Codemagic. Check Swift against the
  sources in `node_modules/@capacitor/ios` before pushing, and add on-device
  diagnostics so one build either fixes or pinpoints a problem.
- **The Capacitor 8 CLI needs Node 22.** Locally you can use
  `npx -y -p node@22 node node_modules/@capacitor/cli/bin/capacitor sync ios`
  (pod install is skipped on Windows; it happens on Codemagic).
- **Capacitor serves `.m4a` files with a non-HTTP response**, so
  `fetch(convertFileSrc(path))` reports status 0. Judge by the bytes, not
  `res.ok`. This was the first production bug.
- **`server.iosScheme: 'https'` is silently ignored.** The app origin is
  `capacitor://localhost`, which the server's CORS allowlist covers.
- **Render can serve a stale build.** Once, a deploy reported `live` for the
  new commit while still answering like the previous build (the new routes
  returned Express "Cannot GET" 404s). Rebuilding without the build cache fixed
  it: `render deploys create srv-daq4pp8473hc73cksfh0 --commit <sha>
  --clear-cache --wait --confirm`. After every server deploy, call any new
  route without auth and expect 401, not 404.
- **Code signing:** `ios_signing` only uses profiles already in Codemagic; it
  doesn't create them. The App Store profile `SkiCoach App Store` uses a
  Codemagic-generated Apple Distribution certificate. The same Apple account
  signs another app (a Unity game), so never revoke existing certificates.

## Status (2026-09-23)

Running on TestFlight. Offline recording, sync, cloud transcription and AI
skier routing are verified in production. Not yet verified in production:
AI summaries, multi-skier note splitting, adding a skier by voice (AI
path), archiving and photos on a device, ski vs snowboard summaries, signing in with your own key on a device, and a long offline backlog
on a device.
