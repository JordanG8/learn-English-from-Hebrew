"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LetterSoundStep } from "@/lib/types";
import { getLetter, soundStep, skillsForStep, TEACHING_ORDER } from "@/lib/curriculum";
import { useProgress } from "@/lib/progress-context";
import { encouragement, praise, starsFor, type Stars } from "@/lib/reward";
import {
  playSfx,
  primeAudio,
  sayLetterSound,
  stopSpeech,
} from "@/lib/audio";
import { LETTER_GROVE_SLICE } from "@/lib/game-world";
import type { GameEvent } from "@/lib/game-events";
import type { LetterGroveSceneCue } from "@/lib/letter-grove-cutscene";
import {
  freshAdventureProfile,
  loadAdventureProfile,
  saveAdventureProfile,
  withEncounterReward,
  type AdventureProfile,
} from "@/lib/inventory";
import { Confetti, StarRow } from "@/components/ui/kit";
import {
  LetterGroveHud3D,
  type SpellHudReaction,
} from "./LetterGroveHud3D";
import { LetterGroveScene } from "./LetterGroveScene";
import { LetterGroveVoicedCutscene } from "./LetterGroveVoicedCutscene";

type Phase = "cutscene" | "playing" | "reward";

interface EncounterQuestion {
  step: LetterSoundStep;
}

function requireLetter(letter: string) {
  const data = getLetter(letter);
  if (!data) throw new Error(`The Letter Grove slice requires ${letter} curriculum data.`);
  return data;
}

const QUESTION_LETTERS = ["S", "A", "T"].map(requireLetter);

const QUESTIONS: readonly EncounterQuestion[] = QUESTION_LETTERS.map((letter, index) => ({
  step: {
    ...(soundStep(letter, TEACHING_ORDER, 73 + index * 19) as LetterSoundStep),
    id: `grove-sound-${letter.letter}`,
  },
}));

function queryForcesFlatScene(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("flat") === "1";
}

export function LetterGroveEncounter() {
  const { attempt } = useProgress();
  const [phase, setPhase] = useState<Phase>("cutscene");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [chargedRunes, setChargedRunes] = useState(0);
  const [attemptsHere, setAttemptsHere] = useState(0);
  const [wrongTotal, setWrongTotal] = useState(0);
  const [unhintedCorrect, setUnhintedCorrect] = useState(0);
  const [feedbackHe, setFeedbackHe] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [earnedStars, setEarnedStars] = useState<Stars>(0);
  const [rewardWasOwnedAtStart, setRewardWasOwnedAtStart] = useState(false);
  const [profile, setProfile] = useState<AdventureProfile>(() => freshAdventureProfile());
  const [forceFlat, setForceFlat] = useState(false);
  const [lastEvent, setLastEvent] = useState<GameEvent | null>(null);
  const [cinematicCue, setCinematicCue] = useState<LetterGroveSceneCue | null>(
    "grove-arrival",
  );
  const [hoveredOption, setHoveredOption] = useState<number | null>(null);
  const [focusedOption, setFocusedOption] = useState<number | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [hudReaction, setHudReaction] = useState<SpellHudReaction | null>(null);
  const shownAt = useRef(Date.now());
  const inputLocked = useRef(false);
  const advanceTimer = useRef<number | null>(null);
  const hudReactionSequence = useRef(0);

  const question = QUESTIONS[questionIndex] ?? QUESTIONS[0]!;
  const assistActive = attemptsHere >= 2;
  const assistedOption = assistActive
    ? question.step.options.indexOf(question.step.answer)
    : null;
  const existingReward = profile.items.includes(LETTER_GROVE_SLICE.reward.id);

  useEffect(() => {
    setProfile(loadAdventureProfile());
    setForceFlat(queryForcesFlatScene());
    return () => {
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
      stopSpeech();
    };
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    shownAt.current = Date.now();
    const timer = window.setTimeout(() => sayLetterSound(question.step.letter), 280);
    return () => {
      window.clearTimeout(timer);
      stopSpeech();
    };
  }, [phase, questionIndex, question.step.letter]);

  const dispatchGameEvent = useCallback((event: GameEvent) => {
    setLastEvent(event);
    if (event.type === "answer.correct") {
      setChargedRunes(event.chargedRunes);
    }
  }, []);

  const begin = useCallback(() => {
    primeAudio();
    stopSpeech();
    inputLocked.current = false;
    setQuestionIndex(0);
    setChargedRunes(0);
    setAttemptsHere(0);
    setWrongTotal(0);
    setUnhintedCorrect(0);
    setFeedbackHe(null);
    setLocked(false);
    setEarnedStars(0);
    setRewardWasOwnedAtStart(existingReward);
    setLastEvent(null);
    setCinematicCue(null);
    setHoveredOption(null);
    setFocusedOption(null);
    setSelectedOption(null);
    setHudReaction(null);
    shownAt.current = Date.now();
    setPhase("playing");
  }, [existingReward]);

  const finish = useCallback(
    (finalWrongTotal: number, finalUnhintedCorrect: number) => {
      const stars = starsFor({
        completed: true,
        wrongAnswers: finalWrongTotal,
        unhintedCorrect: finalUnhintedCorrect,
        totalSteps: QUESTIONS.length,
      });
      const nextProfile = withEncounterReward(
        profile,
        LETTER_GROVE_SLICE.id,
        LETTER_GROVE_SLICE.reward.id,
        LETTER_GROVE_SLICE.nextEncounterId,
        stars,
      );
      saveAdventureProfile(nextProfile);
      setProfile(nextProfile);
      setEarnedStars(stars);
      dispatchGameEvent({
        type: "encounter.completed",
        encounterId: LETTER_GROVE_SLICE.id,
        rewardId: LETTER_GROVE_SLICE.reward.id,
        unlockedEncounterId: LETTER_GROVE_SLICE.nextEncounterId,
      });
      playSfx("celebrate");
      setPhase("reward");
      setLocked(false);
      inputLocked.current = false;
    },
    [dispatchGameEvent, profile],
  );

  const choose = useCallback(
    (option: string) => {
      if (phase !== "playing" || locked || inputLocked.current) return;

      const optionIndex = question.step.options.indexOf(option);
      const correct = option === question.step.answer;
      const skills = skillsForStep(question.step);
      const hinted = attemptsHere > 0;
      const latencyMs = attemptsHere === 0 ? Date.now() - shownAt.current : undefined;
      skills.forEach((skill) => attempt(skill, { correct, hinted, latencyMs }));

      if (!correct) {
        const nextAttempts = attemptsHere + 1;
        setAttemptsHere(nextAttempts);
        setWrongTotal((count) => count + 1);
        setFeedbackHe(
          nextAttempts >= 2
            ? `💡 הקשיבו שוב — סימנתי בעדינות את הצליל ${question.step.answer}.`
            : `💛 ${encouragement(questionIndex + attemptsHere)}. שום דבר לא יורד — רק מנסים שוב.`,
        );
        dispatchGameEvent({
          type: "answer.incorrect",
          encounterId: LETTER_GROVE_SLICE.id,
          questionId: question.step.id,
          skills,
          attempts: nextAttempts,
        });
        if (optionIndex >= 0) {
          hudReactionSequence.current += 1;
          setHudReaction({
            index: optionIndex,
            kind: "incorrect",
            sequence: hudReactionSequence.current,
          });
        }
        setSelectedOption(null);
        playSfx("wrong");
        return;
      }

      inputLocked.current = true;
      setLocked(true);
      const nextCharge = questionIndex + 1;
      const nextUnhinted = unhintedCorrect + (hinted ? 0 : 1);
      setUnhintedCorrect(nextUnhinted);
      setFeedbackHe(
        nextCharge === QUESTIONS.length
          ? "✨ הצליל הפעיל את הרונה האחרונה — הערפל מתפזר!"
          : `✨ ${praise(questionIndex)} הרונה נדלקה!`,
      );
      dispatchGameEvent({
        type: "answer.correct",
        encounterId: LETTER_GROVE_SLICE.id,
        questionId: question.step.id,
        skills,
        chargedRunes: nextCharge,
      });
      if (optionIndex >= 0) {
        hudReactionSequence.current += 1;
        setHudReaction({
          index: optionIndex,
          kind: "correct",
          sequence: hudReactionSequence.current,
        });
      }
      setSelectedOption(null);
      playSfx("correct");

      advanceTimer.current = window.setTimeout(() => {
        if (nextCharge >= QUESTIONS.length) {
          finish(wrongTotal, nextUnhinted);
          return;
        }
        setQuestionIndex((index) => index + 1);
        setAttemptsHere(0);
        setFeedbackHe(null);
        setHoveredOption(null);
        setFocusedOption(null);
        setSelectedOption(null);
        setHudReaction(null);
        setLocked(false);
        inputLocked.current = false;
        shownAt.current = Date.now();
      }, nextCharge >= QUESTIONS.length ? 900 : 720);
    },
    [
      phase,
      locked,
      question,
      attemptsHere,
      questionIndex,
      unhintedCorrect,
      wrongTotal,
      attempt,
      dispatchGameEvent,
      finish,
    ],
  );

  useEffect(() => {
    if (phase !== "playing") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const number = Number(event.key);
      if (Number.isInteger(number) && number >= 1 && number <= question.step.options.length) {
        event.preventDefault();
        const option = question.step.options[number - 1];
        if (option) choose(option);
      }
      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        sayLetterSound(question.step.letter);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, question, choose]);

  const progressLabel = `${chargedRunes} מתוך ${LETTER_GROVE_SLICE.questionCount} רונות טעונות`;

  return (
    <main className="relative h-dvh min-h-[560px] overflow-hidden bg-[#10272f]" dir="rtl">
      <Confetti active={phase === "reward"} pieces={28} />
      <div className="pointer-events-none relative z-10 h-full w-full">
        {phase !== "cutscene" ? (
          <header className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3 md:p-5">
          <div className="flex items-center gap-2">
            <Link
              href="/adventure"
              className="pointer-events-auto grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/20 bg-[#102631]/85 text-2xl text-white shadow-xl backdrop-blur-md transition hover:bg-[#183845] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label="חזרה לשביל ההרפתקה"
            >
              ←
            </Link>
            <div className="hidden items-center gap-2 rounded-2xl border border-white/20 bg-[#102631]/85 px-3 py-2 text-white shadow-xl backdrop-blur-md sm:flex">
              <span className="grid h-8 w-8 place-items-center rounded-[45%] bg-[#82c64d] font-black text-[#173321]" aria-hidden>
                •‿•
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-white/55">בן ברית</p>
                <p className="text-sm font-black">
                  פּוֹפּ · {phase === "reward" ? "חופשי!" : "צריך עזרה"}
                </p>
              </div>
            </div>
          </div>

          <div className="absolute left-1/2 top-3 max-w-[38vw] -translate-x-1/2 rounded-2xl border border-white/20 bg-[#102631]/85 px-3 py-2 text-center text-white shadow-xl backdrop-blur-md sm:max-w-none md:top-5 md:px-6">
            <p className="hidden text-[10px] font-black uppercase tracking-[0.18em] text-[#b9a3ff] sm:block">חורשת האותיות · משימה 1</p>
            <h1 className="truncate text-sm font-black sm:text-base md:text-xl">
              {phase === "reward" ? "החורשה ניצלה" : "ערפל הבלבול"}
            </h1>
          </div>

          <div className="rounded-2xl border border-white/20 bg-[#102631]/85 p-2 shadow-xl backdrop-blur-md" aria-label={progressLabel}>
            <div className="mb-1 flex items-center justify-between gap-2 px-1 text-[10px] font-black text-white/65">
              <span>כוח הקסם</span>
              <span>{chargedRunes}/{LETTER_GROVE_SLICE.questionCount}</span>
            </div>
            <div className="flex gap-2 px-1 py-1" aria-hidden>
              {Array.from({ length: LETTER_GROVE_SLICE.questionCount }, (_, index) => (
                <span
                  key={index}
                  className={`grid h-7 w-7 rotate-45 place-items-center rounded-md border-2 transition md:h-8 md:w-8 ${
                    index < chargedRunes
                      ? "border-[#efe4ff] bg-[#9d70ee] shadow-[0_0_18px_#cbb2ff]"
                      : "border-white/35 bg-slate-700/65"
                  }`}
                >
                  <span className="-rotate-45 text-xs font-black text-white">✦</span>
                </span>
              ))}
            </div>
          </div>
          </header>
        ) : null}

        <LetterGroveScene
          chargedRunes={chargedRunes}
          complete={phase === "reward"}
          event={lastEvent}
          cinematicCue={cinematicCue}
          forceFlat={forceFlat}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,22,28,0.28)_0%,transparent_25%,transparent_55%,rgba(5,18,25,0.48)_100%)]" aria-hidden />

        {phase === "cutscene" ? (
          <LetterGroveVoicedCutscene
            onBeatChange={(beat) => setCinematicCue(beat.sceneCue)}
            onExit={() => begin()}
          />
        ) : null}

        {phase === "playing" ? (
          <section className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto max-h-[58dvh] max-w-6xl overflow-y-auto rounded-t-[1.75rem] border-t border-white/20 bg-[#0c202b]/94 p-3 text-white shadow-[0_-18px_60px_rgba(3,15,20,0.42)] backdrop-blur-xl md:inset-x-4 md:bottom-4 md:rounded-[2rem] md:border md:p-5" aria-labelledby="grove-question">
            <div className="flex items-center justify-between gap-3">
              <p className="rounded-full border border-[#cdb9ff]/30 bg-[#9d70ee]/20 px-3 py-1 text-sm font-black text-[#e7ddff]">
                רונה {questionIndex + 1} מתוך {QUESTIONS.length}
              </p>
              <button
                type="button"
                onClick={() => sayLetterSound(question.step.letter)}
                className="flex min-h-12 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 text-base font-black text-white transition hover:bg-white/15 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white md:min-h-14 md:text-lg"
                aria-label={`השמיעו שוב את הצליל ${question.step.answer}`}
              >
                <span aria-hidden>🔊</span> שוב
              </button>
            </div>
            <h2 id="grove-question" className="mt-2 text-center text-xl font-black text-white md:text-3xl">
              {question.step.promptHe}
            </h2>
            <div className="relative mt-3 min-h-[12rem] overflow-hidden rounded-3xl border border-white/10 bg-[#071920]/48 md:min-h-[8.5rem]" role="group" aria-label="אפשרויות תשובה">
              <LetterGroveHud3D
                className="absolute inset-0 z-0"
                hoveredIndex={hoveredOption}
                focusedIndex={focusedOption}
                selectedIndex={selectedOption}
                assistedIndex={assistedOption}
                reaction={hudReaction}
                chargedRunes={chargedRunes}
                disabled={locked}
              />
              <div className="absolute inset-0 z-10 grid grid-cols-2 gap-2 p-2 pt-9 md:grid-cols-4 md:gap-3 md:p-3 md:pt-8">
                {question.step.options.map((option, index) => {
                  const assisted = assistActive && option === question.step.answer;
                  return (
                    <button
                      key={option}
                      type="button"
                      onPointerEnter={() => setHoveredOption(index)}
                      onPointerLeave={() => {
                        setHoveredOption((current) => (current === index ? null : current));
                        setSelectedOption((current) => (current === index ? null : current));
                      }}
                      onPointerDown={() => setSelectedOption(index)}
                      onPointerUp={() => setSelectedOption(null)}
                      onFocus={() => setFocusedOption(index)}
                      onBlur={() => setFocusedOption((current) => (current === index ? null : current))}
                      onClick={() => choose(option)}
                      disabled={locked}
                      className={`group relative min-h-16 overflow-hidden rounded-2xl border-2 bg-[radial-gradient(circle_at_50%_52%,rgba(255,255,255,.06),rgba(5,18,25,.72))] px-2 py-2 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.1),0_4px_14px_rgba(0,0,0,.16)] transition hover:-translate-y-0.5 hover:border-white/55 active:translate-y-0 disabled:cursor-default focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#f9da7d] md:min-h-20 ${
                        assisted
                          ? "border-[#cbb1ff] shadow-[inset_0_0_28px_rgba(157,112,238,.2),0_0_18px_rgba(203,177,255,.28)]"
                          : "border-white/20"
                      }`}
                      aria-label={`${index + 1}. ${option}`}
                    >
                      <span className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full border border-white/15 bg-[#071920]/80 text-xs font-black text-white/70" aria-hidden>
                        {index + 1}
                      </span>
                      <span className="relative z-10 px-3 py-1 text-3xl font-black text-white drop-shadow-[0_3px_5px_rgba(0,0,0,1)] md:text-4xl">
                        {option}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div
              className={`mt-3 min-h-10 rounded-2xl px-4 py-2 text-center text-sm font-bold md:text-base ${
                feedbackHe ? "bg-[#fff3b8] text-[#4e431f]" : "border border-white/10 bg-white/5 text-white/60"
              }`}
              role="status"
              aria-live="polite"
            >
              {feedbackHe ?? "בחרו תשובה כדי להפעיל את הקסם."}
            </div>
          </section>
        ) : null}

        {phase === "reward" ? (
          <section className="pointer-events-auto absolute left-1/2 top-1/2 z-20 max-h-[calc(100dvh-7rem)] w-[min(40rem,calc(100%-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[1.75rem] border border-white/20 bg-[#102631]/95 p-5 text-center text-white shadow-[0_24px_80px_rgba(3,15,20,0.62)] backdrop-blur-xl md:p-7" aria-labelledby="grove-reward-title">
            <p className="text-sm font-black text-[#cdb9ff]">הערפל התפזר · פּוֹפּ חופשי!</p>
            <h2 id="grove-reward-title" className="mt-1 text-3xl font-black md:text-4xl">
              הקסם שלכם שינה את החורשה
            </h2>
            <div className="mt-3 flex justify-center">
              <StarRow earned={earnedStars} size={40} animate />
            </div>
            <div className="mx-auto mt-4 grid max-w-xl grid-cols-[auto_1fr] items-center gap-4 rounded-3xl border-4 border-[#d8c2ff] bg-[#f3ecff] p-4 text-right">
              <span className="grid h-20 w-20 place-items-center rounded-2xl bg-white text-5xl shadow-sm" aria-hidden>
                {LETTER_GROVE_SLICE.reward.emoji}
              </span>
              <div>
                <p className="text-sm font-black text-[#72559f]">
                  {rewardWasOwnedAtStart ? "כבר שמור בתיק הגיבור" : "נוסף לתיק הגיבור"}
                </p>
                <p className="text-xl font-black">{LETTER_GROVE_SLICE.reward.nameHe}</p>
                <p className="mt-1 text-sm font-semibold text-ink-soft">
                  {rewardWasOwnedAtStart
                    ? "המשחק החוזר שומר את ציון הכוכבים הטוב ביותר."
                    : "השרביט נשמר גם כשיוצאים מהמשחק."}
                </p>
              </div>
            </div>
            <div className="mx-auto mt-3 flex max-w-xl items-center gap-3 rounded-3xl border-2 border-[#b9dcc0] bg-[#edf9ef] p-4 text-right">
              <span className="text-4xl" aria-hidden>
                🌞
              </span>
              <div>
                <p className="text-sm font-black text-[#397347]">נחשף על המפה</p>
                <p className="text-lg font-black text-[#17252d]">השלב הבא: שער השמש</p>
                <p className="text-sm font-semibold text-ink-soft">המשימה הבאה עדיין בבנייה.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Link href="/adventure" className="btn-primary grid place-items-center focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand">
                🌞 חזרה לשביל ההרפתקה
              </Link>
              <button
                type="button"
                onClick={begin}
                className="btn-secondary focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                ↻ משחקים שוב
              </button>
            </div>
            <Link href="/map" className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl px-4 font-bold text-white/65 underline decoration-2 underline-offset-4 focus-visible:outline-4 focus-visible:outline-white">
              חזרה למסלול הלימוד
            </Link>
          </section>
        ) : null}

        <output className="sr-only" aria-live="polite">
          {lastEvent?.type ?? "encounter.ready"}
        </output>
      </div>
    </main>
  );
}
