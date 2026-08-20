"use client";

/**
 * KEYBOARD ADAPTER — the single seam between lesson code and the keyboard
 * components owned by the keyboard agent (`components/keyboard/*`).
 *
 * Everything outside this file imports `KeyboardSurface` from here and never
 * reaches into `components/keyboard` directly. The adapter exists because the
 * lesson UI and the keyboard were built concurrently: it translates the
 * lesson layer's vocabulary (a `PressKeyStep` wants "this key, in this
 * layout, with or without a hint") into whatever the keyboard's props happen
 * to be, so a change on either side is a change to ONE file.
 *
 * Two mappings worth knowing:
 *   · `hint` → `reveal`. Hint on means the legends are printed (recognition);
 *     hint off means blank caps (recall). This is the scaffold dial, and it is
 *     the SRS that turns it down — see LessonPlayer.
 *   · `highlight` must never be empty on a press-key step: on a phone the
 *     keyboard degrades to focus tiles built FROM the highlight, so an empty
 *     highlight makes it unusable on the device most children will hold.
 */

import { useCallback } from "react";
import type { KeyCode, Lang } from "./types";
import { VirtualKeyboard, type KeyEventMeta } from "@/components/keyboard";
import { charFor } from "./keyboard-layout";

export interface KeyboardSurfaceProps {
  /** Controlled layout — which language's glyphs are emphasised. */
  lang: Lang;
  /** The child performs the switch; we only observe it. */
  onLangChange?: (lang: Lang) => void;
  /** The layout this step needs. A mismatch makes the switch demand Alt+Shift. */
  requiredLang?: Lang | null;
  /** Keys to light up. Also drives phone focus-tile mode — keep it non-empty. */
  highlight?: readonly KeyCode[];
  /** True = legends printed (recognition). False = blank caps (recall). */
  reveal?: boolean;
  /** Finger colour coding, for typing-technique lessons. */
  showFingers?: boolean;
  /** The keyboard renders its own LanguageSwitch unless this is false. */
  showLanguageSwitch?: boolean;
  /**
   * Every key activation, by touch or by real hardware.
   * `lang` is the layout that was ACTIVE at press time — compare against the
   * step's required layout rather than tracking it separately, or a physical
   * Alt+Shift can race the React state.
   */
  onKey: (code: KeyCode, char: string | null, lang: Lang) => void;
  disabled?: boolean;
  className?: string;
}

export function KeyboardSurface({
  lang,
  onLangChange,
  requiredLang = null,
  highlight = [],
  reveal = true,
  showFingers = false,
  showLanguageSwitch = true,
  onKey,
  disabled = false,
  className,
}: KeyboardSurfaceProps) {
  const handleKey = useCallback(
    (code: KeyCode, char: string | null, meta: KeyEventMeta) => {
      onKey(code, char, meta.lang);
    },
    [onKey],
  );

  return (
    <VirtualKeyboard
      lang={lang}
      onLangChange={onLangChange ? (next) => onLangChange(next) : undefined}
      requiredLang={requiredLang}
      highlight={[...highlight]}
      reveal={reveal}
      showFingers={showFingers}
      showLanguageSwitch={showLanguageSwitch}
      onKey={handleKey}
      disabled={disabled}
      className={className}
    />
  );
}

export { charFor };
