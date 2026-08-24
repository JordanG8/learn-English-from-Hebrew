"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { gateway } from "@ai-sdk/gateway";
import { experimental_useRealtime as useRealtime } from "@ai-sdk/react";
import type { Experimental_RealtimeSessionConfig } from "ai";
import { sayNarration, stopSpeech } from "@/lib/audio";
import type { LetterGroveCutsceneBeat } from "@/lib/letter-grove-cutscene";
import {
  LETTER_GROVE_REALTIME_INSTRUCTIONS,
  LETTER_GROVE_REALTIME_MODEL,
  LETTER_GROVE_REALTIME_VOICE,
} from "@/lib/voice/realtime";
import { LetterGroveCutscene } from "./LetterGroveCutscene";
import type { CutsceneExitReason } from "./LetterGroveCutscene";

interface LetterGroveVoicedCutsceneProps {
  onBeatChange: (beat: LetterGroveCutsceneBeat, index: number) => void;
  onExit: (reason: CutsceneExitReason) => void;
}

interface ConnectionWaiter {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: number;
  detachAbort: () => void;
}

interface PendingNarration {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: number;
  audioDone: boolean;
  sawAudio: boolean;
  stepId: string;
  expectedTranscript: string;
}

const connectionError = () => new Error("Realtime narration connection failed.");

function normalizeTranscript(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\p{P}\p{Z}\s]/gu, "")
    .toLocaleLowerCase("he");
}

/**
 * Uses the Gateway realtime model as the primary voice and the app's cached
 * recording/TTS stack as a graceful fallback. No microphone is requested.
 */
export function LetterGroveVoicedCutscene({
  onBeatChange,
  onExit,
}: LetterGroveVoicedCutsceneProps) {
  const model = useMemo(
    () => gateway.experimental_realtime(LETTER_GROVE_REALTIME_MODEL),
    [],
  );
  const sessionConfig = useMemo<Partial<Experimental_RealtimeSessionConfig>>(
    () => ({
      instructions: LETTER_GROVE_REALTIME_INSTRUCTIONS,
      voice: LETTER_GROVE_REALTIME_VOICE,
      outputModalities: ["audio"],
      turnDetection: { type: "disabled" },
      outputAudioTranscription: { language: "he" },
    }),
    [],
  );
  const statusRef = useRef<"disconnected" | "connecting" | "connected" | "error">(
    "disconnected",
  );
  const realtimeUnavailableRef = useRef(false);
  const isPlayingRef = useRef(false);
  const connectionWaiterRef = useRef<ConnectionWaiter | null>(null);
  const pendingNarrationRef = useRef<PendingNarration | null>(null);

  const settlePendingNarration = useCallback((error?: Error) => {
    const pending = pendingNarrationRef.current;
    if (!pending) return;
    pendingNarrationRef.current = null;
    window.clearTimeout(pending.timer);
    if (error) pending.reject(error);
    else pending.resolve();
  }, []);

  const {
    status,
    isPlaying,
    connect,
    disconnect,
    sendTextMessage,
    cancelResponse,
    stopPlayback,
  } = useRealtime({
    model,
    api: { token: "/api/realtime/letter-grove" },
    sessionConfig,
    onEvent(event) {
      const pending = pendingNarrationRef.current;
      if (!pending) return;
      if (event.type === "audio-delta") pending.sawAudio = true;
      if (event.type === "audio-transcript-done" && event.transcript) {
        if (
          normalizeTranscript(event.transcript) !==
          normalizeTranscript(pending.expectedTranscript)
        ) {
          console.warn(
            `[letter-grove-realtime] transcript mismatch for ${pending.stepId}`,
          );
        }
      }
      if (event.type === "audio-done") {
        pending.audioDone = true;
        // React's isPlaying flag may trail the final socket event by a tick.
        window.setTimeout(() => {
          const current = pendingNarrationRef.current;
          if (current === pending && current.sawAudio && !isPlayingRef.current) {
            settlePendingNarration();
          }
        }, 180);
      }
      if (event.type === "response-done") {
        if (event.status !== "completed") {
          settlePendingNarration(new Error(`Realtime response ended as ${event.status}.`));
        } else if (!pending.sawAudio) {
          settlePendingNarration(new Error("Realtime response completed without audio."));
        }
      }
    },
    onError(error) {
      realtimeUnavailableRef.current = true;
      settlePendingNarration(error);
    },
  });

  statusRef.current = status;
  isPlayingRef.current = isPlaying;

  useEffect(() => {
    const waiter = connectionWaiterRef.current;
    if (!waiter) return;
    if (status === "connected") {
      connectionWaiterRef.current = null;
      window.clearTimeout(waiter.timer);
      waiter.detachAbort();
      waiter.resolve();
    } else if (status === "error") {
      realtimeUnavailableRef.current = true;
      connectionWaiterRef.current = null;
      window.clearTimeout(waiter.timer);
      waiter.detachAbort();
      waiter.reject(connectionError());
    }
  }, [status]);

  useEffect(() => {
    const pending = pendingNarrationRef.current;
    if (!isPlaying && pending?.audioDone && pending.sawAudio) {
      settlePendingNarration();
    }
  }, [isPlaying, settlePendingNarration]);

  const ensureConnected = useCallback(
    (signal: AbortSignal) => {
      if (statusRef.current === "connected") return Promise.resolve();
      if (realtimeUnavailableRef.current) return Promise.reject(connectionError());
      if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));

      const existing = connectionWaiterRef.current;
      if (existing) return Promise.reject(connectionError());

      return new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          const waiter = connectionWaiterRef.current;
          if (!waiter || waiter.reject !== reject) return;
          connectionWaiterRef.current = null;
          window.clearTimeout(waiter.timer);
          waiter.detachAbort();
          reject(new DOMException("Aborted", "AbortError"));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        const timer = window.setTimeout(() => {
          connectionWaiterRef.current = null;
          signal.removeEventListener("abort", onAbort);
          reject(connectionError());
        }, 8_000);
        connectionWaiterRef.current = {
          resolve,
          reject,
          timer,
          detachAbort: () => signal.removeEventListener("abort", onAbort),
        };
        void connect().catch((error: unknown) => {
          const waiter = connectionWaiterRef.current;
          if (!waiter) return;
          connectionWaiterRef.current = null;
          window.clearTimeout(waiter.timer);
          waiter.detachAbort();
          waiter.reject(error instanceof Error ? error : connectionError());
        });
      });
    },
    [connect],
  );

  const stopRealtimeNarration = useCallback(() => {
    if (pendingNarrationRef.current || isPlayingRef.current) {
      try {
        cancelResponse();
      } catch {
        // A beat can be skipped before a socket is open.
      }
    }
    stopPlayback();
    // Resolving is intentional: the cutscene has already invalidated the old
    // playback ticket, and an unobserved rejected promise would be noisy.
    settlePendingNarration();
  }, [cancelResponse, settlePendingNarration, stopPlayback]);

  const narrate = useCallback(
    async (beat: LetterGroveCutsceneBeat, { signal }: { signal: AbortSignal }) => {
      stopSpeech();
      stopRealtimeNarration();
      try {
        await ensureConnected(signal);
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");

        const ended = new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(
            () => settlePendingNarration(new Error("Realtime narration timed out.")),
            Math.max(14_000, beat.durationHintMs + 7_000),
          );
          pendingNarrationRef.current = {
            resolve,
            reject,
            timer,
            audioDone: false,
            sawAudio: false,
            stepId: beat.stepId,
            expectedTranscript: beat.textHe,
          };
        });
        sendTextMessage(beat.textHe);
        let fallbackTimer: number | null = null;
        const resilientEnded = ended.catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          realtimeUnavailableRef.current = true;
          stopRealtimeNarration();
          sayNarration(beat.stepId);
          return new Promise<void>((resolve) => {
            fallbackTimer = window.setTimeout(resolve, beat.durationHintMs);
          });
        });
        return {
          stop: () => {
            if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
            stopRealtimeNarration();
            stopSpeech();
          },
          ended: resilientEnded,
        };
      } catch (error) {
        if (signal.aborted) throw error;
        stopRealtimeNarration();
        // Recorded audio / cached Gateway speech remains the resilient path
        // for unsupported browsers, exhausted credits, and offline previews.
        sayNarration(beat.stepId);
        let fallbackTimer = 0;
        const ended = new Promise<void>((resolve) => {
          fallbackTimer = window.setTimeout(resolve, beat.durationHintMs);
        });
        return {
          stop: () => {
            window.clearTimeout(fallbackTimer);
            stopSpeech();
          },
          ended,
        };
      }
    },
    [ensureConnected, sendTextMessage, settlePendingNarration, stopRealtimeNarration],
  );

  useEffect(
    () => () => {
      stopRealtimeNarration();
      disconnect();
    },
    [disconnect, stopRealtimeNarration],
  );

  return (
    <LetterGroveCutscene
      narrate={narrate}
      onBeatChange={onBeatChange}
      onExit={onExit}
    />
  );
}
