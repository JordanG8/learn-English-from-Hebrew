# The app's voice

Most existing recordings use ElevenLabs v4, voice Sarah, generated through OpenRouter by scripts/generate-voice.ts. The 26 sound-choice questions use Google Gemini TTS voice Kore through Vercel AI Gateway. These are a separate female voice; see the generation and review details below.

The browser's synthesiser is still there, but only as the fallback for a line
that has no clip. `/studio` still works too: a line re-recorded there replaces
the generated clip (the newer of the two always wins — see
`lib/voice/manifest.ts`).

## Regenerating

```bash
OPENROUTER_API_KEY=… node --experimental-strip-types --no-warnings \
  --import ./scripts/ts-resolve.mjs scripts/generate-voice.ts \
  [--only '<id regex>'] [--preview] [--no-qa]
```

- `--only '^word-CAT$'` regenerates one line; `--only '^soundout-'` a whole
  group. A scoped run updates its own rows of `index.json` and of
  `docs/voice-qa.md` and keeps everyone else's.
- Raw takes are cached in `.voice-cache/` (git-ignored) by everything that
  determines them, so re-running costs nothing until an input changes.
- The key is read from the environment and never written anywhere.
- After a run, commit `public/voice/` and `docs/voice-qa.md`.

## How a line is made, and checked

A synthesiser is very good at words and sentences and surprisingly bad at the
one thing this app teaches — a letter's sound on its own. Every one of these
came out of a real test call: "sss" read as **ess ess ess**, "puh" read as
Finnish, "ks" as Polish, "Rrrr" as a **rolled Spanish R**, "I" as **one**,
"sun." as **Sunday**, a sentence of Hebrew followed by "r" ending on a
**Hebrew ר**. So nothing is trusted on the first take:

1. **Ask well.** Each kind of line has its own inputs (`PHONEME_INPUTS`,
   `PERF`, `NAME_INPUTS`): IPA phoneme tags for vowels, stretched letters for
   continuants, a clipped schwa for stops, bare lower-case words, and a short
   delivery tag. Tags only ever describe HOW to sound — a tag that told the
   voice what to *do* ("…exactly twice") was sometimes read out loud.
2. **Listen blind.** Every take is transcribed by an audio model that is never
   told the script (`gemini-4-argon`, falling back to `gemini-3.8-flash`), in
   batches of one kind of line at a time — mixed batches primed it to hear
   English as Hebrew. It reports what it heard, in IPA or script, any extra
   spoken words, and a 1–10 for warmth and naturalness.
3. **Check what was heard against what was meant**, plus an acoustic floor no
   listener can override: a hiss must be unvoiced, a vowel voiced, a single
   sound short.
4. **Retry** with a new seed, then the next way of asking. A clip that never
   passes keeps its best take and is flagged ⚠️ in `docs/voice-qa.md`; a
   sound-out or letter intro that never passes is **not kept at all**, and the
   app builds the same moment from the separate sound clips instead — a wrong
   sound-out is worse than none.
5. **Process every clip the same way:** silence trimmed to the same lead and
   tail, breath cut from the end of isolated vowels, loudness normalised to
   −18 LUFS (hisses a little lower, because they are heard as louder), peaks
   limited, 64 kbps mono MP3.

6. **A second opinion on the performances.** After generation, every kept
   sound-out and letter intro was reviewed again by two listeners (argon and
   flash) asking only "would you play this to a child as-is?". Where both
   said no, the line was regenerated from fresh takes (`--skip N`), and left
   out if it still failed. That review is what caught intros that said their
   sound twice and J read as "gay" — both now checked in the generator — and
   it removed the RED and EGG sound-outs, which the app builds from the
   separate clips instead (as it does for CLOUD, FRIEND, HAND and JUICE,
   whose sounds run together too closely to cut apart).

### Sound-outs and letter intros are performances

A word's sound-out — "sss · uh · nnn … sss · uh · nnn … sun!" — and a letter's
intro — "זאת האות אֶס, הצליל שלה הוא… sss" — are each generated as **one
take**, not stitched from separate clips. Stitched, every piece arrived with
its own flat, finished intonation and the result sounded like a list being
read; as one take it rises and falls like a teacher's voice.

After a take passes, it is cut at its pauses into its sounds, every pause is
widened to at least 0.6 s between sounds and 1.1 s between passes (never
shortened), and the position of each sound is written to `index.json` as
`marks`. The app follows those marks to light each letter, and swap the mouth,
exactly while its sound plays. If the voice sounded the word out three times
instead of two, the last two passes are kept. If the pauses do not split
cleanly into the expected sounds, the take is rejected rather than guessed at.

## What gets said

`lib/voice/lines.ts` is the closed list, derived from the curriculum and from
`lib/phonics.ts`, so adding a letter or a word adds its lines automatically.

| Group | Lines | What it is |
|---|---|---|
| ההדרכה | 3 | The first-visit walkthrough cards, in Hebrew. |
| פתיחת האותיות | 26 | "זאת האות …, הצליל שלה הוא…" and the sound — one take each. |
| שמות האותיות | 26 | The letter *names* — "A", "B"… |
| צלילים | 44 | One clip per SOUND, not per letter: C and K share /k/, and the A in CAT is the same clip as the letter A. Includes the digraphs and long vowels words need (sh, ee, oo, ar…). |
| מפרקים מילה | 84 | Every word a child builds, sounded out twice and said — one take each, with time marks. |
| מילים | 91 | Every word the child builds or hears, plus the per-letter example words. |
| משפטים | 50 | The sentences of levels 76–100. |
| כרטיסי שיעור | 13 | The Hebrew cards inside lessons. |

## Re-recording a line by hand

`/studio` is still the way to replace any single line with a real voice:

1. Open `/studio` on your phone (the deployed URL, or your laptop's dev server
   over the local network).
2. Type the passcode once, if one is configured.
3. For each line: read it, tap **הקלט**, say it, tap **עצור**. It saves itself
   and jumps to the next line.
4. The app uses it immediately — no deploy, no build — because it is newer
   than the generated clip.

A recorded sound-out or letter intro carries no time marks, so for those the
app plays the separate sound clips with the highlighting instead.

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
scripts/generate-voice.ts  makes and checks every clip (see "Regenerating")
lib/phonics.ts          sounds, mouths, and every word's sound-by-sound spelling
lib/voice/lines.ts      the closed catalogue, derived from the curriculum
lib/voice/manifest.ts   client: which lines are recorded, and their URLs
lib/voice/store.ts      server: blob or filesystem, one API (+ the synth cache)
lib/voice/guard.ts      who may write
lib/voice/client.ts     the studio's side of the wire
lib/voice/gateway.ts    server: the AI Gateway credential and headers, once
lib/voice/synth.ts      server: speaking  — text  -> mp3  (openai/tts-1-hd)
lib/voice/listen.ts     server: listening — audio -> text (fish-audio/transcribe-1)
lib/voice/pronounce.ts  pure: is what we heard the word we asked for?
lib/audio.ts            WebAudio playback and sequences; recording, speech model, then TTS
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

### A introduction correction (2026-10-21)

The combined A take pronounced the letter name as ah. Its replacement,
`narration-intro-A-corrected.mp3`, retains the Hebrew carrier (0–0.85 s and
1.3–3.39 s), inserts the standalone `letter-name-A` /eɪ/ clip, and ends with
the same `phoneme-a` /æ/ clip used by the keyboard. The versioned URL and
new manifest timestamp replace the old take in browser caches and the store
merge. The earlier automated QA for the combined take missed the name error;
its pass should not be treated as listening verification of this replacement.

### Sound-choice questions (2026-10-21)

Only the question “איזה צליל עושה האות …?” is narrated automatically for each
letter. The question uses the letter name, never its answer sound. Tap the
question to replay it. Choosing a sound or leaving the step cancels narration.
The smaller listening instructions are not narrated.

Generate with AI_GATEWAY_API_KEY in the process environment:

```sh
node --experimental-strip-types --no-warnings --import ./scripts/ts-resolve.mjs scripts/generate-sound-questions.ts
```

Requires ffmpeg and ffprobe. The script uses google/gemini-3.8-flash-tts,
voice Kore, and a separate blind audio review with google/gemini-3.8-flash.
Only takes with the full question, correct letter name, no answer or extra
instructions, naturalness at least 7/10, and duration 1–8 seconds are published.
The automated review results are in sound-question-qa.json; these are model
judgments, not a human listening sign-off. Raw takes are cached outside Git.
Commit the 26 MP3 files, manifest, and review report. Playback uses static
recordings and needs no AI Gateway credential in the browser or deployment.
