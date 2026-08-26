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
  BuildSentenceStep,
  BuildWordStep,
  LetterShapeStep,
  LetterSoundStep,
  PressKeyStep,
  TutorialStep,
} from "@/lib/types";
import { KeyboardSurface } from "@/lib/keyboard-adapter";
import { getLetter } from "@/lib/curriculum";
import {
  playSfx,
  say,
  sayCard,
  sayLetterName,
  sayLetterSound,
  saySentence,
  sayWord,
  stopSpeech,
} from "@/lib/audio";
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
    /*
     * The letter is the single biggest thing on its screen, so it is where the
     * lesson's identity hue pays off most (rule 8). --tint-ink comes from the
     * player; it is a verified ink, so this stays a text colour that passes AA
     * rather than a decorative wash.
     */
    <div
      className="efh-tint-ink ltr select-none text-center font-black leading-none"
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
    // The recorded human voice if there is one, TTS if there is not. This is
    // the step where the difference matters most: a letter SOUND is not a
    // word, so a synthesiser has nothing to pronounce and guesses.
    if (step.mode === "name") sayLetterName(step.letter);
    else sayLetterSound(step.letter);
  }, [step.mode, step.letter]);

  useEffect(() => {
    // Auto-play once per step: the sound IS the question.
    const t = setTimeout(play, 350);
    return () => {
      clearTimeout(t);
      stopSpeech();
    };
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
  const [solved, setSolved] = useState(false);
  const hint = step.hint || forceHint;

  useEffect(() => {
    setSolved(false);
    setLang(step.lang);
  }, [step.id, step.lang]);

  const langOk = lang === step.lang;

  const handleKey = useCallback(
    (code: string, _char: string | null, activeLang: Lang) => {
      if (locked || solved) return;
      // Compare against the layout that was ACTIVE at press time, not React
      // state — a physical Alt+Shift can land in the same tick as the keypress.
      //
      // Pressing the right key in the wrong layout is NOT a wrong answer. It
      // is the language-switch lesson asking to be learned, so we say so and
      // do not grade it.
      if (activeLang !== step.lang) {
        playSfx("wrong");
        return;
      }
      if (code === step.code) {
        setSolved(true);
        playSfx("correct");
        onAnswer(true);
      } else {
        playSfx("wrong");
        onAnswer(false);
      }
    },
    [locked, solved, step.code, step.lang, onAnswer],
  );

  return (
    /* On a short screen (a phone on its side) the prompt gives its padding
       and a type size to the keyboard, which is the part being practised. */
    <div className="flex flex-col gap-4 [@media(max-height:560px)]:gap-2">
      <Card className="flex flex-col items-center gap-3 [@media(max-height:560px)]:gap-1 [@media(max-height:560px)]:!py-3">
        <p className="text-center text-2xl font-bold [@media(max-height:560px)]:text-lg">
          {step.promptHe}
        </p>
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

      <div {...tourAttr("keyboard")}>
        <KeyboardSurface
          lang={lang}
          onLangChange={setLang}
          requiredLang={step.lang}
          // Hint on ⇒ the key is spotlighted (recognition).
          // Hint off ⇒ legends are still printed, but nothing is marked, so
          // the child has to recall where the key lives.
          highlight={hint && langOk ? [step.code] : []}
          reveal
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
  const [missHere, setMissHere] = useState(0);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    setFilled(0);
    setMissHere(0);
    setDone(false);
    doneRef.current = false;
  }, [step.id]);

  const target = letters[filled];
  const targetCode = target ? `Key${target}` : null;
  const targetData = target ? getLetter(target) : undefined;
  /*
   * THE SCAFFOLD DIAL. `hint` is absent on every word step written before the
   * word phase existed, and absent means on — which is what those steps always
   * did. Off, the caps still carry their legends, but nothing points at one,
   * so finding the key is recall. The player's rescue hint (forceHint, after
   * two misses in a row) always wins: a child who is stuck gets the spotlight
   * back whatever the content asked for.
   */
  const hinted = (step.hint ?? true) || forceHint || missHere > 0;

  const handleKey = useCallback(
    (code: string, _char: string | null, activeLang: Lang) => {
      if (locked || doneRef.current || !targetCode) return;
      if (activeLang !== "en") {
        playSfx("wrong");
        return;
      }
      if (code === targetCode) {
        playSfx("letter-lands");
        setMissHere(0);
        onAnswer(true);
        setFilled((f) => {
          const next = f + 1;
          if (next >= letters.length) {
            doneRef.current = true;
            setDone(true);
            playSfx("celebrate");
            sayWord(step.word);
          }
          return next;
        });
      } else {
        playSfx("wrong");
        setMissHere((n) => n + 1);
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
        {missHere > 0 || forceHint ? (
          <p className="text-center text-lg font-bold text-brand">
            <span aria-hidden>👀 </span>
            המקש המסומן — זה הוא
          </p>
        ) : null}
        {!hinted && missHere === 0 ? (
          <p className="text-center text-lg font-bold text-ink-soft">
            <span aria-hidden>💪 </span>
            בלי סימון — תמצאו לבד
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => sayLetterName(target ?? step.word)}
          aria-label="השמע את האות"
          className="grid h-16 w-16 place-items-center rounded-full border-[3px] border-brand-soft bg-card text-3xl"
        >
          <span aria-hidden>🔊</span>
        </button>
      </Card>

      <div {...tourAttr("keyboard")}>
        <KeyboardSurface
          lang="en"
          requiredLang="en"
          // Spotlighted while the step is still teaching "where does this
          // letter live"; dark once the word phase turns the scaffold off,
          // and lit again the moment the child needs rescuing.
          highlight={hinted && targetCode ? [targetCode] : []}
          reveal
          showFingers
          disabled={locked}
          onKey={handleKey}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* build-sentence — the last quarter of the track                        */
/* ------------------------------------------------------------------ */

/**
 * A SENTENCE, TYPED WORD BY WORD.
 *
 * Deliberately the same screen as a word build with one thing added: the
 * space bar. That is not a technicality — "English puts a gap between words"
 * is a real thing to learn, and it is invisible until a child has to produce
 * it. So the gap is drawn as a slot like any other, with its own target
 * state, and the space bar is highlighted for it exactly as a letter key is.
 *
 * The Hebrew appears twice and they do different jobs. The whole sentence, in
 * natural Hebrew, is the MEANING — it is the big line, and it is what the
 * child is being asked to say. The word-under-word glosses are the MACHINERY,
 * small and secondary: which English word is carrying which piece of it. A
 * seven-year-old reading "אני רואה חתול" over "I SEE A CAT" can see for
 * themselves that English spends a word on "A" where Hebrew spends none.
 *
 * No audio for these is recorded yet, and the design does not wait for it:
 * `saySentence` plays a human recording the day one exists and the browser
 * voice until then, and the Hebrew on screen is the channel that never fails.
 */
export function BuildSentenceView({
  step,
  onAnswer,
  onAdvance,
  forceHint,
  locked,
}: StepRenderProps & { step: BuildSentenceStep }) {
  /** The sentence as a flat list of things to type: letters and the gaps. */
  const tokens = useMemo(
    () =>
      step.sentence.split("").map((ch, i) => ({
        i,
        char: ch,
        isSpace: ch === " ",
        code: ch === " " ? "Space" : `Key${ch}`,
      })),
    [step.sentence],
  );
  const words = useMemo(() => step.sentence.split(" "), [step.sentence]);

  const [filled, setFilled] = useState(0);
  const [missHere, setMissHere] = useState(0);
  const [done, setDone] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    setFilled(0);
    setMissHere(0);
    setDone(false);
    doneRef.current = false;
  }, [step.id]);

  const target = tokens[filled];
  const targetCode = target?.code ?? null;
  const hinted = step.hint || forceHint || missHere > 0;

  const handleKey = useCallback(
    (code: string, _char: string | null, activeLang: Lang) => {
      if (locked || doneRef.current || !targetCode) return;
      if (activeLang !== "en") {
        playSfx("wrong");
        return;
      }
      if (code === targetCode) {
        playSfx("letter-lands");
        setMissHere(0);
        onAnswer(true);
        setFilled((f) => {
          const next = f + 1;
          if (next >= tokens.length) {
            doneRef.current = true;
            setDone(true);
            playSfx("celebrate");
            saySentence(step.sentence);
          }
          return next;
        });
      } else {
        playSfx("wrong");
        setMissHere((n) => n + 1);
        onAnswer(false);
      }
    },
    [locked, targetCode, tokens.length, onAnswer, step.sentence],
  );

  if (done) {
    return (
      <div className="flex flex-col items-center gap-5 py-6">
        <div className="efh-hero" aria-hidden>
          {step.emoji}
        </div>
        <p className="ltr text-center text-3xl font-black leading-snug tracking-wide">
          {step.sentence}
        </p>
        <p className="text-center text-2xl font-bold">{step.he}</p>
        <button
          type="button"
          onClick={() => saySentence(step.sentence)}
          aria-label="השמע את המשפט"
          className="grid h-16 w-16 place-items-center rounded-full border-[3px] border-brand-soft bg-card text-3xl"
        >
          <span aria-hidden>🔊</span>
        </button>
        <BigButton icon="👉" onClick={onAdvance}>
          יאללה, ממשיכים
        </BigButton>
      </div>
    );
  }

  // Where each word starts in the flat token list, so a slot knows its index.
  let cursor = 0;
  const wordStarts = words.map((word) => {
    const start = cursor;
    cursor += word.length + 1; // +1 for the space that follows it
    return start;
  });

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden className="text-5xl">
            {step.emoji}
          </span>
          <p className="text-2xl font-bold">{step.he}</p>
        </div>

        {/* The sentence under construction. Words stay visually whole, and
            the gap between them is a slot of its own — that gap is the thing
            this step exists to teach. */}
        <div
          className="efh-sentence ltr flex flex-wrap items-start justify-center gap-x-3 gap-y-3"
          // The slots size themselves from how many there are, so a five-word
          // sentence wraps between words instead of one word per line. See
          // .efh-sentence in globals.css.
          style={{ ["--efh-slots" as string]: String(tokens.length) }}
          {...tourAttr("word-slots")}
        >
          {words.map((word, w) => (
            <div key={`${word}-${w}`} className="flex items-start gap-1">
              <div className="flex flex-col items-center gap-1">
                <div className="flex gap-1">
                  {word.split("").map((letter, k) => {
                    const idx = wordStarts[w]! + k;
                    return (
                      <div
                        key={`${letter}-${k}`}
                        className="efh-slot"
                        data-filled={idx < filled ? "1" : undefined}
                        data-active={idx === filled ? "1" : undefined}
                        aria-label={idx < filled ? letter : "ריק"}
                      >
                        {idx < filled ? letter : ""}
                      </div>
                    );
                  })}
                </div>
                <span className="rtl text-xs font-bold text-ink-soft">
                  {step.wordsHe[w] ?? ""}
                </span>
              </div>

              {w < words.length - 1 ? (
                (() => {
                  const idx = wordStarts[w]! + word.length;
                  return (
                    <div
                      className="efh-slot opacity-70"
                      data-filled={idx < filled ? "1" : undefined}
                      data-active={idx === filled ? "1" : undefined}
                      aria-label={idx < filled ? "רווח" : "רווח ריק"}
                    >
                      <span aria-hidden className="text-ink-soft">
                        ␣
                      </span>
                    </div>
                  );
                })()
              ) : null}
            </div>
          ))}
        </div>

        {target ? (
          <p className="text-center text-2xl font-bold">
            {target.isSpace ? (
              <>
                עכשיו <span className="font-black">רווח</span> — המקש הארוך למטה
              </>
            ) : (
              <>
                עכשיו לחצו על{" "}
                <span className="ltr text-3xl font-black">{target.char}</span>
                {getLetter(target.char) ? (
                  <span className="text-ink-soft">
                    {" "}
                    ({getLetter(target.char)?.nameHe})
                  </span>
                ) : null}
              </>
            )}
          </p>
        ) : null}

        {missHere > 0 || forceHint ? (
          <p className="text-center text-lg font-bold text-brand">
            <span aria-hidden>👀 </span>
            המקש המסומן — זה הוא
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => saySentence(step.sentence)}
          aria-label="השמע את המשפט"
          className="grid h-16 w-16 place-items-center rounded-full border-[3px] border-brand-soft bg-card text-3xl"
        >
          <span aria-hidden>🔊</span>
        </button>
      </Card>

      <div {...tourAttr("keyboard")}>
        <KeyboardSurface
          lang="en"
          requiredLang="en"
          highlight={hinted && targetCode ? [targetCode] : []}
          reveal
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
    // The recorded human reading of this card, or the content's own cue when
    // nobody has recorded it — never both at once, which used to cut the
    // narration off after a word. See sayCard in lib/audio.ts.
    const t = setTimeout(() => sayCard(step.id, step.say), 300);
    return () => {
      clearTimeout(t);
      // Leaving the card silences it: a sentence of narration is longer than
      // the time a child takes to tap on.
      stopSpeech();
    };
  }, [step.id, step.say]);

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
