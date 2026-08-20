"use client";

/**
 * PROGRESS CONTEXT — the single in-memory owner of Progress for the client.
 *
 * Why a context and not per-component reads: the home map, the lesson player
 * and the chat gate all derive from the same object, and two components
 * writing localStorage independently would clobber each other.
 *
 * Hydration rule: the server has no localStorage, so the first render ALWAYS
 * uses a fresh profile with `ready === false`. Screens must render a stable
 * skeleton until `ready` is true, otherwise React 19 will complain about a
 * hydration mismatch and — worse — a returning child will see the app flash
 * "you have no stars" before their real progress appears.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Progress, SkillId } from "./types";
import {
  freshProgress,
  hasSeenLocally,
  loadProgress,
  markSeen,
  resetProgress,
  saveProgress,
  withKnownWord,
  withLessonCompleted,
} from "./progress";
import { recordAttempt as srsRecord, settleChatUnlock, type GradeInput } from "./srs";
import type { Stars } from "./reward";

export interface ProgressApi {
  progress: Progress;
  /** False until localStorage has been read on the client. */
  ready: boolean;
  /** True when `efh:seen` was already present before this session. */
  seenBefore: boolean;
  update: (fn: (p: Progress) => Progress) => void;
  attempt: (skill: SkillId, input: GradeInput) => void;
  completeLesson: (lessonId: string, stars: Stars) => void;
  learnWord: (word: string) => void;
  setOnboarded: (value: boolean) => void;
  reset: () => void;
}

const Ctx = createContext<ProgressApi | null>(null);

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState<Progress>(() => freshProgress(0));
  const [ready, setReady] = useState(false);
  const seenBefore = useRef(false);

  useEffect(() => {
    seenBefore.current = hasSeenLocally();
    setProgress(loadProgress());
    setReady(true);
    markSeen();
  }, []);

  const update = useCallback((fn: (p: Progress) => Progress) => {
    setProgress((prev) => {
      // settleChatUnlock runs on every write so the unlock can never be
      // missed by a screen that forgot to check for it.
      const next = settleChatUnlock(fn(prev));
      saveProgress(next);
      return next;
    });
  }, []);

  const attempt = useCallback(
    (skill: SkillId, input: GradeInput) => update((p) => srsRecord(p, skill, input)),
    [update],
  );

  const completeLesson = useCallback(
    (lessonId: string, stars: Stars) =>
      update((p) => withLessonCompleted(p, lessonId, stars)),
    [update],
  );

  const learnWord = useCallback(
    (word: string) => update((p) => withKnownWord(p, word)),
    [update],
  );

  const setOnboarded = useCallback(
    (value: boolean) => update((p) => ({ ...p, onboarded: value })),
    [update],
  );

  const reset = useCallback(() => {
    const fresh = resetProgress();
    setProgress(fresh);
    saveProgress(fresh);
  }, []);

  const value = useMemo<ProgressApi>(
    () => ({
      progress,
      ready,
      seenBefore: seenBefore.current,
      update,
      attempt,
      completeLesson,
      learnWord,
      setOnboarded,
      reset,
    }),
    [progress, ready, update, attempt, completeLesson, learnWord, setOnboarded, reset],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProgress(): ProgressApi {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useProgress must be used inside <ProgressProvider>. It is mounted in app/layout.tsx.",
    );
  }
  return ctx;
}
