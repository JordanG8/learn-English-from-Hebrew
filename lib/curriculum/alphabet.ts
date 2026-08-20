/**
 * THE ALPHABET — all 26 letters, with the four things a child has to learn
 * about each one, in the order they have to learn them:
 *
 *   1. the SOUND it makes      (phonics first — this is what reading needs)
 *   2. its NAME                (what you call it when you spell out loud)
 *   3. its SHAPE               (upper/lower, and the look-alikes)
 *   4. WHERE ITS KEY IS        (last: a key is meaningless until the glyph is)
 *
 * `nameHe` and `soundHe` are written in Hebrew script because the reader is a
 * 7-year-old who cannot yet decode English. They are pronunciation aids, not
 * transliterations of English spelling.
 *
 * `soundSpeak` is what we hand to the browser's English TTS voice. TTS cannot
 * read IPA, so these are deliberately crude English syllables ("buh", "ss")
 * that produce roughly the right phoneme when spoken slowly.
 *
 * `confusables` are the letters children actually mix up — the b/d/p/q
 * rotation family first, then the mirror and near-shape pairs. They become
 * the distractors in letter-shape steps.
 */

import type { LetterData } from "./contract";

export const LETTERS: readonly LetterData[] = [
  {
    letter: "A", lower: "a", nameHe: "אֵיי", nameEn: "A",
    soundHe: "אַ", soundSpeak: "ah", ipa: "/æ/", code: "KeyA",
    confusables: ["e", "o", "c"],
    exampleWord: "APPLE", exampleWordHe: "תפוח", emoji: "🍎",
  },
  {
    letter: "B", lower: "b", nameHe: "בִּי", nameEn: "B",
    soundHe: "בְּ", soundSpeak: "buh", ipa: "/b/", code: "KeyB",
    confusables: ["d", "p", "q"],
    exampleWord: "BALL", exampleWordHe: "כדור", emoji: "⚽",
  },
  {
    letter: "C", lower: "c", nameHe: "סִי", nameEn: "C",
    soundHe: "קְ", soundSpeak: "kuh", ipa: "/k/", code: "KeyC",
    confusables: ["o", "e", "g"],
    exampleWord: "CAT", exampleWordHe: "חתול", emoji: "🐱",
  },
  {
    letter: "D", lower: "d", nameHe: "דִּי", nameEn: "D",
    soundHe: "דְּ", soundSpeak: "duh", ipa: "/d/", code: "KeyD",
    confusables: ["b", "p", "q"],
    exampleWord: "DOG", exampleWordHe: "כלב", emoji: "🐶",
  },
  {
    letter: "E", lower: "e", nameHe: "אִי", nameEn: "E",
    soundHe: "אֶ", soundSpeak: "eh", ipa: "/e/", code: "KeyE",
    confusables: ["a", "c", "o"],
    exampleWord: "EGG", exampleWordHe: "ביצה", emoji: "🥚",
  },
  {
    letter: "F", lower: "f", nameHe: "אֶף", nameEn: "F",
    soundHe: "פְ", soundSpeak: "ff", ipa: "/f/", code: "KeyF",
    confusables: ["t", "e", "l"],
    exampleWord: "FISH", exampleWordHe: "דג", emoji: "🐟",
  },
  {
    letter: "G", lower: "g", nameHe: "גִ׳י", nameEn: "G",
    soundHe: "גְּ", soundSpeak: "guh", ipa: "/ɡ/", code: "KeyG",
    confusables: ["q", "p", "c"],
    exampleWord: "GIRL", exampleWordHe: "ילדה", emoji: "👧",
  },
  {
    letter: "H", lower: "h", nameHe: "אֵייץ׳", nameEn: "H",
    soundHe: "הְ", soundSpeak: "huh", ipa: "/h/", code: "KeyH",
    confusables: ["n", "b", "k"],
    exampleWord: "HAT", exampleWordHe: "כובע", emoji: "🎩",
  },
  {
    letter: "I", lower: "i", nameHe: "אַיי", nameEn: "I",
    soundHe: "אִ", soundSpeak: "ih", ipa: "/ɪ/", code: "KeyI",
    confusables: ["l", "j", "t"],
    exampleWord: "ICE", exampleWordHe: "קרח", emoji: "🧊",
  },
  {
    letter: "J", lower: "j", nameHe: "גֵ׳יי", nameEn: "J",
    soundHe: "גְ׳", soundSpeak: "juh", ipa: "/dʒ/", code: "KeyJ",
    confusables: ["i", "g", "y"],
    exampleWord: "JUMP", exampleWordHe: "לקפוץ", emoji: "🦘",
  },
  {
    letter: "K", lower: "k", nameHe: "קֵיי", nameEn: "K",
    soundHe: "קְ", soundSpeak: "kuh", ipa: "/k/", code: "KeyK",
    confusables: ["x", "h", "r"],
    exampleWord: "KEY", exampleWordHe: "מפתח", emoji: "🔑",
  },
  {
    letter: "L", lower: "l", nameHe: "אֶל", nameEn: "L",
    soundHe: "לְ", soundSpeak: "ll", ipa: "/l/", code: "KeyL",
    confusables: ["i", "j", "t"],
    exampleWord: "LION", exampleWordHe: "אריה", emoji: "🦁",
  },
  {
    letter: "M", lower: "m", nameHe: "אֶם", nameEn: "M",
    soundHe: "מְ", soundSpeak: "mm", ipa: "/m/", code: "KeyM",
    confusables: ["n", "w", "h"],
    exampleWord: "MOON", exampleWordHe: "ירח", emoji: "🌙",
  },
  {
    letter: "N", lower: "n", nameHe: "אֶן", nameEn: "N",
    soundHe: "נְ", soundSpeak: "nn", ipa: "/n/", code: "KeyN",
    confusables: ["m", "h", "u"],
    exampleWord: "NOSE", exampleWordHe: "אף", emoji: "👃",
  },
  {
    letter: "O", lower: "o", nameHe: "אוֹ", nameEn: "O",
    soundHe: "אוֹ", soundSpeak: "oh", ipa: "/ɒ/", code: "KeyO",
    confusables: ["q", "c", "e"],
    exampleWord: "ORANGE", exampleWordHe: "תפוז", emoji: "🍊",
  },
  {
    letter: "P", lower: "p", nameHe: "פִּי", nameEn: "P",
    soundHe: "פְּ", soundSpeak: "puh", ipa: "/p/", code: "KeyP",
    confusables: ["q", "b", "d"],
    exampleWord: "PIZZA", exampleWordHe: "פיצה", emoji: "🍕",
  },
  {
    letter: "Q", lower: "q", nameHe: "קְיוּ", nameEn: "Q",
    soundHe: "קְוו", soundSpeak: "kwuh", ipa: "/kw/", code: "KeyQ",
    confusables: ["p", "g", "o"],
    exampleWord: "QUEEN", exampleWordHe: "מלכה", emoji: "👑",
  },
  {
    letter: "R", lower: "r", nameHe: "אָר", nameEn: "R",
    // The English /r/ is NOT the Hebrew ר. Children default to a uvular ר and
    // it is the single most persistent Hebrew-L1 pronunciation error, so the
    // lesson copy names it explicitly rather than pretending the two match.
    soundHe: "רְ (עגולה, לא ר של עברית)", soundSpeak: "rr", ipa: "/ɹ/", code: "KeyR",
    confusables: ["n", "k", "p"],
    exampleWord: "RAIN", exampleWordHe: "גשם", emoji: "🌧️",
  },
  {
    letter: "S", lower: "s", nameHe: "אֶס", nameEn: "S",
    soundHe: "סְ", soundSpeak: "ss", ipa: "/s/", code: "KeyS",
    confusables: ["z", "c", "g"],
    exampleWord: "SUN", exampleWordHe: "שמש", emoji: "☀️",
  },
  {
    letter: "T", lower: "t", nameHe: "טִי", nameEn: "T",
    soundHe: "טְ", soundSpeak: "tuh", ipa: "/t/", code: "KeyT",
    confusables: ["f", "l", "i"],
    exampleWord: "TREE", exampleWordHe: "עץ", emoji: "🌳",
  },
  {
    letter: "U", lower: "u", nameHe: "יוּ", nameEn: "U",
    soundHe: "אָ (כמו ב־up)", soundSpeak: "uh", ipa: "/ʌ/", code: "KeyU",
    confusables: ["v", "n", "w"],
    exampleWord: "UMBRELLA", exampleWordHe: "מטרייה", emoji: "☂️",
  },
  {
    letter: "V", lower: "v", nameHe: "וִי", nameEn: "V",
    soundHe: "וְ", soundSpeak: "vv", ipa: "/v/", code: "KeyV",
    confusables: ["u", "w", "y"],
    exampleWord: "VAN", exampleWordHe: "טנדר", emoji: "🚐",
  },
  {
    letter: "W", lower: "w", nameHe: "דָּאבֶּל־יוּ", nameEn: "W",
    // Hebrew has no /w/. Children substitute /v/. Named explicitly in copy.
    soundHe: "וּוְ (שפתיים עגולות)", soundSpeak: "wuh", ipa: "/w/", code: "KeyW",
    confusables: ["v", "m", "u"],
    exampleWord: "WATER", exampleWordHe: "מים", emoji: "💧",
  },
  {
    letter: "X", lower: "x", nameHe: "אֶקְס", nameEn: "X",
    soundHe: "קְס", soundSpeak: "ks", ipa: "/ks/", code: "KeyX",
    confusables: ["k", "y", "z"],
    // X almost never starts an English word a child knows; BOX is where they
    // will actually meet it, so that is what we teach.
    exampleWord: "BOX", exampleWordHe: "קופסה", emoji: "📦",
  },
  {
    letter: "Y", lower: "y", nameHe: "וַואי", nameEn: "Y",
    soundHe: "יְ", soundSpeak: "yuh", ipa: "/j/", code: "KeyY",
    confusables: ["v", "x", "j"],
    exampleWord: "YELLOW", exampleWordHe: "צהוב", emoji: "💛",
  },
  {
    letter: "Z", lower: "z", nameHe: "זִי", nameEn: "Z",
    soundHe: "זְ", soundSpeak: "zz", ipa: "/z/", code: "KeyZ",
    confusables: ["s", "n", "x"],
    exampleWord: "ZEBRA", exampleWordHe: "זברה", emoji: "🦓",
  },
];

/**
 * TEACHING ORDER — not alphabetical.
 *
 * Alphabetical order teaches A, B, C and leaves the child unable to build a
 * single word, which breaks the one rule this app has: nothing is learned in
 * a vacuum. This order is the standard synthetic-phonics sequence (Letters
 * and Sounds phase 2: s a t p i n, then m d g o c k), chosen because the
 * first six letters already spell SIT, PIN, TAP, NAP, PIT and ANT — a child
 * builds a real word in lesson six, not lesson twenty-six.
 *
 * The alphabet song order is still taught, but as its own thing, later.
 */
export const TEACHING_ORDER: readonly string[] = [
  "S", "A", "T", "P", "I", "N",
  "M", "D", "G", "O", "C", "K",
  "E", "U", "R", "H", "B", "F",
  "L", "J", "V", "W", "X", "Y", "Z", "Q",
];

const BY_LETTER = new Map(LETTERS.map((l) => [l.letter, l]));

export function getLetter(letter: string): LetterData | undefined {
  return BY_LETTER.get(letter.toUpperCase());
}

/** Letters introduced up to and including `letter` in teaching order. */
export function lettersUpTo(letter: string): string[] {
  const i = TEACHING_ORDER.indexOf(letter.toUpperCase());
  return i < 0 ? [] : TEACHING_ORDER.slice(0, i + 1);
}

/**
 * Distractors for a letter-shape step: real confusables first (they are the
 * pedagogically useful ones), topped up with letters already taught so the
 * child is never asked to discriminate against a glyph they have not met.
 */
export function distractorsFor(
  letter: string,
  taught: readonly string[],
  count = 3,
  upper = false,
): string[] {
  const data = getLetter(letter);
  const target = upper ? letter.toUpperCase() : letter.toLowerCase();
  const out: string[] = [];
  const push = (c: string) => {
    const g = upper ? c.toUpperCase() : c.toLowerCase();
    if (g !== target && !out.includes(g)) out.push(g);
  };
  data?.confusables.forEach(push);
  taught.forEach(push);
  LETTERS.forEach((l) => push(l.letter));
  return out.slice(0, count);
}
