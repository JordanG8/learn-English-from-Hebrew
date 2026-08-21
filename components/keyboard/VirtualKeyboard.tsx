"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { KeyCap, KeyCode, Lang } from "@/lib/types";
import { KEY_BY_CODE, KEY_ROWS, charFor } from "@/lib/keyboard-layout";
import { Key, type KeyVisualState } from "./Key";
import { LanguageSwitch } from "./LanguageSwitch";
import { useLangState, type LangChangeSource } from "./useAltShift";

/* ------------------------------------------------------------------ */
/* Public types                                                         */
/* ------------------------------------------------------------------ */

export type KeySource = "touch" | "physical";

export interface KeyEventMeta {
  lang: Lang;
  shift: boolean;
  source: KeySource;
  cap: KeyCap;
}

export type KeyboardMode = "auto" | "full" | "focus";

export interface VirtualKeyboardProps {
  /** Controlled layout. Omit to let the keyboard own it. */
  lang?: Lang;
  /** Initial layout when uncontrolled. Default "en". */
  defaultLang?: Lang;
  onLangChange?: (lang: Lang, via: LangChangeSource) => void;
  /** Render the he/en switch above the keys. Default true. */
  showLanguageSwitch?: boolean;
  /** Layout the current step needs; makes the switch demand an Alt+Shift. */
  requiredLang?: Lang | null;

  /** Keys to spotlight for this lesson step. */
  highlight?: KeyCode[];
  /** De-emphasise everything not highlighted. Default true when highlight is non-empty. */
  dim?: boolean;

  /**
   * A key was produced. `char` is null for modifiers and for keys with no glyph
   * in the active layout.
   */
  onKey?: (code: KeyCode, char: string | null, meta: KeyEventMeta) => void;
  /** Hook for the audio layer — fired at press time, before any state settles. */
  onSound?: (kind: "press" | "modifier") => void;

  /** Finger-position colour coding. Default false. */
  showFingers?: boolean;
  /** true = legends printed on the caps (recognition). false = blank (recall). */
  reveal?: boolean;

  /** Listen to the real hardware keyboard. Default true. */
  physical?: boolean;
  /** Swallow Space/Tab/Backspace so the page never scrolls or navigates. Default true. */
  captureKeys?: boolean;

  /**
   * "auto" / "full" — the whole keyboard, scaled to fit the width it is given.
   *                   It never scrolls and never rearranges, on any screen.
   * "focus"         — just the highlighted keys, as big tiles.
   */
  mode?: KeyboardMode;

  disabled?: boolean;
  className?: string;
}

/* ------------------------------------------------------------------ */

/**
 * The virtual keyboard: input device on touch, mirror + teaching aid on a
 * machine with real keys.
 */
export function VirtualKeyboard({
  lang: controlled,
  defaultLang = "en",
  onLangChange,
  showLanguageSwitch = true,
  requiredLang = null,
  highlight,
  dim,
  onKey,
  onSound,
  showFingers = false,
  reveal = true,
  physical = true,
  captureKeys = true,
  mode = "auto",
  disabled = false,
  className = "",
}: VirtualKeyboardProps) {
  const { lang, setLang } = useLangState({ lang: controlled, defaultLang, onLangChange });

  const highlighted = useMemo(() => new Set(highlight ?? []), [highlight]);
  const shouldDim = dim ?? highlighted.size > 0;

  /** Which keys are lit up right now. Cleared on a timer so a physical
   *  keypress flashes even if the child never lifts a finger on screen. */
  const [pressed, setPressed] = useState<ReadonlySet<KeyCode>>(new Set());
  const timers = useRef(new Map<KeyCode, ReturnType<typeof setTimeout>>());

  const flash = useCallback((code: KeyCode, hold: boolean) => {
    setPressed((prev) => {
      if (prev.has(code)) return prev;
      const next = new Set(prev);
      next.add(code);
      return next;
    });
    const existing = timers.current.get(code);
    if (existing) clearTimeout(existing);
    if (!hold) {
      timers.current.set(
        code,
        setTimeout(() => {
          timers.current.delete(code);
          setPressed((prev) => {
            if (!prev.has(code)) return prev;
            const next = new Set(prev);
            next.delete(code);
            return next;
          });
        }, 140),
      );
    }
  }, []);

  const unflash = useCallback((code: KeyCode) => {
    const existing = timers.current.get(code);
    if (existing) clearTimeout(existing);
    timers.current.delete(code);
    setPressed((prev) => {
      if (!prev.has(code)) return prev;
      const next = new Set(prev);
      next.delete(code);
      return next;
    });
  }, []);

  useEffect(() => {
    const running = timers.current;
    return () => {
      running.forEach((t) => clearTimeout(t));
      running.clear();
    };
  }, []);

  const emit = useCallback(
    (cap: KeyCap, shift: boolean, source: KeySource) => {
      const char = charFor(cap.code, lang, shift);
      onSound?.(char === null ? "modifier" : "press");
      onKey?.(cap.code, char, { lang, shift, source, cap });
    },
    [lang, onKey, onSound],
  );

  /* ---- touch input ------------------------------------------------- */
  const shiftHeld = useRef(false);
  const handleTouchPress = useCallback(
    (cap: KeyCap) => {
      // On-screen Shift is sticky: tap it, then tap a letter. Kids cannot hold
      // two on-screen keys at once on a phone.
      if (cap.code === "ShiftLeft" || cap.code === "ShiftRight") {
        shiftHeld.current = !shiftHeld.current;
        if (shiftHeld.current) flash(cap.code, true);
        else unflash(cap.code);
        onSound?.("modifier");
        return;
      }
      flash(cap.code, false);
      emit(cap, shiftHeld.current, "touch");
      if (shiftHeld.current) {
        shiftHeld.current = false;
        unflash("ShiftLeft");
        unflash("ShiftRight");
      }
    },
    [emit, flash, unflash, onSound],
  );

  /* ---- physical input ---------------------------------------------- */
  useEffect(() => {
    if (!physical || disabled) return;

    const down = (e: KeyboardEvent) => {
      /*
       * event.code, NEVER event.key.
       *
       * event.key is the *character the OS layout produced*. The moment a child
       * flips their OS input language to Hebrew — which this app actively
       * teaches them to do — pressing the physical A key yields event.key ===
       * "ש", and any lookup keyed on "a" silently stops working. event.code is
       * the physical position on the board and is identical in every layout, so
       * the A key is always "KeyA". That is the only thing we can trust.
       */
      const cap = KEY_BY_CODE.get(e.code);
      if (!cap) return;
      if (captureKeys && (e.code === "Space" || e.code === "Tab" || e.code === "Backspace")) {
        e.preventDefault(); // no page scroll, no back-navigation mid-lesson
      }
      if (e.repeat) return;
      flash(e.code, true);
      if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code.startsWith("Alt") || e.code.startsWith("Control")) {
        onSound?.("modifier");
        return; // modifiers mirror on screen but do not emit a character
      }
      emit(cap, e.shiftKey, "physical");
    };

    const up = (e: KeyboardEvent) => {
      if (KEY_BY_CODE.has(e.code)) unflash(e.code);
    };

    // A lost focus mid-chord would leave keys stuck lit.
    const clear = () => setPressed(new Set());

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [physical, disabled, captureKeys, emit, flash, unflash, onSound]);

  /* ---- layout selection -------------------------------------------- */
  /*
   * The board always fits.
   *
   * Every key width is a percentage of one 15-unit row, so the whole keyboard
   * scales to whatever width it is given and NEVER scrolls sideways: sliding a
   * keyboard around is worse than small keys, because a key that has to be
   * hunted for is not a key a child can learn a position for. Cap height is
   * driven off the container width (and capped against the viewport height, so
   * a landscape phone still shows all five rows), which keeps the caps square-
   * ish at any size.
   *
   * The consequence is that `mode="auto"` renders the full board on every
   * screen — the keys shrink instead of the layout changing. Focus tiles
   * remain available, but only when a caller explicitly asks for `mode="focus"`,
   * so the keyboard never rearranges itself underneath a child mid-lesson.
   */
  const focusMode = mode === "focus";

  const focusCaps = useMemo(() => {
    const wanted = highlight ?? [];
    const caps = wanted.map((c) => KEY_BY_CODE.get(c)).filter((c): c is KeyCap => Boolean(c));
    // Space earns its place whenever a word is being built.
    return caps.length > 0 ? caps : KEY_ROWS[2].slice(1, 9);
  }, [highlight]);

  const stateOf = (cap: KeyCap): KeyVisualState => {
    if (highlighted.has(cap.code)) return "highlight";
    return shouldDim ? "dim" : "normal";
  };

  const keyProps = {
    lang,
    reveal,
    showFingers,
    disabled,
    onPress: handleTouchPress,
  };

  return (
    <section
      className={`flex w-full flex-col items-center gap-3 ${className}`}
      aria-label="מקלדת"
    >
      {showLanguageSwitch && (
        <LanguageSwitch
          lang={lang}
          onLangChange={(next, via) => setLang(next, via)}
          requiredLang={requiredLang}
          enableShortcut={physical}
        />
      )}

      {focusMode ? (
        <div className="flex w-full flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-2" dir="ltr">
            {focusCaps.map((cap) => (
              <div key={cap.code} className="w-[calc(33.333%-0.5rem)] min-w-[88px] max-w-[120px]">
                <Key {...keyProps} cap={cap} state="highlight" pressed={pressed.has(cap.code)} tile />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="w-full pb-1"
          style={{ containerType: "inline-size" } as CSSProperties}
        >
          <div
            dir="ltr"
            className="mx-auto flex w-full max-w-[1100px] flex-col"
            style={
              {
                // 15 keyboard units across, each a share of the row: the board
                // is exactly as wide as its container, always.
                "--u": `${100 / 15}%`,
                // Cap height follows the container width so the caps stay
                // square-ish, and is capped against the viewport height so all
                // five rows survive a landscape phone. Small keys, never hidden
                // keys.
                "--kh": "clamp(20px, min(6.2cqw, 9.5vh), 72px)",
                // Gap between caps shrinks with them, or thin boards lose their
                // key area to padding.
                "--kp": "clamp(1px, 0.35cqw, 4px)",
              } as CSSProperties
            }
          >
            {KEY_ROWS.map((row, i) => (
              <div key={i} className="flex w-full">
                {row.map((cap) => (
                  <Key
                    {...keyProps}
                    key={cap.code}
                    cap={cap}
                    state={stateOf(cap)}
                    pressed={pressed.has(cap.code)}
                    onRelease={() => unflash(cap.code)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default VirtualKeyboard;
