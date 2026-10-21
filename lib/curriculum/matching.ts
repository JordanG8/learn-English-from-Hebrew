import { TEACHING_ORDER } from "./alphabet";
import { letterPhoneme } from "@/lib/phonics";
import type { LetterMatchStep, Progress } from "@/lib/types";
export function introducedLetters(progress: Progress): string[] {
  return TEACHING_ORDER.filter(l => progress.lessonsCompleted.includes(`letter-${l}`));
}
/** Start with pairs; use trios after six letters have been introduced. */
export function matchingStep(taught: readonly string[], id: string, offset = 0): LetterMatchStep | null {
  const pool = [...new Set(taught)].filter(l => TEACHING_ORDER.includes(l));
  const count = pool.length >= 6 ? 3 : 2;
  const letters: string[] = [];
  const sounds = new Set<string>();
  for (let i=0; i<pool.length; i++) {
    const letter = pool[(i+offset)%pool.length];
    const sound = letterPhoneme(letter);
    if (!sound || sounds.has(sound)) continue;
    sounds.add(sound); letters.push(letter);
    if (letters.length === count) break;
  }
  return letters.length === count ? { id, type: "letter-match", letters, promptHe: "מחברים כל אות לשם שלה, ואז את השם לצליל שלה." } : null;
}
export function canConnect(a: {column: number; letter: string}, b: {column: number; letter: string}): boolean {
  return Math.abs(a.column-b.column) === 1 && a.letter === b.letter;
}
