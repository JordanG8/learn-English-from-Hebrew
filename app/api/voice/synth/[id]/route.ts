/**
 * SERVE ONE SYNTHESISED LINE — the middle tier of the app's voice.
 *
 * The player asks for this URL only when a line has NO human recording (see
 * lib/audio.ts). So every response here is answering "nobody has recorded
 * this; can you say it anyway?", and there are exactly two honest answers:
 * mp3 bytes, or a 404 that sends the player back to the browser's voice.
 *
 * A 404 from this route is therefore not an error. It is the state the app
 * shipped in.
 *
 * THE ORDER OF WORK, and why it is that order:
 *
 *  1. Cache read. A generated line is generated once per DIRECTION_VERSION,
 *     for everyone, forever — this is the path virtually every request takes.
 *  2. In-flight join. A lesson screen can ask for the same line twice in a
 *     second (mount, then a replay tap), and thirty children can open the same
 *     lesson at once. Generating that line thirty times would be thirty times
 *     the latency and thirty times the spend for identical bytes.
 *  3. Generate, then cache, then answer.
 *
 * Public and unauthenticated, exactly like /api/voice/audio/[id]: this is the
 * voice the app speaks in, and the passcode protects writing the voice, not
 * hearing it. The catalogue is closed and the id is checked against it, so
 * "text I choose, spoken by your gateway credit" is not reachable from here —
 * the only strings this route can ever synthesise are the ~180 lines of the
 * app's own curriculum.
 */

import { NextResponse, type NextRequest } from "next/server";
import { isKnownVoiceLine } from "@/lib/voice/lines";
import { readSynth, validId, writeSynth } from "@/lib/voice/store";
import { synthesizeLine } from "@/lib/voice/synth";

export const runtime = "nodejs";

/**
 * One generation per line per instance, shared by everyone waiting on it.
 * Keyed by id; the entry is dropped the moment it settles, so this never
 * becomes a second cache with its own staleness.
 */
const inFlight = new Map<string, Promise<Buffer | null>>();

function generate(id: string): Promise<Buffer | null> {
  const existing = inFlight.get(id);
  if (existing) return existing;

  const work = (async () => {
    const result = await synthesizeLine(id);
    if (!result.ok) {
      // Logged, not returned: the reason matters to whoever set the project
      // up, and means nothing to a child. `detail` names mechanisms and HTTP
      // statuses only — see synth.ts.
      console.warn(`[voice-synth] ${id}: ${result.reason} ${result.detail ?? ""}`);
      return null;
    }
    await writeSynth(id, result.audio);
    return result.audio;
  })().finally(() => inFlight.delete(id));

  inFlight.set(id, work);
  return work;
}

const MISS = () => NextResponse.json({ ok: false }, { status: 404 });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!validId(id) || !isKnownVoiceLine(id)) return MISS();

  try {
    const cached = await readSynth(id);
    const audio = cached ?? (await generate(id));
    if (!audio) return MISS();

    return new NextResponse(new Uint8Array(audio), {
      headers: {
        "content-type": "audio/mpeg",
        "content-length": String(audio.byteLength),
        // A year at the edge, because the bytes for this path cannot change:
        // re-directing the voice bumps DIRECTION_VERSION, which is a
        // different cache path and a different URL is not needed for it — the
        // route reads the new path on the next deploy. `immutable` is what
        // keeps a lesson from re-fetching the same letter on every step.
        "cache-control": "public, max-age=86400, s-maxage=31536000, immutable",
        // So the studio (and a curious human) can tell a cache hit from a
        // fresh generation without reading the logs.
        "x-voice-synth": cached ? "hit" : "generated",
      },
    });
  } catch {
    return MISS();
  }
}
