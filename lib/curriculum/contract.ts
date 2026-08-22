/**
 * CURRICULUM CONTRACT — the shape of the content, declared separately from
 * the content itself.
 *
 * The content module (`lib/curriculum/index.ts`) implements this; the screens
 * import types from here and data from there. Keeping the contract in its own
 * file lets UI and content be written at the same time without either one
 * waiting for the other.
 *
 * ADDING A NEW LESSON: see docs/architecture.md → "Adding a lesson".
 */

import type { Lesson, SkillId, Step } from "../types";

/** Everything the app knows about one English letter. */
export interface LetterData {
  /** Uppercase. */
  letter: string;
  lower: string;
  /** The letter's NAME, written so Hebrew-speaking children can read it. */
  nameHe: string;
  /** The letter's name for the English TTS voice, e.g. "A". */
  nameEn: string;
  /** The letter's SOUND, written in Hebrew letters, e.g. "אַ" for /æ/. */
  soundHe: string;
  /** An orthographic hint for the TTS voice, e.g. "ah" — TTS cannot read IPA. */
  soundSpeak: string;
  /** IPA, for documentation and for a teacher reading the source. */
  ipa: string;
  /** Keyboard key. Always `Key${letter}` for A–Z. */
  code: string;
  /** Letters this one is genuinely confused with. b/d/p/q, m/n, i/l/1... */
  confusables: string[];
  /** A word beginning with this letter that the child will build. */
  exampleWord: string;
  exampleWordHe: string;
  emoji: string;
}

/** A word the child builds letter by letter on the keyboard. */
export interface WordData {
  /** Uppercase, e.g. "APPLE". */
  word: string;
  /** Hebrew gloss, e.g. "תפוח". */
  he: string;
  emoji: string;
  /** Letters that must already be introduced before this word is buildable. */
  requiresLetters: string[];
  /** Rough ordering hint — lower is earlier. */
  tier: 1 | 2 | 3;
}

/**
 * A sentence the child types word by word, space bar included.
 *
 * `words` and `requiresWords` are DERIVED from `text` by the builder in
 * `sentences.ts`, so a sentence can never disagree with its own spelling. So
 * is `tier`: two words, three words, four-or-more.
 */
export interface SentenceData {
  /** Uppercase, single spaces, e.g. "I SEE A CAT". */
  text: string;
  /** Natural Hebrew for the whole sentence — not a word-by-word calque. */
  he: string;
  emoji: string;
  /** The grammar shape being drilled, e.g. "i-can". Groups a lesson. */
  pattern: string;
  /** 1 = two words, 2 = three words, 3 = four or more. Derived from length. */
  tier: 1 | 2 | 3;
  /** The words, uppercase, in order. */
  words: string[];
  /** Distinct words this sentence needs the child to be able to type. */
  requiresWords: string[];
}

/**
 * The bridge between the SRS engine and the content: given a skill the
 * scheduler wants reviewed, produce a Step that tests it.
 *
 * MUST return null (not throw) for a skill it has no content for — the
 * scheduler works from whatever is in Progress, which can outlive a content
 * change.
 */
export type StepForSkill = (skill: SkillId, seed?: number) => Step | null;

export interface CurriculumApi {
  /** The whole track, in order. Ids are stable and used as localStorage keys. */
  LESSONS: readonly Lesson[];
  /** The mandatory first-visit walkthrough. Also reachable from "show again". */
  TUTORIAL_LESSON: Lesson;
  LETTERS: readonly LetterData[];
  WORDS: readonly WordData[];
  SENTENCES: readonly SentenceData[];
  getLesson: (id: string) => Lesson | undefined;
  getLetter: (letter: string) => LetterData | undefined;
  stepForSkill: StepForSkill;
  /** Build an ad-hoc review lesson from a scheduler-chosen skill list. */
  buildReviewLesson: (skills: readonly SkillId[], id?: string) => Lesson;
  /**
   * Steps for a lesson's opening warm-up. Unlike buildReviewLesson this has
   * NO fallback content: an empty list means the scheduler had nothing to
   * ask, and the lesson simply starts on its own first step.
   */
  buildWarmupSteps: (skills: readonly SkillId[], limit: number) => Step[];
  /** The declared phase boundaries of the track, for anything that reports
   *  on the shape of the curriculum. */
  TRACK_SHAPE: TrackShape;
}

/**
 * WHERE THE LEVELS WENT. Exported so the arithmetic behind "all 26 letters by
 * level 50" is checkable rather than asserted in a comment — see
 * lib/pedagogy.ts §9 for the numbers this is generated to satisfy.
 */
export interface TrackShape {
  total: number;
  /** Levels 1..alphabetEnd introduce every letter. */
  alphabetEnd: number;
  /** Levels alphabetEnd+1..wordEnd are word typing. */
  wordEnd: number;
  /** Levels wordEnd+1..total are sentences. */
  sentenceEnd: number;
  /** The level the last new letter is introduced on. Must be <= alphabetEnd. */
  lastLetterLevel: number;
  /** Distinct words the track asks the child to build, across all phases. */
  wordsTyped: number;
  /** Distinct sentences the track asks the child to build. */
  sentencesTyped: number;
}
