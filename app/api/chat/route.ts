/**
 * CONVERSATION MODE API.
 *
 * Safeguards, in order of how they fire:
 *
 *  1. THE KEY NEVER LEAVES THE SERVER. `AI_GATEWAY_API_KEY` is read from the
 *     process environment here and nowhere else. It is not prefixed
 *     NEXT_PUBLIC_, is never returned in a response, and the client has no
 *     way to reach the gateway directly.
 *  2. GRACEFUL DEGRADATION. If no credential is configured — which is the
 *     state of the project until someone sets one — the route returns a
 *     clear Hebrew message with HTTP 200 and `ok: false`, so the chat screen
 *     shows a friendly explanation instead of a crash or a spinner. See
 *     docs/deployment.md for how to set it.
 *  3. INPUT VALIDATION. zod, with hard caps on message count and length.
 *  4. LEXICON NARROWING. The lexicon the client sends is intersected with the
 *     app's own word list, so a tampered request cannot inject text into the
 *     system prompt.
 *  5. BUDGET CLAMP. `newWordBudget` is clamped server-side to
 *     CHAT_NEW_WORDS_MAX regardless of what the client asks for.
 *  6. OUTPUT VALIDATION. The reply is scanned for English outside the allowed
 *     set; one stricter retry, then a safe Hebrew fallback.
 *
 * Nothing about the conversation is logged or stored. There is no database.
 */

import { NextResponse } from "next/server";
import { generateText } from "ai";
import { z } from "zod";
import {
  CHAT_HISTORY_TURNS,
  CHAT_MODEL,
  CHAT_NEW_WORDS_MAX,
} from "@/lib/pedagogy";
import {
  FALLBACK_REPLY_HE,
  checkReply,
  sanitizeLetters,
  sanitizeLexicon,
  systemPrompt,
} from "@/lib/chat-prompt";

export const runtime = "nodejs";
/** Never cache a conversation turn. */
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(500),
      }),
    )
    .min(1)
    .max(CHAT_HISTORY_TURNS * 2),
  lexicon: z.array(z.string().max(24)).max(200).default([]),
  letters: z.array(z.string().max(2)).max(26).default([]),
  newWordBudget: z.number().int().min(0).max(CHAT_NEW_WORDS_MAX).default(1),
});

/** Both credentials the AI Gateway accepts — see docs/deployment.md. */
function hasCredential(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN,
  );
}

interface ChatOk {
  ok: true;
  reply: string;
  /** New words introduced this turn, so the UI can mark them. */
  novel: string[];
}
interface ChatDegraded {
  ok: false;
  reason: "no-key" | "bad-request" | "upstream";
  messageHe: string;
}

export async function POST(req: Request): Promise<NextResponse<ChatOk | ChatDegraded>> {
  // (2) No credential configured — degrade, do not crash.
  if (!hasCredential()) {
    return NextResponse.json<ChatDegraded>(
      {
        ok: false,
        reason: "no-key",
        messageHe:
          "מצב השיחה עדיין לא מחובר. צריך להוסיף מפתח AI Gateway בהגדרות של האתר — עד אז אפשר להמשיך לתרגל אותיות ומילים.",
      },
      { status: 200 },
    );
  }

  // (3) Input validation.
  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json<ChatDegraded>(
      {
        ok: false,
        reason: "bad-request",
        messageHe: "משהו בהודעה לא הסתדר. נסה לכתוב שוב בקצרה.",
      },
      { status: 400 },
    );
  }

  // (4) + (5) Narrow the lexicon and clamp the budget.
  const lexicon = sanitizeLexicon(parsed.lexicon);
  const letters = sanitizeLetters(parsed.letters);
  const budget = Math.min(parsed.newWordBudget, CHAT_NEW_WORDS_MAX);
  const history = parsed.messages.slice(-CHAT_HISTORY_TURNS * 2);

  const baseSystem = systemPrompt({ lexicon, letters, newWordBudget: budget });

  async function ask(system: string): Promise<string> {
    const result = await generateText({
      model: CHAT_MODEL,
      system,
      messages: history,
      temperature: 0.7,
      maxRetries: 1,
    });
    return result.text.trim();
  }

  try {
    let text = await ask(baseSystem);
    let check = checkReply(text, lexicon, budget);

    // (6) One stricter retry before giving up on the model's own judgement.
    if (!check.ok) {
      const why =
        check.reason === "ratio"
          ? "the turn was too short to afford any new English word"
          : check.reason === "too-much-english"
            ? "there was far too much English in it"
            : `it used English words outside the allowed list: ${check.novel.join(", ")}`;
      const stricter = `${baseSystem}\n\nYOUR PREVIOUS ATTEMPT BROKE THE LEXICON RULE — ${why}. Rewrite it. Use ONLY Hebrew plus words from the allowed list, and introduce no new English word at all this time.`;
      text = await ask(stricter);
      check = checkReply(text, lexicon, budget);
    }

    if (!text || !check.ok) {
      return NextResponse.json<ChatOk>({
        ok: true,
        reply: FALLBACK_REPLY_HE,
        novel: [],
      });
    }

    return NextResponse.json<ChatOk>({ ok: true, reply: text, novel: check.novel });
  } catch {
    // Upstream failure. No error text is forwarded — it can contain request
    // details, and a child cannot act on it anyway.
    return NextResponse.json<ChatDegraded>(
      {
        ok: false,
        reason: "upstream",
        messageHe: "לא הצלחתי להתחבר כרגע. ננסה שוב עוד רגע?",
      },
      { status: 200 },
    );
  }
}
