/**
 * RETURNING-VISITOR DETECTION — layered, and deliberately biased toward
 * showing the walkthrough.
 *
 * ─── The three signals ────────────────────────────────────────────────
 *  1. httpOnly cookie set by middleware.ts on the first request.
 *     Survives a localStorage wipe; lost by private browsing and by
 *     switching device/browser.
 *  2. localStorage (`efh:seen`, and the authoritative `Progress.onboarded`).
 *     Survives cookie clearing; lost by private browsing.
 *  3. A COARSE HASHED-IP signal folded into the cookie payload.
 *
 * ─── Why signal 3 can only ever *weaken* a conclusion ─────────────────
 *  A school, a household and a mobile carrier all NAT many children behind
 *  one address. Two different first-time children can share an IP, and one
 *  child's IP changes between home wifi and 4G. Therefore IP is used ONLY to
 *  answer "is this plausibly the same context as last time?" — agreement
 *  raises confidence, disagreement lowers it. It can never, on its own,
 *  conclude "returning", and it can never skip anything.
 *
 * ─── Privacy ──────────────────────────────────────────────────────────
 *  Raw IPs are never stored, logged or sent to the client. Only a truncated
 *  SHA-256 of (ip + a rotating salt) is kept, in an httpOnly cookie on the
 *  visitor's own device. It is not a stable identifier: the salt rotates
 *  monthly, so a hash cannot be correlated across months, and 8 hex chars
 *  collide often enough that it cannot single anyone out.
 *
 * ─── The policy this file encodes ─────────────────────────────────────
 *  · The walkthrough RUNS on first visit and is mandatory.
 *  · It is skipped automatically ONLY when Progress.onboarded === true —
 *    i.e. this device has actually completed it once. No other signal, and
 *    certainly not IP, may auto-skip.
 *  · A visitor who merely *looks* returning gets the walkthrough plus a
 *    large, clearly visible skip button. Weak evidence delays that button.
 *  · A permanent "show me again" affordance exists on the home screen, so a
 *    wrongly-skipped first-timer is one tap away from the tutorial.
 */

export const VISIT_COOKIE = "efh_visit";
/** Fixed prefix + month, so hashes cannot be correlated across months.
 *  Not a secret: it only needs to stop cross-month linkage. */
export function currentSalt(now: number = Date.now()): string {
  const d = new Date(now);
  return `efh-${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
}

export interface VisitCookie {
  /** payload version */
  v: 1;
  /** epoch ms of the first request we ever saw from this browser */
  first: number;
  /** truncated salted hash of the IP, or "" when the IP was unavailable */
  ip: string;
}

export function encodeVisit(c: VisitCookie): string {
  return `${c.v}.${c.first}.${c.ip}`;
}

/** Never throws. Returns null for anything malformed. */
export function decodeVisit(raw: string | undefined): VisitCookie | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 3) return null;
  const [v, first, ip] = parts;
  if (v !== "1") return null;
  const f = Number(first);
  if (!Number.isFinite(f) || f <= 0) return null;
  if (!/^[0-9a-f]{0,16}$/.test(ip ?? "")) return null;
  return { v: 1, first: f, ip: ip ?? "" };
}

/**
 * Truncated salted SHA-256 of an IP. Runs in the edge runtime (middleware)
 * and in Node. Returns "" if hashing is unavailable — an absent signal is
 * always acceptable here, because the signal is optional by design.
 */
export async function hashIp(
  ip: string | null | undefined,
  salt: string = currentSalt(),
): Promise<string> {
  if (!ip) return "";
  try {
    const data = new TextEncoder().encode(`${salt}|${ip}`);
    const digest = await crypto.subtle.digest("SHA-256", data);
    const bytes = Array.from(new Uint8Array(digest)).slice(0, 4);
    // 8 hex chars: enough to notice a context change, far too few to identify.
    return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

/* ------------------------------------------------------------------ */
/* Policy                                                              */
/* ------------------------------------------------------------------ */

export type VisitorStatus =
  /** No evidence of a previous visit. Walkthrough is mandatory, no skip. */
  | "first-time"
  /** Some evidence, none conclusive. Walkthrough runs, skip button offered. */
  | "probably-returning"
  /** This device completed the walkthrough. Walkthrough is skipped. */
  | "onboarded";

export interface VisitorSignals {
  /** Decoded httpOnly cookie, if middleware saw us before. */
  cookie: VisitCookie | null;
  /** `efh:seen` in localStorage. */
  localSeen: boolean;
  /** Progress.onboarded — the only signal permitted to auto-skip. */
  onboarded: boolean;
  /** Hash of the CURRENT request's IP, for comparison with cookie.ip. */
  currentIpHash?: string;
}

export interface VisitorVerdict {
  status: VisitorStatus;
  /** Should the walkthrough be shown at all? */
  showTutorial: boolean;
  /** May a visible skip button be offered? Never true for a first-timer. */
  mayOfferSkip: boolean;
  /** 0..1 — how sure we are they have been here. Drives the skip delay only. */
  confidence: number;
}

export function classifyVisitor(s: VisitorSignals): VisitorVerdict {
  // The one auto-skip. It means: this device finished the walkthrough.
  if (s.onboarded) {
    return {
      status: "onboarded",
      showTutorial: false,
      mayOfferSkip: true,
      confidence: 1,
    };
  }

  let confidence = 0;
  if (s.cookie) confidence += 0.5;
  if (s.localSeen) confidence += 0.4;

  // IP is a modifier, never a source of evidence on its own. A matching hash
  // nudges confidence up a little; a mismatch (new network, or — far more
  // likely behind a school/carrier NAT — a different child on the same
  // device) pulls it down.
  if (s.cookie && s.currentIpHash) {
    if (s.cookie.ip && s.currentIpHash === s.cookie.ip) confidence += 0.1;
    else if (s.cookie.ip) confidence -= 0.25;
  }
  confidence = Math.min(1, Math.max(0, confidence));

  const anyEvidence = s.cookie !== null || s.localSeen;
  return {
    status: anyEvidence ? "probably-returning" : "first-time",
    // Always true here: nobody who has not completed it gets to miss it.
    showTutorial: true,
    mayOfferSkip: anyEvidence,
    confidence,
  };
}

/**
 * How long the skip button stays hidden. Weak evidence ⇒ longer wait, so a
 * genuine first-timer who happens to carry a stale cookie has to look at the
 * first tutorial card before the escape hatch appears.
 */
export function skipRevealDelayMs(v: VisitorVerdict, baseMs: number): number {
  if (!v.mayOfferSkip) return Number.POSITIVE_INFINITY;
  return v.confidence >= 0.8 ? baseMs : baseMs * 2.5;
}
