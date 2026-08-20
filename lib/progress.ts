/**
 * PROGRESS STORE — the entire persistent state of the app.
 *
 * There is no account, no database and no login: a parent opens a link. All
 * state lives in one localStorage key, versioned, with a migration path.
 *
 * Non-negotiable invariant: **a corrupt, absent, partial or hostile store
 * must never crash the app.** Every read funnels through `loadProgress()`,
 * which either returns a valid `Progress` or a fresh profile. It never
 * throws and never returns undefined.
 */

import type { Progress, SkillId, SkillState } from "./types";
import { INITIAL_ACCURACY } from "./pedagogy";

export const STORAGE_KEY = "efh:progress";
/** Bump CURRENT_VERSION and add a migration when the shape changes. */
export const CURRENT_VERSION = 1;

/** Mirror of the httpOnly cookie set by middleware. Layer 2 of the
 *  returning-visitor check — see lib/visitor.ts. */
export const SEEN_KEY = "efh:seen";

/* ------------------------------------------------------------------ */
/* Construction                                                         */
/* ------------------------------------------------------------------ */

export function freshProgress(now: number = Date.now()): Progress {
  return {
    version: 1,
    createdAt: now,
    skills: {},
    lessonsCompleted: [],
    stars: {},
    knownWords: [],
    onboarded: false,
    chatUnlockedAt: null,
  };
}

export function freshSkill(id: SkillId, now: number = Date.now()): SkillState {
  return {
    id,
    streak: 0,
    reps: 0,
    lapses: 0,
    accuracy: INITIAL_ACCURACY,
    lastSeen: 0,
    dueAt: now,
    daysCorrect: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Validation — treat localStorage as untrusted input                    */
/* ------------------------------------------------------------------ */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: unknown, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function coerceSkill(id: SkillId, raw: unknown, now: number): SkillState {
  if (!isObj(raw)) return freshSkill(id, now);
  const accuracy = num(raw.accuracy, INITIAL_ACCURACY);
  return {
    id,
    streak: Math.max(0, Math.floor(num(raw.streak, 0))),
    reps: Math.max(0, Math.floor(num(raw.reps, 0))),
    lapses: Math.max(0, Math.floor(num(raw.lapses, 0))),
    accuracy: Math.min(1, Math.max(0, accuracy)),
    lastSeen: num(raw.lastSeen, 0),
    dueAt: num(raw.dueAt, now),
    daysCorrect: Math.max(0, Math.floor(num(raw.daysCorrect, 0))),
    ...(typeof raw.latencyMs === "number" && Number.isFinite(raw.latencyMs)
      ? { latencyMs: Math.max(0, raw.latencyMs) }
      : {}),
    ...(typeof raw.firstCorrectAt === "number" && Number.isFinite(raw.firstCorrectAt)
      ? { firstCorrectAt: raw.firstCorrectAt }
      : {}),
  };
}

function coerceStars(raw: unknown): Record<string, 0 | 1 | 2 | 3> {
  const out: Record<string, 0 | 1 | 2 | 3> = {};
  if (!isObj(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const n = Math.floor(num(v, 0));
    out[k] = (n < 0 ? 0 : n > 3 ? 3 : n) as 0 | 1 | 2 | 3;
  }
  return out;
}

/**
 * Rebuild a valid Progress from whatever was in storage. Missing fields get
 * defaults; junk fields are dropped; nothing here throws.
 */
export function coerceProgress(raw: unknown, now: number = Date.now()): Progress {
  if (!isObj(raw)) return freshProgress(now);

  const base = freshProgress(num(raw.createdAt, now));

  const skills: Record<SkillId, SkillState> = {};
  if (isObj(raw.skills)) {
    for (const [id, v] of Object.entries(raw.skills)) {
      if (!id.includes(":")) continue; // not a skill id we recognise
      skills[id] = coerceSkill(id, v, now);
    }
  }

  const unlocked = raw.chatUnlockedAt;
  return {
    ...base,
    version: 1,
    skills,
    lessonsCompleted: Array.from(new Set(strArray(raw.lessonsCompleted))),
    stars: coerceStars(raw.stars),
    knownWords: Array.from(
      new Set(strArray(raw.knownWords).map((w) => w.toUpperCase())),
    ),
    onboarded: raw.onboarded === true,
    chatUnlockedAt:
      typeof unlocked === "number" && Number.isFinite(unlocked) ? unlocked : null,
  };
}

/* ------------------------------------------------------------------ */
/* Migration                                                            */
/* ------------------------------------------------------------------ */

/**
 * Upgrade an older payload to the current version.
 *
 * How to add v2:
 *   1. bump CURRENT_VERSION and the `version` literal in lib/types.ts
 *   2. add a `case 1:` branch here that reshapes v1 → v2 and falls through
 *   3. never delete a branch — old devices exist
 *
 * An unknown / future version is not guessed at: we keep what coerces
 * cleanly, which is strictly better than wiping a child's progress.
 */
function migrate(raw: Record<string, unknown>, now: number): Progress {
  const version = num(raw.version, 0);
  switch (version) {
    case 0:
      // Pre-versioned pilot payloads: same field names, no guarantees.
      return coerceProgress(raw, now);
    case 1:
      return coerceProgress(raw, now);
    default:
      // Newer than us (user opened an older deploy). Salvage, don't wipe.
      return coerceProgress(raw, now);
  }
}

/* ------------------------------------------------------------------ */
/* IO                                                                   */
/* ------------------------------------------------------------------ */

const hasStorage = (): boolean => {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    // Safari private mode / blocked cookies throw on access.
    return false;
  }
};

/** Never throws. Returns a fresh profile on SSR, on absence, or on garbage. */
export function loadProgress(now: number = Date.now()): Progress {
  if (!hasStorage()) return freshProgress(now);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshProgress(now);
    const parsed: unknown = JSON.parse(raw);
    if (!isObj(parsed)) return freshProgress(now);
    return migrate(parsed, now);
  } catch {
    return freshProgress(now);
  }
}

/** Never throws. Silently no-ops when storage is unavailable or full. */
export function saveProgress(p: Progress): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* quota exceeded or blocked — the session still works in memory */
  }
}

export function markSeen(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function hasSeenLocally(): boolean {
  if (!hasStorage()) return false;
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Wipes progress. Used only by the explicit "start over" affordance. */
export function resetProgress(): Progress {
  const fresh = freshProgress();
  if (hasStorage()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  return fresh;
}

/* ------------------------------------------------------------------ */
/* Pure updates — all state transitions are functions of (state) → state */
/* ------------------------------------------------------------------ */

export function getSkill(p: Progress, id: SkillId, now = Date.now()): SkillState {
  return p.skills[id] ?? freshSkill(id, now);
}

export function withSkill(p: Progress, s: SkillState): Progress {
  return { ...p, skills: { ...p.skills, [s.id]: s } };
}

export function withLessonCompleted(
  p: Progress,
  lessonId: string,
  stars: 0 | 1 | 2 | 3,
): Progress {
  const best = Math.max(p.stars[lessonId] ?? 0, stars) as 0 | 1 | 2 | 3;
  return {
    ...p,
    lessonsCompleted: p.lessonsCompleted.includes(lessonId)
      ? p.lessonsCompleted
      : [...p.lessonsCompleted, lessonId],
    stars: { ...p.stars, [lessonId]: best },
  };
}

export function withKnownWord(p: Progress, word: string): Progress {
  const w = word.toUpperCase();
  if (p.knownWords.includes(w)) return p;
  return { ...p, knownWords: [...p.knownWords, w] };
}

export function totalStars(p: Progress): number {
  return Object.values(p.stars).reduce<number>((a, b) => a + b, 0);
}

/** Local calendar day key, "YYYY-MM-DD". Local, not UTC: a child in Israel
 *  practising at 23:00 and again at 09:00 has practised on two days. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Distinct days on which ANY skill was answered. Used by the chat gate. */
export function distinctPracticeDays(p: Progress): number {
  const days = new Set<string>();
  for (const s of Object.values(p.skills)) {
    if (s.lastSeen > 0) days.add(dayKey(s.lastSeen));
  }
  if (p.createdAt > 0) days.add(dayKey(p.createdAt));
  return days.size;
}
