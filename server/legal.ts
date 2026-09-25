import type { Express } from "express";

// Public pages App Store Connect links to (privacy policy and support URL).
// Keep them in step with what the app and server actually do with data.

const CONTACT = "theowenmorris@gmail.com";
const UPDATED = "September 24, 2026";

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Ski Coach AI</title>
<style>
  body { font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2933; background: #fafafa; margin: 0; }
  main { max-width: 680px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 1.8rem; margin-bottom: 0.2rem; }
  h2 { font-size: 1.15rem; margin-top: 2rem; }
  .muted { color: #6b7280; font-size: 0.9rem; }
  a { color: #1d4ed8; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

const privacy = page(
  "Privacy Policy",
  `
<h1>Privacy Policy</h1>
<p class="muted">Ski Coach AI · Last updated ${UPDATED}</p>

<p>Ski Coach AI is a note-taking tool for ski and snowboard coaches. A coach records voice notes about the
people they coach, and the app files and summarizes them. This policy explains what the app stores, where, and
why.</p>

<h2>What the app stores</h2>
<ul>
  <li><strong>Skier profiles</strong> the coach creates: a name, and optionally an age, ability level, equipment
  (ski or snowboard), a short description to help spot them on the hill, and a photo.</li>
  <li><strong>Coaching notes</strong>: the text of the coach's voice notes, and AI-written summaries of them.</li>
  <li><strong>Voice recordings</strong>: stored on the coach's phone only.</li>
  <li><strong>A random device ID</strong> that identifies the coach's notebook. We do not collect names, email
  addresses or phone numbers from coaches, and there are no user accounts beyond this ID.</li>
</ul>

<h2>Why names, ages and photos are stored</h2>
<p>Coaches often work with several groups a day. The skier's name is how voice notes are filed ("Sam needs to
keep his hands forward" goes under Sam). Age and level help the AI word its summaries appropriately. The
optional photo and description help the coach recognize who's who in a group wearing helmets and goggles. None
of this is used for anything else.</p>

<h2>Where data goes</h2>
<ul>
  <li><strong>On the phone:</strong> everything is saved on the device first, so the app works without signal.</li>
  <li><strong>Our server:</strong> when signed in, profiles, photos, note text and summaries are synced to our
  server (hosted by Render, with the database at Neon) so they are backed up and available to the AI features.
  Data is sent over HTTPS.</li>
  <li><strong>OpenAI:</strong> to transcribe a recording, the audio is sent through our server to OpenAI and is
  not kept on our server. To file notes under the right skier and to write summaries, note text and the names,
  ages and levels of the coach's active skiers are sent to OpenAI. OpenAI processes this data to provide the
  service under its API terms and does not use API data to train its models. If the coach signs in with their
  own OpenAI key, requests are made on the coach's own OpenAI account.</li>
</ul>
<p>The app works without any of this: if you choose "Continue without signing in", notes stay on the phone and
on-device Apple speech recognition is used, and nothing is sent to our server or to OpenAI.</p>

<h2>What we don't do</h2>
<p>No advertising, no tracking across apps or websites, no analytics SDKs, and we never sell or share data
with anyone other than the service providers above.</p>

<h2>Your OpenAI key</h2>
<p>If you sign in with your own OpenAI API key, it is stored in the iOS Keychain on your phone and sent to our
server only with AI requests so they can be forwarded to OpenAI. It is never stored on our server or logged.</p>

<h2>Keeping and deleting data</h2>
<p>Data is kept until you delete it. Deleting a note or skier in the app removes it from the app on every device
and marks it deleted on our server on the next sync. To permanently erase everything we hold for your device, email <a href="mailto:${CONTACT}">${CONTACT}</a> and we will
remove it within 30 days. Deleting the app removes everything stored on the phone.</p>

<h2>Children</h2>
<p>The app is used by coaches, not by the skiers they coach. Coaches who record information about minors should
have the parent's or guardian's permission to do so, as they would for any coaching records.</p>

<h2>Changes and contact</h2>
<p>We'll update this page if anything changes. Questions: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
`,
);

const support = page(
  "Support",
  `
<h1>Ski Coach AI Support</h1>
<p>Voice notes for ski coaches, filed by skier and summarized by AI.</p>

<h2>Contact</h2>
<p>Email <a href="mailto:${CONTACT}">${CONTACT}</a>. We usually reply within a couple of days.</p>

<h2>Common questions</h2>
<p><strong>Do I need signal?</strong> No. Recording and notes work offline, and everything syncs automatically
when you're back in range or reopen the app.</p>
<p><strong>How do I sign in?</strong> Use the passcode you were given, or your own OpenAI API key. You can also
continue without signing in and keep notes on your phone only.</p>
<p><strong>Something didn't sync.</strong> Open Settings to see any failed items and the error message, and
include it when you email us.</p>
<p><strong>Privacy:</strong> see our <a href="/privacy">privacy policy</a>.</p>
`,
);

export function registerLegalRoutes(app: Express) {
  app.get("/privacy", (_req, res) => res.type("html").send(privacy));
  app.get("/support", (_req, res) => res.type("html").send(support));
}
