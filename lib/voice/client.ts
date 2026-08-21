"use client";

/**
 * THE STUDIO'S SIDE OF THE WIRE.
 *
 * Kept out of the component so the UI file stays about the UI, and so the
 * passcode has exactly one place it is read from and written to.
 *
 * The passcode lives in localStorage, deliberately: the studio is used in
 * short bursts on a phone, and re-typing a passcode per line would be the
 * thing that stops the recording getting finished. It never travels in a URL
 * except on the export download, which cannot carry a header.
 */

import {
  forgetVoiceClip,
  loadVoiceManifest,
  noteVoiceClip,
  type VoiceClip,
} from "./manifest";

const PASSCODE_KEY = "efh:voice-passcode";
const PASSCODE_HEADER = "x-voice-passcode";

export function storedPasscode(): string {
  try {
    return window.localStorage.getItem(PASSCODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storePasscode(value: string): void {
  try {
    if (value) window.localStorage.setItem(PASSCODE_KEY, value);
    else window.localStorage.removeItem(PASSCODE_KEY);
  } catch {
    /* private mode: the passcode simply will not be remembered */
  }
}

function authHeaders(extra: Record<string, string> = {}): HeadersInit {
  const code = storedPasscode();
  return code ? { ...extra, [PASSCODE_HEADER]: code } : extra;
}

export interface StudioStatus {
  backend: "blob" | "fs" | "none";
  writable: boolean;
  passcodeRequired: boolean;
  error: string | null;
}

export async function fetchStudioStatus(): Promise<StudioStatus> {
  try {
    const res = await fetch("/api/voice/manifest", { cache: "no-store" });
    if (!res.ok) throw new Error("bad status");
    const json = (await res.json()) as StudioStatus;
    return json;
  } catch {
    return {
      backend: "none",
      writable: false,
      passcodeRequired: false,
      error: "unreachable",
    };
  }
}

export type SaveResult =
  | { ok: true; clip: VoiceClip }
  | {
      ok: false;
      messageHe: string;
      unauthorised: boolean;
      /** The server's own words, when it had any. Shown verbatim in the UI. */
      detail?: string;
    };

export async function uploadClip(id: string, blob: Blob): Promise<SaveResult> {
  try {
    const res = await fetch(`/api/voice/clip?id=${encodeURIComponent(id)}`, {
      method: "POST",
      headers: authHeaders({ "content-type": blob.type || "audio/webm" }),
      body: blob,
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; clip?: VoiceClip; messageHe?: string; detail?: string }
      | null;
    if (res.ok && json?.ok && json.clip) {
      // Fold it in immediately: the line should read "recorded" before the
      // manifest is refetched, and should be playable from the same URL.
      noteVoiceClip({ ...json.clip, source: "store" });
      return { ok: true, clip: json.clip };
    }
    return {
      ok: false,
      messageHe: json?.messageHe ?? `השמירה נכשלה (${res.status}).`,
      unauthorised: res.status === 401,
      detail: json?.detail,
    };
  } catch {
    return {
      ok: false,
      messageHe: "אין חיבור לרשת. ההקלטה לא נשמרה.",
      unauthorised: false,
    };
  }
}

export async function removeClip(id: string): Promise<SaveResult | { ok: true }> {
  try {
    const res = await fetch(`/api/voice/clip?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; messageHe?: string }
      | null;
    if (res.ok && json?.ok) {
      forgetVoiceClip(id);
      return { ok: true };
    }
    return {
      ok: false,
      messageHe: json?.messageHe ?? "המחיקה נכשלה.",
      unauthorised: res.status === 401,
    };
  } catch {
    return { ok: false, messageHe: "אין חיבור לרשת.", unauthorised: false };
  }
}

export function exportUrl(): string {
  const code = storedPasscode();
  return code
    ? `/api/voice/export?passcode=${encodeURIComponent(code)}`
    : "/api/voice/export";
}

export const refreshManifest = () => loadVoiceManifest(true);
