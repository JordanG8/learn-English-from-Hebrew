"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/types";

/**
 * Alt+Shift — the real Windows/Israeli input-language chord.
 *
 * Detection notes:
 *  • We watch `event.code` (AltLeft/AltRight/ShiftLeft/ShiftRight) rather than
 *    `event.key`, because `event.key` for a modifier is "Alt"/"Shift" but the
 *    *other* keys in the app are matched by code and we want one consistent
 *    rule everywhere.
 *  • The chord fires once per press, latched until BOTH modifiers are released.
 *    Without the latch, holding Alt and tapping Shift twice would flip-flop the
 *    layout under the child's fingers.
 *  • Some browsers/OSes swallow the real Alt+Shift before it reaches the page
 *    (it is an OS-level shortcut). That is fine and even desirable: the OS
 *    switched too. The visible tap toggle in <LanguageSwitch/> is the
 *    guaranteed path, and lessons should accept either.
 */
export function useAltShift(onChord: () => void, enabled = true): void {
  const latched = useRef(false);
  const handler = useRef(onChord);
  handler.current = onChord;

  useEffect(() => {
    if (!enabled) return;

    const isAlt = (c: string) => c === "AltLeft" || c === "AltRight";
    const isShift = (c: string) => c === "ShiftLeft" || c === "ShiftRight";

    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (!isAlt(e.code) && !isShift(e.code)) return;
      // Both halves of the chord down at once?
      const both = (e.altKey || isAlt(e.code)) && (e.shiftKey || isShift(e.code));
      if (both && !latched.current) {
        latched.current = true;
        // Stop the browser using Alt as a menu accelerator mid-lesson.
        e.preventDefault();
        handler.current();
      }
    };

    const up = (e: KeyboardEvent) => {
      if (isAlt(e.code) || isShift(e.code)) {
        if (!e.altKey && !e.shiftKey) latched.current = false;
      }
    };

    const blur = () => {
      latched.current = false;
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [enabled]);
}

export interface LangStateOptions {
  /** Controlled value. When provided, the hook never owns the state. */
  lang?: Lang;
  /** Initial value for the uncontrolled case. */
  defaultLang?: Lang;
  onLangChange?: (lang: Lang, via: LangChangeSource) => void;
}

export type LangChangeSource = "tap" | "alt-shift" | "api";

/**
 * Controlled/uncontrolled language state, shared by <VirtualKeyboard/> and
 * <LanguageSwitch/>. Nothing here ever switches on its own — a switch is
 * always the result of a child doing something, which is the teaching point.
 */
export function useLangState(opts: LangStateOptions): {
  lang: Lang;
  setLang: (next: Lang, via: LangChangeSource) => void;
  toggle: (via: LangChangeSource) => void;
} {
  const { lang: controlled, defaultLang = "en", onLangChange } = opts;
  const [uncontrolled, setUncontrolled] = useState<Lang>(defaultLang);
  const lang = controlled ?? uncontrolled;

  const setLang = useCallback(
    (next: Lang, via: LangChangeSource) => {
      if (controlled === undefined) setUncontrolled(next);
      onLangChange?.(next, via);
    },
    [controlled, onLangChange],
  );

  const toggle = useCallback(
    (via: LangChangeSource) => setLang(lang === "en" ? "he" : "en", via),
    [lang, setLang],
  );

  return { lang, setLang, toggle };
}
