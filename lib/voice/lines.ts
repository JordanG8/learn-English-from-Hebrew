/**
 * THE VOICE-LINE CATALOGUE — every spoken line in the app, enumerated.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every English sound in this app used to come from the browser's
 * SpeechSynthesis voice. That voice is robotic, it varies wildly between an
 * iPhone and a school Chromebook, and it mispronounces exactly the thing the
 * app is teaching (letter *sounds* — "ah", "buh" — are not words, so TTS
 * guesses). A recorded human voice fixes all three at once.
 *
 * So: this module is the single, closed list of what a human needs to record.
 * The recording studio (/studio) renders this list; the player
 * (lib/voice/manifest.ts) looks a line up by id at playback time; TTS remains
 * only as the fallback for lines nobody has recorded yet.
 *
 * INVARIANTS
 * ----------
 *  · An id is stable and filename-safe (`[a-z0-9-]`), because it IS the
 *    stored filename. Renaming an id orphans a recording — don't.
 *  · The list is derived from the curriculum, not hand-written, so a new
 *    letter or word shows up in the studio automatically.
 *  · Every line carries a TTS fallback, so the app never goes silent while
 *    recording is incomplete.
 */

import { LETTERS } from "@/lib/curriculum/alphabet";
import { WORDS } from "@/lib/curriculum/words";
import { LESSONS, TUTORIAL_LESSON } from "@/lib/curriculum/lessons";
import type { TutorialStep } from "@/lib/types";

export type VoiceGroupId =
  | "narration"
  | "letter-name"
  | "letter-sound"
  | "word"
  | "lesson-card";

export interface VoiceLine {
  /** Stable, filename-safe. This is the storage key. */
  id: string;
  group: VoiceGroupId;
  /** Which language the human should speak in. Drives the studio's direction. */
  lang: "en" | "he";
  /** The text to say, verbatim. */
  text: string;
  /** Hebrew coaching for whoever is holding the phone. */
  directionHe: string;
  /** What the app does when this line has no recording. */
  fallback: { text: string; rate: number } | null;
  /** Sort key inside its group — teaching order, not alphabetical. */
  order: number;
}

export interface VoiceGroup {
  id: VoiceGroupId;
  titleHe: string;
  blurbHe: string;
  /**
   * Optional groups are lines the app never spoke in the first place — the
   * Hebrew cards inside lessons. Recording them is an upgrade, not a
   * requirement, so they are kept out of the headline progress: a session
   * that finishes every line the app actually speaks should read 100%.
   */
  optional?: boolean;
  lines: VoiceLine[];
}

/* ------------------------------------------------------------------ */
/* Id builders — the ONLY place ids are constructed                     */
/* ------------------------------------------------------------------ */

export const letterNameLineId = (letter: string): string =>
  `letter-name-${letter.toUpperCase()}`;

export const letterSoundLineId = (letter: string): string =>
  `letter-sound-${letter.toUpperCase()}`;

export const wordLineId = (word: string): string =>
  `word-${word.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;

export const narrationLineId = (stepId: string): string =>
  `narration-${stepId}`;

/** Ids are filenames. Anything else is rejected at the API boundary. */
export const VOICE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/* ------------------------------------------------------------------ */
/* The catalogue                                                        */
/* ------------------------------------------------------------------ */

/**
 * Tutorial cards, split into the two that matter differently:
 * the first-visit walkthrough (`walkthrough`), which every child sees before
 * any English, and every other tutorial card sitting inside a lesson
 * (`lesson`), which is a nice-to-have.
 */
function tutorialLines(which: "walkthrough" | "lesson"): VoiceLine[] {
  const seen = new Set<string>();
  const out: VoiceLine[] = [];
  const lessons =
    which === "walkthrough" ? [TUTORIAL_LESSON] : LESSONS;
  for (const lesson of lessons) {
    if (which === "lesson" && lesson.id === TUTORIAL_LESSON.id) continue;
    for (const step of lesson.steps) {
      if (step.type !== "tutorial") continue;
      const s = step as TutorialStep;
      const id = narrationLineId(s.id);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        group: which === "walkthrough" ? "narration" : "lesson-card",
        lang: "he",
        text: s.promptHe,
        directionHe:
          which === "walkthrough"
            ? "ההדרכה הראשונה - הקריאו בעברית, חם ואיטי"
            : `כרטיס בשיעור «${lesson.titleHe}» - הקריאו בעברית`,
        // Hebrew narration has no TTS fallback on purpose: a robotic Hebrew
        // voice reading to a 7-year-old is worse than the silence the app
        // shipped with. The text is always on screen regardless.
        fallback: null,
        order: out.length,
      });
    }
  }
  return out;
}

function letterNameLines(): VoiceLine[] {
  return LETTERS.map((d, i) => ({
    id: letterNameLineId(d.letter),
    group: "letter-name" as const,
    lang: "en" as const,
    text: d.nameEn,
    directionHe: `השם של האות — «${d.nameHe}». לא הצליל.`,
    fallback: { text: d.nameEn, rate: 0.7 },
    order: i,
  }));
}

function letterSoundLines(): VoiceLine[] {
  return LETTERS.map((d, i) => ({
    id: letterSoundLineId(d.letter),
    group: "letter-sound" as const,
    lang: "en" as const,
    text: d.soundSpeak,
    directionHe: `הצליל של האות — «${d.soundHe}» ${d.ipa}. קצר, בלי «ּה» בסוף.`,
    fallback: { text: d.soundSpeak, rate: 0.6 },
    order: i,
  }));
}

function wordLines(): VoiceLine[] {
  // Both the word bank (what the child builds) and the per-letter example
  // words (what the letter-shape step shows) get spoken, so both are here.
  const glosses = new Map<string, string>();
  for (const w of WORDS) glosses.set(w.word.toUpperCase(), w.he);
  for (const d of LETTERS) {
    const key = d.exampleWord.toUpperCase();
    if (!glosses.has(key)) glosses.set(key, d.exampleWordHe);
  }
  return [...glosses.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([word, he], i) => ({
      id: wordLineId(word),
      group: "word" as const,
      lang: "en" as const,
      text: word.toLowerCase(),
      directionHe: `המילה «${he}» — אמרו אותה באנגלית, טבעי ולא מודגש.`,
      fallback: { text: word.toLowerCase(), rate: 0.7 },
      order: i,
    }));
}

export const VOICE_GROUPS: readonly VoiceGroup[] = [
  {
    id: "narration",
    titleHe: "ההדרכה",
    blurbHe: "מה שהילד שומע בפעם הראשונה שהוא נכנס. בעברית.",
    lines: tutorialLines("walkthrough"),
  },
  {
    id: "letter-name",
    titleHe: "שמות האותיות",
    blurbHe: "איי, בי, סי… — איך קוראים לאות.",
    lines: letterNameLines(),
  },
  {
    id: "letter-sound",
    titleHe: "צלילי האותיות",
    blurbHe: "אַ, בְּ, קְ… — הצליל שהאות עושה. זה מה ש‑TTS הכי מקלקל.",
    lines: letterSoundLines(),
  },
  {
    id: "word",
    titleHe: "מילים",
    blurbHe: "כל מילה שהילד בונה או שומע.",
    lines: wordLines(),
  },
  {
    id: "lesson-card",
    titleHe: "כרטיסי שיעור",
    blurbHe:
      "הסברים בעברית שמופיעים בתוך השיעורים. היום הם רק טקסט - הקלטה כאן היא תוספת, לא חובה.",
    optional: true,
    lines: tutorialLines("lesson"),
  },
];

/** The lines the app actually speaks. What "100% recorded" should mean. */
export const REQUIRED_VOICE_LINES: readonly VoiceLine[] = VOICE_GROUPS.filter(
  (g) => !g.optional,
).flatMap((g) => g.lines);

export const VOICE_LINES: readonly VoiceLine[] = VOICE_GROUPS.flatMap(
  (g) => g.lines,
);

const BY_ID = new Map(VOICE_LINES.map((l) => [l.id, l]));

export function getVoiceLine(id: string): VoiceLine | undefined {
  return BY_ID.get(id);
}

/** True for ids this build knows about — used to prune stale recordings. */
export function isKnownVoiceLine(id: string): boolean {
  return BY_ID.has(id);
}
