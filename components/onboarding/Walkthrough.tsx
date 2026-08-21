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
 *  3. NOTHING ELSE IS TAPPABLE. The four dimmer rectangles around the
 *     spotlight swallow every pointer event outside it, so a stray tap
 *     cannot navigate away mid-tour. They also carry the grey-out: the
 *     surround is washed back to half strength and desaturated, leaving the
 *     spotlit control as the only thing on screen still in colour.
 *
 *  4. IT CANNOT DEAD-END. If a selector matches nothing (a screen changed, a
 *     control is off-screen), the step degrades to a full-screen card with an
 *     ordinary button instead of trapping the child. Same for a missing
 *     lesson, a zero-size element, or a resize mid-step.
 *
 *  5. NO IN-TOUR SKIP BUTTON. A visible skip control was tried and removed —
 *     it was a second thing to read on the highest-risk screen in the
 *     product, and a hurried parent skipping it for the child defeats the
 *     point. The escape hatch lives on the home screen instead: "הראה לי שוב"
 *     replays the tour any time, and Progress.onboarded (this device already
 *     finished it once) is still the only signal that skips it automatically.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Lesson, TutorialStep } from "@/lib/types";
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
}: {
  lesson: Lesson;
  onFinish: () => void;
}) {
  const steps = lesson.steps.filter((s): s is TutorialStep => s.type === "tutorial");

  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const step = steps[i];
  const finishedRef = useRef(false);

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

  /*
   * Where the card goes.
   *
   * This used to assume the card was 190px tall and put it above the target
   * whenever the target sat below 220px. Both numbers were guesses, and when
   * the card was taller than the guess it covered the very thing it was
   * pointing at — which is the bug that made the tour feel broken.
   *
   * So: measure the card, then pick the side that can actually hold it. Only
   * when NEITHER side fits does it overlap, and .efh-coach scrolls internally
   * in that case rather than running off the bottom of the screen.
   */
  const GAP = 16;
  const EDGE = 12;
  const coachRef = useRef<HTMLDivElement | null>(null);
  const [coachH, setCoachH] = useState(190);

  useLayoutEffect(() => {
    const el = coachRef.current;
    if (!el) return;
    const measure = () => setCoachH(el.getBoundingClientRect().height);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [step]);

  let coachTop = 0;
  if (box) {
    const vh = window.innerHeight;
    const roomAbove = box.top - EDGE - GAP;
    const roomBelow = vh - (box.top + box.height) - EDGE - GAP;
    if (coachH <= roomAbove) {
      coachTop = box.top - GAP - coachH;
    } else if (coachH <= roomBelow) {
      coachTop = box.top + box.height + GAP;
    } else {
      // Neither side fits: take the roomier one and clamp into the viewport.
      coachTop =
        roomBelow >= roomAbove ? box.top + box.height + GAP : Math.max(EDGE, box.top - GAP - coachH);
    }
    coachTop = Math.min(Math.max(coachTop, EDGE), Math.max(EDGE, vh - coachH - EDGE));
  }

  return (
    <div
      className="fixed inset-0 z-[65]"
      role="dialog"
      aria-modal="true"
      aria-label="הסבר קצר על המשחק"
    >
      {/*
       * The surround: four rectangles that tile the screen around the
       * spotlight, greyed and desaturated (.efh-dimmer). They are sized off
       * the viewport edges rather than off window dimensions, so a resize
       * needs no re-measure — only the hole moves.
       *
       * They are also the blocker: pointer events die here, so nothing
       * outside the spotlight is tappable. With no target to point at, one
       * rectangle covers the whole screen behind the card.
       */}
      {box ? (
        <>
          <div className="efh-dimmer" style={{ top: 0, left: 0, right: 0, height: Math.max(0, box.top) }} />
          <div className="efh-dimmer" style={{ top: Math.max(0, box.top + box.height), left: 0, right: 0, bottom: 0 }} />
          <div
            className="efh-dimmer"
            style={{ top: Math.max(0, box.top), left: 0, width: Math.max(0, box.left), height: box.height }}
          />
          <div
            className="efh-dimmer"
            style={{ top: Math.max(0, box.top), left: Math.max(0, box.left + box.width), right: 0, height: box.height }}
          />
        </>
      ) : (
        <div className="efh-dimmer" style={{ inset: 0 }} />
      )}

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
        ref={coachRef}
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
    </div>
  );
}
