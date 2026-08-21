"use client";

/**
 * APP PROVIDERS — mounted once in app/layout.tsx.
 *
 * Combines the two pieces of global state:
 *   · Progress (localStorage)
 *   · the visitor verdict (cookie from the server + localStorage on client)
 *
 * The verdict is computed here rather than in a screen so there is exactly
 * one implementation of the "does the walkthrough run?" policy.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ProgressProvider, useProgress } from "./progress-context";
import {
  classifyVisitor,
  skipRevealDelayMs,
  type VisitCookie,
  type VisitorVerdict,
} from "./visitor";
import { hasSeenLocally } from "./progress";
import { loadVoiceManifest } from "./voice/manifest";
import { TUTORIAL_SKIP_REVEAL_DELAY_MS } from "./pedagogy";

export interface VisitorApi extends VisitorVerdict {
  /** ms to keep the skip button hidden. Infinity ⇒ never offer it. */
  skipDelayMs: number;
  /** True once the client has read localStorage; render a skeleton before. */
  ready: boolean;
}

const VisitorCtx = createContext<VisitorApi | null>(null);

/** Serialisable subset the server passes down. */
export interface ServerVisitProps {
  cookie: VisitCookie | null;
  currentIpHash: string;
}

function VisitorProvider({
  serverVisit,
  children,
}: {
  serverVisit: ServerVisitProps;
  children: React.ReactNode;
}) {
  const { progress, ready: progressReady } = useProgress();
  const [localSeen, setLocalSeen] = useState(false);
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    setLocalSeen(hasSeenLocally());
    setClientReady(true);
    // Which lines have a human recording. Fetched once per page load, before
    // anything can ask to speak, so the first letter of the first lesson is
    // already in the recorded voice rather than TTS-then-corrected.
    void loadVoiceManifest();
  }, []);

  const value = useMemo<VisitorApi>(() => {
    const verdict = classifyVisitor({
      cookie: serverVisit.cookie,
      localSeen,
      onboarded: progress.onboarded,
      currentIpHash: serverVisit.currentIpHash,
    });
    return {
      ...verdict,
      skipDelayMs: skipRevealDelayMs(verdict, TUTORIAL_SKIP_REVEAL_DELAY_MS),
      ready: clientReady && progressReady,
    };
  }, [serverVisit, localSeen, progress.onboarded, clientReady, progressReady]);

  return <VisitorCtx.Provider value={value}>{children}</VisitorCtx.Provider>;
}

export function useVisitor(): VisitorApi {
  const ctx = useContext(VisitorCtx);
  if (!ctx) throw new Error("useVisitor must be used inside <AppProviders>.");
  return ctx;
}

export function AppProviders({
  serverVisit,
  children,
}: {
  serverVisit: ServerVisitProps;
  children: React.ReactNode;
}) {
  return (
    <ProgressProvider>
      <VisitorProvider serverVisit={serverVisit}>{children}</VisitorProvider>
    </ProgressProvider>
  );
}
