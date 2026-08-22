/**
 * WORD TEMPLATES — the exercise the AI can hand the child mid-conversation.
 *
 * A template is a word the child already knows with some of its letters taken
 * out, for them to type back on the keyboard:
 *
 *     🐱  חתול      C _ T
 *
 * Why the AI gets a *tool* for this instead of just writing "C _ T" in its
 * reply:
 *
 *   1. A template built by the model is a string, and a string cannot be
 *      graded, cannot spotlight a key, and cannot feed the SRS. A template
 *      built here is DATA — the client renders real slots, the keypress that
 *      fills one is checked against the real answer, and finishing one records
 *      an attempt against `word:<WORD>` like any lesson would.
 *   2. It cannot go wrong. The model chooses *which* word, never the spelling
 *      and never the blanks: the word is looked up in the app's own bank and
 *      the blanks are computed here. A hallucinated word, a misspelling, or a
 *      word the child has never met is rejected before it reaches the screen.
 *
 * This module is pure data and is imported by both the route and the client.
 */

import {
  CHAT_TEMPLATE_MAX_BLANKS,
  CHAT_TEMPLATE_MAX_PER_TURN,
} from "./pedagogy";
import { WORDS } from "./curriculum/words";

/**
 * Which letters to take out. The model picks the shape because it knows what
 * the conversation is about — "the last sound" after talking about sounds —
 * but every shape is resolved to concrete indices here.
 */
export const TEMPLATE_SHAPES = ["last", "first", "middle", "vowels"] as const;

export type TemplateShape = (typeof TEMPLATE_SHAPES)[number];

export interface WordTemplate {
  /** Stable within a turn; the client namespaces it by message. */
  id: string;
  /** The full answer, uppercase. */
  word: string;
  /** Hebrew gloss from the word bank — the whole clue. */
  he: string;
  emoji: string;
  /** Ascending indices into `word` that the child must supply. */
  blanks: number[];
}

const VOWELS = new Set(["A", "E", "I", "O", "U"]);

const WORD_BANK: ReadonlyMap<string, (typeof WORDS)[number]> = new Map(
  WORDS.map((w) => [w.word, w] as const),
);

/** The app's own entry for a word, or null if the app does not teach it. */
export function lookupWord(raw: string) {
  const key = raw.toUpperCase().replace(/[^A-Z]/g, "");
  return WORD_BANK.get(key) ?? null;
}

/**
 * Indices to blank out. Two rules hold for every shape, because a template
 * with nothing left to read is not a cue, it is a spelling test:
 * at most CHAT_TEMPLATE_MAX_BLANKS blanks, and at least one letter shown.
 */
function blanksFor(word: string, shape: TemplateShape): number[] {
  const last = word.length - 1;
  const raw =
    shape === "first"
      ? [0]
      : shape === "last"
        ? [last]
        : shape === "middle"
          ? [Math.floor(last / 2)]
          : [...word].flatMap((ch, i) => (VOWELS.has(ch) ? [i] : []));

  const capped = raw.slice(0, CHAT_TEMPLATE_MAX_BLANKS);
  // An all-vowel or two-letter word would leave nothing on screen.
  const kept = capped.length >= word.length ? capped.slice(0, word.length - 1) : capped;
  // "vowels" on a word with none falls back to the last letter.
  return kept.length > 0 ? kept.sort((a, b) => a - b) : [last];
}

/**
 * Build one template. Returns null when the word is not in the app's bank —
 * the caller reports that back to the model rather than showing anything.
 */
export function buildTemplate(word: string, shape: TemplateShape): WordTemplate | null {
  const data = lookupWord(word);
  if (!data || data.word.length < 3) return null;
  const blanks = blanksFor(data.word, shape);
  return {
    id: `${data.word}-${blanks.join("")}`,
    word: data.word,
    he: data.he,
    emoji: data.emoji,
    blanks,
  };
}

/**
 * Build a turn's worth of templates, keeping only words on `allowed` (the
 * child's own mastered lexicon). Returns what was made and what was refused,
 * because the model is told why so it can pick again.
 */
export function buildTemplates(
  words: readonly string[],
  shape: TemplateShape,
  allowed: readonly string[],
): { made: WordTemplate[]; rejected: string[] } {
  const allowedSet = new Set(allowed.map((w) => w.toUpperCase()));
  const made: WordTemplate[] = [];
  const rejected: string[] = [];
  const seen = new Set<string>();

  for (const raw of words) {
    if (made.length >= CHAT_TEMPLATE_MAX_PER_TURN) break;
    const t = buildTemplate(raw, shape);
    if (!t || !allowedSet.has(t.word)) {
      rejected.push(raw.toUpperCase());
      continue;
    }
    if (seen.has(t.word)) continue;
    seen.add(t.word);
    made.push(t);
  }
  return { made, rejected };
}

/** The letter the child owes for blank number `filled`, or null when done. */
export function nextAnswer(t: WordTemplate, filled: number): string | null {
  const index = t.blanks[filled];
  return index === undefined ? null : (t.word[index] ?? null);
}

/**
 * What each position shows right now: a letter that was never hidden, a
 * letter the child has typed, or null for a blank still to fill.
 */
export function templateSlots(t: WordTemplate, typed: readonly string[]): (string | null)[] {
  const order = new Map(t.blanks.map((idx, i) => [idx, i] as const));
  return [...t.word].map((ch, i) => {
    const slot = order.get(i);
    if (slot === undefined) return ch;
    return typed[slot] ?? null;
  });
}

/** A one-line rendering for screen readers and for the model's own record. */
export function templateMask(t: WordTemplate): string {
  const blanks = new Set(t.blanks);
  return [...t.word].map((ch, i) => (blanks.has(i) ? "_" : ch)).join(" ");
}
