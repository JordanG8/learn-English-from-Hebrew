/**
 * The opening story for the first adventure encounter.
 *
 * These ids are deliberately stable: `sayNarration(beat.stepId)` resolves the
 * existing `narration-${stepId}` voice line, while the client remains unaware
 * of providers, credentials, or model-specific voice ids.
 */

export type LetterGroveCutsceneSpeaker = "narrator" | "pop";

export type LetterGroveSceneCue =
  | "grove-arrival"
  | "meet-pop"
  | "fog-threat"
  | "rune-lesson"
  | "quest-promise";

export interface LetterGroveCutsceneBeat {
  /** Stable step id. The voice catalogue turns it into `narration-${stepId}`. */
  stepId: string;
  /** Lets the Three.js scene choose a camera, animation, or focal target. */
  sceneCue: LetterGroveSceneCue;
  speaker: LetterGroveCutsceneSpeaker;
  speakerLabelHe: string;
  titleHe: string;
  /** Captions and narration are identical, so audio never carries extra facts. */
  textHe: string;
  /** A rough timing hint for animation direction and generation QA. */
  durationHintMs: number;
  /** A compact non-semantic mark shown when no custom visual is supplied. */
  sigil: string;
}

/**
 * Exact v1 script. It establishes place, ally, threat, learning mechanic,
 * immediate goal, and reward before the child is asked their first question.
 */
export const LETTER_GROVE_CUTSCENE_BEATS = [
  {
    stepId: "letter-grove-cutscene-arrival",
    sceneCue: "grove-arrival",
    speaker: "narrator",
    speakerLabelHe: "המספרת",
    titleHe: "חורשת האותיות",
    textHe: "ברוכים הבאים לחורשת האותיות. פעם, צלילי האנגלית האירו כאן כל שביל.",
    durationHintMs: 6_000,
    sigil: "✦",
  },
  {
    stepId: "letter-grove-cutscene-pop",
    sceneCue: "meet-pop",
    speaker: "pop",
    speakerLabelHe: "פופ",
    titleHe: "הכירו את פופ",
    textHe:
      "אני פופ, השומר הקטן של החורשה. אני חבר שלכם — אבל הערפל בלבל אותי, ועכשיו אני לא מוצא את הדרך.",
    durationHintMs: 8_000,
    sigil: "●",
  },
  {
    stepId: "letter-grove-cutscene-fog",
    sceneCue: "fog-threat",
    speaker: "narrator",
    speakerLabelHe: "המספרת",
    titleHe: "ערפל הבלבול",
    textHe:
      "ערפל הבלבול כיבה שלוש אבני קסם שנקראות רונות. כל עוד הן חשוכות, השביל נשאר מוסתר.",
    durationHintMs: 7_500,
    sigil: "≋",
  },
  {
    stepId: "letter-grove-cutscene-runes",
    sceneCue: "rune-lesson",
    speaker: "pop",
    speakerLabelHe: "פופ",
    titleHe: "כך מטילים קסם",
    textHe:
      "על אבני הקסם חרותות אותיות שאתם כבר מכירים. גררו קו מאות לאות לפי הסדר, והמילה תהפוך לכישוף!",
    durationHintMs: 8_000,
    sigil: "A",
  },
  {
    stepId: "letter-grove-cutscene-quest",
    sceneCue: "quest-promise",
    speaker: "narrator",
    speakerLabelHe: "המספרת",
    titleHe: "המשימה שלכם",
    textHe:
      "צרו שלוש מילים, הדליקו את כל הרונות, פזרו את הערפל ועזרו לפופ. כשתצליחו, שרביט החורשה יהיה שלכם!",
    durationHintMs: 7_500,
    sigil: "✧",
  },
] as const satisfies readonly LetterGroveCutsceneBeat[];
