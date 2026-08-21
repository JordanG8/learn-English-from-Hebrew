/**
 * WHAT IS RECORDED — read by every screen that speaks, and by the studio.
 *
 * Public and unauthenticated on purpose: it lists URLs of clips that are
 * already public assets, and the app itself needs it on first paint. It never
 * reveals whether a passcode is *correct*, only whether one is required, so
 * the studio can show the right prompt.
 *
 * Never cached at the edge: a line recorded ten seconds ago has to be audible
 * on the next lesson screen, which is the whole point of the live store.
 */

import { NextResponse } from "next/server";
import {
  backend,
  blobCredential,
  blobTokenVarNames,
  listClips,
} from "@/lib/voice/store";
import { passcodeRequired } from "@/lib/voice/guard";
import { isKnownVoiceLine } from "@/lib/voice/lines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let clips: Awaited<ReturnType<typeof listClips>> = [];
  let error: string | null = null;
  try {
    clips = await listClips();
  } catch {
    // A misconfigured store must not silence the app; it degrades to TTS.
    error = "store-unreachable";
  }

  const kind = backend();
  // Storage diagnostics, names only and never a secret. Without these, a Blob
  // store that is connected but whose token arrives under a non-default
  // variable name is indistinguishable from no store at all.
  const credential = blobCredential();
  return NextResponse.json(
    {
      storage: {
        tokenVar: credential?.name ?? null,
        tokenVarsSeen: blobTokenVarNames(),
      },
      // Clips for ids this build no longer knows about are kept in storage
      // (deleting someone's recording on a content edit would be rude) but
      // are not served to the player.
      clips: clips.filter((c) => isKnownVoiceLine(c.id)),
      backend: kind,
      writable: kind !== "none",
      passcodeRequired: passcodeRequired(),
      error,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
