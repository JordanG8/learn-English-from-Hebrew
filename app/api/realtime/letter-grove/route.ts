import { gateway } from "@ai-sdk/gateway";
import { LETTER_GROVE_REALTIME_MODEL } from "@/lib/voice/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_WINDOW_MS = 60_000;
const MAX_TOKENS_PER_WINDOW = 6;
const tokenBuckets = new Map<string, { count: number; resetsAt: number }>();

function requestComesFromThisApp(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return process.env.NODE_ENV !== "production";
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function requesterKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

function tokenRateLimit(request: Request): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  if (tokenBuckets.size > 512) {
    tokenBuckets.forEach((bucket, key) => {
      if (bucket.resetsAt <= now) tokenBuckets.delete(key);
    });
  }
  const key = requesterKey(request);
  const previous = tokenBuckets.get(key);
  if (!previous || previous.resetsAt <= now) {
    tokenBuckets.set(key, { count: 1, resetsAt: now + TOKEN_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (previous.count >= MAX_TOKENS_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((previous.resetsAt - now) / 1000)),
    };
  }
  previous.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Mint the short-lived, model-bound token required by Gateway realtime.
 * The Gateway/OIDC credential stays on the server; the browser only receives
 * a 60-second client secret for this one model.
 */
export async function POST(request: Request) {
  if (!requestComesFromThisApp(request)) {
    return Response.json({ error: "origin-not-allowed" }, { status: 403 });
  }

  const rateLimit = tokenRateLimit(request);
  if (!rateLimit.allowed) {
    return Response.json(
      { error: "rate-limited" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  try {
    const { token, url, expiresAt } = await gateway.experimental_realtime.getToken({
      model: LETTER_GROVE_REALTIME_MODEL,
      expiresAfterSeconds: 60,
    });

    return Response.json(
      { token, url, expiresAt, tools: [], model: LETTER_GROVE_REALTIME_MODEL },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.warn(
      "[letter-grove-realtime] token mint failed",
      error instanceof Error ? error.message.slice(0, 180) : "unknown-error",
    );
    return Response.json({ error: "realtime-unavailable" }, { status: 503 });
  }
}
