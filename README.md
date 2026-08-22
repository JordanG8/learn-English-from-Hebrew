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
  from spaced retrieval, not on lessons clicked through. And it is still
  practice: the child writes to the AI on the app's own bilingual keyboard, and
  the AI can hand back a word to fill in — 🐱 חתול `C _ T` — which is graded
  and fed to the SRS like any lesson. See `docs/architecture.md` §5.
- **Impossible to misread.** One action per screen, 64px+ targets, Hebrew
  instructions, redundant icon + colour + text.

## Stack

Next.js (App Router) · TypeScript · Tailwind v4 · Vercel · AI Gateway for
conversation mode.

## The app's voice

Everything spoken — letter names, letter sounds, words, and the first-visit
walkthrough — plays a **recorded human voice** when one exists, and falls back
to browser TTS only for lines nobody has recorded yet. Recording happens at
`/studio`, from a phone, and a line is audible in the app seconds later with no
deploy. See `docs/voice.md`.

## Development

```bash
npm install
npm run dev
npm run typecheck
```

See `docs/` for the research basis and the architecture notes.
