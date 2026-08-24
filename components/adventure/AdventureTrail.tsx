"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LETTER_GROVE_SLICE } from "@/lib/game-world";
import {
  freshAdventureProfile,
  loadAdventureProfile,
  type AdventureProfile,
} from "@/lib/inventory";
import { StarRow } from "@/components/ui/kit";

export function AdventureTrail() {
  const [profile, setProfile] = useState<AdventureProfile>(() => freshAdventureProfile());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setProfile(loadAdventureProfile());
    setReady(true);
  }, []);

  const firstComplete = profile.completedEncounters.includes(LETTER_GROVE_SLICE.id);
  const sunGateUnlocked = profile.unlockedEncounters.includes(
    LETTER_GROVE_SLICE.nextEncounterId,
  );
  const ownsWand = profile.items.includes(LETTER_GROVE_SLICE.reward.id);
  const firstStars = profile.stars[LETTER_GROVE_SLICE.id] ?? 0;

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[linear-gradient(#dff4e4_0%,#edf5ce_48%,#b4d992_100%)] px-4 py-5" dir="rtl">
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-[58%] bg-[radial-gradient(ellipse_at_center,#8ebd72_0%,#5f955e_76%)] opacity-70" />
      <div aria-hidden className="absolute left-[7%] top-[18%] text-7xl opacity-65">🌲</div>
      <div aria-hidden className="absolute right-[5%] top-[30%] text-8xl opacity-60">🌳</div>
      <div aria-hidden className="absolute bottom-[8%] left-[4%] text-8xl opacity-55">🌲</div>

      <div className="relative mx-auto max-w-3xl">
        <header className="flex items-start justify-between gap-3">
          <Link
            href="/map"
            className="flex min-h-14 items-center gap-2 rounded-2xl border-2 border-white/70 bg-white/90 px-4 font-black shadow-sm focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <span aria-hidden>←</span> מסלול הלימוד
          </Link>
          <div
            className="flex min-h-14 items-center gap-2 rounded-2xl border-2 border-white/70 bg-white/90 px-4 font-black shadow-sm"
            aria-label={ownsWand ? "שרביט הרונה נמצא בתיק" : "תיק הגיבור עדיין ריק"}
          >
            <span aria-hidden>{ownsWand ? "🪄" : "🎒"}</span>
            <span>{ownsWand ? "1" : "0"}</span>
          </div>
        </header>

        <section className="mt-5 rounded-[2rem] border-4 border-white/75 bg-white/90 p-5 text-center shadow-xl backdrop-blur-sm md:p-7">
          <p className="text-sm font-black tracking-wide text-[#4f6f42]">שביל ההרפתקה</p>
          <h1 className="mt-1 text-3xl font-black md:text-5xl">חורשת האותיות</h1>
          <p className="mx-auto mt-2 max-w-xl text-lg font-semibold text-ink-soft">
            אנגלית היא הכוח שמדליק את השביל. בוחרים הכן, עוזרים ליצור, ואוספים ציוד לגיבור.
          </p>
        </section>

        {!ready ? (
          <div className="mt-7 rounded-3xl bg-white/85 p-8 text-center text-xl font-black shadow-lg">
            מסדרים את אבני הדרך…
          </div>
        ) : (
          <ol className="relative mx-auto mt-7 flex max-w-xl flex-col items-center gap-4 pb-10">
            <li className="w-full">
              <Link
                href="/adventure/letter-grove"
                className="group grid min-h-28 w-full grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[2rem] border-4 border-white bg-[#f5efff] p-4 text-right shadow-[0_8px_0_#7f66b4] transition hover:-translate-y-1 focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-brand"
                aria-label={`${firstComplete ? "שחקו שוב" : "התחילו"}: ערפל הבלבול`}
              >
                <span className="grid h-20 w-20 place-items-center rounded-full bg-[#7659bd] text-4xl text-white shadow-inner" aria-hidden>
                  {firstComplete ? "✓" : "👾"}
                </span>
                <span>
                  <span className="block text-sm font-black text-[#72559f]">הכן הראשון</span>
                  <span className="block text-2xl font-black">ערפל הבלבול</span>
                  <span className="mt-1 block font-bold text-ink-soft">
                    {firstComplete ? "פּוֹפּ כבר חבר שלכם · אפשר לשפר כוכבים" : "3 צלילים · 3 רונות · פרס אחד"}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-2">
                  {firstComplete ? <StarRow earned={firstStars} size={22} /> : null}
                  <span className="text-2xl" aria-hidden>←</span>
                </span>
              </Link>
            </li>

            <li aria-hidden className="h-12 w-3 rounded-full bg-white/70 shadow-inner" />

            <li className="w-full">
              <article
                className={`grid min-h-28 w-full grid-cols-[auto_1fr] items-center gap-4 rounded-[2rem] border-4 p-4 text-right shadow-lg ${
                  sunGateUnlocked
                    ? "border-[#ffe9a4] bg-[#fff9dc]"
                    : "border-white/70 bg-white/60 grayscale"
                }`}
                aria-label={sunGateUnlocked ? "שער השמש נחשף על המפה ועדיין בבנייה" : "שער השמש נעול"}
              >
                <span className={`grid h-20 w-20 place-items-center rounded-full text-4xl ${sunGateUnlocked ? "bg-[#ffd85e]" : "bg-slate-300"}`} aria-hidden>
                  {sunGateUnlocked ? "🌞" : "🔒"}
                </span>
                <div>
                  <p className={`text-sm font-black ${sunGateUnlocked ? "text-[#7d6515]" : "text-ink-soft"}`}>
                    {sunGateUnlocked ? "נחשף! ההרפתקה הבאה בבנייה" : "משחררים את פּוֹפּ כדי לחשוף"}
                  </p>
                  <h2 className="text-2xl font-black">שער השמש</h2>
                  <p className="mt-1 font-bold text-ink-soft">
                    {sunGateUnlocked ? "הפרס והפתיחה נשמרו · המשימה הבאה בבנייה" : "עדיין מסתתר מאחורי הערפל"}
                  </p>
                </div>
              </article>
            </li>

            <li aria-hidden className="h-10 w-3 rounded-full bg-white/40" />

            <li className="w-[86%] rounded-[2rem] border-4 border-dashed border-white/60 bg-white/35 p-5 text-center text-ink-soft">
              <span className="text-3xl" aria-hidden>🗺️</span>
              <p className="mt-1 font-black">עוד שבילים ואזורים יתחברו מכאן</p>
            </li>
          </ol>
        )}
      </div>
    </main>
  );
}
