/**
 * THE SYNTHESISED VOICE — the tier between a human recording and the browser.
 *
 * WHY THIS EXISTS
 * ---------------
 * The app speaks in three voices now, and it always uses the best one it can
 * get for the line in hand:
 *
 *   1. A HUMAN RECORDING, made at /studio. Always wins. Nothing here changes
 *      that, and nothing here is offered to a line that has one.
 *   2. THIS — an OpenAI speech model, reached through the Vercel AI Gateway,
 *      cached as an mp3 in the same store the recordings live in.
 *   3. The browser's own SpeechSynthesis voice, which is where the app used to
 *      stop, and where it still stops if neither of the above is available.
 *
 * Tier 2 exists because tier 3 fails at exactly the things this app is made
 * of:
 *
 *   · SENTENCES. Levels 76-100 shipped with fifty English sentences that
 *     nobody has recorded, so today they are read by the browser voice —
 *     the one place in the app where a child actually hears it. Prosody is
 *     most of what makes a sentence comprehensible, and prosody is precisely
 *     what a browser voice does not have.
 *   · LETTER SOUNDS. "buh", "ss", "kuh" are not words, so a browser voice
 *     guesses at them — and guesses differently on an iPhone than on a school
 *     Chromebook. A speech model reads them the same way on every device, for
 *     every child, which is most of the value: a phoneme a child is learning
 *     to recognise must not change shape between the tablet and the laptop.
 *     (The direction below can also NAME the phoneme in IPA, on a model that
 *     is steerable. See SYNTH_MODEL for why the current one is not.)
 *   · HEBREW. The walkthrough and every tutorial card are Hebrew, and the app
 *     deliberately never sent those to a browser voice (see lib/voice/lines.ts
 *     — a robotic Hebrew voice reading to a 7-year-old is worse than silence).
 *     So until a human records them they are silent today. The speech model is
 *     multilingual, which turns that silence into something a child can
 *     actually listen to while they look at the card.
 *
 * WHAT IT COSTS
 * -------------
 * Nothing per play, and almost nothing ever: the catalogue is closed (~180
 * lines), a line is generated at most once per DIRECTION_VERSION, and the mp3
 * is then served from the store and the CDN. The whole catalogue is a few
 * thousand characters — cents at list price.
 *
 * WHY A RAW `fetch` AND NOT THE AI SDK
 * ------------------------------------
 * `experimental_generateSpeech` needs `ai` >= 7.0.31 with
 * `@ai-sdk/gateway` >= 4.0.23; this app is on `ai` 5, which the conversation
 * route depends on. Upgrading two majors to reach one endpoint is a much
 * bigger change than the endpoint itself, and the gateway's speech route is a
 * plain JSON POST. When `ai` is next upgraded, this file becomes a call to
 * `generateSpeech({ model: gateway.speechModel(SYNTH_MODEL), ... })` and
 * nothing else moves — the shape below is deliberately the same shape.
 *
 * NOTHING HERE THROWS AT THE CALLER. A missing credential, an upstream 429, a
 * timeout — all resolve to a reason code, because every one of them means the
 * same thing to a child: this line uses the browser voice today.
 */

import { getLetter } from "@/lib/curriculum/alphabet";
import { credentialKind, gatewayCredential, gatewayHeaders, GATEWAY_BASE } from "./gateway";
import { getVoiceLine, type VoiceLine } from "./lines";

/**
 * The speech model, as a gateway `creator/model-name` id.
 *
 * WHY THIS IS NOT FISH ANY MORE.
 *
 * It was `fish-audio/s2.1-pro`, chosen for two real strengths — it is
 * multilingual, and it takes an `instructions` string. In use it failed at
 * the one thing this app needs more than either: SOUNDING THE SAME TWICE.
 * Fish's expressive line is built to perform, and asked for a single word or
 * a five-word sentence it performs — it lilts, it sings the line, and it
 * picks a different speaker from one generation to the next when no cloned
 * voice id is pinned. A child hearing "cat" in one voice and "the cat is
 * big" in another, one of them half-sung, cannot use either as a model of
 * how English sounds. That is not a tuning problem, it is the wrong tool.
 *
 * `openai/tts-1-hd` is the right one here. Its six voices are fixed and
 * named, so PINNING ONE MAKES EVERY GENERATED LINE THE SAME SPEAKER, forever,
 * across letters, words and sentences. It reads plainly — no performance, no
 * melody — which is exactly what a pronunciation model should do. It honours
 * `speed`, which is how the groups below stay differently paced. And it is
 * multilingual enough for the Hebrew cards.
 *
 * WHAT IT COSTS US: `instructions` is an OpenAI `gpt-4o-mini-tts` feature and
 * the gateway's speech catalogue does not carry that model. tts-1-hd ignores
 * direction. See `supportsInstructions` — the direction is still written, and
 * still sent to any model that can use it, so switching back to a steerable
 * model is one environment variable.
 *
 * Override with VOICE_SYNTH_MODEL; any gateway speech model works.
 */
export const SYNTH_MODEL = process.env.VOICE_SYNTH_MODEL ?? "openai/tts-1-hd";

/**
 * THE VOICE, AND WHY IT HAS A DEFAULT NOW.
 *
 * It did not, and an unpinned voice on a model that picks one per request is
 * the whole of "the voice keeps changing". One name, written down, is the
 * fix — every synthesised line in the app is this speaker.
 *
 * `nova` is the warmest and least announcer-like of OpenAI's six (`alloy`,
 * `echo`, `fable`, `onyx`, `nova`, `shimmer`), which is what the direction
 * below asks for in words and cannot ask for on this model.
 *
 * On a model that clones — Fish, say — this is where a voice id from a minute
 * recorded at /studio goes, so the synthesised lines sound like the person
 * who recorded the rest. Changing it is a voice change for the whole app:
 * bump DIRECTION_VERSION with it, or half the catalogue stays the old speaker.
 */
const SYNTH_VOICE = process.env.VOICE_SYNTH_VOICE ?? "nova";

/**
 * Does this model act on `instructions`, or merely accept and ignore it?
 *
 * The gateway does not fail a request over an option a model cannot use — it
 * reports it in `warnings` — so sending direction everywhere would "work" and
 * quietly do nothing. Naming the models that honour it keeps the difference
 * visible: on tts-1/tts-1-hd the direction is documentation, on a steerable
 * model it is input.
 */
function supportsInstructions(model: string): boolean {
  return /gpt-4o.*-tts|fish-audio|grok-tts/.test(model);
}

/**
 * BUMP THIS WHENEVER THE DIRECTION BELOW CHANGES.
 *
 * It is part of the cache path, so a bump means every line is regenerated
 * with the new direction rather than serving yesterday's take forever. Old
 * versions are orphaned rather than deleted — see docs/voice.md.
 */
export const DIRECTION_VERSION = "v2";

const ENDPOINT = `${GATEWAY_BASE}/speech-model`;

/** Generation is slow-ish and a child is waiting. Past this, use the browser. */
const TIMEOUT_MS = 20_000;

export type SynthReason =
  | "off"
  | "no-credential"
  | "unknown-line"
  | "upstream"
  | "timeout";

export type SynthResult =
  | { ok: true; audio: Buffer; contentType: "audio/mpeg" }
  | { ok: false; reason: SynthReason; detail?: string };

/**
 * Off by default? No — on by default, off by a variable. The feature is
 * useless to the person testing it if turning it on needs a deploy, and every
 * failure path degrades to the voice the app had before it.
 */
export function synthEnabled(): boolean {
  return process.env.VOICE_SYNTH_DISABLED !== "1";
}

/** Names and booleans only, for the manifest route's diagnostics block. */
export async function synthEnvSummary(): Promise<{
  enabled: boolean;
  model: string;
  version: string;
  credential: "api-key" | "oidc" | null;
  /** The pinned speaker. A voice NAME is not a secret; an unpinned one is a bug. */
  voice: string;
  steerable: boolean;
}> {
  return {
    enabled: synthEnabled(),
    model: SYNTH_MODEL,
    version: DIRECTION_VERSION,
    credential: await credentialKind(),
    voice: SYNTH_VOICE,
    steerable: supportsInstructions(SYNTH_MODEL),
  };
}

/* ------------------------------------------------------------------ */
/* Direction — the difference between a voice and a good voice          */
/* ------------------------------------------------------------------ */

export interface Direction {
  text: string;
  instructions: string;
  /** ISO 639-1. The model detects, but the app already knows. */
  language: "en" | "he";
  /** 1 is the model's own pace. Children need less than that. */
  speed: number;
}

const CHILD =
  "The listener is a 7-year-old in Israel who is hearing English for the " +
  "first time. Speak warmly and plainly, like a patient teacher, never like " +
  "an announcer. Leave a beat of silence at the start and the end.";

/**
 * What to say, and how — per group, because the four groups need four
 * genuinely different readings and treating them alike is what makes a
 * synthesised voice sound synthesised.
 *
 * The IPA comes from the curriculum, where it was already written down for
 * the teacher. It is the one piece of information that turns "read the string
 * b-u-h" into "produce the phoneme /b/", and it is the reason this tier can
 * beat a browser voice at the app's hardest line.
 */
export function directionFor(line: VoiceLine): Direction {
  switch (line.group) {
    case "letter-name": {
      const letter = line.id.slice("letter-name-".length);
      return {
        text: line.text,
        language: "en",
        speed: 0.9,
        instructions:
          `Say the NAME of the English letter "${letter}" — the word you say ` +
          `when you recite the alphabet — once, and nothing else. ${CHILD}`,
      };
    }
    case "letter-sound": {
      const letter = line.id.slice("letter-sound-".length);
      const ipa = getLetter(letter)?.ipa ?? "";
      return {
        // "buh" is a crude spelling of a phoneme, written for a browser voice
        // that had no other way in. The instructions below are the real
        // input; the text is the pronunciation hint.
        text: line.text,
        language: "en",
        speed: 0.85,
        // Written for a steerable model, and true whether or not the model
        // in use today acts on it — see `supportsInstructions`.
        instructions:
          `Produce the single English phoneme ${ipa} in isolation — the SOUND ` +
          `the letter "${letter}" makes, not its name. Keep it short and ` +
          `clipped, with NO trailing vowel: "b", not "buh"; "s", not "suh". ` +
          `A trailing vowel is the exact mistake that teaches a child to read ` +
          `"bat" as "buh-a-tuh". ${CHILD}`,
      };
    }
    case "sentence":
      return {
        text: line.text,
        language: "en",
        // Slower than a word, but not word-by-word: the whole reason a
        // recorded sentence beats a recorded word is prosody, and a sentence
        // read at dictation speed has none.
        speed: 0.85,
        instructions:
          `Read this short English sentence aloud as one phrase, with natural ` +
          `sentence intonation — falling at a full stop, rising at a question ` +
          `mark. Do not read it word by word, and do not stress every word ` +
          `equally. ${CHILD}`,
      };
    case "word":
      return {
        text: line.text,
        language: "en",
        speed: 0.9,
        instructions:
          `Say the single English word "${line.text}" once, at a natural ` +
          `pace — clear, but not over-enunciated or drawn out. ${CHILD}`,
      };
    case "narration":
    case "lesson-card":
    default:
      return {
        text: line.text,
        language: "he",
        speed: 0.95,
        instructions:
          `Read this Hebrew sentence to a child who is looking at it on ` +
          `screen. Gentle, unhurried, encouraging. ${CHILD}`,
      };
  }
}

/* ------------------------------------------------------------------ */
/* The call                                                             */
/* ------------------------------------------------------------------ */

interface GatewaySpeechResponse {
  audio: string;
  warnings?: unknown[];
}

/** Synthesise one catalogue line. Never throws. */
export async function synthesizeLine(id: string): Promise<SynthResult> {
  if (!synthEnabled()) return { ok: false, reason: "off" };

  const line = getVoiceLine(id);
  if (!line) return { ok: false, reason: "unknown-line" };

  const key = await gatewayCredential();
  if (!key) return { ok: false, reason: "no-credential" };

  const d = directionFor(line);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: gatewayHeaders(key, SYNTH_MODEL, {
        header: "ai-speech-model-specification-version",
        version: "4",
      }),
      body: JSON.stringify({
        text: d.text,
        // Sent only where it is acted on. On tts-1-hd it would come back as a
        // warning and change nothing, which is worse than not sending it: it
        // reads, in the logs and in the code, as steering that is happening.
        ...(supportsInstructions(SYNTH_MODEL) ? { instructions: d.instructions } : {}),
        language: d.language,
        speed: d.speed,
        outputFormat: "mp3",
        voice: SYNTH_VOICE,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      // The body names the mechanism — no credit on the account, an unknown
      // model id, a rate limit — and naming it is the difference between a
      // five-minute fix and a hunt. It never contains a secret.
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return { ok: false, reason: "upstream", detail: `${res.status} ${detail}` };
    }

    const body = (await res.json()) as GatewaySpeechResponse;
    if (!body?.audio) return { ok: false, reason: "upstream", detail: "no-audio" };
    /*
     * A warning here means the model silently dropped something we asked for —
     * the voice, the speed, the language. Every one of those is audible, and
     * a dropped `voice` is precisely the failure this file exists to fix, so
     * it gets said out loud rather than discovered by ear.
     */
    if (Array.isArray(body.warnings) && body.warnings.length) {
      console.warn(
        `[voice-synth] ${id}: model warnings ${JSON.stringify(body.warnings).slice(0, 200)}`,
      );
    }

    return {
      ok: true,
      audio: Buffer.from(body.audio, "base64"),
      contentType: "audio/mpeg",
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return {
      ok: false,
      reason: "upstream",
      detail: err instanceof Error ? err.message.slice(0, 200) : "unreachable",
    };
  } finally {
    clearTimeout(timer);
  }
}
