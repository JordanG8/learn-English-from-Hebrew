/**
 * WHERE THE CHILD GOT TO INSIDE A LEVEL.
 *
 * Leaving a lesson halfway used to cost the whole lesson. Nothing about the
 * work was lost — every answer is graded into the SRS the moment it is given,
 * so the letters keep their evidence — but the POSITION was, and a child who
 * puts a tablet down after eight of twelve steps and comes back to step one
 * has been told the eight did not count. They did. This is the note that says
 * so.
 *
 * Kept out of `Progress` on purpose, the same way `advancement.ts` and the
 * sound preference are: progress is the child's record, versioned and
 * migrated, while this is a bookmark belonging to the device the tablet is
 * sitting on. Losing it costs a repeated lesson, which is the safe direction
 * to fail in — and every read is written so that losing it is exactly what
 * happens when the store is absent, full, stale or garbage.
 *
 * WHY THE STEPS ARE STORED and not just the index: a review level has no
 * stored steps at all (the SRS decides them when the lesson opens), and a word
 * level prepends however many warm-up questions were due at the time. Both are
 * functions of progress, which the half-finished lesson has itself been
 * changing. Keeping the index alone would resume "step 7 of 12" against a
 * different twelve questions — so the questions are part of the bookmark.
 */

import type { Lang, Step } from "./types";

const KEY = "efh:lesson-resume";

/**
 * Bookmarks older than this are dropped. A half-finished lesson is a thing
 * the child means to come back to; a week later it is a lesson they will
 * rightly expect to start from the beginning, and a week-old review level
 * would be asking questions the scheduler has long since moved past.
 */
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

/** How many lessons may hold a bookmark at once. Oldest are dropped first. */
const MAX_SLOTS = 8;

export interface LessonResume {
  /** The step to open on. */
  index: number;
  /** Wrong answers so far — the stars at the end must not forget them. */
  wrongTotal: number;
  /** The exact question list this run is playing. See the header. */
  steps: Step[];
}

interface StoredResume extends LessonResume {
  savedAt: number;
}

/* ------------------------------------------------------------------ */
/* Validation — localStorage is untrusted input                         */
/* ------------------------------------------------------------------ */
/*
 * A Step reaches a renderer that will happily read `step.word.split("")`, so a
 * half-written or hand-edited store must not survive as far as React. Every
 * field a renderer touches is checked here, per step type, and anything that
 * does not check out takes the whole bookmark with it rather than being
 * patched up: a lesson restarted from the beginning is a small cost, and a
 * lesson that crashes on open is not.
 */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str = (v: unknown): v is string => typeof v === "string";

const strArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function coerceStep(raw: unknown): Step | null {
  if (!isObj(raw)) return null;
  if (!str(raw.id) || !str(raw.promptHe)) return null;
  if (raw.promptEn !== undefined && !str(raw.promptEn)) return null;
  if (raw.say !== undefined && !str(raw.say)) return null;

  switch (raw.type) {
    case "tutorial":
      if (raw.target !== null && !str(raw.target)) return null;
      if (
        raw.advanceOn !== "tap-target" &&
        raw.advanceOn !== "press-any-key" &&
        raw.advanceOn !== "next-button"
      ) {
        return null;
      }
      return raw as unknown as Step;
    case "press-key":
      if (!str(raw.code)) return null;
      if (raw.lang !== ("en" as Lang) && raw.lang !== ("he" as Lang)) return null;
      if (typeof raw.hint !== "boolean") return null;
      return raw as unknown as Step;
    case "build-word":
      if (!str(raw.word) || !str(raw.he) || !str(raw.emoji)) return null;
      if (raw.hint !== undefined && typeof raw.hint !== "boolean") return null;
      return raw as unknown as Step;
    case "build-sentence":
      if (!str(raw.sentence) || !str(raw.he) || !str(raw.emoji)) return null;
      if (!strArray(raw.wordsHe)) return null;
      if (typeof raw.hint !== "boolean") return null;
      return raw as unknown as Step;
    case "letter-sound":
      if (!str(raw.letter) || !str(raw.answer) || !strArray(raw.options)) return null;
      if (raw.mode !== "name" && raw.mode !== "sound") return null;
      return raw as unknown as Step;
    case "letter-shape":
      if (!str(raw.letter) || !strArray(raw.options)) return null;
      if (typeof raw.caseMatch !== "boolean") return null;
      return raw as unknown as Step;
    case "chat":
      if (!str(raw.topic)) return null;
      return raw as unknown as Step;
    default:
      // A step type this build has never heard of — a bookmark written by a
      // newer deploy, most likely. Start the lesson over rather than guess.
      return null;
  }
}

function coerceEntry(raw: unknown, now: number): StoredResume | null {
  if (!isObj(raw)) return null;
  if (!num(raw.savedAt) || now - raw.savedAt > EXPIRY_MS) return null;
  if (!num(raw.index) || !num(raw.wrongTotal)) return null;
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) return null;

  const steps: Step[] = [];
  for (const s of raw.steps) {
    const step = coerceStep(s);
    if (!step) return null;
    steps.push(step);
  }

  const index = Math.floor(raw.index);
  // A bookmark at or past the end is a lesson that finished; one at the start
  // is a lesson that never began. Neither is worth resuming.
  if (index <= 0 || index >= steps.length) return null;

  return {
    index,
    wrongTotal: Math.max(0, Math.floor(raw.wrongTotal)),
    steps,
    savedAt: raw.savedAt,
  };
}

/* ------------------------------------------------------------------ */
/* IO — never throws                                                    */
/* ------------------------------------------------------------------ */

function readAll(now: number): Record<string, StoredResume> {
  const out: Record<string, StoredResume> = {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return out;
    const parsed: unknown = JSON.parse(raw);
    if (!isObj(parsed)) return out;
    for (const [id, v] of Object.entries(parsed)) {
      const entry = coerceEntry(v, now);
      if (entry) out[id] = entry;
    }
  } catch {
    /* private mode, blocked storage, garbage: no bookmarks, that is all */
  }
  return out;
}

function writeAll(all: Record<string, StoredResume>): void {
  try {
    // Newest first, then trimmed. The cap exists so a child who dips into
    // twenty levels cannot fill a quota that the progress store also needs.
    const kept = Object.entries(all)
      .sort((a, b) => b[1].savedAt - a[1].savedAt)
      .slice(0, MAX_SLOTS);
    window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
  } catch {
    /* quota exceeded or blocked — the lesson still plays, it just won't resume */
  }
}

/** The bookmark for `lessonId`, or null when there is nothing to resume. */
export function readResume(lessonId: string, now: number = Date.now()): LessonResume | null {
  const entry = readAll(now)[lessonId];
  if (!entry) return null;
  const { index, wrongTotal, steps } = entry;
  return { index, wrongTotal, steps };
}

/** Remember where this run has got to. Called on every step boundary. */
export function writeResume(
  lessonId: string,
  resume: LessonResume,
  now: number = Date.now(),
): void {
  const all = readAll(now);
  all[lessonId] = { ...resume, savedAt: now };
  writeAll(all);
}

/** Forget the bookmark — the lesson was finished, or deliberately restarted. */
export function clearResume(lessonId: string, now: number = Date.now()): void {
  const all = readAll(now);
  if (!(lessonId in all)) return;
  delete all[lessonId];
  writeAll(all);
}
