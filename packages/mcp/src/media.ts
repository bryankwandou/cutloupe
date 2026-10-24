// Local media: probing, hashing, extracting audio and subtitle tracks, and
// optional speech-to-text when a Whisper CLI is installed.

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { AssetKind, Word } from "@cutloupe/core";

export function which(cmd: string): string | null {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [cmd], { encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).find(Boolean)?.trim() ?? null;
}

export const FFMPEG = process.env.CUTLOUPE_FFMPEG || which("ffmpeg") || "ffmpeg";
export const FFPROBE = process.env.CUTLOUPE_FFPROBE || which("ffprobe") || "ffprobe";

export function run(cmd: string, args: string[], opts: { input?: Buffer } = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code: code ?? 1, stdout: out, stderr: err }));
    if (opts.input) p.stdin.end(opts.input);
    else p.stdin.end();
  });
}

export interface Probe {
  kind: AssetKind;
  duration: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
  subtitleStreams: number;
}

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".avif"]);

export async function probe(file: string): Promise<Probe> {
  const r = await run(FFPROBE, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file]);
  if (r.code !== 0) throw new Error(`ffprobe could not read ${file}: ${r.stderr.trim().split("\n").pop()}`);
  const j = JSON.parse(r.stdout) as { streams: { codec_type: string; width?: number; height?: number; duration?: string; disposition?: { attached_pic?: number } }[]; format: { duration?: string } };
  const v = j.streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const hasAudio = j.streams.some((s) => s.codec_type === "audio");
  const subs = j.streams.filter((s) => s.codec_type === "subtitle").length;
  const ext = path.extname(file).toLowerCase();
  const duration = parseFloat(j.format.duration ?? v?.duration ?? "0") || 0;
  if (IMAGE_EXT.has(ext) || (v && duration === 0)) return { kind: "image", duration: 0, width: v?.width, height: v?.height, hasAudio: false, subtitleStreams: 0 };
  if (v) return { kind: "video", duration, width: v.width, height: v.height, hasAudio, subtitleStreams: subs };
  if (hasAudio) return { kind: "audio", duration, hasAudio: true, subtitleStreams: subs };
  throw new Error(`${file} has no video, image or audio stream`);
}

export function sha256File(file: string): Promise<string> {
  return new Promise((res, rej) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("error", rej).on("end", () => res(h.digest("hex")));
  });
}

/** Pull the audio out of a video into a WAV, so it can sit on a music track on its own. */
export async function extractAudio(file: string, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true });
  const out = path.join(outDir, `${path.parse(file).name}-audio.wav`);
  const r = await run(FFMPEG, ["-y", "-v", "error", "-i", file, "-vn", "-ac", "2", "-ar", "48000", "-c:a", "pcm_s16le", out]);
  if (r.code !== 0) throw new Error(`ffmpeg could not extract audio: ${r.stderr.trim().split("\n").pop()}`);
  return out;
}

// ---------- captions ----------

export interface Cue { t0: number; t1: number; text: string }

function parseStamp(s: string): number {
  const m = s.trim().replace(",", ".").match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/);
  if (!m) return NaN;
  return (+(m[1] ?? 0)) * 3600 + +m[2] * 60 + +m[3];
}

export function parseSubtitles(text: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = text.replace(/\r/g, "").replace(/^﻿/, "").split(/\n{2,}/);
  for (const b of blocks) {
    const lines = b.split("\n").filter((l) => l.trim() && l.trim() !== "WEBVTT");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, z] = lines[i].split("-->");
    const t0 = parseStamp(a), t1 = parseStamp(z.split(/\s+/).filter(Boolean)[0] ?? "");
    const body = lines.slice(i + 1).join(" ").replace(/<[^>]+>/g, "").replace(/\{[^}]+\}/g, "").trim();
    if (Number.isFinite(t0) && Number.isFinite(t1) && body) cues.push({ t0, t1, text: body });
  }
  return cues;
}

/** Spread each cue's words across its time span, weighted by word length. */
export function cuesToWords(cues: Cue[]): Word[] {
  const words: Word[] = [];
  for (const c of cues) {
    const parts = c.text.split(/\s+/).filter(Boolean);
    const weights = parts.map((w) => 1 + w.length * 0.18);
    const total = weights.reduce((a, b) => a + b, 0);
    let t = c.t0;
    parts.forEach((w, i) => {
      const d = ((c.t1 - c.t0) * weights[i]) / total;
      words.push({ t0: +t.toFixed(3), t1: +(t + d * 0.92).toFixed(3), w });
      t += d;
    });
  }
  return words;
}

export interface CaptionResult {
  source: "subtitle-file" | "embedded-subtitles" | "whisper";
  words: Word[];
  cues: Cue[];
  detail: string;
}

/**
 * Captions from, in order: a .srt/.vtt file, a subtitle stream inside the
 * video, or speech-to-text through a local Whisper CLI if one is installed.
 */
export async function extractCaptions(file: string, workDir: string, language?: string): Promise<CaptionResult> {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".srt" || ext === ".vtt") {
    const cues = parseSubtitles(readFileSync(file, "utf8"));
    return { source: "subtitle-file", cues, words: cuesToWords(cues), detail: `${cues.length} cues from ${path.basename(file)}` };
  }
  await mkdir(workDir, { recursive: true });
  const info = await probe(file);
  if (info.subtitleStreams > 0) {
    const out = path.join(workDir, `${path.parse(file).name}.srt`);
    const r = await run(FFMPEG, ["-y", "-v", "error", "-i", file, "-map", "0:s:0", out]);
    if (r.code === 0 && existsSync(out)) {
      const cues = parseSubtitles(readFileSync(out, "utf8"));
      if (cues.length) return { source: "embedded-subtitles", cues, words: cuesToWords(cues), detail: `${cues.length} cues from the first subtitle stream` };
    }
  }
  if (!info.hasAudio) throw new Error("This file has no subtitle stream and no audio to transcribe.");
  const whisper = which("whisper") ? "whisper" : which("whisper-cli") ? "whisper-cli" : null;
  if (!whisper) {
    throw new Error(
      "No subtitle stream in this file and no speech-to-text engine found. Either pass a .srt/.vtt file, " +
        "or install OpenAI Whisper (`pip install -U openai-whisper`) so `whisper` is on PATH, then call extract_captions again.",
    );
  }
  const wav = path.join(workDir, `${path.parse(file).name}-16k.wav`);
  await run(FFMPEG, ["-y", "-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "16000", wav]);
  let srt: string;
  if (whisper === "whisper") {
    const args = [wav, "--output_format", "srt", "--output_dir", workDir, "--word_timestamps", "True", "--max_words_per_line", "4", "--model", process.env.CUTLOUPE_WHISPER_MODEL || "base"];
    if (language) args.push("--language", language);
    const r = await run(whisper, args);
    if (r.code !== 0) throw new Error(`whisper failed: ${r.stderr.trim().split("\n").pop()}`);
    srt = path.join(workDir, `${path.parse(wav).name}.srt`);
  } else {
    const model = process.env.CUTLOUPE_WHISPER_MODEL;
    if (!model) throw new Error("whisper-cli (whisper.cpp) needs a model: set CUTLOUPE_WHISPER_MODEL to a ggml model file path.");
    const base = path.join(workDir, path.parse(wav).name);
    const args = ["-m", model, "-f", wav, "-osrt", "-ml", "18", "-of", base];
    if (language) args.push("-l", language);
    const r = await run(whisper, args);
    if (r.code !== 0) throw new Error(`whisper-cli failed: ${r.stderr.trim().split("\n").pop()}`);
    srt = `${base}.srt`;
  }
  const cues = parseSubtitles(readFileSync(srt, "utf8"));
  return { source: "whisper", cues, words: cuesToWords(cues), detail: `${cues.length} cues transcribed by ${whisper}` };
}
