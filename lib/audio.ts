/**
 * AUDIO — resolves the `say` key on a Step, plus UI sound.
 *
 * Two independent channels, both optional, both fail-silent:
 *
 *  1. UI sound (correct / wrong / celebrate) is synthesised with WebAudio.
 *     No asset files, no network, no licensing, works offline.
 *  2. Speech (a letter's NAME, its SOUND, a word, or a line of Hebrew
 *     narration) has three voices, and always uses the best one available
 *     for the line in hand:
 *       a. a RECORDED HUMAN VOICE, when one exists — see lib/voice/ for the
 *          catalogue and /studio for how recordings get made;
 *       b. a SYNTHESISED voice for lines nobody has recorded yet, generated
 *          once through the AI Gateway and cached — see lib/voice/synth.ts.
 *          This is also the only voice Hebrew narration has ever had;
 *       c. the browser's SpeechSynthesis en-US voice, and if the device has
 *          no English voice either, silence.
 *     Every step below (a) is a degradation, and every one of them is safe
 *     because each step also carries its instruction as Hebrew text, per
 *     design rule 3, so audio is never the only channel.
 *
 * NOTE: this is *output* speech only. Conversation mode is text-only and
 * never touches the microphone.
 */

import {
  letterNameLineId,
  letterSoundLineId,
  narrationLineId,
  sentenceLineId,
  wordLineId,
} from "@/lib/voice/lines";
import {
  loadVoiceManifest,
  noteSynthFailure,
  noteSynthSuccess,
  synthUrl,
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

/**
 * THE OUTPUT BUS. Everything synthesised goes through one compressor rather
 * than straight at the speakers: the level-up score stacks a brass section, a
 * cymbal, two timpani and a bell over the same half second, and that many
 * envelopes peaking together on a phone speaker is a crackle, not a fanfare.
 * Made lazily with the context, and rebuilt if the context is.
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
 * "you pressed a key". Finishing something is not that, and the difference has
 * to be audible in the first fifty milliseconds or the reward reads as the
 * same event as a tap.
 *
 * THERE ARE FOUR SIZES OF REWARD IN THIS APP, and they must sound like four
 * different sizes or the biggest one is worth nothing:
 *
 *   1. `tap` and `letter-lands` — a key was pressed, a letter landed in a
 *      slot. Beeps, and that is the correct size for them.
 *   2. `correct` — A QUESTION ANSWERED RIGHT. This is the one a child hears
 *      most, and it used to be two tones, which is the size of a beep for the
 *      thing the whole lesson is made of. It now plays `fanfare()`, on a
 *      short tail so consecutive right answers do not pile up.
 *   3. `celebrate` — a whole word or sentence built. The same fanfare with
 *      its full tail, because the payoff step has earned the ring-out.
 *   4. `lesson-clear` and `level-up` — THE LEVEL IS BEATEN: the stars screen,
 *      and the pencil landing on the next pad. Both play `score()`, which is
 *      a piece of music with a brass section in it, and nothing smaller is
 *      allowed to sound like it.
 *
 * The layers below are the vocabulary all three are written in, and still with
 * no asset files:
 *
 *   · a WHOOSH — filtered noise sweeping up — under the jump, so the flight
 *     has a sound and not just the landing;
 *   · a THUMP — a sine dropped fast through its own pitch — which is the part
 *     you feel rather than hear, and the reason the landing has weight;
 *   · a CRASH — a cymbal: bright noise with a long tail, the thing that makes
 *     an orchestra sound like an orchestra and not like a keyboard;
 *   · a TIMPANI — a tuned drum, which is how a fanfare gets a floor;
 *   · a BRASS voice — detuned saws under a filter envelope, i.e. a trumpet;
 *   · a BELL and a SWELL — the sparkle over the top and the pad underneath.
 *
 * They are stacked with real envelopes (fast attack, exponential decay) and a
 * shared compressor on the way out, so a dozen layers at once cannot crackle.
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

/** The weight of a landing: a sine dropped fast through its own pitch. */
function thump(startAt: number, gain = 0.5): void {
  const ac = audioContext();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + startAt;
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(190, t0);
    osc.frequency.exponentialRampToValueAtTime(46, t0 + 0.17);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
    osc.connect(g).connect(output(ac));
    osc.start(t0);
    osc.stop(t0 + 0.46);
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

/** A held, quiet pad under the arpeggio, so the fanfare has a floor. */
function swell(freq: number, startAt: number, durS: number, gain = 0.07): void {
  const ac = audioContext();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + startAt;
    const o = ac.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(500, t0);
    f.frequency.linearRampToValueAtTime(1900, t0 + durS * 0.5);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
    o.connect(f).connect(g).connect(output(ac));
    o.start(t0);
    o.stop(t0 + durS + 0.05);
  } catch {
    /* fail silent */
  }
}

/* ------------------------------------------------------------------ */
/* The orchestra                                                        */
/* ------------------------------------------------------------------ */
/*
 * Three more voices, and they exist for one reason: `level-up` is now a piece
 * of music rather than a sound effect, and music needs a section, a drum and a
 * cymbal. Bells alone always read as "notification"; a trumpet never does.
 */

/**
 * A CYMBAL CRASH. Noise, opened up bright and left to ring.
 *
 * It is the one layer with a tail longer than the note that caused it, which
 * is exactly what makes a hit sound like it happened in a room. The noise
 * buffer is a single second, so anything longer has to loop it — otherwise the
 * crash stops dead halfway through its own decay.
 */
function crash(startAt: number, gain = 0.15, durS = 1.6): void {
  const ac = audioContext();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + startAt;
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac);
    src.loop = true;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(2600, t0);
    // Sweeping the corner UP as it decays is what turns a hiss into a cymbal:
    // the low end of a crash dies long before the shimmer does.
    hp.frequency.exponentialRampToValueAtTime(7200, t0 + durS);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
    src.connect(hp).connect(g).connect(output(ac));
    src.start(t0);
    src.stop(t0 + durS + 0.05);
  } catch {
    /* fail silent */
  }
}

/**
 * A TIMPANI. A tuned drum: a sine that falls a fourth in the first sixty
 * milliseconds, with a scrap of filtered noise on the front for the mallet.
 *
 * `thump` is the untuned version of this and is still the right thing for an
 * impact. This one carries a pitch, so it can sit in the chord.
 */
function timpani(freq: number, startAt: number, gain = 0.34): void {
  const ac = audioContext();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + startAt;
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * 1.35, t0);
    osc.frequency.exponentialRampToValueAtTime(freq, t0 + 0.06);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85);
    osc.connect(g).connect(output(ac));
    osc.start(t0);
    osc.stop(t0 + 0.9);

    // The mallet. Without it the drum has no edge and reads as a bass note.
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac);
    const lp = ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900;
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.0001, t0);
    ng.gain.exponentialRampToValueAtTime(gain * 0.5, t0 + 0.005);
    ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
    src.connect(lp).connect(ng).connect(output(ac));
    src.start(t0);
    src.stop(t0 + 0.1);
  } catch {
    /* fail silent */
  }
}

/**
 * A TRUMPET.
 *
 * Three things make a sawtooth sound like brass rather than like a synthesiser,
 * and all three are here because leaving any one out is audible:
 *
 *  · THE FILTER ENVELOPE. A horn gets brighter the harder it is blown, so the
 *    cutoff opens with the attack and closes again as the note dies. This is
 *    the single biggest difference between "brass" and "buzz".
 *  · THE SCOOP. A player arrives at the pitch from just underneath it. Forty
 *    milliseconds of it, and the note stops sounding quantised.
 *  · THE SECTION. Three oscillators a few cents apart, because one trumpet is
 *    a solo and a fanfare is a section.
 *
 * Vibrato is added on top and fades IN, so short calls are straight and only
 * held notes wobble — which is what a player actually does.
 */
function brass(freq: number, startAt: number, durS: number, gain = 0.13): void {
  const ac = audioContext();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + startAt;

    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.03);
    g.gain.setValueAtTime(gain, t0 + Math.max(0.05, durS * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);

    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 2.5;
    f.frequency.setValueAtTime(Math.min(700, freq * 1.4), t0);
    f.frequency.exponentialRampToValueAtTime(Math.min(9000, freq * 6.5), t0 + 0.06);
    f.frequency.exponentialRampToValueAtTime(Math.max(600, freq * 2), t0 + durS);
    f.connect(g).connect(output(ac));

    const lfo = ac.createOscillator();
    lfo.frequency.value = 5.4;
    const depth = ac.createGain();
    depth.gain.setValueAtTime(0, t0);
    depth.gain.linearRampToValueAtTime(freq * 0.006, t0 + durS * 0.75);
    lfo.connect(depth);
    lfo.start(t0);
    lfo.stop(t0 + durS + 0.05);

    for (const cents of [-7, 0, 6]) {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.detune.value = cents;
      o.frequency.setValueAtTime(freq * 0.975, t0);
      o.frequency.exponentialRampToValueAtTime(freq, t0 + 0.04);
      // Summed with the automation above rather than replacing it, which is
      // why the scoop and the vibrato can both exist on the same param.
      depth.connect(o.frequency);
      const og = ac.createGain();
      og.gain.value = 1 / 3;
      o.connect(og).connect(f);
      o.start(t0);
      o.stop(t0 + durS + 0.05);
    }
  } catch {
    /* fail silent */
  }
}

/* ------------------------------------------------------------------ */
/* The two rewards, written once                                        */
/* ------------------------------------------------------------------ */
/*
 * Both of these used to be spelled out inline in `playSfx`, which made them
 * look like properties of the events that happened to play them. They are not:
 * they are the app's two reward sounds, and WHICH EVENT GETS WHICH is a
 * product decision that has already moved once. Keeping them as named pieces
 * is what makes moving them a one-line change instead of a transplant.
 */

/**
 * THE FANFARE — weight, a crack, and a major arpeggio on bells.
 *
 * `tail` scales how long it rings out. A right answer is followed by the next
 * question about half a second later, so its fanfare is cut short; a finished
 * word has a hero animation to ring under, so it gets the whole thing.
 */
function fanfare(tail = 1): void {
  thump(0, 0.42 * tail + 0.13);
  whoosh(0, 0.14, 5200, 900, 0.16, "highpass");
  // A riser under the arpeggio, pointing at whatever is about to appear.
  whoosh(0.04, 0.5 * tail, 320, 3600, 0.07);
  // C major, up and over the octave, with the fifth held underneath so the
  // last note lands on a chord and not on a beep.
  const ARP = [523.25, 659.25, 783.99, 1046.5];
  ARP.forEach((f, i) => bell(f, 0.06 + i * 0.075, (0.55 + i * 0.12) * tail, 0.17));
  bell(1567.98, 0.36, 1.5 * tail, 0.1);
  bell(2093, 0.42, 1.3 * tail, 0.055);
  swell(261.63, 0.05, 1.25 * tail, 0.06);
  swell(392, 0.05, 1.25 * tail, 0.045);
}

/**
 * THE SCORE. Beating a level is the largest thing that happens in this app and
 * it happens perhaps fifty times in the whole track, so it is written out as
 * music — in C major, in five beats, with an actual brass section — rather
 * than assembled out of effects.
 *
 * Times are seconds from the downbeat. On the road that downbeat is the frame
 * the pencil hits the pad, and the piece runs a little past the end of the
 * cinematic on purpose: the tail is what the child hears while the camera
 * glides on to the level they just opened.
 */
function score(): void {
  // 1. THE IMPACT. The landing, and the orchestra hitting with it.
  thump(0, 0.5);
  crash(0, 0.15, 1.7);
  timpani(65.41, 0, 0.38); // C2
  timpani(98.0, 0.2, 0.24); // G2

  // 2. THE CALL. Three notes straight up the triad — the part a child will be
  //    humming on the way to the next level.
  brass(392.0, 0.0, 0.17, 0.12); // G4
  brass(523.25, 0.15, 0.17, 0.13); // C5
  brass(659.25, 0.3, 0.17, 0.14); // E5

  // 3. THE ANSWER. The top note held, with the section arriving under it.
  brass(783.99, 0.45, 0.6, 0.15); // G5, the melody
  brass(523.25, 0.45, 0.6, 0.075); // C5
  brass(659.25, 0.45, 0.6, 0.06); // E5
  swell(130.81, 0.45, 1.05, 0.05); // C3, the floor
  timpani(98.0, 0.72, 0.18);

  // 4. THE RUN. G, A, B — a ladder, so the last chord is arrived at and not
  //    merely played.
  brass(783.99, 1.06, 0.12, 0.12);
  brass(880.0, 1.18, 0.12, 0.12);
  brass(987.77, 1.3, 0.12, 0.13);

  // 5. THE CHORD. Everything at once, then bells over the top of it.
  brass(1046.5, 1.42, 1.25, 0.14); // C6
  brass(783.99, 1.42, 1.25, 0.07);
  brass(659.25, 1.42, 1.25, 0.055);
  brass(523.25, 1.42, 1.25, 0.06);
  timpani(65.41, 1.42, 0.36);
  timpani(65.41, 1.63, 0.2);
  crash(1.42, 0.13, 2.0);
  swell(130.81, 1.42, 1.5, 0.055);
  swell(196.0, 1.42, 1.5, 0.04);
  bell(2093.0, 1.5, 1.3, 0.07);
  bell(3135.96, 1.62, 1.1, 0.038);
}

export type Sfx =
  | "tap"
  | "correct"
  | "wrong"
  | "letter-lands"
  /** A word or a sentence finished inside a lesson. The fanfare, rung out. */
  | "celebrate"
  /** The lesson is beaten and the stars are up. The score. */
  | "lesson-clear"
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
      // EVERY QUESTION ANSWERED RIGHT. The most-heard sound in the app, and
      // the one worth spending the most on: the next question is ~650ms away,
      // so the fanfare is cut short rather than made smaller.
      fanfare(0.55);
      break;
    case "wrong":
      // Deliberately soft and low, not a buzzer. A 7-year-old should hear
      // "try again", not "you failed".
      tone(311, 0, 0.14, 0.07);
      break;
    case "celebrate":
      // A whole word or sentence built. Same sound as a right answer, allowed
      // to ring out under the hero animation that follows it.
      fanfare();
      break;
    case "hop-launch":
      // Rising, so it points at the landing that is about to happen.
      whoosh(0, 0.36, 240, 2100, 0.1);
      tone(392, 0, 0.1, 0.06);
      tone(587, 0.07, 0.12, 0.06);
      break;
    case "lesson-clear":
      // The stars screen. Beating a level and watching the pencil arrive are
      // the same achievement staged twice, so they get the same music.
      score();
      break;
    case "level-up":
      score();
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

  // THE THREE VOICES, in the only order that is ever right: a person, then a
  // speech model, then the browser. `synthUrl` returns null the moment the
  // middle one is unavailable or has stopped answering, so an app with no
  // gateway credential behaves exactly as it did before it existed.
  const recorded = voiceUrl(lineId);
  const synthesised = recorded ? null : synthUrl(lineId);
  const url = recorded ?? synthesised;
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
    const failed = () => {
      if (ticket !== speechTicket) return;
      // A synthesised line that will not load is a fact about the deployment,
      // not about this line: no credit, no credential, a model that has
      // stopped serving. Counting it is what eventually retires the tier
      // instead of paying for the same discovery 180 times.
      if (synthesised) noteSynthFailure();
      speakFallback();
    };
    // A 404 (clip deleted between manifest load and playback, or a generation
    // the gateway refused) or a codec the device cannot decode both land
    // here — the next voice down covers the gap.
    el.onerror = failed;
    el.onplaying = synthesised ? () => noteSynthSuccess() : null;
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
 * A whole English sentence.
 *
 * Nothing in the sentence phase is recorded yet, so today this is the browser
 * voice every time — slower than a word, because a synthesiser running a
 * sentence at conversational speed is the least intelligible thing it does.
 * The moment somebody records the line in /studio the same call plays a human
 * instead, with no change here. See lib/voice/lines.ts → sentenceLines.
 */
export function saySentence(sentence: string, rate = 0.65): void {
  playLine(sentenceLineId(sentence), { text: sentence.toLowerCase(), rate });
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

  // "Does this card speak?" now has two ways to be true — a recording, or a
  // line the speech model will read. Only when neither is available does the
  // cue take the card's place, which is the pre-recording behaviour.
  const narrationId = narrationLineId(stepId);
  if (!voiceUrl(narrationId) && !synthUrl(narrationId)) {
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
