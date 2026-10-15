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
import { type PhonemeId, segmentsFor } from "@/lib/phonics";

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

interface Plan {
  line: VoiceLine;
  inputs: string[];
  lang: "en" | "he";
  phoneme?: PhonemeId;
  check: (j: Judged) => { ok: boolean; why: string; score: number };
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
    .replace(/[ːˑʰˈˌ.'’\/\[\]\s()-]/g, "");
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
      inputs,
      check: (j) => {
        const heard = lettersOnly(j.text);
        const good = heard === want;
        const r = graded(good, j, good ? `heard "${j.text}"` : `heard "${j.text}", want "${line.text}"`);
        return good ? r : { ...r, score: similarity(heard, want) };
      },
    };
  }
  // Hebrew narration: the walkthrough, every lesson card, every letter intro.
  const spoken = hebrewForSpeech(line.text);
  const want = hebrewLetters(spoken);
  return {
    line,
    lang: "he",
    inputs: [`${HEBREW_TAG} ${spoken}`],
    check: (j) => {
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
      const res = await fetch(`https://openrouter.ai/api/v1${pathname}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 429 || res.status >= 500) {
        last = new Error(`${res.status} ${await res.text()}`);
      } else {
        return res;
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

async function judge(files: string[]): Promise<Judged[]> {
  const content: unknown[] = [{ type: "text", text: JUDGE_PROMPT }];
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

  if (ph && !VOICELESS.has(ph)) {
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
/* The run                                                              */
/* ------------------------------------------------------------------ */

interface Attempt {
  input: string;
  seed: number;
  file: string;
  verdict?: { ok: boolean; why: string; score: number };
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
  const seeds = plan.lang === "he" ? [11, 23, 37, 51] : [11, 23, 37];
  const list: { input: string; seed: number }[] = [];
  for (const input of plan.inputs) for (const seed of seeds) list.push({ input, seed });
  return list.slice(0, 6);
}

async function main() {
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
      const raw = await synth(next.input, s.plan.lang, next.seed);
      const file = path.join(CACHE, "takes", `${s.plan.line.id}--${s.tried.length}.mp3`);
      processClip(raw, file, s.plan);
      const a: Attempt = { ...next, file };
      s.tried.push(a);
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
      for (let i = 0; i < group.length; i += 8) batches.push(group.slice(i, i + 8));
    }
    await pool(batches, 4, async (batch) => {
      const verdicts = await judge(batch.map(({ a }) => a.file));
      batch.forEach(({ s, a }, i) => {
        const v = verdicts[i]!;
        a.verdict = s.plan.check(v);
        if (v.judge && v.judge !== JUDGE_MODEL) a.verdict.why += ` · by ${v.judge.split("/")[1]}`;
        if (a.verdict.ok) s.done = true;
      });
    });
    const passed = fresh.filter(({ a }) => a.verdict?.ok).length;
    console.log(`  ${passed}/${fresh.length} passed`);
  }

  // Keep the passing take, or the best one when nothing passed.
  const now = Date.now();
  const rows = new Map<string, string>();
  for (const { plan, tried } of state.values()) {
    const best =
      tried.find((t) => t.verdict?.ok) ??
      [...tried].sort((a, b) => (b.verdict?.score ?? 0) - (a.verdict?.score ?? 0))[0];
    if (!best) continue;
    writeFileSync(path.join(OUT_DIR, `${plan.line.id}.mp3`), readFileSync(best.file));
    const cell = (x: string) => x.replace(/\|/g, "\\|").replace(/\n/g, " ");
    rows.set(
      plan.line.id,
      `| ${best.verdict?.ok ? "✅" : "⚠️"} | \`${plan.line.id}\` | ${tried.length} | \`${cell(best.input)}\` | ${cell(best.verdict?.why ?? "")} |`,
    );
  }

  writeIndex(now);
  const failed = writeReport(rows);
  if (flag("--preview")) renderPreviews();
  console.log(`kept ${rows.size} clips · ${failed} need a human ear (see docs/voice-qa.md)`);
}

/** index.json lists every clip in public/voice, so it is right however the run was scoped. */
function writeIndex(now: number) {
  const known = new Set(VOICE_LINES.map((l) => l.id));
  const indexPath = path.join(OUT_DIR, "index.json");
  const prev = existsSync(indexPath)
    ? (JSON.parse(readFileSync(indexPath, "utf8")) as { clips: { id: string; updatedAt: number }[] })
    : { clips: [] };
  const prevAt = new Map(prev.clips.map((c) => [c.id, c.updatedAt]));
  const clips = readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".mp3"))
    .map((f) => f.slice(0, -4))
    .filter((id) => known.has(id))
    .sort()
    .map((id) => {
      const file = path.join(OUT_DIR, `${id}.mp3`);
      const fresh = statSync(file).mtimeMs > now - 60 * 60 * 1000;
      return {
        id,
        url: `/voice/${id}.mp3`,
        updatedAt: fresh ? now : (prevAt.get(id) ?? now),
        size: statSync(file).size,
        durationMs: Math.round(probeDuration(file) * 1000),
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

/**
 * Two files that sound exactly like the app will: the S letter intro (the
 * Hebrew sentence, then /s/) and the SUN word intro (sounded out twice, then
 * the word). For a human to approve before anything else is trusted.
 */
function renderPreviews() {
  const dir = path.join(CACHE, "preview");
  mkdirSync(dir, { recursive: true });
  const clip = (id: string) => path.join(OUT_DIR, `${id}.mp3`);
  const silence = (s: number) => {
    const f = path.join(dir, `sil-${s}.wav`);
    if (!existsSync(f)) ff(["-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono`, "-t", String(s), f]);
    return f;
  };
  const join = (name: string, parts: string[]) => {
    const list = path.join(dir, `${name}.txt`);
    writeFileSync(list, parts.map((p) => `file '${p}'`).join("\n"));
    ff(["-f", "concat", "-safe", "0", "-i", list, "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "96k", path.join(dir, `${name}.mp3`)]);
  };
  join("letter-intro-S", [clip("narration-intro-S"), silence(0.15), clip("phoneme-s")]);
  // The same timing the word intro uses: a slow pass, a quicker one, the word.
  const sun = segmentsFor("SUN").map((seg) => clip(`phoneme-${seg.ph}`));
  const slow = sun.flatMap((c, i) => (i < sun.length - 1 ? [c, silence(0.22)] : [c]));
  const quick = sun.flatMap((c, i) => (i < sun.length - 1 ? [c, silence(0.09)] : [c]));
  join("word-intro-SUN", [...slow, silence(0.55), ...quick, silence(0.55), clip("word-SUN")]);
  console.log(`previews in ${dir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
