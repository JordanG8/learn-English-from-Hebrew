/**
 * THE BEATS OF THE LEVEL-UP, in seconds.
 *
 * Its own module because two things need these numbers and only one of them
 * may import three: the scene animates to them, and LevelSelect arms a
 * fallback timer against them so a lost frame can never leave the play button
 * held shut. Copying the total into the React side by hand is exactly how the
 * two drift apart — either the celebration gets cut off or the button stays
 * dead after it ends.
 *
 * It totals a shade under two seconds: long enough to be an event, short
 * enough that a child who has done this forty times is not waiting on it.
 */

export const ADV_CROUCH = 0.26;
export const ADV_FLIGHT = 0.9;
export const ADV_IMPACT = 0.24;
export const ADV_SETTLE = 0.42;

/**
 * The reduced-motion version: no flight, just a still hold long enough for the
 * sound to play and the banner to be read.
 */
export const ADV_STILL = 1.1;

/** What the whole cinematic costs, for a caller that has to hold a lock. */
export const ADVANCE_MS = (ADV_CROUCH + ADV_FLIGHT + ADV_IMPACT + ADV_SETTLE) * 1000;
