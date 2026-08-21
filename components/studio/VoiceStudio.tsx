"use client";

/**
 * THE VOICE STUDIO — record the app's own voice, from a phone, in one sitting.
 *
 * This is the only screen in the project not built for a seven-year-old, so
 * the design rules it follows are different ones:
 *
 *  1. ONE LINE AT A TIME. Recording a hundred-odd lines is a rhythm — read,
 *     record, approve, next — and a list view breaks that rhythm by making
 *     every line a navigation decision. So the focus card is the screen, and
 *     the list is a strip underneath it for jumping around.
 *  2. THE THUMB NEVER MOVES. Record, keep, redo and next are all in the lower
 *     half, sized for a thumb, in the same place for every line.
 *  3. SAVING IS NOT A STEP. A take uploads the moment it ends. There is no
 *     "save" button to forget, and the next line is pre-selected the instant
 *     the upload lands.
 *  4. NOTHING IS DESTROYED SILENTLY. Re-recording a line replaces it, so the
 *     previous take is played back before it can be replaced, and delete is
 *     always two taps.
 *  5. THE FAILURE MODES ARE ON SCREEN. No microphone, no storage, no
 *     passcode, no network: each says which one it is, in Hebrew, with what
 *     to do about it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  REQUIRED_VOICE_LINES,
  VOICE_GROUPS,
  type VoiceGroup,
  type VoiceLine,
} from "@/lib/voice/lines";
import {
  loadVoiceManifest,
  subscribeVoiceManifest,
  voiceManifestSnapshot,
  type VoiceManifest,
} from "@/lib/voice/manifest";
import {
  exportUrl,
  fetchStudioStatus,
  removeClip,
  storePasscode,
  storedPasscode,
  uploadClip,
  type StudioStatus,
} from "@/lib/voice/client";
import { speakEn } from "@/lib/audio";
import { MAX_TAKE_MS, useRecorder } from "./useRecorder";

/* ------------------------------------------------------------------ */
/* Manifest as React state                                             */
/* ------------------------------------------------------------------ */

function useVoiceManifest(): VoiceManifest {
  const [manifest, setManifest] = useState<VoiceManifest>(() =>
    voiceManifestSnapshot(),
  );
  useEffect(() => {
    const off = subscribeVoiceManifest(setManifest);
    void loadVoiceManifest(true);
    return off;
  }, []);
  return manifest;
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function Meter({ level, active }: { level: number; active: boolean }) {
  // The bar is the answer to "is the mic actually hearing me?", which is the
  // one question a recording UI must never leave ambiguous.
  return (
    <div
      className="h-3 w-full overflow-hidden rounded-full bg-brand-soft"
      role="img"
      aria-label={active ? `עוצמת קול ${Math.round(level * 100)}%` : "המיקרופון כבוי"}
    >
      <div
        className="h-full rounded-full transition-[width] duration-75"
        style={{
          width: `${Math.round(Math.min(1, level) * 100)}%`,
          background: active ? "var(--color-go)" : "var(--color-ink-soft)",
        }}
      />
    </div>
  );
}

function relativeHe(ms: number): string {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "לפני רגע";
  const m = Math.round(s / 60);
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.round(m / 60);
  if (h < 24) return `לפני ${h} שע׳`;
  return `לפני ${Math.round(h / 24)} ימים`;
}

/* ------------------------------------------------------------------ */

type Phase = "idle" | "saving" | "saved" | "error";

export function VoiceStudio() {
  const manifest = useVoiceManifest();
  const recorder = useRecorder();

  const [groupIdx, setGroupIdx] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [note, setNote] = useState<string | null>(null);
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [passcode, setPasscode] = useState("");
  const [askingPasscode, setAskingPasscode] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [take, setTake] = useState<{ url: string; ms: number } | null>(null);

  const playerRef = useRef<HTMLAudioElement | null>(null);
  const advanceTimer = useRef<number | null>(null);

  const group: VoiceGroup = VOICE_GROUPS[groupIdx]!;
  const line: VoiceLine | undefined = group.lines[lineIdx];
  const clip = line ? manifest[line.id] : undefined;

  useEffect(() => {
    setPasscode(storedPasscode());
    void fetchStudioStatus().then((s) => {
      setStatus(s);
      // Ask for the passcode up front rather than after a failed take, so a
      // recording is never lost to a 401.
      if (s.passcodeRequired && !storedPasscode()) setAskingPasscode(true);
    });
  }, []);

  /* A new line clears everything about the previous one. */
  useEffect(() => {
    setPhase("idle");
    setNote(null);
    setConfirmDelete(false);
    setTake(null);
  }, [groupIdx, lineIdx]);

  useEffect(
    () => () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    },
    [],
  );

  const counts = useMemo(() => {
    const per = VOICE_GROUPS.map(
      (g) => g.lines.filter((l) => manifest[l.id]).length,
    );
    // The headline number counts only the lines the app speaks today, so
    // finishing the real work reads as finished. Optional lesson cards have
    // their own count on their own chip.
    return {
      per,
      done: REQUIRED_VOICE_LINES.filter((l) => manifest[l.id]).length,
      required: REQUIRED_VOICE_LINES.length,
    };
  }, [manifest]);

  const play = useCallback((url: string) => {
    try {
      if (!playerRef.current) playerRef.current = new Audio();
      const el = playerRef.current;
      el.pause();
      el.src = url;
      el.currentTime = 0;
      void el.play().catch(() => undefined);
    } catch {
      /* playback failing must not break recording */
    }
  }, []);

  /* --- moving between lines ------------------------------------------- */

  const goTo = useCallback((g: number, l: number) => {
    setGroupIdx(g);
    setLineIdx(l);
  }, []);

  const step = useCallback(
    (delta: number) => {
      let g = groupIdx;
      let l = lineIdx + delta;
      while (l < 0 && g > 0) {
        g -= 1;
        l += VOICE_GROUPS[g]!.lines.length;
      }
      while (l >= (VOICE_GROUPS[g]?.lines.length ?? 0) && g < VOICE_GROUPS.length - 1) {
        l -= VOICE_GROUPS[g]!.lines.length;
        g += 1;
      }
      const max = (VOICE_GROUPS[g]?.lines.length ?? 1) - 1;
      goTo(g, Math.min(Math.max(l, 0), max));
    },
    [groupIdx, lineIdx, goTo],
  );

  /** After a save: the next line that still needs a voice, else simply next. */
  const advance = useCallback(() => {
    const startedOptional = Boolean(VOICE_GROUPS[groupIdx]?.optional);
    for (let g = groupIdx; g < VOICE_GROUPS.length; g++) {
      // Never wander from the required lines into the optional ones: running
      // out of required work should stop, not silently start a bigger job.
      if (!startedOptional && VOICE_GROUPS[g]!.optional) break;
      const lines = VOICE_GROUPS[g]!.lines;
      for (let l = g === groupIdx ? lineIdx + 1 : 0; l < lines.length; l++) {
        if (!manifest[lines[l]!.id]) {
          goTo(g, l);
          return;
        }
      }
    }
    step(1);
  }, [groupIdx, lineIdx, manifest, goTo, step]);

  /* --- recording ------------------------------------------------------- */

  const saveTake = useCallback(
    async (blob: Blob, id: string) => {
      setPhase("saving");
      const res = await uploadClip(id, blob);
      if (res.ok) {
        setPhase("saved");
        setNote(null);
        if (autoAdvance) {
          advanceTimer.current = window.setTimeout(advance, 650);
        }
        return;
      }
      setPhase("error");
      setNote(res.messageHe);
      if (res.unauthorised) setAskingPasscode(true);
    },
    [autoAdvance, advance],
  );

  const toggleRecord = useCallback(async () => {
    if (!line) return;
    if (recorder.state === "recording") {
      const result = await recorder.stop();
      if (!result) {
        setNote("ההקלטה הייתה קצרה מדי. החזיקו קצת יותר.");
        setPhase("error");
        return;
      }
      setTake({ url: result.url, ms: result.durationMs });
      // Hear it immediately: approving a take you have not heard is how a
      // whole session of clipped first syllables happens.
      play(result.url);
      void saveTake(result.blob, line.id);
      return;
    }
    if (recorder.state === "idle") {
      setPhase("idle");
      setNote(null);
      await recorder.start();
    }
  }, [line, recorder, play, saveTake]);

  /* Space bar is the desktop equivalent of the big button. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        void toggleRecord();
      } else if (e.code === "ArrowLeft") {
        step(1);
      } else if (e.code === "ArrowRight") {
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleRecord, step]);

  const onDelete = useCallback(async () => {
    if (!line) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setConfirmDelete(false);
    const res = await removeClip(line.id);
    if (!("messageHe" in res)) {
      setPhase("idle");
      setTake(null);
      return;
    }
    setPhase("error");
    setNote(res.messageHe);
  }, [line, confirmDelete]);

  if (!line) return null;

  const recording = recorder.state === "recording";
  const arming = recorder.state === "arming";
  const blocked = status && !status.writable;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 p-4 pb-28">
      {/* --- header ---------------------------------------------------- */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <Link
            href="/"
            className="rounded-full border-2 border-brand-soft bg-card px-4 py-2 text-lg font-bold"
          >
            <span aria-hidden>‹ </span>לאפליקציה
          </Link>
          <h1 className="text-2xl font-black">אולפן ההקלטות</h1>
          <button
            type="button"
            onClick={() => setAskingPasscode((v) => !v)}
            aria-label="הגדרות"
            className="grid h-11 w-11 place-items-center rounded-full border-2 border-brand-soft bg-card text-xl"
          >
            <span aria-hidden>🔑</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-brand-soft">
            <div
              className="h-full rounded-full bg-go transition-[width]"
              style={{
                width: `${Math.round((counts.done / counts.required) * 100)}%`,
              }}
            />
          </div>
          <p className="ltr text-sm font-bold text-ink-soft">
            {counts.done} / {counts.required}
          </p>
          <a
            href={exportUrl()}
            className="rounded-full border-2 border-brand-soft bg-card px-3 py-2 text-sm font-bold"
            title="הורדת כל ההקלטות כדי לשמור אותן בקוד"
          >
            <span aria-hidden>⬇ </span>ייצוא
          </a>
        </div>
      </header>

      {/* --- setup problems ------------------------------------------- */}
      {blocked ? (
        <p className="rounded-[var(--radius-kid)] border-2 border-warn bg-card p-4 text-lg font-bold">
          <span aria-hidden>⚠️ </span>
          {status?.backend === "none"
            ? "אין מקום לשמור הקלטות. חברו Vercel Blob לפרויקט (docs/voice.md), או הריצו npm run dev והקליטו מקומית."
            : "האחסון לא זמין כרגע."}
        </p>
      ) : null}
      {!recorder.supported ? (
        <p className="rounded-[var(--radius-kid)] border-2 border-warn bg-card p-4 text-lg font-bold">
          <span aria-hidden>⚠️ </span>
          הדפדפן הזה לא יודע להקליט. נסו Chrome או Safari, ותמיד דרך https.
        </p>
      ) : null}
      {recorder.error ? (
        <p className="rounded-[var(--radius-kid)] border-2 border-stop bg-card p-4 text-lg font-bold">
          <span aria-hidden>🎤 </span>
          {recorder.error}
        </p>
      ) : null}

      {askingPasscode ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-kid)] border-2 border-brand-soft bg-card p-4">
          <label className="text-lg font-bold" htmlFor="passcode">
            סיסמת האולפן
          </label>
          <p className="text-sm text-ink-soft">
            {status?.passcodeRequired
              ? "מוגדרת בשרת כ‑VOICE_STUDIO_PASSCODE. נשמרת במכשיר הזה בלבד."
              : "לא נדרשת סיסמה בסביבה הזאת."}
          </p>
          <div className="flex gap-2">
            <input
              id="passcode"
              type="password"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="ltr min-h-12 flex-1 rounded-xl border-2 border-brand-soft px-3 text-lg"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => {
                storePasscode(passcode.trim());
                setAskingPasscode(false);
                setNote("הסיסמה נשמרה במכשיר.");
              }}
              className="min-h-12 rounded-xl bg-brand px-4 text-lg font-bold text-white"
            >
              שמירה
            </button>
          </div>
        </div>
      ) : null}

      {/* --- group chips ------------------------------------------------ */}
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="קבוצות">
        {VOICE_GROUPS.map((g, i) => (
          <button
            key={g.id}
            type="button"
            onClick={() => goTo(i, 0)}
            aria-current={i === groupIdx}
            className="flex shrink-0 items-center gap-2 rounded-full border-2 px-4 py-2 text-base font-bold"
            style={{
              borderColor:
                i === groupIdx ? "var(--color-brand)" : "var(--color-brand-soft)",
              background: i === groupIdx ? "var(--color-brand-soft)" : "var(--color-card)",
            }}
          >
            <span>{g.titleHe}</span>
            {g.optional ? (
              <span className="rounded-full bg-brand-soft px-2 text-xs">רשות</span>
            ) : null}
            <span className="ltr text-sm text-ink-soft">
              {counts.per[i]}/{g.lines.length}
            </span>
          </button>
        ))}
      </nav>

      {/* --- the line -------------------------------------------------- */}
      <section
        className="flex flex-col items-center gap-4 rounded-[var(--radius-kid)] bg-card p-5 shadow-[0_2px_10px_rgba(30,30,60,0.07)]"
        style={{ borderTop: "6px solid var(--color-brand)" }}
        aria-live="polite"
      >
        <p className="text-sm font-bold text-ink-soft">
          {group.titleHe} · {lineIdx + 1} מתוך {group.lines.length}
        </p>

        {line.lang === "en" ? (
          <p className="ltr text-center text-5xl font-black tracking-wide">
            {line.text}
          </p>
        ) : (
          <p className="text-center text-3xl font-bold leading-snug">{line.text}</p>
        )}

        <p className="text-center text-lg text-ink-soft">{line.directionHe}</p>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={!clip && !take}
            onClick={() => play(take?.url ?? clip!.url)}
            className="min-h-12 rounded-full border-2 border-brand-soft bg-card px-4 text-lg font-bold disabled:opacity-40"
          >
            <span aria-hidden>▶️ </span>ההקלטה שלי
          </button>
          {line.fallback ? (
            <button
              type="button"
              onClick={() => speakEn(line.fallback!.text, line.fallback!.rate)}
              className="min-h-12 rounded-full border-2 border-brand-soft bg-card px-4 text-lg font-bold"
              title="ככה זה נשמע היום, בקול הרובוטי"
            >
              <span aria-hidden>🤖 </span>TTS
            </button>
          ) : null}
        </div>

        {/* status line: text AND icon AND colour, never colour alone */}
        <p className="text-center text-lg font-bold">
          {phase === "saving" ? (
            <span className="text-ink-soft">
              <span aria-hidden>⏳ </span>שומר…
            </span>
          ) : phase === "error" ? (
            <span className="text-stop">
              <span aria-hidden>❌ </span>
              {note ?? "משהו נכשל"}
            </span>
          ) : clip ? (
            <span className="text-go">
              <span aria-hidden>✅ </span>הוקלט {relativeHe(clip.updatedAt)}
              {clip.source === "bundled" ? " (מהקוד)" : ""}
            </span>
          ) : (
            <span className="text-ink-soft">
              <span aria-hidden>⚪ </span>עדיין לא הוקלט — משתמשים ב‑TTS
            </span>
          )}
        </p>

        <Meter level={recorder.level} active={recording} />

        <button
          type="button"
          onClick={() => void toggleRecord()}
          disabled={!recorder.supported || Boolean(blocked) || arming}
          className="grid h-32 w-32 place-items-center rounded-full text-xl font-black text-white shadow-[0_6px_0_rgba(0,0,0,0.18)] transition-transform active:translate-y-1 disabled:opacity-40"
          style={{ background: recording ? "var(--color-stop)" : "var(--color-go)" }}
        >
          <span className="flex flex-col items-center gap-1">
            <span aria-hidden className="text-4xl">
              {recording ? "⏹" : "🎤"}
            </span>
            <span>{recording ? "עצור" : clip ? "הקלט שוב" : "הקלט"}</span>
          </span>
        </button>
        <p className="text-sm text-ink-soft">
          {recording
            ? `מקליט… עד ${Math.round(MAX_TAKE_MS / 1000)} שניות`
            : "לחיצה מתחילה, לחיצה שנייה עוצרת ושומרת"}
        </p>

        {clip || take ? (
          <button
            type="button"
            onClick={() => void onDelete()}
            className="min-h-12 rounded-full border-2 px-4 text-base font-bold"
            style={{
              borderColor: confirmDelete ? "var(--color-stop)" : "var(--color-brand-soft)",
              color: confirmDelete ? "var(--color-stop)" : "var(--color-ink-soft)",
            }}
          >
            <span aria-hidden>🗑 </span>
            {confirmDelete ? "בטוח? לחצו שוב למחיקה" : "מחיקת ההקלטה"}
          </button>
        ) : null}
      </section>

      {/* --- move ------------------------------------------------------ */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => step(-1)}
          className="btn-secondary flex-1"
        >
          <span aria-hidden>›</span> הקודם
        </button>
        <button type="button" onClick={() => step(1)} className="btn-secondary flex-1">
          הבא <span aria-hidden>‹</span>
        </button>
      </div>

      <label className="flex items-center justify-center gap-3 text-lg font-bold">
        <input
          type="checkbox"
          checked={autoAdvance}
          onChange={(e) => setAutoAdvance(e.target.checked)}
          className="h-6 w-6"
        />
        לעבור לשורה הבאה אוטומטית אחרי שמירה
      </label>

      {/* --- jump strip ------------------------------------------------ */}
      <section aria-label={`כל השורות בקבוצה ${group.titleHe}`}>
        <p className="mb-2 text-base text-ink-soft">{group.blurbHe}</p>
        <div className="flex max-h-[45vh] flex-wrap gap-2 overflow-y-auto rounded-[var(--radius-kid)] border-2 border-brand-soft bg-card/60 p-2">
          {group.lines.map((l, i) => {
            const done = Boolean(manifest[l.id]);
            const here = i === lineIdx;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setLineIdx(i)}
                aria-current={here}
                className={`min-h-11 rounded-xl border-2 px-3 py-1 text-base font-bold ${
                  l.lang === "en" ? "ltr" : ""
                }`}
                style={{
                  borderColor: here ? "var(--color-brand)" : "var(--color-brand-soft)",
                  background: done ? "var(--color-go-soft)" : "var(--color-card)",
                }}
                title={l.directionHe}
              >
                <span aria-hidden>{done ? "✓ " : "○ "}</span>
                {l.lang === "he" && l.text.length > 30
                  ? `${l.text.slice(0, 30)}…`
                  : l.text}
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}
