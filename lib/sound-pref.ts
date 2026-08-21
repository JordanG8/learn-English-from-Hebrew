"use client";

/**
 * SOUND ON/OFF — the one setting on the title screen.
 *
 * lib/audio already knows how to be quiet (`setMuted`); it just had no way to
 * remember. This is that memory, plus a hook so the toggle button can render
 * the right icon.
 *
 * Kept out of Progress on purpose: progress is the child's work and gets
 * migrated and versioned, while this is a property of the device someone is
 * sitting at — a tablet in a quiet classroom should stay muted no matter whose
 * turn it is.
 */

import { useCallback, useEffect, useState } from "react";
import { isMuted, setMuted } from "./audio";

const KEY = "efh:sound";

/** Read the stored preference. Absent or unreadable storage means sound on. */
export function soundEnabled(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

/** Push the stored preference into the audio layer. Safe to call repeatedly. */
export function applyStoredSound(): void {
  setMuted(!soundEnabled());
}

export function useSound(): { on: boolean; toggle: () => void } {
  // Starts `true` so the server and the first client render agree; the effect
  // corrects it immediately. Same hydration rule the keyboard follows.
  const [on, setOn] = useState(true);

  useEffect(() => {
    const stored = soundEnabled();
    setMuted(!stored);
    setOn(stored);
  }, []);

  const toggle = useCallback(() => {
    const next = isMuted();
    setMuted(!next);
    setOn(next);
    try {
      window.localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      /* private mode: the toggle still works for this session */
    }
  }, []);

  return { on, toggle };
}
