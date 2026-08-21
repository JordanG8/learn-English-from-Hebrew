"use client";

/**
 * HOME / LESSON MAP.
 *
 * What this screen must answer, in one glance, for a 7-year-old:
 *   · where am I on the track          → the map, with the current node marked
 *   · what have I earned               → the star counter
 *   · what do I do now                 → ONE big green button (design rule 1)
 *   · what am I working toward         → the locked conversation card
 *
 * It also hosts the mandatory walkthrough on first visit, and the permanent
 * "הראה לי שוב" affordance that makes a wrongly-skipped tutorial recoverable.
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useProgress } from "@/lib/progress-context";
import { useVisitor } from "@/lib/app-providers";
import { LESSONS, TUTORIAL_LESSON } from "@/lib/curriculum";
import { evaluateChatGate, isLessonUnlocked, nextLesson } from "@/lib/srs";
import { totalStars, distinctPracticeDays } from "@/lib/progress";
import { practiceDaysLabelHe } from "@/lib/reward";
import { tourAttr } from "@/lib/tour";
import { tintStyle } from "@/lib/palette";
import { BigButton, Card, ProgressRing, SecondaryButton, StarRow } from "@/components/ui/kit";
import { Walkthrough } from "@/components/onboarding/Walkthrough";

const KIND_ICON: Record<string, string> = {
  tutorial: "💡",
  letter: "🔤",
  keyboard: "⌨️",
  mixed: "🔁",
  chat: "💬",
};

export function HomeScreen() {
  const router = useRouter();
  const { progress, ready, setOnboarded, completeLesson } = useProgress();
  const visitor = useVisitor();
  const [replay, setReplay] = useState(false);
  const [showFullMap, setShowFullMap] = useState(false);

  const gate = useMemo(() => evaluateChatGate(progress), [progress]);
  const next = useMemo(() => nextLesson(progress, LESSONS), [progress]);
  const stars = totalStars(progress);
  const days = distinctPracticeDays(progress);

  // Track = everything except the chat card, which gets its own treatment.
  const track = useMemo(
    () => LESSONS.filter((l) => l.kind !== "chat").sort((a, b) => a.order - b.order),
    [],
  );

  // A window around "where am I": the last couple of finished lessons, the
  // current one, and a short look-ahead. Full 100-item list is opt-in.
  const visibleTrack = useMemo(() => {
    if (showFullMap) return track;
    const idx = next ? track.findIndex((l) => l.id === next.id) : track.length - 1;
    const from = Math.max(0, idx - 2);
    const to = Math.min(track.length, idx + 4);
    return track.slice(from, to);
  }, [track, next, showFullMap]);

  const goNext = useCallback(() => {
    if (!next) return;
    router.push(`/lesson/${next.id}`);
  }, [next, router]);

  /**
   * Finishing the walkthrough also completes the `tutorial` LESSON, because
   * the first letter lesson lists it in `requires`. The walkthrough overlay
   * and that lesson are the same content in two presentations; a child must
   * never have to sit through both.
   */
  const finishTutorial = useCallback(() => {
    setOnboarded(true);
    completeLesson(TUTORIAL_LESSON.id, 3);
    setReplay(false);
  }, [setOnboarded, completeLesson]);

  // Render nothing state-dependent until localStorage has been read, or a
  // returning child sees "0 stars" flash before their real progress arrives.
  if (!ready || !visitor.ready) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <p className="text-2xl font-bold">רגע…</p>
      </main>
    );
  }

  const showTutorial = replay || (visitor.showTutorial && !progress.onboarded);

  return (
    <>
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 p-4 pb-8">
        {/* --- Header: identity + what I've earned --------------------- */}
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black">אנגלית מההתחלה</h1>
            <p className="text-sm text-ink-soft">{practiceDaysLabelHe(days)}</p>
          </div>
          <div
            {...tourAttr("stars")}
            className="flex min-h-16 items-center gap-2 rounded-[var(--radius-kid)] bg-star/25 px-4 py-2"
            aria-label={`${stars} כוכבים נאספו`}
          >
            <span aria-hidden className="text-3xl">⭐</span>
            <span className="text-2xl font-black">{stars}</span>
          </div>
        </header>

        {/* --- The one primary action --------------------------------- */}
        <div {...tourAttr("continue")}>
          <BigButton icon="▶️" onClick={goNext} disabled={!next}>
            {progress.lessonsCompleted.length === 0 ? "מתחילים!" : "ממשיכים"}
          </BigButton>
        </div>
        {next ? (
          <p className="-mt-2 text-center text-lg text-ink-soft">
            הבא בתור: {next.titleHe}
          </p>
        ) : null}

        {/* --- Conversation mode -------------------------------------- */}
        <Card
          {...tourAttr("chat-card")}
          className={`flex items-center gap-4 ${gate.unlocked ? "" : "opacity-95"}`}
        >
          <ProgressRing
            value={gate.progress}
            icon={gate.unlocked ? "💬" : "🔒"}
            label={gate.reasonHe}
          />
          <div className="min-w-0 flex-1">
            <p className="text-xl font-black">לדבר באנגלית</p>
            <p className="text-base text-ink-soft">{gate.reasonHe}</p>
            {!gate.unlocked ? (
              <p className="mt-1 text-sm text-ink-soft">
                אותיות {gate.lettersMastered}/{gate.lettersRequired} · מילים{" "}
                {gate.wordsKnown}/{gate.wordsRequired} · ימים {gate.practiceDays}/
                {gate.practiceDaysRequired}
              </p>
            ) : null}
          </div>
          {gate.unlocked ? (
            <SecondaryButton icon="💬" onClick={() => router.push("/chat")}>
              לדבר
            </SecondaryButton>
          ) : (
            <span aria-hidden className="text-3xl">🔒</span>
          )}
        </Card>

        {/* --- The track ---------------------------------------------- */}
        {/* Only a small window around "where am I" renders by default — a
            7-year-old scrolling past 100 rows to find today's lesson is the
            clutter this was built to avoid. "כל המסלול" reveals the rest on
            request; nothing is hidden permanently. */}
        <section {...tourAttr("map")} aria-label="המסלול" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-ink-soft">המסלול שלי</h2>
            {!showFullMap && track.length > visibleTrack.length ? (
              <button
                type="button"
                onClick={() => setShowFullMap(true)}
                className="min-h-11 rounded-full px-3 text-sm font-bold text-brand underline underline-offset-4"
              >
                כל המסלול ({track.length})
              </button>
            ) : null}
          </div>
          <ol className="flex flex-col gap-2">
            {visibleTrack.map((lesson) => {
              const done = progress.lessonsCompleted.includes(lesson.id);
              const unlocked = isLessonUnlocked(progress, lesson);
              const isNext = next?.id === lesson.id;
              const earned = progress.stars[lesson.id] ?? 0;
              return (
                <li key={lesson.id}>
                  <button
                    type="button"
                    disabled={!unlocked}
                    onClick={() => router.push(`/lesson/${lesson.id}`)}
                    aria-current={isNext ? "step" : undefined}
                    /*
                     * The row wears the lesson's identity hue (rule 8) — that
                     * is the whole reason the track stops looking like a
                     * spreadsheet. The border still carries STATE and is the
                     * only thing that does: go = you are here, go-soft = done.
                     * A locked row keeps the hue but is desaturated by
                     * `disabled:` — colour is the fourth channel there, behind
                     * the 🔒, the disabled attribute and the dimming.
                     */
                    style={unlocked ? tintStyle(lesson.id) : undefined}
                    className={`efh-tint flex min-h-16 w-full items-center gap-3 rounded-[var(--radius-kid)] border-4 px-4 py-3 text-start disabled:opacity-45 disabled:grayscale ${
                      isNext ? "border-go" : done ? "border-go-soft" : "border-transparent"
                    }`}
                  >
                    <span aria-hidden className="efh-badge">
                      {unlocked ? (KIND_ICON[lesson.kind] ?? "🔤") : "🔒"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-bold">
                        {lesson.titleHe}
                      </span>
                      {isNext ? (
                        <span className="block text-sm font-bold text-go">כאן אני</span>
                      ) : null}
                    </span>
                    {done ? <StarRow earned={earned} size={20} /> : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        {/* --- Permanent escape hatch back into the walkthrough -------- */}
        <div {...tourAttr("replay-tutorial")}>
          <SecondaryButton icon="💡" onClick={() => setReplay(true)} className="w-full">
            הראה לי שוב איך משחקים
          </SecondaryButton>
        </div>
      </main>

      {showTutorial ? (
        <Walkthrough lesson={TUTORIAL_LESSON} onFinish={finishTutorial} />
      ) : null}
    </>
  );
}
