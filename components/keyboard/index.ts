/**
 * The virtual keyboard's public surface. Lesson code imports from here only:
 *
 *   import { VirtualKeyboard, LanguageSwitch } from "@/components/keyboard";
 *
 * The layout data itself lives in `@/lib/keyboard-layout` because it is plain
 * data with no React dependency — a server component or a scoring routine can
 * import it without pulling the UI in.
 */

export { VirtualKeyboard } from "./VirtualKeyboard";
export type {
  VirtualKeyboardProps,
  KeyEventMeta,
  KeySource,
  KeyboardMode,
} from "./VirtualKeyboard";

export { LanguageSwitch } from "./LanguageSwitch";
export type { LanguageSwitchProps } from "./LanguageSwitch";

export { Key } from "./Key";
export type { KeyProps, KeyVisualState } from "./Key";

export { useAltShift, useLangState } from "./useAltShift";
export type { LangChangeSource, LangStateOptions } from "./useAltShift";
