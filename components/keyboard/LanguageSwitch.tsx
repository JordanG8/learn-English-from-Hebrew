"use client";

import type { Lang } from "@/lib/types";
import { useAltShift, useLangState, type LangChangeSource } from "./useAltShift";

/**
 * The he/en switch — and the lesson in how to change input language.
 *
 * Israeli children have to learn Alt+Shift, so this component teaches it three
 * ways at once: it is tappable (touch devices have no Alt), it listens for the
 * real chord (laptops and bluetooth keyboards), and it says "Alt+Shift" on its
 * face so the shortcut is visible even when the child taps.
 *
 * No flags. Flags carry political weight and do not map onto languages — an
 * English learner in Israel is not learning "American". The identity channels
 * are: a glyph from the script itself (A / א), the language's own name, and a
 * colour. Three channels, per design-system rule 3.
 */

const IDENTITY: Record<Lang, { glyph: string; name: string; sub: string; color: string; ink: string }> = {
  en: {
    glyph: "A",
    name: "English",
    sub: "אנגלית",
    color: "var(--color-brand)",
    ink: "#ffffff",
  },
  he: {
    glyph: "א",
    name: "עברית",
    sub: "Hebrew",
    color: "oklch(0.55 0.13 200)",
    ink: "#ffffff",
  },
};

export interface LanguageSwitchProps {
  /** Controlled language. Omit for uncontrolled. */
  lang?: Lang;
  /** Initial language when uncontrolled. Default "en". */
  defaultLang?: Lang;
  /** Fired on every switch, with how the child performed it. */
  onLangChange?: (lang: Lang, via: LangChangeSource) => void;
  /**
   * The layout the current lesson step needs. When it differs from `lang` the
   * switch draws attention to itself. It NEVER switches by itself — the child
   * must perform Alt+Shift or tap. That performance is the skill being taught.
   */
  requiredLang?: Lang | null;
  /** Listen for a real Alt+Shift. Default true. */
  enableShortcut?: boolean;
  /** Show the "press Alt+Shift" coaching line. Default true. */
  showHint?: boolean;
  /** Fired when the child switched into a layout the step did not ask for. */
  onWrongLang?: (lang: Lang) => void;
  size?: "sm" | "lg";
  className?: string;
}

export function LanguageSwitch({
  lang: controlled,
  defaultLang = "en",
  onLangChange,
  requiredLang = null,
  enableShortcut = true,
  showHint = true,
  onWrongLang,
  size = "lg",
  className = "",
}: LanguageSwitchProps) {
  const { lang, toggle } = useLangState({ lang: controlled, defaultLang, onLangChange });

  const change = (via: LangChangeSource) => {
    const next: Lang = lang === "en" ? "he" : "en";
    toggle(via);
    if (requiredLang && next !== requiredLang) onWrongLang?.(next);
  };

  useAltShift(() => change("alt-shift"), enableShortcut);

  const needsSwitch = requiredLang !== null && requiredLang !== lang;
  const now = IDENTITY[lang];
  const other = IDENTITY[lang === "en" ? "he" : "en"];
  const big = size === "lg";

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => change("tap")}
        aria-label={`שפת הקלדה: ${now.sub === "Hebrew" ? "עברית" : "אנגלית"}. החליפו ל${other.sub === "Hebrew" ? "עברית" : "אנגלית"} (Alt+Shift)`}
        aria-pressed={lang === "he"}
        className={[
          "flex items-center gap-3 rounded-[var(--radius-kid)] border-4 bg-card px-4",
          big ? "min-h-[72px]" : "min-h-[64px]",
          // A landscape phone has ~390px of height for a header, a prompt,
          // this switch AND five rows of keys. The switch is the part that
          // can shrink without anything being lost, so on a short viewport it
          // does — the keys are what the child came for.
          "[@media(max-height:560px)]:min-h-[48px] [@media(max-height:560px)]:gap-2 [@media(max-height:560px)]:px-2",
          "transition-transform duration-75 active:translate-y-1",
          needsSwitch ? "animate-pulse border-warn shadow-[0_0_0_6px_var(--color-star)]" : "border-brand-soft",
        ].join(" ")}
        style={{ touchAction: "manipulation" }}
      >
        {/* ACTIVE side — big, coloured, unmistakable. */}
        <span
          className="flex h-14 min-w-14 items-center justify-center rounded-2xl text-3xl font-black [@media(max-height:560px)]:h-9 [@media(max-height:560px)]:min-w-9 [@media(max-height:560px)]:text-xl"
          style={{ background: now.color, color: now.ink }}
        >
          <span className={lang === "en" ? "ltr" : "rtl"}>{now.glyph}</span>
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span
            className="text-xl font-bold [@media(max-height:560px)]:text-base"
            style={{ color: now.color }}
          >
            {now.name}
          </span>
          <span className="text-sm text-ink-soft [@media(max-height:560px)]:hidden">{now.sub}</span>
        </span>

        {/* INACTIVE side — small and faded, so "what am I in?" is never a question. */}
        <span className="mx-1 text-2xl text-ink-soft" aria-hidden="true">
          ⇄
        </span>
        <span
          className="flex h-9 min-w-9 items-center justify-center rounded-xl text-lg font-bold opacity-40"
          style={{ background: other.color, color: other.ink }}
          aria-hidden="true"
        >
          {other.glyph}
        </span>
      </button>

      {/* The shortcut, always visible — this is the thing being taught. */}
      {showHint && (
        <p
          className={`rtl flex items-center gap-2 text-center text-base ${
            needsSwitch
              ? "font-bold text-stop"
              : // The passive reminder is worth a line on a phone held upright
                // and worth a row of keys nowhere. It goes first when the
                // screen is short; the red "switch now" instruction stays.
                "text-ink-soft [@media(max-height:560px)]:hidden"
          }`}
        >
          <span aria-hidden="true">{needsSwitch ? "👉" : "⌨️"}</span>
          {needsSwitch ? (
            <span>
              עברו ל
              {requiredLang === "en" ? "אנגלית" : "עברית"} — לחצו{" "}
              <kbd className="ltr rounded bg-brand-soft px-2 py-0.5 font-bold">Alt+Shift</kbd>
            </span>
          ) : (
            <span>
              להחלפת שפה: <kbd className="ltr rounded bg-brand-soft px-2 py-0.5 font-bold">Alt+Shift</kbd>
            </span>
          )}
        </p>
      )}
    </div>
  );
}

export default LanguageSwitch;
