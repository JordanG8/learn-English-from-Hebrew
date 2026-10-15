# The app's voice

Everything the app says out loud — the Hebrew narration, every letter's name
and sound, every word and sentence, and the sound-out that introduces each new
word — is **one generated voice**: ElevenLabs v4, voice "Sarah", reached
through OpenRouter, made by `scripts/generate-voice.ts` and committed to
`public/voice/`. One model, one voice, one processing chain, so the app sounds
like one person from the first screen to the last.

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

## How it fits together

```
scripts/generate-voice.ts  makes and checks every clip (see "Regenerating")
lib/phonics.ts          sounds, mouths, and every word's sound-by-sound spelling
lib/voice/lines.ts      the closed catalogue, derived from the curriculum
lib/voice/manifest.ts   client: which lines are recorded, and their URLs
lib/voice/store.ts      server: blob or filesystem, one API
lib/voice/guard.ts      who may write
lib/voice/client.ts     the studio's side of the wire
lib/audio.ts            WebAudio playback, sequences, followLine() for marks; TTS fallback
app/api/voice/*         manifest / clip (POST, DELETE) / export (zip)
app/studio              the recording desk
public/voice/           committed clips + index.json
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
