"use client";

/**
 * SHARED UI KIT — one file on purpose.
 *
 * Every screen (home, lesson player, chat) needs the same handful of
 * primitives. Keeping them in a single module means the screen authors never
 * write to the same file, and means design-system rules 1–5 from
 * app/globals.css are enforced in one place rather than remembered five
 * times.
 *
 * Rules encoded here:
 *   · BigButton is the ONE primary action. Do not put two on a screen.
 *   · Every interactive element is ≥64px tall (BigButton is 72px).
 *   · Nothing communicates by colour alone — each component takes an icon or
 *     a label alongside its colour.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CONFETTI_PIECES } from "@/lib/pedagogy";
import { playSfx, primeAudio } from "@/lib/audio";

/* ------------------------------------------------------------------ */

export function BigButton({
  children,
  onClick,
  icon,
  disabled,
  className = "",
  ...rest
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: string;
  disabled?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        primeAudio();
        playSfx("tap");
        onClick?.();
      }}
      className={`btn-primary flex w-full items-center justify-center gap-3 disabled:opacity-40 ${className}`}
      {...rest}
    >
      {icon ? (
        <span aria-hidden className="text-3xl leading-none">
          {icon}
        </span>
      ) : null}
      <span>{children}</span>
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  icon,
  disabled,
  className = "",
  ...rest
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: string;
  disabled?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        primeAudio();
        playSfx("tap");
        onClick?.();
      }}
      className={`btn-secondary flex items-center justify-center gap-2 disabled:opacity-40 ${className}`}
      {...rest}
    >
      {icon ? (
        <span aria-hidden className="text-2xl leading-none">
          {icon}
        </span>
      ) : null}
      <span>{children}</span>
    </button>
  );
}

export function Card({
  children,
  className = "",
  style,
  ...rest
}: { children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    /*
     * A card is white so the ink on it always reads (rule 9) — the colour goes
     * on the rim instead: a band of the ambient identity hue along the top
     * edge. It costs no contrast, and it is what stops a screen full of cards
     * from reading as a stack of forms. Screens that set no --tint fall back
     * to the brand tint, so this is safe everywhere.
     */
    <div
      className={`rounded-[var(--radius-kid)] bg-card p-5 shadow-[0_2px_10px_rgba(30,30,60,0.07)] ${className}`}
      // A caller's own style still wins; the rim is a default, not a lock.
      style={{ borderTop: "6px solid var(--tint-ink, var(--color-brand))", ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stars                                                                */
/* ------------------------------------------------------------------ */

/** Redundant channels: filled/hollow shape AND colour AND a count label. */
export function StarRow({
  earned,
  total = 3,
  size = 32,
  animate = false,
}: {
  earned: number;
  total?: number;
  size?: number;
  animate?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-1"
      role="img"
      aria-label={`${earned} מתוך ${total} כוכבים`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={animate && i < earned ? "star-pop" : undefined}
          style={{
            fontSize: size,
            lineHeight: 1,
            animationDelay: animate ? `${i * 180}ms` : undefined,
            filter: i < earned ? "none" : "grayscale(1)",
            opacity: i < earned ? 1 : 0.3,
          }}
        >
          {i < earned ? "⭐" : "☆"}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progress ring — used for "how close to mastery / to unlocking chat"  */
/* ------------------------------------------------------------------ */

export function ProgressRing({
  value,
  size = 64,
  label,
  icon,
}: {
  /** 0..1 */
  value: number;
  size?: number;
  label?: string;
  icon?: string;
}) {
  const v = Math.min(1, Math.max(0, value));
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} stroke="var(--color-brand-soft)" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          stroke="var(--color-go)"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
        />
      </svg>
      <span className="absolute text-xl" aria-hidden>
        {icon ?? `${Math.round(v * 100)}%`}
      </span>
      {label ? <span className="sr-only">{label}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lesson progress bar                                                  */
/* ------------------------------------------------------------------ */

export function StepBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  return (
    <div
      className="h-4 w-full overflow-hidden rounded-full bg-brand-soft"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={current}
      aria-label="ההתקדמות בשיעור"
    >
      <div
        className="h-full rounded-full bg-go transition-[width] duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Confetti                                                             */
/* ------------------------------------------------------------------ */

interface Piece {
  left: number;
  delay: number;
  dur: number;
  hue: number;
  size: number;
  drift: number;
}

/**
 * CSS-only confetti. No canvas, no rAF loop: a cheap Android tablet can hold
 * 60fps on transforms and nothing else. Respects prefers-reduced-motion via
 * the global rule in globals.css, which collapses the animation — the
 * celebration then reads through the emoji + stars + text channels instead.
 */
export function Confetti({ active, pieces = CONFETTI_PIECES }: { active: boolean; pieces?: number }) {
  const seedRef = useRef(0);
  if (active) seedRef.current = seedRef.current || Date.now();

  const items = useMemo<Piece[]>(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        left: (i * 37) % 100,
        delay: ((i * 53) % 90) / 100,
        dur: 1.6 + ((i * 29) % 90) / 100,
        hue: (i * 47) % 360,
        size: 8 + ((i * 13) % 8),
        drift: ((i * 71) % 60) - 30,
      })),
    [pieces],
  );

  if (!active) return null;
  return (
    <div className="confetti-layer" aria-hidden>
      {items.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 1.6,
            background: `oklch(0.75 0.18 ${p.hue})`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            ["--drift" as string]: `${p.drift}vw`,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen header                                                        */
/* ------------------------------------------------------------------ */

export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 p-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה"
          data-tour="back"
          className="grid h-16 w-16 shrink-0 place-items-center rounded-[var(--radius-kid)] border-[3px] border-brand-soft bg-card text-3xl"
        >
          <span aria-hidden>{"→"}</span>
        </button>
      ) : (
        <span className="h-16 w-16" />
      )}
      <h1 className="min-w-0 flex-1 truncate text-center text-xl font-bold">{title}</h1>
      <div className="flex h-16 min-w-16 items-center justify-end">{right}</div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Client-only gate — avoids hydration mismatch on localStorage screens */
/* ------------------------------------------------------------------ */

export function ClientOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <>{mounted ? children : fallback}</>;
}
