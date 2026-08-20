/**
 * PEDAGOGY CONSTANTS — the single tuning surface for the whole app.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ EVERY pedagogical number in this codebase lives here. If you find a  │
 * │ magic number about intervals, mastery, budgets or rewards anywhere   │
 * │ else, that is a bug — move it here.                                  │
 * │                                                                      │
 * │ The research agent owns `docs/research.md` and finishes AFTER this   │
 * │ file was written. Values marked PROVISIONAL are defensible defaults  │
 * │ drawn from the literature summarised in each comment; retuning them  │
 * │ must remain a one-file edit. Do not change the NAMES without         │
 * │ grepping — the lesson engine reads them by name.                     │
 * └──────────────────────────────────────────────────────────────────────┘
 */

/* ------------------------------------------------------------------ */
/* Time units                                                           */
/* ------------------------------------------------------------------ */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/* ------------------------------------------------------------------ */
/* 1. Spaced repetition ladder                                          */
/* ------------------------------------------------------------------ */

/**
 * Interval ladder indexed by `SkillState.streak` (successes in a row).
 * An expanding schedule — short first gap, then roughly ×2.2 — is the
 * standard expanding-retrieval shape (Landauer & Bjork; Cepeda et al. 2006
 * found optimal gaps scale with the retention interval).
 *
 * The first rung is deliberately ~10 minutes and NOT seconds: an interval
 * short enough to be answered from working memory produces no storage
 * strength. Within one session a skill re-appears via INTRA_SESSION_GAP
 * instead of via this ladder.
 *
 * PROVISIONAL — pending docs/research.md.
 */
export const INTERVAL_LADDER_MS: readonly number[] = [
  10 * MINUTE_MS, //  streak 0 → seen again later today
  1 * DAY_MS, //      streak 1 → tomorrow
  3 * DAY_MS, //      streak 2
  7 * DAY_MS, //      streak 3
  16 * DAY_MS, //     streak 4
  35 * DAY_MS, //     streak 5+
];

/** How many *other* items must come between two showings of the same skill
 *  inside one session. Interleaving beats blocking for durability
 *  (Rohrer & Taylor 2007). PROVISIONAL. */
export const INTRA_SESSION_GAP = 3;

/** A lapse (wrong answer on a due item) drops the streak by this much
 *  rather than to zero — a 7-year-old who mis-taps once should not lose a
 *  week of work. Floor is 0. PROVISIONAL. */
export const LAPSE_STREAK_PENALTY = 1;

/** After a lapse the item comes back this soon, regardless of ladder. */
export const RELEARN_INTERVAL_MS = 5 * MINUTE_MS;

/** Rolling accuracy window: accuracy is an exponential moving average with
 *  this weight on the newest attempt (≈ last 8 attempts dominate). */
export const ACCURACY_EMA_ALPHA = 0.25;

/** Accuracy assigned to a brand-new skill before any evidence exists.
 *  Neutral-low so a skill can never look mastered on rep #1. */
export const INITIAL_ACCURACY = 0.5;

/* ------------------------------------------------------------------ */
/* 2. Mastery criterion                                                 */
/* ------------------------------------------------------------------ */

/**
 * A skill counts as MASTERED only when ALL of these hold. The point of the
 * conjunction is that none of them can be gamed by clicking fast:
 *   - reps      → enough evidence exists at all
 *   - accuracy  → the evidence is good
 *   - streak    → it is good *now*, not only historically
 *   - daysCorrect → the evidence is spread over distinct calendar days,
 *                   which is the only thing that distinguishes durable
 *                   learning from same-session familiarity.
 *
 * PROVISIONAL — pending docs/research.md.
 */
export const MASTERY_MIN_REPS = 5;
export const MASTERY_MIN_ACCURACY = 0.85;
export const MASTERY_MIN_STREAK = 3;
/** Distinct calendar days with at least one correct answer. 3 days ⇒ the
 *  item survived at least two overnight consolidation windows. */
export const MASTERY_MIN_DISTINCT_DAYS = 3;

/* ------------------------------------------------------------------ */
/* 3. Chat unlock — "the alphabet is mastered well enough to converse"  */
/* ------------------------------------------------------------------ */

/**
 * Chat is gated on evidence, never on lessons clicked through. Requiring a
 * perfect 26/26 would leave most children permanently locked out (and the
 * long tail — Q, X, Z — is the least useful for conversation), so the gate
 * is a high fraction plus an independent vocabulary floor plus a
 * calendar-spread floor.
 *
 * PROVISIONAL — pending docs/research.md.
 */
/** Fraction of the 26 letters whose NAME and SOUND skills are both mastered. */
export const CHAT_UNLOCK_LETTER_FRACTION = 0.8; // ⇒ 21 of 26
/** Words the child has actually built. Below this the AI has nothing to say. */
export const CHAT_UNLOCK_MIN_WORDS = 10;
/** Distinct days of practice overall. Prevents a single marathon session
 *  from unlocking conversation. */
export const CHAT_UNLOCK_MIN_PRACTICE_DAYS = 4;

/* ------------------------------------------------------------------ */
/* 4. Session shape                                                     */
/* ------------------------------------------------------------------ */

/** New letters introduced per letter-lesson. One at a time: the whole
 *  premise is that a letter is spent immediately, not queued. */
export const NEW_LETTERS_PER_LESSON = 1;

/** New words a keyboard lesson may introduce. */
export const NEW_WORDS_PER_KEYBOARD_LESSON = 1;

/** Steps in a mixed-review lesson. ~8 keeps a session under the ~5 minutes
 *  a 7-year-old sustains without a break. PROVISIONAL. */
export const MIXED_REVIEW_STEPS = 8;

/** Of those, how many may be *not* currently due (filler when the due queue
 *  is short) — keeps review lessons a constant, predictable length. */
export const MIXED_REVIEW_MAX_FILLER = 3;

/** How many lessons of other kinds before a mixed review is inserted.
 *  Interleaving cadence. PROVISIONAL. */
export const MIXED_REVIEW_EVERY_N_LESSONS = 3;

/** Wrong answers on one step before the app shows the answer and moves on.
 *  Failure loops are the fastest way to lose a child. */
export const MAX_ATTEMPTS_PER_STEP = 3;

/** After this many consecutive wrong answers anywhere in a lesson, the
 *  player drops difficulty (turns hints back on). */
export const HINT_RESCUE_AFTER_WRONG = 2;

/* ------------------------------------------------------------------ */
/* 5. Reward schedule                                                   */
/* ------------------------------------------------------------------ */

/**
 * Overjustification (Lepper, Greene & Nisbett 1973; Deci, Koestner & Ryan
 * 1999 meta-analysis): *expected, tangible, task-contingent* rewards reduce
 * intrinsic motivation. *Unexpected* rewards and rewards contingent on
 * EFFORT or on meeting a standard do not — and verbal praise reliably
 * increases it.
 *
 * Design consequences encoded below:
 *   a. Stars are earned for FINISHING, with extra stars for care taken —
 *      never for being fast or being clever. Everyone who finishes gets ≥1.
 *   b. Celebration is guaranteed at word completion (it is the point of the
 *      loop), but the *extra* surprise celebration fires unpredictably.
 *   c. Streaks are never displayed as something you can lose. See
 *      STREAK_IS_LOSSY.
 */

/** Every child who completes a lesson gets at least this. Effort-contingent. */
export const STARS_FOR_COMPLETION = 1;
/** Second star: at most this many total wrong answers in the lesson. */
export const STARS_2_MAX_WRONG = 3;
/** Third star: at most this many. Note it is not "zero" — perfection as the
 *  bar teaches risk-aversion. */
export const STARS_3_MAX_WRONG = 1;

/** Probability that a *bonus* surprise celebration plays on top of the
 *  normal one. Unexpected reward — the variety that does not crowd out
 *  intrinsic motivation. PROVISIONAL. */
export const SURPRISE_CELEBRATION_CHANCE = 0.2;

/** Confetti pieces. Keep low enough for a cheap phone to hold 60fps. */
export const CONFETTI_PIECES = 60;
export const CELEBRATION_MS = 2600;

/**
 * FALSE on purpose. A day-streak counter that resets to zero is punitive
 * framing for a 7-year-old and converts a missed day into a reason to quit.
 * We count *total days practised*, which only ever goes up. If a future
 * product decision reintroduces a resettable streak, flip this and handle
 * it in exactly one place.
 */
export const STREAK_IS_LOSSY = false;

/** Wording rule: on a wrong answer we never say "wrong". See
 *  lib/reward.ts#encouragement — a rotating set of Hebrew nudges. */
export const ENCOURAGEMENT_ON_WRONG = true;

/* ------------------------------------------------------------------ */
/* 6. Conversation mode (progressive overload)                          */
/* ------------------------------------------------------------------ */

/** New (unmastered) English words the AI may introduce per turn. i+1 style
 *  comprehensible input (Krashen): enough to grow, little enough to parse.
 *  PROVISIONAL. */
export const CHAT_NEW_WORDS_PER_TURN = 2;

/** Hard ceiling accepted by the API route, regardless of what the client
 *  asks for. Client input is untrusted. */
export const CHAT_NEW_WORDS_MAX = 4;

/** Maximum English words in one AI turn. Short turns keep a beginner
 *  reading rather than skimming. */
export const CHAT_MAX_ENGLISH_WORDS_PER_TURN = 12;

/** Conversation history sent upstream (turns, not messages). */
export const CHAT_HISTORY_TURNS = 8;

/** Model served through the Vercel AI Gateway. */
export const CHAT_MODEL = "anthropic/claude-sonnet-5";

/* ------------------------------------------------------------------ */
/* 7. Onboarding                                                        */
/* ------------------------------------------------------------------ */

/** Cookie/localStorage keys are in lib/progress.ts; only the *policy*
 *  numbers live here. */

/** The walkthrough is mandatory on first visit. A returning visitor may
 *  skip it — but only via a visible button, never automatically. */
export const TUTORIAL_SKIPPABLE_FOR_RETURNERS = true;

/** A "returning visitor" cookie lives this long. Long enough to cover a
 *  school term. */
export const RETURNING_COOKIE_MAX_AGE_S = 180 * 24 * 60 * 60;

/** Milliseconds the skip button stays hidden after the walkthrough opens,
 *  so a child cannot dismiss it by reflex-tapping where the last button
 *  was. Adults will wait 1.2s; reflex taps happen inside ~400ms. */
export const TUTORIAL_SKIP_REVEAL_DELAY_MS = 1200;
