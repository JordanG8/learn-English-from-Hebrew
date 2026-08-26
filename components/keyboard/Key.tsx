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
 * their weight changes — the ACTIVE layout's character is centred and black,
 * the other is a small tinted badge in its printed corner. That constancy is
 * itself part of the lesson: the child learns to read the hardware in front
 * of them, so the second legend has to be legible rather than decorative.
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
  /** The cap has a solid coloured face: white ink, and a white badge. */
  const filled = pressed || state === "highlight";

  /*
   * WHICH GLYPH IS THE BIG ONE.
   *
   * A letter key is printed with its capital — that is what is silk-screened,
   * and "A" is what a child is asked to find. Every OTHER key produces its
   * UNSHIFTED character when tapped, and that is the character the cap must
   * lead with: this used to print `cap.en.upper` for every key, so the number
   * row read `! @ # $ % ^ & * ( )` in giant type with the digits nowhere to be
   * seen, while the step said "press 1". The shifted character is real and
   * still printed — as the secondary legend, which is exactly where it lives
   * on the hardware.
   */
  const isLetterKey = /^[a-z]$/.test(cap.en.lower);
  const enGlyph = isLetterKey ? cap.en.upper : cap.en.lower;
  /** What Shift produces here, when that is a different character. */
  const enShiftGlyph =
    isLetterKey || cap.en.upper === cap.en.lower ? null : cap.en.upper;
  const heGlyph = cap.he ? cap.he.lower : null;
  const heShiftGlyph =
    cap.he && cap.he.upper !== cap.he.lower ? cap.he.upper : null;
  const activeIsHe = lang === "he" && heGlyph !== null;

  /*
   * The primary legend is the active layout's character; the secondary is the
   * OTHER layout's, because reading the hardware in front of you is half the
   * lesson. On the digit row the two layouts agree, so printing the other one
   * would just draw "1" twice — there the secondary slot shows what Shift
   * does instead, which is the only thing about that key a child does not
   * already know.
   */
  const primary = activeIsHe ? (heGlyph as string) : enGlyph;
  const secondaryRaw = activeIsHe ? enGlyph : heGlyph;
  const secondary =
    secondaryRaw && secondaryRaw !== primary
      ? secondaryRaw
      : activeIsHe
        ? heShiftGlyph
        : enShiftGlyph;

  // Recall mode hides the legends but never the modifiers — a child still has
  // to be able to find Shift while being tested on where "R" lives.
  const showLegends = reveal || isModifier;

  const finger = FINGER_COLORS[cap.finger];
  const fingerInk = FINGER_INK[cap.finger];

  const label = isModifier
    ? cap.en.lower
    : isSpace
      ? "רווח"
      : `${primary}${secondary ? ` (${secondary})` : ""}`;

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
              // The one key the step is about. It has to win against forty-
              // seven others at a glance, so it takes the brand fill outright
              // rather than a tint of it, and keeps the gold ring.
              ? "border-brand bg-brand text-white shadow-[0_0_0_5px_var(--color-star)]"
              : state === "dim"
                ? "border-brand-soft/50 bg-card text-ink opacity-55"
                : "border-brand-soft bg-card text-ink",
          "shadow-[0_3px_0_rgba(0,0,0,0.10)] active:shadow-none",
        ].join(" ")}
        style={{
          height: tile ? undefined : "var(--kh, 44px)",
          // A fixed 12px radius eats a 22px cap alive; scale it with the key.
          borderRadius: tile ? undefined : "calc(var(--kh, 44px) * 0.2)",
          // Every legend below is sized in em, so one declaration keeps the
          // whole cap readable at any scale.
          fontSize: tile ? undefined : "calc(var(--kh, 44px) * 0.4)",
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
          <span className="ltr overflow-hidden text-[0.78em] font-black leading-none">
            {isSpace ? "␣" : cap.en.lower}
          </span>
        ) : showLegends ? (
          <span className="flex h-full w-full items-center justify-center">
            {/* The active layout's character: centred, black, as big as the
                cap allows. This is the thing being hunted for. */}
            <span
              className={[
                activeIsHe ? "rtl" : "ltr",
                "absolute font-black leading-none",
                tile ? "text-[1.05em]" : "text-[1.42em]",
              ].join(" ")}
            >
              {primary}
            </span>
            {/* The other legend. It sits where it is silk-screened — the
                English one top-left, the Hebrew one bottom-right — and it is
                deliberately NOT a whisper: at 45% opacity and 0.62em it was
                invisible on a phone, which made half the keycap decorative.
                It is now a small solid badge, readable at arm's length. */}
            {secondary && (
              <span
                className={[
                  activeIsHe ? "ltr left-[0.12em] top-[0.08em]" : "rtl bottom-[0.08em] right-[0.12em]",
                  "absolute rounded-[0.25em] px-[0.14em] font-black leading-none",
                  tile ? "text-[0.5em]" : "text-[0.72em]",
                ].join(" ")}
                style={
                  // A filled cap (pressed, or the key the step is asking for)
                  // has a coloured face, so the badge switches to the light
                  // side of it rather than disappearing into it.
                  filled
                    ? { color: "rgba(255,255,255,0.95)", background: "rgba(255,255,255,0.22)" }
                    : {
                        color: "var(--color-brand)",
                        background: "color-mix(in srgb, var(--color-brand) 14%, transparent)",
                      }
                }
              >
                {secondary}
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
