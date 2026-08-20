"use client";

/**
 * KEYBOARD ADAPTER — the single seam between lesson code and the keyboard
 * components owned by the keyboard agent (`components/keyboard/*`,
 * `lib/keyboard-layout.ts`).
 *
 * WHY THIS EXISTS: lesson UI was written concurrently with the keyboard
 * components. Everything outside this file imports `KeyboardSurface` from
 * here and never reaches into components/keyboard directly, so when the real
 * `VirtualKeyboard` lands, wiring it up is a change to ONE file — see
 * `renderKeyboard` at the bottom.
 *
 * The fallback rendered below is not a stub: it is a working on-screen
 * keyboard driven by the real `lib/keyboard-layout.ts` data, sized for
 * fingers, with finger colouring and home-row anchors. If the richer
 * component never arrives, the app still teaches the keyboard correctly.
 */

import { useCallback, useEffect, useMemo } from "react";
import type { KeyCap, KeyCode, Lang } from "./types";
import {
  FINGER_COLORS,
  FINGER_INK,
  KEY_ROWS,
  charFor,
  hasGlyph,
} from "./keyboard-layout";
import { playSfx } from "./audio";

export interface KeyboardSurfaceProps {
  /** Which layout's glyphs are printed on the keys. */
  lang: Lang;
  /** Key codes to draw attention to. Empty = recall mode, no hints. */
  highlight?: readonly KeyCode[];
  /** Keys the child got wrong just now — shown as a gentle wobble. */
  wrong?: readonly KeyCode[];
  /** Fired for every key activated, by touch or by a real keyboard. */
  onKey: (code: KeyCode, char: string | null) => void;
  /** Suspend input, e.g. during a celebration. */
  disabled?: boolean;
  /** Colour keys by which finger should press them. */
  fingerColors?: boolean;
  /** Also listen to the physical keyboard. Default true. */
  physical?: boolean;
  className?: string;
}

/* ------------------------------------------------------------------ */
/* Physical keyboard                                                    */
/* ------------------------------------------------------------------ */

/**
 * Listen to a real keyboard. Uses `event.code`, not `event.key`, so a child
 * typing with the Hebrew layout active still produces "KeyA" for the A key —
 * which is exactly the skill we track. Modifier chords are ignored here;
 * Alt+Shift is handled by the keyboard agent's `useAltShift`.
 */
export function usePhysicalKeys(
  onKey: (code: KeyCode) => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.repeat) return;
      onKey(e.code);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onKey, enabled]);
}

/* ------------------------------------------------------------------ */
/* Fallback surface                                                     */
/* ------------------------------------------------------------------ */

function KeyButton({
  cap,
  lang,
  highlighted,
  wrong,
  disabled,
  fingerColors,
  onKey,
}: {
  cap: KeyCap;
  lang: Lang;
  highlighted: boolean;
  wrong: boolean;
  disabled: boolean;
  fingerColors: boolean;
  onKey: (code: KeyCode, char: string | null) => void;
}) {
  const glyph = charFor(cap.code, lang, true) ?? charFor(cap.code, lang, false);
  const dead = !hasGlyph(cap, lang) && cap.row !== 4;
  const label = glyph ?? "";

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label || cap.code}
      aria-pressed={highlighted}
      onPointerDown={() => {
        if (disabled) return;
        playSfx("tap");
        onKey(cap.code, charFor(cap.code, lang, false));
      }}
      className="efh-kb-key ltr"
      data-highlight={highlighted ? "1" : undefined}
      data-wrong={wrong ? "1" : undefined}
      data-anchor={cap.homeAnchor ? "1" : undefined}
      style={{
        flexGrow: cap.width ?? 1,
        flexBasis: 0,
        background:
          fingerColors && !dead ? FINGER_COLORS[cap.finger] : "var(--color-card)",
        color: fingerColors && !dead ? FINGER_INK[cap.finger] : "var(--color-ink)",
        opacity: dead ? 0.45 : 1,
      }}
    >
      {label}
    </button>
  );
}

function FallbackKeyboard(props: KeyboardSurfaceProps) {
  const {
    lang,
    highlight = [],
    wrong = [],
    onKey,
    disabled = false,
    fingerColors = true,
    className = "",
  } = props;

  const hi = useMemo(() => new Set(highlight), [highlight]);
  const bad = useMemo(() => new Set(wrong), [wrong]);

  return (
    <div className={`efh-kb-surface ltr ${className}`} role="group" aria-label="מקלדת">
      {KEY_ROWS.map((row, i) => (
        <div className="efh-kb-row" key={i}>
          {row.map((cap) => (
            <KeyButton
              key={cap.code}
              cap={cap}
              lang={lang}
              highlighted={hi.has(cap.code)}
              wrong={bad.has(cap.code)}
              disabled={disabled}
              fingerColors={fingerColors}
              onKey={onKey}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The seam                                                             */
/* ------------------------------------------------------------------ */

/**
 * ▼▼▼ THE ONE PLACE TO CHANGE when components/keyboard/VirtualKeyboard.tsx
 * lands. Import it, map these props onto its props, and return it. Nothing
 * else in the app needs to move. ▼▼▼
 */
export function KeyboardSurface(props: KeyboardSurfaceProps) {
  const { onKey, disabled = false, physical = true } = props;

  const handlePhysical = useCallback(
    (code: KeyCode) => {
      if (disabled) return;
      onKey(code, null);
    },
    [onKey, disabled],
  );
  usePhysicalKeys(handlePhysical, physical);

  return <FallbackKeyboard {...props} />;
}

export { charFor };
