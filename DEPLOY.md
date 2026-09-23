# Getting Ski Coach AI onto TestFlight

No Mac needed. The server runs on Render (free), the database on Neon (free),
and the iOS build happens on a Codemagic cloud Mac, which uploads straight to
TestFlight.

Rough time: 1–2 hours the first time, mostly clicking through web consoles.

---

## 1. Database: Neon (free)

1. Sign in at <https://console.neon.tech> and create a project (any region near
   your Render region, e.g. US West / Oregon).
2. Copy the **pooled connection string** (`postgresql://...neon.tech/...?sslmode=require`).

The server creates its own tables (in a `skicoach` schema) the first time it
starts. Nothing to run by hand.

## 2. Server: Render (free)

1. Push this branch to GitHub (`git push origin capacitor`).
2. At <https://dashboard.render.com> choose **New > Blueprint**, pick the
   `SkiCoachAI` repo and the `capacitor` branch. Render reads `render.yaml`.
3. Fill in the secret values it asks for:
   - `DATABASE_URL`: the Neon string from step 1
   - `DEMO_PASSCODE`: whatever passcode you'll give demo users
   - `OPENAI_API_KEY`: **our** key, used only for passcode sign-ins. Create a
     separate OpenAI *project* key with a monthly budget cap for this.
   - `TOKEN_SECRET` is generated automatically.
4. Deploy, then open `https://<your-service>.onrender.com/api/health`. It should
   return `{"ok":true,...}`.
5. If the URL isn't `https://skicoach-api.onrender.com`, change `VITE_API_BASE`
   in `codemagic.yaml` to match.

Free Render services sleep after 15 minutes idle and take ~50s to wake. The app
is built for that: it saves everything locally and syncs in the background, so
users never wait on it. Upgrade to the $7/month plan if the delay ever matters.

You can also try the whole app in a phone or desktop browser at the Render URL
(voice uses the browser's recorder there instead of the native one).

## 3. Apple: App ID and app record

1. <https://developer.apple.com/account/resources/identifiers/list> > **+** >
   App IDs > App > Explicit bundle ID `com.tandoproductions.skicoachai`,
   description "Ski Coach AI". No extra capabilities needed.
2. <https://appstoreconnect.apple.com> > Apps > **+** > New App: iOS, name
   "Ski Coach AI" (must be unique on the App Store; add a suffix if taken),
   bundle ID from above, SKU `skicoachai`.
3. Open the app > **App Information** and copy the numeric **Apple ID**. Put it
   in `codemagic.yaml` as `APP_STORE_APPLE_ID`.

## 4. Apple: App Store Connect API key

Reuse the key from the Unity setup if you still have its `.p8` file; otherwise:

1. App Store Connect > Users and Access > **Integrations** > App Store Connect
   API > Team Keys > **+**, role **App Manager**.
2. Download the `.p8` (only downloadable once) and note the **Key ID** and
   **Issuer ID**.

## 5. Codemagic

1. Sign up at <https://codemagic.io> with GitHub (personal account: 500 free
   macOS minutes/month; one build is ~10–15 minutes).
2. **Team settings > Integrations > Developer Portal > Connect**: name it
   exactly `SkiCoach ASC Key` (matches `codemagic.yaml`), paste Issuer ID and
   Key ID, upload the `.p8`.
3. **Code signing identities > iOS certificates**: either upload the
   distribution `.p12` you use for the Unity game (plus its password), or click
   **Generate certificate** (Apple Distribution) and keep the downloaded file.
4. Add the app: **Add application** > GitHub > `SkiCoachAI` > configuration
   `codemagic.yaml`.

The App Store provisioning profile is created automatically at build time.

## 6. Build and install

1. In Codemagic, **Start new build** > branch `capacitor` > workflow
   *iOS to TestFlight*.
2. When it's green, the build appears in App Store Connect > TestFlight after
   ~10–30 minutes of Apple processing.
3. TestFlight > **Internal Testing** > create a group, add yourself (anyone on
   your App Store Connect team, up to 100 people, no review needed).
4. Install the **TestFlight** app on your iPhone and accept the invite.

External testers (people outside your team) need a one-time Beta App Review
(usually 1–2 days) and a short test description.

## 7. First run checklist (on the iPhone)

- Sign in with the passcode (or "My OpenAI key").
- Add two skiers. Put the phone in **airplane mode**.
- Record a note mentioning one skier by name: it should be filed under them
  with an on-device transcript, and the badge shows "Offline · N waiting".
- Record a few more, add a typed note, request a summary (shows "Queued").
- Force-quit the app, reopen, check everything is still there.
- Turn airplane mode off: the badge goes to "Syncing…" then "All synced", the
  transcripts switch to "Cloud transcript", and the summary appears.

---

## Configuration reference

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Render | Postgres (Neon) connection string |
| `TOKEN_SECRET` | Render | Signs sign-in tokens (auto-generated) |
| `DEMO_PASSCODE` | Render | Shared demo passcode; blank disables passcode sign-in |
| `OPENAI_API_KEY` | Render | Our key, used only for passcode sign-ins |
| `OPENAI_TRANSCRIBE_MODEL` | Render | Default `gpt-transcribe` |
| `OPENAI_TEXT_MODEL` | Render | Summaries and note routing; default `gpt-5.6-luna` |
| `OPENAI_REASONING_EFFORT` | Render | `low` (default); `none` for non-reasoning models |
| `AI_RATE_LIMIT_PER_HOUR` | Render | Per-account cap on AI calls using our key |
| `VITE_API_BASE` | codemagic.yaml | Server URL baked into the app (changeable in-app under Settings) |
| `APP_STORE_APPLE_ID` | codemagic.yaml | Numeric app id, used to auto-increment the build number |

Users who sign in with their own OpenAI key are billed on their key; it is
stored in the iOS Keychain and sent with each AI request, never saved on the
server.
