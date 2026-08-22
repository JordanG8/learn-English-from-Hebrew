"use client";

/**
 * LESSON PLAYER — renders whatever Step comes next, grades it, and owns all
 * the accounting (attempts, rescue hints, stars).
 *
 * The step renderers in ./steps.tsx are deliberately dumb: they report
 * `onAnswer(correct)` and nothing else. Everything policy-shaped lives here
 * so there is one implementation of "what happens when a child gets it
 * wrong" rather than five.
 *
 * A mixed-review lesson has no stored steps. Its content is decided at play
 * time by the SRS (`planMixedReview`) and assembled by `buildReviewLesson`,
 * which is why review lessons stay useful forever instead of replaying the
 * same eight questions.
 */

import { tintStyle } from "@/lib/palette";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Lesson, Step } from "@/lib/types";
import {
  HINT_RESCUE_AFTER_WRONG,
  MAX_ATTEMPTS_PER_STEP,
  CELEBRATION_MS,
} from "@/lib/pedagogy";
import { useProgress } from "@/lib/progress-context";
import { planMixedReview } from "@/lib/srs";
import { buildReviewLesson, skillsForStep } from "@/lib/curriculum";
import { starsFor, praise, encouragement, revealLine, completionHeadlineHe } from "@/lib/reward";
import type { Stars } from "@/lib/reward";
import { playSfx } from "@/lib/audio";
import {
  BigButton,
  Confetti,
  ScreenHeader,
  SecondaryButton,
  StarRow,
  StepBar,
} from "@/components/ui/kit";
import {
  BuildWordView,
  LetterShapeView,
  LetterSoundView,
  PressKeyView,
  TutorialCardView,
  type StepRenderProps,
} from "./steps";

type Phase = "playing" | "feedback" | "done";

export function LessonPlayer({ lesson: stored }: { lesson: Lesson }) {
  const router = useRouter();
  const { progress, ready, attempt, completeLesson, learnWord } = useProgress();

  /* --- Resolve the actual lesson ---------------------------------- */
  // A review lesson's content is computed once, when the lesson opens. It is
  // intentionally NOT recomputed as progress changes mid-lesson, or the list
  // of questions would shift under the child's feet.
  const [resolved, setResolved] = useState<Lesson | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (stored.kind === "mixed") {
      setResolved(buildReviewLesson(planMixedReview(progress), stored.id));
    } else {
      setResolved(stored);
    }
    // progress is deliberately omitted: resolve once per lesson opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, stored]);

  const lesson = resolved;
  const steps: Step[] = useMemo(() => lesson?.steps ?? [], [lesson]);

  /* --- Run state --------------------------------------------------- */
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("playing");
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"good" | "soft">("good");
  const [attemptsHere, setAttemptsHere] = useState(0);
  const [wrongTotal, setWrongTotal] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const settled = useRef(false);
  // When the current step appeared. Latency is half of the mastery
  // criterion (automaticity) — see MASTERY_MEDIAN_LATENCY_MS.
  const shownAt = useRef<number>(Date.now());

  const step = steps[index];
  const forceHint = attemptsHere >= HINT_RESCUE_AFTER_WRONG;

  const advance = useCallback(() => {
    setMessage(null);
    setAttemptsHere(0);
    setIndex((i) => i + 1);
    setPhase("playing");
    shownAt.current = Date.now();
  }, []);

  /* --- Grading ----------------------------------------------------- */
  const onAnswer = useCallback(
    (correct: boolean) => {
      if (!step || phase !== "playing") return;
      const skills = skillsForStep(step);
      const hinted = forceHint || attemptsHere > 0;
      // Only the FIRST attempt on a step is a fair latency sample; later ones
      // include the time spent reading the "try again" nudge.
      const latencyMs = attemptsHere === 0 ? Date.now() - shownAt.current : undefined;

      skills.forEach((s) => attempt(s, { correct, hinted, latencyMs }));

      if (correct) {
        setMessage(praise(index * 7 + attemptsHere));
        setMessageTone("good");
        // build-word owns its own pacing: it shows the hero celebration and
        // calls onAdvance itself.
        if (step.type === "build-word") return;
        setPhase("feedback");
        window.setTimeout(advance, 650);
        return;
      }

      const next = attemptsHere + 1;
      setAttemptsHere(next);
      setWrongTotal((w) => w + 1);

      if (next >= MAX_ATTEMPTS_PER_STEP && step.type !== "build-word") {
        // Never leave a child stuck in a failure loop. Show the answer,
        // say something kind, move on. The SRS will bring it back.
        setMessage(revealLine(index));
        setMessageTone("soft");
        setPhase("feedback");
        window.setTimeout(advance, 1600);
      } else {
        setMessage(encouragement(index * 3 + next));
        setMessageTone("soft");
      }
    },
    [step, phase, forceHint, attemptsHere, attempt, index, advance],
  );

  /* --- Completion --------------------------------------------------- */
  const stars: Stars = useMemo(
    () =>
      starsFor({
        completed: true,
        wrongAnswers: wrongTotal,
        unhintedCorrect: Math.max(0, steps.length - wrongTotal),
        totalSteps: steps.length,
      }),
    [wrongTotal, steps.length],
  );

  useEffect(() => {
    if (!lesson || steps.length === 0) return;
    if (index < steps.length || settled.current) return;
    settled.current = true;

    completeLesson(lesson.id, stars);
    // Every word actually built joins the chat lexicon.
    steps.forEach((s) => {
      if (s.type === "build-word") learnWord(s.word);
    });
    playSfx("celebrate");
    setCelebrating(true);
    setPhase("done");
    const t = setTimeout(() => setCelebrating(false), CELEBRATION_MS);
    return () => clearTimeout(t);
  }, [index, steps, lesson, stars, completeLesson, learnWord]);

  const restart = useCallback(() => {
    settled.current = false;
    setIndex(0);
    setWrongTotal(0);
    setAttemptsHere(0);
    setMessage(null);
    setPhase("playing");
    shownAt.current = Date.now();
  }, []);

  /*
   * FORWARD IS THROUGH THE ROAD, always.
   *
   * This used to jump straight into the next lesson, which quietly threw away
   * the reward: the pencil moved a pad up the road with nobody watching it
   * happen, and a level was just a screen that replaced another screen. The
   * road is where the work becomes distance travelled, so every way out of a
   * finished lesson goes there, and the road makes the child watch the pencil
   * arrive before it will let them press play again. See LevelSelect.
   */
  const goNext = useCallback(() => {
    router.push("/map");
  }, [router]);

  /* --- Render ------------------------------------------------------- */
  if (!ready || !lesson) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <p className="text-2xl font-bold">רגע…</p>
      </main>
    );
  }

  if (phase === "done") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <Confetti active={celebrating} />
        <StarRow earned={stars} size={64} animate />
        <h1 className="text-center text-3xl font-black leading-snug">
          {completionHeadlineHe(stars)}
        </h1>
        <p className="text-center text-xl text-ink-soft">{lesson.titleHe}</p>
        <div className="flex w-full max-w-sm flex-col gap-3">
          <BigButton icon="🛣️" onClick={goNext}>
            למסלול
          </BigButton>
          <SecondaryButton icon="🔁" onClick={restart} className="w-full">
            עוד פעם
          </SecondaryButton>
          <SecondaryButton icon="🏠" onClick={() => router.push("/")} className="w-full">
            בית
          </SecondaryButton>
        </div>
      </main>
    );
  }

  if (!step) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <p className="text-2xl font-bold">רגע…</p>
      </main>
    );
  }

  const common: StepRenderProps = {
    onAnswer,
    onAdvance: advance,
    forceHint,
    locked: phase !== "playing",
  };

  return (
    /*
     * The lesson's identity hue (rule 8) is carried on the whole screen, so
     * moving from "האות A" to "האות B" visibly changes rooms. It reaches the
     * step renderers as --tint / --tint-ink; nothing about the step's state
     * rides on it.
     */
    <main className="flex min-h-dvh flex-col" style={tintStyle(lesson.id)}>
      <ScreenHeader title={lesson.titleHe} onBack={() => router.push("/map")} />
      <div className="px-4">
        <StepBar current={index} total={steps.length} />
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
        {step.type === "letter-sound" ? (
          <LetterSoundView step={step} {...common} />
        ) : step.type === "letter-shape" ? (
          <LetterShapeView step={step} {...common} />
        ) : step.type === "press-key" ? (
          <PressKeyView step={step} {...common} />
        ) : step.type === "build-word" ? (
          <BuildWordView step={step} {...common} />
        ) : step.type === "tutorial" ? (
          <TutorialCardView step={step} {...common} />
        ) : (
          <div className="grid flex-1 place-items-center">
            <BigButton onClick={() => router.push("/chat")}>לדבר באנגלית</BigButton>
          </div>
        )}
      </div>

      {message ? (
        <div
          role="status"
          className={`sticky bottom-0 p-4 text-center text-2xl font-black ${
            messageTone === "good" ? "text-go" : "text-ink-soft"
          }`}
        >
          <span aria-hidden>{messageTone === "good" ? "✓ " : "↻ "}</span>
          {message}
        </div>
      ) : null}
    </main>
  );
}
