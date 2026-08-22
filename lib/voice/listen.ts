/**
 * LISTENING — the other direction, and the first time this app has ever used
 * a microphone for anything but authoring.
 *
 * Everything else in lib/voice/ is about the app SPEAKING. This is the app
 * hearing: a child says an English word into a phone, a transcription model
 * turns it into text, and lib/voice/pronounce.ts decides whether that text is
 * the word that was asked for.
 *
 * WHAT IS SENT, AND WHAT IS KEPT
 * ------------------------------
 * Sent: a few seconds of audio, and nothing else — no name, no id, no
 * progress, no cookie. The route holds it in memory for the length of one
 * request and it is gone when the request ends. It is never written to the
 * blob store, never written to disk, never logged. There is no database in
 * this project and this feature does not add one.
 *
 * That is not a nicety. The recording is a child's voice, the user is seven,
 * and the only defensible design is one where there is nothing to leak later.
 * If a future change wants to keep a clip — to show a parent, to build a
 * dataset — that is a different feature with a different conversation, and it
 * starts by editing this paragraph.
 *
 * Never throws. Every failure is a reason code, because every one of them
 * means the same thing on screen: we could not hear that, try once more.
 */

import { credentialKind, gatewayCredential, gatewayHeaders, GATEWAY_BASE } from "./gateway";

/**
 * `fish-audio/transcribe-1` — Fish's transcription model, complimentary on the
 * gateway through 18 September 2026 and $0.36/hour of audio after that (a
 * three-second take is a hundred-thousandth of an hour; this is not where the
 * money goes). Append `-free` to pin the promotional variant, which stops
 * serving rather than starting to bill. Override with VOICE_LISTEN_MODEL —
 * `openai/whisper-1` is the obvious alternative.
 */
export const LISTEN_MODEL =
  process.env.VOICE_LISTEN_MODEL ?? "fish-audio/transcribe-1";

const ENDPOINT = `${GATEWAY_BASE}/transcription-model`;

/**
 * A child saying one word takes under two seconds; the recorder caps a take
 * at fifteen. Fifteen seconds of opus is well under this, and anything that
 * is not is not a take.
 */
export const MAX_AUDIO_BYTES = 2_000_000;

/** A child is standing there waiting to find out. Past this, ask them again. */
const TIMEOUT_MS = 15_000;

export type ListenReason =
  | "off"
  | "no-credential"
  | "too-large"
  | "upstream"
  | "timeout";

export type ListenResult =
  | { ok: true; text: string; durationInSeconds?: number }
  | { ok: false; reason: ListenReason; detail?: string };

export function listenEnabled(): boolean {
  return process.env.VOICE_LISTEN_DISABLED !== "1";
}

/** Names and booleans only — the same diagnostic shape as the speech tier. */
export async function listenEnvSummary(): Promise<{
  enabled: boolean;
  model: string;
  credential: "api-key" | "oidc" | null;
}> {
  return {
    enabled: listenEnabled(),
    model: LISTEN_MODEL,
    credential: await credentialKind(),
  };
}

interface GatewayTranscriptionResponse {
  text?: string;
  durationInSeconds?: number;
  language?: string;
}

/**
 * Transcribe one take. `mediaType` is whatever the browser's MediaRecorder
 * produced — webm/opus on Chrome and Android, mp4/aac on every iPhone — and
 * is passed through rather than guessed, because guessing it is how the
 * iPhone half of the audience stops working.
 */
export async function transcribeTake(
  audio: Buffer,
  mediaType: string,
): Promise<ListenResult> {
  if (!listenEnabled()) return { ok: false, reason: "off" };
  if (audio.byteLength > MAX_AUDIO_BYTES) return { ok: false, reason: "too-large" };

  const key = await gatewayCredential();
  if (!key) return { ok: false, reason: "no-credential" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: gatewayHeaders(key, LISTEN_MODEL, {
        header: "ai-transcription-model-specification-version",
        version: "4",
      }),
      body: JSON.stringify({
        audio: audio.toString("base64"),
        // Codec parameters ("audio/webm;codecs=opus") are not a media type.
        mediaType: mediaType.split(";")[0]?.trim() || "audio/webm",
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 300);
      return { ok: false, reason: "upstream", detail: `${res.status} ${detail}` };
    }

    const body = (await res.json()) as GatewayTranscriptionResponse;
    // An empty transcript is a legitimate answer — a muted microphone, a shy
    // child, a room that swallowed it — and the caller turns it into "say it
    // again", not into an error.
    return {
      ok: true,
      text: body.text ?? "",
      durationInSeconds: body.durationInSeconds,
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
