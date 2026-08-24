/**
 * GAME WORLD CONTRACT
 *
 * Curriculum owns what a child practices. This file owns how that practice is
 * dressed as an adventure. Keeping the two separate lets writers add a lesson
 * without needing to touch a renderer, and lets artists change a biome without
 * changing learning logic.
 */

export type WorldZone = {
  id: "letter-grove" | "word-cove" | "sentence-peaks" | "conversation-city";
  titleHe: string;
  subtitleHe: string;
  curriculum: "letters" | "words" | "sentences" | "conversation";
  colour: string;
  sky: string;
  ground: string;
  monster: { nameHe: string; emoji: string; weaknessHe: string };
  reward: { nameHe: string; emoji: string };
};

export const WORLD_ZONES: readonly WorldZone[] = [
  {
    id: "letter-grove",
    titleHe: "חורשת האותיות",
    subtitleHe: "לומדים צלילים ומדליקים רונות",
    curriculum: "letters",
    colour: "#7c5cff",
    sky: "#dce9ff",
    ground: "#8ccf87",
    monster: { nameHe: "ערפל הבלבול", emoji: "👾", weaknessHe: "הצליל הנכון" },
    reward: { nameHe: "שרביט רונות", emoji: "🪄" },
  },
  {
    id: "word-cove",
    titleHe: "מפרץ המילים",
    subtitleHe: "בונים מילים ומזמנים יצורים ידידותיים",
    curriculum: "words",
    colour: "#ff7c57",
    sky: "#ffe2c4",
    ground: "#f3bf70",
    monster: { nameHe: "סרטן הערבוב", emoji: "🦀", weaknessHe: "מילה שלמה" },
    reward: { nameHe: "מצפן אוצרות", emoji: "🧭" },
  },
  {
    id: "sentence-peaks",
    titleHe: "פסגות המשפטים",
    subtitleHe: "מחברים מילים כדי לפתוח שבילי הרים",
    curriculum: "sentences",
    colour: "#31a9bf",
    sky: "#d2f2ff",
    ground: "#82b4a2",
    monster: { nameHe: "הענן המבולגן", emoji: "☁️", weaknessHe: "משפט מסודר" },
    reward: { nameHe: "גלימת מטיילים", emoji: "🧥" },
  },
  {
    id: "conversation-city",
    titleHe: "עיר השיחות",
    subtitleHe: "משתמשים באנגלית כדי לעזור לדמויות בעיר",
    curriculum: "conversation",
    colour: "#e85d9a",
    sky: "#f9d8ee",
    ground: "#b89cb5",
    monster: { nameHe: "הד השקט", emoji: "👻", weaknessHe: "משפט אמיץ" },
    reward: { nameHe: "כתר מספר סיפורים", emoji: "👑" },
  },
];

export const AVATAR_STYLES = [
  { id: "violet", labelHe: "סגול", colour: "#6d5dfc" },
  { id: "coral", labelHe: "כתום", colour: "#f77754" },
  { id: "aqua", labelHe: "טורקיז", colour: "#24a9b5" },
] as const;

/** The deliberately tiny contract for the first production-like encounter. */
export const LETTER_GROVE_SLICE = {
  id: "letter-grove-first-rune",
  nextEncounterId: "letter-grove-sun-gate",
  zoneId: "letter-grove",
  letter: "S",
  questionCount: 3,
  creature: {
    nameHe: "פּוֹפּ",
    descriptionHe: "שומר רונות קטן שנתקע בתוך ערפל הבלבול",
  },
  reward: {
    id: "rune-wand",
    nameHe: "שרביט הרונה הסגולה",
    emoji: "🪄",
  },
} as const;
