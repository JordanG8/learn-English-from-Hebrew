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
| מילים | ~54 | Every word the child builds or hears, plus the per-letter example words. |
| כרטיסי שיעור (רשות) | ~73 | The Hebrew explanation cards inside lessons. These were never spoken before, so recording them is an upgrade, not a requirement. |

The headline progress bar counts only the non-optional groups: finishing the
lines the app actually speaks should read as finished.

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
lib/voice/lines.ts      the closed catalogue, derived from the curriculum
lib/voice/manifest.ts   client: which lines are recorded, and their URLs
lib/voice/store.ts      server: blob or filesystem, one API
lib/voice/guard.ts      who may write
lib/voice/client.ts     the studio's side of the wire
lib/audio.ts            playLine() — recorded clip first, TTS fallback second
app/api/voice/*         manifest / clip (POST, DELETE) / export (zip)
app/studio              the recording desk
public/voice/           committed clips + index.json
```

Screens never name a file. They call `sayLetterName("B")`,
`sayLetterSound("B")`, `sayWord("CAT")` or `sayNarration(stepId)`, and
`lib/audio.ts` decides between a recording and the synthesiser. That is the
seam: content authors and recording sessions can each move without the other.

### Adding a new line

Add the letter or the word to the curriculum. It appears in the studio on the
next load, unrecorded, using TTS until someone records it. Nothing else to do.

Renaming an existing id orphans its recording — the id *is* the filename.
