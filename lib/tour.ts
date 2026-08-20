/**
 * TOUR TARGET CONTRACT — the seam between the walkthrough content (which
 * lives in the curriculum, as TutorialStep.target) and the screens that
 * render the real UI elements being pointed at.
 *
 * A tutorial step spotlights a REAL element and requires a REAL tap on it.
 * That only works if the content author and the screen author agree on a
 * selector. They agree here, and nowhere else.
 *
 * Screen authors: put `{...tourAttr("continue")}` on the element.
 * Content authors: use `TOUR.continue` as TutorialStep.target.
 *
 * A selector that matches nothing must NOT hang the walkthrough — the
 * Spotlight falls back to a full-screen card and an ordinary next button.
 */

export const TOUR_IDS = [
  "continue", //     the big green "let's go" button on the home screen
  "map", //          the lesson track
  "stars", //        the star counter
  "chat-card", //    the (locked) conversation card
  "replay-tutorial", // the permanent "show me again" affordance
  "keyboard", //     the virtual keyboard surface
  "lang-switch", //  the he/en switch
  "word-slots", //   the row of empty letter slots in a word lesson
  "sound-button", // the speaker button that replays a letter's sound
  "back", //         leave the lesson
] as const;

export type TourId = (typeof TOUR_IDS)[number];

/** The selector a TutorialStep should carry. */
export const TOUR: Record<TourId, string> = TOUR_IDS.reduce(
  (acc, id) => {
    acc[id] = `[data-tour="${id}"]`;
    return acc;
  },
  {} as Record<TourId, string>,
);

/** Spread onto the element being taught. */
export function tourAttr(id: TourId): { "data-tour": TourId } {
  return { "data-tour": id };
}
