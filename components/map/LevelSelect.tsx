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
 *
 * THE LEVEL-UP GATE. Finishing a lesson used to drop the child straight into
 * the next one; the pencil moved up the road with nobody watching, which threw
 * away the only moment in the app where the work turns into visible distance
 * travelled. So the road is now the way through, and when it owes a level-up
 * it pays it first: the pencil is put back on the pad the child last SAW it
 * on, the cinematic runs with its sound, and the play button stays shut until
 * the landing has settled. One celebration per level, never skipped, never
 * repeated — `lib/advancement.ts` is the memory that makes it exactly once.
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
import { markStand, seenStand } from "@/lib/advancement";
import { useStudioUnlock } from "@/lib/studio-unlock";
import { Walkthrough } from "@/components/onboarding/Walkthrough";
import { StarRow } from "@/components/ui/kit";
import { ADVANCE_MS } from "./timing";
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
  // A ref mirrors selection so several taps in one React frame still advance
  // from the latest level. Reading `selected` inside a click handler used to
  // make rapid previous/next taps all calculate from the same stale render.
  const selectedRef = useRef<number | null>(null);
  selectedRef.current = selected;
  // The world is mounted once; this ref keeps its click handler current as
  // progress changes without making a changed callback rebuild WebGL.
  const chooseLevelRef = useRef<(index: number) => void>(() => {});
  const [replay, setReplay] = useState(false);
  /*
   * The gate. "running" from the moment the road knows it owes a level-up
   * until the pencil has settled; "landed" is the slice of that where the
   * banner is up, which starts on the frame the pencil actually hits the pad.
   */
  const [levelUp, setLevelUp] = useState<"idle" | "running" | "landed">("idle");
  /** The pad the pencil starts the cinematic on, or null when nothing is owed. */
  const [levelUpFrom, setLevelUpFrom] = useState<number | null>(null);

  const gate = useMemo(() => evaluateChatGate(progress), [progress]);
  const unlockAll = useStudioUnlock();
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

  /*
   * The cinematic's callbacks are built once, when the world is created, so
   * they cannot read state — everything they need is behind a ref.
   */
  const levelUpRef = useRef<"idle" | "running" | "landed">("idle");
  levelUpRef.current = levelUp;
  const standRef = useRef(standIndex);
  standRef.current = standIndex;

  const destinationIndex = selected ?? nextIndex;
  const nodes = useMemo<LevelNode[]>(() => {
    const list: LevelNode[] = track.map((l, i) => ({
      id: l.id,
      label: String(i + 1),
      unlocked: unlockAll || isLessonUnlocked(progress, l),
      done: progress.lessonsCompleted.includes(l.id),
      isNext: i === nextIndex,
      isSelected: i === destinationIndex,
      isChat: false,
    }));
    list.push({
      id: "chat",
      label: "",
      unlocked: unlockAll || gate.unlocked,
      done: false,
      isNext: false,
      isSelected: track.length === destinationIndex,
      isChat: true,
    });
    return list;
  }, [track, progress, nextIndex, gate.unlocked, unlockAll, destinationIndex]);

  const activeIndex = destinationIndex;
  const activeNode = nodes[activeIndex];
  const activeLesson = activeNode?.isChat ? null : track[activeIndex];

  const chooseLevel = useCallback((index: number) => {
    const safe = Math.max(0, Math.min(nodes.length - 1, index));
    if (!nodes[safe]?.unlocked) return;
    selectedRef.current = safe;
    setSelected(safe);
    worldRef.current?.focus(safe);
  }, [nodes]);
  chooseLevelRef.current = chooseLevel;

  /**
   * A dependable second way to travel. The 3D pads remain the direct, playful
   * control; these two quiet buttons are the fast path for a child revisiting
   * completed lessons, for keyboard users, and for a pointer that is moving
   * faster than the camera transition.
   */
  const stepLevel = useCallback((direction: -1 | 1) => {
    const start = selectedRef.current ?? nextIndex;
    for (let i = start + direction; i >= 0 && i < nodes.length; i += direction) {
      if (nodes[i]?.unlocked) {
        primeAudio();
        playSfx("tap");
        chooseLevel(i);
        return;
      }
    }
  }, [chooseLevel, nextIndex, nodes]);

  const canStepBack = nodes.slice(0, activeIndex).some((node) => node.unlocked);
  const canStepForward = nodes.slice(activeIndex + 1).some((node) => node.unlocked);

  /* --- is a level-up owed? -------------------------------------------- */
  /*
   * Decided ONCE per visit, before the world is fed. Re-deciding as progress
   * changes would re-fire the celebration every time a star counter moved.
   */
  const decided = useRef(false);
  useEffect(() => {
    if (!ready || decided.current) return;
    decided.current = true;
    const seen = seenStand(standIndex);
    if (seen < standIndex) {
      setLevelUpFrom(seen);
      setLevelUp("running");
    } else {
      markStand(standIndex);
    }
  }, [ready, standIndex]);

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
            // The cinematic is not interruptible. Tapping a pad mid-flight
            // would move the spotlight out from under the landing.
            if (levelUpRef.current !== "idle") return;
            playSfx("tap");
            chooseLevelRef.current(i);
          },
          onAdvance: (phase) => {
            if (phase === "launch") {
              playSfx("hop-launch");
            } else if (phase === "land") {
              // The big one, on the frame of the impact. A fanfare that
              // arrives a tenth of a second late reads as a different event.
              playSfx("level-up");
              setLevelUp("landed");
            } else {
              markStand(standRef.current);
              setLevelUp("idle");
              setLevelUpFrom(null);
              // Now that the pencil has arrived, glide on to the level it has
              // unlocked — the last beat of the celebration is seeing where
              // you are going next.
              worldRef.current?.focus(standRef.current + 1);
            }
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
    // While a level-up is owed the pencil belongs on the pad the child last
    // saw it on; the cinematic is what moves it off.
    worldRef.current?.setLevels(nodes, activeIndex, levelUpFrom ?? standIndex);
  }, [worldReady, nodes, activeIndex, standIndex, levelUpFrom]);

  /* --- pay the level-up ------------------------------------------------ */
  const played = useRef(false);
  useEffect(() => {
    if (!worldReady || played.current) return;
    if (levelUp !== "running" || levelUpFrom === null) return;
    played.current = true;
    // The child arrived here by pressing a button, so the audio context is
    // already unlocked; this only warms it.
    primeAudio();
    worldRef.current?.advance(levelUpFrom, standIndex);

    /*
     * THE DEAD MAN'S HANDLE. The gate holds the only way forward, so a lost
     * "done" — a backgrounded tab that stops firing frames, a context lost on
     * a memory-starved tablet — would strand a child on this screen with a
     * greyed-out button and no way to say so. Well past the length of the
     * cinematic, the gate opens by itself.
     */
    const bail = window.setTimeout(() => {
      markStand(standRef.current);
      setLevelUp("idle");
      setLevelUpFrom(null);
    }, ADVANCE_MS + 2500);
    return () => window.clearTimeout(bail);
  }, [worldReady, levelUp, levelUpFrom, standIndex]);

  /*
   * No WebGL means no pencil to watch, and a celebration nobody can see must
   * not be a locked button. The flat list gets the level-up for free.
   */
  useEffect(() => {
    if (!flat || levelUp === "idle") return;
    markStand(standIndex);
    setLevelUp("idle");
    setLevelUpFrom(null);
  }, [flat, levelUp, standIndex]);

  const play = useCallback(() => {
    if (levelUpRef.current !== "idle") return;
    primeAudio();
    playSfx("tap");
    if (activeNode?.isChat) router.push("/chat");
    else if (activeLesson) router.push(`/lesson/${activeLesson.id}`);
  }, [activeNode, activeLesson, router]);

  const finishTutorial = useCallback(() => {
    setOnboarded(true);
    // The walkthrough explains the map; it is not a lesson the child has
    // completed. Starting at three stars made the first real reward unclear.
    completeLesson(TUTORIAL_LESSON.id, 0);
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
  /** While the pencil is in the air, this screen has no controls at all. */
  const held = levelUp !== "idle";

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
            nodes={nodes}
            progress={progress}
            onPick={chooseLevel}
            activeIndex={activeIndex}
          />
        )}

        {/* --- top bar: three icons, no sentences -------------------- */}
        {/*
          * Everything here fades and stops taking taps while the pencil is
          * moving. A child who can leave mid-jump has not been shown the jump.
          */}
        <div
          className={`relative flex items-start justify-between p-3 transition-opacity duration-300 ${
            held ? "pointer-events-none opacity-30" : "opacity-100"
          }`}
          aria-hidden={held}
        >
          <button
            type="button"
            disabled={held}
            onClick={() => router.push("/")}
            aria-label="חזרה לבית"
            className="flex h-14 items-center gap-1 rounded-2xl border-[3px] border-white/70 bg-card/90 px-3 text-base font-black shadow"
          >
            <span aria-hidden>→</span>
            <span>בית</span>
          </button>

          <div className="flex items-center gap-2">
            {/* Speaking practice. An icon in the secondary cluster, never a
                second primary action: the road has exactly one of those. */}
            <button
              type="button"
              disabled={held}
              onClick={() => router.push("/speak")}
              aria-label="מדברים אנגלית"
              className="grid h-14 w-14 place-items-center rounded-2xl border-[3px] border-white/70 bg-card/90 text-2xl shadow"
            >
              <span aria-hidden>🎤</span>
            </button>
            <button
              type="button"
              {...tourAttr("replay-tutorial")}
              disabled={held}
              onClick={() => setReplay(true)}
              aria-label="הראה לי שוב איך משחקים"
              className="grid h-14 w-14 place-items-center rounded-2xl border-[3px] border-white/70 bg-card/90 text-2xl shadow"
            >
              <span aria-hidden>💡</span>
            </button>
            {unlockAll ? (
              <div
                className="grid h-14 place-items-center rounded-2xl border-[3px] border-white/70 bg-card/90 px-3 text-2xl shadow"
                aria-label="מצב בדיקה: כל השלבים פתוחים"
                title="מצב בדיקה: כל השלבים פתוחים"
              >
                <span aria-hidden>🔓</span>
              </div>
            ) : null}
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

        {/*
          * THE LANDING. One line, appearing on the frame the pencil hits the
          * pad — a number, not a sentence, because it says the same thing the
          * pad under the pencil now says.
          */}
        {levelUp === "landed" ? (
          <div
            role="status"
            className="pointer-events-none relative flex justify-center px-6 pb-2"
          >
            <div className="efh-levelup flex items-center gap-3 rounded-full border-4 border-white/80 bg-go px-6 py-3 shadow-lg">
              <span aria-hidden className="text-3xl">🎉</span>
              <span className="text-2xl font-black text-white">
                שלב {standIndex + 1} הושלם!
              </span>
            </div>
          </div>
        ) : null}

        {/* --- the one action, at thumb height ----------------------- */}
        <div className="relative flex flex-col items-center gap-2 p-4 pb-6">
          <div
            role="group"
            aria-label="מעבר מהיר בין שלבים"
            className={`flex items-center gap-2 transition-opacity duration-300 ${
              held ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            <button
              type="button"
              data-level-step="previous"
              disabled={!canStepBack || held}
              onClick={() => stepLevel(-1)}
              aria-label="לשלב הקודם"
              className="grid h-12 w-12 place-items-center rounded-2xl border-[3px] border-white/80 bg-card/90 text-xl font-black shadow disabled:opacity-35"
            >
              <span aria-hidden>↓</span>
            </button>
            <div
              data-active-level={activeIndex}
              className="rounded-full border-[3px] border-white/80 bg-card/90 px-4 py-2 text-sm font-black shadow"
              aria-live="polite"
            >
              שלב {activeIndex + 1} מתוך {nodes.length}
            </div>
            <button
              type="button"
              data-level-step="next"
              disabled={!canStepForward || held}
              onClick={() => stepLevel(1)}
              aria-label="לשלב הבא"
              className="grid h-12 w-12 place-items-center rounded-2xl border-[3px] border-white/80 bg-card/90 text-xl font-black shadow disabled:opacity-35"
            >
              <span aria-hidden>↑</span>
            </button>
          </div>

          <section
            aria-label="היעד שנבחר"
            className={`efh-tint w-full max-w-md rounded-[1.5rem] border-4 border-white/80 px-5 py-4 shadow-lg transition-opacity duration-300 ${
              held ? "opacity-0" : "opacity-100"
            }`}
            style={activeLesson ? tintStyle(activeLesson.id) : undefined}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="rounded-full bg-white/75 px-3 py-1 text-sm font-black">
                {activeNode?.isChat ? "יעד: שיחה" : `יעד: שלב ${activeIndex + 1}`}
              </span>
              {activeNode?.done ? (
                <StarRow earned={progress.stars[activeLesson?.id ?? ""] ?? 0} size={18} />
              ) : null}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span aria-hidden className="text-3xl">
                {activeNode?.unlocked ? (activeNode.isChat ? "💬" : "📍") : "🔒"}
              </span>
              <span className="text-xl font-black">
                {activeNode?.isChat ? "לדבר באנגלית" : (activeLesson?.titleHe ?? "")}
              </span>
            </div>
            <p className="mt-2 text-sm font-bold text-ink-soft">
              {activeIndex < 26
                ? "מסלול האותיות"
                : activeIndex < 51
                  ? "מילים ראשונות"
                  : activeIndex < 76
                    ? "בונים מילים"
                    : "משפטים ושיחה"}
            </p>
            {activeIndex !== standIndex ? (
              <p className="mt-2 text-sm font-bold text-ink-soft">
                המסלול מהעיפרון שלך ליעד מסומן על הדרך
              </p>
            ) : null}
          </section>

          {/*
            * `held` is the gate. The button is not merely ignored while the
            * pencil is in the air — it says why, so a child who is jabbing at
            * it is watching the right thing instead of a dead control.
            */}
          <button
            type="button"
            {...tourAttr("continue")}
            onClick={play}
            disabled={!canPlay || held}
            aria-live="polite"
            className="efh-play flex w-full max-w-md items-center justify-center gap-3 disabled:opacity-50 disabled:grayscale"
          >
            <span aria-hidden className="text-4xl leading-none">
              {held ? "✏️" : canPlay ? "▶️" : "🔒"}
            </span>
            <span>{held ? "פותחים את השיעור…" : canPlay ? "בואו נלמד" : "נעול"}</span>
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
  nodes,
  progress,
  activeIndex,
  onPick,
}: {
  track: { id: string; titleHe: string }[];
  nodes: LevelNode[];
  progress: { lessonsCompleted: string[]; stars: Record<string, number> };
  activeIndex: number;
  onPick: (i: number) => void;
}) {
  return (
    <div className="absolute inset-0 overflow-y-auto px-4 pb-40 pt-24">
      <ol className="mx-auto flex max-w-md flex-col gap-2">
        {nodes.map((node, i) => {
          const lesson = node.isChat ? null : track[i];
          const title = node.isChat ? "לדבר באנגלית" : (lesson?.titleHe ?? "");
          return (
            <li key={node.id}>
              <button
                type="button"
                data-level-index={i}
                disabled={!node.unlocked}
                onClick={() => onPick(i)}
                aria-current={i === activeIndex ? "step" : undefined}
                style={node.unlocked && lesson ? tintStyle(lesson.id) : undefined}
                className={`efh-tint flex min-h-16 w-full items-center gap-3 rounded-[var(--radius-kid)] border-4 px-4 py-3 text-start disabled:opacity-45 disabled:grayscale ${
                  node.isNext ? "border-go" : node.done ? "border-go-soft" : "border-transparent"
                }`}
              >
                <span aria-hidden className="efh-badge">
                  {node.unlocked ? (node.isChat ? "💬" : i + 1) : "🔒"}
                </span>
                <span className="min-w-0 flex-1 truncate text-lg font-bold">{title}</span>
                {node.done && lesson ? (
                  <StarRow earned={progress.stars[lesson.id] ?? 0} size={18} />
                ) : null}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default LevelSelect;
