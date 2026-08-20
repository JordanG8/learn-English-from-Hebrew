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
 *  • We track "is Alt down" / "is Shift down" ourselves in refs, rather than
 *    trusting `event.altKey`/`event.shiftKey` on the *other* key's event.
 *    Those flags are unreliable across browsers/OSes right at the instant a
 *    modifier itself is pressed (observed: Firefox on Windows can report
 *    `shiftKey: false` on the ShiftLeft keydown event itself), which was
 *    silently breaking the chord. Our own refs don't depend on that.
 *  • The chord fires once per press, latched until BOTH modifiers are released.
 *    Without the latch, holding Alt and tapping Shift twice would flip-flop the
 *    layout under the child's fingers.
 *  • We preventDefault on every Alt/Shift keydown (not just once the chord
 *    completes) because in Firefox and old Edge, tapping Alt alone moves
 *    focus to the browser's menu bar — which then swallows the Shift keydown
 *    before it ever reaches the page, so the chord never completes.
 *  • Some browsers/OSes still swallow the real Alt+Shift before it reaches
 *    the page (a true OS-level global shortcut). That is fine and even
 *    desirable: the OS switched too. The visible tap toggle in
 *    <LanguageSwitch/> is the guaranteed path, and lessons should accept
 *    either.
 */
export function useAltShift(onChord: () => void, enabled = true): void {
  const latched = useRef(false);
  const altDown = useRef(false);
  const shiftDown = useRef(false);
  const handler = useRef(onChord);
  handler.current = onChord;

  useEffect(() => {
    if (!enabled) return;

    const isAlt = (c: string) => c === "AltLeft" || c === "AltRight";
    const isShift = (c: string) => c === "ShiftLeft" || c === "ShiftRight";

    const down = (e: KeyboardEvent) => {
      if (!isAlt(e.code) && !isShift(e.code)) return;
      if (isAlt(e.code)) altDown.current = true;
      if (isShift(e.code)) shiftDown.current = true;
      // Stop Alt/Shift acting as a menu accelerator or focus-stealer mid-lesson.
      e.preventDefault();
      if (e.repeat) return;
      if (altDown.current && shiftDown.current && !latched.current) {
        latched.current = true;
        handler.current();
      }
    };

    const up = (e: KeyboardEvent) => {
      if (isAlt(e.code)) altDown.current = false;
      if (isShift(e.code)) shiftDown.current = false;
      if (!altDown.current && !shiftDown.current) latched.current = false;
    };

    const blur = () => {
      altDown.current = false;
      shiftDown.current = false;
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
