/**
 * THE SENTENCE BANK — what the last twenty-five levels are made of.
 *
 * WHY THIS EXISTS
 * ---------------
 * A child who has finished the alphabet and typed sixty words has still never
 * seen two English words standing next to each other. Every skill in this app
 * up to that point is about one thing at a time: this letter, this key, this
 * word. A sentence is the first time any of it is put in a row, and it is the
 * bridge to conversation mode — which asks a child to *read* English sentences
 * having never built one.
 *
 * SELECTION RULES — the same three the word bank obeys, plus one
 *   · Every word in every sentence is already known: it is in the word bank
 *     (`words.ts`) or in GLUE below. Nothing here introduces vocabulary by
 *     surprise; `unglossedSentenceWords()` is the check that says so.
 *   · Every sentence is a thing a 7-year-old would actually say. No grammar
 *     exercises, no "the pen of my aunt".
 *   · Every sentence carries an emoji, because the emoji IS the meaning for a
 *     child who cannot yet read the English.
 *   · New rule for sentences: the Hebrew gloss is the *natural* Hebrew, not a
 *     word-by-word calque. "I AM SEVEN" is "אני בן שבע", not "אני הוא שבע".
 *     The word-by-word breakdown is a separate, secondary hint — see
 *     `wordsHeFor` — so a child can see both the meaning and the machinery.
 *
 * TIER is derived from length, never hand-assigned: two words, three words,
 * four-or-more. The track walks up the tiers across the phase.
 *
 * AUDIO. Nothing here is recorded yet. Every sentence gets a voice line id all
 * the same (`lib/voice/lines.ts`), so it plays through the browser's TTS today
 * and through a human voice the day somebody records it in /studio — with no
 * change to this file and no deploy. See docs/voice.md.
 */

import type { SentenceData } from "./contract";
import { WORDS } from "./words";

/* ------------------------------------------------------------------ */
/* Glue — the words a sentence needs that the picture bank cannot hold  */
/* ------------------------------------------------------------------ */

/**
 * "A", "IS", "MY", "WANT". None of them can be drawn, so none of them belong
 * in `words.ts`, whose entrance requirement is an emoji that carries the
 * meaning. They are learned the way function words actually are learned — in
 * a sentence, from position and repetition, never as a flashcard.
 *
 * The Hebrew here is a *hint at this word in this position*, not a
 * translation: "IS" is glossed "הוא/היא" because that is what it is doing in
 * "THE DOG IS BIG", and no seven-year-old needs the copula explained.
 */
export const SENTENCE_GLUE: readonly { word: string; he: string }[] = [
  { word: "I", he: "אני" },
  { word: "YOU", he: "אתה/את" },
  { word: "ME", he: "אותי/לי" },
  { word: "WE", he: "אנחנו" },
  { word: "MY", he: "שלי" },
  { word: "AM", he: "אני" },
  { word: "IS", he: "הוא/היא" },
  { word: "ARE", he: "אתה/הם" },
  { word: "A", he: "אחד" },
  { word: "THE", he: "ה־" },
  { word: "THIS", he: "זה" },
  { word: "AND", he: "ו־" },
  { word: "TO", he: "אל, ל־" },
  { word: "AT", he: "על, ב־" },
  { word: "WITH", he: "עם" },
  { word: "IN", he: "בתוך" },
  { word: "CAN", he: "יכול" },
  { word: "SEE", he: "רואה" },
  { word: "LOOK", he: "תסתכל" },
  { word: "LIKE", he: "אוהב" },
  { word: "LOVE", he: "אוהב מאוד" },
  { word: "WANT", he: "רוצה" },
  { word: "HAVE", he: "יש לי" },
  { word: "GIVE", he: "תן" },
  { word: "GO", he: "הולך" },
  { word: "COME", he: "בוא" },
  { word: "RUN", he: "רץ" },
  { word: "READ", he: "קורא" },
  { word: "DOWN", he: "למטה" },
  { word: "HERE", he: "כאן" },
  { word: "HI", he: "היי" },
  { word: "PLEASE", he: "בבקשה" },
  { word: "THANK", he: "תודה" },
  { word: "GOOD", he: "טוב" },
  { word: "MORNING", he: "בוקר" },
  { word: "NIGHT", he: "לילה" },
  { word: "NICE", he: "נחמד" },
  { word: "FUN", he: "כיף" },
  { word: "BIG", he: "גדול" },
  { word: "SMALL", he: "קטן" },
  { word: "HOT", he: "חם" },
  { word: "BLACK", he: "שחור" },
  { word: "HAPPY", he: "שמח" },
  { word: "HOW", he: "איך" },
  { word: "WHAT", he: "מה" },
  { word: "SEVEN", he: "שבע" },
];

/* ------------------------------------------------------------------ */
/* Glosses                                                              */
/* ------------------------------------------------------------------ */

const GLOSS = new Map<string, string>();
for (const w of WORDS) GLOSS.set(w.word, w.he);
for (const g of SENTENCE_GLUE) if (!GLOSS.has(g.word)) GLOSS.set(g.word, g.he);

/** The Hebrew hint for one English word, or the word itself if we have none. */
export function glossFor(word: string): string {
  return GLOSS.get(word.toUpperCase()) ?? word.toUpperCase();
}

/** Per-word Hebrew, in order — the sentence taken apart. */
export function wordsHeFor(text: string): string[] {
  return splitSentence(text).map(glossFor);
}

/** Uppercase words of a sentence. The one place a sentence is split. */
export function splitSentence(text: string): string[] {
  return text.toUpperCase().trim().split(/\s+/).filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* The bank                                                             */
/* ------------------------------------------------------------------ */

const s = (text: string, he: string, emoji: string, pattern: string): SentenceData => {
  const words = splitSentence(text);
  return {
    text: words.join(" "),
    he,
    emoji,
    pattern,
    // Derived, never hand-assigned: two words, three words, four or more.
    tier: words.length <= 2 ? 1 : words.length === 3 ? 2 : 3,
    words,
    requiresWords: Array.from(new Set(words)),
  };
};

export const SENTENCES: readonly SentenceData[] = [
  /* Tier 1 — two words. The whole idea is the space bar. -------------- */
  s("I RUN", "אני רץ", "🏃", "i-verb"),
  s("I JUMP", "אני קופץ", "🦘", "i-verb"),
  s("I SEE", "אני רואה", "👀", "i-verb"),
  s("I READ", "אני קורא", "📖", "i-verb"),
  s("SIT DOWN", "שב", "🪑", "command"),
  s("LOOK HERE", "תסתכל כאן", "👀", "command"),
  s("HI MOM", "היי אמא", "👋", "greeting"),
  s("GOOD NIGHT", "לילה טוב", "🌙", "greeting"),
  s("GOOD MORNING", "בוקר טוב", "🌅", "greeting"),
  s("MY DOG", "הכלב שלי", "🐶", "my-thing"),
  s("MY CAT", "החתול שלי", "🐱", "my-thing"),
  s("MY BOOK", "הספר שלי", "📚", "my-thing"),
  s("THE SUN", "השמש", "☀️", "the-thing"),
  s("THE MOON", "הירח", "🌙", "the-thing"),
  s("A BIRD", "ציפור", "🐦", "the-thing"),
  s("BIG CAKE", "עוגה גדולה", "🍰", "adjective"),

  /* Tier 2 — three words. Now the sentence has a shape. --------------- */
  s("I AM HAPPY", "אני שמח", "😀", "i-am"),
  s("I AM SAD", "אני עצוב", "😢", "i-am"),
  s("I AM SEVEN", "אני בן שבע", "7️⃣", "i-am"),
  s("I LIKE MILK", "אני אוהב חלב", "🥛", "i-like"),
  s("I LIKE CAKE", "אני אוהב עוגה", "🍰", "i-like"),
  s("I LIKE MUSIC", "אני אוהב מוזיקה", "🎵", "i-like"),
  s("I LOVE YOU", "אני אוהב אותך", "❤️", "i-like"),
  s("I SEE YOU", "אני רואה אותך", "👀", "i-verb-you"),
  s("I CAN JUMP", "אני יכול לקפוץ", "🦘", "i-can"),
  s("I CAN RUN", "אני יכול לרוץ", "🏃", "i-can"),
  s("I CAN READ", "אני יודע לקרוא", "📖", "i-can"),
  s("I WANT WATER", "אני רוצה מים", "💧", "i-want"),
  s("THIS IS FUN", "זה כיף", "🎉", "this-is"),
  s("WHAT IS THIS", "מה זה", "❓", "question"),
  s("HOW ARE YOU", "מה שלומך", "🙂", "question"),
  s("THANK YOU MOM", "תודה אמא", "🙏", "greeting"),
  s("COME WITH ME", "בוא איתי", "🤝", "command"),
  s("LOOK AT ME", "תסתכל עליי", "👀", "command"),

  /* Tier 3 — four and five words. A real sentence. --------------------- */
  s("I SEE A CAT", "אני רואה חתול", "🐱", "i-see-a"),
  s("I SEE A RED CAR", "אני רואה מכונית אדומה", "🚗", "i-see-a"),
  s("I HAVE A DOG", "יש לי כלב", "🐶", "i-have-a"),
  s("I HAVE A BIKE", "יש לי אופניים", "🚲", "i-have-a"),
  s("THE DOG IS BIG", "הכלב גדול", "🐶", "the-x-is-y"),
  s("THE SUN IS HOT", "השמש חמה", "☀️", "the-x-is-y"),
  s("MY CAT IS BLACK", "החתול שלי שחור", "🐱", "the-x-is-y"),
  s("MY FAMILY IS BIG", "המשפחה שלי גדולה", "👨‍👩‍👧", "the-x-is-y"),
  s("MY FRIEND IS NICE", "החבר שלי נחמד", "🧑‍🤝‍🧑", "the-x-is-y"),
  s("THIS IS MY BOOK", "זה הספר שלי", "📚", "this-is"),
  s("I LIKE MY SCHOOL", "אני אוהב את בית הספר שלי", "🏫", "i-like"),
  s("I LIKE TO JUMP", "אני אוהב לקפוץ", "🦘", "i-like"),
  s("WE GO TO SCHOOL", "אנחנו הולכים לבית ספר", "🏫", "we-go"),
  s("I CAN SEE THE MOON", "אני רואה את הירח", "🌙", "i-can"),
  s("I WANT A BIG CAKE", "אני רוצה עוגה גדולה", "🍰", "i-want"),
  s("PLEASE GIVE ME WATER", "בבקשה תן לי מים", "💧", "command"),
];

/* ------------------------------------------------------------------ */
/* Lookups                                                              */
/* ------------------------------------------------------------------ */

const BY_TEXT = new Map(SENTENCES.map((x) => [x.text, x]));

export const getSentence = (text: string): SentenceData | undefined =>
  BY_TEXT.get(splitSentence(text).join(" "));

/** The bank for one tier, in the order it was written (easiest first). */
export function sentencesOfTier(tier: 1 | 2 | 3): SentenceData[] {
  return SENTENCES.filter((x) => x.tier === tier);
}

/**
 * Every distinct English word the sentence phase asks a child to type.
 * `lib/chat-prompt.ts` unions this into the words conversation mode may use,
 * so a sentence a child has actually built is a sentence the AI may echo.
 */
export const SENTENCE_VOCAB: readonly string[] = Array.from(
  new Set(SENTENCES.flatMap((x) => x.words)),
).sort();

/**
 * THE CONTENT CHECK. Any word used in a sentence that nothing glosses —
 * i.e. it is neither in the word bank nor in SENTENCE_GLUE. Should always be
 * empty; it is exported rather than thrown so a content slip degrades to a
 * missing Hebrew hint instead of a blank app.
 */
export function unglossedSentenceWords(): string[] {
  return SENTENCE_VOCAB.filter((w) => !GLOSS.has(w));
}
