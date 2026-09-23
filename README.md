# Ski Coach AI

Voice notes for ski coaches, filed by skier and summarized by AI. Built to work
on a mountainside with patchy signal: everything happens on the phone first
and syncs when there's a connection.

- **Client:** React + Vite, wrapped as an iOS app with Capacitor 8
- **Server:** Express + Drizzle on Postgres (Neon), hosted on Render
- **AI:** OpenAI `gpt-transcribe` for transcripts, a small reasoning model for
  routing notes to skiers and for structured summaries

Deploying and shipping to TestFlight: see [DEPLOY.md](DEPLOY.md).

## How offline-first works

```
iPhone                                              Server (Render)
 React UI ── reads/writes ──> SQLite (source of truth)
                               ├─ skiers, notes, summaries
                               └─ outbox (queued work)
 VoiceNote plugin (Swift)          │
  mic ─> .m4a file on disk         │  sync engine, whenever there's signal
  mic ─> Apple on-device speech    └──────────────> /api/sync/push   (upserts, idempotent)
         (live transcript, offline)                 /api/sync/pull   (changes since cursor)
                                                    /api/notes/:id/transcribe
                                                    /api/skiers/:id/summaries/:id
```

- Every change writes the local row **and** an outbox entry in one SQLite
  transaction, so nothing saved can be forgotten by sync.
- IDs are generated on the phone, so retries never create duplicates.
- The outbox has two lanes: data (skiers/notes, strictly in order, batched) and
  AI (transcription, summaries; only once data is uploaded).
- Failures back off from 2s to a 5-minute cap and retry forever. A regained
  connection, the app returning to the foreground or "Sync now" retries
  immediately. Expired sign-in pauses the queue without dropping anything; ops
  the server permanently rejects are parked in Settings for review.
- Conflicts: last writer wins on the device clock, except that a stale device
  copy can't undo the cloud transcript or the AI's skier assignment, and the
  coach's own edits and manual assignments always win (`server/merge.ts`).

## Voice notes

The native plugin in `plugins/voice-note` taps the microphone once and feeds
both an AAC `.m4a` file and Apple's on-device speech recognizer, with ski
terms and skier names as hints. The note is saved the moment recording stops,
filed by a local whole-word name match. When online, the audio is uploaded,
re-transcribed by OpenAI, and the AI confirms or corrects which skier(s) it's
about, splitting notes that cover several skiers.

## Sign-in and keys

- **Demo passcode:** AI runs on the server's `OPENAI_API_KEY` (rate-limited per
  account).
- **Bring your own key:** the key is checked against OpenAI, kept in the iOS
  Keychain, and sent as `X-OpenAI-Key` with AI requests only.
- Coaches can also start without signing in; their work stays on the phone
  and uploads after they sign in.

## Development

```bash
npm install
cp .env.example .env      # fill in DATABASE_URL at minimum
npm run dev               # API + web app on http://localhost:5000
npm test                  # sync engine, merge rules, name matching
npm run check             # typecheck
```

The browser build uses sql.js (persisted to IndexedDB) and the browser's
recorder, so the whole offline flow can be tried with the DevTools "Offline"
switch. The iOS build needs Node 22+ for the Capacitor CLI (`npm run ios:sync`)
and is compiled on Codemagic.

Schema changes: edit `shared/schema.ts`, run `npm run db:generate`, commit the
new file in `migrations/`. The server applies migrations at startup.
