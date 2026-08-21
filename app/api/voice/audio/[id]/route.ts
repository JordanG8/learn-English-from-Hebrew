/**
 * SERVE ONE RECORDED LINE.
 *
 * Why this exists rather than pointing an `<audio>` element straight at the
 * blob: a Vercel Blob store can be private, and a private blob is not
 * fetchable by URL — it needs an Authorization header, which no `<audio>`
 * element or `new Audio(url)` can send. So the bytes come through here, where
 * the credential lives, and the browser sees an ordinary audio URL.
 *
 * It is public and unauthenticated, deliberately: these clips are the voice
 * the app speaks in, played by every child on every lesson screen. The
 * passcode protects *writing* the voice, not hearing it.
 *
 * Cached at the edge for a minute: long enough that a lesson does not re-fetch
 * the same letter on every step, short enough that re-recording a line is
 * audible almost immediately — which is the whole promise of the studio.
 */

import { NextResponse, type NextRequest } from "next/server";
import { isKnownVoiceLine } from "@/lib/voice/lines";
import { findClip, readBlobStream, validId } from "@/lib/voice/store";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!validId(id) || !isKnownVoiceLine(id)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  try {
    const clip = await findClip(id);
    if (!clip?.pathname) {
      // Not recorded (or held by the filesystem backend, which serves its own
      // static URL). Either way there is nothing for this route to stream.
      return NextResponse.json({ ok: false }, { status: 404 });
    }

    const got = await readBlobStream(clip.pathname);
    if (!got) return NextResponse.json({ ok: false }, { status: 404 });

    return new NextResponse(got.stream as unknown as BodyInit, {
      headers: {
        "content-type": got.contentType,
        "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch {
    // A clip that cannot be fetched must degrade to "not recorded", which the
    // player already handles by falling back to TTS — never to a broken
    // lesson screen.
    return NextResponse.json({ ok: false }, { status: 404 });
  }
}
