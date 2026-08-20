/**
 * MIDDLEWARE — layer 1 of returning-visitor detection.
 *
 * On every page request we set (once) an httpOnly cookie recording that this
 * browser has been here, when it first arrived, and a truncated salted hash
 * of the IP it arrived from.
 *
 * PRIVACY: the raw IP is never stored, never logged and never sent to the
 * client. Only an 8-hex-character SHA-256 of `${monthly-salt}|${ip}` goes
 * into the cookie, on the visitor's own device. The salt rotates monthly, so
 * hashes cannot be correlated across months, and 8 hex characters collide
 * far too often to identify anyone.
 *
 * WHAT THIS COOKIE MAY AND MAY NOT DO: it may cause a large, visible SKIP
 * button to be offered on the walkthrough. It may never skip the walkthrough
 * by itself. See the reasoning in lib/visitor.ts — a school, a household or
 * a mobile carrier NATs many children behind one address, so an IP match is
 * not evidence that *this child* has been here.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  VISIT_COOKIE,
  currentSalt,
  decodeVisit,
  encodeVisit,
  hashIp,
} from "@/lib/visitor";
import { RETURNING_COOKIE_MAX_AGE_S } from "@/lib/pedagogy";

export const config = {
  // Pages only. Static assets and API routes do not need a visit stamp.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip");
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const existing = decodeVisit(req.cookies.get(VISIT_COOKIE)?.value);

  // Hashing must never be able to break page delivery.
  let ip = "";
  try {
    ip = await hashIp(clientIp(req), currentSalt());
  } catch {
    ip = "";
  }

  const payload = existing
    ? { ...existing, ip: ip || existing.ip }
    : { v: 1 as const, first: Date.now(), ip };

  res.cookies.set(VISIT_COOKIE, encodeVisit(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RETURNING_COOKIE_MAX_AGE_S,
  });

  // Expose the *derived* signals to server components without exposing the
  // hash itself to anything that renders.
  res.headers.set("x-efh-returning", existing ? "1" : "0");
  return res;
}
