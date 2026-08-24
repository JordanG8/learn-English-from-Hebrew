"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useProgress } from "@/lib/progress-context";
import { encouragement, praise, starsFor, type Stars } from "@/lib/reward";
import { playSfx, primeAudio, sayLetterSound, sayWord, stopSpeech } from "@/lib/audio";
import { LETTER_GROVE_SLICE } from "@/lib/game-world";
import type { GameEvent } from "@/lib/game-events";
import type { LetterGroveSceneCue } from "@/lib/letter-grove-cutscene";
import {
  LETTER_GROVE_RUNE_LETTERS,
  LETTER_GROVE_SPELL_ROUNDS,
  revealedSpellRecipe,
} from "@/lib/letter-grove-spells";
import { wordSkill } from "@/lib/skills";
import {
  freshAdventureProfile,
  loadAdventureProfile,
  saveAdventureProfile,
  withEncounterReward,
  type AdventureProfile,
} from "@/lib/inventory";
import { Confetti, StarRow } from "@/components/ui/kit";
import {
  LetterGroveSpellBoard,
  type SpellBoardReaction,
  type SpellBoardRecipe,
} from "./LetterGroveSpellBoard";
import { LetterGroveScene } from "./LetterGroveScene";
import { LetterGroveVoicedCutscene } from "./LetterGroveVoicedCutscene";

type Phase = "cutscene" | "playing" | "reward";

function queryForcesFlatScene(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("flat") === "1";
}

export function LetterGroveEncounter() {
  const { attempt, learnWord } = useProgress();
  const [phase, setPhase] = useState<Phase>("cutscene");
  const [spellIndex, setSpellIndex] = useState(0);
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
  const [cinematicCue, setCinematicCue] = useState<LetterGroveSceneCue | null>("grove-arrival");
  const [spellReaction, setSpellReaction] = useState<SpellBoardReaction | null>(null);
  const shownAt = useRef(Date.now());
  const inputLocked = useRef(false);
  const advanceTimer = useRef<number | null>(null);
  const spellReactionSequence = useRef(0);

  const spell = LETTER_GROVE_SPELL_ROUNDS[spellIndex] ?? LETTER_GROVE_SPELL_ROUNDS[0]!;
  const targetWord = spell.word.word;
  const revealedRecipe = revealedSpellRecipe(targetWord, spell.scaffold, attemptsHere);
  const revealedIndices = revealedRecipe.flatMap((letter, index) => (letter === "_" ? [] : [index]));
  const spellRecipe: SpellBoardRecipe = {
    visibility:
      revealedIndices.length === 0
        ? "slots"
        : revealedIndices.length === targetWord.length
          ? "word"
          : "partial",
    revealedIndices,
    labelHe: attemptsHere >= 3 ? "המתכון המלא" : "מתכון הקסם",
  };
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
    const timer = window.setTimeout(() => sayWord(targetWord), 280);
    return () => {
      window.clearTimeout(timer);
      stopSpeech();
    };
  }, [phase, spellIndex, targetWord]);

  const dispatchGameEvent = useCallback((event: GameEvent) => {
    setLastEvent(event);
    if (event.type === "spell.cast.correct") setChargedRunes(event.chargedRunes);
  }, []);

  const begin = useCallback(() => {
    primeAudio();
    stopSpeech();
    inputLocked.current = false;
    setSpellIndex(0);
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
    setSpellReaction(null);
    shownAt.current = Date.now();
    setPhase("playing");
  }, [existingReward]);

  const finish = useCallback(
    (finalWrongTotal: number, finalUnhintedCorrect: number) => {
      const stars = starsFor({
        completed: true,
        wrongAnswers: finalWrongTotal,
        unhintedCorrect: finalUnhintedCorrect,
        totalSteps: LETTER_GROVE_SPELL_ROUNDS.length,
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

  const castSpell = useCallback(
    (attemptedWord: string, runeIndices: readonly number[]) => {
      if (phase !== "playing" || locked || inputLocked.current) return;
      if (runeIndices.length !== targetWord.length) return;

      const normalizedWord = attemptedWord.toUpperCase();
      const correct = normalizedWord === targetWord;
      const skills = [wordSkill(targetWord)];
      const hinted = attemptsHere > 0;
      const latencyMs = attemptsHere === 0 ? Date.now() - shownAt.current : undefined;
      attempt(skills[0], { correct, hinted, latencyMs });

      spellReactionSequence.current += 1;
      if (!correct) {
        const nextAttempts = attemptsHere + 1;
        setAttemptsHere(nextAttempts);
        setWrongTotal((count) => count + 1);
        setFeedbackHe(
          nextAttempts >= 3
            ? "💡 עכשיו המתכון כמעט שלם. נסו לחבר את הרונות משמאל לימין."
            : `💛 ${encouragement(spellIndex + attemptsHere)}. שום דבר לא יורד — נסו דרך אחרת.`,
        );
        dispatchGameEvent({
          type: "spell.cast.incorrect",
          encounterId: LETTER_GROVE_SLICE.id,
          spellId: spell.id,
          attemptedWord: normalizedWord,
          targetWord,
          skills,
          attempts: nextAttempts,
        });
        setSpellReaction({ kind: "incorrect", sequence: spellReactionSequence.current });
        playSfx("wrong");
        return;
      }

      inputLocked.current = true;
      setLocked(true);
      const nextCharge = spellIndex + 1;
      const nextUnhinted = unhintedCorrect + (hinted ? 0 : 1);
      setUnhintedCorrect(nextUnhinted);
      learnWord(targetWord);
      setFeedbackHe(
        nextCharge === LETTER_GROVE_SPELL_ROUNDS.length
          ? "✨ הרונה האחרונה נדלקה — הערפל מתפזר!"
          : `✨ ${praise(spellIndex)} ${spell.successHe}`,
      );
      dispatchGameEvent({
        type: "spell.cast.correct",
        encounterId: LETTER_GROVE_SLICE.id,
        spellId: spell.id,
        word: targetWord,
        skills,
        chargedRunes: nextCharge,
      });
      setSpellReaction({ kind: "correct", sequence: spellReactionSequence.current });
      playSfx("correct");

      advanceTimer.current = window.setTimeout(() => {
        if (nextCharge >= LETTER_GROVE_SPELL_ROUNDS.length) {
          finish(wrongTotal, nextUnhinted);
          return;
        }
        setSpellIndex((index) => index + 1);
        setAttemptsHere(0);
        setFeedbackHe(null);
        setSpellReaction(null);
        setLocked(false);
        inputLocked.current = false;
        shownAt.current = Date.now();
      }, nextCharge >= LETTER_GROVE_SPELL_ROUNDS.length ? 900 : 720);
    },
    [attempt, attemptsHere, dispatchGameEvent, finish, learnWord, locked, phase, spell, spellIndex, targetWord, unhintedCorrect, wrongTotal],
  );

  const progressLabel = `${chargedRunes} מתוך ${LETTER_GROVE_SLICE.spellCount} רונות טעונות`;

  return (
    <main className="relative h-dvh min-h-[560px] overflow-hidden bg-[#10272f]" dir="rtl">
      <Confetti active={phase === "reward"} pieces={28} />
      <div className="pointer-events-none relative z-10 h-full w-full">
        {phase !== "cutscene" ? (
          <header className="absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-3 md:p-5">
            <Link href="/adventure" className="pointer-events-auto grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/20 bg-[#102631]/85 text-2xl text-white shadow-xl backdrop-blur-md transition hover:bg-[#183845] focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label="חזרה למסע">←</Link>
            <div className="absolute left-1/2 top-3 max-w-[42vw] -translate-x-1/2 rounded-2xl border border-white/20 bg-[#102631]/85 px-3 py-2 text-center text-white shadow-xl backdrop-blur-md md:top-5 md:px-6"><p className="hidden text-[10px] font-black uppercase tracking-[0.18em] text-[#b9a3ff] sm:block">חורשת האותיות · מסע 1</p><h1 className="truncate text-sm font-black sm:text-base md:text-xl">{phase === "reward" ? "החורשה ניצלה" : "ערפל הבלבול"}</h1></div>
            <div className="rounded-2xl border border-white/20 bg-[#102631]/85 p-2 shadow-xl backdrop-blur-md" aria-label={progressLabel}><div className="mb-1 flex items-center justify-between gap-2 px-1 text-[10px] font-black text-white/65"><span>כוח הקסם</span><span>{chargedRunes}/{LETTER_GROVE_SLICE.spellCount}</span></div><div className="flex gap-2 px-1 py-1" aria-hidden>{Array.from({ length: LETTER_GROVE_SLICE.spellCount }, (_, index) => <span key={index} className={`grid h-7 w-7 rotate-45 place-items-center rounded-md border-2 transition md:h-8 md:w-8 ${index < chargedRunes ? "border-[#efe4ff] bg-[#9d70ee] shadow-[0_0_18px_#cbb2ff]" : "border-white/35 bg-slate-700/65"}`}><span className="-rotate-45 text-xs font-black text-white">✦</span></span>)}</div></div>
          </header>
        ) : null}

        <LetterGroveScene chargedRunes={chargedRunes} complete={phase === "reward"} event={lastEvent} cinematicCue={cinematicCue} forceFlat={forceFlat} />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,22,28,0.28)_0%,transparent_25%,transparent_55%,rgba(5,18,25,0.48)_100%)]" aria-hidden />
        {phase === "cutscene" ? <LetterGroveVoicedCutscene onBeatChange={(beat) => setCinematicCue(beat.sceneCue)} onExit={begin} /> : null}

        {phase === "playing" ? (
          <section className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto max-h-[75dvh] max-w-6xl overflow-y-auto rounded-t-[1.75rem] border-t border-white/20 bg-[#0c202b]/94 p-3 text-white shadow-[0_-18px_60px_rgba(3,15,20,0.42)] backdrop-blur-xl sm:max-h-[68dvh] md:inset-x-4 md:bottom-4 md:max-h-[61dvh] md:rounded-[2rem] md:border md:p-5" aria-labelledby="grove-spell-title">
            <div className="flex items-center justify-between gap-3"><p className="rounded-full border border-[#cdb9ff]/30 bg-[#9d70ee]/20 px-3 py-1 text-sm font-black text-[#e7ddff]">לחש {spellIndex + 1} מתוך {LETTER_GROVE_SPELL_ROUNDS.length}</p><button type="button" onClick={() => sayWord(targetWord)} className="flex min-h-12 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 text-base font-black text-white transition hover:bg-white/15 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label={`השמיעו שוב את המילה ${targetWord}`}><span aria-hidden>🔊</span> שומעים שוב</button></div>
            <h2 id="grove-spell-title" className="mt-2 text-center text-xl font-black text-white md:text-3xl">{spellRecipe.visibility === "word" ? <>צרו את המילה <span dir="ltr" className="inline-block text-[#f7dc8b]">{targetWord}</span></> : <>איזו מילה אומרת <span className="text-[#f7dc8b]">{spell.word.he}</span>?</>} <span aria-hidden>{spell.word.emoji}</span></h2>
            <p className="mt-1 text-center text-sm font-semibold text-white/70">גררו קו בין הרונות לפי הסדר. כשהמילה שלמה, שחררו את הקו.</p>
            <LetterGroveSpellBoard key={spell.id} letters={LETTER_GROVE_RUNE_LETTERS} targetWord={targetWord} recipe={spellRecipe} assist={attemptsHere > 0 ? { enabled: true, messageHe: "הרונה הבאה מחכה לכם" } : false} reaction={spellReaction} disabled={locked} onRuneConnect={(letter) => sayLetterSound(letter)} onCast={castSpell} />
            <div className={`mt-3 min-h-10 rounded-2xl px-4 py-2 text-center text-sm font-bold md:text-base ${feedbackHe ? "bg-[#fff3b8] text-[#4e431f]" : "border border-white/10 bg-white/5 text-white/60"}`} role="status" aria-live="polite">{feedbackHe ?? "אפשר לגרור, ללחוץ על הרונות ואז על ‘להטיל לחש’, או להשתמש במקלדת."}</div>
          </section>
        ) : null}

        {phase === "reward" ? (
          <section className="pointer-events-auto absolute left-1/2 top-1/2 z-20 max-h-[calc(100dvh-7rem)] w-[min(40rem,calc(100%-1.5rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[1.75rem] border border-white/20 bg-[#102631]/95 p-5 text-center text-white shadow-[0_24px_80px_rgba(3,15,20,0.62)] backdrop-blur-xl md:p-7" aria-labelledby="grove-reward-title">
            <p className="text-sm font-black text-[#cdb9ff]">הערפל התפזר · פּוֹפּ חופשי!</p><h2 id="grove-reward-title" className="mt-1 text-3xl font-black md:text-4xl">הקסם שלכם שינה את החורשה</h2><div className="mt-3 flex justify-center"><StarRow earned={earnedStars} size={40} animate /></div>
            <div className="mx-auto mt-4 grid max-w-xl grid-cols-[auto_1fr] items-center gap-4 rounded-3xl border-4 border-[#d8c2ff] bg-[#f3ecff] p-4 text-right"><span className="grid h-20 w-20 place-items-center rounded-2xl bg-white text-5xl shadow-sm" aria-hidden>{LETTER_GROVE_SLICE.reward.emoji}</span><div><p className="text-sm font-black text-[#72559f]">{rewardWasOwnedAtStart ? "כבר שמור בתיק הגיבור" : "נוסף לתיק הגיבור"}</p><p className="text-xl font-black">{LETTER_GROVE_SLICE.reward.nameHe}</p><p className="mt-1 text-sm font-semibold text-ink-soft">השרביט נשמר גם כשיוצאים מהמשחק.</p></div></div>
            <div className="mx-auto mt-3 flex max-w-xl items-center gap-3 rounded-3xl border-2 border-[#b9dcc0] bg-[#edf9ef] p-4 text-right"><span className="text-4xl" aria-hidden>🌞</span><div><p className="text-sm font-black text-[#397347]">השער נפתח לפניכם</p><p className="text-lg font-black text-[#17252d]">ממשיכים אל שער השמש</p><p className="text-sm font-semibold text-ink-soft">האזור הבא נפתח כמקום חדש במסע.</p></div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2"><Link href="/adventure/sun-gate" className="btn-primary grid place-items-center focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand">🌞 ממשיכים בדרך</Link><button type="button" onClick={begin} className="btn-secondary focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand">↻ מטילים שוב</button></div><Link href="/map" className="mt-4 inline-flex min-h-12 items-center justify-center rounded-xl px-4 font-bold text-white/65 underline decoration-2 underline-offset-4 focus-visible:outline-4 focus-visible:outline-white">חזרה למסלול הלימוד</Link>
          </section>
        ) : null}
        <output className="sr-only" aria-live="polite">{lastEvent?.type ?? "encounter.ready"}</output>
      </div>
    </main>
  );
}
