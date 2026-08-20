/**
 * LESSON CONSTRUCTION — the whole track, generated from the letter and word
 * data rather than hand-listed, so adding a letter or a word adds lessons
 * automatically. See docs/architecture.md → "Adding a lesson".
 *
 * Track shape, repeating:
 *
 *   letter-S  →  (payoff) word-SIT  →  letter-A  →  …  →  review-1  →  …
 *
 * A letter lesson always teaches sound → name → shape → key, in that order.
 * A keyboard lesson immediately spends the new letter on a real word. Every
 * MIXED_REVIEW_EVERY_N_LESSONS lessons, an interleaved review is inserted;
 * its steps are not stored, they are generated at play time from whatever
 * the SRS says is due (see buildReviewLesson).
 */

import type { Lesson, SkillId, Step } from "../types";
import {
  MIXED_REVIEW_EVERY_N_LESSONS,
  MIXED_REVIEW_STEPS,
} from "../pedagogy";
import {
  keySkill,
  letterNameSkill,
  letterShapeSkill,
  letterSoundSkill,
  metaSkill,
  parseSkill,
  wordSkill,
} from "../skills";
import { TOUR } from "../tour";
import { LETTERS, TEACHING_ORDER, distractorsFor, getLetter } from "./alphabet";
import { WORDS, getWord, payoffWordFor } from "./words";
import type { LetterData, WordData } from "./contract";

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
    say: `letter-sound:${d.soundSpeak}`,
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

export function wordStep(word: WordData): Step {
  return {
    id: `word-${word.word}`,
    type: "build-word",
    word: word.word,
    he: word.he,
    emoji: word.emoji,
    promptHe: `בונים את המילה ${word.he}`,
    say: `word:${word.word}`,
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
    {
      id: "t-welcome",
      type: "tutorial",
      target: null,
      advanceOn: "next-button",
      promptHe:
        "היי! כאן לומדים את האותיות באנגלית ואת המקלדת. אני אראה לך איך משחקים — לוקח רגע.",
      say: "sfx:celebrate",
    },
    {
      id: "t-map",
      type: "tutorial",
      target: TOUR.map,
      advanceOn: "tap-target",
      promptHe: "זה המסלול שלך. כל עיגול הוא שיעור אחד. גע במסלול.",
    },
    {
      id: "t-stars",
      type: "tutorial",
      target: TOUR.stars,
      advanceOn: "tap-target",
      promptHe:
        "פה נאספים הכוכבים. מקבלים כוכב על כל שיעור שמסיימים — גם אם היו טעויות בדרך. גע בכוכבים.",
    },
    {
      id: "t-chat",
      type: "tutorial",
      target: TOUR["chat-card"],
      advanceOn: "tap-target",
      promptHe:
        "פה מדברים באנגלית עם חבר מהמחשב. זה נפתח אחרי שתכיר מספיק אותיות. גע בו כדי לראות.",
    },
    {
      id: "t-replay",
      type: "tutorial",
      target: TOUR["replay-tutorial"],
      advanceOn: "tap-target",
      promptHe:
        "אם תרצה שאראה לך את זה שוב — הכפתור הזה תמיד כאן. גע בו עכשיו כדי לזכור איפה הוא.",
    },
    {
      id: "t-continue",
      type: "tutorial",
      target: TOUR.continue,
      advanceOn: "tap-target",
      promptHe:
        "וזה הכפתור הגדול. הוא תמיד לוקח אותך לדבר הבא. לחץ עליו ומתחילים!",
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Keyboard-mechanics lessons (language switch, digits, symbols)         */
/* ------------------------------------------------------------------ */

const langSwitchLesson = (order: number, requires: string[]): Lesson => ({
  id: "kb-lang",
  kind: "keyboard",
  order,
  titleEn: "Hebrew ↔ English",
  titleHe: "להחליף שפה",
  skills: [metaSkill("lang-switch")],
  requires,
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

const digitsLesson = (order: number, requires: string[]): Lesson => ({
  id: "kb-digits",
  kind: "keyboard",
  order,
  titleEn: "Numbers",
  titleHe: "המספרים",
  skills: DIGIT_CODES.map((c) => keySkill(c)),
  requires,
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

const symbolsLesson = (order: number, requires: string[]): Lesson => ({
  id: "kb-symbols",
  kind: "keyboard",
  order,
  titleEn: "Signs",
  titleHe: "סימנים",
  skills: SYMBOLS.map((s) => keySkill(s.code)),
  requires,
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
/* Track generation                                                     */
/* ------------------------------------------------------------------ */

function letterLesson(
  d: LetterData,
  order: number,
  requires: string[],
  taught: readonly string[],
): Lesson {
  return {
    id: `letter-${d.letter}`,
    kind: "letter",
    order,
    titleEn: `Letter ${d.letter}`,
    titleHe: `האות ${d.letter}`,
    skills: [
      letterSoundSkill(d.letter),
      letterNameSkill(d.letter),
      letterShapeSkill(d.letter),
      keySkill(d.code),
    ],
    requires,
    steps: [
      // 1. meet it — a full-screen card, no question yet
      {
        id: `intro-${d.letter}`,
        type: "tutorial",
        target: null,
        advanceOn: "next-button",
        promptHe: `זאת האות ${d.letter}. היא עושה את הצליל "${d.soundHe}" — כמו ב־${d.exampleWord} (${d.exampleWordHe}) ${d.emoji}`,
        say: `letter-sound:${d.soundSpeak}`,
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
    ],
  };
}

function keyboardWordLesson(word: WordData, order: number, requires: string[]): Lesson {
  const letters = word.word.split("");
  return {
    id: `word-${word.word}`,
    kind: "keyboard",
    order,
    titleEn: word.word,
    titleHe: word.he,
    skills: [wordSkill(word.word), ...letters.map((l) => keySkill(`Key${l}`))],
    requires,
    steps: [
      {
        id: `word-intro-${word.word}`,
        type: "tutorial",
        target: null,
        advanceOn: "next-button",
        promptHe: `עכשיו בונים מילה אמיתית: ${word.he} ${word.emoji}. אני אגיד אות — אתה תמצא אותה במקלדת.`,
        say: `word:${word.word}`,
      },
      wordStep(word),
    ],
  };
}

function reviewLesson(order: number, requires: string[], n: number): Lesson {
  return {
    id: `review-${n}`,
    kind: "mixed",
    order,
    titleEn: `Review ${n}`,
    titleHe: `חזרה ${n}`,
    // Skills are decided at play time by the SRS, so this list is empty and
    // the player calls buildReviewLesson(). See docs/architecture.md.
    skills: [],
    requires,
    steps: [],
  };
}

function buildTrack(): Lesson[] {
  const lessons: Lesson[] = [TUTORIAL_LESSON];
  let order = 1;
  let prev = TUTORIAL_LESSON.id;
  let reviewN = 1;
  let sinceReview = 0;
  const taught: string[] = [];

  const push = (l: Lesson) => {
    lessons.push(l);
    prev = l.id;
    order += 1;
    sinceReview += 1;
  };

  const maybeReview = () => {
    if (sinceReview >= MIXED_REVIEW_EVERY_N_LESSONS) {
      push(reviewLesson(order, [prev], reviewN));
      reviewN += 1;
      sinceReview = 0;
    }
  };

  TEACHING_ORDER.forEach((letter, i) => {
    const d = getLetter(letter);
    if (!d) return;
    taught.push(letter);
    push(letterLesson(d, order, [prev], taught));

    // Spend the letter immediately, if it just unlocked a word.
    const payoff = payoffWordFor(letter);
    if (payoff) push(keyboardWordLesson(payoff, order, [prev]));

    // Keyboard mechanics, once there are enough letters to type with.
    if (i === 5) push(langSwitchLesson(order, [prev]));
    if (i === 11) push(digitsLesson(order, [prev]));
    if (i === 17) push(symbolsLesson(order, [prev]));

    maybeReview();
  });

  // Any remaining words that no single letter "unlocked" (because their last
  // letter also unlocked an earlier word) still deserve a lesson.
  const covered = new Set(
    lessons.filter((l) => l.id.startsWith("word-")).map((l) => l.id),
  );
  WORDS.filter((word) => !covered.has(`word-${word.word}`))
    .sort((a, b) => a.tier - b.tier || a.word.localeCompare(b.word))
    .forEach((word) => {
      push(keyboardWordLesson(word, order, [prev]));
      maybeReview();
    });

  // The alphabet song, once every letter has been met individually.
  push({
    id: "abc-song",
    kind: "letter",
    order,
    titleEn: "A to Z",
    titleHe: "כל האותיות מא׳ עד ת׳",
    skills: LETTERS.map((l) => letterNameSkill(l.letter)),
    requires: [prev],
    steps: LETTERS.map((d) => nameStep(d, TEACHING_ORDER, 1)),
  });

  // Conversation mode. It appears on the map from the start (locked), so the
  // child can see what they are working toward.
  lessons.push({
    id: "chat",
    kind: "chat",
    order: order + 1,
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

  return lessons;
}

export const LESSONS: readonly Lesson[] = buildTrack();

const BY_ID = new Map(LESSONS.map((l) => [l.id, l]));
export const getLesson = (id: string): Lesson | undefined => BY_ID.get(id);

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
      return word ? wordStep(word) : null;
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

/* ------------------------------------------------------------------ */
/* Step → skills                                                        */
/* ------------------------------------------------------------------ */

/**
 * Which skills an attempt at this step is evidence about. The lesson player
 * grades every one of them, which is how a word lesson also strengthens the
 * individual key skills it exercises.
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
      return [
        wordSkill(step.word),
        ...Array.from(new Set(step.word.split(""))).map((l) => keySkill(`Key${l}`)),
      ];
    case "tutorial":
    case "chat":
      return [];
    default:
      return [];
  }
}
