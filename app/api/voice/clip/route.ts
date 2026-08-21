/**
 * RECORD / RE-RECORD / DELETE one voice line.
 *
 * POST /api/voice/clip?id=letter-sound-B   body: the audio bytes
 * DELETE /api/voice/clip?id=letter-sound-B
 *
 * Guards, in the order they fire:
 *  1. WRITE ACCESS. See lib/voice/guard.ts — a deployed app needs a passcode.
 *  2. KNOWN ID ONLY. The id must be one this build's catalogue declares, so
 *     storage cannot be used as an open file drop.
 *  3. AUDIO ONLY, AND SMALL. Content type must be audio/*, and the body is
 *     capped well under the platform's request limit. A voice line is one to
 *     three seconds; anything multi-megabyte is a mistake or an attack.
 */

import { NextResponse, type NextRequest } from "next/server";
import { checkWriteAccess, PASSCODE_HEADER } from "@/lib/voice/guard";
import { isKnownVoiceLine } from "@/lib/voice/lines";
import { deleteClip, putClip, validId } from "@/lib/voice/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A three-second Opus clip is ~20KB. 3MB is generous and stays under the
 *  4.5MB platform request cap. (Not exported: a route module may only export
 *  handlers and Next's own config fields.) */
const MAX_CLIP_BYTES = 3 * 1024 * 1024;

function badRequest(messageHe: string, status = 400) {
  return NextResponse.json({ ok: false, messageHe }, { status });
}

function authorise(req: NextRequest) {
  const verdict = checkWriteAccess(req.headers.get(PASSCODE_HEADER));
  return verdict.ok
    ? null
    : NextResponse.json(
        { ok: false, messageHe: verdict.messageHe },
        { status: verdict.status },
      );
}

function requireId(req: NextRequest): string | null {
  const id = req.nextUrl.searchParams.get("id");
  if (!id || !validId(id) || !isKnownVoiceLine(id)) return null;
  return id;
}

export async function POST(req: NextRequest) {
  const denied = authorise(req);
  if (denied) return denied;

  const id = requireId(req);
  if (!id) return badRequest("מזהה השורה לא מוכר.");

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("audio/")) {
    return badRequest("הקובץ הזה הוא לא הקלטה.", 415);
  }

  let data: Buffer;
  try {
    data = Buffer.from(await req.arrayBuffer());
  } catch {
    return badRequest("ההקלטה לא הגיעה שלמה. נסו שוב.");
  }
  if (data.byteLength === 0) return badRequest("ההקלטה ריקה.");
  if (data.byteLength > MAX_CLIP_BYTES) {
    return badRequest("ההקלטה ארוכה מדי. שורה אחת, כמה שניות.", 413);
  }

  try {
    const clip = await putClip(id, data, contentType);
    return NextResponse.json({ ok: true, clip });
  } catch (err) {
    if (err instanceof Error && err.message === "no-store") {
      return NextResponse.json(
        {
          ok: false,
          messageHe:
            "אין איפה לשמור הקלטות. צריך לחבר Vercel Blob לפרויקט (ראו docs/voice.md).",
        },
        { status: 503 },
      );
    }
    // The storage layer's own message, capped. A save that fails needs to say
    // WHY on the phone that failed: "the credential is not allowed to write"
    // and "the upload was cut off" are different problems with different
    // fixes, and collapsing both into "try again" sends someone tapping the
    // same button forever. Blob errors name mechanisms, never secrets.
    const detail =
      err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300);
    console.error("[voice] save failed", { id, contentType, bytes: data.byteLength, detail });
    return NextResponse.json(
      { ok: false, messageHe: "השמירה נכשלה.", detail },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const denied = authorise(req);
  if (denied) return denied;

  const id = requireId(req);
  if (!id) return badRequest("מזהה השורה לא מוכר.");

  try {
    await deleteClip(id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { ok: false, messageHe: "המחיקה נכשלה. נסו שוב." },
      { status: 500 },
    );
  }
}
