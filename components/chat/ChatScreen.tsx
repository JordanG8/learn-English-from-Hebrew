"use client";

/**
 * CONVERSATION MODE — the payoff. Text only; the microphone is never touched.
 *
 * Four things make this usable by a child who knows 20 English words:
 *   · The AI writes mostly Hebrew with English words dropped in, and every
 *     English word is visually isolated (LTR, its own font, brand colour) so
 *     bidi cannot scramble it and the child can see what is new.
 *   · Words introduced this turn are highlighted differently — the child can
 *     tell "I know this" from "this is new".
 *   · Suggestion chips built from the child's own mastered words mean they
 *     can take a turn without being able to type English yet.
 *   · The child writes on THE APP'S KEYBOARD, not on a text field. See below.
 *
 * The screen is locked until the SRS says the alphabet is mastered; the gate
 * lives in lib/srs.ts, not here.
 *
 * ---------------------------------------------------------------------------
 * ONE KEYBOARD, TWO TARGETS
 * ---------------------------------------------------------------------------
 * The bilingual keyboard is the input device on this screen exactly as it is
 * in a lesson — there is no <input> anywhere, and the draft strip above the
 * board is a display, not a field. Two reasons this is not a gimmick:
 *
 *   · It is the curriculum. Finding A, and getting from עברית to English with
 *     Alt+Shift, is a taught skill in this app. Chat is where it gets spent on
 *     something the child actually wanted to say.
 *   · A real <input> would double every keystroke. `VirtualKeyboard` already
 *     listens to the hardware keyboard by `event.code` (the only thing that
 *     survives the child switching their OS layout to Hebrew), so a focused
 *     field would receive the same press a second time, and would receive it
 *     as `event.key` — which is exactly the lookup that breaks in Hebrew.
 *
 * Keys go to whichever target is live: the message being written, or the blank
 * in an exercise the AI handed over. Only one is ever live, and the composer
 * says which — one action per screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProgress } from "@/lib/progress-context";
import { chatLexicon, evaluateChatGate, masteredLetters } from "@/lib/srs";
import {
  CHAT_NEW_WORDS_PER_TURN,
  CHAT_TEMPLATE_FORGIVEN_MISSES,
  CHAT_TEMPLATE_MISSES_BEFORE_HINT,
} from "@/lib/pedagogy";
import { FALLBACK_REPLY_HE } from "@/lib/chat-prompt";
import { nextAnswer, type WordTemplate } from "@/lib/word-template";
import { wordSkill } from "@/lib/skills";
import { KeyboardSurface } from "@/lib/keyboard-adapter";
import { keyFor } from "@/lib/keyboard-layout";
import type { KeyCode, Lang } from "@/lib/types";
import { playSfx, sayWord } from "@/lib/audio";
import { BigButton, Card, ProgressRing, ScreenHeader, SecondaryButton } from "@/components/ui/kit";
import { WordTemplateCard } from "./WordTemplateCard";

interface Msg {
  role: "user" | "assistant";
  content: string;
  novel?: string[];
  templates?: WordTemplate[];
}

/** The exercise currently receiving keystrokes. */
interface Fill {
  /** `${message index}#${template id}` — unique across the conversation. */
  key: string;
  template: WordTemplate;
  /** One letter per blank filled so far, in blank order. */
  typed: string[];
  misses: number;
  startedAt: number;
}

const MAX_DRAFT = 200;

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
  const { progress, ready, attempt, learnWord } = useProgress();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /* The composer starts in Hebrew: the conversation is in Hebrew, and an
   * exercise flips the requirement to English on its own. */
  const [lang, setLang] = useState<Lang>("he");
  const [fill, setFill] = useState<Fill | null>(null);
  const [solved, setSolved] = useState<ReadonlySet<string>>(new Set());
  const listEnd = useRef<HTMLDivElement | null>(null);

  const gate = useMemo(() => evaluateChatGate(progress), [progress]);
  const lexicon = useMemo(() => chatLexicon(progress), [progress]);
  const letters = useMemo(() => masteredLetters(progress), [progress]);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() =>
      listEnd.current?.scrollIntoView({ behavior: "smooth" }),
    );
  }, []);

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
          templates?: unknown;
          messageHe?: unknown;
        };
        if (data.ok === true && typeof data.reply === "string") {
          const novel = Array.isArray(data.novel)
            ? data.novel.filter((w): w is string => typeof w === "string")
            : [];
          const templates = Array.isArray(data.templates)
            ? data.templates.filter(isWordTemplate)
            : [];
          const reply = data.reply;
          setMessages([...next, { role: "assistant", content: reply, novel, templates }]);
          // An exercise that arrives goes live immediately: the child should
          // never have to work out that the card is the thing to do next. Its
          // key is the assistant message's index, which is `next.length`.
          const first = templates[0];
          if (first) {
            setFill({
              key: `${next.length}#${first.id}`,
              template: first,
              typed: [],
              misses: 0,
              startedAt: Date.now(),
            });
          }
        } else {
          setNotice(
            typeof data.messageHe === "string" ? data.messageHe : FALLBACK_REPLY_HE,
          );
        }
      } catch {
        setNotice("אין חיבור לרשת כרגע. ננסה עוד רגע?");
      } finally {
        setBusy(false);
        scrollDown();
      }
    },
    [messages, busy, lexicon, letters, scrollDown],
  );

  /* ---- the exercise target ----------------------------------------- */

  const finishFill = useCallback(
    (f: Fill) => {
      playSfx("celebrate");
      sayWord(f.template.word);
      learnWord(f.template.word);
      /*
       * One graded attempt per exercise, not per letter. A single wrong key on
       * a keyboard the child is still learning is a motor slip; the second one
       * is the word not being there — see CHAT_TEMPLATE_FORGIVEN_MISSES.
       */
      attempt(wordSkill(f.template.word), {
        correct: f.misses <= CHAT_TEMPLATE_FORGIVEN_MISSES,
        hinted: f.misses >= CHAT_TEMPLATE_MISSES_BEFORE_HINT,
        latencyMs: Date.now() - f.startedAt,
      });
      setSolved((prev) => new Set(prev).add(f.key));
      setFill(null);
      scrollDown();
    },
    [attempt, learnWord, scrollDown],
  );

  const handleFillKey = useCallback(
    (f: Fill, code: KeyCode, char: string | null, keyLang: Lang) => {
      if (code === "Backspace") {
        setFill({ ...f, typed: f.typed.slice(0, -1) });
        return;
      }
      if (char === null) return;
      if (keyLang !== "en") {
        // Not a miss — a layout mistake. The switch is already pulsing for it.
        setNotice("המילה באנגלית — צריך לעבור לאנגלית עם Alt+Shift ⌨️");
        playSfx("tap");
        return;
      }
      const letter = char.toUpperCase();
      if (!/^[A-Z]$/.test(letter)) return;

      const want = nextAnswer(f.template, f.typed.length);
      if (want === null) return;

      if (letter === want) {
        setNotice(null);
        const typed = [...f.typed, letter];
        const next: Fill = { ...f, typed };
        if (typed.length >= f.template.blanks.length) {
          finishFill(next);
        } else {
          playSfx("letter-lands");
          setFill(next);
        }
      } else {
        playSfx("wrong");
        setFill({ ...f, misses: f.misses + 1 });
      }
    },
    [finishFill],
  );

  const handleKey = useCallback(
    (code: KeyCode, char: string | null, keyLang: Lang) => {
      if (fill) {
        handleFillKey(fill, code, char, keyLang);
        return;
      }
      if (busy) return;
      if (code === "Enter") {
        void send(draft);
        return;
      }
      if (code === "Backspace") {
        setDraft((d) => [...d].slice(0, -1).join(""));
        return;
      }
      if (char === null) return;
      setDraft((d) => (d.length >= MAX_DRAFT ? d : d + char));
    },
    [fill, busy, draft, handleFillKey, send],
  );

  /** After two misses the answer key is lit. Nobody sits stuck on a blank. */
  const hintCode: KeyCode | null = useMemo(() => {
    if (!fill || fill.misses < CHAT_TEMPLATE_MISSES_BEFORE_HINT) return null;
    const want = nextAnswer(fill.template, fill.typed.length);
    return want ? (keyFor(want, "en")?.cap.code ?? null) : null;
  }, [fill]);

  useEffect(() => {
    if (fill) scrollDown();
  }, [fill, scrollDown]);

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
              כתוב עם המקלדת שלמטה — בעברית או באנגלית. גע במילה באנגלית כדי
              לשמוע אותה.
            </p>
          </Card>
        ) : null}

        {messages.map((m, i) => (
          <div key={i} className="flex flex-col gap-3">
            <div
              className={`efh-bubble ${m.role === "assistant" ? "efh-bubble-ai" : "efh-bubble-me"}`}
            >
              {m.role === "assistant" ? renderMixed(m.content, m.novel ?? []) : m.content}
            </div>

            {(m.templates ?? []).map((t) => {
              const key = `${i}#${t.id}`;
              const isActive = fill?.key === key;
              return (
                <WordTemplateCard
                  key={key}
                  template={t}
                  typed={isActive ? fill.typed : []}
                  misses={isActive ? fill.misses : 0}
                  state={solved.has(key) ? "solved" : isActive ? "active" : "idle"}
                  onStart={() =>
                    setFill({
                      key,
                      template: t,
                      typed: [],
                      misses: 0,
                      startedAt: Date.now(),
                    })
                  }
                  onCancel={() => setFill(null)}
                />
              );
            })}
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

      {/* ---- The composer: one strip, whichever target is live -------- */}
      {fill ? (
        <div className="flex items-center justify-between gap-3 border-t border-brand-soft bg-card p-3">
          <p className="text-lg font-bold">
            <span aria-hidden>✏️ </span>
            משלימים את המילה — {fill.template.he}
          </p>
          <SecondaryButton icon="💬" onClick={() => setFill(null)}>
            לכתוב הודעה
          </SecondaryButton>
        </div>
      ) : (
        <>
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

          <div className="flex items-end gap-2 border-t border-brand-soft bg-card p-3">
            {/*
              A display, not a field: see the header note. It is announced as a
              live region so a screen reader follows what the keyboard writes.
            */}
            <div
              dir="auto"
              aria-live="polite"
              aria-label="ההודעה שלי"
              className="min-h-16 flex-1 rounded-[var(--radius-kid)] border-[3px] border-brand-soft bg-paper px-4 py-3 text-xl"
            >
              {draft ? (
                <span>
                  {draft}
                  <span aria-hidden className="efh-caret" />
                </span>
              ) : (
                <span className="text-ink-soft">כתוב כאן עם המקלדת…</span>
              )}
            </div>
            <SecondaryButton
              icon="📨"
              disabled={busy || draft.trim().length === 0}
              onClick={() => void send(draft)}
            >
              שלח
            </SecondaryButton>
          </div>
        </>
      )}

      <div className="border-t border-brand-soft bg-card px-2 pb-3 pt-1">
        <KeyboardSurface
          lang={lang}
          onLangChange={setLang}
          /* An exercise is in English; a message can be in either language. */
          requiredLang={fill ? "en" : null}
          highlight={hintCode ? [hintCode] : []}
          reveal
          onKey={handleKey}
          disabled={busy && !fill}
        />
      </div>
    </main>
  );
}

/** The route is trusted code, but the response crosses a network boundary. */
function isWordTemplate(v: unknown): v is WordTemplate {
  if (typeof v !== "object" || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    typeof t.word === "string" &&
    typeof t.he === "string" &&
    typeof t.emoji === "string" &&
    Array.isArray(t.blanks) &&
    t.blanks.every((b) => typeof b === "number" && b >= 0 && b < (t.word as string).length)
  );
}
