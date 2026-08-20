/**
 * SHARED CONTRACTS — the interop surface between every module.
 *
 * Rule for contributors: you may ADD to this file, you may not silently change
 * the shape of anything already here. Other modules are compiled against it.
 */

/* ------------------------------------------------------------------ */
/* Language + keyboard                                                  */
/* ------------------------------------------------------------------ */

export type Lang = "en" | "he";

/** A physical key, identified by KeyboardEvent.code (layout-independent). */
export type KeyCode = string; // "KeyA", "Semicolon", "Space", "ShiftLeft"...

export type Finger =
  | "l-pinky" | "l-ring" | "l-middle" | "l-index"
  | "thumb"
  | "r-index" | "r-middle" | "r-ring" | "r-pinky";

/** One physical key and what it produces in each layout. */
export interface KeyCap {
  code: KeyCode;
  /** Row 0 = digits, 1 = QWERTY row, 2 = home row, 3 = ZXCV row, 4 = space row. */
  row: 0 | 1 | 2 | 3 | 4;
  /** Visual width in units where a standard letter key = 1. */
  width?: number;
  finger: Finger;
  hand: "L" | "R";
  /** Character produced under the US-English layout. */
  en: { lower: string; upper: string };
  /** Character produced under the Hebrew (SI-1452) layout. null = no Hebrew glyph. */
  he: { lower: string; upper: string } | null;
  /** True for the home-row keys that carry a physical bump (F and J). */
  homeAnchor?: boolean;
}

/* ------------------------------------------------------------------ */
/* Curriculum                                                           */
/* ------------------------------------------------------------------ */

export type LessonKind =
  | "tutorial"   // how the app itself works
  | "keyboard"   // Simon-says key finding, builds to a whole word
  | "letter"     // one letter: name, sound, shape, then its key
  | "mixed"      // interleaved review across earlier skills
  | "chat";      // AI conversation mode

/**
 * A skill is the smallest thing we track mastery of.
 * Formats:  "letter-name:A" | "letter-sound:A" | "key:KeyA" | "word:APPLE"
 */
export type SkillId = string;

export interface Lesson {
  id: string;
  kind: LessonKind;
  /** Ordering within the track. */
  order: number;
  titleEn: string;
  titleHe: string;
  /** Skills this lesson teaches or reviews. Drives unlocking + SRS scheduling. */
  skills: SkillId[];
  /** Lesson ids that must be completed before this one unlocks. */
  requires: string[];
  steps: Step[];
}

export type Step =
  | TutorialStep
  | PressKeyStep
  | BuildWordStep
  | LetterSoundStep
  | LetterShapeStep
  | ChatStep;

interface StepCommon {
  id: string;
  /** Instruction shown in Hebrew (always present — this is the L1 scaffold). */
  promptHe: string;
  /** Instruction shown in English, when the learner is ready for it. */
  promptEn?: string;
  /** Audio cue key, resolved by lib/audio.ts */
  say?: string;
}

export interface TutorialStep extends StepCommon {
  type: "tutorial";
  /** CSS selector of the UI element to spotlight, or null for a full-screen card. */
  target: string | null;
  /** What the learner must do to advance. "tap-target" forces real interaction. */
  advanceOn: "tap-target" | "press-any-key" | "next-button";
}

export interface PressKeyStep extends StepCommon {
  type: "press-key";
  code: KeyCode;
  /** Which layout must be active. Forces an Alt+Shift switch when it differs. */
  lang: Lang;
  /** Show the key highlighted on the virtual keyboard. Off = recall, not recognition. */
  hint: boolean;
}

export interface BuildWordStep extends StepCommon {
  type: "build-word";
  /** Uppercase target, e.g. "APPLE". */
  word: string;
  he: string;          // Hebrew gloss, e.g. "תפוח"
  emoji: string;       // celebration payload
}

export interface LetterSoundStep extends StepCommon {
  type: "letter-sound";
  letter: string;              // "A"
  /** The correct answer among `options`. */
  answer: string;
  options: string[];
  mode: "name" | "sound";
}

export interface LetterShapeStep extends StepCommon {
  type: "letter-shape";
  letter: string;
  /** Distractor glyphs shown alongside the target. */
  options: string[];
  /** Test upper/lower matching when true. */
  caseMatch: boolean;
}

export interface ChatStep extends StepCommon {
  type: "chat";
  topic: string;
}

/* ------------------------------------------------------------------ */
/* Mastery / spaced repetition                                          */
/* ------------------------------------------------------------------ */

export interface SkillState {
  id: SkillId;
  /** Successful recalls in a row. Drives the interval ladder. */
  streak: number;
  reps: number;
  lapses: number;
  /** Rolling accuracy 0..1 over the last N attempts. */
  accuracy: number;
  /** epoch ms */
  lastSeen: number;
  /** epoch ms — when this skill should be reviewed again. */
  dueAt: number;
  /** Distinct days on which this skill was answered correctly. */
  daysCorrect: number;
}

export interface Progress {
  /** Bump when the shape changes; lib/progress.ts migrates. */
  version: 1;
  createdAt: number;
  skills: Record<SkillId, SkillState>;
  lessonsCompleted: string[];
  /** lessonId -> stars earned (best attempt). */
  stars: Record<string, 0 | 1 | 2 | 3>;
  /** Words the learner has successfully built — the chat lexicon. */
  knownWords: string[];
  /** Has the mandatory walkthrough been completed at least once? */
  onboarded: boolean;
  /** Set when the alphabet mastery criterion is met; unlocks chat. */
  chatUnlockedAt: number | null;
}

/* ------------------------------------------------------------------ */
/* Chat (conversation mode)                                             */
/* ------------------------------------------------------------------ */

export interface ChatRequestBody {
  messages: { role: "user" | "assistant"; content: string }[];
  /** Words the learner has mastered — the AI may use these freely. */
  lexicon: string[];
  /** Letters mastered, for spelling-level constraints. */
  letters: string[];
  /** How many unseen English words the AI may introduce this turn. */
  newWordBudget: number;
}
