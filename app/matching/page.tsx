"use client";
import Link from "next/link";
import { useState } from "react";
import { LetterMatchView } from "@/components/lesson/LetterMatchView";
import { useProgress } from "@/lib/progress-context";
import { introducedLetters, matchingStep } from "@/lib/curriculum/matching";
import { useGarden } from "@/lib/garden/use-garden";
import { awardCourseAnswer, importCourseStars } from "@/lib/garden/progress";

export default function MatchingPage() {
  const {progress,ready,attempt}=useProgress();
  const garden=useGarden();
  const [round,setRound]=useState(0);
  const [assisted,setAssisted]=useState(false);
  const letters=introducedLetters(progress);
  const step=matchingStep(letters,`practice-${round}`,round%Math.max(1,letters.length));
  if(!ready || !garden.ready)return <p className="p-8 text-center">רגע…</p>;
  return <main className="min-h-dvh p-3 sm:p-6"><header className="mx-auto mb-5 flex max-w-4xl items-center justify-between"><Link className="min-h-14 rounded-2xl border-2 bg-white p-3 text-lg" href="/map">→ למסלול</Link><h1 className="text-2xl font-bold">מחברים אות, שם וצליל</h1></header>{step ? <LetterMatchView key={round} step={step} forceHint={assisted} locked={false} onAnswer={correct=>{
    if(!correct){setAssisted(true);return;}
    step.letters.forEach(letter=>{attempt(`letter-name:${letter}`,{correct:true,hinted:assisted});attempt(`letter-sound:${letter}`,{correct:true,hinted:assisted});});
    garden.update(p=>awardCourseAnswer(importCourseStars(p,progress.stars),"matching",`triple-${[...step.letters].sort().join("")}`));
  }} onAdvance={()=>{setRound(r=>r+1);setAssisted(false);}}/> : <section className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center"><p className="mb-6 text-2xl">נכיר קודם שלוש אותיות במסלול. אחר כך נחבר רק אותיות שכבר למדנו.</p><Link className="inline-block rounded-2xl bg-brand p-4 text-xl text-white" href="/map">ממשיכים ללמוד ←</Link></section>}</main>;
}
