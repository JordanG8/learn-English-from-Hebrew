"use client";

/**
 * THE RECORDING STUDIO — /record.
 *
 * The app's weakest moment is a synthesised voice saying "buh" to a child who
 * is trying to hear /b/. The fix is not a better TTS setting; it is a person.
 * This screen is what a person needs in order to become the app's voice in one
 * sitting, without editing a file or knowing what a clip id is:
 *
 *   · ONE PROMPT AT A TIME, large, with the exact text to read and a Hebrew
 *     direction on how to read it. A list of four hundred rows is a reason to
 *     stop; a teleprompter is a reason to keep going.
 *   · SPACE RECORDS. The whole loop — record, hear it, keep it or redo it,
 *     next — runs from the keyboard, because a hand on a mouse is a hand
 *     making mouse noise.
 *   · IT SAVES AS YOU GO, into the same IndexedDB the app plays from. Close
 *     the tab at clip 40 and the app already speaks 40 lines in your voice.
 *   · EXPORT WRITES THE FOLDER. The zip unpacks straight into /public, so
 *     what you recorded for yourself becomes what everyone hears.
 *
 * It is deliberately not linked from the child's screens: it is a grown-up
 * tool that happens to live in the same app.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  REQUIRED_CLIPS,
  VOICE_GROUPS,
  VOICE_SCRIPT,
  clipsInGroup,
  type VoiceClip,
  type VoiceGroupId,
} from "@/lib/voice-script";
import {
  clipSource,
  clipUrl,
  deleteClip,
  hasClip,
  initVoice,
  onVoiceChange,
  saveClip,
  stopClip,
  allClips,
  type AudioManifest,
} from "@/lib/voice";
import { download, zip, type ZipEntry } from "@/lib/zip";

/* ------------------------------------------------------------------ */
/* Recording plumbing                                                   */
/* ------------------------------------------------------------------ */

/** Chrome/Firefox give Opus in WebM; Safari gives AAC in MP4. Both are fine. */
const PREFERRED_MIME = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME.find((m) => {
    try {
      return MediaRecorder.isTypeSupported(m);
    } catch {
      return false;
    }
  });
}

export function extensionFor(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg")) return "mp3";
  return "webm";
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                         */
/* ------------------------------------------------------------------ */

function Meter({ level }: { level: number }) {
  // Three zones, three redundant channels: width, colour, and the label.
  const pct = Math.min(100, Math.round(level * 140));
  const tooQuiet = level < 0.04;
  const tooLoud = level > 0.85;
  return (
    <div>
      <div className="h-4 w-full overflow-hidden rounded-full bg-brand-soft">
        <div
          className="h-full rounded-full transition-[width] duration-75"
          style={{
            width: `${pct}%`,
            background: tooLoud ? "var(--color-stop)" : "var(--color-go)",
          }}
        />
      </div>
      <p className="mt-1 text-center text-sm text-ink-soft">
        {tooLoud ? "חזק מדי — התרחק קצת" : tooQuiet ? "כמעט לא נשמע — התקרב למיקרופון" : "עוצמה טובה"}
      </p>
    </div>
  );
}

function GroupChip({
  title,
  done,
  total,
  active,
  optional,
  onClick,
}: {
  title: string;
  done: number;
  total: number;
  active: boolean;
  optional: boolean;
  onClick: () => void;
}) {
  const complete = done >= total && total > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-[var(--radius-kid)] border-[3px] px-4 py-3 text-right ${
        active ? "border-brand bg-brand-soft" : "border-brand-soft bg-card"
      }`}
    >
      <span className="block font-bold">
        {complete ? "✅ " : optional ? "◻️ " : "🎙️ "}
        {title}
      </span>
      <span className="block text-sm text-ink-soft">
        {/* Counts are LTR: in an RTL paragraph "3 / 25" renders as "25 / 3". */}
        <span dir="ltr">
          {done} / {total}
        </span>
        {optional ? " · רשות" : ""}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* The studio                                                           */
/* ------------------------------------------------------------------ */

export function RecorderStudio() {
  const [group, setGroup] = useState<VoiceGroupId>(VOICE_GROUPS[0]!.id);
  const [index, setIndex] = useState(0);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped whenever the clip store changes, so counts and badges re-render.
  const [revision, setRevision] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const rafRef = useRef(0);
  const peakRef = useRef(0);

  useEffect(() => {
    void initVoice().then(() => setRevision((n) => n + 1));
    return onVoiceChange(() => setRevision((n) => n + 1));
  }, []);

  /* --- What we are looking at --------------------------------------- */
  const groupClips = useMemo(() => clipsInGroup(group), [group]);
  const list = useMemo(() => {
    void revision;
    return onlyMissing ? groupClips.filter((c) => !hasClip(c.id)) : groupClips;
  }, [groupClips, onlyMissing, revision]);

  const clip: VoiceClip | undefined = list[Math.min(index, list.length - 1)];

  useEffect(() => {
    setIndex(0);
  }, [group, onlyMissing]);

  const counts = useMemo(() => {
    void revision;
    const per = new Map<VoiceGroupId, { done: number; total: number }>();
    for (const g of VOICE_GROUPS) per.set(g.id, { done: 0, total: 0 });
    for (const c of VOICE_SCRIPT) {
      const row = per.get(c.group)!;
      row.total += 1;
      if (hasClip(c.id)) row.done += 1;
    }
    const requiredDone = REQUIRED_CLIPS.filter((c) => hasClip(c.id)).length;
    return { per, requiredDone, requiredTotal: REQUIRED_CLIPS.length };
  }, [revision]);

  /* --- Playback ------------------------------------------------------ */
  const play = useCallback(async (id: string) => {
    const url = await clipUrl(id);
    if (!url) return;
    stopClip();
    try {
      await new Audio(url).play();
    } catch {
      /* a blocked autoplay is not worth an error message here */
    }
  }, []);

  /* --- Recording ----------------------------------------------------- */
  const stopMeter = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setLevel(0);
  }, []);

  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      const ac = new Ctor();
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i]! * buf[i]!;
        const rms = Math.sqrt(sum / buf.length);
        peakRef.current = Math.max(peakRef.current, rms);
        setLevel(rms);
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* no meter is survivable; recording is not */
    }
  }, []);

  const getStream = useCallback(async (): Promise<MediaStream | null> => {
    if (streamRef.current) return streamRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // A voice for children, recorded on a laptop mic in a kitchen: let
          // the browser clean it up.
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      setError(null);
      return stream;
    } catch {
      setError("אין גישה למיקרופון. אשרו את ההרשאה בדפדפן ונסו שוב.");
      return null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (!clip || recording) return;
    const mime = pickMime();
    if (typeof MediaRecorder === "undefined") {
      setError("הדפדפן הזה לא יודע להקליט. נסו Chrome, Edge או Safari מעודכן.");
      return;
    }
    const stream = await getStream();
    if (!stream) return;

    chunksRef.current = [];
    peakRef.current = 0;
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    recorderRef.current = rec;
    const id = clip.id;

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      stopMeter();
      setRecording(false);
      const seconds = (Date.now() - startedAtRef.current) / 1000;
      const blob = new Blob(chunksRef.current, {
        type: rec.mimeType || mime || "audio/webm",
      });
      chunksRef.current = [];
      if (blob.size < 512 || seconds < 0.25) {
        setError("ההקלטה קצרה מדי — לחצו והחזיקו עד סוף המשפט.");
        return;
      }
      if (peakRef.current < 0.02) {
        setError("לא נקלט כמעט קול. בדקו שהמיקרופון הנכון נבחר, והקליטו שוב.");
      }
      setBusy(true);
      void saveClip(id, blob, seconds)
        .then((ok) => {
          if (!ok) {
            setError("השמירה נכשלה. אם הדפדפן במצב פרטי, ההקלטות לא נשמרות.");
            return;
          }
          void play(id);
          if (autoAdvance) {
            // Long enough to hear the take back before the next prompt lands.
            window.setTimeout(
              () => setIndex((i) => Math.min(i + 1, list.length - 1)),
              Math.min(2200, seconds * 1000 + 400),
            );
          }
        })
        .finally(() => setBusy(false));
    };

    setError(null);
    startedAtRef.current = Date.now();
    setElapsed(0);
    rec.start();
    setRecording(true);
    startMeter(stream);
  }, [clip, recording, getStream, stopMeter, startMeter, play, autoAdvance, list.length]);

  /* Recording clock. */
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(
      () => setElapsed((Date.now() - startedAtRef.current) / 1000),
      100,
    );
    // Nobody means to leave the recorder running; 30s is a runaway.
    const cap = window.setTimeout(stopRecording, 30_000);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(cap);
    };
  }, [recording, stopRecording]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  /* --- Keyboard: the whole loop without touching the mouse ----------- */
  const move = useCallback(
    (delta: number) =>
      setIndex((i) => Math.min(Math.max(i + delta, 0), Math.max(0, list.length - 1))),
    [list.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (recording) stopRecording();
        else void startRecording();
        return;
      }
      if (e.key === "Enter" && clip) {
        e.preventDefault();
        void play(clip.id);
        return;
      }
      // The page is RTL but the script runs top-to-bottom: Down/Right = next.
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        move(1);
      }
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        move(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [recording, startRecording, stopRecording, clip, play, move]);

  /* --- Export / import ----------------------------------------------- */
  const [exporting, setExporting] = useState(false);

  const exportPack = useCallback(async () => {
    setExporting(true);
    try {
      const stored = await allClips();
      if (stored.length === 0) {
        setError("אין עדיין הקלטות לייצא.");
        return;
      }
      const manifest: AudioManifest = { version: 1, clips: {} };
      const entries: ZipEntry[] = [];
      for (const rec of stored) {
        const file = `${rec.id}.${extensionFor(rec.mime)}`;
        manifest.clips[rec.id] = file;
        entries.push({
          name: `audio/${file}`,
          data: new Uint8Array(await rec.blob.arrayBuffer()),
        });
      }
      const enc = new TextEncoder();
      entries.push({
        name: "audio/manifest.json",
        data: enc.encode(JSON.stringify(manifest, null, 2)),
      });
      entries.push({
        name: "audio/README.txt",
        data: enc.encode(
          [
            "Voice pack for learn-English-from-Hebrew.",
            "",
            "Unzip this into the repository's public/ directory, so the files",
            "land at public/audio/<clip-id>.<ext> next to manifest.json, then",
            "commit them. lib/voice.ts reads manifest.json at startup and",
            "plays these files instead of the browser's speech synthesiser.",
            "",
            `Clips: ${stored.length}`,
            `Exported: ${new Date().toISOString()}`,
          ].join("\n"),
        ),
      });
      download(zip(entries), "efh-voice-pack.zip");
    } finally {
      setExporting(false);
    }
  }, []);

  const importFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setBusy(true);
      let added = 0;
      for (const file of Array.from(files)) {
        const id = file.name.replace(/\.[^.]+$/, "");
        if (!VOICE_SCRIPT.some((c) => c.id === id)) continue;
        const ok = await saveClip(id, file, 0);
        if (ok) added += 1;
      }
      setBusy(false);
      setError(
        added > 0
          ? null
          : "אף קובץ לא התאים לשם של הקלטה בסקריפט. השם חייב להיות מזהה הקטע.",
      );
      setRevision((n) => n + 1);
    },
    [],
  );

  /* --- Render --------------------------------------------------------- */
  const groupMeta = VOICE_GROUPS.find((g) => g.id === group)!;
  const source = clip ? clipSource(clip.id) : null;
  const pct = Math.round((counts.requiredDone / Math.max(1, counts.requiredTotal)) * 100);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-5 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">אולפן ההקלטות</h1>
          <p className="text-ink-soft">
            הקול שלך מחליף את הקריין הסינתטי. כל הקלטה נשמרת מיד ונשמעת מיד באפליקציה.
          </p>
        </div>
        <Link href="/" className="text-lg font-bold text-brand underline">
          חזרה לאפליקציה
        </Link>
      </header>

      {/* Overall progress: the required part of the script only. */}
      <section aria-label="התקדמות" className="rounded-[var(--radius-kid)] bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="font-bold">הוקלטו {counts.requiredDone} מתוך {counts.requiredTotal}</span>
          <span className="text-ink-soft">{pct}% מהחלק ההכרחי</span>
        </div>
        <div className="h-4 w-full overflow-hidden rounded-full bg-brand-soft">
          <div className="h-full rounded-full bg-go" style={{ width: `${pct}%` }} />
        </div>
      </section>

      <nav aria-label="חלקי הסקריפט" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {VOICE_GROUPS.map((g) => {
          const c = counts.per.get(g.id)!;
          return (
            <GroupChip
              key={g.id}
              title={g.titleHe}
              done={c.done}
              total={c.total}
              optional={g.optional}
              active={g.id === group}
              onClick={() => setGroup(g.id)}
            />
          );
        })}
      </nav>

      <p className="text-ink-soft">{groupMeta.blurbHe}</p>

      {/* The teleprompter. */}
      <section className="flex flex-col gap-4 rounded-[var(--radius-kid)] bg-card p-5">
        {clip ? (
          <>
            <div className="flex items-center justify-between text-sm text-ink-soft">
              <span dir="ltr">
                {Math.min(index + 1, list.length)} / {list.length}
              </span>
              <span className="ltr font-mono">{clip.id}</span>
            </div>

            <p
              dir={clip.lang === "en" ? "ltr" : "rtl"}
              className={`text-center text-5xl font-black leading-tight ${
                clip.lang === "en" ? "ltr" : "rtl"
              }`}
            >
              {clip.text}
            </p>

            <p className="text-center text-lg">{clip.directionHe}</p>
            {clip.contextHe ? (
              <p className="text-center text-sm text-ink-soft">{clip.contextHe}</p>
            ) : null}

            <div className="flex items-center justify-center gap-2 text-sm">
              {source === "local" ? (
                <span className="rounded-full bg-go-soft px-3 py-1 font-bold">
                  🎙️ מוקלט כאן
                </span>
              ) : source === "shipped" ? (
                <span className="rounded-full bg-brand-soft px-3 py-1 font-bold">
                  📦 מהחבילה שנשלחה
                </span>
              ) : (
                <span className="rounded-full bg-brand-soft px-3 py-1 font-bold text-ink-soft">
                  עדיין לא הוקלט
                </span>
              )}
            </div>

            {recording ? <Meter level={level} /> : null}

            <button
              type="button"
              onClick={() => (recording ? stopRecording() : void startRecording())}
              className="grid min-h-[6rem] w-full place-items-center rounded-[var(--radius-kid)] text-2xl font-black text-white"
              style={{
                background: recording ? "var(--color-stop)" : "var(--color-brand)",
              }}
            >
              {recording ? `⏹️ עצור (${elapsed.toFixed(1)} שניות)` : "🎙️ הקלט — או רווח"}
            </button>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => move(-1)}
                disabled={index <= 0}
                className="min-h-16 rounded-[var(--radius-kid)] border-[3px] border-brand-soft bg-card text-lg font-bold disabled:opacity-40"
              >
                ⬅️ הקודם
              </button>
              <button
                type="button"
                onClick={() => void play(clip.id)}
                disabled={!hasClip(clip.id)}
                className="min-h-16 rounded-[var(--radius-kid)] border-[3px] border-brand-soft bg-card text-lg font-bold disabled:opacity-40"
              >
                🔊 השמע
              </button>
              <button
                type="button"
                onClick={() => move(1)}
                disabled={index >= list.length - 1}
                className="min-h-16 rounded-[var(--radius-kid)] border-[3px] border-brand-soft bg-card text-lg font-bold disabled:opacity-40"
              >
                הבא ➡️
              </button>
            </div>

            {source === "local" ? (
              <button
                type="button"
                onClick={() => void deleteClip(clip.id)}
                className="text-center text-sm font-bold text-stop underline"
              >
                מחק את ההקלטה הזאת
              </button>
            ) : null}
          </>
        ) : (
          <p className="py-10 text-center text-xl font-bold">
            הכול הוקלט בחלק הזה. 🎉
          </p>
        )}
      </section>

      {error ? (
        <p role="status" className="rounded-[var(--radius-kid)] bg-brand-soft p-4 font-bold">
          ⚠️ {error}
        </p>
      ) : null}

      <section className="flex flex-wrap items-center gap-4 rounded-[var(--radius-kid)] bg-card p-4">
        <label className="flex items-center gap-2 text-lg">
          <input
            type="checkbox"
            className="h-6 w-6"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
          />
          רק מה שחסר
        </label>
        <label className="flex items-center gap-2 text-lg">
          <input
            type="checkbox"
            className="h-6 w-6"
            checked={autoAdvance}
            onChange={(e) => setAutoAdvance(e.target.checked)}
          />
          מעבר אוטומטי לשורה הבאה
        </label>
      </section>

      <section className="flex flex-col gap-3 rounded-[var(--radius-kid)] bg-card p-4">
        <h2 className="text-xl font-black">להעביר את הקול לאפליקציה</h2>
        <p className="text-ink-soft">
          ההקלטות כבר פועלות במכשיר הזה. כדי שכל ילד ישמע אותן, ייצאו את החבילה,
          פרקו אותה לתוך <span className="ltr font-mono">public/</span> בפרויקט ובצעו
          commit — הקבצים ינחתו ב־
          <span className="ltr font-mono">public/audio/</span> יחד עם
          <span className="ltr font-mono"> manifest.json</span>.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void exportPack()}
            disabled={exporting || busy}
            className="min-h-16 rounded-[var(--radius-kid)] bg-go px-6 text-lg font-black text-white disabled:opacity-50"
          >
            {exporting ? "אורז…" : "⬇️ ייצוא חבילת קול (zip)"}
          </button>
          <label className="min-h-16 cursor-pointer rounded-[var(--radius-kid)] border-[3px] border-brand-soft bg-card px-6 py-4 text-lg font-bold">
            ⬆️ ייבוא קבצים
            <input
              type="file"
              accept="audio/*"
              multiple
              className="hidden"
              onChange={(e) => void importFiles(e.target.files)}
            />
          </label>
        </div>
        <p className="text-sm text-ink-soft">
          קיצורים: רווח = הקלטה/עצירה · Enter = השמעה · חיצים = מעבר בין שורות.
        </p>
      </section>
    </main>
  );
}

export default RecorderStudio;
