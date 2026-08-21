/**
 * RECORDED VOICE — the playback half of the recording studio.
 *
 * A clip can live in two places, and they are deliberately different things:
 *
 *   1. IndexedDB, on this device. This is where /record writes. It means the
 *      person recording hears their own voice in the real app one second
 *      after recording it, with no build, no deploy, no file copying.
 *   2. /public/audio/<id>.<ext>, shipped with the app and listed in
 *      /audio/manifest.json. This is what everyone else hears, once the
 *      exported pack is committed.
 *
 * Local wins over shipped, so a re-recording always beats the old take.
 * Neither existing is not an error — lib/audio.ts falls back to TTS, and the
 * Hebrew text on screen is the channel that never fails (design rule 3).
 *
 * Everything here is fail-silent and never blocks a render. `hasClip` is
 * synchronous on purpose: `say()` is called from click handlers and effects
 * that cannot await, so availability is answered from a Set warmed by
 * `initVoice()` and playback is fired off without being waited on.
 */

const DB_NAME = "efh-voice";
const DB_VERSION = 1;
const STORE = "clips";
const MANIFEST_URL = "/audio/manifest.json";

export interface StoredClip {
  id: string;
  blob: Blob;
  mime: string;
  /** Seconds, best-effort — the recorder measures wall clock. */
  seconds: number;
  updatedAt: number;
}

export interface AudioManifest {
  version: 1;
  /** clip id → filename inside /public/audio */
  clips: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/* IndexedDB                                                           */
/* ------------------------------------------------------------------ */

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: "id" });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const t = db.transaction(STORE, mode);
          const req = run(t.objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

/* ------------------------------------------------------------------ */
/* The availability index                                              */
/* ------------------------------------------------------------------ */

const local = new Set<string>();
const shipped = new Map<string, string>(); // id → url
const urlCache = new Map<string, string>(); // id → object URL for a local blob
let ready = false;
let initPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a broken listener must not break playback */
    }
  });
}

/** Subscribe to "the set of available clips changed". Returns an unsubscribe. */
export function onVoiceChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Warm the index. Safe to call from anywhere, any number of times. */
export function initVoice(): Promise<void> {
  if (initPromise) return initPromise;
  if (typeof window === "undefined") return Promise.resolve();

  const loadLocal = tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys()).then(
    (keys) => {
      local.clear();
      (keys ?? []).forEach((k) => local.add(String(k)));
    },
  );

  const loadShipped = fetch(MANIFEST_URL, { cache: "no-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<AudioManifest>) : null))
    .then((m) => {
      shipped.clear();
      if (!m?.clips) return;
      for (const [id, file] of Object.entries(m.clips)) {
        shipped.set(id, `/audio/${file}`);
      }
    })
    .catch(() => {
      /* no pack shipped yet — TTS carries the app */
    });

  initPromise = Promise.all([loadLocal, loadShipped]).then(() => {
    ready = true;
    notify();
  });
  return initPromise;
}

export function voiceReady(): boolean {
  return ready;
}

/** True if a recording exists for this cue — locally or in the shipped pack. */
export function hasClip(id: string): boolean {
  return local.has(id) || shipped.has(id);
}

export function clipSource(id: string): "local" | "shipped" | null {
  if (local.has(id)) return "local";
  if (shipped.has(id)) return "shipped";
  return null;
}

export function recordedCount(ids: readonly string[]): number {
  return ids.reduce((n, id) => (hasClip(id) ? n + 1 : n), 0);
}

/* ------------------------------------------------------------------ */
/* Reading + writing clips                                             */
/* ------------------------------------------------------------------ */

export function getClip(id: string): Promise<StoredClip | null> {
  return tx<StoredClip>("readonly", (s) => s.get(id)).then((v) => v ?? null);
}

export function allClips(): Promise<StoredClip[]> {
  return tx<StoredClip[]>("readonly", (s) => s.getAll()).then((v) => v ?? []);
}

export async function saveClip(
  id: string,
  blob: Blob,
  seconds: number,
): Promise<boolean> {
  const rec: StoredClip = {
    id,
    blob,
    mime: blob.type || "audio/webm",
    seconds,
    updatedAt: Date.now(),
  };
  const ok = await tx("readwrite", (s) => s.put(rec));
  if (ok === null) return false;
  local.add(id);
  revoke(id);
  notify();
  return true;
}

export async function deleteClip(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
  local.delete(id);
  revoke(id);
  notify();
}

function revoke(id: string): void {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}

/** A playable URL for a clip, or null. Local blob wins over the shipped file. */
export async function clipUrl(id: string): Promise<string | null> {
  if (local.has(id)) {
    const cached = urlCache.get(id);
    if (cached) return cached;
    const rec = await getClip(id);
    if (rec?.blob) {
      const url = URL.createObjectURL(rec.blob);
      urlCache.set(id, url);
      return url;
    }
    // The index said local but the row is gone — fall through to shipped.
    local.delete(id);
  }
  return shipped.get(id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Playback                                                            */
/* ------------------------------------------------------------------ */

let current: HTMLAudioElement | null = null;

/** Stop whatever recorded clip is playing. */
export function stopClip(): void {
  if (!current) return;
  try {
    current.pause();
    current.currentTime = 0;
  } catch {
    /* ignore */
  }
  current = null;
}

/**
 * Play a recorded clip. Returns true if one exists and playback was started —
 * the caller uses that to decide whether TTS is still needed. Playback itself
 * is async and fail-silent: a blocked autoplay is not an error worth showing
 * a child.
 */
export function playClip(id: string, onEnd?: () => void): boolean {
  if (!hasClip(id)) return false;
  void (async () => {
    const url = await clipUrl(id);
    if (!url) return;
    try {
      stopClip();
      const el = new Audio(url);
      current = el;
      el.addEventListener("ended", () => {
        if (current === el) current = null;
        onEnd?.();
      });
      await el.play();
    } catch {
      onEnd?.();
    }
  })();
  return true;
}

/** Play a clip and resolve when it finishes (or immediately if absent). */
export function playClipAsync(id: string): Promise<void> {
  return new Promise((resolve) => {
    if (!playClip(id, resolve)) resolve();
  });
}
