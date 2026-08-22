# The app's voice

Everything this app says out loud used to come from the browser's built-in
speech synthesiser. That voice is robotic, it sounds different on every
device, and it is worst at the one thing this app teaches: a letter *sound*
("ah", "buh", "ss") is not a word, so a synthesiser has nothing to pronounce
and guesses.

So the app now speaks in a recorded human voice wherever one exists, and falls
back to TTS only for lines nobody has recorded yet. `/studio` is where the
recording happens — on a phone, in one sitting, by whoever's voice this should
be.

## The short version

1. Open `/studio` on your phone (the deployed URL, or your laptop's dev server
   over the local network).
2. Type the passcode once, if one is configured.
3. For each line: read it, tap **הקלט**, say it, tap **עצור**. It saves itself
   and jumps to the next line.
4. The app uses it immediately — no deploy, no build.
5. When you are happy with the whole set, tap **ייצוא**, unzip into `public/`,
   and commit. Now the voice ships with the code.

## What gets recorded

`lib/voice/lines.ts` is the closed list, derived from the curriculum rather
than hand-written, so adding a letter or a word adds its line automatically.

| Group | Lines | What it is |
|---|---|---|
| ההדרכה | 3 | The first-visit walkthrough cards, in Hebrew. |
| שמות האותיות | 26 | The letter *names* — "A", "B"… |
| צלילי האותיות | 26 | The letter *sounds* — "ah", "buh"… |
| מילים | ~91 | Every word the child builds or hears, plus the per-letter example words. |
| משפטים | 50 | The sentences of levels 76–100. **None of these are recorded.** |
| כרטיסי שיעור (רשות) | ~62 | The Hebrew explanation cards inside lessons. These were never spoken before, so recording them is an upgrade, not a requirement. |

The headline progress bar counts only the non-optional groups: finishing the
lines the app actually speaks should read as finished.

**The sentence group is deliberately in the required set, and deliberately
empty.** The sentence phase shipped without waiting for a voice: every
sentence line has a TTS fallback, so a child on level 76 hears the browser
read "I SEE A CAT" today, and hears a person read it the day somebody records
it — no code change, no deploy. Counting the group as required is the honest
accounting: the app speaks these lines, nobody has recorded them, and the
progress bar should say so rather than reporting 100% while a synthesiser
reads sentences to a seven-year-old. Sentences are also where a recording is
worth the most — prosody is most of what makes a sentence comprehensible, and
it is the one thing TTS cannot fake at this reading level. If you record
anything next, record these.

**Hebrew lines have no TTS fallback, deliberately.** A robotic Hebrew voice
reading to a seven-year-old is worse than the silence the app shipped with,
and every card carries its text on screen regardless (design rule 3).

## Where recordings are stored

Two backends, chosen at runtime by `lib/voice/store.ts`:

| | When | Where clips land | Lives for |
|---|---|---|---|
| **Blob** | a blob credential is present — i.e. production | Vercel Blob, `voice/<id>.<ext>` | Until deleted |
| **Filesystem** | local `npm run dev` | `public/voice/<id>.<ext>` | It is the repo |

In production the filesystem is read-only and thrown away at the end of each
request, which is why the blob store exists: it is what makes a line recorded
on a phone audible in the app seconds later.

The player merges both sources (`lib/voice/manifest.ts`), with the live store
winning over anything bundled, and treats every fetch as allowed to fail — a
missing manifest means "nothing is recorded", which degrades to TTS.

### Setting up the blob store (one time)

1. Vercel dashboard → the project → **Storage** → **Create** → **Blob**.
2. Connect it to `learn-english-from-hebrew`, with **Production** ticked.
3. Redeploy, so a deployment exists that was built with the store attached.

**There is no token to copy.** Connecting a store injects `BLOB_STORE_ID`, and
the project's OIDC federation supplies the matching short-lived token per
request — not as an environment variable — which the SDK refreshes and
exchanges for access on each call. Nothing to rotate, nothing to leak, nothing
in the repo.

A `BLOB_READ_WRITE_TOKEN` (or `<PREFIX>_READ_WRITE_TOKEN`) is still honoured if
one exists — an older integration or a hand-made token — and takes precedence.
You do not need to create one.

If the studio reports no storage, `GET /api/voice/manifest` says which
mechanism was found under `storage` — `mode`, the variables it came from, and
whether a store id and an OIDC token are present at all. Names and booleans
only; it never returns a secret.

Without a store the deployed studio says so on screen and refuses to record,
rather than pretending to save.

### Setting the studio passcode (do this before recording in production)

The studio writes the voice that every child then hears, and the production
URL is public. Set an environment variable named `VOICE_STUDIO_PASSCODE` to
any string (Project → Settings → Environment Variables → Production), and the
studio will ask for it once per device and remember it locally.

If the variable is not set:

- **In development**, recording is allowed — there is nobody to protect from.
- **In production**, recording is refused with a message saying what to set.

The passcode is compared in constant time and is never sent back to the
browser.

### A saved passcode also unlocks the whole track

A device that has the studio passcode saved is an author's device, so the app
stops gating levels on it: every level on the road is open, and conversation
mode is too. That is how you play a lesson you wrote five minutes ago without
first completing the twenty before it. The road shows a 🔓 chip next to the
star counter while this is in effect, and the flat (no-WebGL) list shows the
whole track instead of a window around where the child is.

It lifts locks and nothing else — no lesson is marked complete, no stars are
awarded, and the pencil still stands where the real progress put it, so the
level-up cinematic stays honest. Nothing here is a security boundary either:
it is a local flag (`lib/studio-unlock.ts`) reading the same localStorage key
the studio writes, and every *write* to the voice store still needs the real
passcode checked on the server. Pressing "שכח סיסמה" in the studio clears the
key and puts the locks straight back.

## Committing the recordings

The blob store is the fast path, not the final home: it can be deleted, it is
billed, and it is invisible to code review. Once a voice is final:

1. `/studio` → **ייצוא** (this download is behind the same passcode).
2. Unzip `voice-YYYY-MM-DD.zip` over `public/` — it contains `voice/*.webm`
   (or `.m4a`, from an iPhone) plus a regenerated `voice/index.json`.
3. Commit. The clips now ship with the build, on the CDN, working offline.

Bundled clips show as "(מהקוד)" in the studio and are not deletable from it —
they are deleted by deleting the files.

## Recording well

- **Quiet room, phone at chin height, about a hand's width away.** Not closer:
  a phone held at the lips records plosives, not letters.
- **Watch the level bar.** If it stays flat you are recording silence — the
  most common failure, and always an OS-level muted microphone.
- **Leave a beat of silence at each end.** Tap עצור a moment after you finish,
  not on the last syllable. Clipped endings are the one flaw that cannot be
  fixed later.
- **Letter sounds are short.** "buh", not "buhhh"; the trailing vowel is what
  makes children read `b-a-t` as "buh-a-tuh".
- **Say it the way you want it repeated.** Every one of these lines is heard
  hundreds of times by the same child; a performed voice becomes tiring in a
  way a plain, warm one does not.

Re-recording a line replaces it. The old take is gone, so the studio plays
each take back the moment it ends.

## The three voices

Since the speech models landed on the AI Gateway, a line the app wants to
say has three possible sources, and it always takes the best one available:

| | Voice | Where it comes from | When it is used |
|---|---|---|---|
| 1 | **A person** | `/studio`, stored in Blob or `public/voice/` | Whenever a recording exists. Always wins. |
| 2 | **A speech model** | `openai/tts-1-hd`, voice `nova`, through the AI Gateway, cached as mp3 | A line nobody has recorded |
| 3 | **The browser** | `speechSynthesis`, English only | Neither of the above |

Tier 1 covers everything a human has recorded, which is every letter, every
word and every Hebrew card. **The 50 sentences of levels 76–100 are not
recorded**, so they are where tier 2 earns its keep today — and they are the
best possible case for it, because prosody is most of what makes a sentence
comprehensible and a browser voice has none. A child on level 76 is the one
person in the app who currently hears the difference.

It also earns its place at three quieter moments:

- **A line that is added later.** A new letter, word or sentence is speakable
  the moment it exists, in a real voice, instead of waiting for a recording
  session — which is exactly the state the sentence phase shipped in.
- **Hebrew.** Hebrew lines have no browser fallback on purpose (see above), so
  an unrecorded card would be silent rather than robotic. The speech model is
  multilingual, so tier 2 covers Hebrew as well as English.
- **In the studio.** Every line now has a **🎧 קול AI** button next to
  **▶️ ההקלטה שלי**, so the person recording can hear the model's reading of
  the same line before deciding whether theirs is better. It usually is — but
  hearing them next to each other is the only way to know.

### What the model is told

`lib/voice/synth.ts` sends a different direction per group, because the groups
need genuinely different readings:

- **Letter sounds** get the IPA the curriculum already carries (`/b/`, not
  `"buh"`) plus an explicit instruction that this is a phoneme in isolation
  with no trailing vowel. This is the line browser TTS gets worst and the
  reason this tier is interesting at all.
- **Sentences** are told to read as one phrase with real sentence intonation,
  and explicitly not word by word — a sentence read at dictation speed has
  thrown away the only thing it had over a list of words.
- **Letter names**, **words** and **Hebrew narration** each get their own pace
  and their own instruction. All of them say the listener is a seven-year-old.

Changing any of that direction means bumping `DIRECTION_VERSION`, which is
part of the cache path, so every line regenerates rather than serving
yesterday's take. Old versions are orphaned, not deleted — clear them by
deleting the `voice-synth/` prefix in the Blob store.

### Where generated clips live

A separate shelf from the recordings, deliberately: `voice-synth/<version>/` in
Blob, `.voice-synth/` (gitignored) in local development. So the studio's
progress bar keeps meaning "lines a human has recorded", and the export zip
keeps containing only takes a person made.

Generation happens once per line, on first play, and is then served from the
store and the CDN with a one-year cache. The whole catalogue is a few thousand
characters — cents at list price.

### Why this model, and why the voice is pinned

Tier 2 was `fish-audio/s2.1-pro`, picked because it is multilingual and takes
an `instructions` string. It failed at the thing that matters more than
either: **sounding the same twice.** Fish's expressive line performs the line
it is given — it lilts, it half-sings a short sentence — and with no voice id
pinned it picks a different speaker per generation. A child who hears `cat` in
one voice and `the cat is big` in another, one of them sung, cannot use either
as a model of how English sounds.

`openai/tts-1-hd` is chosen for the opposite properties. Six fixed, named
voices, so pinning one (`nova`, the least announcer-like) makes **every**
generated line in the app the same speaker — across letters, words, sentences
and Hebrew cards. It reads plainly, with no performance, which is what a
pronunciation model should do. It honours `speed`, which is how the four
groups stay differently paced.

The price is `instructions`: steering is a `gpt-4o-mini-tts` feature and the
gateway's speech catalogue does not carry that model. The direction is still
written for every group and still sent to any model that can act on it — see
`supportsInstructions` in `lib/voice/synth.ts` — so a steerable model is one
environment variable away, and a model that silently ignores direction never
looks like one that is following it.

Changing either the model or the voice means bumping `DIRECTION_VERSION`, or
half the catalogue keeps serving yesterday's speaker from the cache.

### When it is not available

`GET /api/voice/manifest` reports it under `synth`: whether the feature is on,
which model, which credential mechanism was found (`oidc`, `api-key`, or
`null`). With no credential the tier simply does not exist and the app behaves
exactly as it did before. If the gateway refuses — no credit on the account, a
rate limit, a model that has stopped serving — the player retires the tier
after three failures for the rest of the session rather than paying a network
round trip per line to rediscover it. A reload tries again.

`VOICE_SYNTH_DISABLED=1` turns it off outright.

## Listening: `/speak`

The gateway's transcription models point the microphone the other way, and
`/speak` is what that buys: a child sees a word they have already built, taps
one button, says it, and sees **the English word the model heard**.

That last part is the feature. A child practising pronunciation with nobody
listening cannot tell whether they are right, and a parent who does not speak
English cannot tell them either. Seeing `seat` when you said "sit" teaches the
exact thing that went wrong.

Three rules it holds to, all of them in the code as comments too:

1. **The model is never the authority.** There is no "wrong" — only *match*,
   *nearly*, and *we heard something else*. A phone microphone in a classroom
   mishears, and the middle verdict is what makes that survivable.
   `lib/voice/pronounce.ts` is the whole judgement, kept pure and testable: a
   Damerau edit distance, plus a consonant-skeleton check so that the vowel
   confusions Hebrew speakers actually make (`sit`/`seat`, `pan`/`pen` — see
   `docs/research.md`) land in "nearly" rather than in the red.
2. **It does not touch mastery.** Nothing in `/speak` writes to `Progress` or
   grades a skill. `lib/srs.ts` decides what a child has learned from evidence
   it can trust, and a noisy signal graded into that spine would corrupt the
   one number the app is careful about.
3. **Nothing is kept.** The take is transcribed and discarded: not stored, not
   logged, not attached to anything identifying a child. There is no database
   in this project and this feature does not add one.

Words are chosen from `progress.knownWords` — words the child has actually
built — falling back to the tier-1 words for a child who has not built any.
Letter *sounds* are deliberately not checked this way: "ffff" into a phone is
not speech, and a transcription model asked whether a seven-year-old produced
/f/ rather than /v/ answers confidently and near-randomly.

Reached from the road (`/map`) via the 🎤 button, never from the title screen —
that screen has a one-action budget.

## How it fits together

```
lib/voice/lines.ts      the closed catalogue, derived from the curriculum
lib/voice/manifest.ts   client: which lines are recorded, and their URLs
lib/voice/store.ts      server: blob or filesystem, one API (+ the synth cache)
lib/voice/guard.ts      who may write
lib/voice/client.ts     the studio's side of the wire
lib/voice/gateway.ts    server: the AI Gateway credential and headers, once
lib/voice/synth.ts      server: speaking  — text  -> mp3  (openai/tts-1-hd)
lib/voice/listen.ts     server: listening — audio -> text (fish-audio/transcribe-1)
lib/voice/pronounce.ts  pure: is what we heard the word we asked for?
lib/audio.ts            playLine() — recording, then speech model, then TTS
app/api/voice/*         manifest / clip / export / synth (GET) / check (POST)
app/studio              the recording desk
app/speak               pronunciation practice
public/voice/           committed clips + index.json
.voice-synth/           generated clips, dev only, gitignored
```

Screens never name a file. They call `sayLetterName("B")`,
`sayLetterSound("B")`, `sayWord("CAT")` or — for a tutorial card, which may
have both a narration and a cue of its own — `sayCard(stepId, step.say)`, and
`lib/audio.ts` decides between a recording and the synthesiser. That is the
seam: content authors and recording sessions can each move without the other.

Two rules the player enforces, both learned the hard way:

- **One voice at a time.** Recorded speech is a single audio element. A card
  that fires its narration and its cue together loses the narration a word in,
  so `sayCard` plays the cue *after* the narration ends, and drops it if the
  child has already moved on.
- **Audio never outlives its screen.** Screens call `stopSpeech()` when the
  step changes. Without it a sentence of narration keeps talking over the next
  card — the longer the line, the worse it is.

### Adding a new line

Add the letter, the word or the sentence to the curriculum. It appears in the
studio on the next load, unrecorded, using TTS until someone records it.
Nothing else to do.

Renaming an existing id orphans its recording — the id *is* the filename. For
a sentence the id is derived from the words themselves
(`"I SEE A CAT"` → `sentence-i-see-a-cat`), so **editing the wording of a
sentence orphans its recording too**. Adding a sentence is free; rewording one
that has been recorded is not.
