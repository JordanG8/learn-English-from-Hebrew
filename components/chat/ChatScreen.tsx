"use client";

/**
 * CONVERSATION MODE — the payoff. Text only; the microphone is never touched.
 *
 * Three things make this usable by a child who knows 20 English words:
 *   · The AI writes mostly Hebrew with English words dropped in, and every
 *     English word is visually isolated (LTR, its own font, brand colour) so
 *     bidi cannot scramble it and the child can see what is new.
 *   · Words introduced this turn are highlighted differently — the child can
 *     tell "I know this" from "this is new".
 *   · Suggestion chips built from the child's own mastered words mean they
 *     can take a turn without being able to type English yet.
 *
 * The screen is locked until the SRS says the alphabet is mastered; the gate
 * lives in lib/srs.ts, not here.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProgress } from "@/lib/progress-context";
import { chatLexicon, evaluateChatGate, masteredLetters } from "@/lib/srs";
import { CHAT_NEW_WORDS_PER_TURN } from "@/lib/pedagogy";
import { FALLBACK_REPLY_HE } from "@/lib/chat-prompt";
import { sayWord } from "@/lib/audio";
import { BigButton, Card, ProgressRing, ScreenHeader, SecondaryButton } from "@/components/ui/kit";

interface Msg {
  role: "user" | "assistant";
  content: string;
  novel?: string[];
}

/** Split a mixed Hebrew/English string so English runs render LTR-isolated. */
function renderMixed(text: string, novel: readonly string[]) {
  const novelSet = new Set(novel.map((w) => w.toUpperCase()));
  const parts = text.split(/([A-Za-z]+)/g);
  return parts.map((part, i) => {
    if (!/^[A-Za-z]+$/.test(part)) return <span key={i}>{part}</span>;
    const isNew = novelSet.has(part.toUpperCase());
    return (
      <button
        key={i}
        type="button"
        className="efh-en-word"
        data-new={isNew ? "1" : undefined}
        onClick={() => sayWord(part)}
        aria-label={`השמע את המילה ${part}`}
      >
        {part}
      </button>
    );
  });
}

const OPENERS: readonly string[] = ["HELLO!", "מה שלומך?", "אני אוהב פיצה 🍕"];

export function ChatScreen() {
  const router = useRouter();
  const { progress, ready } = useProgress();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const listEnd = useRef<HTMLDivElement | null>(null);

  const gate = useMemo(() => evaluateChatGate(progress), [progress]);
  const lexicon = useMemo(() => chatLexicon(progress), [progress]);
  const letters = useMemo(() => masteredLetters(progress), [progress]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;
      setDraft("");
      setNotice(null);
      const next: Msg[] = [...messages, { role: "user", content }];
      setMessages(next);
      setBusy(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: next.map((m) => ({ role: m.role, content: m.content })),
            lexicon,
            letters,
            newWordBudget: CHAT_NEW_WORDS_PER_TURN,
          }),
        });
        // The route's response is untrusted at the type level; narrow it.
        const data = (await res.json()) as unknown as {
          ok?: unknown;
          reply?: unknown;
          novel?: unknown;
          messageHe?: unknown;
        };
        if (data.ok === true && typeof data.reply === "string") {
          const novel = Array.isArray(data.novel)
            ? data.novel.filter((w): w is string => typeof w === "string")
            : [];
          const reply = data.reply;
          setMessages((m) => [...m, { role: "assistant", content: reply, novel }]);
        } else {
          setNotice(
            typeof data.messageHe === "string" ? data.messageHe : FALLBACK_REPLY_HE,
          );
        }
      } catch {
        setNotice("אין חיבור לרשת כרגע. ננסה עוד רגע?");
      } finally {
        setBusy(false);
        requestAnimationFrame(() =>
          listEnd.current?.scrollIntoView({ behavior: "smooth" }),
        );
      }
    },
    [messages, busy, lexicon, letters],
  );

  if (!ready) {
    return (
      <main className="grid min-h-dvh place-items-center p-6">
        <p className="text-2xl font-bold">רגע…</p>
      </main>
    );
  }

  /* --- Locked ------------------------------------------------------- */
  if (!gate.unlocked) {
    return (
      <main className="flex min-h-dvh flex-col">
        <ScreenHeader title="לדבר באנגלית" onBack={() => router.push("/")} />
        <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6">
          <ProgressRing value={gate.progress} size={120} icon="🔒" label={gate.reasonHe} />
          <h2 className="text-center text-2xl font-black leading-snug">
            עוד קצת ונפתח!
          </h2>
          <p className="text-center text-xl text-ink-soft">{gate.reasonHe}</p>
          <Card className="w-full max-w-sm text-center text-lg">
            <p>אותיות: {gate.lettersMastered} מתוך {gate.lettersRequired}</p>
            <p>מילים: {gate.wordsKnown} מתוך {gate.wordsRequired}</p>
            <p>ימי תרגול: {gate.practiceDays} מתוך {gate.practiceDaysRequired}</p>
          </Card>
          <BigButton icon="▶️" onClick={() => router.push("/")}>
            נמשיך לתרגל
          </BigButton>
        </div>
      </main>
    );
  }

  /* --- Unlocked ----------------------------------------------------- */
  return (
    <main className="flex min-h-dvh flex-col">
      <ScreenHeader title="לדבר באנגלית" onBack={() => router.push("/")} />

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <Card className="text-center">
            <p className="text-xl font-bold">היי! אפשר להתחיל לכתוב 👋</p>
            <p className="mt-1 text-base text-ink-soft">
              אני אכתוב בעברית ואשתול מילים באנגלית שאתה כבר מכיר. גע במילה
              באנגלית כדי לשמוע אותה.
            </p>
          </Card>
        ) : null}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`efh-bubble ${m.role === "assistant" ? "efh-bubble-ai" : "efh-bubble-me"}`}
          >
            {m.role === "assistant" ? renderMixed(m.content, m.novel ?? []) : m.content}
          </div>
        ))}

        {busy ? (
          <div className="efh-bubble efh-bubble-ai" role="status">
            <span aria-hidden>✍️ </span>כותב…
          </div>
        ) : null}

        {notice ? (
          <Card className="border-4 border-warn text-center text-lg font-bold">
            <span aria-hidden>⚠️ </span>
            {notice}
          </Card>
        ) : null}

        <div ref={listEnd} />
      </div>

      {/* Suggestion chips — a child who cannot type English can still play. */}
      <div className="flex flex-wrap gap-2 px-4 pb-2">
        {[...OPENERS, ...lexicon.slice(0, 6)].map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={busy}
            onClick={() => void send(chip)}
            className="min-h-16 rounded-[var(--radius-kid)] border-[3px] border-brand-soft bg-card px-4 text-lg font-bold disabled:opacity-40"
          >
            <span className={/^[A-Za-z!? ]+$/.test(chip) ? "ltr" : undefined}>{chip}</span>
          </button>
        ))}
      </div>

      <form
        className="flex items-end gap-2 border-t border-brand-soft bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="כתוב כאן…"
          maxLength={200}
          aria-label="ההודעה שלי"
          className="min-h-16 flex-1 rounded-[var(--radius-kid)] border-[3px] border-brand-soft bg-paper px-4 text-xl"
        />
        <SecondaryButton icon="📨" disabled={busy || draft.trim().length === 0} onClick={() => void send(draft)}>
          שלח
        </SecondaryButton>
      </form>
    </main>
  );
}
