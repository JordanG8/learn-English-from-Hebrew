# Architecture

How this app is put together, what state it keeps, how mastery is decided,
and how you add a lesson.

Companion documents: `docs/research.md` is the authority on every
pedagogical number; `docs/deployment.md` is the authority on environment and
build config; `components/keyboard/README.md` is the authority on the
keyboard's props.

---

## 1. The shape of the thing

```
app/
  layout.tsx            server: reads the visit cookie, mounts AppProviders
  page.tsx              → components/home/HomeScreen
  lesson/[id]/page.tsx  → components/lesson/LessonPlayer   (all 100 prerendered)
  chat/page.tsx         → components/chat/ChatScreen
  api/chat/route.ts     the only server-side secret-holder
  api/voice/*           the voice manifest, clip write, zip export, and the
                        two gateway routes: synth (speak) and check (listen)
  studio/page.tsx       → components/studio/VoiceStudio (authoring tool)
  speak/page.tsx        → components/speak/SpeakPractice (say it, be heard)
  globals.css           design system + the five accessibility rules
middleware.ts           sets the httpOnly visit cookie (layer 1 of 3)

lib/
  types.ts              SHARED. Append only, never rewrite.
  pedagogy.ts           EVERY pedagogical number, with confidence tags
  skills.ts             SkillId encoding — the only place ids are parsed
  progress.ts           localStorage: load / coerce / migrate / pure updates
  srs.ts                THE SPINE: grading, due-ness, mastery, the chat gate
  reward.ts             stars, Hebrew praise, the anti-overjustification rules
  audio.ts              WebAudio SFX + speech: recording, then model, then TTS
  tour.ts               the data-tour selector contract
  visitor.ts            returning-visitor policy (pure)
  visitor-server.ts     server-side read of the visit cookie
  app-providers.tsx     ProgressProvider + VisitorProvider
  progress-context.tsx  the single client owner of Progress
  keyboard-adapter.tsx  the ONE seam onto components/keyboard
  chat-prompt.ts        system prompt + lexicon enforcement (pure)
  voice/
    lines.ts            the closed catalogue of every spoken line
    manifest.ts         client: which lines are recorded, and where
    store.ts            server: Vercel Blob or public/voice, one API
    gateway.ts          server: the AI Gateway credential and headers, once
    synth.ts            server: text -> mp3, cached (the synthesised voice)
    listen.ts           server: audio -> text (pronunciation practice)
    pronounce.ts        pure: was that the word? match / nearly / different
    guard.ts            who may change the app's voice
    client.ts           the studio's side of the wire
    zip.ts              dependency-free zip for the export
  curriculum/
    contract.ts         content types, declared apart from the content
    alphabet.ts         all 26 letters
    words.ts            the word bank
    sentences.ts        the sentence bank + the glue words it needs
    lessons.ts          track generation + the SRS↔content bridge
    index.ts            public surface

components/
  ui/kit.tsx            shared primitives (one file, on purpose)
  lesson/               LessonPlayer + one renderer per Step variant
  home/                 HomeScreen
  onboarding/           Walkthrough
  studio/               the recording desk (adult tool, not a kid screen)
  keyboard/             OWNED BY THE KEYBOARD MODULE — do not edit
```

### Two rules that keep the modules apart

**One seam per boundary.** Lesson code never imports `components/keyboard`
directly; it goes through `lib/keyboard-adapter.tsx`. Content never hard-codes
a CSS selector; it uses `lib/tour.ts`. Nothing outside `lib/skills.ts` parses a
`SkillId`. No screen names an audio file; it calls `sayLetterName()`,
`sayLetterSound()`, `sayWord()` or `sayNarration()` and `lib/audio.ts` decides
between a recording and the synthesiser. Each of those is a single file to
change when the other side moves.

**Numbers live in one file.** `lib/pedagogy.ts` holds every threshold,
interval, budget and probability, each tagged with `docs/research.md`'s
confidence level (A / B / C) and, where we diverge from that document, a
`DIVERGENCE` note saying why. Retuning the pedagogy is a one-file edit. A
magic number anywhere else is a bug.

---

## 2. State model

No accounts, no database, no login — a parent opens a link.

All state is one `Progress` object in `localStorage` under `efh:progress`.

```
Progress { version, createdAt, skills, lessonsCompleted, stars,
           knownWords, onboarded, chatUnlockedAt }
```

### Reading it can never fail

`loadProgress()` never throws and never returns undefined. It returns a valid
`Progress` or a fresh profile. Between storage and the app sit three layers:

1. **`hasStorage()`** — Safari private mode and blocked-cookie modes throw on
   `window.localStorage` access, so even the feature test is wrapped.
2. **`migrate()`** — dispatches on `version`. An *unknown, newer* version is
   not discarded; it is coerced, because salvaging a partially-understood
   profile always beats wiping a child's progress.
3. **`coerceProgress()`** — treats the payload as hostile input. Every field is
   type-checked and clamped; unrecognised keys are dropped; missing fields get
   defaults. A truncated write, a hand-edited store, or a payload from a future
   build all produce a usable profile.

`saveProgress()` is equally silent: a quota error leaves the session working in
memory rather than throwing mid-lesson.

### Adding a field (the v2 recipe)

1. Append the field to `Progress`/`SkillState` in `lib/types.ts` — **append,
   never rewrite**, that file is shared with other modules.
2. Bump `CURRENT_VERSION` and the `version` literal.
3. Add a `case 1:` branch in `migrate()` that reshapes v1 → v2. Never delete an
   old branch; old devices exist.
4. Teach `coerceProgress()` the new field.

Optional fields need no migration at all — that is how `latencyMs` and
`firstCorrectAt` were added to `SkillState` without a version bump.

### Who owns it at runtime

`ProgressProvider` (mounted in `app/layout.tsx`) is the single client owner.
Every write goes through `update()`, which runs `settleChatUnlock()` and
persists. Two components cannot clobber each other because there is only one
writer.

**Hydration rule:** the server has no `localStorage`, so first render always
uses a fresh profile with `ready === false`. Screens render a stable skeleton
until `ready` is true. Skipping this both breaks hydration and shows a
returning child "0 stars" for a frame.

---

## 2b. The track — where the hundred levels go

The track is **generated**, not listed, and it is generated to fit three
declared phases. The numbers are in `lib/pedagogy.ts` §9; `buildTrack()` in
`lib/curriculum/lessons.ts` is what builds each phase to land on them.

| levels | phase | what happens |
|---|---|---|
| 1–50 | **the alphabet** | every one of the 26 letters is introduced, spent on a real word inside its own lesson, drilled and reviewed. Level 50 is the A-to-Z milestone. |
| 51–75 | **words** | no new letters. Words per level climbs 2 → 5; at level 61 the keyboard stops pointing at the next key. |
| 76–100 | **sentences** | words side by side — "I SEE A CAT" — typed with the space bar between them. At level 89 the spotlight goes off here too. |

Then conversation mode, which sits on the road from the start with a lock on
it and is gated on evidence, not on levels (§3).

### Why the alphabet had to finish by 50

The previous track alternated a letter lesson with a separate word lesson that
spent it. That read well and cost two levels per letter: **the last letter, Q,
was not introduced until level 60**, and the thirty-odd levels after it were
leftover words with nothing shaping them. A child who never got past level 50 —
most of them — never met six letters, and a child who did get there had still
never seen two English words next to each other.

The fix was not to cut anything. **The payoff word moved inside the letter
lesson**: same content, same principle (never in a vacuum — a letter is spent
the moment it is learned), one level instead of two, and the lesson now ends on
a real word the child just built rather than on a promise. That bought the
room for the two phases that follow.

Three letters — S, A and T — reach their lesson with no word to spend, because
one, two and three letters cannot spell anything in the bank. That is
arithmetic, not an oversight; the first word arrives at letter I, which is what
the s-a-t-p-i-n teaching order is *for*. `spendWordFor()` is what finds a
letter's word: the payoff word when the letter unlocks one, otherwise the
shortest already-buildable word that contains it.

### Why reviews are fitted, not counted

`insertReviews()` computes how many mixed reviews fit the alphabet phase's
level budget and spreads them evenly, rather than inserting one every N
lessons. A fixed cadence makes the *length of the phase* a consequence of the
content; fitting makes it a promise. Add a letter or a drill tomorrow and the
phase still ends on level 50 with one fewer review, instead of quietly pushing
the alphabet past the level it is supposed to finish on. A review is never the
first level after the tutorial (nothing to review yet) and never the last
level of the phase (that is A-to-Z).

`MIXED_REVIEW_EVERY_N_LESSONS` survives as the statement of intent, and the
fitted cadence lands near it. If it ever drifts far, the phase budget is what
needs re-examining.

### Why levels 51+ have no review levels

Because "more words to type" is the promise the road makes there, and a review
screen is not that. But the chat gate is evidence-based — every letter's name
and sound mastered, across distinct days, with a delayed retention check — and
evidence stops accumulating for a skill nothing asks about. A phase with no
letter lessons and no reviews would quietly make conversation mode
unreachable.

So every word and sentence lesson carries `warmup: 2`: when the lesson opens,
`LessonPlayer` asks the SRS what is closest to slipping and prepends that many
questions. Two rules make it a warm-up rather than a longer level:

- **Alphabet skills only.** `buildWarmupSteps()` filters out word and sentence
  skills — making a child type an extra word before the words they came for is
  not a warm-up.
- **No fallback.** An empty list is a valid answer. With nothing due, the
  lesson starts on its own first step. This is the one place that differs from
  `buildReviewLesson()`, which always produces something.

### What a sentence is made of

`lib/curriculum/sentences.ts` holds 50 sentences. Every word in every one of
them is already known: it is in the word bank, or it is in `SENTENCE_GLUE` —
the words like "A", "IS", "MY", "WANT" that cannot be drawn and so can never
enter `words.ts`, whose entrance requirement is an emoji that carries the
meaning. Glue words are learned the way function words actually are learned:
in a sentence, from position and repetition, never as a flashcard.
`unglossedSentenceWords()` is the check that no sentence smuggled in
vocabulary; it should always return `[]`.

`tier` is derived from length (two words / three / four-or-more), never
hand-assigned, and the phase walks up the tiers. Sentences per level comes
*down* as length goes up, so a level stays roughly the same size of job.

The Hebrew appears twice on a sentence screen and the two do different jobs.
The whole sentence in natural Hebrew is the **meaning** — the big line, what
the child is being asked to say. The word-under-word glosses are the
**machinery**, small and secondary. A child reading "אני רואה חתול" over
"I SEE A CAT" can see for themselves that English spends a word on "A" where
Hebrew spends none.

The words inside a sentence a child completes join `knownWords`, which is the
chat lexicon — so the sentence phase is also what stocks conversation mode,
sitting immediately before it. `sanitizeLexicon()` in `lib/chat-prompt.ts`
therefore narrows against the word bank *plus* `SENTENCE_VOCAB`; it is still a
closed set, and it still only grows by adding curriculum.

### Checking the promise

`TRACK_SHAPE` is computed from the built track, not asserted in a comment:

```ts
{ total: 100, alphabetEnd: 50, wordEnd: 75, sentenceEnd: 100,
  lastLetterLevel: 49, wordsTyped: 84, sentencesTyped: 50 }
```

`lastLetterLevel` is the load-bearing one. If a content change pushes it past
`alphabetEnd`, the promise in the phase's name is broken and this is what says
so.

### What existing players see

Lesson ids are localStorage keys, and this reorganisation kept every id it
could: `letter-X`, `review-N`, `kb-lang`, `kb-digits`, `kb-symbols` and
`abc-song` are unchanged. The standalone `word-SIT`-style lessons are gone
(folded into their letter lesson) and their completions are now inert; the new
`words-N`, `sentence-N` and `drill-N` ids are new.

A returning player's unlock chain mostly survives, because `requires` is
threaded through the lessons they actually completed. Where a newly-inserted
drill sits behind them, the road will show it as the next level: they play one
lesson and the chain re-opens. Stars earned against ids that no longer exist
are still counted — `totalStars` sums the map — which is the generous
direction to be wrong in.

---

## 3. The SRS / mastery engine

`lib/srs.ts` is pure: every function is `(state, now) → value`. No storage, no
React, no randomness. That makes the mastery criterion auditable, which
matters, because it is the thing standing between a child and the chat screen.

### Grading

`gradeSkill(prev, {correct, hinted, latencyMs, now})` is the only place a
`SkillState` changes.

- **Accuracy** is an exponential moving average (α = 0.25), so recent evidence
  dominates without a fixed window to store.
- **Streak** drives the interval ladder: `[10 min, 1, 3, 7, 14, 30 days]`.
- **A hinted success keeps the streak but does not advance the interval** and
  does not count toward a new correct day. A hint makes the step recognition,
  not recall, and recognition is not what we are measuring.
- **A lapse drops the streak by 2, not to zero**, and re-queues the item in
  5 minutes. A child who mis-taps once should not lose a week of work.
- **`daysCorrect` increments at most once per local calendar day**, and only
  for unhinted correct answers. Local, not UTC: practising at 23:00 and again
  at 09:00 is two days.
- **`latencyMs`** is a smoothed first-attempt response time; later attempts on
  the same step are excluded because they include reading the nudge.

### The mastery criterion

Six conditions, all required (`isMastered`):

| # | condition | value | why |
|---|---|---|---|
| 1 | `reps` | ≥ 5 | enough evidence exists at all |
| 2 | `accuracy` | ≥ 0.90 | behavioural analogue of the BKT 0.95 convention |
| 3 | `streak` | ≥ 3 | it is good *now*, not historically |
| 4 | `daysCorrect` | ≥ 3 distinct days | same-day performance overstates learning |
| 5 | retention | a correct answer ≥ 7 days after the first | mastery is measured *after* a delay |
| 6 | automaticity | smoothed latency ≤ 2 s (3 s for keys) | accurate-but-slow is reasoning, not retrieval |

Conditions **4 and 5 are the load-bearing ones**: together they are the only
conditions a child cannot satisfy in a single sitting, however long that
sitting is. That is the whole point — mastery is evidence from spaced
retrieval across distinct days, not lessons clicked through.

Condition 6 is skipped when a skill has no timing data, so profiles saved
before latency tracking are never permanently blocked.

All six thresholds are named constants in `lib/pedagogy.ts`.

### Selection

`planMixedReview(progress, now)` takes the most-overdue introduced skills,
tops the list up to a constant length with the *weakest* not-yet-due items
(so a review lesson is always the same predictable length), and then
**interleaves** — `interleaveByKind` reorders so consecutive items differ in
kind and the same letter never repeats within 5 positions. A review lesson
that groups all the letter-sounds together is a blocked drill in a review
costume; interleaving is where durability actually comes from.

### The chat gate

`evaluateChatGate(progress)` returns `{unlocked, progress, ...counts,
reasonHe}`. Three independent conditions:

- every letter's **name and sound** both mastered by the criterion above,
- at least 10 words actually built,
- at least 4 distinct days of practice overall.

Because the per-letter criterion already contains "3 distinct days" and "a
correct answer 7 days later", the gate cannot be rushed. `settleChatUnlock()`
stamps `chatUnlockedAt` the first time it opens, so **the unlock is sticky** —
a child who unlocks conversation never loses access to it.

The home screen and the locked `/chat` screen both render the gate's counts
and `reasonHe`, so "why is this locked" always has a concrete answer.

---

## 4. The walkthrough and returning-visitor detection

The walkthrough is mandatory on first visit and teaches the app before it
teaches any English. It is the highest-risk screen in the product, so it is
built defensively.

### Three signals, one policy

| layer | signal | survives | lost to |
|---|---|---|---|
| 1 | httpOnly cookie from `middleware.ts` | localStorage wipe | private browsing, new device |
| 2 | `localStorage` (`efh:seen`, `Progress.onboarded`) | cookie clearing | private browsing |
| 3 | truncated salted hash of the IP, inside the cookie | — | any network change |

`classifyVisitor()` in `lib/visitor.ts` is the only implementation of the
policy:

- **`Progress.onboarded === true` is the only signal permitted to skip the
  walkthrough automatically.** It means *this device actually finished it*.
- Any other evidence produces `probably-returning`: the walkthrough **still
  runs**, but a large, clearly visible skip button is offered.
- With no evidence at all, the walkthrough runs and **there is no skip button**.

### Why IP can only ever weaken a conclusion

A school, a household and a mobile carrier all NAT many children behind one
address. Two different first-time children share an IP; one child's IP changes
between home wifi and 4G. So the IP hash is used **only** to ask "is this
plausibly the same context as last time?" — a match nudges confidence up a
little, a mismatch pulls it down harder. It can never conclude "returning" and
it can never skip anything. Its only visible effect is the delay before the
skip button appears (`skipRevealDelayMs`): weak evidence means a longer wait,
so a genuine first-timer carrying a stale cookie has to look at the first card
before the escape hatch exists.

### Privacy

Raw IPs are never stored, logged or sent to the client. The cookie holds an
8-hex-character SHA-256 of `${monthly-salt}|${ip}`. The salt rotates monthly so
hashes cannot be correlated across months, and 8 hex characters collide far too
often to single anyone out.

### Recovering from a wrong guess

Two independent escape hatches, because the detection *will* be wrong
sometimes:

- **"הראה לי שוב איך משחקים"** is a permanent button on the home screen. A
  wrongly-skipped first-timer is one tap from the walkthrough.
- Skipping only sets `onboarded` when confidence is high. A merely-probable
  returner who skips is offered it again next time.

### Why it cannot dead-end

`Walkthrough.tsx` spotlights real elements and requires real taps
(`advanceOn: "tap-target"`), with the dimmer swallowing every pointer event
outside the spotlight so a stray tap cannot navigate away mid-tour. But:

- a selector that matches nothing, or an element smaller than 4px, degrades the
  step to a full-screen card with an ordinary button;
- the target is scrolled into view first, and the spotlight is re-measured
  every frame so scroll, resize and layout shift cannot orphan it;
- tapping the spotlight advances the tour but does **not** fire the underlying
  control, so the child cannot navigate out of the explanation.

Targets come from `lib/tour.ts`. Content authors use `TOUR.continue`; screen
authors spread `tourAttr("continue")`. Neither side can drift.

---

## 5. Conversation mode

Text only. The microphone is never touched.

### The lexicon constraint, enforced three times

A system prompt is a request, not a guarantee, so the constraint is enforced at
three separate points in `app/api/chat/route.ts` and `lib/chat-prompt.ts`:

1. **Input narrowing.** The lexicon the client sends is intersected with the
   app's own word list (`sanitizeLexicon`) and letters with the alphabet. A
   tampered or replayed request cannot inject arbitrary text into the system
   prompt.
2. **The prompt.** States the allowed words, the budget, the format (English in
   CAPITALS inside Hebrew sentences, new words glossed in parentheses), the
   tone rules, and an explicit instruction to ignore any instruction appearing
   inside the conversation itself.
3. **Output validation.** `checkReply()` scans the reply for English outside
   the allowed set and applies **two** constraints, whichever binds first: the
   absolute count of unknown words, and the unknown-token *ratio* (≤ 5%). A
   short turn therefore gets zero new words, not one. A failure triggers one
   stricter retry, then a safe Hebrew fallback.

### The other safeguards

- **The API key never leaves the server.** `AI_GATEWAY_API_KEY` is read in the
  route handler only, is never `NEXT_PUBLIC_`, and is never echoed in a
  response. The client cannot reach the gateway directly.
- **Graceful degradation.** With no credential configured — the state of the
  project until someone sets one — the route returns HTTP 200 with
  `ok: false` and a clear Hebrew explanation. The chat screen shows it as a
  friendly notice. Nothing crashes and nothing spins forever.
- **Request validation** with `zod`: hard caps on message count, message
  length, lexicon size and budget.
- **Budget clamp** to `CHAT_NEW_WORDS_MAX` server-side regardless of what the
  client asks for.
- **No logging, no storage.** There is no database and the route writes
  nothing. Upstream error text is never forwarded — it can carry request
  details and a child cannot act on it.
- **Safety rules in the prompt**: child-appropriate topics only, redirect
  anything unsafe, never solicit or repeat personal details, never claim to be
  a person.

---

## 6. Reward design

`lib/reward.ts`, thresholds in `lib/pedagogy.ts`.

Overjustification (Lepper/Greene/Nisbett 1973; Deci/Koestner/Ryan 1999):
*expected, tangible, task-contingent* rewards reduce intrinsic motivation;
unexpected rewards and effort-contingent rewards do not. So:

- **Stars are contingent on effort, never ability.** Everyone who finishes a
  lesson earns at least one. The second and third come from care taken (few
  wrong answers), never from speed.
- **Three stars tolerates one mistake.** A zero-mistake bar teaches children to
  avoid anything hard.
- **The one-star copy is as warm as the three-star copy** — a child who
  struggled through a lesson did *more* work, not less.
- **Celebration is guaranteed where it is the point** (a completed word) and
  *unexpected* on top of that, at a variable ratio averaging 1-in-5.
- **We never say "wrong".** A miss gets a rotating Hebrew nudge; after three
  attempts the app shows the answer kindly and moves on. The SRS will bring
  the item back — a failure loop is the fastest way to lose a child.
- **No losable streak.** `STREAK_IS_LOSSY = false`. We count *total days
  practised*, which only goes up. (This diverges from `docs/research.md`,
  which suggests a decaying streak with freezes; the reasoning is recorded at
  the constant.)
- **No leaderboards**, permanently.

---

## 7. Adding things

### Adding a letter

Add a `LetterData` entry in `lib/curriculum/alphabet.ts` and put the letter in
`TEACHING_ORDER`. That is the whole change: the track is *generated*, so a
letter lesson, its payoff word lesson and its review slots all appear
automatically.

### Adding a word

Add one line to `lib/curriculum/words.ts`. `requiresLetters` is derived from
the spelling, so the word automatically becomes available at the point in
`TEACHING_ORDER` where its last letter is taught, and `payoffWordFor()` will
attach it to that letter's lesson. Every word needs an emoji — the emoji *is*
the meaning for a child who cannot read the English yet.

### Adding a sentence

Add one line to `lib/curriculum/sentences.ts`. `tier`, `words` and
`requiresWords` are all derived from the text, so the sentence lands in the
right part of the sentence phase by itself and appears in `/studio` as an
unrecorded line the same day.

The one rule: **every word must already be known** — in the word bank, or in
`SENTENCE_GLUE`. If it is a word that can be drawn, it belongs in `words.ts`
with an emoji; if it cannot (`IS`, `MY`, `WANT`), add it to `SENTENCE_GLUE`
with a Hebrew hint for *this word in this position*, not a dictionary
translation. `unglossedSentenceWords()` returns anything you missed.

The sentence phase cycles each tier's bank, so adding sentences reduces
repetition rather than lengthening the track — the phase is 25 levels either
way.

### Adding a lesson

Lessons are generated by `buildTrack()` in `lib/curriculum/lessons.ts`, which
concatenates three phase builders (`alphabetPhase`, `wordPhase`,
`sentencePhase`) and then threads `order` and the linear `requires` chain
through in one pass — so no builder needs to know where in the track it ended
up. To add a one-off lesson, `push()` a `Lesson` into the right phase.

A lesson needs: a stable `id` (it is a localStorage key — never reuse or
rename one), `kind`, `titleHe`, the `skills` it touches (this drives SRS
scheduling), and its `steps`. Optionally `warmup: n` to open with `n`
SRS-chosen alphabet questions.

**Adding to the alphabet phase costs a review, not a level.** `insertReviews`
fills whatever room is left in the 50-level budget, so one more lesson means
one fewer review and the phase still ends on level 50. Adding to the word or
sentence phase *does* lengthen the track, because those phases are a fixed
count of generated levels — change `WORD_PHASE_LEVELS` /
`SENTENCE_PHASE_LEVELS` (and `TRACK_TOTAL_LEVELS`) rather than pushing an
extra lesson in.

### Adding a spoken line

You do not. `lib/voice/lines.ts` derives the catalogue from the curriculum, so
a new letter or word appears in `/studio` unrecorded, using TTS, until someone
records it. See `docs/voice.md`. The one hard rule: a voice-line id IS the
stored filename, so renaming an id orphans its recording.

### Adding a Step *type*

1. Append the interface to the `Step` union in `lib/types.ts` (append only).
2. Add a renderer to `components/lesson/steps.tsx`. Renderers are dumb: they
   call `onAnswer(correct)` and nothing else. All policy — attempts, rescue
   hints, star accounting — lives in `LessonPlayer`.
3. Add a branch to `skillsForStep()` so attempts are graded against something.
4. Add a case to `stepForSkill()` so the SRS can put it into a review lesson.
   Return `null`, never throw, for a skill you have no content for: `Progress`
   outlives content changes.
5. Add the branch to the renderer switch in `LessonPlayer`.
6. If the step owns its own celebration and calls `onAdvance` itself (as
   `build-word` and `build-sentence` do), say so in the two places
   `LessonPlayer` checks for it: the correct-answer path must not schedule its
   own advance, and the out-of-attempts path must not move on past a step the
   child is still filling in.

`build-sentence` is the worked example of all six — it was added this way.

### How a mixed review actually works

Review lessons are stored with `steps: []`. When the player opens one, it calls
`planMixedReview(progress)` to get a skill list from the SRS, then
`buildReviewLesson()` to turn each skill into a `Step` via `stepForSkill()`.
The content is resolved **once**, when the lesson opens — deliberately not
recomputed as progress changes, or the questions would shift under the child's
feet mid-lesson. This is why review lessons stay useful forever instead of
replaying the same eight questions.

---

## 8. Known gaps

Honest list of what is not built, or is built differently from
`docs/research.md`.

1. **No handwriting / tracing step.** `docs/research.md` marks
   `HANDWRITING_STEP_REQUIRED = true` [conf A that handwriting beats typing for
   letter recognition]. There is no trace-and-write step in the letter lesson.
   This is the largest divergence. Note the research doc's own caveat: James &
   Engelhardt found *tracing* produced no reading-network recruitment, so an
   on-screen version may deliver the appearance without the substance — the
   doc's own mitigation is to tell the teacher that five minutes of paper
   letter-writing alongside the app is worth more.
2. **No timed fluency probe.** `MASTERY_FLUENCY_LPM = 30` is part of the
   research doc's conversation gate. We approximate automaticity with
   per-skill latency instead. Implementing it properly means a timed
   26-letter naming lesson.
3. **`MASTERY_SESSIONS ≥ 3` is approximated by distinct days.** `SkillState`
   has no session counter. Two sessions three hours apart on one day count as
   one. Adding a real session boundary means another `Progress` field.
4. **No teacher dashboard.** The research doc recommends reporting fluency and
   the retention probe separately to the teacher. There is no reporting surface
   at all — no accounts, no server storage, by design.
5. **No rate limiting on `/api/chat`.** There is no store to hold counters and
   no auth to attribute them to. A public deployment should put a limit in
   front of it.
6. **The chat lexicon is client-supplied.** It is narrowed to the app's own
   word list, so it cannot inject text, but a determined child could still
   claim to know every word in the bank. The consequence is only that chat gets
   harder than it should be for them.
7. **Audio depends on the browser's TTS.** Letter *sounds* are approximated
   with crude English syllables ("buh", "ss") because TTS cannot read IPA, and
   quality varies by device. Everything degrades to silence with the Hebrew
   text instruction intact. Recorded audio would be better.
10. **No sentence is recorded.** All 50 sentences of levels 76–100 play
    through the browser voice today. They are in the *required* voice group
    rather than the optional one precisely so the studio reports them as
    outstanding — see `docs/voice.md`. This is the largest gap the sentence
    phase shipped with, and it is a recording session rather than a code
    change: `saySentence()` already prefers a human recording the moment one
    exists.
11. **Sentence Hebrew is a hint, not a translation model.** The per-word
    glosses under a sentence come from a flat word→Hebrew map, so a word
    carries the same gloss in every sentence it appears in. That is right for
    "CAT" and rough for "IS". A child gets the natural Hebrew of the whole
    sentence as the primary channel, which is what actually carries the
    meaning; the word-by-word row is machinery and is deliberately the small
    text.
12. **Nothing teaches sentence *reading*.** The sentence phase teaches
    production — typing a sentence someone else composed. Conversation mode
    asks for comprehension of sentences the AI composes. That gap is smaller
    than it was (it used to be the whole distance from single words) but it is
    still a gap.
8. **`components/keyboard/` styling and phone degradation are not ours.** The
   keyboard's focus-tile mode on narrow screens is documented in its README and
   trusted; it has not been exercised on a real phone here.
9. **The chat gate is strict.** Following the research doc, it requires all 26
   letters mastered *with* the 7-day retention window. That is realistically
   weeks of practice. If play-testing shows children never reach it, the single
   value to change is `CHAT_UNLOCK_LETTER_FRACTION`.
