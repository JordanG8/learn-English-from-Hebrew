/**
 * THE WORD BANK — what letters get spent on.
 *
 * Selection rules:
 *   · Every word must be buildable from letters already taught, in the
 *     TEACHING_ORDER of alphabet.ts. `requiresLetters` is the check.
 *   · Every word must be a thing a 7-year-old can picture. That is why each
 *     one carries an emoji — the emoji IS the meaning, not decoration. Words
 *     that cannot be pictured are not in this list.
 *   · The Hebrew gloss is the word an Israeli child actually uses, not the
 *     dictionary form.
 *   · Tier 1 words come from the first six letters (s a t p i n + m d), so a
 *     real word is built in the first sitting.
 */

import type { WordData } from "./contract";
import { TEACHING_ORDER } from "./alphabet";

const w = (
  word: string,
  he: string,
  emoji: string,
  tier: 1 | 2 | 3,
): WordData => ({
  word,
  he,
  emoji,
  tier,
  requiresLetters: Array.from(new Set(word.split(""))),
});

export const WORDS: readonly WordData[] = [
  /* Tier 1 — s a t p i n m d ------------------------------------- */
  w("SIT", "לשבת", "🪑", 1),
  w("PIN", "סיכה", "📌", 1),
  w("ANT", "נמלה", "🐜", 1),
  w("MAP", "מפה", "🗺️", 1),
  w("PAN", "מחבת", "🍳", 1),
  w("SAD", "עצוב", "😢", 1),
  w("DAD", "אבא", "👨", 1),
  w("MAN", "איש", "🧍", 1),
  w("NAP", "שנת צהריים", "😴", 1),
  w("TIP", "קצה", "📍", 1),

  /* Tier 2 — + g o c k e u r h b f ------------------------------- */
  w("DOG", "כלב", "🐶", 2),
  w("CAT", "חתול", "🐱", 2),
  w("SUN", "שמש", "☀️", 2),
  w("CUP", "כוס", "🥤", 2),
  w("RED", "אדום", "🟥", 2),
  w("BUS", "אוטובוס", "🚌", 2),
  w("HAT", "כובע", "🎩", 2),
  w("BED", "מיטה", "🛏️", 2),
  w("CAR", "מכונית", "🚗", 2),
  w("EGG", "ביצה", "🥚", 2),
  w("DUCK", "ברווז", "🦆", 2),
  w("BOOK", "ספר", "📚", 2),
  w("FROG", "צפרדע", "🐸", 2),
  w("FISH", "דג", "🐟", 2),
  w("HAND", "יד", "✋", 2),
  w("MOON", "ירח", "🌙", 2),
  w("DOOR", "דלת", "🚪", 2),
  w("CAKE", "עוגה", "🍰", 2),

  /* Tier 3 — the whole alphabet ---------------------------------- */
  w("APPLE", "תפוח", "🍎", 3),
  w("WATER", "מים", "💧", 3),
  w("HOUSE", "בית", "🏠", 3),
  w("TREE", "עץ", "🌳", 3),
  w("STAR", "כוכב", "⭐", 3),
  w("PIZZA", "פיצה", "🍕", 3),
  w("ZEBRA", "זברה", "🦓", 3),
  w("BALL", "כדור", "⚽", 3),
  w("LION", "אריה", "🦁", 3),
  w("QUEEN", "מלכה", "👑", 3),
  w("BOX", "קופסה", "📦", 3),
  w("YELLOW", "צהוב", "💛", 3),
  w("SCHOOL", "בית ספר", "🏫", 3),
  w("FRIEND", "חבר", "🧑‍🤝‍🧑", 3),
  w("FAMILY", "משפחה", "👨‍👩‍👧", 3),
  w("JUMP", "לקפוץ", "🦘", 3),
  w("MILK", "חלב", "🥛", 3),
  w("BIRD", "ציפור", "🐦", 3),
];

const BY_WORD = new Map(WORDS.map((x) => [x.word, x]));
export const getWord = (word: string): WordData | undefined =>
  BY_WORD.get(word.toUpperCase());

/** Position of the last-taught letter this word needs. Lower = earlier. */
export function unlockIndex(word: WordData): number {
  return word.requiresLetters.reduce((max, l) => {
    const i = TEACHING_ORDER.indexOf(l);
    return i < 0 ? Number.POSITIVE_INFINITY : Math.max(max, i);
  }, 0);
}

/** Words buildable once `taught` letters are known, easiest first. */
export function buildableWords(taught: readonly string[]): WordData[] {
  const set = new Set(taught.map((l) => l.toUpperCase()));
  return WORDS.filter((word) => word.requiresLetters.every((l) => set.has(l))).sort(
    (a, b) => a.tier - b.tier || a.word.length - b.word.length,
  );
}

/**
 * The first word that becomes buildable exactly when `letter` is taught —
 * i.e. the payoff for having just learned it. This is the mechanism behind
 * "nothing is learned in a vacuum": every letter lesson is followed by a
 * keyboard lesson that spends it.
 */
export function payoffWordFor(letter: string): WordData | undefined {
  const idx = TEACHING_ORDER.indexOf(letter.toUpperCase());
  if (idx < 0) return undefined;
  const taught = TEACHING_ORDER.slice(0, idx + 1);
  return buildableWords(taught).find((word) => unlockIndex(word) === idx);
}
