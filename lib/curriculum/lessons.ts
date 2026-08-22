/**
 * LESSON CONSTRUCTION — the whole hundred-level track, generated from the
 * letter, word and sentence data rather than hand-listed, so adding content
 * adds levels automatically. See docs/architecture.md → "Adding a lesson".
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ THE TRACK IS THREE DECLARED PHASES. The numbers are in                │
 * │ lib/pedagogy.ts §9; this file is what builds each phase to fit.       │
 * │                                                                       │
 * │   1 – 50    THE ALPHABET   every letter introduced, spent on a real   │
 * │                            word inside its own lesson, drilled and    │
 * │                            reviewed. Level 50 is A-to-Z: there is no  │
 * │                            letter a child standing on it has not met. │
 * │  51 – 75    WORDS          no new letters. The number of words per    │
 * │                            level climbs 2 → 5, and part way through   │
 * │                            the keyboard stops pointing at the key.    │
 * │  76 – 100   SENTENCES      words side by side, space bar included.    │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * WHAT CHANGED, AND WHY IT CHANGED
 * --------------------------------
 * The previous track alternated a letter lesson with a separate word lesson
 * that spent it, which read well but cost two levels per letter: the last
 * letter, Q, was not introduced until level 60, and the thirty-odd levels
 * after it were leftover words with nothing shaping them. Two consequences,
 * both bad. The alphabet — the thing this app exists to teach — finished
 * later than most children will ever get, and a child who did get there had
 * still never seen two English words next to each other.
 *
 * So the payoff word MOVED INSIDE the letter lesson. It is the same content
 * and the same principle — never in a vacuum, every letter is spent the
 * moment it is learned — one level instead of two, and the letter lesson now
 * ends on the thing worth ending on: a real word the child just built. That
 * bought the room for the two phases that follow.
 *
 * A letter lesson still teaches sound → name → shape → key, in that order,
 * and now → word. Mixed reviews are interleaved through phase 1; phases 2 and
 * 3 carry a short SRS warm-up at the top of every level instead, so the
 * alphabet keeps accumulating evidence without a level that isn't about
 * typing. Review content is never stored — it is generated at play time from
 * whatever the scheduler says is due (see buildReviewLesson / buildWarmupSteps).
 */

import type { Lesson, SkillId, Step } from "../types";
import type { TrackShape } from "./contract";
import {
  ALPHABET_PHASE_LEVELS,
  LETTER_DRILL_EVERY_N_LETTERS,
  LETTER_DRILL_WORDS,
  MIXED_REVIEW_STEPS,
  SENTENCES_PER_LESSON,
  SENTENCE_PHASE_HINT_FRACTION,
  SENTENCE_PHASE_LEVELS,
  SENTENCE_TIER_CUTS,
  TRACK_TOTAL_LEVELS,
  WARMUP_STEPS_SENTENCE_PHASE,
  WARMUP_STEPS_WORD_PHASE,
  WORD_LESSON_WORDS_MAX,
  WORD_LESSON_WORDS_MIN,
  WORD_PHASE_HINT_FRACTION,
  WORD_PHASE_LEVELS,
} from "../pedagogy";
import {
  keySkill,
  letterNameSkill,
  letterShapeSkill,
  letterSoundSkill,
  metaSkill,
  parseSkill,
  sentenceSkill,
  wordSkill,
} from "../skills";
import { TOUR } from "../tour";
import { LETTERS, TEACHING_ORDER, distractorsFor, getLetter } from "./alphabet";
import {
  WORDS_BY_DIFFICULTY,
  buildableWords,
  getWord,
  spendWordFor,
} from "./words";
import { getSentence, sentencesOfTier, splitSentence, wordsHeFor } from "./sentences";
import type { LetterData, SentenceData, WordData } from "./contract";

/* ------------------------------------------------------------------ */
/* Small helpers                                                        */
/* ------------------------------------------------------------------ */

/** Deterministic shuffle — content must be identical on server and client. */
function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

function charSeed(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 2147483647;
  return h;
}

/** Linear ramp across a phase, rounded down, clamped to [lo, hi]. */
function ramp(position: number, length: number, lo: number, hi: number): number {
  if (length <= 1) return lo;
  const span = hi - lo + 1;
  return Math.min(hi, lo + Math.floor((position * span) / length));
}

/* ------------------------------------------------------------------ */
/* Step builders — one per Step variant                                 */
/* ------------------------------------------------------------------ */

export function soundStep(d: LetterData, taught: readonly string[], seed = 0): Step {
  const others = distractorsFor(d.letter, taught, 3, true)
    .map((l) => getLetter(l)?.soundHe)
    .filter((x): x is string => typeof x === "string" && x !== d.soundHe);
  const options = shuffle([d.soundHe, ...others.slice(0, 3)], charSeed(d.letter) + seed);
  return {
    id: `sound-${d.letter}-${seed}`,
    type: "letter-sound",
    mode: "sound",
    letter: d.letter,
    answer: d.soundHe,
    options,
    promptHe: `איזה צליל עושה האות ${d.letter}?`,
    say: `letter-sound:${d.letter}`,
  };
}

export function nameStep(d: LetterData, taught: readonly string[], seed = 0): Step {
  const others = distractorsFor(d.letter, taught, 3, true)
    .map((l) => getLetter(l)?.nameHe)
    .filter((x): x is string => typeof x === "string" && x !== d.nameHe);
  const options = shuffle([d.nameHe, ...others.slice(0, 3)], charSeed(d.letter) + 11 + seed);
  return {
    id: `name-${d.letter}-${seed}`,
    type: "letter-sound",
    mode: "name",
    letter: d.letter,
    answer: d.nameHe,
    options,
    promptHe: `איך קוראים לאות הזאת?`,
    say: `letter-name:${d.nameEn}`,
  };
}

export function shapeStep(
  d: LetterData,
  taught: readonly string[],
  caseMatch: boolean,
  seed = 0,
): Step {
  const options = shuffle(
    [
      caseMatch ? d.lower : d.letter,
      ...distractorsFor(d.letter, taught, 3, !caseMatch),
    ],
    charSeed(d.letter) + (caseMatch ? 23 : 17) + seed,
  );
  return {
    id: `shape-${d.letter}-${caseMatch ? "lc" : "uc"}-${seed}`,
    type: "letter-shape",
    letter: d.letter,
    options,
    caseMatch,
    promptHe: caseMatch
      ? `זאת ${d.letter} גדולה. איפה ה־${d.lower} הקטנה שלה?`
      : `איפה האות ${d.letter}?`,
    say: `letter-name:${d.nameEn}`,
  };
}

export function keyStep(
  d: LetterData,
  hint: boolean,
  seed = 0,
): Step {
  return {
    id: `key-${d.letter}-${hint ? "hint" : "recall"}-${seed}`,
    type: "press-key",
    code: d.code,
    lang: "en",
    hint,
    promptHe: hint
      ? `לחצו על ${d.letter} במקלדת — היא מהבהבת`
      : `עכשיו בלי עזרה: איפה ${d.letter}?`,
    say: `letter-name:${d.nameEn}`,
  };
}

/**
 * A word to build. `hint` is the scaffold dial: on, the next key is
 * spotlighted and the step is recognition; off, the caps still carry their
 * legends but nothing points at one, and finding the key becomes recall.
 * A suffix keeps the step id unique when the same word is typed twice in the
 * track, which the word phase does on purpose.
 */
export function wordStep(word: WordData, hint = true, suffix = ""): Step {
  return {
    id: `word-${word.word}${suffix}`,
    type: "build-word",
    word: word.word,
    he: word.he,
    emoji: word.emoji,
    hint,
    promptHe: `בונים את המילה ${word.he}`,
    say: `word:${word.word}`,
  };
}

/** A whole sentence, typed word by word with the space bar between them. */
export function sentenceStep(data: SentenceData, hint = true, suffix = ""): Step {
  return {
    id: `sentence-${data.text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${suffix}`,
    type: "build-sentence",
    sentence: data.text,
    he: data.he,
    emoji: data.emoji,
    wordsHe: wordsHeFor(data.text),
    hint,
    promptHe: `כתבו את המשפט: ${data.he}`,
    say: `sentence:${data.text}`,
  };
}

/* ------------------------------------------------------------------ */
/* The mandatory walkthrough                                            */
/* ------------------------------------------------------------------ */

/**
 * THE TUTORIAL. It teaches the app, not English.
 *
 * Rules it follows, because this is the screen that has to be impossible to
 * misread:
 *   · Every step that points at something requires a REAL tap on that real
 *     element (`advanceOn: "tap-target"`). There is no "next" past a control
 *     the child has not touched.
 *   · Targets come from lib/tour.ts, so a selector can never silently drift
 *     away from the element it names.
 *   · Two full-screen cards bracket the pointing steps: one to say what this
 *     is, one to say what happens next.
 */
export const TUTORIAL_LESSON: Lesson = {
  id: "tutorial",
  kind: "tutorial",
  order: 0,
  titleEn: "How this works",
  titleHe: "איך זה עובד",
  skills: [metaSkill("tutorial")],
  requires: [],
  steps: [
    /*
     * Three steps, not six, and short ones. The walkthrough runs on the level
     * select now — the screen it used to explain no longer exists — and the
     * chat step went with it, because conversation mode is a pad on the road
     * with a lock on it rather than a card that has to be read.
     *
     * There is deliberately no "here is the map" step. Its target was the
     * whole canvas, so the spotlight covered the entire screen and the coach
     * card had nowhere to sit that was not on top of it — which is what made
     * the tour feel like it was hiding the thing it was pointing at. The road
     * is the background of the welcome card instead; it needs no label.
     */
    {
      id: "t-welcome",
      type: "tutorial",
      target: null,
      advanceOn: "next-button",
      promptHe: "היי! זה המסלול שלך. כל אבן היא שיעור.",
      say: "sfx:celebrate",
    },
    {
      id: "t-stars",
      type: "tutorial",
      target: TOUR.stars,
      advanceOn: "tap-target",
      promptHe: "פה נאספים הכוכבים. גע בהם.",
    },
    {
      id: "t-continue",
      type: "tutorial",
      target: TOUR.continue,
      advanceOn: "tap-target",
      promptHe: "הכפתור הגדול מתחיל את השיעור. לחץ!",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Keyboard-mechanics lessons (language switch, digits, symbols)         */
/* ------------------------------------------------------------------ */

const langSwitchLesson = (): Lesson => ({
  id: "kb-lang",
  kind: "keyboard",
  order: 0,
  titleEn: "Hebrew ↔ English",
  titleHe: "להחליף שפה",
  skills: [metaSkill("lang-switch")],
  requires: [],
  steps: [
    {
      id: "lang-intro",
      type: "tutorial",
      target: TOUR["lang-switch"],
      advanceOn: "tap-target",
      promptHe:
        "למקלדת יש שתי שפות. הכפתור הזה מחליף ביניהן — ובמחשב עושים את זה עם Alt+Shift. גע בו.",
    },
    {
      id: "lang-he",
      type: "press-key",
      code: "KeyA",
      lang: "he",
      hint: true,
      promptHe: "עברו לעברית ולחצו על האות ש׳",
    },
    {
      id: "lang-en",
      type: "press-key",
      code: "KeyA",
      lang: "en",
      hint: true,
      promptHe: "עכשיו חזרו לאנגלית ולחצו על A",
      say: "letter-name:A",
    },
    {
      id: "lang-en-2",
      type: "press-key",
      code: "KeyS",
      lang: "en",
      hint: false,
      promptHe: "נשארים באנגלית: איפה S?",
      say: "letter-name:S",
    },
  ],
});

const DIGIT_CODES = [
  "Digit1", "Digit2", "Digit3", "Digit4", "Digit5",
  "Digit6", "Digit7", "Digit8", "Digit9", "Digit0",
] as const;

const digitsLesson = (): Lesson => ({
  id: "kb-digits",
  kind: "keyboard",
  order: 0,
  titleEn: "Numbers",
  titleHe: "המספרים",
  skills: DIGIT_CODES.map((c) => keySkill(c)),
  requires: [],
  steps: DIGIT_CODES.map((code, i) => ({
    id: `digit-${i}`,
    type: "press-key" as const,
    code,
    lang: "en" as const,
    hint: i < 4,
    promptHe: `לחצו על ${(i + 1) % 10}`,
  })),
});

const SYMBOLS: readonly { code: string; he: string; glyph: string }[] = [
  { code: "Space", he: "רווח — הרווח בין מילים", glyph: "␣" },
  { code: "Period", he: "נקודה", glyph: "." },
  { code: "Comma", he: "פסיק", glyph: "," },
  { code: "Slash", he: "סימן שאלה נמצא כאן, עם Shift", glyph: "?" },
  { code: "Minus", he: "מקף", glyph: "-" },
  { code: "Quote", he: "גרש", glyph: "'" },
];

const symbolsLesson = (): Lesson => ({
  id: "kb-symbols",
  kind: "keyboard",
  order: 0,
  titleEn: "Signs",
  titleHe: "סימנים",
  skills: SYMBOLS.map((s) => keySkill(s.code)),
  requires: [],
  steps: SYMBOLS.map((s, i) => ({
    id: `sym-${i}`,
    type: "press-key" as const,
    code: s.code,
    lang: "en" as const,
    hint: true,
    promptHe: `לחצו על ${s.he}  ${s.glyph}`,
  })),
});

/* ------------------------------------------------------------------ */
/* Lesson builders                                                      */
/* ------------------------------------------------------------------ */

/**
 * ONE LETTER, END TO END: meet it, hear its sound, learn its name, tell its
 * shape from the shapes it is confused with, find its key — and then spend it
 * on a real word before leaving the screen.
 *
 * That last step is the whole design in miniature. A letter that is not spent
 * is a letter learned in a vacuum, and it used to cost a second level to
 * spend it; folding the word in is what makes 26 letters fit inside 50 levels
 * without dropping anything a child was getting before.
 */
function letterLesson(
  d: LetterData,
  taught: readonly string[],
  spend: WordData | undefined,
): Lesson {
  const steps: Step[] = [
    // 1. meet it — a full-screen card, no question yet
    {
      id: `intro-${d.letter}`,
      type: "tutorial",
      target: null,
      advanceOn: "next-button",
      promptHe: `זאת האות ${d.letter}. היא עושה את הצליל "${d.soundHe}" — כמו ב־${d.exampleWord} (${d.exampleWordHe}) ${d.emoji}`,
      say: `letter-sound:${d.letter}`,
    },
    // 2. sound  3. name  — phonics before orthography
    soundStep(d, taught),
    nameStep(d, taught),
    // 4. shape, uppercase then the upper/lower pairing
    shapeStep(d, taught, false),
    shapeStep(d, taught, true),
    // 5. only now, where the key lives
    keyStep(d, true),
    keyStep(d, false),
  ];

  if (spend) {
    // 6. spend it. The card is what turns a drill into a payoff — it names
    // the word the child is about to earn before the keyboard appears.
    steps.push({
      id: `spend-intro-${d.letter}`,
      type: "tutorial",
      target: null,
      advanceOn: "next-button",
      promptHe: `עכשיו בונים מילה אמיתית עם ${d.letter}: ${spend.he} ${spend.emoji}`,
      say: `word:${spend.word}`,
    });
    steps.push(wordStep(spend, true, `-of-${d.letter}`));
  }

  return {
    id: `letter-${d.letter}`,
    kind: "letter",
    order: 0,
    titleEn: `Letter ${d.letter}`,
    titleHe: `האות ${d.letter}`,
    skills: [
      letterSoundSkill(d.letter),
      letterNameSkill(d.letter),
      letterShapeSkill(d.letter),
      keySkill(d.code),
      ...(spend ? [wordSkill(spend.word), ...uniqueKeySkills(spend.word)] : []),
    ],
    requires: [],
    steps,
  };
}

/**
 * A TYPING DRILL inside the alphabet phase: no new letter, just words the
 * child can already spell, back to back. It is the small ancestor of the word
 * phase, and it is where the letters taught since the last drill get used
 * together rather than one at a time.
 */
function drillLesson(n: number, words: readonly WordData[]): Lesson {
  return {
    id: `drill-${n}`,
    kind: "word",
    order: 0,
    titleEn: `Typing ${n}`,
    titleHe: `להקליד ${n}`,
    skills: [
      ...words.map((w) => wordSkill(w.word)),
      ...words.flatMap((w) => uniqueKeySkills(w.word)),
    ],
    requires: [],
    steps: [
      {
        id: `drill-intro-${n}`,
        type: "tutorial",
        target: null,
        advanceOn: "next-button",
        promptHe: "בלי אותיות חדשות הפעם — רק להקליד מילים שאתם כבר מכירים.",
      },
      ...words.map((w, k) => wordStep(w, true, `-drill${n}-${k}`)),
    ],
  };
}

/**
 * A WORD LEVEL — phase 2. `n` words, and `hint` decides whether the keyboard
 * still points at the next key. Both are ramped by the caller.
 */
function wordLesson(
  n: number,
  words: readonly WordData[],
  hint: boolean,
  card: string | null,
): Lesson {
  const steps: Step[] = [];
  if (card) {
    steps.push({
      id: `words-card-${n}`,
      type: "tutorial",
      target: null,
      advanceOn: "next-button",
      promptHe: card,
    });
  }
  words.forEach((w, k) => steps.push(wordStep(w, hint, `-w${n}-${k}`)));

  return {
    id: `words-${n}`,
    kind: "word",
    order: 0,
    titleEn: `Words ${n}`,
    titleHe: `מילים ${n}`,
    skills: [
      ...words.map((w) => wordSkill(w.word)),
      ...words.flatMap((w) => uniqueKeySkills(w.word)),
    ],
    requires: [],
    steps,
    warmup: WARMUP_STEPS_WORD_PHASE,
  };
}

/** A SENTENCE LEVEL — phase 3. */
function sentenceLesson(
  n: number,
  sentences: readonly SentenceData[],
  hint: boolean,
  card: string | null,
): Lesson {
  const steps: Step[] = [];
  if (card) {
    steps.push({
      id: `sentence-card-${n}`,
      type: "tutorial",
      target: null,
      advanceOn: "next-button",
      promptHe: card,
    });
  }
  sentences.forEach((x, k) => steps.push(sentenceStep(x, hint, `-s${n}-${k}`)));

  return {
    id: `sentence-${n}`,
    kind: "sentence",
    order: 0,
    titleEn: `Sentences ${n}`,
    titleHe: `משפטים ${n}`,
    skills: [
      ...sentences.map((x) => sentenceSkill(x.text)),
      ...sentences.flatMap((x) => uniqueKeySkills(x.text)),
    ],
    requires: [],
    steps,
    warmup: WARMUP_STEPS_SENTENCE_PHASE,
  };
}

function reviewLesson(n: number): Lesson {
  return {
    id: `review-${n}`,
    kind: "mixed",
    order: 0,
    titleEn: `Review ${n}`,
    titleHe: `חזרה ${n}`,
    // Skills are decided at play time by the SRS, so this list is empty and
    // the player calls buildReviewLesson(). See docs/architecture.md.
    skills: [],
    requires: [],
    steps: [],
  };
}

/** Key skills for every distinct typeable character in a word or sentence. */
function uniqueKeySkills(text: string): SkillId[] {
  const out = new Set<SkillId>();
  for (const ch of text.toUpperCase()) {
    if (ch >= "A" && ch <= "Z") out.add(keySkill(`Key${ch}`));
    else if (ch === " ") out.add(keySkill("Space"));
  }
  return [...out];
}

/* ------------------------------------------------------------------ */
/* Phase 1 — the alphabet, levels 1..ALPHABET_PHASE_LEVELS               */
/* ------------------------------------------------------------------ */

/**
 * FITTING REVIEWS TO THE BUDGET.
 *
 * The alphabet phase has a fixed spine — the tutorial, 26 letters, three
 * keyboard-mechanics lessons, the typing drills, and the A-to-Z milestone —
 * and a fixed number of levels to do it in. Mixed reviews are what fills the
 * gap, spread as evenly as the arithmetic allows.
 *
 * Doing it this way rather than "a review every N lessons" is what keeps the
 * promise in the phase's name: add a letter or a drill tomorrow and the phase
 * still ends on level ALPHABET_PHASE_LEVELS, with one fewer review, instead
 * of quietly pushing the alphabet past the level it is supposed to finish on.
 * (This supersedes MIXED_REVIEW_EVERY_N_LESSONS as the cadence for phase 1;
 * the constant still describes the intent, and the fitted cadence here lands
 * close to it.)
 *
 * A review is never the first level after the tutorial (there is nothing to
 * review yet) and never the last level of the phase (that is A-to-Z).
 */
function insertReviews(content: readonly Lesson[], budget: number): Lesson[] {
  const need = budget - content.length;
  if (need <= 0) return [...content];

  // Slots are "after content[j]" for j from 1 to length-2.
  const slots = content.length - 2;
  if (slots <= 0) return [...content];

  const chosen = new Map<number, number>();
  const count = Math.min(need, slots);
  for (let k = 0; k < count; k++) {
    const j = 1 + Math.floor(((k + 0.5) * slots) / count);
    chosen.set(Math.min(j, content.length - 2), k + 1);
  }

  const out: Lesson[] = [];
  content.forEach((lesson, j) => {
    out.push(lesson);
    const n = chosen.get(j);
    if (n !== undefined) out.push(reviewLesson(n));
  });
  return out;
}

function alphabetPhase(): Lesson[] {
  const content: Lesson[] = [TUTORIAL_LESSON];
  const taught: string[] = [];
  const spent = new Set<string>();
  let drillN = 0;

  TEACHING_ORDER.forEach((letter, i) => {
    const d = getLetter(letter);
    if (!d) return;
    taught.push(letter);

    const spend = spendWordFor(letter, spent);
    if (spend) spent.add(spend.word);
    content.push(letterLesson(d, taught, spend));

    // Keyboard mechanics, once there are enough letters to type with.
    if (i === 5) content.push(langSwitchLesson());
    if (i === 11) content.push(digitsLesson());
    if (i === 17) content.push(symbolsLesson());

    if ((i + 1) % LETTER_DRILL_EVERY_N_LETTERS === 0) {
      // The first four letters cannot spell anything on their own, so the
      // drill that would follow them has nothing to drill. A lesson whose
      // only step is a card explaining what you are about to do, followed by
      // not doing it, is worse than no lesson — skip it and let the phase
      // spend the level on a review instead.
      const words = drillWords(taught, drillN + 1);
      if (words.length > 0) {
        drillN += 1;
        content.push(drillLesson(drillN, words));
      }
    }
  });

  // A-to-Z. The milestone the phase is built to land on: every letter, by
  // name, in the order they are sung in — and by now, all 26 have been met
  // individually.
  content.push({
    id: "abc-song",
    kind: "letter",
    order: 0,
    titleEn: "A to Z",
    titleHe: "כל האותיות, מ־A ועד Z",
    skills: LETTERS.map((l) => letterNameSkill(l.letter)),
    requires: [],
    steps: LETTERS.map((d) => nameStep(d, TEACHING_ORDER, 1)),
  });

  return insertReviews(content, ALPHABET_PHASE_LEVELS);
}

/** Words for the nth drill: already buildable, and a different window each
 *  time so consecutive drills are not the same two words. */
function drillWords(taught: readonly string[], n: number): WordData[] {
  const pool = buildableWords(taught);
  if (pool.length === 0) return [];
  const out: WordData[] = [];
  const start = (n * 5) % pool.length;
  for (let k = 0; out.length < LETTER_DRILL_WORDS && k < pool.length; k++) {
    const word = pool[(start + k) % pool.length]!;
    if (!out.includes(word)) out.push(word);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Phase 2 — words, levels 51..75                                        */
/* ------------------------------------------------------------------ */

function wordPhase(): Lesson[] {
  const out: Lesson[] = [];
  const pool = WORDS_BY_DIFFICULTY;
  let cursor = 0;
  let hintWasOn = true;

  for (let p = 0; p < WORD_PHASE_LEVELS; p++) {
    const n = ramp(p, WORD_PHASE_LEVELS, WORD_LESSON_WORDS_MIN, WORD_LESSON_WORDS_MAX);
    const hint = p / WORD_PHASE_LEVELS < WORD_PHASE_HINT_FRACTION;

    const words: WordData[] = [];
    while (words.length < n && pool.length > 0) {
      words.push(pool[cursor % pool.length]!);
      cursor += 1;
    }

    // Two cards in the whole phase, at the two moments something changes.
    let card: string | null = null;
    if (p === 0) {
      card =
        "כל האותיות שלך! מכאן והלאה מקלידים מילים — בכל שלב קצת יותר. מוכנים?";
    } else if (hintWasOn && !hint) {
      card =
        "מעכשיו המקלדת לא מסמנת לכם את המקש. האותיות עדיין כתובות עליה — תמצאו לבד. 💪";
    }
    hintWasOn = hint;

    out.push(wordLesson(p + 1, words, hint, card));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Phase 3 — sentences, levels 76..100                                   */
/* ------------------------------------------------------------------ */

/** Which sentence tier a level of the sentence phase drills. */
function tierForLevel(p: number): 1 | 2 | 3 {
  const f = p / SENTENCE_PHASE_LEVELS;
  if (f < (SENTENCE_TIER_CUTS[0] ?? 0.32)) return 1;
  if (f < (SENTENCE_TIER_CUTS[1] ?? 0.68)) return 2;
  return 3;
}

const TIER_CARD: Record<1 | 2 | 3, string> = {
  1: "עכשיו מילים אחת ליד השנייה — משפט. בין מילה למילה לוחצים על הרווח, המקש הארוך למטה. ␣",
  2: "משפטים של שלוש מילים. אותו דבר, רק ארוך יותר — קחו את הזמן.",
  3: "משפטים אמיתיים. אתם כותבים באנגלית! ✍️",
};

function sentencePhase(): Lesson[] {
  const out: Lesson[] = [];
  const cursors: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  let prevTier: 1 | 2 | 3 | null = null;
  let hintWasOn = true;

  for (let p = 0; p < SENTENCE_PHASE_LEVELS; p++) {
    const tier = tierForLevel(p);
    const pool = sentencesOfTier(tier);
    const n = SENTENCES_PER_LESSON[tier - 1] ?? 2;
    const hint = p / SENTENCE_PHASE_LEVELS < SENTENCE_PHASE_HINT_FRACTION;

    const picked: SentenceData[] = [];
    while (picked.length < n && pool.length > 0) {
      picked.push(pool[cursors[tier] % pool.length]!);
      cursors[tier] += 1;
    }

    // A card when the tier steps up, and one when the scaffold comes down.
    let card: string | null = null;
    if (tier !== prevTier) card = TIER_CARD[tier];
    else if (hintWasOn && !hint) {
      card = "בלי סימון על המקלדת מכאן. אתם כבר יודעים איפה הכול. 🔥";
    }
    prevTier = tier;
    hintWasOn = hint;

    out.push(sentenceLesson(p + 1, picked, hint, card));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The track                                                            */
/* ------------------------------------------------------------------ */

function buildTrack(): Lesson[] {
  const phases = [...alphabetPhase(), ...wordPhase(), ...sentencePhase()];

  // Thread `order` and the linear `requires` chain through in one pass, so no
  // builder above has to know where in the track it ended up.
  const track: Lesson[] = phases.map((lesson, i) => ({
    ...lesson,
    order: i,
    requires: i === 0 ? [] : [phases[i - 1]!.id],
  }));

  // Conversation mode. It appears on the road from the start (locked), so the
  // child can see what they are working toward. It is gated on evidence, not
  // on levels, so it deliberately requires nothing.
  track.push({
    id: "chat",
    kind: "chat",
    order: track.length,
    titleEn: "Talk in English",
    titleHe: "לדבר באנגלית",
    skills: [metaSkill("chat")],
    requires: [],
    steps: [
      {
        id: "chat-1",
        type: "chat",
        topic: "greetings",
        promptHe: "בוא נדבר!",
      },
    ],
  });

  return track;
}

export const LESSONS: readonly Lesson[] = buildTrack();

const BY_ID = new Map(LESSONS.map((l) => [l.id, l]));
export const getLesson = (id: string): Lesson | undefined => BY_ID.get(id);

/**
 * WHERE THE LEVELS ACTUALLY WENT — computed from the built track, not
 * asserted. Anything that wants to claim "every letter by level 50" should
 * read it from here; if a content change breaks the promise, this is what
 * says so out loud.
 */
export const TRACK_SHAPE: TrackShape = (() => {
  const levels = LESSONS.filter((l) => l.kind !== "chat");
  const words = new Set<string>();
  const sentences = new Set<string>();
  let lastLetterLevel = 0;

  levels.forEach((lesson, i) => {
    if (lesson.id.startsWith("letter-")) lastLetterLevel = i + 1;
    lesson.steps.forEach((step) => {
      if (step.type === "build-word") words.add(step.word);
      if (step.type === "build-sentence") sentences.add(step.sentence);
    });
  });

  return {
    total: levels.length,
    alphabetEnd: ALPHABET_PHASE_LEVELS,
    wordEnd: ALPHABET_PHASE_LEVELS + WORD_PHASE_LEVELS,
    sentenceEnd: TRACK_TOTAL_LEVELS,
    lastLetterLevel,
    wordsTyped: words.size,
    sentencesTyped: sentences.size,
  };
})();

/* ------------------------------------------------------------------ */
/* SRS bridge                                                           */
/* ------------------------------------------------------------------ */

/**
 * Turn a scheduler-chosen skill into a Step that tests it.
 * Returns null — never throws — for a skill with no content, because
 * Progress can outlive a content change.
 */
export function stepForSkill(skill: SkillId, seed = 0): Step | null {
  const parsed = parseSkill(skill);
  if (!parsed) return null;
  const { kind, value } = parsed;

  switch (kind) {
    case "letter-sound": {
      const d = getLetter(value);
      return d ? soundStep(d, TEACHING_ORDER, seed + 1) : null;
    }
    case "letter-name": {
      const d = getLetter(value);
      return d ? nameStep(d, TEACHING_ORDER, seed + 1) : null;
    }
    case "letter-shape": {
      const d = getLetter(value);
      return d ? shapeStep(d, TEACHING_ORDER, seed % 2 === 0, seed + 1) : null;
    }
    case "key": {
      const letter = value.startsWith("Key") ? value.slice(3) : null;
      const d = letter ? getLetter(letter) : undefined;
      if (d) return keyStep(d, false, seed + 1);
      // Digits and symbols have no LetterData; build the step directly.
      const glyph = value.startsWith("Digit") ? value.slice(5) : null;
      return {
        id: `key-${value}-${seed}`,
        type: "press-key",
        code: value,
        lang: "en",
        hint: false,
        promptHe: glyph ? `לחצו על ${glyph}` : "לחצו על המקש הזה",
      };
    }
    case "word": {
      const word = getWord(value);
      // A review of a word is recall: the child has built it before, so the
      // keyboard does not point at the key this time.
      return word ? wordStep(word, false, `-r${seed}`) : null;
    }
    case "sentence": {
      const data = getSentence(value);
      return data ? sentenceStep(data, false, `-r${seed}`) : null;
    }
    case "meta":
      if (value === "lang-switch") {
        return {
          id: `meta-lang-${seed}`,
          type: "press-key",
          code: "KeyA",
          lang: "he",
          hint: false,
          promptHe: "עברו לעברית (Alt+Shift) ולחצו על ש׳",
        };
      }
      return null;
    default:
      return null;
  }
}

/**
 * Assemble a review lesson from a skill list the SRS produced. Skills with no
 * content are dropped silently; if that leaves nothing at all, we fall back
 * to the first letters of the track so the lesson is never empty.
 */
export function buildReviewLesson(
  skills: readonly SkillId[],
  id = "review-adhoc",
): Lesson {
  const steps = skills
    .map((s, i) => stepForSkill(s, i))
    .filter((s): s is Step => s !== null)
    .slice(0, MIXED_REVIEW_STEPS);

  const used = steps.length > 0 ? skills.slice(0, steps.length) : [];

  if (steps.length === 0) {
    TEACHING_ORDER.slice(0, 4).forEach((letter, i) => {
      const d = getLetter(letter);
      if (d) steps.push(soundStep(d, TEACHING_ORDER, i));
    });
  }

  return {
    id,
    kind: "mixed",
    order: 999,
    titleEn: "Review",
    titleHe: "חזרה",
    skills: [...used],
    requires: [],
    steps,
  };
}

/**
 * THE WARM-UP at the top of a word or sentence level.
 *
 * Two differences from buildReviewLesson, both deliberate:
 *   · No fallback. An empty list is a valid answer and means "the scheduler
 *     has nothing to ask" — the level starts on its own first step rather
 *     than on filler.
 *   · Alphabet skills only. A warm-up exists to keep letter evidence
 *     accumulating after level 50 (see pedagogy §9); asking a child to type a
 *     whole extra word or sentence before the words they came for is not a
 *     warm-up, it is a longer level.
 */
export function buildWarmupSteps(
  skills: readonly SkillId[],
  limit: number,
): Step[] {
  if (limit <= 0) return [];
  return skills
    .filter((s) => {
      const kind = parseSkill(s)?.kind;
      return kind !== "word" && kind !== "sentence";
    })
    .map((s, i) => stepForSkill(s, i + 101))
    .filter((s): s is Step => s !== null)
    .slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Step → skills                                                        */
/* ------------------------------------------------------------------ */

/**
 * Which skills an attempt at this step is evidence about. The lesson player
 * grades every one of them, which is how a word lesson also strengthens the
 * individual key skills it exercises, and how a sentence lesson strengthens
 * the words inside it.
 */
export function skillsForStep(step: Step): SkillId[] {
  switch (step.type) {
    case "letter-sound":
      return [
        step.mode === "sound"
          ? letterSoundSkill(step.letter)
          : letterNameSkill(step.letter),
      ];
    case "letter-shape":
      return [letterShapeSkill(step.letter)];
    case "press-key": {
      const skills = [keySkill(step.code)];
      // A step that demands the Hebrew layout is also a language-switch rep.
      if (step.lang === "he") skills.push(metaSkill("lang-switch"));
      return skills;
    }
    case "build-word":
      return [wordSkill(step.word), ...uniqueKeySkills(step.word)];
    case "build-sentence":
      // A sentence is evidence about the sentence, about every word inside it
      // that the app also teaches as a word, and about every key it used.
      return [
        sentenceSkill(step.sentence),
        ...splitSentence(step.sentence)
          .filter((w) => getWord(w) !== undefined)
          .map((w) => wordSkill(w)),
        ...uniqueKeySkills(step.sentence),
      ];
    case "tutorial":
    case "chat":
      return [];
    default:
      return [];
  }
}

/** Every word the track asks a child to build, in track order. Used by the
 *  voice catalogue and by anything reporting on curriculum coverage. */
export const TRACK_WORDS: readonly string[] = Array.from(
  new Set(
    LESSONS.flatMap((l) =>
      l.steps.flatMap((s) => (s.type === "build-word" ? [s.word] : [])),
    ),
  ),
);
