/**
 * THE VOICE MANIFEST — which lines actually have a human recording, and
 * where the audio for one lives.
 *
 * There are two sources, merged:
 *
 *  1. `/api/voice/manifest` — the live store (Vercel Blob in production, the
 *     local filesystem in `npm run dev`). This is what makes a line recorded
 *     on a phone audible in the app seconds later, with no deploy.
 *  2. `/voice/index.json` — clips committed into `public/voice/`. These ship
 *     with the build, are on the CDN, and work offline. This is where the
 *     generated voice lives (scripts/generate-voice.ts, docs/voice.md).
 *
 * When both have a line, the NEWER one wins. It used to be "the store always
 * wins", which was right while the store was the only source of new audio —
 * and wrong the day the whole voice was regenerated: every old recording
 * still sitting in the store would have played over its replacement, two
 * voices in one lesson. Newest-wins keeps both promises: a fresh generation
 * replaces old recordings, and a line re-recorded in the studio afterwards
 * still replaces the generated one.
 *
 * FAILURE POLICY: every fetch here is allowed to fail. A missing manifest
 * means "nothing is recorded", which degrades to the TTS fallback — never to
 * an error, and never to silence on a line that has a fallback.
 */

export interface VoiceClip {
  id: string;
  url: string;
  /** epoch ms — lets the studio show "recorded 3 minutes ago". */
  updatedAt: number;
  size: number;
  /** Where it came from. "bundled" clips cannot be deleted from the studio. */
  source: "store" | "bundled";
  /** Length in ms, when the generator measured it. */
  durationMs?: number;
  /**
   * [start, end] in ms of each spoken piece, for clips that must be followed
   * along: each sound of a sound-out, or the sound at the end of a letter
   * intro. Written by scripts/generate-voice.ts; a studio recording has none,
   * and the screens then fall back to the separate sound clips.
   */
  marks?: [number, number][];
}

export type VoiceManifest = Record<string, VoiceClip>;

const EMPTY: VoiceManifest = Object.freeze({});

let manifest: VoiceManifest = EMPTY;
let loaded = false;
let inFlight: Promise<VoiceManifest> | null = null;
const listeners = new Set<(m: VoiceManifest) => void>();

function publish(next: VoiceManifest): VoiceManifest {
  manifest = next;
  loaded = true;
  listeners.forEach((fn) => {
    try {
      fn(next);
    } catch {
      /* a bad listener must not break playback */
    }
  });
  return next;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Load (once) and cache. Safe to call from anywhere, including render. */
export function loadVoiceManifest(force = false): Promise<VoiceManifest> {
  if (typeof window === "undefined") return Promise.resolve(EMPTY);
  if (!force && loaded) return Promise.resolve(manifest);
  if (!force && inFlight) return inFlight;

  inFlight = (async () => {
    const [bundled, store] = await Promise.all([
      fetchJson<{ clips: VoiceClip[] }>("/voice/index.json"),
      fetchJson<{ clips: VoiceClip[] }>("/api/voice/manifest"),
    ]);
    const next: VoiceManifest = {};
    for (const c of bundled?.clips ?? []) {
      next[c.id] = { ...c, source: "bundled" };
    }
    for (const c of store?.clips ?? []) {
      const bundled = next[c.id];
      // A tie goes to the bundled clip: in `npm run dev` the "store" IS
      // public/voice, so every clip appears twice — and only the bundled
      // entry carries the generator's time marks.
      if (bundled && bundled.updatedAt >= c.updatedAt) continue;
      next[c.id] = { ...c, source: "store" };
    }
    inFlight = null;
    return publish(next);
  })();

  return inFlight;
}

export function subscribeVoiceManifest(
  fn: (m: VoiceManifest) => void,
): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** False until the first load resolves — see playLine's race handling. */
export function voiceManifestReady(): boolean {
  return loaded;
}

export function voiceManifestSnapshot(): VoiceManifest {
  return manifest;
}

/** Optimistically fold a just-recorded clip in, so the studio feels instant. */
export function noteVoiceClip(clip: VoiceClip): void {
  publish({ ...manifest, [clip.id]: clip });
}

export function forgetVoiceClip(id: string): void {
  if (!manifest[id]) return;
  const next = { ...manifest };
  delete next[id];
  publish(next);
}

/** The playable URL for a line, or null if nobody has recorded it. */
export function voiceUrl(id: string): string | null {
  return manifest[id]?.url ?? null;
}

export function recordedCount(ids: readonly string[]): number {
  return ids.reduce((n, id) => (manifest[id] ? n + 1 : n), 0);
}
