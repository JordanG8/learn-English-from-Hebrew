"use client";

/**
 * WHAT THE BROWSER RECORDS IS NOT WHAT THE MODEL CAN READ.
 *
 * This module exists because of one measured fact, and it is worth writing
 * down precisely, because the obvious guess about it is wrong:
 *
 *   fish-audio/transcribe-1 rejects `audio/webm` with
 *   "the audio could not be decoded (format not recognised)".
 *   It accepts `audio/wav`, `audio/ogg` and `audio/mpeg`.
 *
 * The rejected thing is the WEBM CONTAINER, not the Opus codec inside it —
 * the same Opus stream in an Ogg container transcribes fine. And WebM is
 * exactly what Chrome and Android's MediaRecorder produce, which is most of
 * the children this app is for. So without this file, /speak works on an
 * iPhone (mp4/aac, which the model does read) and fails on every school
 * Chromebook, with an error that says nothing about why.
 *
 * The fix has to happen in the browser, because the browser is the only place
 * that can decode what the browser recorded: `decodeAudioData` handles
 * WebM/Opus on Chrome and MP4/AAC on Safari natively, using the same codecs
 * the device already ships for playback. From there, PCM to WAV is a 44-byte
 * header and a copy.
 *
 * THE THREE CHOICES IN HERE, and why:
 *
 *  · MONO. A voice line is one person one metre from one microphone. The
 *    recorder already asks for a single channel; this downmixes anyway,
 *    because a browser is allowed to ignore that constraint.
 *  · 16 kHz. Speech models are trained at 16 kHz and downsample to it
 *    anyway. Sending 48 kHz means three times the bytes to say the same
 *    thing, base64'd, from a phone on school wifi.
 *  · RESAMPLED IN PLAIN JS, not with an OfflineAudioContext. The Web Audio
 *    way is shorter, but constructing one at an arbitrary sample rate is the
 *    kind of thing Safari has historically refused, and a four-second mono
 *    clip is a few thousand multiply-adds. Not worth a device-specific bug.
 *
 * Fail-open: if anything here throws, the caller sends the original blob and
 * lets the server decide. A format the model happens to accept still works;
 * one it does not produces the same friendly "we could not hear that" the
 * child would have seen anyway.
 */

/** What speech models want, and what the transcription model will accept. */
const TARGET_RATE = 16_000;

/** Downmix to one channel. A quiet average beats a clipped sum. */
function toMono(buffer: AudioBuffer): Float32Array {
  const channels = buffer.numberOfChannels;
  if (channels === 1) return buffer.getChannelData(0).slice();
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += data[i]! / channels;
  }
  return out;
}

/**
 * Linear interpolation between neighbours. Not a windowed-sinc filter and not
 * trying to be: the destination is a speech recogniser, the source is a phone
 * microphone in a classroom, and the aliasing this admits is well below the
 * noise already in the room.
 */
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.max(1, Math.floor(input.length / ratio)));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const low = Math.floor(pos);
    const high = Math.min(low + 1, input.length - 1);
    const t = pos - low;
    out[i] = input[low]! * (1 - t) + input[high]! * t;
  }
  return out;
}

/** 16-bit little-endian PCM in a canonical 44-byte RIFF header. */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);

  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling: a sample above 1 wraps to full-scale negative
    // otherwise, which is an audible click exactly where the child shouted.
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([bytes], { type: "audio/wav" });
}

/**
 * Whatever the browser recorded → 16 kHz mono WAV, or null if this device
 * cannot decode its own recording (which should not happen, and is survivable
 * if it does).
 */
export async function toWav(blob: Blob): Promise<Blob | null> {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;

    const ctx = new Ctor();
    try {
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      const mono = toMono(decoded);
      const resampled = resample(mono, decoded.sampleRate, TARGET_RATE);
      return encodeWav(resampled, TARGET_RATE);
    } finally {
      // A context per take would eventually hit the per-page limit, and this
      // one has nothing left to do the moment the samples are copied out.
      void ctx.close().catch(() => undefined);
    }
  } catch {
    return null;
  }
}
