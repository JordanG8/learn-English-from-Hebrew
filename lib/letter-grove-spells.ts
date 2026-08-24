import { getWord } from "./curriculum";
import type { WordData } from "./curriculum";

export type LetterGroveSpellScaffold = "guided" | "partial" | "independent";

export type LetterGroveSpellEffect = "sun-spring" | "binding-roots" | "star-pins";

export type LetterGroveSpellRound = {
  id: string;
  word: WordData;
  scaffold: LetterGroveSpellScaffold;
  effect: LetterGroveSpellEffect;
  successHe: string;
};

/**
 * The first six synthetic-phonics letters. The adventure unlocks only after
 * these letter lessons, so every rune and every word has already appeared in
 * the learning track before it becomes a spell ingredient.
 */
export const LETTER_GROVE_REQUIRED_LETTERS = ["S", "A", "T", "P", "I", "N"] as const;

export const LETTER_GROVE_RUNE_LETTERS = ["S", "A", "T", "P", "I", "N"] as const;

export const LETTER_GROVE_REQUIRED_LESSON_IDS = LETTER_GROVE_REQUIRED_LETTERS.map(
  (letter) => `letter-${letter}`,
);

function requireWord(word: string): WordData {
  const data = getWord(word);
  if (!data) throw new Error(`Letter Grove requires ${word} in the curriculum word bank.`);
  return data;
}

/**
 * These are the exact payoff words introduced by P, I and N in the main
 * track. The scaffold steps down across the encounter: copy, partial recall,
 * then independent listening/recall.
 */
export const LETTER_GROVE_SPELL_ROUNDS: readonly LetterGroveSpellRound[] = [
  {
    id: "grove-spell-tap",
    word: requireWord("TAP"),
    scaffold: "guided",
    effect: "sun-spring",
    successHe: "TAP הפעילה מזרקת אור והעירה את הרונה הראשונה!",
  },
  {
    id: "grove-spell-sit",
    word: requireWord("SIT"),
    scaffold: "partial",
    effect: "binding-roots",
    successHe: "SIT הצמיחה שורשי קסם שעצרו את הערפל!",
  },
  {
    id: "grove-spell-pin",
    word: requireWord("PIN"),
    scaffold: "independent",
    effect: "star-pins",
    successHe: "PIN זימנה סיכות כוכבים וקיבעה את הרונה האחרונה!",
  },
] as const;

export function hasLetterGrovePrerequisites(lessonsCompleted: readonly string[]): boolean {
  const completed = new Set(lessonsCompleted);
  return LETTER_GROVE_REQUIRED_LESSON_IDS.every((lessonId) => completed.has(lessonId));
}

export function revealedSpellRecipe(
  word: string,
  scaffold: LetterGroveSpellScaffold,
  assistStep: number,
): string[] {
  // Help arrives in small, non-punishing steps: the next rune first, almost
  // all of the recipe after another attempt, and the full answer only on the
  // third. The child always still performs the connection.
  const revealCount =
    assistStep >= 3
      ? word.length
      : assistStep === 2
        ? Math.max(1, word.length - 1)
        : assistStep === 1
          ? scaffold === "guided"
            ? word.length
            : Math.min(2, word.length)
          : scaffold === "guided"
            ? word.length
            : scaffold === "partial"
              ? 1
              : 0;

  return Array.from(word, (letter, index) => (index < revealCount ? letter : "_"));
}
