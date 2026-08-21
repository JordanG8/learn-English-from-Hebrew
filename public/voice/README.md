# public/voice — the app's recorded voice, committed

Files here ship with the build, sit on the CDN, and work offline. This is
where recordings belong once they are final.

To fill it: record at `/studio`, then use the studio's **ייצוא** button. It
downloads `voice-YYYY-MM-DD.zip`; unzip it over `public/` so the clips land
here next to a regenerated `index.json`, and commit the result.

`index.json` is the manifest the player reads for bundled clips — one entry
per file, `{ id, url, updatedAt, size }`. An empty `clips` array means
"nothing is bundled yet", which is a valid state: the app then reads the live
store (Vercel Blob) and falls back to TTS for anything unrecorded.

Do not rename a file. The filename before the extension IS the voice-line id
that `lib/voice/lines.ts` declares; a renamed clip is an orphaned clip.
