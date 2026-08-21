/**
 * WHO MAY CHANGE THE APP'S VOICE.
 *
 * The studio writes to public storage, and the production URL is public, so
 * without a gate any visitor could replace the voice a child hears. That is
 * the one part of this feature with a real abuse story, so:
 *
 *  - Set `VOICE_STUDIO_PASSCODE` and every write (record, delete, export)
 *    requires it. The studio asks once and remembers it on the device.
 *  - Leave it unset and writes are allowed only in development. A deployed
 *    app with no passcode refuses writes and the studio explains what to set.
 *
 * The passcode is compared with a length-independent scan rather than `===`
 * so a timing side channel cannot leak it a character at a time. It is never
 * returned to the client, only ever checked.
 */

export const PASSCODE_HEADER = "x-voice-passcode";

export type WriteVerdict =
  | { ok: true }
  | { ok: false; status: 401 | 503; messageHe: string };

function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** True when a passcode is configured, i.e. the studio must ask for one. */
export function passcodeRequired(): boolean {
  return Boolean(process.env.VOICE_STUDIO_PASSCODE);
}

export function checkWriteAccess(supplied: string | null): WriteVerdict {
  const expected = process.env.VOICE_STUDIO_PASSCODE;
  if (expected) {
    return supplied && constantTimeEqual(supplied, expected)
      ? { ok: true }
      : {
          ok: false,
          status: 401,
          messageHe: "הסיסמה לא נכונה. נסו שוב.",
        };
  }
  if (process.env.NODE_ENV !== "production") return { ok: true };
  return {
    ok: false,
    status: 503,
    messageHe:
      "האולפן נעול. כדי להקליט מהאתר החי צריך להגדיר משתנה סביבה בשם VOICE_STUDIO_PASSCODE (ראו docs/voice.md).",
  };
}
