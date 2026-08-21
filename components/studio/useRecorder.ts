"use client";

/**
 * THE MICROPHONE — one hook, because recording on a phone has exactly three
 * ways to go wrong and all of them are worth handling explicitly:
 *
 *  1. PERMISSION. Denied, or dismissed, or granted-then-revoked in settings.
 *     Each produces a different DOMException name and a different Hebrew
 *     sentence, because "something went wrong" is useless to someone holding
 *     a phone in a quiet room.
 *  2. FORMAT. Chrome records webm/opus; Safari (which is every iPhone)
 *     records mp4/aac and will throw on a webm mimeType instead of ignoring
 *     it. So the type is probed, never assumed.
 *  3. THE STREAM. Opening it per take costs a visible delay and re-arms the
 *     permission chip, so the stream is opened once and kept until the page
 *     is left. `release()` exists for that, and unmount calls it.
 *
 * The level meter is not decoration: the single most common recording failure
 * is a mic that is live but muted at the OS, and the only way to notice is to
 * see the bar stay flat.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface Take {
  blob: Blob;
  /** Object URL for immediate playback. Revoked when the next take replaces it. */
  url: string;
  durationMs: number;
  type: string;
}

export type RecorderState = "idle" | "arming" | "recording";

/** A voice line is a word or a sentence. Anything longer is a stuck button. */
export const MAX_TAKE_MS = 15_000;

const PREFERRED_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const type of PREFERRED_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* older Safari throws instead of returning false */
    }
  }
  return undefined;
}

function messageFor(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "אין הרשאה למיקרופון. פתחו את הגדרות הדפדפן לאתר הזה ואפשרו מיקרופון.";
    case "NotFoundError":
      return "לא נמצא מיקרופון במכשיר הזה.";
    case "NotReadableError":
      return "המיקרופון תפוס על ידי אפליקציה אחרת. סגרו אותה ונסו שוב.";
    default:
      return "לא הצלחנו להפעיל את המיקרופון. נסו לרענן את הדף.";
  }
}

export interface RecorderApi {
  state: RecorderState;
  /** 0..1, smoothed. Flat while recording means a muted mic. */
  level: number;
  error: string | null;
  supported: boolean;
  start: () => Promise<void>;
  /** Resolves with the take, or null if it was too short to be a recording. */
  stop: () => Promise<Take | null>;
  cancel: () => void;
  release: () => void;
}

export function useRecorder(): RecorderApi {
  const [state, setState] = useState<RecorderState>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const stopTimerRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const cancelledRef = useRef(false);
  const lastUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof MediaRecorder !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia),
    );
  }, []);

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    setLevel(0);
  }, []);

  const startMeter = useCallback((stream: MediaStream) => {
    try {
      if (!audioCtxRef.current) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        audioCtxRef.current = new Ctor();
      }
      const ac = audioCtxRef.current;
      if (ac.state === "suspended") void ac.resume();
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      let smoothed = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          peak = Math.max(peak, Math.abs((data[i]! - 128) / 128));
        }
        smoothed = Math.max(peak, smoothed * 0.85);
        setLevel(Math.min(1, smoothed));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* the meter is a nicety; recording continues without it */
    }
  }, []);

  const getStream = useCallback(async (): Promise<MediaStream> => {
    const existing = streamRef.current;
    if (existing && existing.getAudioTracks().some((t) => t.readyState === "live")) {
      return existing;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    streamRef.current = stream;
    return stream;
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    setError(null);
    setState("arming");
    try {
      const stream = await getStream();
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      cancelledRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorderRef.current = rec;
      rec.start();
      startedAtRef.current = Date.now();
      startMeter(stream);
      setState("recording");
      // A button that never gets released (a pocket, a dropped phone) must
      // not produce a 40MB upload.
      stopTimerRef.current = window.setTimeout(() => {
        try {
          recorderRef.current?.stop();
        } catch {
          /* already stopped */
        }
      }, MAX_TAKE_MS);
    } catch (err) {
      setState("idle");
      setError(messageFor(err));
    }
  }, [state, getStream, startMeter]);

  const stop = useCallback((): Promise<Take | null> => {
    const rec = recorderRef.current;
    if (!rec || state !== "recording") return Promise.resolve(null);
    return new Promise<Take | null>((resolve) => {
      const finish = () => {
        if (stopTimerRef.current) {
          clearTimeout(stopTimerRef.current);
          stopTimerRef.current = null;
        }
        stopMeter();
        setState("idle");
        recorderRef.current = null;
        if (cancelledRef.current) {
          chunksRef.current = [];
          resolve(null);
          return;
        }
        // MediaRecorder.mimeType is the authority, but some Android builds
        // leave it empty and only tag the chunks.
        const first = chunksRef.current[0];
        const type =
          rec.mimeType ||
          (first instanceof Blob ? first.type : "") ||
          "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        const durationMs = Date.now() - startedAtRef.current;
        // Under a fifth of a second is a mis-tap, not a take.
        if (blob.size < 512 || durationMs < 200) {
          resolve(null);
          return;
        }
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        const url = URL.createObjectURL(blob);
        lastUrlRef.current = url;
        resolve({ blob, url, durationMs, type: blob.type || "audio/webm" });
      };
      rec.onstop = finish;
      try {
        rec.stop();
      } catch {
        finish();
      }
    });
  }, [state, stopMeter]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    try {
      recorderRef.current?.stop();
    } catch {
      /* nothing to stop */
    }
  }, []);

  const release = useCallback(() => {
    cancel();
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    if (lastUrlRef.current) {
      URL.revokeObjectURL(lastUrlRef.current);
      lastUrlRef.current = null;
    }
  }, [cancel, stopMeter]);

  useEffect(() => release, [release]);

  return { state, level, error, supported, start, stop, cancel, release };
}
