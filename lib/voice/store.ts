/**
 * VOICE CLIP STORAGE — server side.
 *
 * The studio has to work from a phone, against the deployed app, with no
 * tooling. That rules out "write into the repo" as the primary path, because
 * a Vercel lambda's filesystem is read-only and gone at the end of the
 * request. So there are two backends, chosen at runtime:
 *
 *  - BLOB: Vercel Blob, used whenever this deployment holds a blob credential
 *    of either kind — see blobCredential, which is where the two mechanisms
 *    are explained. This is the production path: a clip recorded on a phone
 *    is on the CDN before the child hands the phone back. See docs/voice.md.
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
  /** What a browser should fetch. For blob clips this is our own audio route,
   *  because a private store has no publicly fetchable URL. */
  url: string;
  /** The blob pathname, when the blob backend holds this clip. Server-side. */
  pathname?: string;
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

/**
 * HOW THIS DEPLOYMENT IS ALLOWED TO TALK TO BLOB STORAGE.
 *
 * There are two mechanisms, and which one you get depends on how the store
 * was attached — a distinction that cost a full afternoon to find, so it is
 * written down here rather than assumed:
 *
 *  - OIDC (what connecting a store in the dashboard actually does today).
 *    Vercel injects `BLOB_STORE_ID` and NO long-lived secret. The other half,
 *    the OIDC token, is not an environment variable in a deployed function:
 *    it arrives per request and `@vercel/oidc` refreshes it inside the SDK.
 *    So a store id is the only half this process can test for, and there is
 *    nothing to pass. This is the better mechanism — nothing to rotate,
 *    nothing to leak — and it is what a correctly connected store looks like.
 *
 *  - A READ-WRITE TOKEN, created by hand or by an older integration, in
 *    `BLOB_READ_WRITE_TOKEN` or `<PREFIX>_READ_WRITE_TOKEN` — the name varies
 *    with the prefix chosen at connect time, so the token is recognised by
 *    its own shape (`vercel_blob_rw_`) rather than by any one name.
 *
 * Looking only for the second one is what made a properly connected store
 * report "no storage": the token it was waiting for is never issued.
 *
 * Values are never returned to callers that only need to know the mechanism —
 * `mode` and `via` are safe to expose, `token` is not.
 */
export interface BlobCredential {
  mode: "oidc" | "read-write-token";
  /** Which environment variable this was derived from. Never the value. */
  via: string;
  /** Present only for a read-write token; OIDC is resolved inside the SDK. */
  token?: string;
}

export function blobCredential(): BlobCredential | null {
  const exact = process.env.BLOB_READ_WRITE_TOKEN;
  if (exact) {
    return { mode: "read-write-token", via: "BLOB_READ_WRITE_TOKEN", token: exact };
  }
  for (const [name, value] of Object.entries(process.env)) {
    if (!value) continue;
    if (!name.endsWith("READ_WRITE_TOKEN")) continue;
    if (!value.startsWith("vercel_blob_rw_")) continue;
    return { mode: "read-write-token", via: name, token: value };
  }
  // A store id is the whole of what this process can see. The OIDC token
  // itself is NOT a process variable in a serverless function — it arrives per
  // request and is refreshed by @vercel/oidc inside the SDK — so checking
  // `process.env.VERCEL_OIDC_TOKEN` here reports false on a perfectly working
  // deployment. Presence of the store id is the signal; if the exchange then
  // fails, the call fails loudly and the manifest reports it.
  if (process.env.BLOB_STORE_ID) {
    return { mode: "oidc", via: "BLOB_STORE_ID" };
  }
  return null;
}

/**
 * What the environment offers, as names and booleans only. Purely diagnostic:
 * when the store reads as unconfigured this is what separates "nothing is
 * attached" from "something is attached that this code did not recognise".
 */
export function blobEnvSummary(): {
  tokenVars: string[];
  storeId: boolean;
} {
  return {
    tokenVars: Object.keys(process.env).filter((n) =>
      n.endsWith("READ_WRITE_TOKEN"),
    ),
    storeId: Boolean(process.env.BLOB_STORE_ID),
  };
}

export function backend(): Backend {
  if (blobCredential()) return "blob";
  // Only development may write into the repo: in production `public/` is
  // baked into the deployment and any write is silently lost at best.
  if (process.env.NODE_ENV !== "production") return "fs";
  return "none";
}

/**
 * The token to hand the SDK, or undefined to let it resolve OIDC itself.
 * `token: undefined` is not the same as omitting the option only in that the
 * SDK treats a falsy token as "not supplied" and falls through to OIDC — which
 * is exactly what the OIDC mode wants.
 */
function blobToken(): string | undefined {
  return blobCredential()?.token;
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

/**
 * PUBLIC OR PRIVATE, DECIDED BY THE STORE AND NOT BY US.
 *
 * A Blob store is created private or public, and a `put` whose `access` does
 * not match is rejected. That asymmetry is invisible from a read: `list` and
 * `del` work on either kind, so a mismatched `access` shows up ONLY as every
 * upload failing — which is exactly how it presented.
 *
 * Rather than hard-code a guess, the first call tries the likelier mode for a
 * store made today (private) and falls back to the other, then remembers the
 * answer for the life of the instance. Both modes stay supported because the
 * repo should not stop working if the store is ever recreated the other way.
 */
type Access = "private" | "public";
let knownAccess: Access | null = null;

async function withAccess<T>(fn: (access: Access) => Promise<T>): Promise<T> {
  const first: Access = knownAccess ?? "private";
  try {
    const result = await fn(first);
    knownAccess = first;
    return result;
  } catch (err) {
    if (knownAccess) throw err; // already proven; this is a real failure
    const second: Access = first === "private" ? "public" : "private";
    const result = await fn(second);
    knownAccess = second;
    return result;
  }
}

/** The store's access mode, once something has proven it. Diagnostic only. */
export function blobAccessMode(): Access | null {
  return knownAccess;
}

async function blobList(): Promise<StoredClip[]> {
  const { list } = await import("@vercel/blob");
  const out: StoredClip[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({
      prefix: VOICE_PREFIX,
      cursor,
      limit: 1000,
      token: blobToken(),
    });
    for (const b of page.blobs) {
      const id = idFromPath(b.pathname);
      if (!id) continue;
      out.push({
        id,
        // Never the blob's own URL: in a private store it is not fetchable by
        // a browser, and an <audio> element cannot send an Authorization
        // header. Our route streams it instead.
        url: `/api/voice/audio/${id}`,
        pathname: b.pathname,
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
    const page = await list({
      prefix: `${VOICE_PREFIX}${id}.`,
      limit: 100,
      token: blobToken(),
    });
    const keep = keepExt === null ? null : `${VOICE_PREFIX}${id}.${keepExt}`;
    const stale = page.blobs
      .filter((b) => idFromPath(b.pathname) === id && b.pathname !== keep)
      .map((b) => b.url);
    if (stale.length) await del(stale, { token: blobToken() });
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
  const pathname = `${VOICE_PREFIX}${id}.${ext}`;
  // Re-recording must replace, not accumulate: same pathname, no random
  // suffix, and any clip stored under a different extension is dropped after.
  await withAccess((access) =>
    put(pathname, data, {
      access,
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      token: blobToken(),
    }),
  );
  await blobDropExcept(id, ext);
  return {
    id,
    url: `/api/voice/audio/${id}`,
    pathname,
    updatedAt: Date.now(),
    size: data.byteLength,
    source: "store",
  };
}

/** The bytes of one stored blob, for streaming to a browser or zipping. */
export async function readBlobStream(
  pathname: string,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  const { get } = await import("@vercel/blob");
  return withAccess(async (access) => {
    const result = await get(pathname, { access, token: blobToken() });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return {
      stream: result.stream,
      contentType: typeForExt(pathname.split(".").pop() ?? "webm"),
    };
  });
}

/** Find one clip by id without listing the whole store. */
export async function findClip(id: string): Promise<StoredClip | null> {
  if (backend() !== "blob") {
    const all = await listClips();
    return all.find((c) => c.id === id) ?? null;
  }
  const { list } = await import("@vercel/blob");
  const page = await list({
    prefix: `${VOICE_PREFIX}${id}.`,
    limit: 10,
    token: blobToken(),
  });
  const hit = page.blobs.find((b) => idFromPath(b.pathname) === id);
  if (!hit) return null;
  return {
    id,
    url: `/api/voice/audio/${id}`,
    pathname: hit.pathname,
    updatedAt: new Date(hit.uploadedAt).getTime(),
    size: hit.size,
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
    if (!clip.pathname) return null;
    const got = await readBlobStream(clip.pathname);
    if (!got) return null;
    const data = Buffer.from(await new Response(got.stream).arrayBuffer());
    const name = clip.pathname.split("/").pop() ?? `${clip.id}.webm`;
    return { name, data };
  } catch {
    return null;
  }
}
