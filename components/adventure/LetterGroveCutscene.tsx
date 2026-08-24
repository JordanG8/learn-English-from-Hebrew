"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  LETTER_GROVE_CUTSCENE_BEATS,
  type LetterGroveCutsceneBeat,
} from "@/lib/letter-grove-cutscene";

export type CutsceneExitReason = "completed" | "skipped";

export type CutsceneNarrationState =
  | "idle"
  | "loading"
  | "playing"
  | "ended"
  | "blocked"
  | "captions-only"
  | "error";

export interface NarrationUrlContext {
  /** Abort this work if the child skips or changes beat before it resolves. */
  signal: AbortSignal;
}

export interface CutsceneNarrationPlayback {
  /** Called when a beat changes, the cutscene exits, or the component unmounts. */
  stop?: () => void;
  /** Optional completion signal enables automatic movement to the next beat. */
  ended?: Promise<void>;
}

/**
 * Adapter for the app's existing voice player. A minimal integration is:
 *
 * `narrate={(beat) => { sayNarration(beat.stepId); return { stop: stopSpeech }; }}`
 *
 * A richer player may also return an `ended` promise for automatic advance.
 */
export type LetterGroveNarrator = (
  beat: LetterGroveCutsceneBeat,
  context: NarrationUrlContext,
) =>
  | void
  | CutsceneNarrationPlayback
  | Promise<void | CutsceneNarrationPlayback>;

/**
 * Resolve a playable URL without exposing the provider to this client.
 *
 * A production caller can return, for example,
 * an existing recorded/synthesised voice URL for `beat.stepId`; no key or
 * model id ever reaches this component.
 */
export type LetterGroveNarrationUrlProvider = (
  beat: LetterGroveCutsceneBeat,
  context: NarrationUrlContext,
) => string | null | Promise<string | null>;

export interface LetterGroveCutsceneProps {
  /** Defaults to the five-beat first-encounter story. */
  beats?: readonly LetterGroveCutsceneBeat[];
  /** Preferred when integrating the existing `sayNarration` voice stack. */
  narrate?: LetterGroveNarrator;
  /** Alternative for a player that can resolve directly playable audio URLs. */
  getNarrationUrl?: LetterGroveNarrationUrlProvider;
  onExit: (reason: CutsceneExitReason) => void;
  /** Use this to coordinate Three.js camera targets and character animation. */
  onBeatChange?: (beat: LetterGroveCutsceneBeat, index: number) => void;
  onNarrationStateChange?: (
    state: CutsceneNarrationState,
    beat: LetterGroveCutsceneBeat,
  ) => void;
  /** Attempts narration on entry. A rejected autoplay becomes a clear play control. */
  autoPlayNarration?: boolean;
  /** Advances between voiced beats after a short pause; never starts the mission itself. */
  autoAdvanceAfterNarration?: boolean;
  className?: string;
}

const NARRATION_LABELS: Record<CutsceneNarrationState, string> = {
  idle: "הכתוביות מוכנות",
  loading: "מכינים את הקול…",
  playing: "הסיפור מושמע",
  ended: "הקטע הסתיים",
  blocked: "לחצו כדי להפעיל את הקול",
  "captions-only": "הסיפור זמין בכתוביות",
  error: "הקול לא זמין — אפשר להמשיך עם הכתוביות",
};

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("button, a, input, select, textarea"));
}

function SpeakerIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${active ? "text-[#f9da7d]" : "text-white"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 5 6.8 8.5H3.5v7h3.3L11 19V5Z" fill="currentColor" stroke="none" />
      <path d="M15 8.5a5 5 0 0 1 0 7" />
      <path d="M18 5.7a9 9 0 0 1 0 12.6" />
    </svg>
  );
}

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direction === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

export function LetterGroveCutscene({
  beats = LETTER_GROVE_CUTSCENE_BEATS,
  narrate,
  getNarrationUrl,
  onExit,
  onBeatChange,
  onNarrationStateChange,
  autoPlayNarration = true,
  autoAdvanceAfterNarration = true,
  className = "",
}: LetterGroveCutsceneProps) {
  const sequence = beats.length > 0 ? beats : LETTER_GROVE_CUTSCENE_BEATS;
  const [beatIndex, setBeatIndex] = useState(0);
  const [narrationState, setNarrationState] = useState<CutsceneNarrationState>("idle");
  const reducedMotion = useReducedMotion();

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const advanceTimerRef = useRef<number | null>(null);
  const requestTicketRef = useRef(0);
  const narratorRef = useRef(narrate);
  const providerRef = useRef(getNarrationUrl);
  const externalStopRef = useRef<(() => void) | null>(null);
  const beatChangeRef = useRef(onBeatChange);
  const narrationChangeRef = useRef(onNarrationStateChange);
  const exitRef = useRef(onExit);

  narratorRef.current = narrate;
  providerRef.current = getNarrationUrl;
  beatChangeRef.current = onBeatChange;
  narrationChangeRef.current = onNarrationStateChange;
  exitRef.current = onExit;

  const activeBeat = sequence[Math.min(beatIndex, sequence.length - 1)]!;
  const isLastBeat = beatIndex === sequence.length - 1;

  const stopPlayback = useCallback(() => {
    requestTicketRef.current += 1;
    try {
      externalStopRef.current?.();
    } catch {
      // Narration is optional; a provider cleanup failure cannot block play.
    }
    externalStopRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    if (advanceTimerRef.current !== null) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch {
        // Captions remain the complete fallback if a browser rejects cleanup.
      }
    }
  }, []);

  const reportNarrationState = useCallback(
    (state: CutsceneNarrationState) => {
      setNarrationState(state);
      narrationChangeRef.current?.(state, activeBeat);
    },
    [activeBeat],
  );

  const goToBeat = useCallback(
    (index: number) => {
      const boundedIndex = Math.max(0, Math.min(index, sequence.length - 1));
      if (boundedIndex === beatIndex) return;
      stopPlayback();
      setBeatIndex(boundedIndex);
    },
    [beatIndex, sequence.length, stopPlayback],
  );

  const leaveCutscene = useCallback(
    (reason: CutsceneExitReason) => {
      stopPlayback();
      exitRef.current(reason);
    },
    [stopPlayback],
  );

  const playNarration = useCallback(async () => {
    stopPlayback();
    const narrator = narratorRef.current;
    const provider = providerRef.current;
    if (!narrator && (!provider || typeof Audio === "undefined")) {
      reportNarrationState("captions-only");
      return;
    }

    const ticket = ++requestTicketRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    reportNarrationState("loading");

    try {
      if (narrator) {
        const playback = await narrator(activeBeat, { signal: controller.signal });
        if (controller.signal.aborted || ticket !== requestTicketRef.current) {
          if (playback && typeof playback === "object") playback.stop?.();
          return;
        }
        if (playback && typeof playback === "object") {
          externalStopRef.current = playback.stop ?? null;
        }
        reportNarrationState("playing");
        if (playback && typeof playback === "object" && playback.ended) {
          void playback.ended.then(
            () => {
              if (ticket !== requestTicketRef.current) return;
              reportNarrationState("ended");
              if (autoAdvanceAfterNarration && !isLastBeat) {
                advanceTimerRef.current = window.setTimeout(() => goToBeat(beatIndex + 1), 650);
              }
            },
            () => {
              if (ticket === requestTicketRef.current) reportNarrationState("error");
            },
          );
        } else {
          // `sayNarration` intentionally returns void. Its direction hint is a
          // safe fallback clock: captions remain visible for the whole beat,
          // and richer players can replace this with an exact `ended` promise.
          advanceTimerRef.current = window.setTimeout(() => {
            if (ticket !== requestTicketRef.current) return;
            reportNarrationState("ended");
            if (autoAdvanceAfterNarration && !isLastBeat) goToBeat(beatIndex + 1);
          }, activeBeat.durationHintMs);
        }
        return;
      }

      // The initial guard guarantees a URL provider and Audio in this branch.
      if (!provider || typeof Audio === "undefined") return;
      const url = await provider(activeBeat, { signal: controller.signal });
      if (controller.signal.aborted || ticket !== requestTicketRef.current) return;
      if (!url) {
        reportNarrationState("captions-only");
        return;
      }

      const audio = new Audio(url);
      audio.preload = "auto";
      audioRef.current = audio;
      audio.onerror = () => {
        if (ticket === requestTicketRef.current) reportNarrationState("error");
      };
      audio.onended = () => {
        if (ticket !== requestTicketRef.current) return;
        reportNarrationState("ended");
        if (autoAdvanceAfterNarration && !isLastBeat) {
          advanceTimerRef.current = window.setTimeout(() => goToBeat(beatIndex + 1), 650);
        }
      };

      await audio.play();
      if (ticket === requestTicketRef.current) reportNarrationState("playing");
    } catch (error) {
      if (controller.signal.aborted || ticket !== requestTicketRef.current) return;
      const blocked = error instanceof DOMException && error.name === "NotAllowedError";
      reportNarrationState(blocked ? "blocked" : "error");
    }
  }, [activeBeat, autoAdvanceAfterNarration, beatIndex, goToBeat, isLastBeat, reportNarrationState, stopPlayback]);

  useEffect(() => {
    beatChangeRef.current?.(activeBeat, beatIndex);
    reportNarrationState("idle");
    if (autoPlayNarration) void playNarration();
    return stopPlayback;
  }, [activeBeat, autoPlayNarration, beatIndex, playNarration, reportNarrationState, stopPlayback]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      previousFocusRef.current?.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === "Escape") {
        event.preventDefault();
        leaveCutscene("skipped");
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (isLastBeat) leaveCutscene("completed");
        else goToBeat(beatIndex + 1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        if (beatIndex > 0) goToBeat(beatIndex - 1);
        return;
      }
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        void playNarration();
        return;
      }
      if ((event.key === " " || event.key === "Enter") && !isInteractiveTarget(event.target)) {
        event.preventDefault();
        if (isLastBeat) leaveCutscene("completed");
        else goToBeat(beatIndex + 1);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const controls = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((node) => !node.hasAttribute("aria-hidden"));
      if (controls.length === 0) return;
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [beatIndex, goToBeat, isLastBeat, leaveCutscene, playNarration]);

  const narrationLabel = NARRATION_LABELS[narrationState];
  const showPlayPrompt = narrationState === "blocked" || narrationState === "error";
  const progressLabel = `קטע ${beatIndex + 1} מתוך ${sequence.length}`;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="letter-grove-cutscene-title"
      aria-describedby="letter-grove-cutscene-caption"
      tabIndex={-1}
      dir="rtl"
      data-scene-cue={activeBeat.sceneCue}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      className={`pointer-events-auto absolute inset-0 z-50 flex h-dvh min-h-[540px] flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(4,18,21,.72)_0%,rgba(8,28,28,.12)_38%,rgba(4,14,18,.94)_100%)] text-white outline-none ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(171,255,176,.15),transparent_30%),radial-gradient(circle_at_14%_20%,rgba(147,221,255,.12),transparent_28%)]"
      />

      <header className="relative z-10 flex items-start justify-between gap-3 p-3 sm:p-5">
        <div className="rounded-full border border-white/20 bg-[#071b20]/75 px-4 py-2 shadow-lg backdrop-blur-xl">
          <p className="text-xs font-black tracking-wide text-[#bdebb8]">סיפור ההרפתקה</p>
          <p className="text-sm font-bold text-white/80" aria-live="polite">{progressLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => leaveCutscene("skipped")}
          className="min-h-12 rounded-full border border-white/25 bg-[#071b20]/75 px-5 text-sm font-black text-white shadow-lg backdrop-blur-xl transition hover:bg-[#12343a] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#f9da7d] motion-reduce:transition-none"
        >
          דלגו למשימה
        </button>
      </header>

      {/* The live Three.js actors are the cutscene visual. This spacer keeps
          captions low without covering the character the camera is framing. */}
      <div className="relative z-10 min-h-0 flex-1" aria-hidden="true" />

      <section className="relative z-20 mx-auto w-full max-w-5xl px-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:pb-5">
        <div className="overflow-hidden rounded-[1.75rem] border border-[#c8ffc1]/25 bg-[#07191e]/88 shadow-[0_-18px_70px_rgba(0,0,0,.34)] backdrop-blur-2xl">
          <div className="flex items-center justify-center gap-2 border-b border-white/10 px-4 py-2.5" role="group" aria-label={progressLabel}>
            {sequence.map((beat, index) => {
              const current = index === beatIndex;
              const visited = index < beatIndex;
              return (
                <button
                  key={beat.stepId}
                  type="button"
                  onClick={() => goToBeat(index)}
                  aria-label={`עברו לקטע ${index + 1}: ${beat.titleHe}`}
                  aria-current={current ? "step" : undefined}
                  className="grid min-h-11 min-w-11 place-items-center rounded-full focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#f9da7d]"
                >
                  <span
                    className={`block h-2.5 rounded-full transition-all motion-reduce:transition-none ${
                      current
                        ? "w-9 bg-[#f9da7d] shadow-[0_0_14px_rgba(249,218,125,.75)]"
                        : visited
                          ? "w-5 bg-[#8fe39a]"
                          : "w-5 bg-white/25"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          <div key={activeBeat.stepId} className="px-5 pb-4 pt-4 text-center sm:px-10 sm:pb-6">
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-black">
              <span className="rounded-full bg-[#a6efa8]/15 px-3 py-1 text-[#bff5bc]">{activeBeat.speakerLabelHe}</span>
              <span className="flex items-center gap-1.5 text-white/65" role="status" aria-live="polite">
                <SpeakerIcon active={narrationState === "playing"} />
                {narrationLabel}
              </span>
            </div>
            <h2 id="letter-grove-cutscene-title" className="mt-2 text-xl font-black text-[#f9da7d] sm:text-2xl">
              {activeBeat.titleHe}
            </h2>
            <p
              id="letter-grove-cutscene-caption"
              className="mx-auto mt-2 max-w-3xl text-xl font-bold leading-relaxed text-white sm:text-2xl"
              aria-live="polite"
            >
              {activeBeat.textHe}
            </p>

            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => goToBeat(beatIndex - 1)}
                disabled={beatIndex === 0}
                className="flex min-h-14 min-w-14 items-center justify-center gap-1 rounded-2xl border border-white/20 bg-white/[0.08] px-3 font-black text-white transition hover:bg-white/15 disabled:invisible focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#f9da7d] motion-reduce:transition-none sm:px-5"
                aria-label="הקטע הקודם"
              >
                <Chevron direction="right" />
                <span className="hidden sm:inline">הקודם</span>
              </button>

              <button
                type="button"
                onClick={() => void playNarration()}
                className={`flex min-h-14 items-center justify-center gap-2 rounded-2xl border px-4 font-black transition focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#f9da7d] motion-reduce:transition-none ${
                  showPlayPrompt
                    ? "border-[#f9da7d]/70 bg-[#f9da7d]/15 text-[#fff0b5]"
                    : "border-white/20 bg-white/[0.08] text-white hover:bg-white/15"
                }`}
                aria-label={narrationState === "playing" ? "הפעילו את הקטע מהתחלה" : "שמעו את הקטע"}
              >
                <SpeakerIcon active={narrationState === "playing"} />
                <span>{narrationState === "playing" ? "מהתחלה" : "שמעו שוב"}</span>
              </button>

              <button
                type="button"
                onClick={() => (isLastBeat ? leaveCutscene("completed") : goToBeat(beatIndex + 1))}
                className="flex min-h-14 items-center justify-center gap-1 rounded-2xl bg-[#68c978] px-4 font-black text-[#082415] shadow-[0_4px_0_#327b45] transition hover:bg-[#79db89] active:translate-y-1 active:shadow-none focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#f9da7d] motion-reduce:transition-none sm:min-w-40 sm:px-6"
              >
                <span>{isLastBeat ? "מתחילים במשימה" : "הבא"}</span>
                <Chevron direction="left" />
              </button>
            </div>
          </div>
        </div>

        <p className="mt-2 hidden text-center text-xs font-bold text-white/55 sm:block" dir="rtl">
          <span dir="ltr">←</span> הבא · <span dir="ltr">→</span> הקודם · <span dir="ltr">R</span> קול · <span dir="ltr">Esc</span> דילוג
        </p>
      </section>
    </div>
  );
}
