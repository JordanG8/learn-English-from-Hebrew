#!/usr/bin/env node
/**
 * Rebuild public/audio/manifest.json from whatever audio files are sitting in
 * public/audio.
 *
 * The studio's exported zip already contains a correct manifest, so this is
 * the repair tool: run it after adding, renaming or deleting a clip by hand,
 * or after a merge that took files from two recording sessions.
 *
 *   node scripts/build-audio-manifest.mjs
 */

import { readdirSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "public", "audio");
const AUDIO = new Set([".webm", ".m4a", ".mp3", ".ogg", ".wav", ".mp4", ".aac"]);

if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

const clips = {};
for (const name of readdirSync(DIR).sort()) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) continue;
  if (!AUDIO.has(name.slice(dot).toLowerCase())) continue;
  const id = name.slice(0, dot);
  if (clips[id]) {
    console.warn(`! two files claim "${id}" — keeping ${clips[id]}, ignoring ${name}`);
    continue;
  }
  clips[id] = name;
}

const out = join(DIR, "manifest.json");
writeFileSync(out, `${JSON.stringify({ version: 1, clips }, null, 2)}\n`);
console.log(`wrote ${out} — ${Object.keys(clips).length} clip(s)`);
