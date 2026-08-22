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

## The hundred levels

The track is generated, and it is generated to fit three declared phases:

| levels | phase |
|---|---|
| 1–50 | **the alphabet** — every letter introduced and immediately spent on a real word inside its own lesson. Level 50 is A to Z. |
| 51–75 | **words** — no new letters, just more of them per level (2 → 5), and part way through the keyboard stops showing you where the key is. |
| 76–100 | **sentences** — "I SEE A CAT", typed word by word, space bar included. |

Then conversation mode, which unlocks on evidence rather than on levels.

The numbers live in `lib/pedagogy.ts` §9; `TRACK_SHAPE` is computed from the
built track so "all 26 letters by level 50" is something the code checks
rather than something a comment claims.

## Principles

- **Never in a vacuum.** Every letter learned is immediately spent — on a word,
  in the same lesson, and eventually in a sentence and a conversation.
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

## The app's voice

Everything spoken — letter names, letter sounds, words, sentences, and the
first-visit walkthrough — plays a **recorded human voice** when one exists, and
falls back to browser TTS only for lines nobody has recorded yet. The 50
sentences of levels 76–100 are all in that second category right now: they read
in the browser voice until somebody records them, which needs no deploy. Recording happens at
`/studio`, from a phone, and a line is audible in the app seconds later with no
deploy. See `docs/voice.md`.

## Development

```bash
npm install
npm run dev
npm run typecheck
```

See `docs/` for the research basis and the architecture notes.
