/**
 * AUDIO — resolves the `say` key on a Step, plus UI sound.
 *
 * Three channels, all optional, all fail-silent, in strict priority order:
 *
 *  1. UI sound (correct / wrong / celebrate) is synthesised with WebAudio.
 *     No asset files, no network, no licensing, works offline.
 *  2. A RECORDED HUMAN VOICE, when one exists for this cue (lib/voice.ts).
 *     This is the good path: a real person reading the script from
 *     lib/voice-script.ts, recorded at /record. It beats TTS on every cue it
 *     covers, and it is the only channel that can carry Hebrew at all.
 *  3. SpeechSynthesis with an en-US voice, for English cues with no
 *     recording yet. Coverage can grow one clip at a time without any code
 *     change, because every cue resolves to a clip id first and only falls
 *     through to TTS when that id is missing.
 *
 * If none of the three can speak we degrade to silence — every step also
 * carries its instruction as Hebrew text, per design rule 3, so audio is
 * never the only channel.
 *
 * NOTE: this is *output* speech only. Conversation mode is text-only and
 * never touches the microphone.
 */

import {
  freeEnClipId,
  heClipId,
  letterNameClipId,
  letterSoundClipId,
  wordClipId,
} from "./voice-script";
import { hasClip, initVoice, playClip, stopClip } from "./voice";

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

/**
 * Speak an English string.
 *
 * `clipId` is the recorded take for this exact cue. Pass it wherever the
 * caller knows which line of the script it is asking for — the recording is
 * always better than the synthesiser, and for the letter SOUNDS it is the
 * difference between a phoneme and a syllable. Without a clip id, or without
 * that clip recorded yet, this is TTS exactly as it was.
 */
export function speakEn(text: string, rate = 0.75, clipId?: string): void {
  if (muted) return;
  if (clipId && playClip(clipId)) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const v = enVoice();
    if (!v) return;
    window.speechSynthesis.cancel();
    stopClip();
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
      speakEn(value.toUpperCase(), 0.7, letterNameClipId(value));
      break;
    case "letter-sound":
      // The caller passes an orthographic approximation of the phoneme,
      // e.g. "letter-sound:ah" — TTS cannot pronounce bare IPA, and even
      // this crude spelling comes out as a syllable. The recording is the
      // real answer here; the TTS line is the stand-in until it exists.
      speakEn(value, 0.6, letterSoundClipId(value));
      break;
    case "word":
      speakEn(value.toLowerCase(), 0.7, wordClipId(value));
      break;
    case "en":
      speakEn(value, 0.8, freeEnClipId(value));
      break;
    default:
      break;
  }
}

/**
 * Speak a HEBREW line — narration, praise, a lesson instruction.
 *
 * There is no synthesiser fallback and there should not be: browser Hebrew
 * voices are worse than useless to a 7-year-old, and every one of these lines
 * is already on screen as text. Either a human recorded it or it stays quiet.
 *
 * Lookup is by the sentence itself (see lib/voice-script.ts → heClipId), so a
 * screen passes the string it is already rendering and nothing has to be kept
 * in sync.
 */
export function sayHe(text: string | undefined): boolean {
  if (muted || !text) return false;
  const id = heClipId(text);
  if (!id) return false;
  return playClip(id);
}

/** True if this Hebrew line has a recording — for UI that offers a replay. */
export function hasHeVoice(text: string | undefined): boolean {
  const id = heClipId(text);
  return id ? hasClip(id) : false;
}

/** Silence everything currently speaking: recorded clip and TTS alike. */
export function stopSpeech(): void {
  stopClip();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
}

/** Call once from a click handler to satisfy mobile autoplay policies. */
export function primeAudio(): void {
  audioContext();
  void initVoice();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.getVoices();
    } catch {
      /* ignore */
    }
  }
}
