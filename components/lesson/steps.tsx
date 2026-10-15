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
  LetterIntroStep,
  LetterShapeStep,
  LetterSoundStep,
  PressKeyStep,
  TutorialStep,
  WordIntroStep,
} from "@/lib/types";
import { KeyboardSurface } from "@/lib/keyboard-adapter";
import { getLetter } from "@/lib/curriculum";
import {
  followLine,
  isRecorded,
  lineMarks,
  playSequence,
  playSfx,
  say,
  sayCard,
  sayLetterName,
  sayLetterSound,
  sayPhoneme,
  saySentence,
  sayWord,
  speakLine,
  stopSpeech,
} from "@/lib/audio";
import {
  PHONEMES,
  letterMouth,
  letterPhoneme,
  mouthSrc,
  phonemeOnType,
  segmentsFor,
  type MouthId,
} from "@/lib/phonics";
import {
  letterIntroLineId,
  letterSoundLineId,
  phonemeLineId,
  sentenceLineId,
  soundoutLineId,
  wordLineId,
} from "@/lib/voice/lines";
import { loadVoiceManifest } from "@/lib/voice/manifest";
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
/* What a keypress sounds like                                           */
/* ------------------------------------------------------------------ */

/**
 * EVERY LETTER TYPED IS HEARD.
 *
 * Inside a word, a letter plays the sound it makes THERE — the same sound the
 * word's intro sounded out, from the same table (lib/phonics.ts): typing
 * C·A·K·E plays k, ay, k, and then a quiet tick for the E that says nothing.
 * A letter on its own, or one typed by mistake, plays its own sound. Typed in
 * the Hebrew layout it plays nothing English at all.
 */
function soundTyped(code: string, word: string | null, index: number): void {
  const letter = code.startsWith("Key") ? code.slice(3) : null;
  if (!letter) {
    playSfx("letter-lands");
    return;
  }
  if (word && word[index] === letter) {
    const ph = phonemeOnType(word, index);
    if (ph) sayPhoneme(ph);
    else playSfx("letter-lands");
    return;
  }
  sayLetterSound(letter);
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
/* The mouth                                                             */
/* ------------------------------------------------------------------ */

/**
 * The shape a mouth makes for a sound, on a face-coloured disc. `speaking`
 * is on only while the sound is actually playing — the picture is the
 * shape, the movement is the "now".
 */
export function MouthFace({
  mouth,
  speaking,
  onTap,
  label,
}: {
  mouth: MouthId;
  speaking: boolean;
  onTap?: () => void;
  label?: string;
}) {
  const face = (
    <div className="efh-mouth" data-speaking={speaking ? "1" : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element -- twelve tiny
          local PNGs swapped mid-word; next/image would only add latency */}
      <img src={mouthSrc(mouth)} alt="" draggable={false} />
    </div>
  );
  if (!onTap) return face;
  return (
    <button type="button" onClick={onTap} aria-label={label ?? "השמע את הצליל"} className="rounded-full">
      {face}
    </button>
  );
}

/** A centred column that fills the step area — every intro screen sits on it. */
function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 py-2 text-center">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* letter-intro                                                          */
/* ------------------------------------------------------------------ */

/**
 * "זאת האות אֵיי, הצליל שלה הוא… אַ" — and nothing else.
 *
 * The line is one recorded take, Hebrew straight into the English sound, so
 * it sounds like one person talking. Its time mark says where the sound is,
 * which is when the mouth moves. Without that recording the screen plays the
 * sound clip on its own; the sentence is always on screen either way.
 */
export function LetterIntroView({ step, onAdvance }: StepRenderProps & { step: LetterIntroStep }) {
  const data = getLetter(step.letter);
  const mouth = letterMouth(step.letter) ?? "aei";
  const [speaking, setSpeaking] = useState(false);
  const [heard, setHeard] = useState(false);
  // Only the latest playback may touch the screen: a replay tapped mid-line
  // must not have the old one's ending switch the mouth off under it.
  const run = useRef(0);

  const playSound = useCallback(async () => {
    const mine = ++run.current;
    await speakLine(letterSoundLineId(step.letter), {
      fallback: { text: data?.soundSpeak ?? step.letter, rate: 0.6 },
      onStart: () => mine === run.current && setSpeaking(true),
    });
    if (mine === run.current) setSpeaking(false);
  }, [step.letter, data?.soundSpeak]);

  const playIntro = useCallback(async () => {
    const mine = ++run.current;
    await loadVoiceManifest();
    const id = letterIntroLineId(step.letter);
    if (isRecorded(id) && lineMarks(id)) {
      await followLine(id, (i) => mine === run.current && setSpeaking(i === 0));
      if (mine === run.current) setSpeaking(false);
    } else {
      if (mine !== run.current) return;
      await playSound();
    }
    setHeard(true);
  }, [step.letter, playSound]);

  useEffect(() => {
    setHeard(false);
    const t = setTimeout(() => void playIntro(), 350);
    return () => {
      clearTimeout(t);
      stopSpeech();
      setSpeaking(false);
    };
  }, [playIntro]);

  return (
    <Centered>
      <GiantLetter>
        {step.letter}
        <span className="opacity-40"> {data?.lower}</span>
      </GiantLetter>
      <MouthFace mouth={mouth} speaking={speaking} onTap={() => void playSound()} />
      {/* Two lines, broken where the voice pauses — never the sound alone on a line. */}
      <p className="max-w-md text-3xl font-bold leading-relaxed">
        <span className="block">
          זאת האות <span className="font-black">{data?.nameHe}</span>,
        </span>
        <span className="block whitespace-nowrap">
          הצליל שלה הוא <span className="efh-tint-ink font-black">{data?.soundHe}</span>
        </span>
      </p>
      <div className="flex w-full max-w-sm flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => void playIntro()}
          aria-label="השמע שוב"
          className="grid h-16 w-16 place-items-center rounded-full border-[3px] border-brand-soft bg-card text-3xl"
        >
          <span aria-hidden>🔊</span>
        </button>
        <BigButton icon="👉" onClick={onAdvance} className={heard ? "" : "opacity-70"}>
          הבנתי, ממשיכים
        </BigButton>
      </div>
    </Centered>
  );
}

/* ------------------------------------------------------------------ */
/* word-intro                                                            */
/* ------------------------------------------------------------------ */

/** Which tiles are lit right now: one sound's letters, or the whole word. */
type Lit = { kind: "none" } | { kind: "seg"; seg: number } | { kind: "word" };

/**
 * A NEW WORD, HEARD BEFORE IT IS TYPED.
 *
 * The word is spelled out in tiles. It is sounded out twice — each sound
 * playing while the letters that make it are lit, and the mouth showing the
 * shape for it — and only then said whole.
 *
 * The sound-out is one recorded take with a time mark per sound, so it has a
 * teacher's rhythm and melody rather than a list's. If that recording is
 * missing, the screen builds the same thing from the separate sound clips,
 * with the same generous pauses.
 */
export function WordIntroView({ step, onAdvance }: StepRenderProps & { step: WordIntroStep }) {
  const letters = useMemo(() => step.word.split(""), [step.word]);
  const segments = useMemo(() => segmentsFor(step.word), [step.word]);
  /** The segments that make a sound, in order — what each mark points at. */
  const voiced = useMemo(() => segments.filter((s) => s.ph), [segments]);
  const [lit, setLit] = useState<Lit>({ kind: "none" });
  const [mouth, setMouth] = useState<MouthId>("bmp");
  const [speaking, setSpeaking] = useState(false);
  const [heard, setHeard] = useState(false);
  const wordTimer = useRef<number | null>(null);
  // Only the latest playback may touch the screen (see LetterIntroView).
  const run = useRef(0);

  const stopMouthWalk = () => {
    if (wordTimer.current !== null) window.clearInterval(wordTimer.current);
    wordTimer.current = null;
  };

  /** During the whole word, the mouth walks through the word's shapes. */
  const walkMouth = useCallback(
    (ms: number) => {
      stopMouthWalk();
      const shapes = voiced.map((s) => PHONEMES[s.ph!].mouth);
      let i = 0;
      setMouth(shapes[0] ?? "aei");
      wordTimer.current = window.setInterval(() => {
        i += 1;
        if (i >= shapes.length) {
          stopMouthWalk();
          return;
        }
        setMouth(shapes[i]!);
      }, Math.max(90, ms / Math.max(1, shapes.length)));
    },
    [voiced],
  );

  const showSeg = useCallback(
    (k: number) => {
      const seg = voiced[k];
      if (!seg?.ph) return;
      setLit({ kind: "seg", seg: segments.indexOf(seg) });
      setMouth(PHONEMES[seg.ph].mouth);
      setSpeaking(true);
    },
    [voiced, segments],
  );

  const quiet = useCallback(() => {
    setLit({ kind: "none" });
    setSpeaking(false);
  }, []);

  const play = useCallback(async () => {
    const mine = ++run.current;
    stopMouthWalk();
    await loadVoiceManifest();
    if (mine !== run.current) return;
    const k = voiced.length;
    const id = soundoutLineId(step.word);
    const marks = lineMarks(id);
    if (isRecorded(id) && marks && marks.length === 2 * k + 1) {
      const [ws, we] = marks[2 * k]!;
      await followLine(id, (i) => {
        if (mine !== run.current) return;
        if (i < 0) return quiet();
        if (i < 2 * k) return showSeg(i % k);
        setLit({ kind: "word" });
        setSpeaking(true);
        walkMouth(we - ws);
      });
    } else {
      // The same shape from separate clips: slow pass, second pass, word.
      const pass = (gap: number) =>
        voiced.map((seg, j) => ({
          lineId: phonemeLineId(seg.ph!),
          fallback: { text: PHONEMES[seg.ph!].as, rate: 0.6 },
          pauseMs: j === 0 ? 0 : gap,
          onStart: () => mine === run.current && showSeg(j),
          onEnd: () => mine === run.current && quiet(),
        }));
      await playSequence([
        ...pass(600),
        ...pass(600).map((s, j) => (j === 0 ? { ...s, pauseMs: 1100 } : s)),
        {
          lineId: wordLineId(step.word),
          fallback: { text: step.word.toLowerCase(), rate: 0.7 },
          pauseMs: 1100,
          onStart: () => {
            if (mine !== run.current) return;
            setLit({ kind: "word" });
            setSpeaking(true);
            walkMouth(700);
          },
        },
      ]);
    }
    if (mine !== run.current) return;
    stopMouthWalk();
    setSpeaking(false);
    setLit({ kind: "word" });
    setHeard(true);
  }, [voiced, step.word, showSeg, quiet, walkMouth]);

  useEffect(() => {
    setHeard(false);
    setLit({ kind: "none" });
    setMouth(voiced[0]?.ph ? PHONEMES[voiced[0].ph].mouth : "bmp");
    const t = setTimeout(() => void play(), 500);
    return () => {
      clearTimeout(t);
      stopSpeech();
      stopMouthWalk();
    };
  }, [play, voiced]);

  const litSeg = lit.kind === "seg" ? segments[lit.seg] : undefined;

  return (
    <Centered>
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-5xl">
          {step.emoji}
        </span>
        <p className="text-3xl font-bold">{step.he}</p>
      </div>

      <div
        className="efh-tiles ltr flex flex-wrap justify-center gap-2"
        style={{ ["--efh-letters" as string]: String(letters.length) }}
        aria-label={step.word}
      >
        {letters.map((l, i) => {
          const seg = segments.find((s) => i >= s.start && i < s.start + s.letters.length);
          const on =
            lit.kind === "word" ||
            (litSeg !== undefined && i >= litSeg.start && i < litSeg.start + litSeg.letters.length);
          return (
            <div
              key={`${l}-${i}`}
              className="efh-tile"
              data-lit={on && lit.kind === "seg" ? "1" : undefined}
              data-whole={on && lit.kind === "word" ? "1" : undefined}
              data-silent={seg && !seg.ph ? "1" : undefined}
            >
              {l}
            </div>
          );
        })}
      </div>

      <MouthFace mouth={mouth} speaking={speaking} />

      <div className="flex w-full max-w-sm flex-col items-center gap-3">
        <button
          type="button"
          onClick={() => void play()}
          aria-label="עוד פעם"
          className="grid h-16 w-16 place-items-center rounded-full border-[3px] border-brand-soft bg-card text-3xl"
        >
          <span aria-hidden>🔁</span>
        </button>
        <BigButton icon="👉" onClick={onAdvance} disabled={!heard}>
          עכשיו מקלידים
        </BigButton>
      </div>
    </Centered>
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
/* letter-sound, mode "sound" — four sounds to listen to, then choose    */
/* ------------------------------------------------------------------ */

const CHOICE_MARKS = ["●", "▲", "■", "★"] as const;

/**
 * WHICH SOUND DOES THIS LETTER MAKE?
 *
 * The four options are sounds, not writing: each is a speaker the child can
 * tap as often as they like to hear it. Tapping only listens and selects.
 * Nothing is graded until they press the button underneath — so listening to
 * all four is free, and the answer is a decision, not a reflex.
 *
 * Nothing plays on its own when the screen opens: the old screen played the
 * letter's sound first, which answered its own question.
 */
export function SoundChoiceView({
  step,
  onAnswer,
  locked,
}: StepRenderProps & { step: LetterSoundStep }) {
  const data = getLetter(step.letter);
  const [picked, setPicked] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);

  useEffect(() => {
    setPicked(null);
    setPlaying(null);
    setWrong([]);
    setSolved(false);
    return () => stopSpeech();
  }, [step.id]);

  const listen = async (letter: string) => {
    if (solved) return;
    setPicked(letter);
    setPlaying(letter);
    await speakLine(letterSoundLineId(letter), {
      fallback: { text: getLetter(letter)?.soundSpeak ?? letter, rate: 0.6 },
    });
    setPlaying((p) => (p === letter ? null : p));
  };

  const submit = () => {
    if (!picked || locked || solved) return;
    stopSpeech();
    const correct = picked === step.answer;
    playSfx(correct ? "correct" : "wrong");
    if (correct) setSolved(true);
    else {
      setWrong((w) => (w.includes(picked) ? w : [...w, picked]));
      setPicked(null);
    }
    onAnswer(correct);
  };

  // When the player gives up on the step (too many tries), show the answer.
  const reveal = locked && !solved;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
      <Card className="flex w-full flex-col items-center gap-2">
        <GiantLetter>
          {step.letter}
          <span className="opacity-40"> {data?.lower}</span>
        </GiantLetter>
        <p className="text-2xl font-bold">{step.promptHe}</p>
        <p className="text-lg text-ink-soft">
          <span aria-hidden>👂 </span>
          לחצו על כל רמקול כדי לשמוע, ואז בחרו
        </p>
      </Card>

      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        {step.options.map((letter, i) => {
          const isWrong = wrong.includes(letter);
          const isRight = (solved || reveal) && letter === step.answer;
          return (
            <button
              key={letter}
              type="button"
              disabled={locked || isWrong || solved}
              onClick={() => void listen(letter)}
              aria-label={`צליל ${i + 1}`}
              aria-pressed={picked === letter}
              className="efh-sound-choice"
              data-picked={picked === letter ? "1" : undefined}
              data-playing={playing === letter ? "1" : undefined}
              data-right={isRight ? "1" : undefined}
              data-wrong={isWrong ? "1" : undefined}
            >
              <span aria-hidden className="text-4xl">
                {isRight ? "✓" : isWrong ? "✕" : "🔊"}
              </span>
              <span aria-hidden className="text-xl font-black text-ink-soft">
                {CHOICE_MARKS[i]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="w-full max-w-md">
        <BigButton icon="✓" onClick={submit} disabled={!picked || locked || solved}>
          {picked ? `זה הצליל! ${CHOICE_MARKS[step.options.indexOf(picked)] ?? ""}` : "בחרו צליל"}
        </BigButton>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* letter-sound, mode "name"                                             */
/* ------------------------------------------------------------------ */

export function LetterSoundView(props: StepRenderProps & { step: LetterSoundStep }) {
  if (props.step.mode === "sound") return <SoundChoiceView {...props} />;
  return <LetterNameView {...props} />;
}

function LetterNameView({
  step,
  onAnswer,
  locked,
}: StepRenderProps & { step: LetterSoundStep }) {
  const data = getLetter(step.letter);

  const play = useCallback(() => {
    sayLetterName(step.letter);
  }, [step.letter]);

  useEffect(() => {
    // Auto-play once per step: the name IS the question.
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
      // Every English letter pressed says its sound — right key or not.
      if (activeLang === "en" && code.startsWith("Key")) soundTyped(code, null, 0);
      if (code === step.code) {
        setSolved(true);
        // A letter's sound IS the confirmation; the chime is for keys that
        // have none (digits, symbols, the Hebrew layout).
        if (!(activeLang === "en" && code.startsWith("Key"))) playSfx("correct");
        onAnswer(true);
      } else {
        playSfx("wrong");
        onAnswer(false);
      }
    },
    [locked, solved, step.code, step.lang, onAnswer],
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
        soundTyped(code, step.word, filled);
        setMissHere(0);
        onAnswer(true);
        const next = filled + 1;
        setFilled(next);
        if (next >= letters.length) {
          doneRef.current = true;
          setDone(true);
          playSfx("celebrate");
          // The last letter's sound finishes first, then the word, whole.
          void playSequence([
            {
              lineId: wordLineId(step.word),
              fallback: { text: step.word.toLowerCase(), rate: 0.7 },
              pauseMs: 650,
            },
          ]);
        }
      } else {
        soundTyped(code, null, 0);
        playSfx("wrong");
        setMissHere((n) => n + 1);
        onAnswer(false);
      }
    },
    [locked, targetCode, letters.length, onAnswer, step.word, filled],
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
          onClick={() => {
            const ph = target ? phonemeOnType(step.word, filled) : null;
            if (ph) sayPhoneme(ph);
            else if (target) sayLetterName(target);
            else sayWord(step.word);
          }}
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
        // Which word of the sentence this letter belongs to, and where in it.
        const before = step.sentence.slice(0, filled);
        const wordStart = before.lastIndexOf(" ") + 1;
        const word = step.sentence.slice(wordStart).split(" ")[0] ?? "";
        soundTyped(code, code === "Space" ? null : word, filled - wordStart);
        setMissHere(0);
        onAnswer(true);
        const next = filled + 1;
        setFilled(next);
        if (next >= tokens.length) {
          doneRef.current = true;
          setDone(true);
          playSfx("celebrate");
          void playSequence([
            {
              lineId: sentenceLineId(step.sentence),
              fallback: { text: step.sentence.toLowerCase(), rate: 0.65 },
              pauseMs: 650,
            },
          ]);
        }
      } else {
        if (code.startsWith("Key")) soundTyped(code, null, 0);
        playSfx("wrong");
        setMissHere((n) => n + 1);
        onAnswer(false);
      }
    },
    [locked, targetCode, tokens.length, onAnswer, step.sentence, filled],
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
