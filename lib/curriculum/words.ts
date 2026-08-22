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
  // PIG and KID exist so that G and K have something to spend on in their own
  // lessons — they are the only two letters in the teaching order that reach
  // their lesson with no buildable word containing them. See spendWordFor.
  w("PIG", "חזיר", "🐷", 1),
  // With s-a-t-p taught, TAP is the very first word that can be spelled at
  // all — it is what lets the fourth letter lesson end on a word instead of
  // on a promise.
  w("TAP", "ברז", "🚰", 1),
  w("KID", "ילד", "🧒", 1),

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
  // V spells almost nothing a child knows. Without VAN the letter V is the
  // one letter in the alphabet whose lesson cannot end on a word, which is
  // exactly the vacuum the track is built to avoid.
  w("VAN", "טנדר", "🚐", 2),
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

  /* Tier 3 continued — the typing phase ---------------------------
   *
   * Levels 51–100 are volume: the alphabet is finished, and what a child
   * needs from then on is more real words under their fingers. These exist
   * for that. They obey the same two rules as everything above — a
   * seven-year-old can picture every one of them, and the Hebrew gloss is
   * the word an Israeli child actually says — and they are deliberately
   * longer on average, because the point of the word phase is that the jobs
   * get bigger.
   */
  w("SNAKE", "נחש", "🐍", 3),
  w("HORSE", "סוס", "🐴", 3),
  w("SHEEP", "כבשה", "🐑", 3),
  w("MOUSE", "עכבר", "🐭", 3),
  w("BEAR", "דוב", "🐻", 3),
  w("MONKEY", "קוף", "🐒", 3),
  w("ELEPHANT", "פיל", "🐘", 3),
  w("BUTTERFLY", "פרפר", "🦋", 3),
  w("FLOWER", "פרח", "🌸", 3),
  w("CLOUD", "ענן", "☁️", 3),
  w("SNOW", "שלג", "❄️", 3),
  w("BEACH", "חוף", "🏖️", 3),
  w("CHAIR", "כיסא", "🪑", 3),
  w("TABLE", "שולחן", "🍽️", 3),
  w("WINDOW", "חלון", "🪟", 3),
  w("CLOCK", "שעון", "🕐", 3),
  w("PHONE", "טלפון", "📱", 3),
  w("SHOES", "נעליים", "👟", 3),
  w("SHIRT", "חולצה", "👕", 3),
  w("BREAD", "לחם", "🍞", 3),
  w("CHEESE", "גבינה", "🧀", 3),
  w("BANANA", "בננה", "🍌", 3),
  w("COOKIE", "עוגייה", "🍪", 3),
  w("CANDY", "סוכרייה", "🍬", 3),
  w("JUICE", "מיץ", "🧃", 3),
  w("TRAIN", "רכבת", "🚂", 3),
  w("PLANE", "מטוס", "✈️", 3),
  w("BOAT", "סירה", "⛵", 3),
  w("BIKE", "אופניים", "🚲", 3),
  w("BALLOON", "בלון", "🎈", 3),
  w("MUSIC", "מוזיקה", "🎵", 3),
  w("TEACHER", "מורה", "🧑‍🏫", 3),
  w("MOM", "אמא", "👩", 3),
  w("BABY", "תינוק", "👶", 3),
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

/**
 * THE WORD A LETTER LESSON SPENDS.
 *
 * `payoffWordFor` only answers for the letters that happen to *unlock* a new
 * word, which is about three quarters of them — and a letter lesson that ends
 * without building anything is exactly the vacuum this app is built to avoid.
 * So: the payoff word when there is one, otherwise the shortest word already
 * buildable that actually contains the letter, preferring one no earlier
 * lesson has spent.
 *
 * Returns undefined only for a letter that appears in no word at all, which
 * is a content bug worth seeing rather than papering over.
 */
export function spendWordFor(
  letter: string,
  alreadyUsed: ReadonlySet<string> = new Set(),
): WordData | undefined {
  const up = letter.toUpperCase();
  const idx = TEACHING_ORDER.indexOf(up);
  if (idx < 0) return undefined;

  const payoff = payoffWordFor(up);
  if (payoff && !alreadyUsed.has(payoff.word)) return payoff;

  const taught = TEACHING_ORDER.slice(0, idx + 1);
  const candidates = buildableWords(taught).filter((word) =>
    word.requiresLetters.includes(up),
  );
  return (
    candidates.find((word) => !alreadyUsed.has(word.word)) ??
    payoff ??
    candidates[0]
  );
}

/**
 * THE WHOLE BANK, EASIEST FIRST — the running order of the word phase.
 *
 * Tier, then length, then alphabetically, so the ramp a child feels is real
 * (three-letter words before nine-letter ones) and the order is identical on
 * the server and the client, which content in a prerendered track has to be.
 */
export const WORDS_BY_DIFFICULTY: readonly WordData[] = [...WORDS].sort(
  (a, b) => a.tier - b.tier || a.word.length - b.word.length || a.word.localeCompare(b.word),
);
