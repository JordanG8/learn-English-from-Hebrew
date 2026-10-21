# Combined course and owl rewards

The original home screen, 100-level road, letter/word lessons, mouth animations,
keyboard, and existing profile remain the main game. /garden is a separate
reward destination, available from home, map and lesson completion. The pilot's
standalone missions are no longer rendered. Their old saved gifts remain valid.

Correct course answers earn a garden star once per lesson/step, including a
successful retry. Existing course stars are imported once as a welcome credit.
Garden gift thresholds are 3, 10, 20, 35, 55 and 80; no stars are deducted. Existing
pilot gifts survive the new thresholds. No streak penalties or speed rewards.
Garden storage is browser-local and separate from the unchanged course profile.

The first matching exercise follows S/A instruction, and another appears at
every third introduced letter. Mixed reviews substitute matching for three
repetitive questions when at least two letters are introduced. /matching is
also available from the map after two completed letter lessons. Each board
has two different taught letters initially, increasing to three after six letters are introduced, with distinct phonemes (never
C and K together). Columns are symbol, spoken/written name, spoken sound.
Dragging and tapping two endpoints are supported. Correct lines remain after
mistakes; examples are visibly dashed. Completion requires all four links initially (six in later rounds).

Early mixed-review fallback only uses introduced letters. Every word build is
preceded by its word introduction and all its letter introductions. Newly used
sentence words now receive their own introduction before sentence entry.
Non-basic grapheme/sound combinations and silent letters receive explicit,
playable explanations on word-introduction screens. Three new Hebrew guides
have recorded audio with automated blind review in course-guides-qa.json.

Whole-screen timing no longer grades English mastery: historical values included
narration and listening. Guided key/word entry is recorded as hinted practice.
Direct lesson URLs honour the same prerequisite locks as the map (author studio
unlock remains available).

QA:
- scripts/test-combined-course.ts audits every static word/sentence build,
  all nine matching boards, early review prerequisites, ambiguity rejection,
  course reward deduplication and preserved legacy progress.
- scripts/test-garden.ts covers storage validation, pilot compatibility, reward
  limits, gift placement and retained helper functions.
- npm run build includes TypeScript and production route generation.

Human child observation is still needed to assess difficulty and engagement.
