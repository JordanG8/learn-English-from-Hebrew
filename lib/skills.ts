/**
 * SKILL IDS — the encoding of the smallest trackable unit of learning.
 *
 * Format: "<kind>:<value>"
 *   letter-name:A     the child can say what the letter is called ("ay")
 *   letter-sound:A    the child knows the phoneme /æ/
 *   letter-shape:A    the child can pick A out of look-alikes (b/d/p/q work)
 *   key:KeyA          the child can find A on a physical keyboard
 *   word:APPLE        the child can build the whole word
 *   meta:lang-switch  app-level skills (Alt+Shift, digits row, symbols)
 *
 * Everything else in the app treats SkillId as opaque; parse only here.
 */

import type { SkillId, KeyCode } from "./types";

export type SkillKind =
  | "letter-name"
  | "letter-sound"
  | "letter-shape"
  | "key"
  | "word"
  | "meta";

export interface ParsedSkill {
  kind: SkillKind;
  value: string;
}

const KINDS: readonly SkillKind[] = [
  "letter-name",
  "letter-sound",
  "letter-shape",
  "key",
  "word",
  "meta",
];

export const letterNameSkill = (letter: string): SkillId =>
  `letter-name:${letter.toUpperCase()}`;
export const letterSoundSkill = (letter: string): SkillId =>
  `letter-sound:${letter.toUpperCase()}`;
export const letterShapeSkill = (letter: string): SkillId =>
  `letter-shape:${letter.toUpperCase()}`;
export const keySkill = (code: KeyCode): SkillId => `key:${code}`;
export const wordSkill = (word: string): SkillId => `word:${word.toUpperCase()}`;
export const metaSkill = (name: string): SkillId => `meta:${name}`;

/** Returns null for anything that is not a well-formed skill id. */
export function parseSkill(id: SkillId): ParsedSkill | null {
  const i = id.indexOf(":");
  if (i <= 0) return null;
  const kind = id.slice(0, i);
  const value = id.slice(i + 1);
  if (!value) return null;
  if (!KINDS.includes(kind as SkillKind)) return null;
  return { kind: kind as SkillKind, value };
}

export function isSkillKind(id: SkillId, kind: SkillKind): boolean {
  const p = parseSkill(id);
  return p !== null && p.kind === kind;
}

/** The English alphabet, uppercase, in order. The one place it is spelled out. */
export const ALPHABET: readonly string[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Every skill id for one letter, in teaching order: sound and shape BEFORE
 *  key position — a key is meaningless until the glyph means something. */
export function skillsForLetter(letter: string): SkillId[] {
  return [
    letterSoundSkill(letter),
    letterNameSkill(letter),
    letterShapeSkill(letter),
    keySkill(`Key${letter.toUpperCase()}`),
  ];
}
