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

import { LETTERS, letterIntroText } from "@/lib/curriculum/alphabet";
import {
  LETTER_PHONEME,
  PHONEMES,
  PHONEME_IDS,
  letterPhoneme,
  segmentsFor,
  type PhonemeId,
} from "@/lib/phonics";
import { WORDS } from "@/lib/curriculum/words";
import { SENTENCES } from "@/lib/curriculum/sentences";
import { LESSONS, TUTORIAL_LESSON } from "@/lib/curriculum/lessons";
import type { TutorialStep } from "@/lib/types";
import { MISSIONS } from "@/lib/garden/curriculum";
import { COURSE_GUIDES } from "./course-guides";

export type VoiceGroupId =
  | "garden"
  | "narration"
  | "letter-intro"
  | "letter-name"
  | "phoneme"
  | "soundout"
  | "word"
  | "sentence"
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

/**
 * One recording per SOUND, not per letter: C and K both play /k/, and the A in
 * CAT plays the very same clip the letter A lesson does. A letter's sound is
 * just the phoneme it teaches — see LETTER_PHONEME in lib/phonics.ts.
 */
export const phonemeLineId = (ph: PhonemeId): string => `phoneme-${ph}`;

export const letterSoundLineId = (letter: string): string =>
  phonemeLineId(LETTER_PHONEME[letter.toUpperCase()] ?? "a");

/** The short Hebrew introduction a letter lesson opens with — sound included. */
export const letterIntroLineId = (letter: string): string =>
  `narration-intro-${letter.toUpperCase()}`;

export const soundQuestionLineId = (letter: string): string =>
  `narration-sound-question-${letter.toUpperCase()}`;

/**
 * A word sounded out in ONE breath of one voice — "sss · uh · nnn, sss · uh ·
 * nnn, sun!" — rather than stitched from separate clips. Stitched, every
 * sound arrived with its own flat, finished intonation and the whole thing
 * sounded like a machine reading a list; performed, it rises and falls the way
 * a teacher's voice does. The clip carries time marks for each sound (see
 * VoiceClip.marks) so the letters still light up in step with it.
 */
export const soundoutLineId = (word: string): string =>
  `soundout-${word.toUpperCase().replace(/[^A-Z]/g, "")}`;


export const wordLineId = (word: string): string =>
  `word-${word.toUpperCase().replace(/[^A-Z0-9]/g, "")}`;

export const narrationLineId = (stepId: string): string =>
  `narration-${stepId}`;

/**
 * A whole sentence. The id is the sentence itself, lower-cased and
 * hyphenated — "I SEE A CAT" → "sentence-i-see-a-cat" — so it is readable in
 * a directory listing and stable as long as the sentence is. Editing a
 * sentence's wording orphans its recording, exactly as renaming any other id
 * does; that is the price of ids being filenames, and it is documented here
 * rather than discovered later.
 */
export const sentenceLineId = (sentence: string): string =>
  `sentence-${sentence
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;

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

function phonemeLines(): VoiceLine[] {
  const lettersFor = (ph: PhonemeId) =>
    Object.entries(LETTER_PHONEME)
      .filter(([, p]) => p === ph)
      .map(([l]) => l);
  return PHONEME_IDS.map((ph, i) => {
    const d = PHONEMES[ph];
    const letters = lettersFor(ph);
    return {
      id: phonemeLineId(ph),
      group: "phoneme" as const,
      lang: "en" as const,
      text: `/${d.ipa}/ — ${d.as}`,
      directionHe: `הצליל /${d.ipa}/ כמו ב־${d.as}${
        letters.length ? ` (האות ${letters.join(", ")})` : ""
      }. רק הצליל — קצר, בלי «ּה» בסוף.`,
      fallback: { text: d.as, rate: 0.6 },
      order: i,
    };
  });
}

function letterIntroLines(): VoiceLine[] {
  return LETTERS.map((d, i) => ({
    id: letterIntroLineId(d.letter),
    group: "letter-intro" as const,
    lang: "he" as const,
    text: `${letterIntroText(d.nameHe)} /${PHONEMES[letterPhoneme(d.letter) ?? "a"].ipa}/`,
    directionHe:
      "פתיחת שיעור האות — בעברית, חם ומזמין, ובסוף הצליל עצמו באנגלית, אחרי הפסקה קטנה.",
    fallback: null,
    order: i,
  }));
}

function soundoutLines(): VoiceLine[] {
  // Every word a child BUILDS is introduced by its sound-out first.
  const words = [...new Set(WORDS.map((w) => w.word.toUpperCase()))].sort();
  return words.map((word, i) => {
    const pass = segmentsFor(word)
      .filter((seg) => seg.ph)
      .map((seg) => seg.letters.toLowerCase())
      .join(" · ");
    return {
      id: soundoutLineId(word),
      group: "soundout" as const,
      lang: "en" as const,
      text: `${pass} … ${pass} … ${word.toLowerCase()}!`,
      directionHe: `לפרק את ${word} לצלילים — לאט, בחום, כמו מורה: פעמיים, ואז המילה כולה.`,
      // No synthesiser can perform this; without a recording the app plays
      // the separate sound clips in order instead.
      fallback: null,
      order: i,
    };
  });
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

/**
 * SENTENCES. Nobody has recorded one yet, and the sentence phase shipped
 * without waiting for that: every line here has a TTS fallback, so a child
 * playing level 76 today hears the browser voice read the sentence, and hears
 * a human read it the moment somebody records it in /studio — no code change,
 * no deploy. A recorded sentence is worth a great deal more than a recorded
 * word (prosody is most of what makes a sentence comprehensible), which is
 * why these are in the required set rather than the optional one: the studio
 * should show them as work outstanding, because they are.
 */
function sentenceLines(): VoiceLine[] {
  return SENTENCES.map((x, i) => ({
    id: sentenceLineId(x.text),
    group: "sentence" as const,
    lang: "en" as const,
    text: x.text.toLowerCase(),
    directionHe: `המשפט «${x.he}» — קראו אותו כמו שמדברים, לא מילה־מילה.`,
    fallback: { text: x.text.toLowerCase(), rate: 0.65 },
    order: i,
  }));
}

export const VOICE_GROUPS: readonly VoiceGroup[] = [
  {
    id: "garden", titleHe: "הגינה של הינשוף", blurbHe: "הוראות בעברית לשלוש ההרפתקאות הראשונות.",
    lines: [...MISSIONS.flatMap(m => m.steps).map((step, order) => ({ id: `garden-${step.id}`, group: "garden" as const, lang: "he" as const, text: step.instruction, directionHe: "קראו רק את ההוראה, בנחת ובבהירות.", fallback: null, order })), ...COURSE_GUIDES.map((guide,order) => ({id:guide.id,group:"garden" as const,lang:"he" as const,text:guide.text,directionHe:"קראו בנחת ובבהירות.",fallback:null,order:100+order}))],
  },
  {
    id: "narration",
    titleHe: "ההדרכה",
    blurbHe: "מה שהילד שומע בפעם הראשונה שהוא נכנס. בעברית.",
    lines: tutorialLines("walkthrough"),
  },
  {
    id: "letter-intro",
    titleHe: "פתיחת האותיות",
    blurbHe: "«זאת האות איי, הצליל שלה הוא…» — ואז הצליל עצמו.",
    lines: [
      ...letterIntroLines(),
      ...LETTERS.map((d, i): VoiceLine => ({
        id: soundQuestionLineId(d.letter),
        group: "letter-intro",
        lang: "he",
        text: `איזה צליל עושה האות ${d.nameHe}?`,
        directionHe: "קראו רק את השאלה, עם שם האות. בלי הצליל שלה ובלי ההוראות שמתחת לשאלה.",
        fallback: null,
        order: LETTERS.length + i,
      })),
    ],
  },
  {
    id: "letter-name",
    titleHe: "שמות האותיות",
    blurbHe: "איי, בי, סי… — איך קוראים לאות.",
    lines: letterNameLines(),
  },
  {
    id: "phoneme",
    titleHe: "צלילים",
    blurbHe:
      "סְ, אַ, טְ… — הצליל של כל אות, וגם צלילים של צירופים (sh, ee, oo). מהם בנויה כל מילה כשמפרקים אותה.",
    lines: phonemeLines(),
  },
  {
    id: "soundout",
    titleHe: "מפרקים מילה",
    blurbHe: "«ססס · אָ · ננן… שמש!» — כל מילה חדשה, מפורקת לצלילים בנשימה אחת.",
    lines: soundoutLines(),
  },
  {
    id: "word",
    titleHe: "מילים",
    blurbHe: "כל מילה שהילד בונה או שומע.",
    lines: wordLines(),
  },
  {
    id: "sentence",
    titleHe: "משפטים",
    blurbHe:
      "המשפטים של השלבים האחרונים. אלה עוד לא מוקלטים - עד שיוקלטו הילד שומע את הקול של הדפדפן.",
    lines: sentenceLines(),
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
