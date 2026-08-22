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

## The app's voice

Everything spoken — letter names, letter sounds, words, and the first-visit
walkthrough — plays a **recorded human voice** when one exists. Recording
happens at `/studio`, from a phone, and a line is audible in the app seconds
later with no deploy.

A line nobody has recorded is spoken by a **speech model** through the Vercel
AI Gateway, generated once and cached, and only then by the browser's own
robotic voice. See `docs/voice.md`.

## Saying it back

`/speak` points the microphone the other way: the child says an English word
and sees **the word the model heard**. It never says "wrong" — a phone
microphone mishears — and it never feeds the mastery spine, which grades only
evidence it can trust. Nothing recorded there is stored.

## Development

```bash
npm install
npm run dev
npm run typecheck
```

See `docs/` for the research basis and the architecture notes.
