/**
 * VOICE CLIP STORAGE — server side.
 *
 * The studio has to work from a phone, against the deployed app, with no
 * tooling. That rules out "write into the repo" as the primary path, because
 * a Vercel lambda's filesystem is read-only and gone at the end of the
 * request. So there are two backends, chosen at runtime:
 *
 *  - BLOB: Vercel Blob, used whenever BLOB_READ_WRITE_TOKEN is present. This
 *    is the production path: a clip recorded on a phone is on the CDN before
 *    the child hands the phone back. Setup is one click; see docs/voice.md.
 *  - FS: `public/voice/`, used in local development. Same API, and clips land
 *    exactly where they would be committed, so `npm run dev` doubles as the
 *    "record straight into the repo" workflow.
 *
 * If neither is available the routes say so in Hebrew rather than throwing —
 * an unconfigured store is a setup state, not a crash.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { VOICE_ID_RE } from "./lines";

export interface StoredClip {
  id: string;
  url: string;
  updatedAt: number;
  size: number;
  source: "store";
}

export type Backend = "blob" | "fs" | "none";

/** Audio types a browser MediaRecorder actually produces, mapped to a suffix. */
const EXT_BY_TYPE: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

const TYPE_BY_EXT: Record<string, string> = {
  webm: "audio/webm",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

export const VOICE_PREFIX = "voice/";
const FS_DIR = path.join(process.cwd(), "public", "voice");

/** Strip codec parameters: "audio/webm;codecs=opus" -> "audio/webm". */
export function extForType(contentType: string): string {
  const base = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return EXT_BY_TYPE[base] ?? "webm";
}

export function typeForExt(ext: string): string {
  return TYPE_BY_EXT[ext.toLowerCase()] ?? "application/octet-stream";
}

export function validId(id: string): boolean {
  return VOICE_ID_RE.test(id);
}

export function backend(): Backend {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  // Only development may write into the repo: in production `public/` is
  // baked into the deployment and any write is silently lost at best.
  if (process.env.NODE_ENV !== "production") return "fs";
  return "none";
}

/** "voice/word-CAT.webm" -> "word-CAT". Null for anything unexpected. */
function idFromPath(pathname: string): string | null {
  const file = pathname.startsWith(VOICE_PREFIX)
    ? pathname.slice(VOICE_PREFIX.length)
    : pathname;
  const dot = file.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = file.slice(0, dot);
  return validId(id) ? id : null;
}

/* ------------------------------------------------------------------ */
/* Blob backend                                                         */
/* ------------------------------------------------------------------ */

async function blobList(): Promise<StoredClip[]> {
  const { list } = await import("@vercel/blob");
  const out: StoredClip[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: VOICE_PREFIX, cursor, limit: 1000 });
    for (const b of page.blobs) {
      const id = idFromPath(b.pathname);
      if (!id) continue;
      out.push({
        id,
        url: b.url,
        updatedAt: new Date(b.uploadedAt).getTime(),
        size: b.size,
        source: "store",
      });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

/** A device that switches from webm to m4a must not leave two clips per id. */
async function blobDropExcept(id: string, keepExt: string | null): Promise<void> {
  try {
    const { list, del } = await import("@vercel/blob");
    const page = await list({ prefix: `${VOICE_PREFIX}${id}.`, limit: 100 });
    const keep = keepExt === null ? null : `${VOICE_PREFIX}${id}.${keepExt}`;
    const stale = page.blobs
      .filter((b) => idFromPath(b.pathname) === id && b.pathname !== keep)
      .map((b) => b.url);
    if (stale.length) await del(stale);
  } catch {
    if (keepExt === null) throw new Error("delete-failed");
    /* a leftover clip is cosmetic; never fail a recording over it */
  }
}

async function blobPut(
  id: string,
  data: Buffer,
  contentType: string,
): Promise<StoredClip> {
  const { put } = await import("@vercel/blob");
  const ext = extForType(contentType);
  // Re-recording must replace, not accumulate: same pathname, no random
  // suffix, and any clip stored under a different extension is dropped after.
  const res = await put(`${VOICE_PREFIX}${id}.${ext}`, data, {
    access: "public",
    contentType,
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
  await blobDropExcept(id, ext);
  return {
    id,
    url: res.url,
    updatedAt: Date.now(),
    size: data.byteLength,
    source: "store",
  };
}

/* ------------------------------------------------------------------ */
/* Filesystem backend (development)                                     */
/* ------------------------------------------------------------------ */

async function fsList(): Promise<StoredClip[]> {
  let names: string[];
  try {
    names = await fs.readdir(FS_DIR);
  } catch {
    return [];
  }
  const out: StoredClip[] = [];
  for (const name of names) {
    const id = idFromPath(name);
    if (!id) continue;
    try {
      const stat = await fs.stat(path.join(FS_DIR, name));
      out.push({
        id,
        url: `/voice/${name}`,
        updatedAt: stat.mtimeMs,
        size: stat.size,
        source: "store",
      });
    } catch {
      /* skip a file that vanished mid-listing */
    }
  }
  return out;
}

async function fsDropExcept(id: string, keepExt: string | null): Promise<void> {
  let names: string[] = [];
  try {
    names = await fs.readdir(FS_DIR);
  } catch {
    return;
  }
  const keep = keepExt === null ? null : `${id}.${keepExt}`;
  await Promise.all(
    names
      .filter((n) => idFromPath(n) === id && n !== keep)
      .map((n) => fs.rm(path.join(FS_DIR, n)).catch(() => undefined)),
  );
}

async function fsPut(
  id: string,
  data: Buffer,
  contentType: string,
): Promise<StoredClip> {
  const ext = extForType(contentType);
  await fs.mkdir(FS_DIR, { recursive: true });
  await fsDropExcept(id, ext);
  const name = `${id}.${ext}`;
  await fs.writeFile(path.join(FS_DIR, name), data);
  return {
    id,
    url: `/voice/${name}`,
    updatedAt: Date.now(),
    size: data.byteLength,
    source: "store",
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

export async function listClips(): Promise<StoredClip[]> {
  switch (backend()) {
    case "blob":
      return blobList();
    case "fs":
      return fsList();
    default:
      return [];
  }
}

export async function putClip(
  id: string,
  data: Buffer,
  contentType: string,
): Promise<StoredClip> {
  switch (backend()) {
    case "blob":
      return blobPut(id, data, contentType);
    case "fs":
      return fsPut(id, data, contentType);
    default:
      throw new Error("no-store");
  }
}

export async function deleteClip(id: string): Promise<void> {
  switch (backend()) {
    case "blob":
      return blobDropExcept(id, null);
    case "fs":
      return fsDropExcept(id, null);
    default:
      throw new Error("no-store");
  }
}

/** Read one clip's bytes back - used by the export route. */
export async function readClip(
  clip: StoredClip,
): Promise<{ name: string; data: Buffer } | null> {
  try {
    if (clip.url.startsWith("/voice/")) {
      const name = clip.url.slice("/voice/".length);
      const data = await fs.readFile(path.join(FS_DIR, name));
      return { name, data };
    }
    const res = await fetch(clip.url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = Buffer.from(await res.arrayBuffer());
    const name = new URL(clip.url).pathname.split("/").pop() ?? `${clip.id}.webm`;
    return { name, data };
  } catch {
    return null;
  }
}
