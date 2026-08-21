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
  blobAccessMode,
  blobCredential,
  blobEnvSummary,
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
  } catch (err) {
    // A misconfigured store must not silence the app; it degrades to TTS. The
    // message is kept because "the credential does not work" and "there is no
    // credential" need different fixes, and the SDK says which it is. Blob
    // errors name mechanisms, not secrets.
    error =
      err instanceof Error ? err.message.slice(0, 300) : "store-unreachable";
  }

  const kind = backend();
  // Storage diagnostics, names only and never a secret. Without these, a Blob
  // store that is connected but whose token arrives under a non-default
  // variable name is indistinguishable from no store at all.
  const credential = blobCredential();
  return NextResponse.json(
    {
      storage: {
        mode: credential?.mode ?? null,
        via: credential?.via ?? null,
        access: blobAccessMode(),
        env: blobEnvSummary(),
      },
      // Clips for ids this build no longer knows about are kept in storage
      // (deleting someone's recording on a content edit would be rude) but
      // are not served to the player.
      // `pathname` is server-side bookkeeping; the client gets the URL only.
      clips: clips
        .filter((c) => isKnownVoiceLine(c.id))
        .map(({ pathname: _pathname, ...clip }) => clip),
      backend: kind,
      writable: kind !== "none",
      passcodeRequired: passcodeRequired(),
      error,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
