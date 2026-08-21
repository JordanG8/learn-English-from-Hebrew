/**
 * THE VOICE MANIFEST — which lines actually have a human recording, and
 * where the audio for one lives.
 *
 * There are two sources, merged, in this order of precedence:
 *
 *  1. `/api/voice/manifest` — the live store (Vercel Blob in production, the
 *     local filesystem in `npm run dev`). This is what makes a line recorded
 *     on a phone audible in the app seconds later, with no deploy.
 *  2. `/voice/index.json` — clips committed into `public/voice/`. These ship
 *     with the build, are on the CDN, and work offline. This is where
 *     recordings should end up once they are final (see docs/voice.md).
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
