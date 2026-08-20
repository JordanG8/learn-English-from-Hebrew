/* SERVER ONLY — imports next/headers, must never be pulled into a client
 * component. (The `server-only` package is not a dependency here; next/headers
 * itself already errors if this module is imported from client code.) */
/**
 * Server-side read of the visit cookie. Used by app/layout.tsx to seed the
 * client with what the server already knows, so the walkthrough decision is
 * made before first paint rather than flashing.
 */

import { cookies, headers } from "next/headers";
import { VISIT_COOKIE, currentSalt, decodeVisit, hashIp, type VisitCookie } from "./visitor";

export interface ServerVisit {
  cookie: VisitCookie | null;
  /** Hash of the current request's IP, for comparison only. Never the IP. */
  currentIpHash: string;
}

export async function readServerVisit(): Promise<ServerVisit> {
  try {
    const jar = await cookies();
    const cookie = decodeVisit(jar.get(VISIT_COOKIE)?.value);

    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    const ip = fwd ? (fwd.split(",")[0]?.trim() ?? null) : h.get("x-real-ip");
    const currentIpHash = await hashIp(ip, currentSalt());

    return { cookie, currentIpHash };
  } catch {
    // Static rendering, or headers unavailable. Absent signals are always
    // acceptable: the walkthrough simply runs.
    return { cookie: null, currentIpHash: "" };
  }
}
