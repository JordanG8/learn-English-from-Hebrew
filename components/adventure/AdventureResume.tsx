"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LETTER_GROVE_SLICE } from "@/lib/game-world";
import { loadAdventureProfile } from "@/lib/inventory";

/**
 * Adventure is a journey, not a menu. The route remains useful as the global
 * "back to adventure" destination, but immediately carries a child to the
 * next physical place they have opened.
 */
export function AdventureResume() {
  const router = useRouter();

  useEffect(() => {
    const profile = loadAdventureProfile();
    const nextPlace = profile.unlockedEncounters.includes(LETTER_GROVE_SLICE.nextEncounterId)
      ? "/adventure/sun-gate"
      : "/adventure/letter-grove";
    router.replace(nextPlace);
  }, [router]);

  return (
    <main className="grid h-dvh min-h-[420px] place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_25%,#fff3bb_0%,#7ec878_32%,#1c5361_100%)] p-6 text-center text-white" dir="rtl">
      <div className="animate-pulse rounded-[2rem] border border-white/30 bg-[#102631]/65 px-8 py-6 shadow-2xl backdrop-blur-md">
        <p className="text-4xl" aria-hidden>🧭</p>
        <p className="mt-2 text-xl font-black">ממשיכים במסע…</p>
      </div>
    </main>
  );
}
