/**
 * EXPORT EVERY RECORDING AS A ZIP, ready to be committed.
 *
 * The live store (Vercel Blob) is the fast path: record on a phone, hear it
 * in the app immediately. It is not, however, where recordings should *live*
 * forever — a blob store can be deleted, is billed, and is invisible to code
 * review. Once a voice is final it belongs in `public/voice/` in the repo,
 * on the CDN, versioned with everything else.
 *
 * This route is the bridge. The zip unpacks to:
 *
 *     voice/<line-id>.<ext>   one file per recorded line
 *     voice/index.json        the manifest the player reads for bundled clips
 *
 * so the whole workflow is: download, unzip into `public/`, commit.
 *
 * Access is the same as writing: a recording is the author's, not the
 * public's, so the export sits behind the studio passcode.
 */

import { NextResponse, type NextRequest } from "next/server";
import { checkWriteAccess, PASSCODE_HEADER } from "@/lib/voice/guard";
import { isKnownVoiceLine } from "@/lib/voice/lines";
import { listClips, readClip } from "@/lib/voice/store";
import { zipStore } from "@/lib/voice/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Reading every clip back out of blob storage is not a 10-second job. */
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // A download is triggered by navigation, which cannot carry a header, so
  // the passcode may also arrive as a query parameter here.
  const supplied =
    req.headers.get(PASSCODE_HEADER) ?? req.nextUrl.searchParams.get("passcode");
  const verdict = checkWriteAccess(supplied);
  if (!verdict.ok) {
    return NextResponse.json(
      { ok: false, messageHe: verdict.messageHe },
      { status: verdict.status },
    );
  }

  const clips = (await listClips()).filter((c) => isKnownVoiceLine(c.id));
  const files: { name: string; data: Buffer }[] = [];
  const index: { id: string; url: string; updatedAt: number; size: number }[] = [];

  for (const clip of clips) {
    const file = await readClip(clip);
    if (!file) continue; // a clip that vanished mid-export is skipped, not fatal
    files.push({ name: `voice/${file.name}`, data: file.data });
    index.push({
      id: clip.id,
      url: `/voice/${file.name}`,
      updatedAt: clip.updatedAt,
      size: file.data.length,
    });
  }

  files.push({
    name: "voice/index.json",
    data: Buffer.from(
      `${JSON.stringify({ generatedAt: Date.now(), clips: index }, null, 2)}\n`,
      "utf8",
    ),
  });

  const zip = zipStore(files);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="voice-${stamp}.zip"`,
      "cache-control": "no-store",
    },
  });
}
