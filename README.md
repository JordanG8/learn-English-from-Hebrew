# אנגלית מההתחלה — English From Hebrew

A practice experience for Hebrew-speaking children (ages 7–12) learning the
English alphabet, built to fill the gap that live instruction leaves: the
repetitive, unglamorous drilling of letter names, letter sounds, letter shapes,
and where those letters actually live on a physical keyboard.

## Why it exists

Objective-led English missions (talking to NPCs, following quests) work well
*once a child already has letters*. Before that point there is nothing to hang a
mission on, and the drilling falls to a teacher repeating "what sound does A
make?" one child at a time. This app carries that load, and carries it with the
reward structure the drilling normally lacks.

## Principles

- **Never in a vacuum.** Every letter learned is immediately spent — on a word,
  on a key, and eventually on a conversation.
- **The keyboard is content, not chrome.** Hebrew-speaking kids type on a
  dual-layout keyboard. Where `A` is, and how to get from עברית to English with
  Alt+Shift, is a taught skill here.
- **Mastery is measured, not assumed.** Conversation mode unlocks on evidence
  from spaced retrieval, not on lessons clicked through.
- **Impossible to misread.** One action per screen, 64px+ targets, Hebrew
  instructions, redundant icon + colour + text.

## Stack

Next.js (App Router) · TypeScript · Tailwind v4 · Vercel · AI Gateway for
conversation mode.

## Development

```bash
npm install
npm run dev
npm run typecheck
```

### Recording the voice

The app ships with a synthetic voice and is meant to be re-voiced by a human —
`/record` is the studio for that. It reads the script out of the curriculum
(letter names, letter sounds, every word, the Hebrew narration of the
walkthrough, the praise lines), prompts one line at a time, and saves each take
straight into the browser, where the app plays it back immediately.

```bash
npm run dev            # then open http://localhost:3000/record
npm run audio:manifest # only if you edit public/audio by hand
```

When a session is done, "ייצוא חבילת קול" downloads a zip; unpack it into
`public/` so the files land in `public/audio/` next to `manifest.json`, and
commit them. From then on every child hears the recording, and anything not yet
recorded quietly falls back to the browser's speech synthesis.

See `docs/` for the research basis and the architecture notes — the voice
pipeline is architecture §9.
