/**
 * GENERATE THE APP'S VOICE — every line in lib/voice/lines.ts, from scratch,
 * in one voice, checked by ear before it is kept.
 *
 *   OPENROUTER_API_KEY=… node --experimental-strip-types --no-warnings \
 *     --import ./scripts/ts-resolve.mjs scripts/generate-voice.ts [flags]
 *
 *   --only <regex>   just the line ids matching (e.g. "^phoneme-|^word-SUN$")
 *   --preview        also render the S letter intro and the SUN word intro as
 *                    single files in .voice-cache/preview/, timed like the app
 *   --no-qa          keep the first take of every line, unchecked
 *
 * WHY IT IS BUILT LIKE THIS
 * -------------------------
 * A synthesiser is very good at words and sentences and surprisingly bad at
 * the one thing this app teaches: a letter's sound on its own. Asked for
 * "sss" it says "ess ess ess"; asked for "puh" it reads Finnish; asked for
 * "Rrrrrr" it rolls a Spanish R — the exact sound a Hebrew speaker must NOT
 * learn for English R. Every one of those came out of real test calls.
 *
 * So each line carries a short list of ways to ask for it (plain spelling,
 * IPA phoneme tags, stretched spellings) and what a correct take must sound
 * like. Every take is transcribed BLIND by an audio model — it is never told
 * what the clip was meant to be — and kept only if what it heard matches.
 * A take that fails is retried with a new seed, then with the next way of
 * asking. Lines that never pass are kept at their best attempt and listed in
 * docs/voice-qa.md, so a human knows exactly which clips to listen to.
 *
 * UNIFORM means: one model, one voice, and one processing chain for every
 * clip — silence trimmed to the same lead and tail, loudness normalised to
 * the same target, peaks limited, encoded to the same MP3.
 */

import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { VOICE_LINES, type VoiceLine } from "@/lib/voice/lines";
import { PHONEMES, letterPhoneme, type PhonemeId, segmentsFor } from "@/lib/phonics";
import { LETTERS, letterIntroText } from "@/lib/curriculum/alphabet";

/* ------------------------------------------------------------------ */
/* Settings                                                             */
/* ------------------------------------------------------------------ */

const TTS_MODEL = "elevenlabs/eleven-v4";
const VOICE = "sarah";
/**
 * The listener. argon is the strictest we found (it caught "slash B slash"
 * where a lighter model waved it through) but it sometimes answers with
 * garbage; when it does, the next model in the list is asked instead, and
 * the acoustic checks below still hold every take to the same floor.
 */
const JUDGE_MODELS = ["google/gemini-4-argon", "google/gemini-3.8-flash"];
const JUDGE_MODEL = JUDGE_MODELS[0]!;
/**
 * Stock ElevenLabs voices speak Hebrew with an English accent — the "dark" L
 * of an American in כל is the giveaway. This tag, tested against several
 * alternatives, is the one that came back "native Israeli" from a blind
 * listener, and v4 does not read it aloud.
 */
const HEBREW_TAG = "[speaks fluent native Hebrew, Israeli accent, warm]";
/**
 * Words said bare come back flat — "a dictionary or navigation prompt", in a
 * blind listener's words, 4/10. The same word with this tag scored 9/10.
 */
const WORD_TAG = "[warmly, clearly, to a child]";
/**
 * PERFORMANCES. A sound-out stitched from separate clips sounded like a
 * machine reading a list — each piece with its own flat, finished intonation
 * and a gap measured in milliseconds. So a sound-out, and a letter intro, are
 * each asked for as ONE take, directed, and only the pauses are touched
 * afterwards: widened, never shortened, so every sound has room.
 */
/**
 * A DIRECTION, NOT AN INSTRUCTION. Tags that tell the voice what to DO
 * ("…: exactly twice, then says the word") were sometimes read out loud —
 * "exactly twice" at the start of a take, before the first sound. A tag that
 * only describes HOW to sound never was. The voice sometimes sounds a word
 * out three times instead of two; that is handled after the fact (the last
 * two passes are kept), not by telling it.
 */
const SOUNDOUT_TAG = "[slowly, warmly, like a kind teacher sounding out a word for a young child]";
const INTRO_TAG =
  "[speaks fluent native Hebrew, Israeli accent; warm and inviting, like a kind teacher talking to a young child]";
/** Without it the sound after a Hebrew sentence comes out Hebrew — R as a uvular ר. */
const EN_SWITCH = "[switches to a clear American English accent]";
/** Minimum silence between two sounds, between the two passes, and before the sound in an intro. */
const GAP_SOUND_S = 0.6;
const GAP_PASS_S = 1.1;
const GAP_INTRO_S = 0.7;
const TARGET_LUFS = -18;
const PEAK_LIMIT = 0.84; // ≈ -1.5 dBFS
const LEAD_S = 0.03;
const TAIL_S = 0.06;
/** A sustained sound ("sss") is cut here and faded: long enough to hear, short enough to blend. */
const CONTINUANT_MAX_S = 0.8;

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public", "voice");
const CACHE = path.join(ROOT, ".voice-cache");
const REPORT = path.join(ROOT, "docs", "voice-qa.md");

const KEY = process.env.OPENROUTER_API_KEY ?? "";
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/* ------------------------------------------------------------------ */
/* How to ask for each line, and what a correct take sounds like        */
/* ------------------------------------------------------------------ */

const tag = (ipa: string, text: string) =>
  `<phoneme alphabet="ipa" ph="${ipa}">${text}</phoneme>`;

/**
 * Each sound's ways of asking, best first. Every choice here is from a blind
 * test of the alternatives — see the module comment. IPA tags work for vowels
 * and multi-symbol consonants, and fail on a single consonant letter (the
 * voice reads "/b/" as "slash B slash"), which is why stops are spelled with a
 * clipped schwa instead.
 */
const PHONEME_INPUTS: Record<PhonemeId, string[]> = {
  a: [tag("æ", "a")],
  e: [tag("ɛ", "e")],
  i: [tag("ɪ", "i")],
  o: [tag("ɑ", "o"), "ah"],
  u: ["uh", "Uh."],
  ay: [tag("eɪ", "ay"), "ay"],
  ee: [tag("iː", "ee"), "ee"],
  igh: [tag("aɪ", "i"), "eye"],
  oa: [tag("oʊ", "o"), "oh"],
  oo: [tag("uː", "oo"), "ooh"],
  uu: [tag("ʊ", "oo")],
  ow: [tag("aʊ", "ow"), "ow"],
  aw: [tag("ɔ", "aw"), "aw"],
  ar: ["ar", tag("ɑɹ", "ar")],
  or: ["or", tag("ɔɹ", "or")],
  er: [tag("ɝ", "er"), "er"],
  air: ["air"],
  yoo: ["you"],
  b: ["bə"],
  d: ["də"],
  f: ["Ffffff.", "fffffff"],
  g: ["gə", "guh"],
  h: ["hə"],
  j: ["jə", "juh"],
  k: ["kə", "kuh"],
  l: ["Lllll", "Llllll."],
  m: ["Mmmmmm.", tag("mː", "m")],
  n: ["Nnnnnn.", "nnnnnn"],
  p: ["pə"],
  r: [tag("ɹː", "r")],
  s: ["Ssssss.", "sssssss"],
  t: ["tə", "tuh"],
  v: ["Vvvvvv.", "vvvvvvv"],
  w: ["wə"],
  y: ["yuh"],
  z: ["Zzzzzz.", "zzzzzzz"],
  sh: ["Shhhhh.", tag("ʃː", "sh")],
  ch: ["chə"],
  th: [tag("θː", "th"), "Thhhhh."],
  dh: [tag("ðː", "th"), "Ththth."],
  ng: [tag("ŋː", "ng"), "Nnggg."],
  ks: [tag("ks", "x"), "ksss"],
  kw: ["kwə"],
  ts: [tag("ts", "ts"), "tsss"],
};

/** Accepted blind transcriptions, after normalise(). */
const PHONEME_OK: Record<PhonemeId, RegExp> = {
  a: /^æ$/,
  e: /^[ɛe]$/,
  i: /^ɪ$/,
  o: /^[ɑɒa]$/,
  u: /^[ʌə]$/,
  ay: /^eɪ?$/,
  ee: /^i$/,
  igh: /^aɪ$/,
  oa: /^o[ʊu]?$/,
  oo: /^u$/,
  uu: /^ʊ$/,
  ow: /^aʊ$/,
  aw: /^[ɔɑɒ]$/,
  ar: /^[ɑa]ɹ$/,
  or: /^[ɔo]ɹ$/,
  er: /^(ɝ|ɜɹ|əɹ|ɚ|ɜ)$/,
  air: /^[ɛe]ə?ɹ$/,
  yoo: /^ju$/,
  b: /^b[əʌ]?$/,
  d: /^d[əʌ]?$/,
  f: /^f+$/,
  g: /^g[əʌ]?$/,
  h: /^h[əʌ]?$/,
  j: /^dʒ[əʌ]?$/,
  k: /^k[əʌ]?$/,
  l: /^(l+[əʌ]?|əl)$/,
  m: /^m+$/,
  n: /^n+$/,
  p: /^p[əʌ]?$/,
  r: /^ɹ[ɝə]?$/,
  s: /^s+$/,
  t: /^t[əʌ]?$/,
  v: /^v+$/,
  w: /^w[əʌʊ]?$/,
  y: /^j[əʌ]?$/,
  z: /^z+$/,
  sh: /^ʃ+$/,
  ch: /^tʃ[əʌ]?$/,
  th: /^θ+$/,
  dh: /^ð+[əʌ]?$/,
  ng: /^ŋ+$/,
  ks: /^ks+$/,
  kw: /^kw[əʌ]?$/,
  ts: /^ts+$/,
};

/**
 * How each sound is written INSIDE a performance. Not the same as the
 * isolated inputs above: in a running line the voice needs a syllable it can
 * lean on ("kuh"), and a sustained sound reads best as the letter stretched.
 */
const PERF: Record<PhonemeId, string> = {
  a: tag("æ", "a"), e: "eh", i: "ih", o: "ah", u: "uhh",
  ay: "ay", ee: "ee", igh: "eye", oa: "oh", oo: "ooo", uu: tag("ʊ", "oo"), ow: "ow", aw: "aw",
  ar: "ar", or: "or", er: "er", air: "air", yoo: "you",
  b: "buh", d: "duh", f: "Fffff", g: "guh", h: "huh", j: "juh", k: "kuh", l: "Lllll", m: "Mmmmm",
  n: "Nnnnn", p: "puh", r: "Rrrr", s: "Sssss", t: "tuh", v: "Vvvvv", w: "wuh", y: "yuh", z: "Zzzzz",
  sh: "Shhhh", ch: "chuh", th: "Thhhh", dh: tag("ðː", "th"), ng: tag("ŋː", "ng"),
  ks: "kss", kw: "kwuh", ts: "tss",
};

const CONTINUANTS = new Set<PhonemeId>(["f", "l", "m", "n", "s", "v", "z", "sh", "th", "dh", "ng", "r"]);

/**
 * Sounds that are pure noise, all the way through. Measured at the same LUFS
 * as a vowel, a hiss is HEARD as louder and harsher — a blind listener called
 * the /s/ after a Hebrew sentence "a volume jump" — so they sit lower, and the
 * sibilants lose a little of their top end.
 */
const VOWELS = new Set<PhonemeId>([
  "a", "e", "i", "o", "u", "ay", "ee", "igh", "oa", "oo", "uu", "ow", "aw", "ar", "or", "er", "air", "yoo",
]);
/** Voiceless stops (and ch): trimmed to their burst plus a breath of vowel. */
const CLIPPED_STOPS = new Set<PhonemeId>(["p", "t", "k", "ch"]);
const VOICELESS = new Set<PhonemeId>(["s", "sh", "f", "th", "ks", "ts"]);
const SIBILANTS = new Set<PhonemeId>(["s", "sh", "ks", "ts", "z"]);
const LOUDNESS: Partial<Record<PhonemeId, number>> = {
  s: -22, sh: -22, f: -21, th: -21, ks: -21, ts: -21, z: -20, v: -20, dh: -20,
};

/** Letter names: a capital alone is a trap for I ("one"), W and Y, so those lead with a spelling. */
const NAME_INPUTS: Record<string, string[]> = {
  I: ["eye", "I"],
  W: ["double-you", "W"],
  Y: ["why", "Y"],
  A: ["A", "ay"],
  E: ["E", "ee"],
  O: ["O", "oh"],
  U: ["U", "you"],
};
const NAME_IPA: Record<string, string[]> = {
  A: ["eɪ"], B: ["bi"], C: ["si"], D: ["di"], E: ["i"], F: ["ɛf", "ef"], G: ["dʒi"],
  H: ["eɪtʃ", "etʃ"], I: ["aɪ"], J: ["dʒeɪ"], K: ["keɪ"], L: ["ɛl", "el"], M: ["ɛm", "em"],
  N: ["ɛn", "en"], O: ["oʊ", "o"], P: ["pi"], Q: ["kju"], R: ["ɑɹ", "aɹ"], S: ["ɛs", "es"],
  T: ["ti"], U: ["ju"], V: ["vi"], W: ["dʌbəlju", "dʌbəju", "dʌbju", "dʌbljuː", "dʌblju"],
  X: ["ɛks", "eks"], Y: ["waɪ"], Z: ["zi"],
};

/** Hebrew read aloud: no emoji, and a key chord said the way a person says it. */
function hebrewForSpeech(text: string): string {
  return text
    .replace(/Alt\s*\+\s*Shift/g, "אַלְט וְשִׁיפְט")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}␣]/gu, "")
    .replace(/\s+([.,!?…])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

type Kind = "clip" | "soundout" | "intro";

interface Verdict {
  ok: boolean;
  why: string;
  score: number;
  /** sound-outs: how many correct passes the listener heard before the word */
  passes?: number;
}

interface Plan {
  line: VoiceLine;
  inputs: string[];
  lang: "en" | "he";
  kind: Kind;
  phoneme?: PhonemeId;
  /** For a sound-out: the sounds of one pass, in order. */
  pass?: PhonemeId[];
  check: (j: Judged) => Verdict;
}

interface Judged {
  file: string;
  judge?: string;
  ipa: string;
  text: string;
  accent?: string;
  /** 1–10: natural, warm, clean — would you play it to a child. */
  quality?: number;
  notes?: string;
  /** sound-outs: each separate sound heard, in order, and the word at the end */
  sounds?: string[];
  word?: string;
  /** intros: the Hebrew sentence, and the sound after it */
  hebrew?: string;
  sound_ipa?: string;
  intonation?: number;
  extra?: string;
  /** any words heard that are not part of the line — e.g. a direction read aloud */
  other_words?: string[];
}

/**
 * Right AND pleasant. The content check decides `good`; a take that says the
 * right thing flatly, or with a sigh on the end, still fails on quality and is
 * retried — and when nothing passes, the best-sounding correct take is kept.
 */
function graded(good: boolean, j: Judged, why: string, minQuality = 7) {
  const q = typeof j.quality === "number" ? j.quality : minQuality;
  const ok = good && q >= minQuality;
  return {
    ok,
    why: `${why} · quality ${j.quality ?? "?"}${good && !ok ? ` (${j.notes ?? "below bar"})` : ""}`,
    score: (good ? 1 : 0) + q / 100,
  };
}

/** Fold the many ways one sound can be written into one spelling. */
function normalise(ipa: string): string {
  let s = (ipa ?? "").toLowerCase().normalize("NFD");
  s = s.replace(/[\u0300-\u036f]/g, ""); // breathy, syllabic and other diacritics
  s = s
    .replace(/ɡ/g, "g").replace(/ʤ/g, "dʒ").replace(/ʧ/g, "tʃ").replace(/ɫ/g, "l")
    .replace(/[rɻɾ]/g, "ɹ").replace(/ɚ/g, "əɹ").replace(/ɜː?ɹ/g, "ɝ")
    .replace(/[ːˑʰʷʲˈˌ.'’\/\[\]\s()-]/g, "");
  // a trailing breath is how every isolated sound ends; it is not a sound
  if (s.length > 1) s = s.replace(/h+$/, "");
  return s;
}

function lettersOnly(s: string): string {
  return (s ?? "").toLowerCase().replace(/[^a-z]/g, "");
}

function hebrewLetters(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0591-\u05C7]/g, "") // niqqud and cantillation
    .replace(/[^\u05D0-\u05EA]/g, "");
}

/** Similarity 0..1 by longest-common-subsequence over letters. */
function similarity(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return (2 * dp[b.length]) / (a.length + b.length);
}

function planFor(line: VoiceLine): Plan {
  const id = line.id;
  if (id.startsWith("phoneme-")) {
    const ph = id.slice("phoneme-".length) as PhonemeId;
    const ok = PHONEME_OK[ph];
    return {
      line,
      lang: "en",
      kind: "clip",
      phoneme: ph,
      inputs: PHONEME_INPUTS[ph],
      check: (j) => {
        const n = normalise(j.ipa);
        const good = ok.test(n);
        return graded(good, j, good ? `heard /${j.ipa}/` : `heard /${j.ipa}/ → "${n}", want ${ok}`, 6);
      },
    };
  }
  if (id.startsWith("letter-name-")) {
    const L = id.slice("letter-name-".length);
    const want = NAME_IPA[L] ?? [];
    return {
      line,
      lang: "en",
      kind: "clip",
      inputs: (NAME_INPUTS[L] ?? [L]).map((x) => `${WORD_TAG} ${x}`),
      check: (j) => {
        const n = normalise(j.ipa);
        const good = want.some((w) => normalise(w) === n);
        return graded(good, j, good ? `heard /${j.ipa}/` : `heard /${j.ipa}/ ("${j.text}"), want ${want.join(" | ")}`);
      },
    };
  }
  if (id.startsWith("word-") || id.startsWith("sentence-")) {
    const want = lettersOnly(line.text);
    // A trailing full stop turns "sun." into "Sunday" — the voice reads it as
    // the abbreviation. Words go in bare and lower-case; sentences get one.
    const cap = line.text.charAt(0).toUpperCase() + line.text.slice(1).toLowerCase();
    const inputs = id.startsWith("word-")
      ? [`${WORD_TAG} ${line.text.toLowerCase()}`, `${cap}!`]
      : [`${WORD_TAG} ${cap}.`, `${cap}.`];
    return {
      line,
      lang: "en",
      kind: "clip",
      inputs,
      check: (j) => {
        const heard = lettersOnly(j.text);
        const good = heard === want;
        const r = graded(good, j, good ? `heard "${j.text}"` : `heard "${j.text}", want "${line.text}"`);
        return good ? r : { ...r, score: similarity(heard, want) };
      },
    };
  }
  if (id.startsWith("soundout-")) {
    const word = id.slice("soundout-".length);
    const pass = segmentsFor(word)
      .map((seg) => seg.ph)
      .filter((x): x is PhonemeId => Boolean(x));
    const said = pass.map((ph) => PERF[ph]).join(" — ");
    const lead = said.startsWith("<") ? said : said.charAt(0).toUpperCase() + said.slice(1);
    const Word = word.charAt(0) + word.slice(1).toLowerCase();
    return {
      line,
      lang: "en",
      kind: "soundout",
      pass,
      inputs: [`${SOUNDOUT_TAG} ${lead}. ${lead}. ${Word}!`],
      check: (j) => {
        // Two passes are asked for; the voice sometimes gives three. Any
        // whole number of CORRECT passes is usable — the last two are kept
        // (see finishPerformance) — but every sound in every pass must be right.
        const heard = (j.sounds ?? []).map(normalise);
        const k = pass.length;
        const passes = heard.length % k === 0 ? heard.length / k : 0;
        const wrong = heard.findIndex((h, i) => !PHONEME_OK[pass[i % k]!].test(h));
        const sameWord = lettersOnly(j.word ?? "") === word.toLowerCase();
        const spoken = (j.other_words ?? []).filter((w) => w && w.trim());
        if (spoken.length) {
          return { ok: false, why: `words said aloud: "${spoken.join(" ")}"`, score: 0, passes };
        }
        const good = passes >= 2 && passes <= 4 && wrong < 0 && sameWord;
        const heardList = (j.sounds ?? []).join("·");
        const why = good
          ? `heard ${heardList} → "${j.word}"${passes > 2 ? ` (${passes} passes; last two kept)` : ""}`
          : passes < 2
            ? `heard ${heard.length} sounds, not whole passes of ${k}: ${heardList}${j.extra ? ` (${j.extra})` : ""}`
            : passes > 4
              ? `sounded out ${passes} times: ${heardList}`
              : !sameWord
                ? `word heard as "${j.word}"`
                : wrong >= 0
                  ? `sound ${wrong + 1} heard as /${j.sounds?.[wrong]}/, want /${PHONEMES[pass[wrong % k]!].ipa}/`
                  : `heard ${heardList}`;
        return { ...graded(good, { ...j, quality: j.intonation }, why), passes };
      },
    };
  }
  if (id.startsWith("narration-intro-")) {
    const letter = id.slice("narration-intro-".length);
    const d = LETTERS.find((l) => l.letter === letter)!;
    const ph = letterPhoneme(letter)!;
    const carrier = letterIntroText(d.nameHe);
    const want = hebrewLetters(carrier);
    return {
      line,
      lang: "he",
      kind: "intro",
      phoneme: ph,
      // The voice sometimes says the sentence twice before the sound; three
      // ways of asking, rotated with the seeds, give it three different
      // chances not to. (Without the switch, R comes out as a Hebrew ר — the
      // check catches that, and the next way of asking is tried.)
      inputs: [
        `${INTRO_TAG} ${carrier.replace("…", "...")} ${EN_SWITCH} ${PERF[ph]}.`,
        `${INTRO_TAG} ${carrier.replace("…", "...")}\n${EN_SWITCH} ${PERF[ph]}.`,
        `${INTRO_TAG} ${carrier.replace("…", "...")} ${PERF[ph]}.`,
      ],
      check: (j) => {
        const spoken = (j.other_words ?? []).filter((w) => w && w.trim());
        if (spoken.length) return { ok: false, why: `words said aloud: "${spoken.join(" ")}"`, score: 0 };
        const sim = similarity(hebrewLetters(j.hebrew ?? ""), want);
        const sound = PHONEME_OK[ph].test(normalise(j.sound_ipa ?? ""));
        const accent = (j.accent ?? "").toLowerCase();
        const foreign = accent.includes("clearly") || accent === "foreign";
        const good = sim >= 0.8 && sound && !foreign;
        const why = `${Math.round(sim * 100)}% Hebrew match, sound /${j.sound_ipa}/${sound ? "" : ` (want /${PHONEMES[ph].ipa}/)`}, accent ${j.accent || "?"}${sim < 0.8 ? ` — heard "${j.hebrew}"` : ""}`;
        return graded(good, { ...j, quality: j.intonation }, why);
      },
    };
  }
  // Hebrew narration: the walkthrough and every lesson card.
  const spoken = hebrewForSpeech(line.text);
  const want = hebrewLetters(spoken);
  return {
    line,
    lang: "he",
    kind: "clip",
    inputs: [`${HEBREW_TAG} ${spoken}`],
    check: (j) => {
      // English heard in a line with no English in it is a direction read aloud.
      if (!/[A-Za-z]/.test(spoken) && /[A-Za-z]{3,}/.test(j.text ?? "")) {
        return { ok: false, why: `English heard in a Hebrew line: "${j.text}"`, score: 0 };
      }
      const sim = similarity(hebrewLetters(j.text), want);
      const accent = (j.accent ?? "").toLowerCase();
      const foreign = accent.includes("clearly") || accent === "foreign";
      const r = graded(
        sim >= 0.8 && !foreign,
        j,
        `${Math.round(sim * 100)}% match, accent ${j.accent || "?"}${sim >= 0.8 ? "" : ` — heard "${j.text}"`}`,
      );
      return { ...r, score: sim - (foreign ? 0.5 : accent.includes("slight") ? 0.05 : 0) + (j.quality ?? 0) / 100 };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Network                                                              */
/* ------------------------------------------------------------------ */

async function post(pathname: string, body: unknown, tries = 4): Promise<Response> {
  let last: unknown = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      // A request that never answers would hang the whole run; give up on it
      // and let the retry below ask again.
      const res = await fetch(`https://openrouter.ai/api/v1${pathname}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      if (res.status === 429 || res.status >= 500) {
        last = new Error(`${res.status} ${await res.text()}`);
      } else {
        // Read the body inside the timeout too: a stalled stream hangs just as well.
        const buf = await res.arrayBuffer();
        return new Response(buf, { status: res.status, headers: res.headers });
      }
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
  }
  throw last instanceof Error ? last : new Error(String(last));
}

/** One raw take, cached by everything that determines it, so a rerun costs nothing. */
async function synth(input: string, lang: "en" | "he", seed: number): Promise<string> {
  const key = createHash("sha256")
    .update(JSON.stringify([TTS_MODEL, VOICE, input, lang, seed]))
    .digest("hex")
    .slice(0, 20);
  const file = path.join(CACHE, "raw", `${key}.mp3`);
  if (existsSync(file) && statSync(file).size > 0) return file;
  const res = await post("/audio/speech", {
    model: TTS_MODEL,
    voice: VOICE,
    input,
    response_format: "mp3",
    provider: {
      options: {
        elevenlabs: { seed, ...(lang === "he" ? { language_code: "he" } : { language_code: "en" }) },
      },
    },
  });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

const JUDGE_PROMPT = `You are a strict phonetician and a native speaker of both English and Israeli Hebrew, checking text-to-speech clips for a children's app.
Each clip is ONE short recording: an isolated English speech sound, an English letter name, an English word or sentence, or a Hebrew sentence. You are NOT told what any clip was meant to say — never guess the intent, report only what is audible.
Return ONLY a JSON array, one object per clip, in the order given:
{"file": "<file name>", "lang": "en" | "he", "ipa": "<broad IPA of exactly what is audible, including any extra vowel, breath or words>", "text": "<what was said, written in its own script; for a lone speech sound repeat the IPA>", "accent": "<Hebrew only: native Israeli | slight foreign | clearly foreign>", "quality": <1-10: natural, warm and clean enough to play to a 7-year-old; deduct for flat/robotic delivery, sighs or breathy tails, clicks, theatrical over-acting>, "notes": "<short>"}`;

const SOUNDOUT_PROMPT = `You are an experienced early-years English phonics teacher. Each clip is a teacher "sounding out" a word for a young child: separate sounds, twice, then the whole word. You are NOT told the word — never guess it from what it ought to be; report only what is audible.
Return ONLY a JSON array, one object per clip, in the order given:
{"file": "<file name>", "sounds": ["<broad IPA of each separate sound, in order, ALL passes>"], "word": "<the whole word at the end>", "other_words": ["<every spoken word that is NOT one of the separate sounds and NOT the final word — e.g. instructions or comments said aloud before, between or after; empty if none>"], "extra": "<anything else odd: stutters, breaths, clicks — else empty>", "intonation": <1-10: does it sound like a real, warm, inviting human teacher, unhurried, with room for each sound — judge the VOICE only: how many times the word is sounded out does not matter here, it is reported in "sounds">, "notes": "<short>"}`;

const INTRO_PROMPT = `You are a native Israeli Hebrew speaker and an English phonics teacher. Each clip is a teacher introducing an English letter to a young Israeli child: a Hebrew sentence, then the English SOUND the letter makes. You are NOT told the script.
Be precise about the final sound: an English /ɹ/ is not a Hebrew ר /ʁ/, an English /æ/ is not a Hebrew /a/, and a letter NAME is not a sound.
Return ONLY a JSON array, one object per clip, in the order given:
{"file": "<file name>", "hebrew": "<the Hebrew heard, verbatim, in Hebrew script>", "sound_ipa": "<broad IPA of the final English sound only>", "other_words": ["<every word heard that is not the Hebrew sentence or the final sound — e.g. English words or instructions said aloud; empty if none>"], "extra": "<repeats, stutters — else empty>", "accent": "<native Israeli | slight foreign | clearly foreign>", "intonation": <1-10: warm, inviting, human>, "notes": "<short>"}`;

const PROMPT: Record<Kind, string> = { clip: JUDGE_PROMPT, soundout: SOUNDOUT_PROMPT, intro: INTRO_PROMPT };

/**
 * Verdicts are cached by the take's exact bytes and the question asked, so a
 * rerun after a fix re-listens only to what it has never heard.
 */
function verdictKey(file: string, prompt: string): string {
  return createHash("sha256").update(readFileSync(file)).update(prompt).digest("hex").slice(0, 24);
}

async function judge(files: string[], prompt = JUDGE_PROMPT): Promise<Judged[]> {
  const dir = path.join(CACHE, "judged");
  mkdirSync(dir, { recursive: true });
  const cached = files.map((f) => {
    const p = path.join(dir, `${verdictKey(f, prompt)}.json`);
    return existsSync(p) ? ({ ...JSON.parse(readFileSync(p, "utf8")), file: f } as Judged) : null;
  });
  const todo = files.filter((_, i) => !cached[i]);
  const fresh = todo.length ? await judgeUncached(todo, prompt) : [];
  return files.map((f, i) => {
    if (cached[i]) return cached[i]!;
    const v = fresh[todo.indexOf(f)]!;
    if (v.ipa || v.text || v.sounds || v.hebrew) {
      writeFileSync(path.join(dir, `${verdictKey(f, prompt)}.json`), JSON.stringify(v));
    }
    return v;
  });
}

async function judgeUncached(files: string[], prompt: string): Promise<Judged[]> {
  const content: unknown[] = [{ type: "text", text: prompt }];
  for (const f of files) {
    content.push({ type: "text", text: `Clip: ${path.basename(f)}` });
    content.push({
      type: "input_audio",
      input_audio: { data: readFileSync(f).toString("base64"), format: "mp3" },
    });
  }
  for (const model of JUDGE_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await post("/chat/completions", {
        model,
        temperature: 0,
        messages: [{ role: "user", content }],
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = json.choices?.[0]?.message?.content ?? "";
      const m = raw.match(/\[[\s\S]*\]/);
      if (!m) continue;
      try {
        const arr = JSON.parse(m[0]) as Judged[];
        if (!Array.isArray(arr) || arr.length === 0) continue;
        return files.map((f) => {
          const hit = arr.find((a) => path.basename(a.file ?? "") === path.basename(f));
          return hit ? { ...hit, judge: model } : { file: f, ipa: "", text: "", notes: "missing" };
        });
      } catch {
        /* garbage — ask again, then ask the next listener */
      }
    }
  }
  return files.map((f) => ({ file: f, ipa: "", text: "", notes: "judge failed" }));
}

/**
 * THE FLOOR NO LISTENER CAN OVERRIDE. Two numbers per take: how long it is,
 * and what fraction of it is voiced (periodic, with energy). A hiss is all
 * noise; a vowel is mostly voice; an isolated sound is short. "ess ess ess"
 * for /s/, and "slash B slash" for /b/, both fail these on their own.
 */
function acoustics(file: string): { dur: number; voiced: number } {
  const f = frames(file);
  const max = Math.max(...f.map((x) => x.rms), 1e-9);
  const loud = f.filter((x) => x.rms > 0.12 * max);
  const voiced = loud.filter((x) => x.zcr < 0.14).length / Math.max(1, loud.length);
  return { dur: probeDuration(file), voiced };
}

function acousticFloor(plan: Plan, file: string): string | null {
  const { dur, voiced } = acoustics(file);
  if (plan.kind === "soundout") {
    const k = plan.pass!.length;
    const max = (2 * k + 1) * 1.6 + 2 * k * GAP_PASS_S + 3;
    return dur > max ? `${dur.toFixed(1)}s — longer than two passes and a word (looped?)` : null;
  }
  if (plan.kind === "intro") return dur > 9 ? `${dur.toFixed(1)}s — too long (repeated?)` : null;
  const ph = plan.phoneme;
  if (ph) {
    if (VOICELESS.has(ph) && voiced > 0.2) return `voiced ${Math.round(voiced * 100)}% — a hiss should be noise`;
    if (VOWELS.has(ph) && voiced < 0.5) return `voiced only ${Math.round(voiced * 100)}% — a vowel should be voice`;
    if (dur > 1.05) return `${dur.toFixed(2)}s — too long for one sound`;
    return null;
  }
  if (plan.line.id.startsWith("letter-name-") && dur > 1.6) return `${dur.toFixed(2)}s — too long for a letter name`;
  if (plan.line.id.startsWith("word-") && dur > 2.6) return `${dur.toFixed(2)}s — too long for one word`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Processing — the same chain for every clip                           */
/* ------------------------------------------------------------------ */

function ff(argv: string[]): string {
  return execFileSync("ffmpeg", ["-hide_banner", "-nostats", "-y", ...argv], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}

/** ffmpeg's report goes to stderr whether or not it succeeds. */
function ffLog(argv: string[]): string {
  return spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...argv], { encoding: "utf8" }).stderr ?? "";
}

function probeDuration(file: string): number {
  const out = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8" },
  );
  return Number.parseFloat(out.trim()) || 0;
}

/** Integrated loudness (LUFS), or a mean-volume estimate for clips too short to gate. */
function loudness(file: string): number {
  const log = ffLog(["-i", file, "-af", "ebur128", "-f", "null", "-"]);
  const m = log.slice(log.lastIndexOf("Summary:")).match(/I:\s+(-?[\d.]+) LUFS/);
  const lufs = m ? Number.parseFloat(m[1]!) : Number.NaN;
  if (Number.isFinite(lufs) && lufs > -60) return lufs;
  const mv = ffLog(["-i", file, "-af", "volumedetect", "-f", "null", "-"]).match(
    /mean_volume:\s+(-?[\d.]+) dB/,
  );
  // speech's mean volume sits roughly 3 dB under its integrated loudness
  return mv ? Number.parseFloat(mv[1]!) + 3 : TARGET_LUFS;
}

/**
 * WHERE THE VOICE STOPS. A synthesised sound said on its own ends in a breath:
 * "uh" came back as a quarter of a second of vowel and then a quarter of a
 * second of sigh, which a blind listener heard as "uh-hhh" — an extra /h/ in
 * the middle of S·U·N, exactly what blending must not have. Voicing is
 * periodic (few zero crossings, real energy) and a breath is noise (many
 * crossings, little energy), so the cut goes just after the last voiced 10 ms.
 * Only applied to sounds that END voiced; a hiss is noise from end to end.
 */
function frames(file: string): { rms: number; zcr: number }[] {
  const sr = 16000;
  const pcm = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(sr), "-f", "f32le", "-"], {
    maxBuffer: 64 * 1024 * 1024,
  }).stdout as Buffer;
  const x = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4));
  const n = sr / 100;
  const out: { rms: number; zcr: number }[] = [];
  for (let i = 0; i + n <= x.length; i += n) {
    let e = 0;
    let z = 0;
    for (let k = i; k < i + n; k++) {
      e += x[k]! * x[k]!;
      if (k > i && Math.sign(x[k]!) !== Math.sign(x[k - 1]!)) z++;
    }
    out.push({ rms: Math.sqrt(e / n), zcr: z / n });
  }
  return out;
}

function voicedEnd(file: string): number | null {
  const f = frames(file);
  const max = Math.max(...f.map((x) => x.rms), 1e-9);
  let last = -1;
  f.forEach((x, i) => {
    if (x.zcr < 0.14 && x.rms > 0.12 * max) last = i;
  });
  if (last < 0) return null;
  const end = (last + 1) / 100 + 0.025;
  return end < f.length / 100 - 0.04 ? end : null;
}

function processClip(raw: string, out: string, plan: Plan): void {
  const ph = plan.phoneme;
  const tmp = out + ".trim.wav";
  const trim = [
    "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.01",
    "areverse",
    "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.02",
    "areverse",
  ];
  if (ph && CONTINUANTS.has(ph)) {
    trim.push(`atrim=0:${CONTINUANT_MAX_S}`, `afade=t=out:st=${CONTINUANT_MAX_S - 0.14}:d=0.14`);
  }
  if (ph && SIBILANTS.has(ph)) trim.push("highshelf=f=6500:g=-4");
  ff(["-i", raw, "-ac", "1", "-ar", "44100", "-af", trim.join(","), tmp]);

  // A voiceless stop said alone comes with a vowel stuck to it — "puh",
  // "tuh" — and a listener marked those down for it, rightly: phonics wants
  // the burst, not a syllable. The burst is noise and the vowel is voice, so
  // the cut goes just after the voice begins, keeping only a whisper of it.
  if (ph && CLIPPED_STOPS.has(ph)) {
    const f = frames(tmp);
    const max = Math.max(...f.map((x) => x.rms), 1e-9);
    const start = f.findIndex((x, i) => i >= 2 && x.zcr < 0.14 && x.rms > 0.12 * max);
    if (start > 0) {
      const cut = tmp + ".cut.wav";
      const at = (start / 100 + 0.05).toFixed(3);
      ff(["-i", tmp, "-af", `atrim=0:${at},afade=t=out:st=${(Number(at) - 0.03).toFixed(3)}:d=0.03`, cut]);
      writeFileSync(tmp, readFileSync(cut));
      unlinkSync(cut);
    }
  } else if (ph && !VOICELESS.has(ph)) {
    const end = voicedEnd(tmp);
    if (end !== null) {
      const cut = tmp + ".cut.wav";
      ff(["-i", tmp, "-af", `atrim=0:${end.toFixed(3)}`, cut]);
      writeFileSync(tmp, readFileSync(cut));
      unlinkSync(cut);
    }
  }

  const len = probeDuration(tmp);
  const target = (ph && LOUDNESS[ph]) ?? TARGET_LUFS;
  const gain = target - loudness(tmp);
  // Stops keep their burst: a slow fade-in would blunt the very thing that
  // makes a /p/ a /p/. Everything else eases in, so no sound starts on a click.
  const fadeIn = ph && !CONTINUANTS.has(ph) && !VOWELS.has(ph) ? 0.006 : 0.02;
  const fadeOut = ph ? 0.05 : 0.03;
  const chain = [
    `afade=t=in:d=${fadeIn}`,
    `afade=t=out:st=${Math.max(0, len - fadeOut).toFixed(3)}:d=${fadeOut}`,
    `volume=${gain.toFixed(2)}dB`,
    `alimiter=limit=${PEAK_LIMIT}:level=false:attack=2:release=40`,
    `adelay=${Math.round(LEAD_S * 1000)}`,
    `apad=pad_dur=${TAIL_S}`,
  ];
  ff(["-i", tmp, "-af", chain.join(","), "-c:a", "libmp3lame", "-b:a", "64k", "-ac", "1", "-ar", "44100", out]);
  unlinkSync(tmp);
}

/* ------------------------------------------------------------------ */
/* Performances — find the pieces, give them room, mark where they are  */
/* ------------------------------------------------------------------ */

const SR = 44100;

function decode(file: string): Float32Array {
  const pcm = spawnSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], {
    maxBuffer: 256 * 1024 * 1024,
  }).stdout as Buffer;
  return new Float32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
}

function encode(pcm: Float32Array, out: string): void {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-v", "error", "-y", "-f", "f32le", "-ar", String(SR), "-ac", "1", "-i", "-",
      "-c:a", "libmp3lame", "-b:a", "64k", out],
    { input: Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength) },
  );
  if (r.status !== 0) throw new Error(`encode failed: ${r.stderr}`);
}

type Span = { from: number; to: number };

/** Every pause inside a take, in samples. */
function pauses(pcm: Float32Array): Span[] {
  const n = SR / 100;
  const rms: number[] = [];
  for (let i = 0; i + n <= pcm.length; i += n) {
    let e = 0;
    for (let k = i; k < i + n; k++) e += pcm[k]! * pcm[k]!;
    rms.push(Math.sqrt(e / n));
  }
  // Deep enough that the breath a voice takes INSIDE a long "fffff" (a dip to
  // about -40 dB) is not mistaken for the pause between two sounds (-50 dB
  // and below).
  const floor = Math.max(...rms) * 10 ** (-45 / 20);
  const loud = rms.map((r) => r > floor);
  const first = loud.indexOf(true);
  const last = loud.lastIndexOf(true);
  const out: Span[] = [];
  let i = first;
  while (i <= last) {
    if (!loud[i]) {
      let j = i;
      while (j <= last && !loud[j]) j++;
      if (j - i >= 6) out.push({ from: i * n, to: j * n });
      i = j;
    } else i++;
  }
  return out;
}

/**
 * The `k` longest pauses, in time order — but only if they stand clear of the
 * rest. When the pauses that would be cut are barely longer than the ones that
 * would not (a stop's closure can look like a pause), a letter could light up
 * on the wrong sound, so the take is rejected instead of guessed at.
 */
function longestPauses(all: Span[], k: number): Span[] | null {
  if (all.length < k) return null;
  const size = (g: Span) => g.to - g.from;
  const bySize = [...all].sort((a, b) => size(b) - size(a));
  const chosen = bySize.slice(0, k);
  const smallest = Math.min(...chosen.map(size));
  const nextBiggest = bySize[k] ? size(bySize[k]!) : 0;
  if (smallest < 0.12 * SR || nextBiggest > 0.8 * smallest) return null;
  return chosen.sort((a, b) => a.from - b.from);
}

/** Per-10ms frames of a PCM buffer: loudness and zero-crossing rate. */
function frameStats(pcm: Float32Array): { rms: number; zcr: number }[] {
  const n = SR / 100;
  const out: { rms: number; zcr: number }[] = [];
  for (let i = 0; i + n <= pcm.length; i += n) {
    let e = 0;
    let z = 0;
    for (let k = i; k < i + n; k++) {
      e += pcm[k]! * pcm[k]!;
      if (k > i && Math.sign(pcm[k]!) !== Math.sign(pcm[k - 1]!)) z++;
    }
    out.push({ rms: Math.sqrt(e / n), zcr: z / n });
  }
  return out;
}

/** How voiced a stretch is: the share of its loud frames that are periodic. */
function voicedShare(stats: { rms: number; zcr: number }[], from: number, to: number): number {
  const f = stats.slice(Math.floor(from / (SR / 100)), Math.ceil(to / (SR / 100)));
  const max = Math.max(...f.map((x) => x.rms), 1e-9);
  const loud = f.filter((x) => x.rms > 0.15 * max);
  return loud.filter((x) => x.zcr < 0.14).length / Math.max(1, loud.length);
}

/** What voicing each sound should show: noise, voice, or either. */
function expectedVoicing(ph: PhonemeId): number | null {
  if (VOICELESS.has(ph) || ph === "h") return 0.1;
  if (VOWELS.has(ph) || ["m", "n", "l", "r", "ng", "w", "y"].includes(ph)) return 0.85;
  return null; // stops and voiced fricatives: a mix, no expectation
}

function* combinations(n: number, m: number): Generator<number[]> {
  const idx = Array.from({ length: m }, (_, i) => i);
  if (m > n) return;
  while (true) {
    yield [...idx];
    let i = m - 1;
    while (i >= 0 && idx[i] === n - m + i) i--;
    if (i < 0) return;
    idx[i]!++;
    for (let j = i + 1; j < m; j++) idx[j] = idx[j - 1]! + 1;
  }
}

/**
 * WHERE THE SOUNDS ARE, when pause length alone cannot say.
 *
 * A voice that paces evenly leaves pauses of nearly equal length inside a
 * sound (a breath, a stop's closure) and between sounds, so "the longest
 * pauses" stops being an answer. But a sound-out has a lot of structure to
 * lean on: each pass is the SAME sounds, so their pieces should match in
 * length and voicing; and each sound has a known voicing — /s/ is noise, /ʌ/
 * is voice. Every way of choosing the cuts is scored on exactly that, plus a
 * mild preference for longer pauses, and the best is taken only if it clearly
 * beats the runner-up. Otherwise null: refuse, never guess.
 */
function alignSoundout(pcm: Float32Array, pass: PhonemeId[], passes: number): Span[] | null {
  const k = pass.length;
  const m = passes * k;
  let cands = pauses(pcm).filter((g) => g.to - g.from >= 0.08 * SR);
  if (cands.length < m) return null;
  // keep the problem small: the m + 8 longest candidates, back in time order
  cands = [...cands]
    .sort((a, b) => b.to - b.from - (a.to - a.from))
    .slice(0, m + 8)
    .sort((a, b) => a.from - b.from);
  const stats = frameStats(pcm);
  let best = { cost: Infinity, cuts: [] as Span[] };
  let second = Infinity;
  for (const combo of combinations(cands.length, m)) {
    const cuts = combo.map((i) => cands[i]!);
    const pieces = chunks(pcm, cuts);
    const dur = pieces.map((p) => (p.to - p.from) / SR);
    if (dur.some((x) => x < 0.07) || dur[m]! < 0.25) continue;
    const voiced = pieces.map((p) => voicedShare(stats, p.from, p.to));
    let cost = 0;
    // passes should match each other, sound for sound
    for (let p = 0; p + 1 < passes; p++) {
      for (let i = 0; i < k; i++) {
        const a = p * k + i;
        const b = (p + 1) * k + i;
        cost += Math.abs(Math.log(dur[a]! / dur[b]!)) + Math.abs(voiced[a]! - voiced[b]!);
      }
    }
    // each sound should sound like what it is
    for (let i = 0; i < m; i++) {
      const want = expectedVoicing(pass[i % k]!);
      if (want !== null) cost += 1.5 * Math.abs(voiced[i]! - want);
    }
    // and a cut should be a real pause
    for (const c of cuts) cost += 0.6 * Math.max(0, 0.25 - (c.to - c.from) / SR) / 0.25;
    if (cost < best.cost) {
      second = best.cost;
      best = { cost, cuts };
    } else if (cost < second) {
      second = cost;
    }
  }
  if (!Number.isFinite(best.cost)) return null;
  if (second - best.cost < 0.25) return null;
  return best.cuts;
}

/**
 * Step one of a performance: trimmed and normalised, but otherwise exactly as
 * the voice performed it — this is what the listener hears and judges.
 */
function preparePerformance(raw: string, out: string): void {
  const tmp = out + ".norm.wav";
  ff([
    "-i", raw, "-ac", "1", "-ar", String(SR), "-af",
    [
      "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.01",
      "areverse",
      "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.02",
      "areverse",
      "afade=t=in:d=0.01",
    ].join(","),
    tmp,
  ]);
  const gain = TARGET_LUFS - loudness(tmp);
  ff([
    "-i", tmp, "-af",
    `volume=${gain.toFixed(2)}dB,alimiter=limit=${PEAK_LIMIT}:level=false:attack=2:release=40`,
    "-c:a", "libmp3lame", "-b:a", "128k", out,
  ]);
  unlinkSync(tmp);
}

/** Pieces of `pcm` between the given cuts. */
function chunks(pcm: Float32Array, cuts: Span[]): Span[] {
  const out: Span[] = [];
  let start = 0;
  for (const c of cuts) {
    out.push({ from: start, to: c.from });
    start = c.to;
  }
  out.push({ from: start, to: pcm.length });
  return out;
}

/**
 * Step two, for a take that PASSED: find the pieces, keep what is wanted, give
 * every sound room, and mark where each one now sits.
 *
 * A sound-out is cut at its pass breaks first — the longest pauses, one per
 * pass the listener heard — and if there were three passes the first is
 * dropped: the last two are the ones that lead into the word. Each kept pass
 * is then cut into its sounds at its own longest pauses. Null when any of
 * those cuts is ambiguous, because a letter must never light up on the wrong
 * sound; the take then counts as failed.
 */
function finishPerformance(file: string, plan: Plan, passes: number): [number, number][] | null {
  const pcm = decode(file);
  const lead = new Float32Array(Math.round(LEAD_S * SR));
  const tail = new Float32Array(Math.round(TAIL_S * SR));
  const parts: Float32Array[] = [lead];
  const marks: [number, number][] = [];
  let t = lead.length;
  const put = (piece: Float32Array, mark: boolean) => {
    parts.push(piece);
    if (mark) marks.push([Math.round((t / SR) * 1000), Math.round(((t + piece.length) / SR) * 1000)]);
    t += piece.length;
  };
  const gap = (s: number) => put(new Float32Array(Math.round(s * SR)), false);

  if (plan.kind === "soundout") {
    // Every sound of every pass, and the word, is one piece: passes × k cuts,
    // taken at the longest pauses all at once. (Finding the pass breaks
    // first does not work — a pause between two sounds can be nearly as long
    // as the one between two passes.)
    const k = plan.pass!.length;
    // The plain answer first — the longest pauses, when they stand clear —
    // and the structural one when they do not.
    const cuts = longestPauses(pauses(pcm), passes * k) ?? alignSoundout(pcm, plan.pass!, passes);
    if (!cuts) return null;
    const pieces = chunks(pcm, cuts);
    const firstKept = (passes - 2) * k; // drop any extra passes at the start
    for (let i = firstKept; i < pieces.length; i++) {
      put(pcm.subarray(pieces[i]!.from, pieces[i]!.to), true);
      if (i === pieces.length - 1) break;
      const natural = (cuts[i]!.to - cuts[i]!.from) / SR;
      const endOfPass = (i + 1) % k === 0;
      // never shorter than the voice made it, never shorter than asked
      gap(Math.max(natural, endOfPass ? GAP_PASS_S : GAP_SOUND_S));
    }
  } else {
    // An intro: the sound is whatever follows the last real pause.
    const real = pauses(pcm).filter((g) => g.to - g.from >= 0.12 * SR);
    const last = real[real.length - 1];
    if (!last) return null;
    const after = (pcm.length - last.to) / SR;
    if (after < 0.12 || after > 1.8) return null;
    put(pcm.subarray(0, last.from), false);
    gap(Math.max((last.to - last.from) / SR, GAP_INTRO_S));
    put(pcm.subarray(last.to), true);
  }
  parts.push(tail);
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  encode(out, file);
  return marks;
}

/* ------------------------------------------------------------------ */
/* The run                                                              */
/* ------------------------------------------------------------------ */

interface Attempt {
  input: string;
  seed: number;
  file: string;
  marks?: [number, number][];
  verdict?: Verdict;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

function attemptsFor(plan: Plan): { input: string; seed: number }[] {
  // Performances fail more often (a loop, a merged sound) and are worth more,
  // so they get more seeds.
  const seeds =
    plan.kind !== "clip"
      ? [11, 23, 37, 51, 67, 79, 97, 113]
      : plan.lang === "he"
        ? [11, 23, 37, 51]
        : [11, 23, 37];
  const list: { input: string; seed: number }[] = [];
  // Clips exhaust one way of asking before trying the next; performances
  // alternate, because their failures are random rather than systematic.
  if (plan.kind === "clip") {
    for (const input of plan.inputs) for (const seed of seeds) list.push({ input, seed });
  } else {
    for (const seed of seeds) for (const input of plan.inputs) list.push({ input, seed });
  }
  return list.slice(0, plan.kind !== "clip" ? 8 : 6);
}

async function main() {
  // Offline: how would this take be cut? (--try-split <mp3> <line id> [passes])
  const trySplit = opt("--try-split");
  if (trySplit) {
    const id = args[args.indexOf("--try-split") + 2]!;
    const passes = Number(args[args.indexOf("--try-split") + 3] ?? 2);
    const line = VOICE_LINES.find((l) => l.id === id);
    if (!line) throw new Error(`no line ${id}`);
    const copy = path.join(CACHE, "try-split.mp3");
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(copy, readFileSync(trySplit));
    const marks = finishPerformance(copy, planFor(line), passes);
    console.log(marks ? marks.map(([a, b]) => `${(a / 1000).toFixed(2)}–${(b / 1000).toFixed(2)}`).join("  ") : "refused");
    return;
  }
  if (!KEY) {
    console.error("Set OPENROUTER_API_KEY.");
    process.exit(1);
  }
  mkdirSync(path.join(CACHE, "raw"), { recursive: true });
  mkdirSync(path.join(CACHE, "takes"), { recursive: true });
  mkdirSync(OUT_DIR, { recursive: true });

  const only = opt("--only");
  const re = only ? new RegExp(only) : null;
  const plans = VOICE_LINES.filter((l) => !re || re.test(l.id)).map(planFor);
  const qa = !flag("--no-qa");
  console.log(`${plans.length} lines · ${TTS_MODEL} · voice ${VOICE}${qa ? " · blind QA" : ""}`);

  const state = new Map<string, { plan: Plan; queue: { input: string; seed: number }[]; tried: Attempt[]; done: boolean }>();
  for (const p of plans) state.set(p.line.id, { plan: p, queue: attemptsFor(p), tried: [], done: false });

  for (let round = 1; ; round++) {
    const todo = [...state.values()].filter((s) => !s.done && s.queue.length > 0);
    if (todo.length === 0) break;
    console.log(`round ${round}: ${todo.length} lines`);

    const fresh = await pool(todo, 6, async (s) => {
      const next = s.queue.shift()!;
      const file = path.join(CACHE, "takes", `${s.plan.line.id}--${s.tried.length}.mp3`);
      const a: Attempt = { ...next, file };
      // A failed request or a file ffmpeg chokes on costs this take, not the run.
      try {
        const raw = await synth(next.input, s.plan.lang, next.seed);
        if (s.plan.kind === "clip") processClip(raw, file, s.plan);
        else preparePerformance(raw, file);
      } catch (e) {
        a.verdict = { ok: false, why: `could not make the take: ${(e as Error).message.slice(0, 120)}`, score: 0 };
      }
      s.tried.push(a);
      console.log(`  · ${s.plan.line.id} take ${s.tried.length}${a.verdict ? ` — ${a.verdict.why}` : ""}`);
      return { s, a };
    });

    if (!qa) {
      fresh.forEach(({ s, a }) => {
        a.verdict = { ok: true, why: "unchecked", score: 1 };
        s.done = true;
      });
      continue;
    }

    // The acoustic floor first: a take that fails it is not worth a listen.
    const heard = fresh.filter(({ s, a }) => {
      if (a.verdict) return false;
      const floor = acousticFloor(s.plan, a.file);
      if (floor) a.verdict = { ok: false, why: floor, score: 0 };
      return !floor;
    });
    // Then the blind listener, in small batches of ONE kind of line at a
    // time. Mixed batches prime it: after a Hebrew sentence it heard the
    // English "sun" as the Hebrew "סאן", and "uh" as "אה".
    const kinds = [...new Set(heard.map(({ s }) => s.plan.line.group))];
    const batches: (typeof heard)[] = [];
    for (const kind of kinds) {
      const group = heard.filter(({ s }) => s.plan.line.group === kind);
      const size = group[0]?.s.plan.kind === "clip" ? 8 : 5;
      for (let i = 0; i < group.length; i += size) batches.push(group.slice(i, i + size));
    }
    await pool(batches, 4, async (batch) => {
      const verdicts = await judge(
        batch.map(({ a }) => a.file),
        PROMPT[batch[0]!.s.plan.kind],
      );
      batch.forEach(({ s, a }, i) => {
        const v = verdicts[i]!;
        // One odd answer from the listener fails one take — never the run.
        try {
          a.verdict = s.plan.check(v);
        } catch (e) {
          a.verdict = { ok: false, why: `could not grade: ${(e as Error).message}`, score: 0 };
        }
        if (v.judge && v.judge !== JUDGE_MODEL) a.verdict.why += ` · by ${v.judge.split("/")[1]}`;
        if (a.verdict.ok && s.plan.kind !== "clip") {
          let marks: [number, number][] | null = null;
          try {
            marks = finishPerformance(a.file, s.plan, a.verdict.passes ?? 2);
          } catch {
            marks = null;
          }
          if (marks) a.marks = marks;
          else a.verdict = { ...a.verdict, ok: false, why: `${a.verdict.why} — but its pauses do not split cleanly into those sounds` };
        }
        if (a.verdict.ok) s.done = true;
        console.log(`  ${a.verdict.ok ? "✓" : "✗"} ${s.plan.line.id}: ${a.verdict.why}`);
      });
    });
    const passed = fresh.filter(({ a }) => a.verdict?.ok).length;
    console.log(`  ${passed}/${fresh.length} passed`);
  }

  // Keep the passing take, or the best one when nothing passed.
  const now = Date.now();
  const rows = new Map<string, string>();
  const marks = new Map<string, [number, number][]>();
  const written = new Set<string>();
  for (const { plan, tried } of state.values()) {
    const passed = tried.find((t) => t.verdict?.ok);
    const best =
      passed ?? [...tried].sort((a, b) => (b.verdict?.score ?? 0) - (a.verdict?.score ?? 0))[0];
    if (!best) continue;
    const cell = (x: string) => x.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const dest = path.join(OUT_DIR, `${plan.line.id}.mp3`);
    if (plan.kind !== "clip" && !passed) {
      // A sound-out with the wrong sounds, or an intro that ends on a Hebrew
      // ר, is worse than none: the app plays the separate clips instead.
      if (existsSync(dest)) unlinkSync(dest);
      rows.set(
        plan.line.id,
        `| ⚠️ | \`${plan.line.id}\` | ${tried.length} | not kept — the app uses the separate clips | ${cell(best.verdict?.why ?? "")} |`,
      );
      continue;
    }
    writeFileSync(dest, readFileSync(best.file));
    written.add(plan.line.id);
    if (best.marks) marks.set(plan.line.id, best.marks);
    rows.set(
      plan.line.id,
      `| ${best.verdict?.ok ? "✅" : "⚠️"} | \`${plan.line.id}\` | ${tried.length} | \`${cell(best.input)}\` | ${cell(best.verdict?.why ?? "")} |`,
    );
  }

  writeIndex(now, marks, written);
  const failed = writeReport(rows);
  if (flag("--preview")) renderPreviews();
  console.log(`kept ${rows.size} clips · ${failed} need a human ear (see docs/voice-qa.md)`);
}

/** index.json lists every clip in public/voice, so it is right however the run was scoped. */
function writeIndex(now: number, marks: Map<string, [number, number][]>, written: Set<string>) {
  const known = new Set(VOICE_LINES.map((l) => l.id));
  const indexPath = path.join(OUT_DIR, "index.json");
  const prev = existsSync(indexPath)
    ? (JSON.parse(readFileSync(indexPath, "utf8")) as {
        clips: { id: string; updatedAt: number; marks?: [number, number][] }[];
      })
    : { clips: [] };
  const prevAt = new Map(prev.clips.map((c) => [c.id, c.updatedAt]));
  const prevMarks = new Map(prev.clips.map((c) => [c.id, c.marks]));
  const clips = readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".mp3"))
    .map((f) => f.slice(0, -4))
    .filter((id) => known.has(id))
    .sort()
    .map((id) => {
      const file = path.join(OUT_DIR, `${id}.mp3`);
      const fresh = written.has(id);
      return {
        id,
        url: `/voice/${id}.mp3`,
        // Never older than the file itself: in `npm run dev` the live store
        // is this same folder, stamped by mtime, and the bundled entry —
        // the one with the time marks — must win the tie (lib/voice/manifest.ts).
        updatedAt: Math.max(prevAt.get(id) ?? 0, Math.ceil(statSync(file).mtimeMs), fresh ? now : 0),
        size: statSync(file).size,
        durationMs: Math.round(probeDuration(file) * 1000),
        ...(() => {
          const m = marks.get(id) ?? (fresh ? undefined : prevMarks.get(id));
          return m ? { marks: m } : {};
        })(),
      };
    });
  writeFileSync(indexPath, JSON.stringify({ generatedAt: now, clips }, null, 2) + "\n");
}

/** docs/voice-qa.md — a scoped run (--only) replaces its own rows and keeps the rest. */
function writeReport(fresh: Map<string, string>): number {
  const rows = new Map<string, string>();
  if (existsSync(REPORT)) {
    for (const r of readFileSync(REPORT, "utf8").split("\n")) {
      const id = r.match(/^\| (?:✅|⚠️) \| `([^`]+)`/)?.[1];
      if (id) rows.set(id, r);
    }
  }
  fresh.forEach((r, id) => rows.set(id, r));
  const known = new Set(VOICE_LINES.map((l) => l.id));
  const all = [...rows.entries()]
    .filter(([id]) => known.has(id))
    .sort(([a, ra], [b, rb]) => Number(ra.startsWith("| ✅")) - Number(rb.startsWith("| ✅")) || a.localeCompare(b))
    .map(([, r]) => r);
  const failed = all.filter((r) => r.startsWith("| ⚠️")).length;
  writeFileSync(
    REPORT,
    [
      "# Voice QA",
      "",
      `Generated by \`scripts/generate-voice.ts\` — ${TTS_MODEL}, voice \`${VOICE}\`, every take blind-checked by \`${JUDGE_MODEL}\`.`,
      "",
      `${all.length} clips. ${
        failed === 0
          ? "Every clip passed the blind check."
          : `${failed} did not pass the blind check and kept their closest take — listen to these first.`
      }`,
      "",
      "A pass means a listener who was NOT told the script heard the right thing. That is a strong filter, not a guarantee — the listener is itself a model — so the table also says what it heard.",
      "",
      "| | line | takes | asked for | heard |",
      "|---|---|---|---|---|",
      ...all,
      "",
    ].join("\n"),
  );
  return failed;
}

/** Copies of the performance lines, where a human can find them. */
function renderPreviews() {
  const dir = path.join(CACHE, "preview");
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(OUT_DIR).filter((x) => /^(soundout-|narration-intro-).*\.mp3$/.test(x))) {
    writeFileSync(path.join(dir, f), readFileSync(path.join(OUT_DIR, f)));
  }
  console.log(`previews in ${dir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
