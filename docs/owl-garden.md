# Owl garden pilot

The English-first entry point is /garden, linked from the home screen. The original
/map course and efh:progress storage are untouched. The pilot contains three
missions: morning/night greetings; cat/dog/ball listening comprehension; CAT
sound building followed by my cat/my dog. Teach cards precede every tested cue.

Garden data is versioned separately at efh:owl-garden:v1 in this browser. It is
not synced across devices. Failed saves show a visible warning. Correct answers,
including assisted retries, earn one star per question. Replaying cannot farm
stars. Every three stars unlock a gift choice; stars are never deducted. Six
collectibles can be placed in three replaceable garden slots without losing
ownership. Decorations currently use platform emoji.

Returning on a later local calendar day offers up to three questions, oldest
successful review first. Each can earn one review star per day. No speed score,
missed-day penalty, or streak loss. Independent success is tracked separately
from assisted or muted/text-mode practice. The word badge requires independently
recognising all three vocabulary words on at least two distinct dates.

Seventeen Hebrew instructions are recorded with Gemini TTS Kore via AI Gateway.
Existing English and phoneme recordings are reused. See garden-voice-qa.json
for automated blind listening review (not human sign-off). The source key is
not required at runtime. Browser speech is only a fallback. The recordings are
also available in the voice studio's garden group.

Validate with npm run typecheck, npm run build, and:
node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs scripts/test-garden.ts

Before expanding this pilot, observe a child doing all three missions without
coaching. Check confusion, interest, audio clarity and whether the child can
recognise the words later. The full old curriculum has not been rewritten;
legacy timing/mastery rules remain specific to that separate course.
