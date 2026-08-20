"use client";

/**
 * THE WALKTHROUGH — the highest-risk screen in the product, because a child
 * who misreads it never gets to the English.
 *
 * Rules it is built to satisfy:
 *
 *  1. MANDATORY ON FIRST VISIT. It runs before any English is taught. The
 *     only signal permitted to skip it automatically is Progress.onboarded —
 *     i.e. this device already finished it. See lib/visitor.ts for why the
 *     cookie and the hashed-IP signal may only ever *offer* a skip button.
 *
 *  2. REAL ELEMENTS, REAL TAPS. A step with advanceOn "tap-target" spotlights
 *     an actual control and will not advance until the child touches that
 *     control. There is no "next" button to reflex-tap past it.
 *
 *  3. NOTHING ELSE IS TAPPABLE. The dimmer swallows every pointer event
 *     outside the spotlight, so a stray tap cannot navigate away mid-tour.
 *
 *  4. IT CANNOT DEAD-END. If a selector matches nothing (a screen changed, a
 *     control is off-screen), the step degrades to a full-screen card with an
 *     ordinary button instead of trapping the child. Same for a missing
 *     lesson, a zero-size element, or a resize mid-step.
 *
 *  5. THE ESCAPE HATCH IS VISIBLE, NOT AUTOMATIC. Returning visitors get a
 *     large skip button — after a delay, so it cannot be hit by reflex. A
 *     genuine first-timer never sees it. And "הראה לי שוב" lives permanently
 *     on the home screen, so a wrongly-skipped child is one tap from here.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Lesson, TutorialStep } from "@/lib/types";
import { useProgress } from "@/lib/progress-context";
import { useVisitor } from "@/lib/app-providers";
import { playSfx, primeAudio, say } from "@/lib/audio";
import { BigButton } from "@/components/ui/kit";

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 10;

function measure(selector: string): Box | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

export function Walkthrough({
  lesson,
  onFinish,
  onSkip,
}: {
  lesson: Lesson;
  onFinish: () => void;
  onSkip: () => void;
}) {
  const visitor = useVisitor();
  const steps = lesson.steps.filter((s): s is TutorialStep => s.type === "tutorial");

  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [skipVisible, setSkipVisible] = useState(false);
  const step = steps[i];
  const finishedRef = useRef(false);

  /* --- Skip button: visible only for probable returners, and delayed --- */
  useEffect(() => {
    if (!visitor.mayOfferSkip) return;
    const delay = visitor.skipDelayMs;
    if (!Number.isFinite(delay)) return;
    const t = setTimeout(() => setSkipVisible(true), delay);
    return () => clearTimeout(t);
  }, [visitor.mayOfferSkip, visitor.skipDelayMs]);

  /* --- Keep the spotlight glued to its element ------------------------ */
  useLayoutEffect(() => {
    if (!step) return;
    if (!step.target) {
      setBox(null);
      return;
    }
    let raf = 0;
    const same = (a: Box | null, b: Box | null) =>
      a === b ||
      (a !== null &&
        b !== null &&
        Math.abs(a.top - b.top) < 0.5 &&
        Math.abs(a.left - b.left) < 0.5 &&
        Math.abs(a.width - b.width) < 0.5 &&
        Math.abs(a.height - b.height) < 0.5);
    const update = () => {
      const next = step.target ? measure(step.target) : null;
      // Re-render only when the element actually moved — this loop runs every
      // frame to survive scroll, resize and layout shift.
      setBox((prev) => (same(prev, next) ? prev : next));
      raf = requestAnimationFrame(update);
    };
    // Scroll the target into view first — a spotlight off-screen is a dead end.
    const el = document.querySelector(step.target);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    update();
    return () => cancelAnimationFrame(raf);
  }, [step]);

  useEffect(() => {
    primeAudio();
    if (step?.say) say(step.say);
  }, [step]);

  const next = useCallback(() => {
    playSfx("tap");
    if (i + 1 >= steps.length) {
      if (finishedRef.current) return;
      finishedRef.current = true;
      playSfx("celebrate");
      onFinish();
    } else {
      setI((n) => n + 1);
    }
  }, [i, steps.length, onFinish]);

  if (!step) return null;

  const needsTap = step.advanceOn === "tap-target" && step.target !== null;
  // Degraded mode: the element we were told to point at is not on screen.
  const degraded = needsTap && box === null;

  const coachTop =
    box && box.top > 220
      ? Math.max(12, box.top - 190)
      : box
        ? Math.min(window.innerHeight - 210, box.top + box.height + 16)
        : 0;

  return (
    <div
      className="fixed inset-0 z-[65]"
      role="dialog"
      aria-modal="true"
      aria-label="הסבר קצר על המשחק"
    >
      {/* Blocker: everything outside the spotlight is inert. */}
      <div className="absolute inset-0" style={{ background: box ? "transparent" : "oklch(0.24 0.03 260 / 0.72)" }} />

      {box ? (
        <>
          <div
            className="efh-spotlight-hole efh-spotlight-ring"
            style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
          />
          {/* The real tap target. Tapping here advances the tour; it does not
              fire the underlying control, so the child cannot navigate away
              in the middle of the explanation. */}
          <button
            type="button"
            onClick={next}
            aria-label="גע כאן"
            className="absolute z-[73] rounded-[1.25rem]"
            style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
          />
          <span
            className="efh-finger"
            aria-hidden
            style={{ top: box.top + box.height - 6, left: box.left + box.width / 2 - 22 }}
          >
            👆
          </span>
        </>
      ) : null}

      <div
        className="efh-coach"
        style={
          box
            ? { top: coachTop, left: "50%", transform: "translateX(-50%)" }
            : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
        }
      >
        <p className="text-center text-xl font-bold leading-relaxed">{step.promptHe}</p>

        {/* Progress dots — three redundant channels: position, count, label. */}
        <p className="mt-3 text-center text-sm text-ink-soft">
          {i + 1} מתוך {steps.length}
        </p>

        {!needsTap || degraded ? (
          <div className="mt-4">
            <BigButton icon="👉" onClick={next}>
              {i + 1 >= steps.length ? "יאללה, מתחילים!" : "הבנתי"}
            </BigButton>
          </div>
        ) : (
          <p className="mt-3 text-center text-lg font-bold text-brand">
            <span aria-hidden>👆 </span>
            גע במקום שמסומן
          </p>
        )}
      </div>

      {skipVisible ? (
        <button
          type="button"
          onClick={() => {
            playSfx("tap");
            onSkip();
          }}
          className="absolute bottom-4 left-1/2 z-[74] min-h-[64px] -translate-x-1/2 rounded-[var(--radius-kid)] border-[3px] border-paper bg-card px-6 text-lg font-bold"
        >
          <span aria-hidden>⏭ </span>
          כבר ראיתי — דלג
        </button>
      ) : null}
    </div>
  );
}
