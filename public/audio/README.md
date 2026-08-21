# The voice pack

Audio files here replace the browser's speech synthesiser. They are recorded
at `/record` (the studio reads the script in `lib/voice-script.ts`), exported
as a zip, and unpacked into `public/` so they land in this folder.

* One file per clip, named `<clip-id>.<ext>` — the id is what the app asks
  for, so the name is not cosmetic.
* `manifest.json` maps ids to filenames and is what `lib/voice.ts` fetches at
  startup. The exported zip contains a correct one; if you edit this folder by
  hand, run `npm run audio:manifest` to rebuild it.
* A missing clip is not a bug: English cues fall back to TTS and Hebrew cues
  fall back to silence, because every instruction is on screen as text.
