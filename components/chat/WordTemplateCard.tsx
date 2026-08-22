"use client";

/**
 * A fill-in-the-blank word the AI handed over mid-conversation.
 *
 * The card draws the exercise and nothing else: it owns no input. Letters
 * arrive from the one keyboard at the bottom of the chat screen, which is the
 * app's input device everywhere else too — see ChatScreen. That is deliberate:
 * a second, card-local way to enter letters would be a second thing to learn,
 * and the keyboard is the thing this app is teaching.
 *
 * Slots reuse `.efh-slot` from the word-building lesson, so a blank here looks
 * exactly like a blank there.
 */

import { templateSlots, type WordTemplate } from "@/lib/word-template";
import { sayWord } from "@/lib/audio";
import { Card, SecondaryButton } from "@/components/ui/kit";

export type TemplateCardState = "idle" | "active" | "solved";

export interface WordTemplateCardProps {
  template: WordTemplate;
  /** Letters the child has supplied so far, one per blank, in order. */
  typed: readonly string[];
  state: TemplateCardState;
  /** Wrong letters on this card so far — drives the encouragement line. */
  misses?: number;
  onStart: () => void;
  onCancel: () => void;
}

export function WordTemplateCard({
  template,
  typed,
  state,
  misses = 0,
  onStart,
  onCancel,
}: WordTemplateCardProps) {
  const solved = state === "solved";
  // Solved shows the answer: `typed` is indexed by BLANK, not by position, so
  // a solved card has to be given the letters its own blanks were hiding.
  const slots = templateSlots(
    template,
    solved ? template.blanks.map((i) => template.word[i] ?? "") : typed,
  );
  const activeIndex = state === "active" ? template.blanks[typed.length] : undefined;

  return (
    <Card
      className={`flex flex-col items-center gap-3 border-4 ${
        solved ? "border-go" : state === "active" ? "border-brand" : "border-brand-soft"
      }`}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-5xl">
          {template.emoji}
        </span>
        <p className="text-2xl font-bold">{template.he}</p>
      </div>

      <div
        className="ltr flex flex-wrap justify-center gap-2"
        role="group"
        aria-label={`השלמת המילה ${template.he}`}
      >
        {slots.map((ch, i) => {
          const isBlank = template.blanks.includes(i);
          return (
            <div
              key={i}
              className="efh-slot"
              data-filled={ch !== null && isBlank ? "1" : undefined}
              data-active={i === activeIndex ? "1" : undefined}
              aria-label={ch ?? "אות חסרה"}
            >
              {ch ?? ""}
            </div>
          );
        })}
      </div>

      {solved ? (
        <div className="flex items-center gap-3">
          <p className="text-xl font-black text-go">
            <span aria-hidden>✅ </span>כל הכבוד!
          </p>
          <button
            type="button"
            onClick={() => sayWord(template.word)}
            aria-label={`השמע את המילה ${template.word}`}
            className="grid h-16 w-16 place-items-center rounded-full border-[3px] border-brand-soft bg-card text-3xl"
          >
            <span aria-hidden>🔊</span>
          </button>
        </div>
      ) : state === "active" ? (
        <>
          <p className="text-center text-lg font-bold">
            {misses > 0
              ? "כמעט! נסה אות אחרת."
              : "הקלד את האות החסרה במקלדת למטה"}
          </p>
          <SecondaryButton icon="💬" onClick={onCancel}>
            אחר כך
          </SecondaryButton>
        </>
      ) : (
        <SecondaryButton icon="✏️" onClick={onStart}>
          בוא נשלים
        </SecondaryButton>
      )}
    </Card>
  );
}
