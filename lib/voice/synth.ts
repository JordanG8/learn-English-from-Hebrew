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
 *   2. THIS — Fish Audio, reached through the Vercel AI Gateway, cached as an
 *      mp3 in the same store the recordings live in.
 *   3. The browser's own SpeechSynthesis voice, which is where the app used to
 *      stop, and where it still stops if neither of the above is available.
 *
 * Tier 2 exists because tier 3 fails at exactly the two things this app is
 * made of:
 *
 *   · LETTER SOUNDS. "buh", "ss", "kuh" are not words, so a browser voice
 *     guesses at them — and guesses differently on an iPhone than on a school
 *     Chromebook. A speech model that takes an `instructions` string can be
 *     told, in words, that this is a single English phoneme spoken in
 *     isolation, and handed the IPA the curriculum already carries.
 *   · HEBREW. The walkthrough and every tutorial card are Hebrew, and the app
 *     deliberately never sent those to a browser voice (see lib/voice/lines.ts
 *     — a robotic Hebrew voice reading to a 7-year-old is worse than silence).
 *     So until a human records them they are silent today. Fish's S2 line is
 *     multilingual, which turns that silence into something a child can
 *     actually listen to while they look at the card.
 *
 * WHAT IT COSTS
 * -------------
 * Nothing per play, and almost nothing ever: the catalogue is closed (~180
 * lines), a line is generated at most once per DIRECTION_VERSION, and the mp3
 * is then served from the store and the CDN. The whole catalogue is a few
 * thousand characters — cents at list price, and the Fish models are
 * complimentary on the gateway through 18 September 2026.
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
 * `fish-audio/s2.1-pro` is Fish's current best: multilingual (which is what
 * makes the Hebrew cards possible) and steerable by an `instructions` string
 * (which is what makes the letter sounds possible).
 *
 * Append `-free` — `fish-audio/s2.1-pro-free` — to pin the promotional free
 * variant, which stops serving rather than starting to bill when the promo
 * ends. Override with VOICE_SYNTH_MODEL; any gateway speech model works,
 * including `openai/tts-1`.
 */
export const SYNTH_MODEL = process.env.VOICE_SYNTH_MODEL ?? "fish-audio/s2.1-pro";

/**
 * A Fish voice id, if you have one. Fish supports voice cloning from a short
 * sample, so the honest use of this variable is: record a minute at /studio,
 * clone it, and let the synthesised lines sound like the same person who
 * recorded the rest. Unset means the model's default voice.
 */
const SYNTH_VOICE = process.env.VOICE_SYNTH_VOICE;

/**
 * BUMP THIS WHENEVER THE DIRECTION BELOW CHANGES.
 *
 * It is part of the cache path, so a bump means every line is regenerated
 * with the new direction rather than serving yesterday's take forever. Old
 * versions are orphaned rather than deleted — see docs/voice.md.
 */
export const DIRECTION_VERSION = "v1";

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
  voice: boolean;
}> {
  return {
    enabled: synthEnabled(),
    model: SYNTH_MODEL,
    version: DIRECTION_VERSION,
    credential: await credentialKind(),
    voice: Boolean(SYNTH_VOICE),
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
        instructions:
          `Produce the single English phoneme ${ipa} in isolation — the SOUND ` +
          `the letter "${letter}" makes, not its name. Keep it short and ` +
          `clipped, with NO trailing vowel: "b", not "buh"; "s", not "suh". ` +
          `A trailing vowel is the exact mistake that teaches a child to read ` +
          `"bat" as "buh-a-tuh". ${CHILD}`,
      };
    }
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
        instructions: d.instructions,
        language: d.language,
        speed: d.speed,
        outputFormat: "mp3",
        ...(SYNTH_VOICE ? { voice: SYNTH_VOICE } : {}),
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
