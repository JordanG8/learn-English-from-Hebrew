/**
 * WHERE THE CHILD LAST SAW THEMSELVES STANDING.
 *
 * Finishing a level moves the pencil one pad up the road. That move is the
 * reward for the whole lesson, so it must be *watched*, not discovered: the
 * road screen replays it, with the sound and the lock, exactly once.
 *
 * Which means the app has to remember one number — the pad the child has
 * already seen the pencil standing on. If the pencil is further along than
 * that, there is a level-up owed, and `LevelSelect` pays it before it will let
 * anyone press play.
 *
 * Kept out of `Progress` deliberately, the same way the sound preference is:
 * progress is the child's work, versioned and migrated, while this is a note
 * about what this device has already shown. Losing it costs one extra
 * celebration, which is the safe direction to fail in.
 */

const KEY = "efh:road-stand";

/**
 * The pad the pencil was last *seen* on. An absent or unreadable store means a
 * first visit on this device, and a first visit owes nothing — `fallback` (the
 * pad the child is actually on) is returned so nothing is celebrated on
 * arrival.
 */
export function seenStand(fallback: number): number {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return fallback;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return fallback;
    // A stored value ahead of reality means progress was reset. Trust reality.
    return Math.min(n, fallback);
  } catch {
    return fallback;
  }
}

/** Record that the pencil has now been seen standing on `index`. */
export function markStand(index: number): void {
  try {
    window.localStorage.setItem(KEY, String(Math.max(0, Math.floor(index))));
  } catch {
    /* private mode, full quota: an extra celebration is not a crash */
  }
}
