/**
 * THE VOICE SCRIPT — every line of audio this app can play, derived from the
 * content rather than hand-listed.
 *
 * Why this file exists: the browser's SpeechSynthesis is the weakest part of
 * the product. It mangles the letter sounds ("buh" comes out as "buh?"), it
 * has no Hebrew voice worth using, and on a school tablet it may not exist at
 * all. The fix is a real human reading the script — but a human needs to know
 * exactly WHAT to read, and the app needs to know exactly WHICH FILE answers
 * a given cue. Both of those are this list.
 *
 *   · /record renders it as a teleprompter and records against these ids.
 *   · lib/voice.ts looks a cue up here and plays the recording if it exists.
 *   · lib/audio.ts falls back to TTS for anything not yet recorded, so the
 *     app is never broken by a half-finished recording session.
 *
 * ID RULES. An id is a filename stem, so it must be ASCII, stable, and
 * derivable from the cue at play time without consulting this array:
 *
 *   letter-name-A          the NAME of a letter          ("ay")
 *   letter-sound-buh       one PHONEME, shared by every letter that makes it
 *   word-APPLE             an English word
 *   narration-t-welcome    the Hebrew voice of a walkthrough step
 *   he-praise-0 …          a fixed Hebrew UI line
 *   he-prompt-1a2b3c4d     a Hebrew lesson instruction, keyed by a hash of
 *                          its own text so re-generating the curriculum does
 *                          not orphan a recording
 *
 * Hebrew clips are looked up BY TEXT (see heClipId), because the screens hold
 * the sentence, not an id. Two steps with identical wording share one clip,
 * which is correct: they are the same sentence.
 */

import { LESSONS, LETTERS, TUTORIAL_LESSON, WORDS } from "./curriculum";
import { NUDGE_HE, PRAISE_HE, REVEAL_HE, completionHeadlineHe } from "./reward";
import type { Lesson } from "./types";

export type VoiceGroupId =
  | "letter-sound"
  | "letter-name"
  | "word"
  | "narration"
  | "ui-he"
  | "prompt-he";

export interface VoiceGroup {
  id: VoiceGroupId;
  titleHe: string;
  /** What this group is for, in one sentence, shown above the prompt. */
  blurbHe: string;
  lang: "en" | "he";
  /**
   * Optional groups are the long tail: the app is fully voiced without them
   * and they can be recorded another day. The studio records required groups
   * first and says so.
   */
  optional: boolean;
}

export const VOICE_GROUPS: readonly VoiceGroup[] = [
  {
    id: "letter-sound",
    titleHe: "צלילי האותיות",
    blurbHe:
      "הצליל שהאות עושה — לא השם שלה. זה החלק שה־TTS הכי מקלקל, והוא הכי חשוב לקריאה.",
    lang: "en",
    optional: false,
  },
  {
    id: "letter-name",
    titleHe: "שמות האותיות",
    blurbHe: "איך קוראים לאות כשמאייתים בקול. אמריקאי, איטי, ברור.",
    lang: "en",
    optional: false,
  },
  {
    id: "word",
    titleHe: "המילים",
    blurbHe: "כל מילה שהילד בונה במשחק. מילה אחת בכל הקלטה, בקצב טבעי ואיטי.",
    lang: "en",
    optional: false,
  },
  {
    id: "narration",
    titleHe: "הקריינות של ההדרכה",
    blurbHe:
      "המשפטים של הסיור הפותח. הילד עוד לא קורא אנגלית — הקול הזה הוא מה שמסביר לו מה לעשות.",
    lang: "he",
    optional: false,
  },
  {
    id: "ui-he",
    titleHe: "מילות עידוד וסיום",
    blurbHe: "השבחים, הניסיון־שוב, ומסכי הסיום. חם, לא מתלהב מדי.",
    lang: "he",
    optional: false,
  },
  {
    id: "prompt-he",
    titleHe: "הוראות השיעורים",
    blurbHe:
      "כל הוראה בעברית שמופיעה בתוך שיעור. ארוך — אפשר להשאיר להקלטה אחרת; בלי זה האפליקציה עדיין מדברת.",
    lang: "he",
    optional: true,
  },
];

export interface VoiceClip {
  id: string;
  group: VoiceGroupId;
  lang: "en" | "he";
  /** The exact thing to read into the microphone. */
  text: string;
  /** How to read it, in Hebrew, for the person at the microphone. */
  directionHe: string;
  /** Where it is heard in the app — shown as context under the prompt. */
  contextHe?: string;
}

/* ------------------------------------------------------------------ */
/* id helpers — must stay in sync with the cue grammar in lib/audio.ts  */
/* ------------------------------------------------------------------ */

/** FNV-1a, hex. Stable across runs and platforms; used for Hebrew ids. */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Lowercase ASCII, everything else collapsed to "-". Filenames, not prose. */
export function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "x"
  );
}

export const letterNameClipId = (letter: string): string =>
  `letter-name-${letter.trim().toUpperCase().slice(0, 1)}`;

export const letterSoundClipId = (soundSpeak: string): string =>
  `letter-sound-${slug(soundSpeak)}`;

export const wordClipId = (word: string): string =>
  `word-${word.trim().toUpperCase()}`;

export const freeEnClipId = (text: string): string =>
  `en-${textHash(text.trim().toLowerCase())}`;

export const promptClipId = (he: string): string => `he-prompt-${textHash(he)}`;

/* ------------------------------------------------------------------ */
/* The script                                                           */
/* ------------------------------------------------------------------ */

function lettersFor(soundSpeak: string): string[] {
  return LETTERS.filter((l) => l.soundSpeak === soundSpeak).map((l) => l.letter);
}

function buildScript(): VoiceClip[] {
  const clips: VoiceClip[] = [];
  const seen = new Set<string>();
  const push = (clip: VoiceClip) => {
    if (seen.has(clip.id)) return;
    seen.add(clip.id);
    clips.push(clip);
  };

  /* 1. Phonemes. Deduplicated: C and K are one recording, because they are
   *    one sound, and a child who hears two different "kuh"s learns noise. */
  for (const l of LETTERS) {
    const shared = lettersFor(l.soundSpeak);
    push({
      id: letterSoundClipId(l.soundSpeak),
      group: "letter-sound",
      lang: "en",
      text: l.soundSpeak,
      directionHe: `הצליל של ${shared.join(" ו־")} — ${l.soundHe}. רק הצליל, בלי להוסיף תנועה בסוף, ובלי לומר את שם האות.`,
      contextHe: `${l.ipa} · נשמע בשלב "איזה צליל עושה האות"`,
    });
  }

  /* 2. Letter names. */
  for (const l of LETTERS) {
    push({
      id: letterNameClipId(l.letter),
      group: "letter-name",
      lang: "en",
      text: l.nameEn,
      directionHe: `שם האות ${l.letter} — ${l.nameHe}. איטי וברור, כמו שמאייתים בטלפון.`,
      contextHe: `נשמע בשלבי השם, הצורה והמקלדת של ${l.letter}`,
    });
  }

  /* 3. Words: the word bank plus every letter's example word — the example
   *    words are spoken on the letter cards and are not all in the bank. */
  const words = new Set<string>([
    ...WORDS.map((w) => w.word),
    ...LETTERS.map((l) => l.exampleWord),
  ]);
  const glossOf = new Map<string, string>([
    ...WORDS.map((w) => [w.word, w.he] as const),
    ...LETTERS.map((l) => [l.exampleWord, l.exampleWordHe] as const),
  ]);
  for (const word of [...words].sort()) {
    push({
      id: wordClipId(word),
      group: "word",
      lang: "en",
      text: word.toLowerCase(),
      directionHe: `המילה ${word} (${glossOf.get(word) ?? ""}). מילה אחת, קצת יותר לאט מדיבור רגיל, בלי להאריך את הסוף.`,
      contextHe: "נשמע כשהמילה נבנית ובלחיצה על הרמקול",
    });
  }

  /* 4. Walkthrough narration + every other spotlight step in the track. */
  const tutorialLessons: Lesson[] = [TUTORIAL_LESSON, ...LESSONS];
  for (const lesson of tutorialLessons) {
    for (const step of lesson.steps) {
      if (step.type !== "tutorial") continue;
      push({
        id: `narration-${step.id}`,
        group: "narration",
        lang: "he",
        text: step.promptHe,
        directionHe:
          "קרא בעברית, בגובה העיניים של ילד בן שבע. לא קול של מדריך — קול של מישהו שיושב לידו.",
        contextHe: `${lesson.titleHe} · שלב ${step.id}`,
      });
    }
  }

  /* 5. The fixed Hebrew UI lines. */
  PRAISE_HE.forEach((text, i) =>
    push({
      id: `he-praise-${i}`,
      group: "ui-he",
      lang: "he",
      text,
      directionHe: "שבח על תשובה נכונה. חם ורגוע — לא צעקה של קריין משחקים.",
      contextHe: "נשמע אחרי תשובה נכונה",
    }),
  );
  NUDGE_HE.forEach((text, i) =>
    push({
      id: `he-nudge-${i}`,
      group: "ui-he",
      lang: "he",
      text,
      directionHe:
        "אחרי תשובה לא נכונה. שים לב לטון: מעודד, אף פעם לא מאוכזב ולא מתקן.",
      contextHe: "נשמע אחרי תשובה שגויה",
    }),
  );
  REVEAL_HE.forEach((text, i) =>
    push({
      id: `he-reveal-${i}`,
      group: "ui-he",
      lang: "he",
      text,
      directionHe: "כשהאפליקציה מראה את התשובה. רגוע, בלי רמז לוויתור.",
      contextHe: "נשמע כשהתשובה נחשפת",
    }),
  );
  ([3, 2, 1, 0] as const).forEach((stars) =>
    push({
      id: `he-done-${stars}`,
      group: "ui-he",
      lang: "he",
      text: completionHeadlineHe(stars),
      directionHe: "כותרת מסך הסיום. שמח, ובאותה חמימות בכוכב אחד כמו בשלושה.",
      contextHe: `מסך סיום · ${stars} כוכבים`,
    }),
  );

  /* 6. The long tail: every Hebrew instruction inside a lesson. */
  for (const lesson of LESSONS) {
    for (const step of lesson.steps) {
      if (step.type === "tutorial") continue;
      push({
        id: promptClipId(step.promptHe),
        group: "prompt-he",
        lang: "he",
        text: step.promptHe,
        directionHe: "הוראה בתוך שיעור. קצר וענייני, כמו הוראה בקול ליד השולחן.",
        contextHe: lesson.titleHe,
      });
    }
  }

  return clips;
}

export const VOICE_SCRIPT: readonly VoiceClip[] = buildScript();

export const CLIPS_BY_ID: ReadonlyMap<string, VoiceClip> = new Map(
  VOICE_SCRIPT.map((c) => [c.id, c]),
);

/**
 * Hebrew is looked up by its own text: the screens carry the sentence, and
 * asking every call site to also carry an id would be a second thing to keep
 * in sync — i.e. a second thing to get wrong.
 */
const HE_BY_TEXT: ReadonlyMap<string, string> = new Map(
  VOICE_SCRIPT.filter((c) => c.lang === "he").map((c) => [c.text.trim(), c.id]),
);

export function heClipId(text: string | undefined): string | undefined {
  if (!text) return undefined;
  return HE_BY_TEXT.get(text.trim());
}

export function clipsInGroup(group: VoiceGroupId): VoiceClip[] {
  return VOICE_SCRIPT.filter((c) => c.group === group);
}

/** Required clips only — what "the app is voiced" actually means. */
export const REQUIRED_CLIPS: readonly VoiceClip[] = VOICE_SCRIPT.filter(
  (c) => !VOICE_GROUPS.find((g) => g.id === c.group)?.optional,
);
