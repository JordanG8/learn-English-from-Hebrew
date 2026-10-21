/** Generate Hebrew garden mission instructions. Requires AI_GATEWAY_API_KEY.
 * node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/generate-garden-voice.ts [STEP_IDS]
 * Audio is checked by a separate listening model before the manifest is updated.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { MISSIONS } from "@/lib/garden/curriculum";
const LETTERS = MISSIONS.flatMap(m => m.steps).map(s => ({ letter: s.id, nameHe: s.instruction }));

const key = process.env.AI_GATEWAY_API_KEY;
if (!key) throw new Error("Set AI_GATEWAY_API_KEY in the process environment.");
const model = "google/gemini-3.8-flash-tts";
const judge = "google/gemini-3.8-flash";
const voice = "Kore";
const out = path.resolve("public/voice");
const cache = path.resolve(".voice-cache/garden");
fs.mkdirSync(cache, { recursive: true });
const selected = process.argv[2];
const manifestFile = path.join(out, "index.json");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const reportFile = path.join(cache, "qa.json");
const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, "utf8")) : {};

async function post(url: string, body: unknown, extra: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Gateway returned HTTP ${response.status}`);
  return response.json();
}

async function generate(d: (typeof LETTERS)[number]) {
  const id = `garden-${d.letter}`;
  const text = d.nameHe;
  const speechText = text;
  const version = createHash("sha256").update(speechText + model + voice).digest("hex").slice(0, 8);
  const file = path.join(out, `${id}.mp3`);
  const previous = report[d.letter];
  if (previous?.pass && previous.text === text && fs.existsSync(file)) {
    console.log(`${d.letter}: already checked`);
    return;
  }
  let accepted = false;
  for (let take = 1; take <= 4; take++) {
    const wav = path.join(cache, `${id}-${version}-${take}.wav`);
    const mp3 = path.join(cache, `${id}-${version}-${take}.mp3`);
    if (!fs.existsSync(wav)) {
      const result = await post("https://ai-gateway.vercel.sh/v4/ai/speech-model", {
        text: speechText, voice, outputFormat: "wav",
        instructions: "Speak fluent native Israeli Hebrew as a warm, patient female teacher speaking to a seven-year-old. Read only the given text once, naturally. No extra words or music.",
      }, {
        "ai-gateway-protocol-version": "0.0.1",
        "ai-speech-model-specification-version": "4",
        "ai-model-id": model,
      });
      if (typeof result.audio !== "string") throw new Error("Gateway returned no audio");
      fs.writeFileSync(wav, Buffer.from(result.audio, "base64"));
    }
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", wav, "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.03,loudnorm=I=-18:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "1", "-b:a", "64k", mp3]);
    const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3], { encoding: "utf8" }).trim());
    const review = await post("https://ai-gateway.vercel.sh/v1/chat/completions", {
      model: judge,
      messages: [{ role: "user", content: [
        { type: "text", text: 'Listen blind to this Hebrew educational clip. Return ONLY JSON: {"transcript":string,"naturalness":number,"issue":string}. Transcribe exactly what you hear. Rate fluent native Israeli Hebrew clarity/naturalness 1–10. Report extra words or non-native pronunciation. Do not infer missing speech.' },
        { type: "file", file: { filename: "clip.mp3", file_data: `data:audio/mpeg;base64,${fs.readFileSync(mp3).toString("base64")}` } },
      ] }],
    });
    const raw = review.choices?.[0]?.message?.content ?? "";
    const qa = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    const transcript = String(qa.transcript).replace(/[\u0591-\u05c7]/g, "").replace(/[^א-ת]/g, "");
    const expected = text.replace(/[\u0591-\u05c7]/g, "").replace(/[^א-ת]/g, "");
    const similarity = transcript === expected ? 1 : (() => {
      let row = Array.from({length: expected.length+1}, (_,i)=>i);
      for(let i=0;i<transcript.length;i++){ const next=[i+1]; for(let j=0;j<expected.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+(transcript[i]===expected[j]?0:1))); row=next; }
      return 1-row[expected.length]/Math.max(expected.length,transcript.length);
    })();
    const pass = similarity >= .94 && qa.naturalness >= 7 && duration >= 1 && duration <= 20;
    report[d.letter] = { text, model, voice, judge, take, duration, ...qa, pass };
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
    console.log(`${d.letter}: ${pass ? "PASS" : "RETRY"} ${JSON.stringify(qa)}`);
    if (!pass) continue;
    fs.copyFileSync(mp3, file);
    const clip = { id, url: `/voice/${id}.mp3`, updatedAt: Date.now(), size: fs.statSync(file).size, durationMs: Math.round(duration * 1000) };
    manifest.clips = manifest.clips.filter((c: { id: string }) => c.id !== id);
    manifest.clips.push(clip);
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
    accepted = true;
    break;
  }
  if (!accepted) throw new Error(`Question ${d.letter} failed listening review; not published.`);
}

const pending = LETTERS.filter((d) => !selected || selected.split(",").includes(d.letter));
const failures: string[] = [];
for (let i = 0; i < pending.length; i += 3) {
  const results = await Promise.allSettled(pending.slice(i, i + 3).map(generate));
  results.forEach((result, j) => {
    if (result.status === "rejected") {
      failures.push(pending[i + j]!.letter);
      console.error(`${pending[i + j]!.letter}: generation or review failed`);
    }
  });
}
if (failures.length) throw new Error(`Questions still need generation/review: ${failures.join(", ")}`);
