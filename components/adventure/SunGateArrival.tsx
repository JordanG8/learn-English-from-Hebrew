"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LetterGroveScene } from "./LetterGroveScene";

function queryForcesFlatScene(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("flat") === "1";
}

/** The next destination is a place, even before its playable encounter ships. */
export function SunGateArrival() {
  const [forceFlat, setForceFlat] = useState(false);

  useEffect(() => setForceFlat(queryForcesFlatScene()), []);

  return (
    <main className="relative h-dvh min-h-[560px] overflow-hidden bg-[#152e38]" dir="rtl">
      <LetterGroveScene
        chargedRunes={3}
        complete
        event={{
          type: "encounter.completed",
          encounterId: "letter-grove-first-rune",
          rewardId: "rune-wand",
          unlockedEncounterId: "letter-grove-sun-gate",
        }}
        cinematicCue="quest-promise"
        forceFlat={forceFlat}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_28%,rgba(255,230,123,.42),transparent_28%),linear-gradient(180deg,rgba(5,18,27,.08),rgba(4,17,24,.65))]" aria-hidden />
      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-3 text-white md:p-5">
        <Link href="/adventure/letter-grove" className="grid h-12 w-12 place-items-center rounded-2xl border border-white/25 bg-[#102631]/85 text-2xl shadow-xl backdrop-blur-md focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white" aria-label="חזרה לחורשת האותיות">←</Link>
        <div className="rounded-2xl border border-white/25 bg-[#102631]/85 px-5 py-2 text-center shadow-xl backdrop-blur-md"><p className="text-[10px] font-black tracking-[0.18em] text-[#ffe485]">מקום חדש במסע</p><h1 className="text-lg font-black md:text-2xl">שער השמש</h1></div>
        <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/25 bg-[#102631]/85 text-2xl shadow-xl backdrop-blur-md" aria-label="שרביט הרונות בתיק">🪄</span>
      </header>
      <section className="absolute inset-x-3 bottom-4 z-10 mx-auto max-w-xl rounded-[2rem] border border-[#ffeaa3]/45 bg-[#102631]/90 p-5 text-center text-white shadow-2xl backdrop-blur-xl md:bottom-7 md:p-7" aria-labelledby="sun-gate-title">
        <p className="text-4xl" aria-hidden>🌞</p>
        <h2 id="sun-gate-title" className="mt-1 text-3xl font-black">הגעתם לשער השמש!</h2>
        <p className="mt-2 font-semibold text-white/78">פּוֹפּ פתח את המעבר. כאן תתחיל המשימה הבאה עם מילים חדשות, יצורים חדשים וכוחות חדשים.</p>
        <p className="mt-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-[#ffe9a8]">הקרב הבא עדיין בבנייה — אבל המסע כבר ממשיך לכאן, בלי לבחור שלב מתוך רשימה.</p>
        <Link href="/adventure/letter-grove" className="btn-primary mt-5 inline-flex min-h-12 items-center justify-center px-6 focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white">🪄 חוזרים להתאמן בחורשה</Link>
      </section>
    </main>
  );
}
