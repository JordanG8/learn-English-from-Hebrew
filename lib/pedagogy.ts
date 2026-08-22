/**
 * PEDAGOGY CONSTANTS — the single tuning surface for the whole app.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ EVERY pedagogical number in this codebase lives here. If you find a  │
 * │ magic number about intervals, mastery, budgets or rewards anywhere   │
 * │ else, that is a bug — move it here.                                  │
 * │                                                                      │
 * │ These values are reconciled against `docs/research.md`, which is the │
 * │ authority. Each carries that document's CONFIDENCE TAG:              │
 * │                                                                      │
 * │   [conf A] strong, directly applicable evidence                      │
 * │   [conf B] good evidence, some inference to our population           │
 * │   [conf C] a defensible guess — the research doc says so plainly     │
 * │                                                                      │
 * │ docs/research.md asks explicitly that these tags are not stripped     │
 * │ when the numbers are copied into code: "a guess that loses its label │
 * │ becomes a fact, and then nobody re-examines it." Keep them.          │
 * │                                                                      │
 * │ Where this file DIVERGES from the research doc, the divergence is    │
 * │ marked DIVERGENCE and says why. Retuning must remain a one-file edit.│
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
 * SPACING_INTERVALS_DAYS — [conf A]
 *
 * Interval ladder indexed by `SkillState.streak` (successes in a row):
 * same-session, then 1, 3, 7, 14, 30 days. Cepeda et al. 2008 (n > 1350):
 * the optimal gap is ≈ 10–20% of the desired retention interval, so a
 * 14–30 day terminal gap is right for "retained through a school year".
 *
 * SPACING_SHAPE = expanding, multiplier ≈ 2 — [conf B]. Note the honest
 * caveat from docs/research.md §4: Latimier, Peyre & Ramus (2021,
 * meta-analysis, 29 studies) found *spacing* works (g = 0.74) but found NO
 * evidence that expanding beats uniform. Expanding is chosen because it is
 * cheaper in total reps for the same retention, not because it is magic.
 * Uniform spacing is a defensible fallback if this ever complicates things.
 *
 * The first rung is ~10 minutes and NOT seconds: an interval short enough to
 * be answered from working memory produces no storage strength.
 */
export const INTERVAL_LADDER_MS: readonly number[] = [
  10 * MINUTE_MS, //  streak 0 → later in the same session
  1 * DAY_MS, //      streak 1 → tomorrow
  3 * DAY_MS, //      streak 2
  7 * DAY_MS, //      streak 3
  14 * DAY_MS, //     streak 4
  30 * DAY_MS, //     streak 5+
];

/** How many *other* items must come between two showings of the same skill
 *  inside one session — the "0 (same session)" rung of the ladder above.
 *  docs/research.md specifies ≥ 5 intervening items. [conf A] */
export const INTRA_SESSION_GAP = 5;

/** INTERLEAVE_MIN_DISTINCT_ITEMS — distinct items a drill block must mix.
 *  Interleaving beats blocking for discrimination learning, and telling b
 *  from d IS a discrimination task (Chen et al. 2025; Kang 2016). [conf A] */
export const INTERLEAVE_MIN_DISTINCT_ITEMS = 4;

/** BLOCK_ON_FIRST_INTRODUCTION — the first few exposures of a brand-new item
 *  are blocked (all together), and only then interleaved. Children benefit
 *  less from interleaving than adults; a short blocked run reduces early
 *  failure. [conf B] This is why a letter lesson drills one letter and the
 *  interleaving starts at the first mixed review. */
export const BLOCKED_INTRODUCTION_EXPOSURES = 3;

/** LAPSE_PENALTY — [conf C, explicitly a guess in docs/research.md]
 *  A lapse drops the streak back two rungs rather than to zero. Avoids the
 *  demoralising full reset while still forcing re-consolidation. A
 *  7-year-old who mis-taps once should not lose a week of work. Floor is 0. */
export const LAPSE_STREAK_PENALTY = 2;

/** After a lapse the item comes back this soon, regardless of ladder. */
export const RELEARN_INTERVAL_MS = 5 * MINUTE_MS;

/** Rolling accuracy window: accuracy is an exponential moving average with
 *  this weight on the newest attempt (≈ last 8 attempts dominate). */
export const ACCURACY_EMA_ALPHA = 0.25;

/** Accuracy assigned to a brand-new skill before any evidence exists.
 *  Neutral-low so a skill can never look mastered on rep #1. */
export const INITIAL_ACCURACY = 0.5;

/** TARGET_IN_SESSION_ACCURACY — the difficulty the item selector aims at.
 *  The "Eighty-Five Percent Rule": optimal training error ≈ 15%
 *  (Wilson et al., Nature Communications, 2019). [conf B]
 *  Below this in practice, slow the introduction rate down. */
export const TARGET_IN_SESSION_ACCURACY = 0.85;

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
/** Enough evidence to judge at all. [conf C — our number, not the doc's] */
export const MASTERY_MIN_REPS = 5;
/** MASTERY_ACCURACY — [conf B] The behavioural analogue of the BKT
 *  P(mastery) ≥ 0.95 convention standard in intelligent tutoring systems. */
export const MASTERY_MIN_ACCURACY = 0.9;
/** It is good NOW, not only historically. [conf C — our number] */
export const MASTERY_MIN_STREAK = 3;
/** MASTERY_DISTINCT_DAYS — [conf A] The load-bearing condition. Spaced-
 *  retrieval research shows same-day performance systematically overstates
 *  durable learning (Latimier et al. 2021, g = 0.74 spaced over massed), so
 *  3 distinct calendar days is what separates learning from familiarity.
 *  docs/research.md also asks for MASTERY_SESSIONS ≥ 3; we approximate
 *  sessions by distinct days — see DIVERGENCE note below. */
export const MASTERY_MIN_DISTINCT_DAYS = 3;

/**
 * MASTERY_MEDIAN_LATENCY_MS — [conf C, round numbers, explicitly a guess]
 *
 * Automaticity, not just accuracy, is what transfers: "a skill performed at
 * 80% accuracy may seem mastered, but if it takes too long to execute, it is
 * not fluent" (precision-teaching tradition, docs/research.md §3). We track a
 * smoothed response latency per skill and require it to be under these.
 *
 * A skill with no latency data recorded yet is NOT blocked by this — the
 * condition only ever tightens mastery for skills we have timing for.
 */
export const MASTERY_MEDIAN_LATENCY_MS = 2000; //     see letter → choose name/sound
export const MASTERY_MEDIAN_LATENCY_KEYBOARD_MS = 3000; // see letter → press key

/**
 * MASTERY_RETENTION_CHECK_DAYS — [conf B]
 *
 * Mastery is only confirmed after a DELAYED check: the skill must still be
 * answered correctly at least this long after it was first answered
 * correctly. Precision teaching ("RESA") and the spacing literature both
 * insist mastery is measured after a delay, not at the end of training.
 */
export const MASTERY_RETENTION_DAYS = 7;

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
/**
 * CONVERSATION_UNLOCK_RULE — [conf B]
 * docs/research.md: "all 26 letters at MASTERY_* plus the day-7 retention
 * check passed", on the grounds that the gate should be automaticity-based,
 * or children unlock chat while still decoding letter by letter.
 *
 * Fraction of the 26 letters whose NAME and SOUND skills are both mastered.
 */
export const CHAT_UNLOCK_LETTER_FRACTION = 1.0; // ⇒ all 26
/** Words the child has actually built. Below this the AI has nothing to say.
 *  [conf C — our number; the research doc does not set a lexicon floor for
 *  the gate, but a conversation needs something to converse about.] */
export const CHAT_UNLOCK_MIN_WORDS = 10;
/** Distinct days of practice overall. Prevents a single marathon session
 *  from unlocking conversation. [conf C — our number] */
export const CHAT_UNLOCK_MIN_PRACTICE_DAYS = 4;

/**
 * NOT IMPLEMENTED — MASTERY_FLUENCY_LPM = 30 correct letters per minute
 * across all 26, mixed case [conf C]. docs/research.md makes this part of the
 * conversation gate. We do not run a timed 26-letter naming probe anywhere in
 * the app, so the gate currently rests on per-skill latency instead. Adding
 * it means adding a timed probe lesson; see docs/architecture.md → Gaps.
 */
export const MASTERY_FLUENCY_LPM = 30;

/* ------------------------------------------------------------------ */
/* 4. Session shape                                                     */
/* ------------------------------------------------------------------ */

/** New letters introduced per letter-lesson. One at a time: the whole
 *  premise is that a letter is spent immediately, not queued. */
export const NEW_LETTERS_PER_LESSON = 1;

/** NEW_LETTERS_PER_SESSION — [conf C, a deliberate acceleration, not a
 *  literature value]. Classroom phonics norms are ~1 letter per WEEK for
 *  beginning L1 readers; our learners are older and already literate in
 *  Hebrew. Watch for accuracy dropping below TARGET_IN_SESSION_ACCURACY —
 *  that is the signal to slow down. Hard max 3. */
export const NEW_LETTERS_PER_SESSION = 2;
export const NEW_LETTERS_PER_SESSION_MAX = 3;

/** SESSION_LENGTH — [conf B] Sustained attention estimates cluster at ~2–3
 *  minutes per year of age. docs/research.md flags that this heuristic could
 *  not be traced to a primary experimental source. */
export const SESSION_LENGTH_MIN_YOUNGER = 10; // ages 7–9
export const SESSION_LENGTH_MIN_OLDER = 15; //   ages 10–12
export const SESSION_LENGTH_MAX = 20; //         hard stop

/** TRIALS_PER_SESSION — [conf C, not evidence-derived] ~2–4s per trial with
 *  feedback across a 10–15 minute session. A *session* is several lessons;
 *  MIXED_REVIEW_STEPS below is the size of ONE lesson. */
export const TRIALS_PER_SESSION = 24;

/** New words a keyboard lesson may introduce. */
export const NEW_WORDS_PER_KEYBOARD_LESSON = 1;

/** Steps in one mixed-review lesson. ~8 is roughly a third of
 *  TRIALS_PER_SESSION, so three lessons make a session. [conf C] */
export const MIXED_REVIEW_STEPS = 8;

/** Of those, how many may be *not* currently due (filler when the due queue
 *  is short) — keeps review lessons a constant, predictable length. */
export const MIXED_REVIEW_MAX_FILLER = 3;

/** How many lessons of other kinds before a mixed review is inserted.
 *  Interleaving cadence. [conf C] */
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

/** REWARD_SCHEDULE — informational feedback on EVERY trial, celebratory
 *  reward on a variable ratio averaging 1-in-5.
 *  [conf A for the contingency principle / conf C for the "1 in 5"]
 *  Tangible, expected, performance-contingent rewards undermine intrinsic
 *  motivation (d ≈ −0.28 to −0.40; Deci, Koestner & Ryan 1999). Unpredictable
 *  rewards are the least corrosive category, hence a variable ratio. */
export const SURPRISE_CELEBRATION_CHANCE = 0.2;

/** LEADERBOARDS — [conf B] Permanently false. Social comparison is the
 *  fastest route from mastery goals to performance-avoidance goals for
 *  exactly the children who most need to stay engaged. There is no code
 *  behind this flag; it exists so the decision is recorded and searchable. */
export const LEADERBOARDS = false;

/** Confetti pieces. Keep low enough for a cheap phone to hold 60fps. */
export const CONFETTI_PIECES = 60;
export const CELEBRATION_MS = 2600;

/**
 * STREAK_RESET_ON_MISS = false. [conf C — docs/research.md notes all streak
 * evidence it found was industry blog data, not peer-reviewed.]
 *
 * DIVERGENCE from docs/research.md: the doc suggests keeping a streak and
 * decaying it by 1 per missed day, plus 2 "freezes" per month. We show
 * *total days practised* instead, which only ever goes up. Reasoning: a
 * decaying number is still a number a 7-year-old watches go down, and the
 * freeze mechanic is a second thing to explain on a screen whose whole brief
 * is "impossible to misread". If a future product decision reintroduces a
 * lossy streak, flip this flag — lib/reward.ts has the one branch.
 */
export const STREAK_IS_LOSSY = false;

/** Wording rule: on a wrong answer we never say "wrong". See
 *  lib/reward.ts#encouragement — a rotating set of Hebrew nudges. */
export const ENCOURAGEMENT_ON_WRONG = true;

/* ------------------------------------------------------------------ */
/* 6. Conversation mode (progressive overload)                          */
/* ------------------------------------------------------------------ */

/**
 * NEW_WORD_BUDGET_INITIAL — [conf B]
 *
 * NOT Krashen's "i+1": docs/research.md §7 is blunt that i+1 was never
 * operationalised and there is nothing to implement. The evidenced successor
 * is LEXICAL COVERAGE. Hu & Nation (2000) put unassisted comprehension at
 * 98% known tokens; at a 20–40 token turn that is 0–1 unknown words.
 */
export const CHAT_NEW_WORDS_PER_TURN = 1;

/** NEW_WORD_BUDGET_MAX — [conf B] ≈ 95% coverage at a 40–60 token turn, the
 *  *minimal* comprehension threshold (Laufer & Ravenhorst-Kalovski 2010).
 *  Do not exceed. Also the hard ceiling the API route clamps to, because
 *  client input is untrusted. */
export const CHAT_NEW_WORDS_MAX = 3;

/** UNKNOWN_TOKEN_RATIO_MAX — [conf A] The same thresholds expressed
 *  proportionally: target 2% unknown tokens, never above 5%. Applied as a
 *  SECOND constraint alongside the count — whichever binds first wins, so a
 *  15-token turn gets zero new words rather than one. */
export const CHAT_UNKNOWN_TOKEN_RATIO_MAX = 0.05;
export const CHAT_UNKNOWN_TOKEN_RATIO_TARGET = 0.02;

/**
 * [conf A] Repetition matters more than the budget: practitioner guidance
 * converges on 8–10 meaningful encounters per item. So a word the AI
 * introduces in chat is pushed into the SRS queue and the system prompt is
 * told to re-use recently introduced words. docs/research.md calls this a
 * bigger lever than tuning the budget number.
 */
export const CHAT_REUSE_RECENT_WORDS = true;

/** Maximum English words in one AI turn. Short turns keep a beginner
 *  reading rather than skimming. [conf C — our number] */
export const CHAT_MAX_ENGLISH_WORDS_PER_TURN = 12;

/** Conversation history sent upstream (turns, not messages). */
export const CHAT_HISTORY_TURNS = 8;

/** Model served through the Vercel AI Gateway. */
export const CHAT_MODEL = "anthropic/claude-sonnet-5";

/* ---- Word templates the AI hands out mid-conversation -------------- */

/**
 * A word template is a known word with some of its letters removed, for the
 * child to type back: SIT → S _ T. It is RETRIEVAL PRACTICE, which is why the
 * conversation is allowed to interrupt itself with one — recalling a word
 * costs more and is worth more than reading it again (docs/research.md §5,
 * the same argument the SRS is built on).
 *
 * [conf C — our numbers] Two constraints keep it a game rather than a test:
 * at most two blanks, so enough of the word survives to cue the recall, and
 * at most two templates per turn, so a turn stays a conversation.
 */
export const CHAT_TEMPLATE_MAX_BLANKS = 2;
export const CHAT_TEMPLATE_MAX_PER_TURN = 2;

/**
 * Wrong letters forgiven before the attempt is graded as a failure. One typo
 * on a keyboard a child is still learning to find their way around is a
 * motor slip, not a forgotten word; two is the word.
 */
export const CHAT_TEMPLATE_FORGIVEN_MISSES = 1;

/** Wrong letters before the correct key is spotlighted on the keyboard. The
 *  child never sits stuck in front of a blank they cannot fill. */
export const CHAT_TEMPLATE_MISSES_BEFORE_HINT = 2;

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

/* ------------------------------------------------------------------ */
/* 8. Recorded decisions with no code behind them yet                   */
/* ------------------------------------------------------------------ */

/**
 * HANDWRITING_STEP_REQUIRED — [conf A that handwriting beats typing for
 * letter recognition (Longcamp et al. 2005; James & Engelhardt 2012;
 * Ibaibarriaga et al. 2025) / conf C that ON-SCREEN tracing preserves the
 * benefit — James & Engelhardt found tracing produced no reading-network
 * recruitment, which is the mechanism we could actually implement].
 *
 * NOT IMPLEMENTED. There is no trace-and-write step in the letter lesson.
 * This is the largest known divergence from docs/research.md; see
 * docs/architecture.md → Gaps. The honest mitigation the research doc itself
 * recommends is to tell the teacher that five minutes of paper letter-writing
 * alongside the app is likely worth more than any on-screen substitute.
 */
export const HANDWRITING_STEP_REQUIRED = true;

/** TOUCH_TYPING_HOME_ROW_MIN_AGE — [conf B] Below 9, hunt-and-peck is fine
 *  and formal technique instruction is not worth the supervision cost. The
 *  app therefore teaches WHERE keys are, not finger discipline; finger colour
 *  coding is available but never required. */
export const TOUCH_TYPING_HOME_ROW_MIN_AGE = 9;
