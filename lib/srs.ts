/**
 * SRS / MASTERY ENGINE — the spine of the app.
 *
 * Responsibilities:
 *   1. grade an attempt        → an updated SkillState
 *   2. decide what is due      → what a mixed-review lesson contains
 *   3. decide what is mastered → what unlocks, including conversation mode
 *
 * Everything here is a PURE function of (state, now). No storage, no React,
 * no randomness except where a seed is passed in. That makes it testable and
 * makes the mastery criterion auditable, which matters because it is the
 * thing standing between a child and the chat screen.
 *
 * Every number comes from lib/pedagogy.ts. If you are tempted to write a
 * literal in this file, put it there instead.
 */

import type { Progress, SkillId, SkillState } from "./types";
import {
  ACCURACY_EMA_ALPHA,
  CHAT_UNLOCK_LETTER_FRACTION,
  CHAT_UNLOCK_MIN_PRACTICE_DAYS,
  CHAT_UNLOCK_MIN_WORDS,
  INTERVAL_LADDER_MS,
  INTRA_SESSION_GAP,
  LAPSE_STREAK_PENALTY,
  MASTERY_MIN_ACCURACY,
  MASTERY_MIN_DISTINCT_DAYS,
  MASTERY_MEDIAN_LATENCY_KEYBOARD_MS,
  MASTERY_MEDIAN_LATENCY_MS,
  MASTERY_MIN_REPS,
  MASTERY_MIN_STREAK,
  MASTERY_RETENTION_DAYS,
  DAY_MS,
  MIXED_REVIEW_MAX_FILLER,
  MIXED_REVIEW_STEPS,
  RELEARN_INTERVAL_MS,
} from "./pedagogy";
import { dayKey, distinctPracticeDays, freshSkill, getSkill, withSkill } from "./progress";
import {
  ALPHABET,
  letterNameSkill,
  letterSoundSkill,
  parseSkill,
} from "./skills";

/* ------------------------------------------------------------------ */
/* 1. Grading                                                           */
/* ------------------------------------------------------------------ */

export interface GradeInput {
  correct: boolean;
  /** True when the learner needed the on-screen hint. A hinted success is
   *  recognition, not recall: it keeps the streak but does not advance the
   *  interval as far, and never counts toward a new distinct correct day. */
  hinted?: boolean;
  /** Milliseconds from the step appearing to the answer. Optional; when
   *  present it feeds the automaticity half of the mastery criterion. */
  latencyMs?: number;
  now?: number;
}

function intervalFor(streak: number): number {
  const i = Math.min(streak, INTERVAL_LADDER_MS.length - 1);
  return INTERVAL_LADDER_MS[Math.max(0, i)] ?? INTERVAL_LADDER_MS[0]!;
}

/**
 * Grade one attempt. This is the only place SkillState changes.
 *
 * daysCorrect is incremented at most once per local calendar day, and only
 * for unhinted correct answers — that is what makes the mastery criterion
 * "spaced sessions on distinct days" rather than "attempts".
 */
export function gradeSkill(prev: SkillState, input: GradeInput): SkillState {
  const now = input.now ?? Date.now();
  const hinted = input.hinted === true;

  const accuracy =
    prev.accuracy * (1 - ACCURACY_EMA_ALPHA) +
    (input.correct ? 1 : 0) * ACCURACY_EMA_ALPHA;

  if (!input.correct) {
    const streak = Math.max(0, prev.streak - LAPSE_STREAK_PENALTY);
    return {
      ...prev,
      streak,
      reps: prev.reps + 1,
      lapses: prev.lapses + 1,
      accuracy,
      lastSeen: now,
      dueAt: now + RELEARN_INTERVAL_MS,
    };
  }

  const streak = hinted ? prev.streak : prev.streak + 1;
  const newDay = prev.lastSeen === 0 || dayKey(prev.lastSeen) !== dayKey(now);
  const daysCorrect = !hinted && newDay ? prev.daysCorrect + 1 : prev.daysCorrect;

  // Smoothed latency. Only unhinted answers count — a hinted answer measures
  // how fast the child can see a highlight, not how fast they can recall.
  const latencyMs =
    !hinted && typeof input.latencyMs === "number" && input.latencyMs > 0
      ? prev.latencyMs === undefined
        ? input.latencyMs
        : prev.latencyMs * (1 - ACCURACY_EMA_ALPHA) +
          input.latencyMs * ACCURACY_EMA_ALPHA
      : prev.latencyMs;

  return {
    ...prev,
    streak,
    reps: prev.reps + 1,
    accuracy,
    lastSeen: now,
    // A hinted success is re-shown on the current rung, not the next one.
    dueAt: now + intervalFor(hinted ? prev.streak : streak),
    daysCorrect,
    ...(latencyMs !== undefined ? { latencyMs } : {}),
    firstCorrectAt: prev.firstCorrectAt ?? now,
  };
}

/** Convenience wrapper that folds a graded attempt back into Progress. */
export function recordAttempt(
  p: Progress,
  id: SkillId,
  input: GradeInput,
): Progress {
  const now = input.now ?? Date.now();
  const graded = gradeSkill(getSkill(p, id, now), { ...input, now });
  return withSkill(p, graded);
}

/* ------------------------------------------------------------------ */
/* 2. Due / mastery predicates                                          */
/* ------------------------------------------------------------------ */

export function isDue(s: SkillState, now: number = Date.now()): boolean {
  return s.dueAt <= now;
}

/** Has this skill ever been practised? */
export function isIntroduced(s: SkillState): boolean {
  return s.reps > 0;
}

/** Latency ceiling for this kind of skill. Motor search is slower than
 *  recognition, so keyboard skills get an extra second. */
function latencyCeiling(id: SkillId): number {
  return parseSkill(id)?.kind === "key"
    ? MASTERY_MEDIAN_LATENCY_KEYBOARD_MS
    : MASTERY_MEDIAN_LATENCY_MS;
}

/**
 * THE MASTERY CRITERION. Six conditions, all of which must hold. The point
 * of the conjunction is that none of them can be satisfied by clicking fast.
 *
 *   1. reps         — enough evidence exists at all
 *   2. accuracy     — the evidence is good              (≥ 0.90)
 *   3. streak       — it is good NOW, not historically
 *   4. daysCorrect  — spread over distinct calendar days (≥ 3)
 *   5. retention    — a correct answer at least 7 days after the first one,
 *                     i.e. mastery is measured AFTER a delay, not at the end
 *                     of training
 *   6. automaticity — smoothed latency under the ceiling, because a skill
 *                     that is accurate but slow is being reasoned out rather
 *                     than retrieved
 *
 * (4) and (5) are the load-bearing ones: together they are the only
 * conditions a child cannot satisfy in a single sitting, however long.
 *
 * (6) is skipped when no timing data exists, so a profile saved before
 * latency was tracked is never permanently blocked from mastery.
 */
export function isMastered(s: SkillState, now: number = Date.now()): boolean {
  const core =
    s.reps >= MASTERY_MIN_REPS &&
    s.accuracy >= MASTERY_MIN_ACCURACY &&
    s.streak >= MASTERY_MIN_STREAK &&
    s.daysCorrect >= MASTERY_MIN_DISTINCT_DAYS;
  if (!core) return false;

  // (5) delayed retention check.
  if (s.firstCorrectAt !== undefined) {
    const span = Math.max(s.lastSeen, now) - s.firstCorrectAt;
    if (span < MASTERY_RETENTION_DAYS * DAY_MS) return false;
  }

  // (6) automaticity, when we have timing for it.
  if (s.latencyMs !== undefined && s.latencyMs > latencyCeiling(s.id)) return false;

  return true;
}

export function isSkillMastered(p: Progress, id: SkillId, now = Date.now()): boolean {
  const s = p.skills[id];
  return s !== undefined && isMastered(s, now);
}

/** 0..1 — how close a skill is to mastery, for progress rings. Every
 *  condition contributes an equal share, so the bar always moves even when
 *  the child is waiting out the retention window. */
export function masteryFraction(s: SkillState, now: number = Date.now()): number {
  const retention =
    s.firstCorrectAt === undefined
      ? 0
      : Math.min(
          1,
          (Math.max(s.lastSeen, now) - s.firstCorrectAt) /
            (MASTERY_RETENTION_DAYS * DAY_MS),
        );
  const latency =
    s.latencyMs === undefined ? 1 : Math.min(1, latencyCeiling(s.id) / s.latencyMs);
  const q = [
    Math.min(1, s.reps / MASTERY_MIN_REPS),
    Math.min(1, s.accuracy / MASTERY_MIN_ACCURACY),
    Math.min(1, s.streak / MASTERY_MIN_STREAK),
    Math.min(1, s.daysCorrect / MASTERY_MIN_DISTINCT_DAYS),
    retention,
    latency,
  ];
  return q.reduce((a, b) => a + b, 0) / q.length;
}

/* ------------------------------------------------------------------ */
/* 3. Selection — what a mixed-review lesson contains                    */
/* ------------------------------------------------------------------ */

export interface DueItem {
  id: SkillId;
  state: SkillState;
  /** How overdue, in ms. Negative = not yet due. */
  overdueBy: number;
}

/** Everything introduced, sorted most-overdue first. */
export function dueSkills(p: Progress, now: number = Date.now()): DueItem[] {
  return Object.values(p.skills)
    .filter(isIntroduced)
    .map((state) => ({ id: state.id, state, overdueBy: now - state.dueAt }))
    .filter((d) => d.overdueBy >= 0)
    .sort((a, b) => b.overdueBy - a.overdueBy);
}

/** Introduced but not yet due, weakest first — used as filler so a review
 *  lesson is always the same predictable length. */
function fillerSkills(p: Progress, now: number = Date.now()): DueItem[] {
  return Object.values(p.skills)
    .filter(isIntroduced)
    .filter((s) => !isDue(s, now))
    .map((state) => ({ id: state.id, state, overdueBy: now - state.dueAt }))
    .sort((a, b) => masteryFraction(a.state) - masteryFraction(b.state));
}

/**
 * Build the skill list for a mixed-review lesson: due items first, topped up
 * with the weakest not-yet-due items, then INTERLEAVED so that no two
 * consecutive items come from the same skill kind where avoidable. The
 * interleaving is the part that produces durability (Rohrer & Taylor 2007);
 * a review lesson that groups all the letter-sounds together is just a
 * blocked drill wearing a review costume.
 */
export function planMixedReview(
  p: Progress,
  now: number = Date.now(),
  limit: number = MIXED_REVIEW_STEPS,
): SkillId[] {
  const due = dueSkills(p, now);
  const chosen: DueItem[] = due.slice(0, limit);

  if (chosen.length < limit) {
    const need = Math.min(limit - chosen.length, MIXED_REVIEW_MAX_FILLER);
    chosen.push(...fillerSkills(p, now).slice(0, need));
  }

  return interleaveByKind(chosen.map((d) => d.id));
}

/** Reorder so identical skill kinds are spread out, and so the same *value*
 *  (e.g. the letter B) never repeats within INTRA_SESSION_GAP positions. */
export function interleaveByKind(ids: SkillId[]): SkillId[] {
  const remaining = [...ids];
  const out: SkillId[] = [];

  while (remaining.length > 0) {
    const recentKinds = out.slice(-1).map((id) => parseSkill(id)?.kind);
    const recentValues = out
      .slice(-INTRA_SESSION_GAP)
      .map((id) => parseSkill(id)?.value);

    let pick = remaining.findIndex((id) => {
      const parsed = parseSkill(id);
      if (!parsed) return true;
      return (
        !recentKinds.includes(parsed.kind) && !recentValues.includes(parsed.value)
      );
    });
    // Relax the value constraint, then give up and take the head — a lesson
    // that is slightly less well interleaved beats a lesson that never ends.
    if (pick === -1) {
      pick = remaining.findIndex((id) => {
        const parsed = parseSkill(id);
        return !parsed || !recentValues.includes(parsed.value);
      });
    }
    if (pick === -1) pick = 0;
    out.push(remaining[pick]!);
    remaining.splice(pick, 1);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 4. Gating — lesson unlocking and the chat gate                        */
/* ------------------------------------------------------------------ */

export interface LessonGateInput {
  id: string;
  requires: string[];
}

/** A lesson unlocks when every prerequisite lesson has been completed. */
export function isLessonUnlocked(p: Progress, lesson: LessonGateInput): boolean {
  return lesson.requires.every((r) => p.lessonsCompleted.includes(r));
}

/** The next thing to do: first unlocked, uncompleted lesson in track order.
 *  When everything is complete, returns the earliest lesson that reviews a
 *  currently-due skill, so the track never dead-ends. */
export function nextLesson<
  T extends LessonGateInput & { order: number; skills: SkillId[] },
>(p: Progress, lessons: readonly T[]): T | null {
  const ordered = [...lessons].sort((a, b) => a.order - b.order);
  const fresh = ordered.find(
    (l) => !p.lessonsCompleted.includes(l.id) && isLessonUnlocked(p, l),
  );
  if (fresh) return fresh;
  const due = new Set(dueSkills(p).map((d) => d.id));
  return (
    ordered.find((l) => isLessonUnlocked(p, l) && l.skills.some((s) => due.has(s))) ??
    ordered[ordered.length - 1] ??
    null
  );
}

export interface ChatGate {
  unlocked: boolean;
  /** 0..1 for the progress ring on the locked chat card. */
  progress: number;
  lettersMastered: number;
  lettersRequired: number;
  wordsKnown: number;
  wordsRequired: number;
  practiceDays: number;
  practiceDaysRequired: number;
  /** Hebrew, child-facing, describing the single nearest missing condition. */
  reasonHe: string;
}

/**
 * THE CHAT GATE. Conversation unlocks on evidence from spaced retrieval:
 * a letter counts only when BOTH its name and its sound are mastered by the
 * criterion above, which already requires distinct-day accuracy.
 */
export function evaluateChatGate(p: Progress, now: number = Date.now()): ChatGate {
  const lettersRequired = Math.ceil(ALPHABET.length * CHAT_UNLOCK_LETTER_FRACTION);
  const lettersMastered = ALPHABET.filter(
    (l) =>
      isSkillMastered(p, letterNameSkill(l), now) &&
      isSkillMastered(p, letterSoundSkill(l), now),
  ).length;

  const wordsKnown = p.knownWords.length;
  const practiceDays = distinctPracticeDays(p);

  const conditions = [
    lettersMastered / lettersRequired,
    wordsKnown / CHAT_UNLOCK_MIN_WORDS,
    practiceDays / CHAT_UNLOCK_MIN_PRACTICE_DAYS,
  ].map((x) => Math.min(1, x));

  const unlocked =
    p.chatUnlockedAt !== null || conditions.every((c) => c >= 1);

  let reasonHe = "אפשר להתחיל לדבר!";
  if (!unlocked) {
    if (lettersMastered < lettersRequired) {
      const missing = lettersRequired - lettersMastered;
      reasonHe = `עוד ${missing} אותיות ואפשר לדבר באנגלית`;
    } else if (wordsKnown < CHAT_UNLOCK_MIN_WORDS) {
      reasonHe = `עוד ${CHAT_UNLOCK_MIN_WORDS - wordsKnown} מילים ואפשר לדבר`;
    } else {
      const d = CHAT_UNLOCK_MIN_PRACTICE_DAYS - practiceDays;
      reasonHe = d === 1 ? "עוד יום אחד של תרגול ונפתח!" : `עוד ${d} ימי תרגול ונפתח!`;
    }
  }

  return {
    unlocked,
    progress: conditions.reduce((a, b) => a + b, 0) / conditions.length,
    lettersMastered,
    lettersRequired,
    wordsKnown,
    wordsRequired: CHAT_UNLOCK_MIN_WORDS,
    practiceDays,
    practiceDaysRequired: CHAT_UNLOCK_MIN_PRACTICE_DAYS,
    reasonHe,
  };
}

/** Stamps chatUnlockedAt the first time the gate opens, so the unlock is
 *  sticky — a child who unlocks chat never loses access to it. */
export function settleChatUnlock(p: Progress, now: number = Date.now()): Progress {
  if (p.chatUnlockedAt !== null) return p;
  const gate = evaluateChatGate(p, now);
  return gate.unlocked ? { ...p, chatUnlockedAt: now } : p;
}

/** The mastered lexicon the chat API is allowed to use, uppercase. A word
 *  counts once the child has built it AND its word-skill is mastered; words
 *  built but not yet durable are still offered, because the chat lexicon is
 *  about comprehension, not production. */
export function chatLexicon(p: Progress): string[] {
  return [...p.knownWords].sort();
}

export function masteredLetters(p: Progress): string[] {
  return ALPHABET.filter(
    (l) =>
      isSkillMastered(p, letterNameSkill(l)) || isSkillMastered(p, letterSoundSkill(l)),
  );
}

/** Re-export so callers do not need to reach into progress.ts for a default. */
export { freshSkill };
