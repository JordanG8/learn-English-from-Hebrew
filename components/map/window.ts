/**
 * Pure level-window math for the Three.js scene.
 *
 * Kept outside `scene.ts` so the rapid-navigation regression can be exercised
 * without constructing WebGL. A transition may have several anchors: the
 * destination plus the last few places the camera has not visually left yet.
 */

export const PAD_WINDOW_BACK = 4;
export const PAD_WINDOW_FORWARD = 9;

export function padWindowIndices(
  total: number,
  anchors: readonly number[],
  back = PAD_WINDOW_BACK,
  forward = PAD_WINDOW_FORWARD,
): number[] {
  const desired = new Set<number>();
  for (const raw of anchors) {
    if (!Number.isFinite(raw) || total <= 0) continue;
    const anchor = Math.max(0, Math.min(total - 1, Math.round(raw)));
    const from = Math.max(0, anchor - back);
    const to = Math.min(total, anchor + forward);
    for (let index = from; index < to; index++) desired.add(index);
  }
  return [...desired].sort((a, b) => a - b);
}
