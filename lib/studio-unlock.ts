"use client";

/**
 * TESTER MODE — the device that records the voice may play anything.
 *
 * The track is gated: a level opens only when its prerequisites are done, and
 * conversation waits on mastery evidence. That is right for a child and wrong
 * for whoever is building the thing, who needs to open the level they wrote
 * ten minutes ago without first completing the twenty before it.
 *
 * The signal we already have for "this device belongs to an author" is the
 * studio passcode: /studio asks for it once and remembers it here. So a
 * device that has one gets every level and conversation mode unlocked.
 *
 * What this is NOT: a security boundary. Nothing here is checked against the
 * server, and it does not need to be — the passcode still guards every write
 * (see lib/voice/guard.ts), and the only thing this flag grants is early
 * access to lesson content that ships in the client bundle anyway. Clearing
 * the passcode in the studio ("שכח סיסמה") turns it straight back off.
 *
 * Progress itself is untouched: nothing is marked complete, no stars are
 * awarded, the pencil stands where the child's real work put it. Only the
 * locks are lifted.
 */

import { useEffect, useState } from "react";

/** The one place the studio passcode's storage key is written down. */
export const PASSCODE_KEY = "efh:voice-passcode";

/** True when this device has a studio passcode saved. Client-only; false on
 *  the server and in a browser that refuses storage. */
export function studioUnlockActive(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return Boolean(window.localStorage.getItem(PASSCODE_KEY));
  } catch {
    return false;
  }
}

/**
 * The hook the gated screens use. It returns false on the first render —
 * always, even on an author's device — because the server rendered it that
 * way and a hydration mismatch here would blank the road. The unlock lands on
 * the effect that follows, one frame later.
 */
export function useStudioUnlock(): boolean {
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    setUnlocked(studioUnlockActive());
  }, []);
  return unlocked;
}
