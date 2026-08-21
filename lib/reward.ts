/**
 * REWARD — stars, praise, and the rules that keep them from backfiring.
 *
 * Every threshold comes from lib/pedagogy.ts, where the overjustification
 * reasoning is written out. The rules this module enforces:
 *
 *   · Everyone who finishes earns at least one star. Stars are contingent on
 *     EFFORT (finishing, and being careful), never on speed or on ability.
 *   · Three stars is not "perfect" — it tolerates one mistake, because a bar
 *     of zero mistakes teaches children to avoid anything hard.
 *   · We never say "wrong". Wrong answers get a rotating Hebrew nudge.
 *   · There is no losable streak (pedagogy.STREAK_IS_LOSSY === false).
 */

import {
  STARS_2_MAX_WRONG,
  STARS_3_MAX_WRONG,
  STARS_FOR_COMPLETION,
  STREAK_IS_LOSSY,
  SURPRISE_CELEBRATION_CHANCE,
} from "./pedagogy";

export type Stars = 0 | 1 | 2 | 3;

export interface LessonOutcome {
  completed: boolean;
  wrongAnswers: number;
  /** Steps the child got right without needing the hint. */
  unhintedCorrect: number;
  totalSteps: number;
}

export function starsFor(outcome: LessonOutcome): Stars {
  if (!outcome.completed) return 0;
  let stars: number = STARS_FOR_COMPLETION;
  if (outcome.wrongAnswers <= STARS_2_MAX_WRONG) stars += 1;
  if (outcome.wrongAnswers <= STARS_3_MAX_WRONG) stars += 1;
  return Math.min(3, Math.max(0, stars)) as Stars;
}

/** Should the bonus (unexpected) celebration fire? Unexpected rewards do not
 *  crowd out intrinsic motivation the way expected ones do. */
export function rollSurprise(random: () => number = Math.random): boolean {
  return random() < SURPRISE_CELEBRATION_CHANCE;
}

/* ------------------------------------------------------------------ */
/* Hebrew praise + nudges                                               */
/* ------------------------------------------------------------------ */

/** Praise for a correct answer. Process praise ("you looked carefully"),
 *  not person praise ("you're so smart") — Mueller & Dweck 1998. */
export const PRAISE_HE: readonly string[] = [
  "יפה מאוד!",
  "בדיוק!",
  "כל הכבוד, מצאת!",
  "אלוף!",
  "זהו, בדיוק ככה!",
  "שמת לב יפה!",
  "עבודה יסודית!",
  "מעולה!",
];

/** Nudges for a wrong answer. None of them contains the word "טעות". */
export const NUDGE_HE: readonly string[] = [
  "כמעט! ננסה שוב",
  "לא נורא, בוא ננסה עוד פעם",
  "עוד ניסיון קטן",
  "כמעט הגעת — נסה שוב",
  "זה בסדר, כולם מתבלבלים פה",
];

/** Shown when the app gives the answer away after MAX_ATTEMPTS_PER_STEP. */
export const REVEAL_HE: readonly string[] = [
  "הנה, זה כאן — עכשיו תנסה",
  "אני אראה לך, ואז תעשה אתי",
];

function pick(list: readonly string[], seed?: number): string {
  const i =
    seed === undefined
      ? Math.floor(Math.random() * list.length)
      : Math.abs(Math.floor(seed)) % list.length;
  return list[i] ?? list[0]!;
}

export const praise = (seed?: number): string => pick(PRAISE_HE, seed);
export const encouragement = (seed?: number): string => pick(NUDGE_HE, seed);
export const revealLine = (seed?: number): string => pick(REVEAL_HE, seed);

/**
 * The headline on the lesson-complete screen. Note that the one-star copy is
 * as warm as the three-star copy: a child who struggled through a lesson did
 * MORE work, not less, and the wording says so.
 */
export function completionHeadlineHe(stars: Stars): string {
  switch (stars) {
    case 3:
      return "מושלם! שלושה כוכבים";
    case 2:
      return "יפה מאוד! שני כוכבים";
    case 1:
      return "סיימת את כל השיעור — זה החלק הקשה!";
    default:
      return "עבודה טובה";
  }
}

/** Days practised. Never resets — see STREAK_IS_LOSSY. */
export function practiceDaysLabelHe(days: number): string {
  if (STREAK_IS_LOSSY) {
    // Intentionally unreachable today; kept so a future product decision has
    // exactly one place to change.
    return `רצף של ${days} ימים`;
  }
  if (days <= 0) return "היום מתחילים!";
  if (days === 1) return "יום אחד של תרגול";
  return `${days} ימים של תרגול`;
}
