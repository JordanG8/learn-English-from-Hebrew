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
  phonemeLineId,
  sentenceLineId,
  wordLineId,
} from "@/lib/voice/lines";
import {
  loadVoiceManifest,
  voiceManifestReady,
  voiceManifestSnapshot,
  voiceUrl,
} from "@/lib/voice/manifest";
import { PHONEMES, type PhonemeId } from "@/lib/phonics";
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

/**
 * THE OUTPUT BUS. Everything synthesised goes through one compressor rather
 * than straight at the speakers: the level-up stacks four layers at once, and
 * four envelopes peaking together on a phone speaker is a crackle, not a
 * fanfare. Made lazily with the context, and rebuilt if the context is.
 */
let bus: DynamicsCompressorNode | null = null;
let busCtx: AudioContext | null = null;

function output(ac: AudioContext): AudioNode {
  if (bus && busCtx === ac) return bus;
  try {
    const c = ac.createDynamicsCompressor();
    c.threshold.value = -14;
    c.knee.value = 26;
    c.ratio.value = 5;
    c.attack.value = 0.004;
    c.release.value = 0.16;
    c.connect(ac.destination);
    bus = c;
    busCtx = ac;
    return c;
  } catch {
    return ac.destination;
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
    osc.connect(g).connect(output(ac));
    osc.start(ac.currentTime + startAt);
    osc.stop(ac.currentTime + startAt + durS + 0.02);
  } catch {
    /* fail silent */
  }
}

/* ------------------------------------------------------------------ */
/* The level-up sound                                                   */
/* ------------------------------------------------------------------ */
/*
 * Everything above this point is a beep, and a beep is the right size for
 * "you pressed a key". Finishing a level is not that, and the difference has
 * to be audible in the first fifty milliseconds or the reward reads as the
 * same event as a tap.
 *
 * So the level-up is layered, still with no asset files:
 *
 *   · a WHOOSH — filtered noise sweeping up — under the jump, so the flight
 *     has a sound and not just the landing;
 *   · an IMPACT — a bright, very short noise crack — for the landing;
 *   · a FANFARE — a major arpeggio on bell voices — which is the part a child
 *     will hum.
 *
 * It used to have a fourth layer, a low "thump" and a held bass pad under the
 * chord. On a phone that read as a bass hit every time a child got something
 * right, so it is gone; the reward is bright, not heavy.
 */

let noiseBuf: AudioBuffer | null = null;

/** One second of white noise, made once and reused by every whoosh. */
function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ac.sampleRate) return noiseBuf;
  const buf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = buf;
  return buf;
}

/** Filtered noise sweeping between two cutoffs — a jump, or a landing crack. */
function whoosh(
  startAt: number,
  durS: number,
  fromHz: number,
  toHz: number,
  gain: number,
  type: BiquadFilterType = "bandpass",
): void {
  const ac = audioContext();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + startAt;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac);
    const f = ac.createBiquadFilter();
    f.type = type;
    f.Q.value = type === "bandpass" ? 1.1 : 0.7;
    f.frequency.setValueAtTime(fromHz, t0);
    f.frequency.exponentialRampToValueAtTime(toHz, t0 + durS);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + durS * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
    src.connect(f).connect(g).connect(output(ac));
    src.start(t0);
    src.stop(t0 + durS + 0.05);
  } catch {
    /* fail silent */
  }
}

/**
 * A bell: a triangle fundamental plus two quiet, slightly sharp partials.
 * Three cheap oscillators are the least it takes to stop sounding like a test
 * tone, and a struck bell is what says "something just happened" without
 * needing a sample.
 */
function bell(freq: number, startAt: number, durS: number, gain = 0.16): void {
  const ac = audioContext();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + startAt;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
    for (const [mult, level, type] of [
      [1, 1, "triangle"],
      [2.01, 0.34, "sine"],
      [3.02, 0.12, "sine"],
    ] as const) {
      const o = ac.createOscillator();
      o.type = type;
      o.frequency.value = freq * mult;
      const lg = ac.createGain();
      lg.gain.value = level;
      o.connect(lg).connect(g);
      o.start(t0);
      o.stop(t0 + durS + 0.05);
    }
    g.connect(output(ac));
  } catch {
    /* fail silent */
  }
}

export type Sfx =
  | "tap"
  | "correct"
  | "wrong"
  | "letter-lands"
  | "celebrate"
  /** The pencil leaves the pad. Pairs with "level-up". */
  | "hop-launch"
  /** The pencil lands on the next level. The big one. */
  | "level-up";

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
    case "hop-launch":
      // Rising, so it points at the landing that is about to happen.
      whoosh(0, 0.36, 240, 2100, 0.1);
      tone(392, 0, 0.1, 0.06);
      tone(587, 0.07, 0.12, 0.06);
      break;
    case "level-up": {
      // A bright crack for the landing, then the tune: C major, up and over
      // the octave. There is deliberately NO low end any more — the thump
      // (190→46 Hz) and the held pad under the chord read on a phone as a
      // bass hit on every right answer, which is not what a reward should
      // feel like. The bells carry it on their own.
      whoosh(0, 0.14, 5200, 900, 0.16, "highpass");
      const ARP = [523.25, 659.25, 783.99, 1046.5];
      ARP.forEach((f, i) => bell(f, 0.06 + i * 0.075, 0.55 + i * 0.12, 0.17));
      bell(1567.98, 0.36, 1.5, 0.1);
      bell(2093, 0.42, 1.3, 0.055);
      break;
    }
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
/* Recorded voice — preferred over TTS wherever a clip exists           */
/* ------------------------------------------------------------------ */

/*
 * HOW SPEECH PLAYS.
 *
 * Through WebAudio, from decoded buffers, whenever it can. Two things in this
 * app need that rather than an <audio> element:
 *
 *  · Every keypress plays the letter's sound. An element re-pointed at a new
 *    file takes a noticeable moment to start on a phone; a decoded buffer
 *    starts the instant it is asked to, so the sound lands WITH the key.
 *  · A sound-out lights each letter while its sound plays. That needs to know
 *    exactly when playback began, which a buffer source tells us and an
 *    element only approximates.
 *
 * The <audio> element is kept as the fallback for a browser that cannot
 * decode, and the synthesiser stays the fallback for a line nobody has
 * recorded. One voice at a time throughout: anything new cuts off what was
 * playing, and stopSpeech() silences all of it.
 */

/** Decoded clips, by URL. A failed decode is remembered as null. */
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function loadBuffer(url: string): Promise<AudioBuffer | null> {
  const known = buffers.get(url);
  if (known) return known;
  const ac = audioContext();
  const p = (async () => {
    if (!ac) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.arrayBuffer();
      return await new Promise<AudioBuffer | null>((resolve) => {
        // The callback form, because older Safari has no promise form.
        ac.decodeAudioData(data, resolve, () => resolve(null));
      });
    } catch {
      return null;
    }
  })();
  buffers.set(url, p);
  return p;
}

let speechBus: GainNode | null = null;
function speechOut(ac: AudioContext): AudioNode {
  if (speechBus && speechBus.context === ac) return speechBus;
  try {
    speechBus = ac.createGain();
    speechBus.gain.value = 1;
    speechBus.connect(ac.destination);
    return speechBus;
  } catch {
    return ac.destination;
  }
}

/** One element for the fallback path, created lazily and only in the browser. */
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
 * WHOSE TURN IT IS TO SPEAK.
 *
 * Every request to speak takes a ticket, and stopSpeech() takes one too. A
 * clip or a sequence that finds the ticket has moved on stops itself, so
 * audio never outlives the screen that asked for it — and a manifest or a
 * buffer that arrives late cannot start a line the child has already left.
 */
let speechTicket = 0;

/** What is sounding right now, so the next thing can cut it off. */
let stopCurrent: (() => void) | null = null;

function silenceCurrent(): void {
  const stop = stopCurrent;
  stopCurrent = null;
  try {
    stop?.();
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

/**
 * Silence everything immediately: the recorded clip, the synthesiser, any
 * sequence in progress, and any playback still waiting on a download.
 */
export function stopSpeech(): void {
  speechTicket += 1;
  silenceCurrent();
}

type PlayOutcome = "ended" | "stopped" | "failed";

/**
 * Play one recorded clip and resolve when it is over. `onStart` fires the
 * moment sound actually begins — after any download — with the time in
 * performance.now() terms, which is what a highlight follows.
 */
async function playUrl(
  url: string,
  ticket: number,
  onStart?: (at: number) => void,
): Promise<PlayOutcome> {
  const ac = audioContext();
  if (ac) {
    const buf = await loadBuffer(url);
    if (ticket !== speechTicket) return "stopped";
    if (buf) {
      return new Promise<PlayOutcome>((resolve) => {
        let settled = false;
        const settle = (o: PlayOutcome) => {
          if (settled) return;
          settled = true;
          resolve(o);
        };
        try {
          silenceCurrent();
          const src = ac.createBufferSource();
          src.buffer = buf;
          src.connect(speechOut(ac));
          src.onended = () => {
            if (stopCurrent === stop) stopCurrent = null;
            settle("ended");
          };
          const stop = () => {
            try {
              src.onended = null;
              src.stop();
            } catch {
              /* already stopped */
            }
            settle("stopped");
          };
          stopCurrent = stop;
          src.start();
          onStart?.(performance.now());
        } catch {
          settle("failed");
        }
      });
    }
  }

  // Fallback: the <audio> element.
  const el = clipElement();
  if (!el) return "failed";
  return new Promise<PlayOutcome>((resolve) => {
    let settled = false;
    const settle = (o: PlayOutcome) => {
      if (settled) return;
      settled = true;
      el.onended = null;
      el.onerror = null;
      el.onplaying = null;
      resolve(o);
    };
    try {
      silenceCurrent();
      el.pause();
      el.src = url;
      el.currentTime = 0;
      el.onplaying = () => onStart?.(performance.now());
      el.onended = () => settle("ended");
      el.onerror = () => settle("failed");
      stopCurrent = () => {
        try {
          el.pause();
          el.removeAttribute("src");
          el.load();
        } catch {
          /* fail silent */
        }
        settle("stopped");
      };
      const p = el.play();
      if (p && typeof p.catch === "function") p.catch(() => settle("failed"));
    } catch {
      settle("failed");
    }
  });
}

/** Speak an English string and resolve when the synthesiser is done. */
function speakEnAndWait(text: string, rate: number, ticket: number): Promise<PlayOutcome> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !enVoice()) {
      resolve("failed");
      return;
    }
    try {
      const v = enVoice()!;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.voice = v;
      u.lang = v.lang;
      u.rate = rate;
      u.pitch = 1.05;
      // Some engines never fire onend; never let a sequence hang on one.
      const guard = window.setTimeout(() => resolve("ended"), 1200 + text.length * 160);
      u.onend = () => {
        window.clearTimeout(guard);
        resolve(ticket === speechTicket ? "ended" : "stopped");
      };
      u.onerror = () => {
        window.clearTimeout(guard);
        resolve("failed");
      };
      window.speechSynthesis.speak(u);
    } catch {
      resolve("failed");
    }
  });
}

type Fallback = { text: string; rate?: number } | null | undefined;

/** The recorded clip if there is one, else the synthesiser, else nothing. */
async function speakOne(
  lineId: string,
  fallback: Fallback,
  ticket: number,
  onStart?: (at: number) => void,
): Promise<PlayOutcome> {
  // THE RACE THAT MATTERS: a screen can ask to speak before the list of
  // recorded lines has arrived. Answering "not recorded" then would give the
  // child the robot voice for a line that has a human one, so wait for it.
  if (!voiceManifestReady()) await loadVoiceManifest();
  if (ticket !== speechTicket) return "stopped";
  const url = voiceUrl(lineId);
  if (url) {
    const o = await playUrl(url, ticket, onStart);
    if (o !== "failed") return o;
  }
  if (ticket !== speechTicket) return "stopped";
  if (!fallback || muted) return "failed";
  onStart?.(performance.now());
  return speakEnAndWait(fallback.text, fallback.rate ?? 0.75, ticket);
}

/** Fire and forget: say this line now, cutting off whatever was speaking. */
export function playLine(lineId: string, fallback?: Fallback): void {
  if (muted) return;
  const ticket = ++speechTicket;
  silenceCurrent();
  void speakOne(lineId, fallback, ticket);
}

/** Say this line and resolve true when it has been heard to the end. */
export async function speakLine(
  lineId: string,
  opts: { fallback?: Fallback; onStart?: (at: number) => void } = {},
): Promise<boolean> {
  if (muted) return false;
  const ticket = ++speechTicket;
  silenceCurrent();
  return (await speakOne(lineId, opts.fallback, ticket, opts.onStart)) === "ended";
}

export interface SequenceStep {
  lineId: string;
  fallback?: Fallback;
  /** Silence before this step, in ms. */
  pauseMs?: number;
  /** Fires when this step's sound actually starts. */
  onStart?: () => void;
  /** Fires when this step's sound has finished. */
  onEnd?: () => void;
}

/**
 * Several lines, one after the other, as ONE thing to say: a single ticket,
 * so stopSpeech() (or anything else starting to speak) ends the whole run.
 * Resolves true only if every step was heard.
 */
export async function playSequence(steps: readonly SequenceStep[]): Promise<boolean> {
  if (muted) return false;
  // No silencing up front: a sequence that opens with a pause lets whatever
  // is sounding (the last letter typed) finish first. Each clip cuts off the
  // one before it as it starts, and stopSpeech() still ends the whole run.
  const ticket = ++speechTicket;
  for (const step of steps) {
    if (step.pauseMs) await new Promise((r) => setTimeout(r, step.pauseMs));
    if (ticket !== speechTicket) return false;
    const o = await speakOne(step.lineId, step.fallback, ticket, () => step.onStart?.());
    step.onEnd?.();
    if (o === "stopped" || ticket !== speechTicket) return false;
  }
  return true;
}

/** The time marks a generated clip carries, if this line is recorded with them. */
export function lineMarks(lineId: string): readonly [number, number][] | null {
  return voiceManifestSnapshot()[lineId]?.marks ?? null;
}

/** True when a human/generated recording exists for this line. */
export function isRecorded(lineId: string): boolean {
  return voiceUrl(lineId) !== null;
}

/**
 * Play a clip that carries time marks, and say which mark is sounding:
 * `onMark(i)` as piece i starts, `onMark(-1)` in each gap and at the end.
 * Resolves true when heard to the end. Without marks it simply plays.
 */
export async function followLine(
  lineId: string,
  onMark: (index: number) => void,
): Promise<boolean> {
  if (muted) return false;
  const ticket = ++speechTicket;
  silenceCurrent();
  if (!voiceManifestReady()) await loadVoiceManifest();
  const marks = lineMarks(lineId) ?? [];
  const timers: number[] = [];
  const o = await speakOne(lineId, null, ticket, (at) => {
    const lag = performance.now() - at;
    marks.forEach(([start, end], i) => {
      timers.push(window.setTimeout(() => ticket === speechTicket && onMark(i), Math.max(0, start - lag)));
      timers.push(window.setTimeout(() => ticket === speechTicket && onMark(-1), Math.max(0, end - lag)));
    });
  });
  if (o !== "ended") timers.forEach((t) => window.clearTimeout(t));
  return o === "ended";
}

/**
 * Fetch and decode clips before they are needed, so the first keypress of a
 * lesson sounds as fast as the hundredth. Idempotent, fail-silent.
 */
export function preloadLines(ids: readonly string[]): void {
  if (typeof window === "undefined") return;
  void loadVoiceManifest().then(() => {
    for (const id of ids) {
      const url = voiceUrl(id);
      if (url) void loadBuffer(url);
    }
  });
}

/** The letter's NAME ("bee"), recorded if possible. */
export function sayLetterName(letter: string, rate = 0.7): void {
  const d = getLetter(letter);
  playLine(letterNameLineId(letter), {
    text: d?.nameEn ?? letter.toUpperCase(),
    rate,
  });
}

/** The letter's SOUND — the phoneme it teaches ("sss" for S). */
export function sayLetterSound(letter: string, rate = 0.6): void {
  const d = getLetter(letter);
  playLine(letterSoundLineId(letter), {
    text: d?.soundSpeak ?? letter.toLowerCase(),
    rate,
  });
}

/** One sound — what a keypress plays inside a word. */
export function sayPhoneme(ph: PhonemeId): void {
  playLine(phonemeLineId(ph), { text: PHONEMES[ph].as, rate: 0.6 });
}

/** An English word, recorded if possible. */
export function sayWord(word: string, rate = 0.7): void {
  playLine(wordLineId(word), { text: word.toLowerCase(), rate });
}

/** A whole English sentence. */
export function saySentence(sentence: string, rate = 0.65): void {
  playLine(sentenceLineId(sentence), { text: sentence.toLowerCase(), rate });
}

/** A say-key as something speakable, or null for an sfx or an unknown key. */
function lineForKey(key: string): { lineId: string; fallback: Fallback } | null {
  const i = key.indexOf(":");
  if (i <= 0) return null;
  const kind = key.slice(0, i);
  const value = key.slice(i + 1);
  switch (kind) {
    case "letter-name":
      return { lineId: letterNameLineId(value), fallback: { text: getLetter(value)?.nameEn ?? value, rate: 0.7 } };
    case "letter-sound":
      return /^[A-Za-z]$/.test(value)
        ? { lineId: letterSoundLineId(value), fallback: { text: getLetter(value)?.soundSpeak ?? value, rate: 0.6 } }
        : null;
    case "word":
      return { lineId: wordLineId(value), fallback: { text: value.toLowerCase(), rate: 0.7 } };
    case "sentence":
      return { lineId: sentenceLineId(value), fallback: { text: value.toLowerCase(), rate: 0.65 } };
    default:
      return null;
  }
}

/**
 * EVERYTHING A TUTORIAL CARD SHOULD SAY, in the right order.
 *
 * A card can have a recorded Hebrew narration and a cue of its own
 * (`step.say`). An `sfx:` cue plays alongside, on its own channel. A spoken
 * cue waits for the narration to finish — firing both at once used to cut the
 * narration off a word in — and plays on its own when the card has no
 * narration recorded.
 */
export function sayCard(stepId: string, sayKey?: string): void {
  if (muted) return;
  if (sayKey?.startsWith("sfx:")) playSfx(sayKey.slice(4) as Sfx);
  const cue = sayKey && !sayKey.startsWith("sfx:") ? lineForKey(sayKey) : null;
  const ticket = ++speechTicket;
  silenceCurrent();
  void (async () => {
    if (!voiceManifestReady()) await loadVoiceManifest();
    if (ticket !== speechTicket) return;
    const narration = narrationLineId(stepId);
    if (voiceUrl(narration)) {
      const o = await speakOne(narration, null, ticket);
      if (o !== "ended" || !cue) return;
    }
    if (cue) await speakOne(cue.lineId, cue.fallback, ticket);
  })();
}

/**
 * A Hebrew narration line. No fallback on purpose: a robotic Hebrew voice is
 * worse than the text that is always on screen.
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
 *   "sentence:I SEE A CAT" → speak the whole sentence
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
    case "sentence":
      saySentence(value);
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
  try {
    // iOS mutes WebAudio when the ring switch is off unless the page asks to
    // be treated as media playback — and a lesson's voice is exactly that.
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = "playback";
  } catch {
    /* older browsers: nothing to do */
  }
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
