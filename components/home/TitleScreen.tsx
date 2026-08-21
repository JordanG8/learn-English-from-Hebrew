"use client";

/**
 * TITLE SCREEN — the front door, and nothing else.
 *
 * The screen this replaced tried to answer five questions at once: where am I
 * on the track, what have I earned, what's locked, how do I replay the
 * tutorial, and what do I do now. Thirty-five words of Hebrew before a child
 * had done anything. They bounced.
 *
 * So this screen answers exactly one: WHAT IS THIS, AND HOW DO I START. Every
 * other answer moved to /map, one tap away.
 *
 * The budget is hard: under fifteen Hebrew words on screen at any time, and
 * one thing to tap. The button sits in the bottom third because that is where
 * a thumb rests on a phone — a child should never have to shift their grip to
 * begin.
 */

import { useRouter } from "next/navigation";
import { useProgress } from "@/lib/progress-context";
import { useSound } from "@/lib/sound-pref";
import { primeAudio, playSfx } from "@/lib/audio";

export function TitleScreen() {
  const router = useRouter();
  const { progress, ready } = useProgress();
  const sound = useSound();

  const started = ready && progress.lessonsCompleted.length > 0;

  const go = () => {
    primeAudio();
    playSfx("tap");
    router.push("/map");
  };

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden px-5 pb-6 pt-4">
      {/* Wallpaper, painted under every sibling below it. */}
      <div className="efh-doodles" aria-hidden />

      {/* Sound is the only control up here, and it is an icon, not a sentence. */}
      <div className="relative flex justify-start">
        <button
          type="button"
          onClick={sound.toggle}
          aria-pressed={!sound.on}
          aria-label={sound.on ? "כיבוי צלילים" : "הפעלת צלילים"}
          className="grid h-16 w-16 place-items-center rounded-[var(--radius-kid)] border-[3px] border-brand-soft bg-card text-3xl"
        >
          <span aria-hidden>{sound.on ? "🔊" : "🔇"}</span>
        </button>
      </div>

      {/* The mark: the letter the whole app is built around, standing on the
          page like the statue it becomes on the map. */}
      <div className="relative flex flex-1 flex-col items-center justify-center gap-2">
        <div className="efh-mark ltr select-none" aria-hidden>
          A
        </div>
        <h1 className="text-center text-4xl font-black leading-tight">אנגלית מההתחלה</h1>
        <p className="text-center text-xl text-ink-soft">אותיות, מקלדת, ודיבור</p>
      </div>

      {/* The bottom third: one action, thumb-height, impossible to miss. */}
      <div className="relative flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={go}
          className="efh-start flex w-full items-center justify-center gap-4"
        >
          <span aria-hidden className="text-5xl leading-none">
            {started ? "▶️" : "🚀"}
          </span>
          <span>{started ? "ממשיכים" : "מתחילים"}</span>
        </button>
        <p className="text-center text-sm text-ink-soft">
          <span className="ltr">Jordan Goren</span> · <span className="ltr">Claude</span>
        </p>
      </div>
    </main>
  );
}

export default TitleScreen;
