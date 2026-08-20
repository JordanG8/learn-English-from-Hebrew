"use client";

/**
 * STEP RENDERERS — one component per `Step` variant.
 *
 * Shared contract: a renderer never mutates progress and never advances the
 * lesson itself. It reports an attempt through `onAnswer(correct)` and the
 * player decides what happens. That keeps grading, rescue-hints and star
 * accounting in one place (LessonPlayer) instead of five.
 *
 * Design-system rules that apply to every renderer here:
 *   · exactly one thing to do per screen
 *   · answer targets ≥64px (the on-screen keyboard's own keys are the
 *     documented exception — see the note in globals.css)
 *   · Hebrew instruction + icon + colour, never colour alone
 *   · English glyphs always inside `.ltr`
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BuildWordStep,
  LetterShapeStep,
  LetterSoundStep,
  PressKeyStep,
  TutorialStep,
} from "@/lib/types";
import { KeyboardSurface } from "@/lib/keyboard-adapter";
import { LanguageSwitch } from "@/components/keyboard/LanguageSwitch";
import { getLetter } from "@/lib/curriculum";
import { playSfx, say, speakEn } from "@/lib/audio";
import { BigButton, Card } from "@/components/ui/kit";
import { tourAttr } from "@/lib/tour";
import type { Lang } from "@/lib/types";

export interface StepRenderProps {
  /** Report one graded attempt. */
  onAnswer: (correct: boolean) => void;
  /** Move on. Called by steps that are not graded (tutorial cards). */
  onAdvance: () => void;
  /** The player turns this on after repeated misses — see HINT_RESCUE_AFTER_WRONG. */
  forceHint: boolean;
  /** Locks input during feedback / celebration. */
  locked: boolean;
}

/* ------------------------------------------------------------------ */
/* Speaker button — the audio channel, always optional, never the only one */
/* ------------------------------------------------------------------ */

function SpeakerButton({ onPlay, label }: { onPlay: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={label}
      {...tourAttr("sound-button")}
      className="grid h-16 w-16 place-items-center rounded-full border-[3px] border-brand-soft bg-card text-3xl"
    >
      <span aria-hidden>🔊</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Big letter display                                                   */
/* ------------------------------------------------------------------ */

function GiantLetter({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="ltr select-none text-center font-black leading-none"
      style={{ fontSize: "clamp(5rem, 30vw, 10rem)" }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Choice grid (letter-sound and letter-shape both use it)              */
/* ------------------------------------------------------------------ */

function ChoiceGrid({
  options,
  answer,
  ltr,
  locked,
  onAnswer,
}: {
  options: readonly string[];
  answer: string;
  ltr: boolean;
  locked: boolean;
  onAnswer: (correct: boolean) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [wrongSet, setWrongSet] = useState<string[]>([]);

  useEffect(() => {
    setPicked(null);
    setWrongSet([]);
  }, [options, answer]);

  const choose = (opt: string) => {
    if (locked || picked === answer) return;
    const correct = opt === answer;
    setPicked(opt);
    if (!correct) setWrongSet((w) => (w.includes(opt) ? w : [...w, opt]));
    playSfx(correct ? "correct" : "wrong");
    onAnswer(correct);
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((opt) => {
        const isWrong = wrongSet.includes(opt);
        const isRight = picked === answer && opt === answer;
        return (
          <button
            key={opt}
            type="button"
            disabled={locked || isWrong}
            onClick={() => choose(opt)}
            className={`min-h-[96px] rounded-[var(--radius-kid)] border-4 bg-card px-3 text-4xl font-black transition-transform active:scale-95 ${
              isRight
                ? "border-go bg-go-soft"
                : isWrong
                  ? "border-stop opacity-40"
                  : "border-brand-soft"
            } ${ltr ? "ltr" : "rtl"}`}
          >
            <span className="flex items-center justify-center gap-2">
              {isRight ? <span aria-hidden className="text-3xl">✓</span> : null}
              {isWrong ? <span aria-hidden className="text-3xl">✕</span> : null}
              <span>{opt}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* letter-sound  (mode: "sound" | "name")                               */
/* ------------------------------------------------------------------ */

export function LetterSoundView({
  step,
  onAnswer,
  locked,
}: StepRenderProps & { step: LetterSoundStep }) {
  const data = getLetter(step.letter);

  const play = useCallback(() => {
    if (step.mode === "name") speakEn(data?.nameEn ?? step.letter, 0.7);
    else speakEn(data?.soundSpeak ?? step.letter, 0.6);
  }, [step.mode, step.letter, data]);

  useEffect(() => {
    // Auto-play once per step: the sound IS the question.
    const t = setTimeout(play, 350);
    return () => clearTimeout(t);
  }, [play]);

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col items-center gap-3">
        <GiantLetter>
          {step.letter}
          <span className="opacity-40"> {data?.lower}</span>
        </GiantLetter>
        <SpeakerButton onPlay={play} label="השמע שוב" />
      </Card>
      <p className="text-center text-2xl font-bold">{step.promptHe}</p>
      <ChoiceGrid
        options={step.options}
        answer={step.answer}
        ltr={false}
        locked={locked}
        onAnswer={onAnswer}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* letter-shape                                                         */
/* ------------------------------------------------------------------ */

export function LetterShapeView({
  step,
  onAnswer,
  locked,
}: StepRenderProps & { step: LetterShapeStep }) {
  const data = getLetter(step.letter);
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col items-center gap-2">
        {step.caseMatch ? (
          <>
            <GiantLetter>{step.letter}</GiantLetter>
            <p className="text-lg text-ink-soft">האות הגדולה</p>
          </>
        ) : (
          <div className="flex items-center gap-4">
            <span aria-hidden className="text-6xl">
              {data?.emoji}
            </span>
            <div className="ltr text-center">
              <p className="text-3xl font-black">{data?.exampleWord}</p>
              <p className="rtl text-lg text-ink-soft">{data?.exampleWordHe}</p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => say(step.say)}
          aria-label="השמע"
          className="mt-1 grid h-16 w-16 place-items-center rounded-full border-[3px] border-brand-soft bg-card text-3xl"
        >
          <span aria-hidden>🔊</span>
        </button>
      </Card>
      <p className="text-center text-2xl font-bold">{step.promptHe}</p>
      <ChoiceGrid
        options={step.options}
        answer={step.caseMatch ? (data?.lower ?? step.letter.toLowerCase()) : step.letter}
        ltr
        locked={locked}
        onAnswer={onAnswer}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* press-key                                                            */
/* ------------------------------------------------------------------ */

export function PressKeyView({
  step,
  onAnswer,
  forceHint,
  locked,
}: StepRenderProps & { step: PressKeyStep }) {
  const [lang, setLang] = useState<Lang>(step.lang);
  const [wrong, setWrong] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const hint = step.hint || forceHint;

  useEffect(() => {
    setWrong([]);
    setSolved(false);
    setLang(step.lang);
  }, [step.id, step.lang]);

  const langOk = lang === step.lang;

  const handleKey = useCallback(
    (code: string) => {
      if (locked || solved) return;
      // Pressing the right key in the wrong layout is not a wrong answer —
      // it is the language-switch lesson asking to be learned. Say so.
      if (!langOk) {
        playSfx("wrong");
        setWrong((w) => (w.includes(code) ? w : [...w, code]));
        return;
      }
      if (code === step.code) {
        setSolved(true);
        playSfx("correct");
        onAnswer(true);
      } else {
        playSfx("wrong");
        setWrong((w) => (w.includes(code) ? w : [...w, code]));
        onAnswer(false);
      }
    },
    [locked, solved, langOk, step.code, onAnswer],
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col items-center gap-3">
        <p className="text-center text-2xl font-bold">{step.promptHe}</p>
        {!langOk ? (
          <p className="rounded-2xl bg-warn/20 px-4 py-2 text-center text-lg font-bold">
            <span aria-hidden>⇄ </span>
            {step.lang === "he"
              ? "צריך לעבור לעברית — Alt+Shift"
              : "צריך לעבור לאנגלית — Alt+Shift"}
          </p>
        ) : null}
        {solved ? (
          <p className="text-3xl font-black text-go">
            <span aria-hidden>✓ </span>מצאת!
          </p>
        ) : null}
      </Card>

      <div className="flex justify-center" {...tourAttr("lang-switch")}>
        <LanguageSwitch
          lang={lang}
          onLangChange={(next) => setLang(next)}
          requiredLang={step.lang}
          size="sm"
        />
      </div>

      <div {...tourAttr("keyboard")}>
        <KeyboardSurface
          lang={lang}
          highlight={hint && langOk ? [step.code] : []}
          wrong={wrong}
          disabled={locked || solved}
          onKey={handleKey}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* build-word — THE core loop                                           */
/* ------------------------------------------------------------------ */

export function BuildWordView({
  step,
  onAnswer,
  onAdvance,
  forceHint,
  locked,
}: StepRenderProps & { step: BuildWordStep }) {
  const letters = useMemo(() => step.word.split(""), [step.word]);
  const [filled, setFilled] = useState(0);
  const [wrong, setWrong] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    setFilled(0);
    setWrong([]);
    setDone(false);
    doneRef.current = false;
  }, [step.id]);

  const target = letters[filled];
  const targetCode = target ? `Key${target}` : null;
  const targetData = target ? getLetter(target) : undefined;

  const handleKey = useCallback(
    (code: string) => {
      if (locked || doneRef.current || !targetCode) return;
      if (code === targetCode) {
        playSfx("letter-lands");
        setWrong([]);
        onAnswer(true);
        setFilled((f) => {
          const next = f + 1;
          if (next >= letters.length) {
            doneRef.current = true;
            setDone(true);
            playSfx("celebrate");
            speakEn(step.word.toLowerCase(), 0.7);
          }
          return next;
        });
      } else {
        playSfx("wrong");
        setWrong((w) => (w.includes(code) ? w : [...w, code]));
        onAnswer(false);
      }
    },
    [locked, targetCode, letters.length, onAnswer, step.word],
  );

  if (done) {
    return (
      <div className="flex flex-col items-center gap-5 py-6">
        <div className="efh-hero" aria-hidden>
          {step.emoji}
        </div>
        <p className="ltr text-5xl font-black tracking-widest">{step.word}</p>
        <p className="text-3xl font-bold">{step.he}</p>
        <BigButton icon="👉" onClick={onAdvance}>
          יאללה, ממשיכים
        </BigButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-5xl">
            {step.emoji}
          </span>
          <p className="text-2xl font-bold">{step.he}</p>
        </div>
        <div className="ltr flex flex-wrap justify-center gap-2" {...tourAttr("word-slots")}>
          {letters.map((l, i) => (
            <div
              key={`${l}-${i}`}
              className="efh-slot"
              data-filled={i < filled ? "1" : undefined}
              data-active={i === filled ? "1" : undefined}
              aria-label={i < filled ? l : "ריק"}
            >
              {i < filled ? l : ""}
            </div>
          ))}
        </div>
        {target ? (
          <p className="text-center text-2xl font-bold">
            עכשיו לחצו על <span className="ltr text-3xl font-black">{target}</span>
            {targetData ? (
              <span className="text-ink-soft"> ({targetData.nameHe})</span>
            ) : null}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => speakEn(targetData?.nameEn ?? step.word, 0.7)}
          aria-label="השמע את האות"
          className="grid h-16 w-16 place-items-center rounded-full border-[3px] border-brand-soft bg-card text-3xl"
        >
          <span aria-hidden>🔊</span>
        </button>
      </Card>

      <div {...tourAttr("keyboard")}>
        <KeyboardSurface
          lang="en"
          highlight={forceHint || wrong.length > 0 ? (targetCode ? [targetCode] : []) : []}
          wrong={wrong}
          disabled={locked}
          onKey={handleKey}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* tutorial card (inside a lesson — the walkthrough overlay is separate) */
/* ------------------------------------------------------------------ */

export function TutorialCardView({
  step,
  onAdvance,
}: StepRenderProps & { step: TutorialStep }) {
  useEffect(() => {
    const t = setTimeout(() => say(step.say), 300);
    return () => clearTimeout(t);
  }, [step.say]);

  return (
    <div className="flex flex-1 flex-col justify-between gap-6 py-4">
      <Card className="flex flex-col items-center gap-4">
        <span aria-hidden className="text-6xl">
          💡
        </span>
        <p className="text-center text-2xl font-bold leading-relaxed">{step.promptHe}</p>
      </Card>
      <BigButton icon="👉" onClick={onAdvance}>
        הבנתי, ממשיכים
      </BigButton>
    </div>
  );
}
