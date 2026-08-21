"use client";

import type { KeyCap, Lang } from "@/lib/types";
import {
  FINGER_COLORS,
  FINGER_INK,
  FINGER_LABELS,
  FINGER_SHAPES,
  NON_CHARACTER_KEYS,
} from "@/lib/keyboard-layout";

export type KeyVisualState = "normal" | "highlight" | "dim";

export interface KeyProps {
  cap: KeyCap;
  lang: Lang;
  state: KeyVisualState;
  pressed: boolean;
  /** false = recall mode: the glyph is hidden and the child must remember. */
  reveal: boolean;
  showFingers: boolean;
  disabled: boolean;
  /** Ignore the layout width and render a big square tile (phone focus mode). */
  tile?: boolean;
  onPress: (cap: KeyCap) => void;
  onRelease?: () => void;
}

/**
 * One keycap.
 *
 * The cap mirrors a real Israeli keycap: the English legend sits top-left and
 * the Hebrew legend bottom-right, always both, always in the same place. Only
 * their weight changes — the ACTIVE layout's glyph is large and inked, the
 * other is small and faded. That constancy is itself part of the lesson: the
 * child learns to read the hardware in front of them.
 */
export function Key({
  cap,
  lang,
  state,
  pressed,
  reveal,
  showFingers,
  disabled,
  tile = false,
  onPress,
  onRelease,
}: KeyProps) {
  const isModifier = NON_CHARACTER_KEYS.has(cap.code);
  const isSpace = cap.code === "Space";

  const enGlyph = cap.en.upper;
  const heGlyph = cap.he ? cap.he.lower : null;
  const activeIsHe = lang === "he" && heGlyph !== null;

  // Recall mode hides the legends but never the modifiers — a child still has
  // to be able to find Shift while being tested on where "R" lives.
  const showLegends = reveal || isModifier;

  const finger = FINGER_COLORS[cap.finger];
  const fingerInk = FINGER_INK[cap.finger];

  const label = isModifier
    ? cap.en.lower
    : isSpace
      ? "רווח"
      : activeIsHe
        ? `${heGlyph} (${enGlyph})`
        : `${enGlyph}${heGlyph ? ` (${heGlyph})` : ""}`;

  return (
    <div
      className={tile ? "p-1" : undefined}
      style={
        tile
          ? undefined
          : {
              // Width is a share of the 15-unit row, so the board is always
              // exactly as wide as its container — no scrolling, ever. Padding
              // scales with the caps so a narrow screen does not spend its key
              // area on gaps.
              width: `calc(var(--u) * ${cap.width ?? 1})`,
              padding: "var(--kp, 3px)",
            }
      }
    >
      <button
        type="button"
        disabled={disabled}
        data-code={cap.code}
        data-state={state}
        aria-label={label}
        aria-keyshortcuts={cap.code}
        onPointerDown={(e) => {
          // Pointer-down, not click: the feedback and the emitted key have to
          // land under 100ms. Waiting for click adds the browser's tap delay.
          e.preventDefault();
          if (!disabled) onPress(cap);
        }}
        onPointerUp={onRelease}
        onPointerLeave={onRelease}
        onPointerCancel={onRelease}
        className={[
          "relative flex h-full w-full select-none flex-col items-center justify-center",
          "border-2 font-bold",
          tile ? "rounded-xl" : "",
          tile ? "min-h-[76px] text-3xl" : "",
          "transition-[transform,background-color,border-color,box-shadow] duration-[60ms] ease-out",
          pressed
            ? "-translate-y-0 scale-95 border-go bg-go text-white shadow-[0_0_0_5px_var(--color-go-soft)]"
            : state === "highlight"
              ? "border-brand bg-brand-soft text-ink shadow-[0_0_0_4px_var(--color-star)]"
              : state === "dim"
                ? "border-transparent bg-card text-ink-soft opacity-35"
                : "border-brand-soft bg-card text-ink",
          "shadow-[0_3px_0_rgba(0,0,0,0.10)] active:shadow-none",
        ].join(" ")}
        style={{
          height: tile ? undefined : "var(--kh, 44px)",
          // A fixed 12px radius eats a 22px cap alive; scale it with the key.
          borderRadius: tile ? undefined : "calc(var(--kh, 44px) * 0.2)",
          // Every legend below is sized in em, so one declaration keeps the
          // whole cap readable at any scale.
          fontSize: tile ? undefined : "calc(var(--kh, 44px) * 0.34)",
          touchAction: "manipulation",
        }}
      >
        {/* Finger colour band. Colour is one of three channels — the shape and
            the tooltip text carry the same information. */}
        {showFingers && (
          <span
            className="pointer-events-none absolute inset-x-[8%] top-0 flex h-[0.18em] min-h-[3px] items-center justify-center rounded-b-md text-[0.3em] leading-none"
            style={{ background: finger, color: fingerInk }}
            title={`${FINGER_LABELS[cap.finger].he} · ${FINGER_LABELS[cap.finger].en}`}
            aria-hidden="true"
          >
            {FINGER_SHAPES[cap.finger]}
          </span>
        )}

        {isModifier || isSpace ? (
          <span className="ltr overflow-hidden text-[0.72em] font-bold leading-none opacity-80">
            {isSpace ? "␣" : cap.en.lower}
          </span>
        ) : showLegends ? (
          <span className="flex h-full w-full items-center justify-center">
            {/* English legend — top-left, exactly where it is silk-screened. */}
            <span
              className={[
                "ltr absolute leading-none",
                activeIsHe
                  ? "left-[0.15em] top-[0.1em] text-[0.62em] opacity-45"
                  : tile
                    ? "text-[1em]"
                    : "text-[1.35em]",
              ].join(" ")}
            >
              {enGlyph}
            </span>
            {/* Hebrew legend — bottom-right. */}
            {heGlyph && (
              <span
                className={[
                  "rtl absolute leading-none",
                  activeIsHe
                    ? tile
                      ? "text-[1em]"
                      : "text-[1.35em]"
                    : "bottom-[0.1em] right-[0.15em] text-[0.62em] opacity-45",
                ].join(" ")}
              >
                {heGlyph}
              </span>
            )}
          </span>
        ) : (
          <span className="text-ink-soft opacity-50" aria-hidden="true">
            ·
          </span>
        )}

        {/* The physical bump under F and J, drawn where the child can feel it. */}
        {cap.homeAnchor && (
          <span
            className="pointer-events-none absolute bottom-[0.1em] h-[2px] w-[0.7em] rounded-full bg-ink-soft"
            aria-hidden="true"
          />
        )}
      </button>
    </div>
  );
}

export default Key;
