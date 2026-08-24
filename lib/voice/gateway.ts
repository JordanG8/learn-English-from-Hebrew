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
 * WHY THESE HELPERS STILL EXIST WITH AI SDK 7: the cached speech and
 * transcription paths predate the SDK's audio surface and already share a
 * compact, well-tested HTTP contract. Letter Grove's realtime narration uses
 * the official SDK; these helpers remain the single credential source for the
 * existing raw endpoints until those paths are migrated deliberately.
 *
 * THE PRICE OF NOT USING THE SDK is that OIDC has to be resolved by hand, and
 * that is the one part of this that is genuinely surprising — see
 * `gatewayCredential`.
 */

import { getVercelOidcToken } from "@vercel/oidc";

export const GATEWAY_BASE = "https://ai-gateway.vercel.sh/v4/ai";

/** The gateway's own wire-protocol version, distinct from a model spec. */
const PROTOCOL_VERSION = "0.0.1";

/**
 * The bearer, and THE ONE THING ABOUT THIS THAT IS NOT OBVIOUS.
 *
 * `VERCEL_OIDC_TOKEN` is a process environment variable only on a laptop,
 * where `vercel env pull` writes it into `.env.local`. In a deployed function
 * it is NOT: it arrives per request as an `x-vercel-oidc-token` header, and
 * `@vercel/oidc` is what reaches into the request context to get it. So code
 * that reads `process.env.VERCEL_OIDC_TOKEN` works perfectly in development
 * and returns null in production — which is exactly how this presented, and
 * is the same trap `blobCredential` in lib/voice/store.ts documents for the
 * blob store. The SDKs hide it; a hand-written fetch has to not.
 *
 * `getVercelOidcToken()` covers both: request context first, environment
 * variable second, and it refreshes an expired token in development.
 *
 * An explicit API key still wins when one is set — same precedence as the
 * conversation route. The value is never returned to a caller, logged, or
 * sent anywhere but the gateway.
 */
export async function gatewayCredential(): Promise<string | null> {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (key) return key;
  try {
    return await getVercelOidcToken();
  } catch {
    // Thrown when there is no request context and no variable — i.e. there is
    // no OIDC here. That is a state, not an error.
    return null;
  }
}

/**
 * Which mechanism is in play — a name, never a value. Diagnostics only, and
 * async for the same reason as above: on a deployment the only way to know
 * whether OIDC is available is to ask for the token.
 */
export async function credentialKind(): Promise<"api-key" | "oidc" | null> {
  if (process.env.AI_GATEWAY_API_KEY) return "api-key";
  try {
    await getVercelOidcToken();
    return "oidc";
  } catch {
    return null;
  }
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
