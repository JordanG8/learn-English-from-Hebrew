/**
 * AUDIO — resolves the `say` key on a Step, plus UI sound.
 *
 * Two independent channels, both optional, both fail-silent:
 *
 *  1. UI sound (correct / wrong / celebrate) is synthesised with WebAudio.
 *     No asset files, no network, no licensing, works offline.
 *  2. Speech (a letter's NAME, its SOUND, a word, or a line of Hebrew
 *     narration) plays a RECORDED HUMAN VOICE when one exists — see
 *     lib/voice/ for the catalogue and /studio for how recordings get made.
 *     A line nobody has recorded yet falls back to the browser's
 *     SpeechSynthesis en-US voice, and if the device has no English voice
 *     either, to silence. That last degradation is safe because every step
 *     also carries its instruction as Hebrew text, per design rule 3, so
 *     audio is never the only channel.
 *
 * NOTE: this is *output* speech only. Conversation mode is text-only and
 * never touches the microphone.
 */

import {
  letterNameLineId,
  letterSoundLineId,
  narrationLineId,
  wordLineId,
} from "@/lib/voice/lines";
import {
  loadVoiceManifest,
  voiceManifestReady,
  voiceUrl,
} from "@/lib/voice/manifest";
import { getLetter } from "@/lib/curriculum/alphabet";

let ctx: AudioContext | null = null;
let muted = false;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    // iOS suspends the context until a user gesture.
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setMuted(value: boolean): void {
  muted = value;
}
export function isMuted(): boolean {
  return muted;
}

function tone(freq: number, startAt: number, durS: number, gain = 0.14): void {
  const ac = audioContext();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ac.currentTime + startAt);
    g.gain.exponentialRampToValueAtTime(gain, ac.currentTime + startAt + 0.02);
    g.gain.exponentialRampToValueAtTime(
      0.0001,
      ac.currentTime + startAt + durS,
    );
    osc.connect(g).connect(ac.destination);
    osc.start(ac.currentTime + startAt);
    osc.stop(ac.currentTime + startAt + durS + 0.02);
  } catch {
    /* fail silent */
  }
}

export type Sfx = "tap" | "correct" | "wrong" | "letter-lands" | "celebrate";

/** Fail-silent UI sound. Never awaits, never throws. */
export function playSfx(name: Sfx): void {
  if (muted) return;
  switch (name) {
    case "tap":
      tone(660, 0, 0.06, 0.08);
      break;
    case "letter-lands":
      tone(880, 0, 0.09, 0.1);
      break;
    case "correct":
      tone(784, 0, 0.1);
      tone(1046, 0.09, 0.16);
      break;
    case "wrong":
      // Deliberately soft and low, not a buzzer. A 7-year-old should hear
      // "try again", not "you failed".
      tone(311, 0, 0.14, 0.07);
      break;
    case "celebrate":
      [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, i * 0.1, 0.34, 0.13));
      break;
  }
}

/* ------------------------------------------------------------------ */
/* Speech                                                              */
/* ------------------------------------------------------------------ */

function enVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  try {
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find((v) => v.lang.toLowerCase().startsWith("en-us")) ??
      voices.find((v) => v.lang.toLowerCase().startsWith("en")) ??
      null
    );
  } catch {
    return null;
  }
}

export function speechAvailable(): boolean {
  return enVoice() !== null;
}

/** Speak an English string. Fail-silent. `rate` is slowed for beginners. */
export function speakEn(text: string, rate = 0.75): void {
  if (muted) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const v = enVoice();
    if (!v) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v;
    u.lang = v.lang;
    u.rate = rate;
    u.pitch = 1.05;
    window.speechSynthesis.speak(u);
  } catch {
    /* fail silent */
  }
}

/* ------------------------------------------------------------------ */
/* Recorded human voice — preferred over TTS wherever a clip exists     */
/* ------------------------------------------------------------------ */

/**
 * One element for all speech, so a new line cuts the previous one off the
 * same way `speechSynthesis.cancel()` does. Created lazily and only in the
 * browser.
 */
let clipEl: HTMLAudioElement | null = null;

function clipElement(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!clipEl) {
    try {
      clipEl = new Audio();
      clipEl.preload = "auto";
    } catch {
      return null;
    }
  }
  return clipEl;
}

/**
 * Play the human recording for `lineId`; fall back to TTS when there is none.
 *
 * Ordering matters: a half-recorded catalogue is the normal state while the
 * recording is in progress, so "no clip" is not an error and must not be
 * louder or slower than the recorded path.
 */
/**
 * WHOSE TURN IT IS TO SPEAK.
 *
 * Every request to speak takes a ticket. Two things check it:
 *
 *  · The manifest race below, which resumes on a promise — by the time it
 *    resolves the child may be two steps further on, and playing the line
 *    they have left is worse than staying quiet.
 *  · stopSpeech(), which screens call when they move on, so a clip cannot
 *    outlive the card that asked for it. A three-word letter name usually
 *    finished on its own; a sentence of narration did not, and carried on
 *    talking over the next screen. That is the bug this counter exists for.
 */
let speechTicket = 0;

/**
 * Silence everything immediately: the recorded clip, the synthesiser, and any
 * playback still waiting on the manifest. Screens call this when the step
 * changes, so audio never belongs to a screen the child has left.
 */
export function stopSpeech(): void {
  speechTicket += 1;
  try {
    if (clipEl) {
      clipEl.pause();
      // Dropping the source stops a download that is still in flight; without
      // it a slow clip can start playing after the pause.
      clipEl.removeAttribute("src");
      clipEl.load();
    }
  } catch {
    /* fail silent */
  }
  try {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  } catch {
    /* fail silent */
  }
}

export function playLine(
  lineId: string,
  fallback?: { text: string; rate?: number } | null,
): void {
  if (muted) return;
  const speakFallback = () => {
    if (fallback) speakEn(fallback.text, fallback.rate ?? 0.75);
  };

  const ticket = ++speechTicket;

  // THE RACE THAT MATTERS: the walkthrough asks to speak the moment it
  // mounts, which can be before the manifest fetch has resolved. Answering
  // "not recorded" then would give the first line the child ever hears the
  // robot voice — the exact thing this feature exists to remove. So when the
  // list is not in yet, wait for it rather than guessing — but only if this
  // is still the line being asked for when the list arrives.
  if (!voiceManifestReady()) {
    void loadVoiceManifest().then(() => {
      if (ticket !== speechTicket) return;
      playLine(lineId, fallback);
    });
    return;
  }

  const url = voiceUrl(lineId);
  if (!url) {
    speakFallback();
    return;
  }

  const el = clipElement();
  if (!el) {
    speakFallback();
    return;
  }
  try {
    // A recorded line supersedes anything still being spoken.
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    el.pause();
    el.src = url;
    el.currentTime = 0;
    // A 404 (clip deleted between manifest load and playback) or a codec the
    // device cannot decode both land here — TTS covers the gap.
    el.onerror = () => {
      if (ticket === speechTicket) speakFallback();
    };
    const p = el.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        // An autoplay refusal or a source dropped by stopSpeech both land
        // here; only the first deserves the fallback voice.
        if (ticket === speechTicket) speakFallback();
      });
    }
  } catch {
    speakFallback();
  }
}

/** The letter's NAME ("bee"), recorded if possible. */
export function sayLetterName(letter: string, rate = 0.7): void {
  const d = getLetter(letter);
  playLine(letterNameLineId(letter), {
    text: d?.nameEn ?? letter.toUpperCase(),
    rate,
  });
}

/** The letter's SOUND ("buh"), recorded if possible. */
export function sayLetterSound(letter: string, rate = 0.6): void {
  const d = getLetter(letter);
  playLine(letterSoundLineId(letter), {
    text: d?.soundSpeak ?? letter.toLowerCase(),
    rate,
  });
}

/** An English word, recorded if possible. */
export function sayWord(word: string, rate = 0.7): void {
  playLine(wordLineId(word), { text: word.toLowerCase(), rate });
}

/**
 * EVERYTHING A TUTORIAL CARD SHOULD SAY, in the right order.
 *
 * A card has two possible sounds: the recorded Hebrew narration, and the cue
 * the content itself asks for (`step.say`). Firing both — which is what the
 * walkthrough used to do — means the second one replaces the first mid-word,
 * because recorded speech is a single audio element by design. So:
 *
 *  · An `sfx:` cue is a synthesised tone on a different channel; it plays
 *    alongside the narration and always has.
 *  · A spoken cue (a letter, a word) is a SUBSTITUTE for narration, not a
 *    companion: it plays only when this card has no recording of its own.
 */
export function sayCard(stepId: string, sayKey?: string): void {
  if (muted) return;
  const isSfx = sayKey?.startsWith("sfx:") ?? false;
  if (sayKey && isSfx) playSfx(sayKey.slice(4) as Sfx);
  const cue = sayKey && !isSfx ? sayKey : null;

  if (!voiceManifestReady()) {
    const ticket = speechTicket;
    void loadVoiceManifest().then(() => {
      if (ticket !== speechTicket) return;
      sayCard(stepId, sayKey);
    });
    return;
  }

  if (!voiceUrl(narrationLineId(stepId))) {
    if (cue) say(cue);
    return;
  }

  sayNarration(stepId);
  if (!cue) return;

  // The cue is not decoration on these cards: every letter-intro card reads
  // "this letter makes the sound X" and then makes it. So it waits its turn
  // rather than being dropped or talked over — and it is abandoned if the
  // child moves on first, which the ticket taken by the narration detects.
  const ticket = speechTicket;
  const el = clipElement();
  if (!el) return;
  const onEnded = () => {
    el.removeEventListener("ended", onEnded);
    if (ticket === speechTicket) say(cue);
  };
  el.addEventListener("ended", onEnded);
}

/**
 * A Hebrew narration line (the walkthrough, and every tutorial card).
 *
 * No fallback on purpose — see lib/voice/lines.ts. If it is not recorded, the
 * card is read, not heard, exactly as it was before recordings existed.
 */
export function sayNarration(stepId: string): void {
  playLine(narrationLineId(stepId), null);
}

/**
 * Resolve a Step's `say` key.
 *
 * Grammar of a say key:
 *   "sfx:correct"       → UI sound
 *   "letter-name:A"     → speak "A"
 *   "letter-sound:A"    → speak the phoneme approximation, e.g. "ah"
 *   "word:APPLE"        → speak "apple"
 *   "en:any free text"  → speak it verbatim
 *
 * Unknown keys are ignored rather than throwing — content data is allowed to
 * run ahead of the audio implementation.
 */
export function say(key: string | undefined): void {
  if (!key) return;
  const i = key.indexOf(":");
  if (i <= 0) return;
  const kind = key.slice(0, i);
  const value = key.slice(i + 1);
  switch (kind) {
    case "sfx":
      playSfx(value as Sfx);
      break;
    case "letter-name":
      // Historically this carried the letter's NAME ("A"); both that and a
      // bare letter resolve to the same recording, so old content still works.
      sayLetterName(value);
      break;
    case "letter-sound":
      // Two shapes are accepted: "letter-sound:B" (current, and what maps to
      // a recording) and "letter-sound:buh" (the older orthographic hint,
      // which only TTS can use). A single A-Z character means the former.
      if (/^[A-Za-z]$/.test(value)) sayLetterSound(value);
      else speakEn(value, 0.6);
      break;
    case "word":
      sayWord(value);
      break;
    case "en":
      speakEn(value, 0.8);
      break;
    default:
      break;
  }
}

/** Call once from a click handler to satisfy mobile autoplay policies. */
export function primeAudio(): void {
  audioContext();
  // Warm the list of recorded lines. Idempotent, fail-silent, and needed
  // before the first playLine so a recorded clip is not missed by a race.
  void loadVoiceManifest();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.getVoices();
    } catch {
      /* ignore */
    }
  }
}
