/**
 * THE AI GATEWAY, AS THIS APP TALKS TO IT — credential and headers, once.
 *
 * Two features reach the gateway for audio: the synthesised voice
 * (lib/voice/synth.ts) and the pronunciation check (lib/voice/listen.ts).
 * They send different bodies to different endpoints, and everything else
 * about the call is identical — which is exactly the shape that drifts if it
 * is written twice.
 *
 * THE HEADERS ARE NOT GUESSABLE. Without
 * `ai-gateway-protocol-version` the endpoint answers "Unsupported gateway
 * protocol version" and names neither the header it wants nor the value, so
 * the first attempt at any of this fails in a way that looks like the model
 * id is wrong. These are the same headers `@ai-sdk/gateway` sends; they are
 * written down here so the next person does not have to read a bundle to
 * find them.
 *
 * WHY NOT THE AI SDK: `experimental_generateSpeech` / `experimental_transcribe`
 * need `ai` >= 7 with `@ai-sdk/gateway` >= 4, and this app is on `ai` 5 for
 * conversation mode. Two major upgrades to reach two JSON endpoints is a
 * bigger, riskier change than the endpoints. See docs/voice.md.
 */

export const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v4/ai";

/** The gateway's own wire-protocol version, distinct from a model spec. */
const PROTOCOL_VERSION = "0.0.1";

/**
 * The bearer. Same two credentials the conversation route accepts, same
 * precedence, for the same reason: a deployment gets OIDC for free, a laptop
 * needs a key in `.env.local`. See docs/deployment.md.
 *
 * The value is never returned to a caller, logged, or sent anywhere but the
 * gateway.
 */
export function gatewayCredential(): string | null {
  return process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN ?? null;
}

/** Which mechanism is in play — a name, never a value. Diagnostics only. */
export function credentialKind(): "api-key" | "oidc" | null {
  if (process.env.AI_GATEWAY_API_KEY) return "api-key";
  if (process.env.VERCEL_OIDC_TOKEN) return "oidc";
  return null;
}

/**
 * `spec` is the model-family specification version, and its header name is
 * per family: a speech model wants `ai-speech-model-specification-version`, a
 * transcription model wants `ai-transcription-model-specification-version`.
 */
export function gatewayHeaders(
  token: string,
  modelId: string,
  spec: { header: string; version: string },
): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    "ai-model-id": modelId,
    [spec.header]: spec.version,
    "ai-gateway-protocol-version": PROTOCOL_VERSION,
  };
}
