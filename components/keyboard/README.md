# `components/keyboard`

The virtual bilingual keyboard: **the input device on touch, and the teaching
aid everywhere**. Lesson code imports one thing:

```ts
import { VirtualKeyboard, LanguageSwitch } from "@/components/keyboard";
import { keyFor, charFor, HOME_ROW, FINGER_COLORS } from "@/lib/keyboard-layout";
```

Layout **data** lives in `lib/keyboard-layout.ts` (no React), the **UI** lives
here. A scoring routine or a server component can import the data without
pulling in the components.

---

## `<VirtualKeyboard />`

```ts
interface VirtualKeyboardProps {
  // --- language -------------------------------------------------------
  lang?: Lang;                    // controlled; omit to let the keyboard own it
  defaultLang?: Lang;             // uncontrolled initial value (default "en")
  onLangChange?: (lang: Lang, via: "tap" | "alt-shift" | "api") => void;
  showLanguageSwitch?: boolean;   // default true
  requiredLang?: Lang | null;     // step needs this layout → switch demands Alt+Shift

  // --- lesson spotlight ------------------------------------------------
  highlight?: KeyCode[];          // keys to light up
  dim?: boolean;                  // default: true whenever highlight is non-empty

  // --- output ----------------------------------------------------------
  onKey?: (code: KeyCode, char: string | null, meta: KeyEventMeta) => void;
  onSound?: (kind: "press" | "modifier") => void;

  // --- scaffolding -----------------------------------------------------
  showFingers?: boolean;          // finger colour coding (default false)
  reveal?: boolean;               // true = legends printed, false = blank caps

  // --- input plumbing --------------------------------------------------
  physical?: boolean;             // listen to the hardware keyboard (default true)
  captureKeys?: boolean;          // swallow Space/Tab/Backspace (default true)

  mode?: "auto" | "full" | "focus";
  disabled?: boolean;
  className?: string;
}

interface KeyEventMeta {
  lang: Lang;
  shift: boolean;
  source: "touch" | "physical";
  cap: KeyCap;
}
```

`char` is `null` for modifiers (Shift, Ctrl, Alt, Backspace, Enter, Tab, Caps)
and for any key with no glyph in the active layout. `code` is always a real
`KeyboardEvent.code`.

### `<LanguageSwitch />`

```ts
interface LanguageSwitchProps {
  lang?: Lang;
  defaultLang?: Lang;             // default "en"
  onLangChange?: (lang: Lang, via: "tap" | "alt-shift" | "api") => void;
  requiredLang?: Lang | null;     // mismatch → the switch draws attention
  enableShortcut?: boolean;       // real Alt+Shift handler (default true)
  showHint?: boolean;             // the "press Alt+Shift" coaching line (default true)
  onWrongLang?: (lang: Lang) => void;
  size?: "sm" | "lg";
  className?: string;
}
```

`VirtualKeyboard` renders one by default — mount a standalone one only for a
screen with no keyboard on it.

---

## Driving it from a lesson

A `PressKeyStep` maps onto the props almost one-to-one:

```tsx
const step: PressKeyStep = /* ... */;

<VirtualKeyboard
  lang={lang}
  onLangChange={setLang}
  requiredLang={step.lang}            // demands the switch, never performs it
  highlight={[step.code]}
  reveal={step.hint}                  // hint off ⇒ blank caps ⇒ recall, not recognition
  showFingers={lesson.kind === "keyboard"}
  onKey={(code, char, meta) => {
    if (meta.lang !== step.lang) return wrongLanguage();   // still in the old layout
    if (code === step.code) return correct(char);
    wrongKey(code);
  }}
  onSound={(kind) => audio.play(kind)}
/>
```

For a `BuildWordStep`, resolve the whole word up front and advance the
spotlight one letter at a time:

```tsx
import { keysForText } from "@/lib/keyboard-layout";

const plan = keysForText(step.word, "en");   // [{ cap, shift }, ...]
<VirtualKeyboard highlight={[plan[i].cap.code]} onKey={handle} />
```

### Rules the lesson layer must respect

1. **The keyboard never switches language by itself.** When `requiredLang`
   differs from `lang`, the switch pulses and the hint turns into an
   instruction. The child performs Alt+Shift or taps. `onLangChange` reports
   `via: "alt-shift" | "tap"`, so a lesson can require the real chord and give
   credit for it. This is a graded skill, not chrome.
2. **Match on `code`, never on `char`.** `char` depends on the active layout;
   `code` is the physical key.
3. **`reveal` is the scaffold dial.** Start `true`, drop to `false` once the
   skill's streak justifies it. `highlight` + `dim` is a weaker fade in between: dimmed
   caps drop to 50 % opacity and full greyscale, the same defocus treatment
   the lesson screen applies to everything that is not the current task
   (`.efh-defocus` in `app/globals.css`).
4. **Highlight is also the phone layout.** See below — on a phone, `highlight`
   is what makes the keyboard usable at all, so never leave it empty on a
   press-key step.

---

## Two input modes

* **Touch** — the on-screen keys *are* the input. `onPointerDown` (not click, to
  stay under 100 ms) emits and flashes. On-screen Shift is **sticky**: tap
  Shift, then tap a letter. A child cannot hold two on-screen keys at once.
* **Physical** — a `keydown` listener mirrors the pressed key on screen and
  emits it. It reads **`event.code`, never `event.key`**: `event.key` is the
  character the OS layout produced, so the instant a child switches their OS
  input language to Hebrew (which this app teaches them to do), the physical A
  key reports `event.key === "ש"` and every `event.key` lookup silently breaks.
  `event.code` is the physical position and is `"KeyA"` in every layout on
  earth.

Both modes are live at the same time. A tablet with a bluetooth keyboard works
either way without configuration.

---

## Fitting narrow screens

The board is laid out in percentages of one 15-unit row, so it is **always
exactly as wide as its container and never scrolls sideways**. A keyboard the
child has to drag around is worse than a small one: the whole point is that a
key lives at a fixed position they can learn, and that position has to be on
screen.

| what | how |
| --- | --- |
| key width | `calc(var(--u) * width)`, `--u: 6.667%` — never a pixel minimum |
| cap height | `clamp(20px, min(6.2cqw, 9.5vh), 72px)` — follows the container width, capped against viewport height so a landscape phone still shows all five rows |
| padding / radius | `--kp` and the corner radius scale with the caps |
| legends | the cap sets `font-size: calc(var(--kh) * 0.34)` and every legend is sized in `em`, so text shrinks with the key instead of overflowing it |

At 360 px this gives ~22 px caps. Small, but complete, stationary, and
identical in arrangement to the board on a desktop — which is what makes the
positions learnable.

`mode="auto"` and `mode="full"` both render this full board on every screen.
`mode="focus"` still renders only the highlighted keys as big tiles, but no
size or viewport triggers it any more: a caller has to ask for it, so the
keyboard never rearranges itself underneath a child mid-lesson.

---

## Keycaps

Each cap is drawn the way an Israeli keycap is printed: **English legend
top-left, Hebrew legend bottom-right, always both, always in the same place.**
Only the emphasis moves — the active layout's glyph is large and inked, the
other is small and 45 % opacity. Learning to read the physical keycap is part
of the curriculum, so the on-screen cap has to look like the real one.

`F` and `J` carry a drawn bar matching the physical bumps.

Finger colour coding (`showFingers`) uses `FINGER_COLORS` (Okabe–Ito,
colour-blind safe) and is **never colour alone** — every swatch also carries a
shape from `FINGER_SHAPES` and a bilingual name from `FINGER_LABELS`.

Press feedback is transform + colour + ring, 60 ms, plus the `onSound` hook.
`prefers-reduced-motion` is already neutralised globally in `app/globals.css`;
nothing here fights it, and the colour channel survives on its own.

---

## The Hebrew layout

`lib/keyboard-layout.ts` encodes the **classic Windows `KBDHEB` / SI-1452**
arrangement — the one silk-screened on hardware sold in Israel — not the 2018
SI-1452-2 revision. The file header documents the sources it was verified
against and the three things that trip people up: the five sofit forms live at
the **right-hand ends of the rows** (ן·I, ם·O, ך·L, ף·Semicolon, ץ·Period), the
comma and full stop are displaced onto the Quote and Slash keys, and Hebrew has
no case so `he.upper === he.lower` on every letter key.
