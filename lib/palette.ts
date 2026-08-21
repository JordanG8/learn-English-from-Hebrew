/**
 * IDENTITY COLOUR — which of the eight hues a thing wears.
 *
 * Design-system rule 8: hue is IDENTITY, never STATE. A lesson keeps the same
 * colour for the life of the app, so a child navigating the track sees the
 * screens change colour as they move — but is never asked to decode a colour,
 * because nothing about right/wrong/locked/done is carried here.
 *
 * The assignment is a hash of the lesson id rather than its position, so:
 *   · inserting a lesson does not re-colour every lesson after it, and
 *   · the same lesson is the same colour on the map and inside the player.
 *
 * Consumers spread `tintStyle(id)` onto an element and use the `.efh-tint`,
 * `.efh-tint-ink` and `.efh-badge` classes from globals.css. Never read the
 * hue names directly to build a class string — the pairing of surface and ink
 * is the whole safety property (rule 9).
 */

import type { CSSProperties } from "react";

/**
 * The six identity hues, in the order they appear in globals.css.
 *
 * There is no green, gold or red in here, and that is the point: those hues
 * belong to go / star / stop, and a lesson wearing one would read as a
 * verdict on the child rather than as its own name. Every hue here is at
 * least 25° from the nearest semantic hue.
 */
export const IDENTITY_HUES = [
  "teal",
  "aqua",
  "sky",
  "violet",
  "orchid",
  "rose",
] as const;

export type IdentityHue = (typeof IDENTITY_HUES)[number];

/**
 * Stable, order-independent hue for an id. FNV-1a: tiny, and it scatters
 * similar ids ("letter-A", "letter-B") into different hues instead of walking
 * them through the palette in lockstep, which is what makes a column of
 * lesson rows look varied rather than striped.
 */
export function hueFor(id: string): IdentityHue {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return IDENTITY_HUES[(h >>> 0) % IDENTITY_HUES.length];
}

/**
 * The inline style carrying one identity hue: a surface and the ink that is
 * allowed on it. Always both — a surface without its ink is how colour stops
 * being readable.
 */
export function tintStyle(id: string): CSSProperties {
  const hue = hueFor(id);
  return {
    "--tint": `var(--color-${hue}-soft)`,
    "--tint-ink": `var(--color-${hue}-ink)`,
  } as CSSProperties;
}
