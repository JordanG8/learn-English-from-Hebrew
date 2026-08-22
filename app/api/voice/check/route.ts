/**
 * DID THEY SAY IT? — POST /api/voice/check?word=CAT, body: the audio bytes.
 *
 * The child's take goes up, a transcription model turns it into text, and the
 * response says which of three things happened. The audio is held for the
 * length of this request and nothing else: not stored, not logged, not
 * attached to anything that identifies a child. See lib/voice/listen.ts for
 * why that is a design constraint rather than an omission.
 *
 * Guards, in the order they fire:
 *  1. WORD FROM THE CURRICULUM ONLY. `word` must be in lib/curriculum/words.ts
 *     (or be a letter's example word). This is the same rule the clip route
 *     uses on ids, and it is what stops the endpoint being a free
 *     transcription service pointed at someone else's audio: the caller cannot
 *     choose what is compared, only which of ~60 known words.
 *  2. AUDIO ONLY, AND SMALL. audio/* and under the cap in listen.ts.
 *  3. A RATE LIMIT PER INSTANCE. Practising is a child tapping a button every
 *     few seconds; a hundred requests a minute from one place is not that.
 *     In-memory and per-instance, which is the honest limit of a project with
 *     no database — enough to bound accidental spend, not a security control.
 *
 * No passcode. Unlike the studio, this writes nothing and changes nothing;
 * requiring one would mean asking a seven-year-old for a password.
 */

import { NextResponse, type NextRequest } from "next/server";
import { MAX_AUDIO_BYTES, listenEnabled, transcribeTake } from "@/lib/voice/listen";
import { judge } from "@/lib/voice/pronounce";
import { isPracticeWord } from "@/lib/curriculum/words";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/* Rate limit — a bucket per IP, in memory, deliberately crude          */
/* ------------------------------------------------------------------ */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();

function overLimit(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    // The map is bounded by clearing it whole when it grows past anything a
    // real classroom could produce. A crude sweep beats a leak, and beats a
    // timer in a serverless function that may not live long enough to fire.
    if (buckets.size > 5_000) buckets.clear();
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_PER_WINDOW;
}

/* ------------------------------------------------------------------ */

interface CheckOk {
  ok: true;
  verdict: "match" | "near" | "different";
  /** What the model heard. Shown to the child — seeing it is the lesson. */
  heard: string;
  word: string;
}
interface CheckDegraded {
  ok: false;
  reason: "off" | "bad-request" | "too-large" | "rate-limited" | "upstream";
  messageHe: string;
}

const fail = (
  reason: CheckDegraded["reason"],
  messageHe: string,
  status: number,
) => NextResponse.json<CheckDegraded>({ ok: false, reason, messageHe }, { status });

export async function POST(req: NextRequest) {
  if (!listenEnabled()) {
    return fail("off", "בדיקת ההגייה כבויה בשרת הזה.", 503);
  }

  const word = req.nextUrl.searchParams.get("word")?.toUpperCase() ?? "";
  if (!isPracticeWord(word)) {
    return fail("bad-request", "המילה הזאת לא מהתרגול.", 400);
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("audio/")) {
    return fail("bad-request", "זאת לא הקלטה.", 415);
  }

  // Behind Vercel this is the client address; locally it is absent and every
  // caller shares one bucket, which is correct for a single developer.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (overLimit(ip)) {
    return fail("rate-limited", "רגע אחד — נסו שוב עוד דקה.", 429);
  }

  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.byteLength === 0) {
    return fail("bad-request", "ההקלטה ריקה.", 400);
  }
  if (buf.byteLength > MAX_AUDIO_BYTES) {
    return fail("too-large", "ההקלטה ארוכה מדי.", 413);
  }

  const heard = await transcribeTake(buf, contentType);
  if (!heard.ok) {
    // The reason is for whoever set the project up. A child gets one sentence
    // that tells them the app is at fault and they are not.
    console.warn(`[voice-check] ${heard.reason} ${heard.detail ?? ""}`);
    return fail("upstream", "לא הצלחנו להאזין כרגע. נסו שוב.", 502);
  }

  const verdict = judge(word, heard.text);
  return NextResponse.json<CheckOk>(
    { ok: true, verdict: verdict.verdict, heard: verdict.heard, word },
    { headers: { "cache-control": "no-store" } },
  );
}
