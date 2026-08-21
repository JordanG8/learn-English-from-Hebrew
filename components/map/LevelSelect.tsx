"use client";

/**
 * LEVEL SELECT — the road.
 *
 * React owns the HUD and the one button. The 3D world (components/map/scene.ts)
 * owns the canvas and its own render loop, and the two meet at `setLevels` /
 * `focus`. That split is deliberate: a star counter re-rendering must never
 * rebuild a forest.
 *
 * The screen is still governed by the same rules as everything else. There is
 * ONE primary action (the button at thumb height), locked levels say nothing
 * except "locked", and the whole thing has a non-3D way to work — a device
 * without WebGL, or a child who has asked their system for reduced motion,
 * gets a plain list of the same levels rather than a black rectangle.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProgress } from "@/lib/progress-context";
import { useVisitor } from "@/lib/app-providers";
import { LESSONS, TUTORIAL_LESSON } from "@/lib/curriculum";
import { evaluateChatGate, isLessonUnlocked, nextLesson } from "@/lib/srs";
import { totalStars } from "@/lib/progress";
import { tourAttr } from "@/lib/tour";
import { tintStyle } from "@/lib/palette";
import { playSfx, primeAudio } from "@/lib/audio";
import { Walkthrough } from "@/components/onboarding/Walkthrough";
import { StarRow } from "@/components/ui/kit";
import type { LevelNode, World } from "./scene";

export function LevelSelect() {
  const router = useRouter();
  const { progress, ready, setOnboarded, completeLesson } = useProgress();
  /*
   * The mandatory first-visit walkthrough lives here now. It used to run on the
   * home screen, and when that screen became the title card the tour quietly
   * stopped running for new players — it has to sit on the screen it explains.
   */
  const visitor = useVisitor();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World | null>(null);
  const [flat, setFlat] = useState(false); // no WebGL → the list instead
  // The world is imported asynchronously, so "does it exist yet" has to be
  // state, not just a ref: the effect that feeds it the track must re-run once
  // it lands, or the canvas stays empty forever.
  const [worldReady, setWorldReady] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [replay, setReplay] = useState(false);

  const gate = useMemo(() => evaluateChatGate(progress), [progress]);
  const stars = totalStars(progress);

  /** The track, in order, with conversation mode as the last stop on the road. */
  const track = useMemo(() => {
    const lessons = LESSONS.filter((l) => l.kind !== "chat").sort((a, b) => a.order - b.order);
    return lessons;
  }, []);

  const next = useMemo(() => nextLesson(progress, LESSONS), [progress]);
  const nextIndex = useMemo(
    () => (next ? Math.max(0, track.findIndex((l) => l.id === next.id)) : track.length - 1),
    [next, track],
  );

  /** Where the pencil stands: the last level actually finished. */
  const standIndex = Math.max(0, nextIndex - 1);

  const nodes = useMemo<LevelNode[]>(() => {
    const list: LevelNode[] = track.map((l, i) => ({
      id: l.id,
      label: String(i + 1),
      unlocked: isLessonUnlocked(progress, l),
      done: progress.lessonsCompleted.includes(l.id),
      isNext: i === nextIndex,
      isChat: false,
    }));
    list.push({
      id: "chat",
      label: "",
      unlocked: gate.unlocked,
      done: false,
      isNext: false,
      isChat: true,
    });
    return list;
  }, [track, progress, nextIndex, gate.unlocked]);

  const activeIndex = selected ?? nextIndex;
  const activeNode = nodes[activeIndex];
  const activeLesson = activeNode?.isChat ? null : track[activeIndex];

  /* --- mount the world ------------------------------------------------ */
  useEffect(() => {
    if (!ready || flat) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cancelled = false;

    // three is ~600KB. It is imported here rather than at module scope so it
    // never lands in the title screen's bundle and never runs during SSR.
    import("./scene")
      .then(({ createWorld }) => {
        if (cancelled) return;
        const world = createWorld(canvas, {
          reducedMotion: reduced,
          onSelect: (i) => {
            playSfx("tap");
            setSelected(i);
            worldRef.current?.focus(i);
          },
        });
        worldRef.current = world;
        setWorldReady(true);
      })
      .catch(() => {
        // No WebGL, or the module failed. A child must never see a dead
        // rectangle, so fall through to the list.
        if (!cancelled) setFlat(true);
      });

    return () => {
      cancelled = true;
      worldRef.current?.dispose();
      worldRef.current = null;
      setWorldReady(false);
    };
  }, [ready, flat]);

  /* --- feed it the track ---------------------------------------------- */
  useEffect(() => {
    if (!worldReady) return;
    worldRef.current?.setLevels(nodes, activeIndex, standIndex);
  }, [worldReady, nodes, activeIndex, standIndex]);

  const play = useCallback(() => {
    primeAudio();
    playSfx("tap");
    if (activeNode?.isChat) router.push("/chat");
    else if (activeLesson) router.push(`/lesson/${activeLesson.id}`);
  }, [activeNode, activeLesson, router]);

  const finishTutorial = useCallback(() => {
    setOnboarded(true);
    completeLesson(TUTORIAL_LESSON.id, 3);
    setReplay(false);
  }, [setOnboarded, completeLesson]);

  if (!ready || !visitor.ready) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <p className="text-2xl font-bold">רגע…</p>
      </main>
    );
  }

  const canPlay = Boolean(activeNode?.unlocked);
  const showTutorial = replay || (visitor.showTutorial && !progress.onboarded);

  return (
    <>
      <main className="relative flex h-dvh w-full flex-col overflow-hidden">
        {/* The world. Behind everything, and never something to read. */}
        {!flat ? (
          <canvas
            ref={canvasRef}
            {...tourAttr("map")}
            className="absolute inset-0 h-full w-full touch-none"
            aria-hidden
          />
        ) : (
          <FlatTrack
            track={track}
            progress={progress}
            nextIndex={nextIndex}
            onPick={(i) => setSelected(i)}
            activeIndex={activeIndex}
          />
        )}

        {/* --- top bar: three icons, no sentences -------------------- */}
        <div className="relative flex items-start justify-between p-3">
          <button
            type="button"
            onClick={() => router.push("/")}
            aria-label="חזרה"
            className="grid h-14 w-14 place-items-center rounded-2xl border-[3px] border-white/70 bg-card/90 text-2xl shadow"
          >
            <span aria-hidden>→</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              {...tourAttr("replay-tutorial")}
              onClick={() => setReplay(true)}
              aria-label="הראה לי שוב איך משחקים"
              className="grid h-14 w-14 place-items-center rounded-2xl border-[3px] border-white/70 bg-card/90 text-2xl shadow"
            >
              <span aria-hidden>💡</span>
            </button>
            <div
              {...tourAttr("stars")}
              className="flex h-14 items-center gap-1 rounded-2xl border-[3px] border-white/70 bg-card/90 px-3 shadow"
              aria-label={`${stars} כוכבים`}
            >
              <span aria-hidden className="text-2xl">⭐</span>
              <span className="text-xl font-black">{stars}</span>
            </div>
          </div>
        </div>

        <div className="flex-1" />

        {/* --- the one action, at thumb height ----------------------- */}
        <div className="relative flex flex-col items-center gap-2 p-4 pb-6">
          <div
            className="efh-tint flex items-center gap-2 rounded-full px-4 py-1.5 shadow"
            style={activeLesson ? tintStyle(activeLesson.id) : undefined}
          >
            <span aria-hidden className="text-xl">
              {activeNode?.unlocked ? (activeNode.isChat ? "💬" : "📍") : "🔒"}
            </span>
            <span className="text-lg font-black">
              {activeNode?.isChat ? "לדבר באנגלית" : (activeLesson?.titleHe ?? "")}
            </span>
            {activeNode?.done ? (
              <StarRow earned={progress.stars[activeLesson?.id ?? ""] ?? 0} size={16} />
            ) : null}
          </div>

          <button
            type="button"
            {...tourAttr("continue")}
            onClick={play}
            disabled={!canPlay}
            className="efh-play flex w-full max-w-md items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale"
          >
            <span aria-hidden className="text-4xl leading-none">
              {canPlay ? "▶️" : "🔒"}
            </span>
            <span>{canPlay ? "שחק" : "נעול"}</span>
          </button>
        </div>
      </main>

      {showTutorial ? <Walkthrough lesson={TUTORIAL_LESSON} onFinish={finishTutorial} /> : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The fallback: same levels, no WebGL                                  */
/* ------------------------------------------------------------------ */

function FlatTrack({
  track,
  progress,
  nextIndex,
  activeIndex,
  onPick,
}: {
  track: { id: string; titleHe: string }[];
  progress: { lessonsCompleted: string[]; stars: Record<string, number> };
  nextIndex: number;
  activeIndex: number;
  onPick: (i: number) => void;
}) {
  // A window around "where am I", the same shape the road shows.
  const from = Math.max(0, nextIndex - 3);
  const to = Math.min(track.length, nextIndex + 7);
  return (
    <div className="absolute inset-0 overflow-y-auto px-4 pb-40 pt-24">
      <ol className="mx-auto flex max-w-md flex-col gap-2">
        {track.slice(from, to).map((l, k) => {
          const i = from + k;
          const done = progress.lessonsCompleted.includes(l.id);
          const unlocked = done || i <= nextIndex;
          return (
            <li key={l.id}>
              <button
                type="button"
                disabled={!unlocked}
                onClick={() => onPick(i)}
                aria-current={i === activeIndex ? "step" : undefined}
                style={unlocked ? tintStyle(l.id) : undefined}
                className={`efh-tint flex min-h-16 w-full items-center gap-3 rounded-[var(--radius-kid)] border-4 px-4 py-3 text-start disabled:opacity-45 disabled:grayscale ${
                  i === nextIndex ? "border-go" : done ? "border-go-soft" : "border-transparent"
                }`}
              >
                <span aria-hidden className="efh-badge">
                  {unlocked ? i + 1 : "🔒"}
                </span>
                <span className="min-w-0 flex-1 truncate text-lg font-bold">{l.titleHe}</span>
                {done ? <StarRow earned={progress.stars[l.id] ?? 0} size={18} /> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default LevelSelect;
