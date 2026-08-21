# Colour philosophy — "loud where it counts, calm where it matters"

The app was built to be **impossible to misread**. Rules 1–5 in
`app/globals.css` are what that means in practice: one action per screen,
64px targets, three redundant channels on every instruction, Hebrew RTL /
English LTR, nothing behind a gesture.

Those rules produced a screen that a six-year-old cannot get wrong, and that
nobody wants to look at for twenty minutes. White cards, on a white page,
under a white header.

This document is how colour gets added **without spending any of the
foolproofness.** The short version lives as rules 6–9 in `globals.css`; this
is the reasoning, and the parts a reviewer needs to argue with.

---

## The one idea

> **Colour is what makes a child want to come back. It is never what tells
> them what to do.**

Every rule below is a consequence of that sentence. If a change would make
the app prettier by making a colour load-bearing, the change is wrong, no
matter how much better it looks.

---

## Rule 6 — Colour is the fourth channel, never the first

Rule 3 already says every instruction carries three redundant channels:
Hebrew text, an icon, and colour. Rule 6 says the colour we are *adding* is
a fourth thing on top — decoration that reinforces, never a channel that
carries.

A child using this app may be six years old, may not read Hebrew fluently
yet, and may be colour-blind (1 in 12 boys). A colour they cannot decode
must never be the difference between finishing a lesson and being stuck.

**The greyscale test.** Put the screen behind `filter: grayscale(1)`. If a
child could still finish the step, colour is decoration and the change is
safe. If they could not, meaning has leaked into hue and has to be moved
back out into text or shape.

This is not hypothetical: it is the exact treatment the walkthrough already
applies to everything outside its spotlight, so the test costs one line.

---

## Rule 7 — One loud thing per screen

Rule 1 says there is one primary action and it is the biggest thing on the
screen. Rule 7 says it is also the **most saturated** thing on the screen.

Saturation is the scarce resource here. A screen with six colourful things
has no primary action, whatever the size of the buttons — the eye picks a
winner by chroma before it picks one by area. So everything that is not the
one action lives in **tints**: soft surfaces carrying full-contrast ink.

**The squint test.** Squint at the screen. The most colourful shape must be
the thing to tap.

---

## Rule 8 — Hue is identity, not state

This is the rule that lets the app be colourful at all.

- Colour belongs to things that **are** something: this lesson, this letter,
  this word. A lesson keeps its hue for the life of the app, so moving from
  `האות A` to `האות B` visibly changes rooms, and the track reads as a
  journey instead of a spreadsheet.
- Colour never belongs to things that **happen**: right, wrong, locked,
  done. Those keep the fixed semantic set — go / stop / star / warn — plus
  an icon plus a Hebrew sentence.

A child is never asked to learn what a colour means. They learn that the
letter lessons are each their own colour, which is not a fact they have to
recall to answer anything.

### Why there is no green, gold or red in the identity palette

This is the part that got caught in review and is worth stating loudly.

The semantic colours already own part of the colour wheel: **stop 25°,
warn 65°, star 85°, go 150°.** The first version of the identity palette had
eight hues including a coral, a gold and a leaf green — and the first
screenshot showed a giant **green letter A** sitting above a green progress
bar. Nothing had gone wrong technically. It just read as *"A is correct"*.

So the identity palette is confined to the arc the state colours do not
use, and every identity hue is at least **25° from the nearest semantic
hue**. Six hues that never lie beat eight that sometimes do.

| Hue | Angle | Nearest state hue |
|---|---|---|
| teal | 190° | 40° from go |
| aqua | 215° | 50° from go |
| sky | 240° | 25° from brand |
| violet | 292° | 27° from brand |
| orchid | 315° | 50° from stop |
| rose | 340° | 45° from stop |

**The one place hue and state touch** is a locked lesson row: it keeps its
identity hue but is desaturated. That is allowed because it is the fourth
channel there, behind the 🔒 glyph, the `disabled` attribute and the
dimming — remove the colour entirely and nothing is lost.

---

## Rule 9 — Paint the room, not the furniture

Colour arrives as **large, soft, low-contrast surfaces behind content**: the
page wash, a row tint, a card's top rim, a giant letter. Text, icons and
borders stay full-contrast on near-white.

This is the whole trick for adding a lot of colour without touching
legibility. A pale wash behind a paragraph costs nothing — body ink still
reads at 15:1 on top of it. Tinting the paragraph itself would cost
everything.

### Every colour is a pair, and every pair is a token

A hue is never used alone. It ships as `--color-<name>-soft` (a surface) and
`--color-<name>-ink` (what is allowed on it), chosen together and verified
together. Components never invent a colour; they take a token.

Verified before being written down — all six pairs:

| Pair | ink on soft | ink on white |
|---|---|---|
| teal | 6.20:1 | 7.24:1 |
| aqua | 6.33:1 | 7.45:1 |
| sky | 6.72:1 | 8.04:1 |
| violet | 7.34:1 | 8.95:1 |
| orchid | 7.45:1 | 9.07:1 |
| rose | 7.38:1 | 9.12:1 |

AA needs 4.5:1. Body ink on any tint stays at 13:1.

If you find yourself writing `color: var(--tint)` on text, you want
`--tint-ink`. If the pair you need does not exist, add a pair — never a hex.

---

## Where the colour actually went

| Surface | Before | After | Which rule |
|---|---|---|---|
| Page background | flat near-white | two very pale washes, sky and rose | 9 |
| Lesson rows | white, identical | each wears its lesson's identity hue, with a ringed glyph badge | 8 |
| Locked rows | white, dimmed | hue + desaturated + 🔒 | 8 |
| Cards | white slab | white, with a 6px rim in the ambient hue | 9 |
| Giant letter | near-black | the lesson's identity ink | 8, 9 |
| Star counter | white card | star-tinted well | 8 |
| Primary action | green | unchanged — still the only saturated thing | 7 |
| **The keyboard** | neutral | **unchanged, deliberately** | below |

### The keyboard stays furniture

The board is the one surface that gets no identity colour at all, and this is
a rule, not an oversight.

It is a reference instrument a child is trying to memorise the shape of.
Every coloured cap is a landmark competing with the one cap that matters —
the highlighted key. So caps stay neutral, the highlight stays brand-blue,
and the finger-position colours (`showFingers`) remain the single exception,
because they are a genuine teaching channel and they already carry a shape
and a bilingual label alongside the colour.

---

## Adding colour later: the checklist

1. Does it survive `filter: grayscale(1)`? (rule 6)
2. Is the primary action still the most saturated thing? (rule 7)
3. Is the hue describing what something **is**, not what **happened**?
   Is it ≥25° from every semantic hue? (rule 8)
4. Is the colour behind the content rather than on the text? (rule 9)
5. Is it a `soft`/`ink` pair from `:root`, contrast-checked at ≥4.5:1?
6. Is it on the keyboard? Then no.

---

## Where the pieces live

| Thing | File |
|---|---|
| Rules 1–9, tokens, page wash, `.efh-tint` / `.efh-badge` | `app/globals.css` |
| Hue assignment (`hueFor`, `tintStyle`) | `lib/palette.ts` |
| Tinted rows and badges | `components/home/HomeScreen.tsx` |
| Hue carried onto a lesson screen | `components/lesson/LessonPlayer.tsx` |
| Card rim | `components/ui/kit.tsx` |
| Deliberately untouched | `components/keyboard/*` |
