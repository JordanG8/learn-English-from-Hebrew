"use client";

/**
 * SPEAKING PRACTICE — the first screen in this app that listens.
 *
 * Everything else here checks what a child RECOGNISES: they see a letter and
 * pick its sound, they hear a word and build it from keys. That is the honest
 * half of learning a language and it was, until now, the whole app. This
 * screen is the other half: the child says an English word out loud and finds
 * out whether it came out as that word.
 *
 * THE SHAPE OF ONE TURN, and why it is that shape:
 *
 *   hear it  →  say it  →  see what the app heard  →  again, or next
 *
 * The middle arrow is the entire feature. A child practising pronunciation
 * with nobody listening has no idea whether they are right, and a parent who
 * does not speak English cannot tell them. Showing the transcript — the actual
 * English word the model heard — is worth more than any score, because a child
 * who says "sit" and sees `seat` has learned the exact thing that went wrong,
 * in the one channel that cannot be faked.
 *
 * THREE RULES THIS SCREEN HOLDS TO
 * --------------------------------
 *  1. THE MODEL IS NEVER THE AUTHORITY. A phone microphone in a classroom
 *     mishears. So there is no wrong, only "we heard something else" — see
 *     lib/voice/pronounce.ts for the three verdicts and why the middle one
 *     exists. Nothing on this screen ever says the child is wrong.
 *  2. IT DOES NOT TOUCH MASTERY. Nothing here writes to Progress or grades a
 *     skill. lib/srs.ts decides what a child has learned from evidence it can
 *     trust, and a noisy signal graded into that spine would corrupt the one
 *     number the app is careful about. Practice here is practice, and the
 *     session counter below is deliberately forgotten when the screen closes.
 *  3. NOTHING IS KEPT. The take goes up, is transcribed, and is gone. See
 *     lib/voice/listen.ts.
 *
 * A child who cannot get the microphone open (denied permission, a locked-down
 * school device) is not stuck: the screen says so in Hebrew, and the word, its
 * picture and its recorded pronunciation still work. Listening is the upgrade,
 * not the price of entry.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProgress } from "@/lib/progress-context";
import { WORDS_BY_DIFFICULTY } from "@/lib/curriculum/words";
import type { WordData } from "@/lib/curriculum/contract";
import { playSfx, primeAudio, sayWord, stopSpeech } from "@/lib/audio";
import { encouragement, praise } from "@/lib/reward";
import { ScreenHeader } from "@/components/ui/kit";
import { useRecorder } from "@/components/studio/useRecorder";
import type { Verdict } from "@/lib/voice/pronounce";

/**
 * A take stops itself. A seven-year-old will not reliably tap "stop", and a
 * recording that runs until they do is a recording of the room. Four seconds
 * is comfortably more than any word in the bank takes to say, including a
 * false start.
 */
const TAKE_MS = 4_000;

type Phase = "idle" | "recording" | "checking" | "answered";

interface Answer {
  verdict: Verdict;
  heard: string;
}

/* ------------------------------------------------------------------ */
/* Which words to practise                                             */
/* ------------------------------------------------------------------ */

/**
 * The words this child has actually built, in teaching order — practising the
 * pronunciation of a word they have never met is a vocabulary test wearing a
 * microphone. A child who has built nothing yet gets the tier-1 words, so the
 * screen is never empty and never a wall of unknown English.
 */
function wordsFor(known: readonly string[]): readonly WordData[] {
  // WORDS_BY_DIFFICULTY is the running order of the word phase itself, so
  // practice walks the same ramp the lessons do rather than a second one of
  // its own invention.
  const set = new Set(known.map((w) => w.toUpperCase()));
  const mine = WORDS_BY_DIFFICULTY.filter((w) => set.has(w.word.toUpperCase()));
  return mine.length >= 3
    ? mine
    : WORDS_BY_DIFFICULTY.filter((w) => w.tier === 1);
}

/* ------------------------------------------------------------------ */

export function SpeakPractice() {
  const router = useRouter();
  const { progress, ready } = useProgress();
  const recorder = useRecorder();

  const words = useMemo(
    () => wordsFor(ready ? progress.knownWords : []),
    [ready, progress.knownWords],
  );

  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [problemHe, setProblemHe] = useState<string | null>(null);
  /** Session only, and gone on unmount. See rule 2 in the file comment. */
  const [said, setSaid] = useState(0);
  const [tries, setTries] = useState(0);

  const word = words[Math.min(index, words.length - 1)];
  const autoStopRef = useRef<number | null>(null);

  // Audio never outlives its screen — the same rule every other screen holds.
  useEffect(() => () => stopSpeech(), []);

  const clearAutoStop = () => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  };

  const check = useCallback(
    async (blob: Blob, target: string) => {
      setPhase("checking");
      try {
        const res = await fetch(
          `/api/voice/check?word=${encodeURIComponent(target)}`,
          {
            method: "POST",
            headers: { "content-type": blob.type || "audio/webm" },
            body: blob,
          },
        );
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; verdict?: Verdict; heard?: string; messageHe?: string }
          | null;

        if (!res.ok || !json?.ok || !json.verdict) {
          setProblemHe(json?.messageHe ?? "לא הצלחנו להאזין. נסו שוב.");
          setPhase("idle");
          return;
        }

        setAnswer({ verdict: json.verdict, heard: json.heard ?? "" });
        setPhase("answered");
        setTries((n) => n + 1);
        if (json.verdict === "match") {
          setSaid((n) => n + 1);
          playSfx("correct");
        } else if (json.verdict === "near") {
          playSfx("tap");
        } else {
          // Soft and low, never a buzzer — the same sound the lessons use for
          // "try again", because that is what this is.
          playSfx("wrong");
        }
      } catch {
        setProblemHe("אין חיבור לרשת. נסו שוב.");
        setPhase("idle");
      }
    },
    [],
  );

  const finishTake = useCallback(async () => {
    clearAutoStop();
    const take = await recorder.stop();
    if (!take) {
      setPhase("idle");
      setProblemHe("לא שמענו כלום. נסו שוב, קרוב יותר למיקרופון.");
      return;
    }
    await check(take.blob, word.word);
  }, [recorder, check, word]);

  const startTake = useCallback(async () => {
    primeAudio();
    stopSpeech();
    setProblemHe(null);
    setAnswer(null);
    await recorder.start();
    setPhase("recording");
    autoStopRef.current = window.setTimeout(() => void finishTake(), TAKE_MS);
  }, [recorder, finishTake]);

  const next = useCallback(() => {
    clearAutoStop();
    stopSpeech();
    setAnswer(null);
    setProblemHe(null);
    setPhase("idle");
    setIndex((i) => (i + 1) % words.length);
  }, [words.length]);

  useEffect(() => clearAutoStop, []);

  if (!word) return null;

  const recording = phase === "recording";
  const checking = phase === "checking";
  const blocked = !recorder.supported
    ? "המכשיר הזה לא יודע להקליט. אפשר עדיין לשמוע את המילה."
    : recorder.error;

  return (
    <main className="flex min-h-dvh flex-col">
      <ScreenHeader
        title="מדברים אנגלית"
        onBack={() => router.push("/map")}
        right={
          tries > 0 ? (
            <span
              className="flex h-16 items-center gap-1 px-1 text-lg font-black"
              aria-label={`${said} מתוך ${tries} נאמרו נכון`}
            >
              <span aria-hidden>🗣️</span>
              <span className="ltr">
                {said}/{tries}
              </span>
            </span>
          ) : null
        }
      />

      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-5">
        {/* THE WORD. Picture first — the emoji IS the meaning (words.ts). */}
        <div className="flex flex-col items-center gap-1">
          <span aria-hidden className="text-8xl leading-none">
            {word.emoji}
          </span>
          <p className="ltr text-center text-6xl font-black tracking-wide">
            {word.word.toLowerCase()}
          </p>
          <p className="text-center text-2xl text-ink-soft">{word.he}</p>
        </div>

        {/* HEAR IT. Secondary, always available, never the thing you must do
            first — a child who already knows the word should not be made to
            sit through it. */}
        <button
          type="button"
          disabled={recording || checking}
          onClick={() => {
            primeAudio();
            sayWord(word.word);
          }}
          className="min-h-16 rounded-full border-[3px] border-brand-soft bg-card px-6 text-xl font-bold disabled:opacity-40"
        >
          <span aria-hidden>🔊 </span>שמעו אותה
        </button>

        {/* THE ANSWER. Text and icon and colour, never colour alone (rule 3). */}
        <div className="min-h-28 w-full max-w-md" aria-live="polite">
          {problemHe ? (
            <p className="text-center text-xl font-bold text-ink-soft">
              <span aria-hidden>⚠️ </span>
              {problemHe}
            </p>
          ) : answer ? (
            <div className="flex flex-col items-center gap-2">
              <p className="text-center text-2xl font-black">
                {answer.verdict === "match" ? (
                  <span className="text-go">
                    <span aria-hidden>✅ </span>
                    {praise(index)}
                  </span>
                ) : answer.verdict === "near" ? (
                  <span className="text-ink">
                    <span aria-hidden>🟡 </span>כמעט! עוד פעם אחת
                  </span>
                ) : (
                  <span className="text-ink">
                    <span aria-hidden>👂 </span>
                    {encouragement(index)}
                  </span>
                )}
              </p>
              {/* WHAT WE HEARD — the part that actually teaches. Never shown
                  for a match: there is nothing to compare, and the word is
                  already on the screen above. */}
              {answer.verdict !== "match" ? (
                <p className="text-center text-lg text-ink-soft">
                  שמענו:{" "}
                  <span className="ltr font-black text-ink">
                    {answer.heard || "— כלום —"}
                  </span>
                </p>
              ) : null}
            </div>
          ) : recording ? (
            <p className="text-center text-2xl font-black">
              <span aria-hidden>🔴 </span>מקשיבים…
            </p>
          ) : checking ? (
            <p className="text-center text-2xl font-black text-ink-soft">
              <span aria-hidden>⏳ </span>רגע…
            </p>
          ) : blocked ? (
            <p className="text-center text-lg font-bold text-ink-soft">
              <span aria-hidden>🎤 </span>
              {blocked}
            </p>
          ) : (
            <p className="text-center text-xl text-ink-soft">
              לחצו על המיקרופון ואמרו את המילה
            </p>
          )}
        </div>
      </div>

      {/* THE ONE ACTION, at thumb height. It is the microphone until there is
          an answer, and then it is "the next word" — one button, one meaning
          at a time, never two primaries competing. */}
      <div className="flex flex-col items-center gap-3 px-5 pb-6">
        {phase === "answered" ? (
          <>
            <button
              type="button"
              onClick={() => void startTake()}
              disabled={Boolean(blocked)}
              className="btn-primary flex w-full items-center justify-center gap-3 disabled:opacity-40"
            >
              <span aria-hidden className="text-3xl leading-none">
                🎤
              </span>
              <span>עוד פעם</span>
            </button>
            <button
              type="button"
              onClick={next}
              className="min-h-16 w-full rounded-[var(--radius-kid)] border-[3px] border-brand-soft bg-card text-xl font-bold"
            >
              <span aria-hidden>➡️ </span>מילה הבאה
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => void (recording ? finishTake() : startTake())}
            disabled={Boolean(blocked) || checking}
            aria-label={recording ? "סיימתי" : "אמרו את המילה"}
            className="grid h-36 w-36 place-items-center rounded-full text-xl font-black text-white shadow-[0_6px_0_rgba(0,0,0,0.18)] transition-transform active:translate-y-1 disabled:opacity-40"
            style={{
              background: recording ? "var(--color-stop)" : "var(--color-go)",
            }}
          >
            <span className="flex flex-col items-center gap-1">
              <span aria-hidden className="text-5xl">
                {recording ? "⏹" : "🎤"}
              </span>
              <span>{recording ? "סיימתי" : "דברו"}</span>
            </span>
          </button>
        )}
      </div>
    </main>
  );
}
