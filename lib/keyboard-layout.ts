/**
 * THE PHYSICAL KEYBOARD, AS AN ISRAELI CHILD MEETS IT.
 *
 * Every entry describes ONE physical key by its layout-independent
 * `KeyboardEvent.code`, plus what that key produces in US-English QWERTY and in
 * the Hebrew layout shipped on every keyboard sold in Israel.
 *
 * ---------------------------------------------------------------------------
 * WHICH HEBREW LAYOUT
 * ---------------------------------------------------------------------------
 * We encode the *classic* Hebrew layout — Windows `KBDHEB`, the direct
 * descendant of SI-1452 and the arrangement physically silk-screened on Israeli
 * keycaps. This is deliberately NOT the 2018 "Hebrew (Standard, 2018)" /
 * SI-1452-2 revision (`KBDHEBSI`, nicknamed ארקן): that revision only relocates
 * diacritics and adds geresh/gershayim on AltGr, and it is not what is printed
 * on the hardware in front of the child. Teaching the printed layout is the
 * whole point.
 *
 * SOURCES VERIFIED AGAINST (two independent, plus a third for the shift rule):
 *   1. Microsoft / Windows `KBDHEB` layout tables as published at
 *      kbdlayout.info/KBDHEB/ and learn.microsoft.com/globalization/keyboards/kbdheb
 *      — the canonical implementation of the standard.
 *   2. Wikipedia, "Hebrew keyboard" (SI-1452, Standards Institute of Israel),
 *      cross-checked against the Culmus Project's SI-1452 chart
 *      (culmus.sourceforge.io/si1452.html).
 *   3. For the mirrored paired delimiters: the Unicode/Windows RTL keyboard
 *      convention that paired delimiters are stored *logically*, so Shift+9
 *      emits U+0029 ")" and BiDi mirroring renders it as an opening bracket.
 *
 * ---------------------------------------------------------------------------
 * THINGS THAT SURPRISE PEOPLE (and are correct here)
 * ---------------------------------------------------------------------------
 * • The five sofit (final) forms — ך ם ן ף ץ — do NOT sit next to their base
 *   letters. They sit at the right-hand end of the rows: ן on I, ם on O,
 *   ך on L, ף on Semicolon, ץ on Period. The layout descends from Hebrew
 *   mechanical typewriters, where the finals were grouped at the row ends
 *   because they only ever occur word-finally and were typed less often.
 *   A child hunting for ם next to מ will never find it; the app must teach the
 *   real position.
 * • Comma and full stop are displaced: the physical Comma key carries ת and the
 *   physical Period key carries ץ, so Hebrew comma moved to the Quote key and
 *   Hebrew full stop moved to the Slash key.
 * • The Backquote key carries ";" in Hebrew, and Q carries "/", W carries "'".
 * • Hebrew has no letter case, so `he.upper === he.lower` on every letter key.
 *   Shift only changes the output on keys that carry punctuation:
 *   Quote (, → "), Slash (. → ?), Comma (ת → >), Period (ץ → <),
 *   BracketLeft (] → }), BracketRight ([ → {), Backquote (; → ~),
 *   and the digit row, which is shared with English.
 * • GERESH ׳ (U+05F3) and GERSHAYIM ״ (U+05F4) have no plain-shift home in the
 *   classic layout at all — W emits the ASCII apostrophe U+0027 and the Quote
 *   key emits U+0022. The 2018 revision adds them on AltGr+Semicolon and
 *   AltGr+Quote. They are exported below as `HEBREW_ALTGR` for reference; the
 *   keyboard component does not teach AltGr.
 */

import type { Finger, KeyCap, KeyCode, Lang } from "./types";

/* ------------------------------------------------------------------ */
/* Small helpers used to keep the table below readable                  */
/* ------------------------------------------------------------------ */

/** Hebrew letter: no case, so both shift states are the same glyph. */
const heSame = (g: string) => ({ lower: g, upper: g });

/* ------------------------------------------------------------------ */
/* The layout                                                           */
/* ------------------------------------------------------------------ */

export const KEY_LAYOUT: readonly KeyCap[] = [
  /* ---- Row 0: digits ------------------------------------------------
   * Hebrew shares the digit row with English. The only differences are the
   * mirrored paired delimiters on 9 and 0 (logical order, see header note)
   * and the Backquote key, which carries ";" instead of "`".            */
  { code: "Backquote", row: 0, finger: "l-pinky", hand: "L", en: { lower: "`", upper: "~" }, he: { lower: ";", upper: "~" } },
  { code: "Digit1", row: 0, finger: "l-pinky", hand: "L", en: { lower: "1", upper: "!" }, he: { lower: "1", upper: "!" } },
  { code: "Digit2", row: 0, finger: "l-ring", hand: "L", en: { lower: "2", upper: "@" }, he: { lower: "2", upper: "@" } },
  { code: "Digit3", row: 0, finger: "l-middle", hand: "L", en: { lower: "3", upper: "#" }, he: { lower: "3", upper: "#" } },
  // Shift+4 is "$" in KBDHEB; the shekel sign ₪ lives on AltGr+4, not Shift+4.
  { code: "Digit4", row: 0, finger: "l-index", hand: "L", en: { lower: "4", upper: "$" }, he: { lower: "4", upper: "$" } },
  { code: "Digit5", row: 0, finger: "l-index", hand: "L", en: { lower: "5", upper: "%" }, he: { lower: "5", upper: "%" } },
  { code: "Digit6", row: 0, finger: "r-index", hand: "R", en: { lower: "6", upper: "^" }, he: { lower: "6", upper: "^" } },
  { code: "Digit7", row: 0, finger: "r-index", hand: "R", en: { lower: "7", upper: "&" }, he: { lower: "7", upper: "&" } },
  { code: "Digit8", row: 0, finger: "r-middle", hand: "R", en: { lower: "8", upper: "*" }, he: { lower: "8", upper: "*" } },
  // Mirrored: in an RTL layout Shift+9 emits the *logical* opening delimiter,
  // which is U+0029 ")" — BiDi mirroring draws it facing the right way.
  { code: "Digit9", row: 0, finger: "r-ring", hand: "R", en: { lower: "9", upper: "(" }, he: { lower: "9", upper: ")" } },
  { code: "Digit0", row: 0, finger: "r-pinky", hand: "R", en: { lower: "0", upper: ")" }, he: { lower: "0", upper: "(" } },
  { code: "Minus", row: 0, finger: "r-pinky", hand: "R", en: { lower: "-", upper: "_" }, he: { lower: "-", upper: "_" } },
  { code: "Equal", row: 0, finger: "r-pinky", hand: "R", en: { lower: "=", upper: "+" }, he: { lower: "=", upper: "+" } },
  { code: "Backspace", row: 0, width: 2, finger: "r-pinky", hand: "R", en: { lower: "⌫", upper: "⌫" }, he: null },

  /* ---- Row 1: QWERTY row -------------------------------------------
   * ק ר א ט ו ן ם פ — the "arkn" run that gives the modern standard its
   * nickname. Note ן (nun sofit) on I and ם (mem sofit) on O.            */
  { code: "Tab", row: 1, width: 1.5, finger: "l-pinky", hand: "L", en: { lower: "⇥", upper: "⇥" }, he: null },
  { code: "KeyQ", row: 1, finger: "l-pinky", hand: "L", en: { lower: "q", upper: "Q" }, he: heSame("/") },
  { code: "KeyW", row: 1, finger: "l-ring", hand: "L", en: { lower: "w", upper: "W" }, he: heSame("'") },
  { code: "KeyE", row: 1, finger: "l-middle", hand: "L", en: { lower: "e", upper: "E" }, he: heSame("ק") },
  { code: "KeyR", row: 1, finger: "l-index", hand: "L", en: { lower: "r", upper: "R" }, he: heSame("ר") },
  { code: "KeyT", row: 1, finger: "l-index", hand: "L", en: { lower: "t", upper: "T" }, he: heSame("א") },
  { code: "KeyY", row: 1, finger: "r-index", hand: "R", en: { lower: "y", upper: "Y" }, he: heSame("ט") },
  { code: "KeyU", row: 1, finger: "r-index", hand: "R", en: { lower: "u", upper: "U" }, he: heSame("ו") },
  { code: "KeyI", row: 1, finger: "r-middle", hand: "R", en: { lower: "i", upper: "I" }, he: heSame("ן") },
  { code: "KeyO", row: 1, finger: "r-ring", hand: "R", en: { lower: "o", upper: "O" }, he: heSame("ם") },
  { code: "KeyP", row: 1, finger: "r-pinky", hand: "R", en: { lower: "p", upper: "P" }, he: heSame("פ") },
  // Brackets are mirrored for the same logical-order reason as 9 and 0.
  { code: "BracketLeft", row: 1, finger: "r-pinky", hand: "R", en: { lower: "[", upper: "{" }, he: { lower: "]", upper: "}" } },
  { code: "BracketRight", row: 1, finger: "r-pinky", hand: "R", en: { lower: "]", upper: "}" }, he: { lower: "[", upper: "{" } },
  { code: "Backslash", row: 1, width: 1.5, finger: "r-pinky", hand: "R", en: { lower: "\\", upper: "|" }, he: { lower: "\\", upper: "|" } },

  /* ---- Row 2: home row ----------------------------------------------
   * ש ד ג כ ע י ח ל ך ף — ends with two sofits: ך on L and ף on Semicolon.
   * The Hebrew comma sits on the Quote key because the physical Comma key
   * was taken over by ת.                                                */
  { code: "CapsLock", row: 2, width: 1.75, finger: "l-pinky", hand: "L", en: { lower: "⇪", upper: "⇪" }, he: null },
  { code: "KeyA", row: 2, finger: "l-pinky", hand: "L", en: { lower: "a", upper: "A" }, he: heSame("ש") },
  { code: "KeyS", row: 2, finger: "l-ring", hand: "L", en: { lower: "s", upper: "S" }, he: heSame("ד") },
  { code: "KeyD", row: 2, finger: "l-middle", hand: "L", en: { lower: "d", upper: "D" }, he: heSame("ג") },
  { code: "KeyF", row: 2, finger: "l-index", hand: "L", en: { lower: "f", upper: "F" }, he: heSame("כ"), homeAnchor: true },
  { code: "KeyG", row: 2, finger: "l-index", hand: "L", en: { lower: "g", upper: "G" }, he: heSame("ע") },
  { code: "KeyH", row: 2, finger: "r-index", hand: "R", en: { lower: "h", upper: "H" }, he: heSame("י") },
  { code: "KeyJ", row: 2, finger: "r-index", hand: "R", en: { lower: "j", upper: "J" }, he: heSame("ח"), homeAnchor: true },
  { code: "KeyK", row: 2, finger: "r-middle", hand: "R", en: { lower: "k", upper: "K" }, he: heSame("ל") },
  { code: "KeyL", row: 2, finger: "r-ring", hand: "R", en: { lower: "l", upper: "L" }, he: heSame("ך") },
  { code: "Semicolon", row: 2, finger: "r-pinky", hand: "R", en: { lower: ";", upper: ":" }, he: heSame("ף") },
  // Genuine shift difference: unshifted gives the Hebrew comma, Shift gives ".
  { code: "Quote", row: 2, finger: "r-pinky", hand: "R", en: { lower: "'", upper: '"' }, he: { lower: ",", upper: '"' } },
  { code: "Enter", row: 2, width: 2.25, finger: "r-pinky", hand: "R", en: { lower: "⏎", upper: "⏎" }, he: null },

  /* ---- Row 3: ZXCV row ----------------------------------------------
   * ז ס ב ה נ מ צ ת ץ — ends with ץ (tsadi sofit) on the Period key, and the
   * Hebrew full stop is displaced onto the Slash key.                    */
  { code: "ShiftLeft", row: 3, width: 2.25, finger: "l-pinky", hand: "L", en: { lower: "⇧", upper: "⇧" }, he: null },
  { code: "KeyZ", row: 3, finger: "l-pinky", hand: "L", en: { lower: "z", upper: "Z" }, he: heSame("ז") },
  { code: "KeyX", row: 3, finger: "l-ring", hand: "L", en: { lower: "x", upper: "X" }, he: heSame("ס") },
  { code: "KeyC", row: 3, finger: "l-middle", hand: "L", en: { lower: "c", upper: "C" }, he: heSame("ב") },
  { code: "KeyV", row: 3, finger: "l-index", hand: "L", en: { lower: "v", upper: "V" }, he: heSame("ה") },
  { code: "KeyB", row: 3, finger: "l-index", hand: "L", en: { lower: "b", upper: "B" }, he: heSame("נ") },
  { code: "KeyN", row: 3, finger: "r-index", hand: "R", en: { lower: "n", upper: "N" }, he: heSame("מ") },
  { code: "KeyM", row: 3, finger: "r-index", hand: "R", en: { lower: "m", upper: "M" }, he: heSame("צ") },
  { code: "Comma", row: 3, finger: "r-middle", hand: "R", en: { lower: ",", upper: "<" }, he: { lower: "ת", upper: ">" } },
  { code: "Period", row: 3, finger: "r-ring", hand: "R", en: { lower: ".", upper: ">" }, he: { lower: "ץ", upper: "<" } },
  { code: "Slash", row: 3, finger: "r-pinky", hand: "R", en: { lower: "/", upper: "?" }, he: { lower: ".", upper: "?" } },
  { code: "ShiftRight", row: 3, width: 2.75, finger: "r-pinky", hand: "R", en: { lower: "⇧", upper: "⇧" }, he: null },

  /* ---- Row 4: the space row ----------------------------------------- */
  { code: "ControlLeft", row: 4, width: 1.5, finger: "l-pinky", hand: "L", en: { lower: "Ctrl", upper: "Ctrl" }, he: null },
  { code: "AltLeft", row: 4, width: 1.5, finger: "thumb", hand: "L", en: { lower: "Alt", upper: "Alt" }, he: null },
  { code: "Space", row: 4, width: 9, finger: "thumb", hand: "L", en: { lower: " ", upper: " " }, he: { lower: " ", upper: " " } },
  { code: "AltRight", row: 4, width: 1.5, finger: "thumb", hand: "R", en: { lower: "Alt", upper: "Alt" }, he: null },
  { code: "ControlRight", row: 4, width: 1.5, finger: "r-pinky", hand: "R", en: { lower: "Ctrl", upper: "Ctrl" }, he: null },
];

/* ------------------------------------------------------------------ */
/* Derived indexes + non-character keys                                 */
/* ------------------------------------------------------------------ */

/**
 * Keys that do not produce a character. Their `en.lower` holds a *symbol* for
 * drawing the cap (⌫, ⇧, Ctrl…), which is why `charFor` must refuse them
 * rather than hand a lesson the string "⇧" as if a child had typed it.
 */
export const NON_CHARACTER_KEYS: ReadonlySet<KeyCode> = new Set<KeyCode>([
  "Backspace", "Tab", "CapsLock", "Enter",
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight",
]);

export const KEY_BY_CODE: ReadonlyMap<KeyCode, KeyCap> = new Map(
  KEY_LAYOUT.map((k) => [k.code, k] as const),
);

/** Rows 0–4, each in physical left-to-right order. */
export const KEY_ROWS: readonly (readonly KeyCap[])[] = [0, 1, 2, 3, 4].map((r) =>
  KEY_LAYOUT.filter((k) => k.row === r),
);

/** The eight resting positions, left pinky → right pinky. */
export const HOME_ROW: readonly KeyCode[] = [
  "KeyA", "KeyS", "KeyD", "KeyF", "KeyJ", "KeyK", "KeyL", "Semicolon",
];

/** The two keys with a physical bump under the index fingers. */
export const HOME_ANCHORS: readonly KeyCode[] = KEY_LAYOUT.filter((k) => k.homeAnchor).map((k) => k.code);

/**
 * Reference only — the SI-1452-2 (2018) AltGr additions. We do not teach AltGr,
 * but lessons about Hebrew punctuation may want to *show* these.
 */
export const HEBREW_ALTGR: Readonly<Record<KeyCode, string>> = {
  Semicolon: "׳", // GERESH ׳
  Quote: "״",     // GERSHAYIM ״
  Minus: "־",     // MAQAF ־
  Digit4: "₪",    // NEW SHEQEL SIGN ₪
};

/* ------------------------------------------------------------------ */
/* Finger colour coding                                                 */
/* ------------------------------------------------------------------ */

/**
 * Okabe–Ito colour-blind-safe palette (+ one Paul Tol wine for the ninth
 * finger). Design-system rule 3: colour is NEVER the only channel — always
 * pair a swatch with `FINGER_LABELS` (text) and `FINGER_SHAPES` (icon).
 */
export const FINGER_COLORS: Readonly<Record<Finger, string>> = {
  "l-pinky": "#0072B2",  // blue
  "l-ring": "#56B4E9",   // sky
  "l-middle": "#009E73",  // bluish green
  "l-index": "#F0E442",  // yellow  (needs dark ink on top)
  thumb: "#999999",      // neutral grey
  "r-index": "#E69F00",  // orange
  "r-middle": "#D55E00", // vermillion
  "r-ring": "#CC79A7",   // reddish purple
  "r-pinky": "#882255",  // wine
};

/** Ink colour that stays legible on each swatch (yellow/sky need dark text). */
export const FINGER_INK: Readonly<Record<Finger, string>> = {
  "l-pinky": "#FFFFFF",
  "l-ring": "#12303F",
  "l-middle": "#FFFFFF",
  "l-index": "#3A3400",
  thumb: "#1B1B1B",
  "r-index": "#3A2200",
  "r-middle": "#FFFFFF",
  "r-ring": "#3A1230",
  "r-pinky": "#FFFFFF",
};

/** Redundant channel #2: a name in both languages. */
export const FINGER_LABELS: Readonly<Record<Finger, { en: string; he: string }>> = {
  "l-pinky": { en: "L pinky", he: "זרת שמאל" },
  "l-ring": { en: "L ring", he: "קמיצה שמאל" },
  "l-middle": { en: "L middle", he: "אמה שמאל" },
  "l-index": { en: "L index", he: "אצבע שמאל" },
  thumb: { en: "Thumb", he: "אגודל" },
  "r-index": { en: "R index", he: "אצבע ימין" },
  "r-middle": { en: "R middle", he: "אמה ימין" },
  "r-ring": { en: "R ring", he: "קמיצה ימין" },
  "r-pinky": { en: "R pinky", he: "זרת ימין" },
};

/** Redundant channel #3: a shape, so the coding survives greyscale printing. */
export const FINGER_SHAPES: Readonly<Record<Finger, string>> = {
  "l-pinky": "●",
  "l-ring": "▲",
  "l-middle": "■",
  "l-index": "◆",
  thumb: "▬",
  "r-index": "◇",
  "r-middle": "□",
  "r-ring": "△",
  "r-pinky": "○",
};

/* ------------------------------------------------------------------ */
/* Lookups                                                              */
/* ------------------------------------------------------------------ */

/** What a key produces in `lang`, or null if it produces nothing typeable. */
export function charFor(code: KeyCode, lang: Lang, shift = false): string | null {
  if (NON_CHARACTER_KEYS.has(code)) return null;
  const cap = KEY_BY_CODE.get(code);
  if (!cap) return null;
  const side = lang === "he" ? cap.he : cap.en;
  if (!side) return null;
  return shift ? side.upper : side.lower;
}

export interface KeyMatch {
  cap: KeyCap;
  /** Whether Shift must be held to produce the character. */
  shift: boolean;
}

/**
 * Find the physical key that produces `char` in `lang`.
 * English is matched case-insensitively first (so "A" finds KeyA with
 * shift = true, and "a" finds KeyA with shift = false); Hebrew has no case so
 * the unshifted state always wins.
 */
export function keyFor(char: string, lang: Lang): KeyMatch | null {
  if (!char) return null;
  for (const cap of KEY_LAYOUT) {
    if (NON_CHARACTER_KEYS.has(cap.code)) continue;
    const side = lang === "he" ? cap.he : cap.en;
    if (!side) continue;
    if (side.lower === char) return { cap, shift: false };
  }
  for (const cap of KEY_LAYOUT) {
    if (NON_CHARACTER_KEYS.has(cap.code)) continue;
    const side = lang === "he" ? cap.he : cap.en;
    if (!side) continue;
    if (side.upper === char) return { cap, shift: true };
  }
  return null;
}

/** Convenience for lessons: every key needed to type `text` in `lang`, in order. */
export function keysForText(text: string, lang: Lang): KeyMatch[] {
  const out: KeyMatch[] = [];
  for (const ch of text) {
    const m = keyFor(ch, lang);
    if (m) out.push(m);
  }
  return out;
}

/** The finger a key belongs to, or null for an unknown code. */
export function fingerFor(code: KeyCode): Finger | null {
  return KEY_BY_CODE.get(code)?.finger ?? null;
}

/** Does this layout produce anything at all for this key? */
export function hasGlyph(cap: KeyCap, lang: Lang): boolean {
  return (lang === "he" ? cap.he : cap.en) !== null;
}
