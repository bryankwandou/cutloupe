// Cutloupe MCP server. One process does three jobs:
//  1. speaks MCP over stdio to the agent (tools below),
//  2. serves the studio at http://127.0.0.1:4321 and pushes every edit to it over WebSocket,
//  3. renders frames in headless Chrome so the agent can look at its own output.

import { spawn } from "node:child_process";
import { once } from "node:events";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Activity,
  type Asset,
  type CaptionLook,
  type Clip,
  type FormatName,
  type MotionPreset,
  type MusicEntry,
  type Op,
  type Project,
  type ServerMsg,
  type ClientMsg,
  type TextPreset,
  type TransitionType,
  FORMATS,
  LIBRARY,
  MOTION_PRESETS,
  OpError,
  Session,
  TEXT_PRESETS,
  activeClips,
  emptyProject,
  findClip,
  makeAudio,
  makeCaptions,
  makeFill,
  makeMedia,
  makeShape,
  makeText,
  motion,
  newId,
  projectDuration,
  slug,
  synthesize,
  timelineHash,
  toCapcutDraft,
  toFcpxml,
  toOtio,
  toRemotion,
  toSrt,
  toVtt,
  toWav,
  toXmeml,
  wordsFromText,
} from "@cutloupe/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebSocketServer, type WebSocket } from "ws";
import { z } from "zod";
import { ACTOR, FLAGS, Ledger, PROGRAM_ID, CLUSTER, explorer } from "./ledger";
import { FFMPEG, extractAudio, extractCaptions, probe, run, sha256File } from "./media";
import { Renderer } from "./renderer";

const VERSION = "0.1.0";
const log = (...a: unknown[]) => console.error("[cutloupe]", ...a);
const HOME = process.env.CUTLOUPE_HOME || path.join(os.homedir(), ".cutloupe");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_DIR = [path.resolve(HERE, "../studio"), path.resolve(HERE, "../../studio/dist")].find((d) => existsSync(path.join(d, "index.html"))) ?? path.resolve(HERE, "../studio");

// ---------- state ----------
const session = new Session(emptyProject("Untitled reel"));
const clients = new Set<WebSocket>();
let port = Number(process.env.CUTLOUPE_PORT || 4321);
const baseUrl = () => `http://127.0.0.1:${port}`;
const renderer = new Renderer(baseUrl);
let ledgerP: Promise<Ledger | null> | null = null;
const getLedger = () => (ledgerP ??= Ledger.fromEnv().catch((e) => { log("ledger disabled:", (e as Error).message); return null; }));
let opened = false;

function projectDir(p: Project = session.project) {
  return path.join(HOME, "projects", p.id);
}

let saveTimer: NodeJS.Timeout | null = null;
function autosave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const dir = projectDir();
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "project.cutloupe.json"), JSON.stringify(session.project, null, 2));
  }, 250);
}

async function broadcast(activity?: Activity) {
  const hash = await timelineHash(session.project);
  const msg: ServerMsg = { type: "state", project: session.project, hash, activity, canUndo: session.canUndo, canRedo: session.canRedo };
  const s = JSON.stringify(msg);
  for (const c of clients) if (c.readyState === 1) c.send(s);
}
function broadcastActivity(activity: Activity) {
  const s = JSON.stringify({ type: "activity", activity } satisfies ServerMsg);
  for (const c of clients) if (c.readyState === 1) c.send(s);
}

function apply(ops: Op[], actor: "agent" | "human", label?: string): Activity {
  const a = session.apply(ops, actor, label);
  autosave();
  void broadcast(a);
  return a;
}

// ---------- music library ----------
function musicList(): MusicEntry[] {
  return LIBRARY.map((r) => ({ id: r.id, name: r.name, mood: r.mood, bpm: r.bpm, seconds: r.seconds, src: `/music/${r.id}.wav`, license: "CC0 (Cutloupe original, synthesised from code)" }));
}
async function musicFile(id: string): Promise<string> {
  const r = LIBRARY.find((x) => x.id === id);
  if (!r) throw new OpError(`no track "${id}"; call list_music`);
  const file = path.join(HOME, "music", `${id}.wav`);
  if (!existsSync(file)) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, toWav(synthesize(r, 44100), 44100));
  }
  return file;
}
async function musicAsset(id: string): Promise<Asset> {
  const r = LIBRARY.find((x) => x.id === id)!;
  const file = await musicFile(id);
  return { id: `music_${id}`, kind: "audio", name: r.name, src: `/music/${id}.wav`, path: file, duration: r.seconds, hasAudio: true, license: "CC0", bpm: r.bpm, mood: r.mood, sha256: await sha256File(file) };
}

// ---------- media import ----------
async function importFile(file: string, actor: "agent" | "human", name?: string): Promise<Asset> {
  const abs = path.resolve(file);
  if (!existsSync(abs)) throw new OpError(`file not found: ${abs}`);
  const info = await probe(abs);
  const asset: Asset = {
    id: newId("asset"),
    kind: info.kind,
    name: name ?? path.basename(abs),
    src: "",
    path: abs,
    duration: +info.duration.toFixed(3),
    width: info.width,
    height: info.height,
    hasAudio: info.hasAudio,
    sha256: await sha256File(abs),
  };
  asset.src = `/media/${asset.id}${path.extname(abs).toLowerCase()}`;
  apply([{ op: "add_asset", asset }], actor);
  return asset;
}

// ---------- HTTP + WebSocket ----------
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska", ".m4v": "video/mp4",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac", ".json": "application/json",
};

function sendFile(req: http.IncomingMessage, res: http.ServerResponse, file: string) {
  const size = statSync(file).size;
  const type = MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  const headers = { "Content-Type": type, "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache" };
  if (range) {
    const start = range[1] ? +range[1] : size - +range[2];
    const end = range[1] && range[2] ? Math.min(+range[2], size - 1) : size - 1;
    if (start >= size || start > end) { res.writeHead(416, { "Content-Range": `bytes */${size}` }); return res.end(); }
    res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...headers, "Content-Length": size });
    createReadStream(file).pipe(res);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith("/media/")) {
      const id = path.parse(p.slice(7)).name;
      const a = session.project.assets[id];
      if (!a?.path || !existsSync(a.path)) { res.writeHead(404); return res.end("no such media"); }
      return sendFile(req, res, a.path);
    }
    if (p.startsWith("/music/")) return sendFile(req, res, await musicFile(path.parse(p).name));
    if (p === "/api/project") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(session.project)); }
    if (p === "/api/upload" && req.method === "POST") {
      const name = path.basename(url.searchParams.get("name") || "upload.bin").replace(/[^\w.\- ]+/g, "_");
      const dir = path.join(projectDir(), "media");
      await mkdir(dir, { recursive: true });
      const dest = path.join(dir, `${Date.now().toString(36)}-${name}`);
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      await writeFile(dest, Buffer.concat(chunks));
      const asset = await importFile(dest, "human", name);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(asset));
    }
    const rel = p === "/" ? "index.html" : p.replace(/^\/+/, "");
    const file = path.resolve(STUDIO_DIR, rel);
    if (!file.startsWith(STUDIO_DIR) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
    sendFile(req, res, file);
  } catch (e) {
    res.writeHead(500);
    res.end((e as Error).message);
  }
});

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, sock, head) => {
  if (!req.url?.startsWith("/ws")) return sock.destroy();
  wss.handleUpgrade(req, sock, head, (ws) => wss.emit("connection", ws));
});
wss.on("connection", async (ws: WebSocket) => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
  const hello: ServerMsg = {
    type: "hello", project: session.project, activity: session.activity.slice(-120), music: musicList(), hash: await timelineHash(session.project),
    canUndo: session.canUndo, canRedo: session.canRedo, ledger: Ledger.enabled() ? { cluster: CLUSTER, programId: PROGRAM_ID } : undefined,
  };
  ws.send(JSON.stringify(hello));
  ws.on("message", async (raw) => {
    let msg: ClientMsg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    try {
      if (msg.type === "ops") apply(msg.ops, "human", msg.label);
      else if (msg.type === "undo") { const a = session.undo("human"); autosave(); await broadcast(a ?? undefined); }
      else if (msg.type === "redo") { const a = session.redo("human"); autosave(); await broadcast(a ?? undefined); }
      else if (msg.type === "export") {
        const r = await doExport(msg.format, undefined, "human");
        broadcastActivity(session.log("human", "export", `Exported ${msg.format} to ${r.dir}`));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", message: (e as Error).message } satisfies ServerMsg));
      await broadcast();
    }
  });
});

async function listen(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    try {
      await new Promise<void>((res, rej) => {
        server.once("error", rej);
        server.listen(port, "127.0.0.1", () => { server.off("error", rej); res(); });
      });
      return;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw e;
      port++;
    }
  }
  throw new Error("no free port between 4321 and 4340");
}

function openBrowser(url: string) {
  const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
}
function ensureStudioOpen() {
  if (opened || process.env.CUTLOUPE_NO_OPEN === "1" || clients.size > 0) return;
  opened = true;
  openBrowser(baseUrl());
}

// ---------- export ----------
async function doExport(format: string, out: string | undefined, actor: "agent" | "human"): Promise<{ dir: string; files: string[]; notes: string[]; mp4?: string }> {
  const p = session.project;
  const dir = path.resolve(out ?? path.join(HOME, "exports", `${slug(p.name)}-${p.id.slice(-6)}`, format));
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  const put = async (rel: string, content: string | Buffer) => {
    const f = path.join(dir, rel);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, content);
    written.push(f);
  };
  let notes: string[] = [];
  if (format === "mp4") {
    const file = path.join(dir, `${slug(p.name)}.mp4`);
    await renderMp4(p, file, (done, total) => {
      if (done === total || done % (p.fps * 2) === 0) broadcastActivity(session.log(actor, "note", `Rendering MP4: frame ${done} of ${total}`));
    });
    written.push(file);
    return { dir, files: written, notes, mp4: file };
  }
  if (format === "srt") await put(`${slug(p.name)}.srt`, toSrt(p));
  else if (format === "vtt") await put(`${slug(p.name)}.vtt`, toVtt(p));
  else if (format === "project") await put(`${slug(p.name)}.cutloupe.json`, JSON.stringify(p, null, 2));
  else {
    const fn = { fcpxml: toFcpxml, xmeml: toXmeml, premiere: toXmeml, resolve: toFcpxml, otio: toOtio, capcut: toCapcutDraft, remotion: toRemotion }[format];
    if (!fn) throw new OpError(`unknown format "${format}". Use mp4, fcpxml, xmeml, otio, capcut, remotion, srt, vtt or project.`);
    const b = fn(p);
    for (const f of b.files) await put(f.path, f.content);
    if (format === "remotion") {
      for (const a of Object.values(p.assets)) if (a.path) { const d = path.join(dir, "public", "media", `${a.id}${path.extname(a.path)}`); await mkdir(path.dirname(d), { recursive: true }); await copyFile(a.path, d); }
      b.notes = b.notes.filter((n) => !n.includes("copies media"));
      b.notes.unshift("Media copied into public/media. Run `npm install` then `npm run studio` in this folder.");
    }
    notes = b.notes;
    if (notes.length) await put("NOTES.txt", notes.join("\n") + "\n");
  }
  return { dir, files: written, notes };
}

async function renderMp4(p: Project, file: string, progress: (done: number, total: number) => void) {
  const dur = projectDuration(p);
  if (dur <= 0) throw new OpError("the timeline is empty");
  const n = Math.max(1, Math.round(dur * p.fps));
  const args = ["-y", "-v", "error", "-f", "image2pipe", "-framerate", String(p.fps), "-c:v", "mjpeg", "-i", "-"];
  const filters: string[] = [];
  const labels: string[] = [];
  let input = 1;
  for (const tr of p.tracks) {
    if (tr.muted) continue;
    for (const c of tr.clips) {
      if (c.kind !== "audio" && c.kind !== "media") continue;
      const a = p.assets[c.assetId];
      if (!a?.path || (c.kind === "media" && (!a.hasAudio || c.volume <= 0 || tr.hidden))) continue;
      args.push("-ss", c.trimIn.toFixed(3), "-t", c.duration.toFixed(3), "-i", a.path);
      const chain = [`aformat=sample_rates=48000:channel_layouts=stereo`, `volume=${c.volume.toFixed(3)}`];
      if (c.kind === "audio") {
        if (c.fadeIn > 0) chain.push(`afade=t=in:st=0:d=${c.fadeIn}`);
        if (c.fadeOut > 0) chain.push(`afade=t=out:st=${Math.max(0, c.duration - c.fadeOut).toFixed(3)}:d=${c.fadeOut}`);
      }
      const ms = Math.round(c.start * 1000);
      chain.push(`adelay=${ms}|${ms}`);
      filters.push(`[${input}:a]${chain.join(",")}[a${input}]`);
      labels.push(`[a${input}]`);
      input++;
    }
  }
  if (labels.length) {
    filters.push(`${labels.join("")}amix=inputs=${labels.length}:normalize=0:dropout_transition=0,alimiter=limit=0.95,apad[aout]`);
    args.push("-filter_complex", filters.join(";"), "-map", "0:v", "-map", "[aout]");
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-map", "0:v", "-map", `${input}:a`);
  }
  args.push("-t", dur.toFixed(3), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "medium", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", file);
  const ff = spawn(FFMPEG, args, { windowsHide: true });
  let err = "";
  ff.stderr.on("data", (d) => (err += d));
  const closed = once(ff, "close");
  ff.stdin.on("error", () => {});
  const times = Array.from({ length: n }, (_, i) => i / p.fps);
  await renderer.frames(p, times, async (jpeg) => {
    if (!ff.stdin.write(jpeg)) await once(ff.stdin, "drain");
  }, (done) => progress(done, n));
  ff.stdin.end();
  const [code] = (await closed) as [number];
  if (code !== 0) throw new Error(`ffmpeg failed: ${err.trim().split("\n").slice(-3).join(" | ")}`);
}

// ---------- descriptions for the agent ----------
function clipLabel(p: Project, c: Clip) {
  switch (c.kind) {
    case "text": return `"${c.text.slice(0, 48)}"`;
    case "media": case "audio": return p.assets[c.assetId]?.name ?? c.assetId;
    case "captions": return `${c.words.length} words, "${c.words.slice(0, 6).map((w) => w.w).join(" ")}${c.words.length > 6 ? "…" : ""}"`;
    case "shape": return `${c.shape} ${c.fill}`;
    case "fill": return c.colors.join(" → ");
  }
}

function summary(p: Project = session.project): string {
  const lines = [`Project "${p.name}" (${p.id}) ${p.width}x${p.height} @ ${p.fps}fps, ${projectDuration(p).toFixed(2)}s long.`];
  for (const tr of p.tracks) {
    lines.push(`Track ${tr.id} "${tr.name}" [${tr.kind}]${tr.hidden ? " hidden" : ""}${tr.muted ? " muted" : ""}:`);
    if (!tr.clips.length) lines.push("  (empty)");
    for (const c of tr.clips) lines.push(`  ${c.id}  ${c.kind}  ${c.start.toFixed(2)}–${(c.start + c.duration).toFixed(2)}s  ${clipLabel(p, c)}  pos ${c.transform.x.toFixed(2)},${c.transform.y.toFixed(2)} scale ${c.transform.scale.toFixed(2)}`);
  }
  const assets = Object.values(p.assets);
  if (assets.length) {
    lines.push("Assets:");
    for (const a of assets) lines.push(`  ${a.id}  ${a.kind}  ${a.name}  ${a.duration ? a.duration.toFixed(2) + "s" : ""}${a.width ? ` ${a.width}x${a.height}` : ""}`);
  }
  if (p.markers.length) lines.push("Markers: " + p.markers.map((m) => `${m.t.toFixed(2)}s ${m.note}`).join("; "));
  return lines.join("\n");
}

function frameText(t: number) {
  const p = session.project;
  const act = activeClips(p, t);
  if (!act.length) return `At ${t.toFixed(2)}s: nothing on screen (background ${p.background}).`;
  return `At ${t.toFixed(2)}s, bottom to top:\n` + act.map(({ clip, local }) => `  ${clip.id} ${clip.kind} ${clipLabel(p, clip)} (${local.toFixed(2)}s into clip) at ${clip.transform.x.toFixed(2)},${clip.transform.y.toFixed(2)}`).join("\n");
}

const ok = (text: string) => ({ content: [{ type: "text" as const, text }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: `Error: ${(e as Error).message}` }] });

async function edit(ops: Op[], extra = "") {
  ensureStudioOpen();
  const a = apply(ops, "agent");
  return ok(`${a.text}${extra}\nTimeline is ${projectDuration(session.project).toFixed(2)}s. Call look to check the frame.`);
}

function guard<A>(fn: (a: A) => Promise<{ content: unknown[] }> | { content: unknown[] }) {
  return async (a: A) => {
    try { return (await fn(a)) as any; } catch (e) { return fail(e) as any; }
  };
}

// ---------- MCP ----------
const mcp = new McpServer({ name: "cutloupe", version: VERSION }, {
  instructions:
    "Cutloupe is a video editor you can see. Edits show live in the studio the user is watching (open_studio gives the URL). " +
    "Work in small steps and call `look` after each meaningful change to check the real rendered frame, then fix what looks wrong. " +
    "Positions are fractions of the frame (x,y = 0..1, centre of the clip). Times are seconds. Use get_project for clip ids.",
});

const tf = { x: z.number().optional().describe("centre x, 0..1"), y: z.number().optional().describe("centre y, 0..1"), scale: z.number().optional(), rotation: z.number().optional(), opacity: z.number().min(0).max(1).optional() };
const trans = z.object({ type: z.enum(["fade", "slide-left", "slide-right", "slide-up", "zoom", "wipe", "blur"]), duration: z.number().positive() });
const motionEnum = z.enum(MOTION_PRESETS as unknown as [string, ...string[]]);
const pickTf = (a: Record<string, unknown>) => Object.fromEntries(Object.entries({ x: a.x, y: a.y, scale: a.scale, rotation: a.rotation, opacity: a.opacity }).filter(([, v]) => v !== undefined));
const trackOf = (kind: string, given?: string) => given ?? session.project.tracks.find((t) => t.kind === kind)?.id ?? session.project.tracks.find((t) => t.kind !== "audio")!.id;

mcp.registerTool("open_studio", { title: "Open the live studio", description: "Open the studio in the user's browser and return its URL. Every edit you make appears there as it happens.", inputSchema: {} },
  guard(async () => { opened = true; openBrowser(baseUrl()); return ok(`Studio: ${baseUrl()} (opened in the browser). ${clients.size} studio tab(s) connected.`); }));

mcp.registerTool("new_project", {
  title: "New project", description: "Start a new empty reel. Formats: 16:9 (1920x1080), 9:16 (vertical), 1:1, 4:5.",
  inputSchema: { name: z.string().default("Untitled reel"), format: z.enum(Object.keys(FORMATS) as [FormatName, ...FormatName[]]).default("16:9"), fps: z.number().int().min(12).max(60).default(30), background: z.string().optional() },
}, guard(async (a) => {
  const p = emptyProject(a.name, a.format, a.fps);
  if (a.background) p.background = a.background;
  session.replace(p, "agent", `New project "${a.name}" ${a.format}`);
  autosave();
  ensureStudioOpen();
  await broadcast(session.activity[session.activity.length - 1]);
  return ok(summary());
}));

mcp.registerTool("get_project", { title: "Describe project", description: "Tracks, clips (with ids and times), assets and markers.", inputSchema: {} }, guard(async () => ok(summary() + `\nTimeline hash ${await timelineHash(session.project)}\nStudio ${baseUrl()}`)));

mcp.registerTool("open_project", { title: "Open project file", description: "Load a .cutloupe.json project file.", inputSchema: { path: z.string() } },
  guard(async (a) => {
    const p = JSON.parse(readFileSync(path.resolve(a.path), "utf8").replace(/^﻿/, "")) as Project;
    if (!p.tracks || !p.assets) throw new OpError("not a Cutloupe project file");
    session.replace(p, "agent", `Opened ${path.basename(a.path)}`);
    autosave();
    await broadcast(session.activity[session.activity.length - 1]);
    return ok(summary());
  }));

mcp.registerTool("list_projects", { title: "List saved projects", description: "Projects autosaved under the Cutloupe home folder.", inputSchema: {} },
  guard(async () => {
    const dir = path.join(HOME, "projects");
    if (!existsSync(dir)) return ok("No saved projects yet.");
    const rows: string[] = [];
    for (const id of await readdir(dir)) {
      const f = path.join(dir, id, "project.cutloupe.json");
      if (!existsSync(f)) continue;
      try { const p = JSON.parse(readFileSync(f, "utf8")) as Project; rows.push(`${f}  "${p.name}"  ${projectDuration(p).toFixed(1)}s  saved ${statSync(f).mtime.toISOString()}`); } catch { /* skip */ }
    }
    return ok(rows.join("\n") || "No saved projects yet.");
  }));

mcp.registerTool("import_media", {
  title: "Import media", description: "Add a local video, image or audio file to the project. Set place=true to also put it on the timeline.",
  inputSchema: { path: z.string(), place: z.boolean().default(false), start: z.number().min(0).optional(), duration: z.number().positive().optional() },
}, guard(async (a) => {
  ensureStudioOpen();
  const asset = await importFile(a.path, "agent");
  let extra = "";
  if (a.place) {
    const start = a.start ?? projectDuration(session.project);
    const dur = a.duration ?? (asset.kind === "image" ? 4 : asset.duration);
    const clip = asset.kind === "audio" ? makeAudio({ assetId: asset.id, start, duration: dur }) : makeMedia({ assetId: asset.id, start, duration: dur, motion: asset.kind === "image" ? "ken-burns" : undefined });
    apply([{ op: "add_clip", trackId: trackOf(asset.kind === "audio" ? "audio" : "video"), clip }], "agent");
    extra = ` Placed as clip ${clip.id} at ${start.toFixed(2)}s.`;
  }
  return ok(`Imported ${asset.kind} ${asset.name} as ${asset.id} (${asset.duration.toFixed(2)}s${asset.width ? `, ${asset.width}x${asset.height}` : ""}${asset.hasAudio ? ", has audio" : ""}).${extra}`);
}));

mcp.registerTool("add_media_clip", {
  title: "Place media", description: "Put an imported asset on a picture track. trimIn = seconds into the source.",
  inputSchema: { assetId: z.string(), start: z.number().min(0), duration: z.number().positive().optional(), trimIn: z.number().min(0).default(0), trackId: z.string().optional(), fit: z.enum(["cover", "contain"]).default("cover"), volume: z.number().min(0).max(2).default(1), motion: motionEnum.optional(), enter: trans.optional(), exit: trans.optional(), ...tf },
}, guard(async (a) => {
  const asset = session.project.assets[a.assetId];
  if (!asset) throw new OpError(`no asset ${a.assetId}; import_media first`);
  if (asset.kind === "audio") throw new OpError("that is audio; use add_music or add_audio_clip");
  const duration = a.duration ?? (asset.kind === "image" ? 4 : Math.max(0.1, asset.duration - a.trimIn));
  const clip = makeMedia({ assetId: a.assetId, start: a.start, duration, trimIn: a.trimIn, fit: a.fit, volume: a.volume, motion: a.motion as MotionPreset, enter: a.enter, exit: a.exit, transform: pickTf(a) });
  return edit([{ op: "add_clip", trackId: trackOf("video", a.trackId), clip }], ` Clip id ${clip.id}.`);
}));

mcp.registerTool("add_text", {
  title: "Add text", description: `Add a title or text overlay. Presets: ${Object.keys(TEXT_PRESETS).join(", ")}. Size is px on a 1080-tall frame.`,
  inputSchema: {
    text: z.string(), start: z.number().min(0), duration: z.number().positive().default(3), preset: z.enum(Object.keys(TEXT_PRESETS) as [TextPreset, ...TextPreset[]]).default("title"),
    font: z.enum(["sans", "display", "serif", "mono"]).optional(), size: z.number().positive().optional(), weight: z.number().optional(), color: z.string().optional(), background: z.string().optional(), align: z.enum(["left", "center", "right"]).optional(),
    reveal: z.enum(["none", "type", "words", "rise", "pop"]).optional(), motion: motionEnum.optional(), enter: trans.optional(), exit: trans.optional(), trackId: z.string().optional(), ...tf,
  },
}, guard(async (a) => {
  const style = Object.fromEntries(Object.entries({ font: a.font, size: a.size, weight: a.weight, color: a.color, background: a.background, align: a.align }).filter(([, v]) => v !== undefined));
  const clip = makeText({ text: a.text, start: a.start, duration: a.duration, preset: a.preset, style, transform: pickTf(a), reveal: a.reveal, motion: a.motion as MotionPreset, enter: a.enter, exit: a.exit });
  return edit([{ op: "add_clip", trackId: trackOf("text", a.trackId), clip }], ` Clip id ${clip.id}.`);
}));

mcp.registerTool("add_shape", {
  title: "Add shape", description: "Add a shape overlay: rect, circle, star, blob, line, ring. w/h are fractions of frame width/height.",
  inputSchema: { shape: z.enum(["rect", "circle", "star", "blob", "line", "ring"]), start: z.number().min(0), duration: z.number().positive().default(3), w: z.number().positive().optional(), h: z.number().positive().optional(), fill: z.string().optional(), stroke: z.string().optional(), strokeWidth: z.number().optional(), radius: z.number().optional(), motion: motionEnum.optional(), enter: trans.optional(), exit: trans.optional(), trackId: z.string().optional(), ...tf },
}, guard(async (a) => {
  const clip = makeShape({ shape: a.shape, start: a.start, duration: a.duration, w: a.w, h: a.h, fill: a.fill, stroke: a.stroke, strokeWidth: a.strokeWidth, radius: a.radius, motion: a.motion as MotionPreset, enter: a.enter, exit: a.exit, transform: pickTf(a) });
  return edit([{ op: "add_clip", trackId: trackOf("overlay", a.trackId), clip }], ` Clip id ${clip.id}.`);
}));

mcp.registerTool("add_background", {
  title: "Add background", description: "Full-frame colour or gradient (1–4 colours) on the video track.",
  inputSchema: { colors: z.array(z.string()).min(1).max(4), angle: z.number().default(135), start: z.number().min(0).default(0), duration: z.number().positive(), trackId: z.string().optional() },
}, guard(async (a) => {
  const clip = makeFill({ colors: a.colors, angle: a.angle, start: a.start, duration: a.duration });
  return edit([{ op: "add_clip", trackId: trackOf("video", a.trackId), clip }], ` Clip id ${clip.id}.`);
}));

mcp.registerTool("add_captions", {
  title: "Add captions", description: "Word-timed captions. Give `text` (timed evenly), `words` [{t0,t1,w}] relative to start, or `file` (.srt/.vtt). Looks: bold-pop, clean, karaoke, boxed.",
  inputSchema: {
    start: z.number().min(0).default(0), text: z.string().optional(), words: z.array(z.object({ t0: z.number(), t1: z.number(), w: z.string() })).optional(), file: z.string().optional(),
    wordsPerSecond: z.number().positive().default(2.6), look: z.enum(["bold-pop", "clean", "karaoke", "boxed"]).default("bold-pop"), highlight: z.string().optional(), size: z.number().optional(), maxWords: z.number().int().min(1).max(12).optional(), y: z.number().optional(), trackId: z.string().optional(),
  },
}, guard(async (a) => {
  let words = a.words;
  if (!words && a.file) words = (await extractCaptions(path.resolve(a.file), path.join(projectDir(), "captions"))).words;
  if (!words && a.text) words = wordsFromText(a.text, a.wordsPerSecond);
  if (!words?.length) throw new OpError("give text, words or file");
  const clip = makeCaptions({ words, start: a.start, look: a.look as CaptionLook, highlight: a.highlight, size: a.size, maxWords: a.maxWords, y: a.y });
  return edit([{ op: "add_clip", trackId: trackOf("text", a.trackId), clip }], ` Clip id ${clip.id}, ${words.length} words.`);
}));

mcp.registerTool("extract_captions", {
  title: "Extract captions", description: "Get word-timed captions from a .srt/.vtt file, a video's subtitle stream, or speech (needs a local Whisper CLI). add=true puts them on the timeline at `start`.",
  inputSchema: { path: z.string(), add: z.boolean().default(true), start: z.number().min(0).default(0), language: z.string().optional(), look: z.enum(["bold-pop", "clean", "karaoke", "boxed"]).default("bold-pop") },
}, guard(async (a) => {
  const r = await extractCaptions(path.resolve(a.path), path.join(projectDir(), "captions"), a.language);
  const preview = r.cues.slice(0, 6).map((c) => `  ${c.t0.toFixed(2)}–${c.t1.toFixed(2)}  ${c.text}`).join("\n");
  if (!a.add) return ok(`${r.detail} (source: ${r.source}).\n${preview}`);
  const clip = makeCaptions({ words: r.words, start: a.start, look: a.look as CaptionLook });
  return edit([{ op: "add_clip", trackId: trackOf("text"), clip }], `\n${r.detail} (source: ${r.source}). Clip id ${clip.id}.\n${preview}`);
}));

mcp.registerTool("list_music", { title: "Music library", description: "Built-in CC0 tracks (original, synthesised from code). Filter by mood word.", inputSchema: { mood: z.string().optional() } },
  guard(async (a) => {
    const rows = musicList().filter((m) => !a.mood || `${m.mood} ${m.name}`.toLowerCase().includes(a.mood.toLowerCase()));
    return ok(rows.map((m) => `${m.id}  "${m.name}"  ${m.bpm} BPM  ${m.seconds}s  ${m.mood}`).join("\n") + "\nAll CC0. Use add_music with the id.");
  }));

mcp.registerTool("add_music", {
  title: "Add music", description: "Put a library track (by id from list_music) or an imported audio asset on the music track.",
  inputSchema: { id: z.string().optional(), assetId: z.string().optional(), start: z.number().min(0).default(0), duration: z.number().positive().optional(), trimIn: z.number().min(0).default(0), volume: z.number().min(0).max(2).default(0.8), fadeIn: z.number().min(0).default(0.5), fadeOut: z.number().min(0).default(1.5), trackId: z.string().optional() },
}, guard(async (a) => {
  const ops: Op[] = [];
  let asset: Asset | undefined;
  if (a.id) {
    asset = session.project.assets[`music_${a.id}`] ?? (await musicAsset(a.id));
    if (!session.project.assets[asset.id]) ops.push({ op: "add_asset", asset });
  } else if (a.assetId) asset = session.project.assets[a.assetId];
  if (!asset) throw new OpError("give a library id (list_music) or an imported audio assetId");
  const len = a.duration ?? Math.min(asset.duration - a.trimIn, Math.max(projectDuration(session.project) - a.start, 4));
  const clip = makeAudio({ assetId: asset.id, start: a.start, duration: +len.toFixed(3), trimIn: a.trimIn, volume: a.volume, fadeIn: a.fadeIn, fadeOut: a.fadeOut });
  ops.push({ op: "add_clip", trackId: trackOf("audio", a.trackId), clip });
  return edit(ops, ` Clip id ${clip.id}. License: ${asset.license ?? "as imported"}.`);
}));

mcp.registerTool("extract_audio", {
  title: "Extract audio", description: "Pull the soundtrack out of a video into a WAV and import it (e.g. to reuse music or dialogue on its own track).",
  inputSchema: { path: z.string(), place: z.boolean().default(false), start: z.number().min(0).default(0) },
}, guard(async (a) => {
  const wav = await extractAudio(path.resolve(a.path), path.join(projectDir(), "media"));
  const asset = await importFile(wav, "agent");
  if (!a.place) return ok(`Extracted audio to ${wav}, asset ${asset.id} (${asset.duration.toFixed(2)}s).`);
  const clip = makeAudio({ assetId: asset.id, start: a.start, duration: asset.duration });
  return edit([{ op: "add_clip", trackId: trackOf("audio"), clip }], ` Asset ${asset.id}, clip ${clip.id}.`);
}));

mcp.registerTool("edit_clip", {
  title: "Edit clip", description: "Change any clip field. `patch` merges into the clip (transform/style/grade merge too), e.g. {transform:{y:0.7}}, {text:'New'}, {style:{color:'#ff0'}}, {grade:{saturation:1.2,temperature:0.3}}. `motion` applies a motion preset.",
  inputSchema: { clipId: z.string(), patch: z.record(z.unknown()).default({}), motion: motionEnum.optional() },
}, guard(async (a) => {
  const f = findClip(session.project, a.clipId);
  if (!f) throw new OpError(`no clip ${a.clipId}; call get_project`);
  const patch = { ...a.patch };
  if (a.motion) {
    const base = { ...f.clip.transform, ...((patch.transform as object) ?? {}) };
    patch.anim = a.motion === "none" ? undefined : motion(a.motion as MotionPreset, (patch.duration as number) ?? f.clip.duration, base);
  }
  return edit([{ op: "update_clip", clipId: a.clipId, patch }]);
}));

mcp.registerTool("keyframe", {
  title: "Keyframes", description: "Set keyframes for one property: x, y, scale, rotation or opacity. keys = [[timeInClip, value, ease?]], ease one of linear,in,out,inOut,back,spring. Empty keys clears it.",
  inputSchema: { clipId: z.string(), prop: z.enum(["x", "y", "scale", "rotation", "opacity"]), keys: z.array(z.tuple([z.number(), z.number()]).rest(z.string())) },
}, guard(async (a) => {
  const f = findClip(session.project, a.clipId);
  if (!f) throw new OpError(`no clip ${a.clipId}`);
  const anim = { ...(f.clip.anim ?? {}) } as Record<string, unknown>;
  if (a.keys.length) anim[a.prop] = a.keys.map((k) => [k[0], k[1], k[2] ?? "inOut"]);
  else delete anim[a.prop];
  return edit([{ op: "update_clip", clipId: a.clipId, patch: { anim } }]);
}));

mcp.registerTool("move_clip", { title: "Move clip", description: "Move a clip to a new start time, optionally to another track.", inputSchema: { clipId: z.string(), start: z.number().min(0), trackId: z.string().optional() } },
  guard((a) => edit([{ op: "move_clip", clipId: a.clipId, start: a.start, trackId: a.trackId }])));

mcp.registerTool("split_clip", { title: "Split clip", description: "Cut a clip in two at an absolute time.", inputSchema: { clipId: z.string(), at: z.number() } },
  guard((a) => { const id = newId("clip"); return edit([{ op: "split_clip", clipId: a.clipId, at: a.at, newId: id }], ` Right half is ${id}.`); }));

mcp.registerTool("remove_clip", { title: "Remove clip", description: "Delete a clip.", inputSchema: { clipId: z.string() } }, guard((a) => edit([{ op: "remove_clip", clipId: a.clipId }])));

mcp.registerTool("set_transition", {
  title: "Transitions", description: "Set enter and/or exit transitions on a clip. Types: fade, slide-left, slide-right, slide-up, zoom, wipe, blur, or none.",
  inputSchema: { clipId: z.string(), enter: z.string().optional(), exit: z.string().optional(), duration: z.number().positive().default(0.3) },
}, guard((a) => {
  const patch: Record<string, unknown> = {};
  for (const k of ["enter", "exit"] as const) if (a[k]) patch[k] = a[k] === "none" ? undefined : { type: a[k] as TransitionType, duration: a.duration };
  return edit([{ op: "update_clip", clipId: a.clipId, patch }]);
}));

mcp.registerTool("set_project", {
  title: "Project settings", description: "Rename, change format/size, fps or background colour.",
  inputSchema: { name: z.string().optional(), format: z.enum(Object.keys(FORMATS) as [FormatName, ...FormatName[]]).optional(), fps: z.number().int().min(12).max(60).optional(), background: z.string().optional() },
}, guard((a) => {
  const patch: Record<string, unknown> = {};
  if (a.name) patch.name = a.name;
  if (a.format) Object.assign(patch, FORMATS[a.format]);
  if (a.fps) patch.fps = a.fps;
  if (a.background) patch.background = a.background;
  return edit([{ op: "set_project", patch }]);
}));

mcp.registerTool("add_marker", { title: "Marker", description: "Leave a note at a time on the timeline for the user.", inputSchema: { t: z.number().min(0), note: z.string() } },
  guard((a) => edit([{ op: "add_marker", marker: { t: a.t, note: a.note, by: "agent" } }])));

mcp.registerTool("apply_ops", {
  title: "Batch edit", description: "Apply raw ops as one undoable step (all or nothing). Ops: set_project, add_asset, add_track, update_track, add_clip, update_clip, remove_clip, move_clip, split_clip, add_marker, clear_markers.",
  inputSchema: { ops: z.array(z.record(z.unknown())).min(1) },
}, guard((a) => edit(a.ops as unknown as Op[])));

mcp.registerTool("history", { title: "Undo / redo", description: "Undo or redo the last step (yours or the user's).", inputSchema: { action: z.enum(["undo", "redo"]) } },
  guard(async (a) => {
    const act = a.action === "undo" ? session.undo("agent") : session.redo("agent");
    if (!act) return ok(`Nothing to ${a.action}.`);
    autosave();
    await broadcast(act);
    return ok(`${act.text} done.\n${summary()}`);
  }));

mcp.registerTool("look", {
  title: "Look at the frame", description: "Render the real output frame(s) and return them as an image, plus what is on screen. One time gives one frame; several times give a labelled contact sheet; no times gives 6 frames across the reel. The user sees where you looked.",
  inputSchema: { t: z.number().min(0).optional(), times: z.array(z.number().min(0)).max(16).optional(), width: z.number().int().min(240).max(1920).default(960) },
}, guard(async (a) => {
  ensureStudioOpen();
  const p = session.project;
  const dur = projectDuration(p);
  let times = a.times?.length ? a.times : a.t !== undefined ? [a.t] : Array.from({ length: 6 }, (_, i) => +((dur * (i + 0.5)) / 6).toFixed(2));
  times = times.map((t) => Math.min(t, Math.max(0, dur - 1 / p.fps)));
  broadcastActivity(session.log("agent", "look", `Looked at ${times.map((t) => t.toFixed(2) + "s").join(", ")}`, [], times));
  const img = times.length === 1 ? await renderer.frame(p, times[0], a.width, "jpeg") : await renderer.sheet(p, times, Math.min(640, Math.round(a.width / Math.min(3, times.length))));
  return {
    content: [
      { type: "image" as const, data: img.toString("base64"), mimeType: times.length === 1 ? "image/jpeg" : "image/png" },
      { type: "text" as const, text: times.map(frameText).join("\n") },
    ],
  };
}));

mcp.registerTool("export", {
  title: "Export", description: "mp4 (rendered with sound), fcpxml (DaVinci Resolve, Final Cut), xmeml (Adobe Premiere Pro), otio, capcut (experimental draft), remotion (React project), srt, vtt, project. Returns file paths and what did not carry over.",
  inputSchema: { format: z.enum(["mp4", "fcpxml", "xmeml", "otio", "capcut", "remotion", "srt", "vtt", "project"]), out: z.string().optional().describe("output folder") },
}, guard(async (a) => {
  const r = await doExport(a.format, a.out, "agent");
  broadcastActivity(session.log("agent", "export", `Exported ${a.format} to ${r.dir}`));
  let extra = "";
  if (r.mp4) extra = `\nsha256 ${await sha256File(r.mp4)}`;
  return ok(`Wrote:\n${r.files.map((f) => "  " + f).join("\n")}${r.notes.length ? "\nNotes:\n" + r.notes.map((n) => "  - " + n).join("\n") : ""}${extra}`);
}));

mcp.registerTool("ledger", {
  title: "On-chain edit ledger (Solana devnet)", description: "status: show the reel's on-chain head. commit: record the current timeline hash. seal: commit, then seal an exported file's SHA-256 against it. verify: look up a file's seal. Needs CUTLOUPE_KEYPAIR.",
  inputSchema: { action: z.enum(["status", "commit", "seal", "verify"]), file: z.string().optional(), aiGeneratedMedia: z.boolean().default(false), syntheticVoice: z.boolean().default(false) },
}, guard(async (a) => {
  const ledger = await getLedger();
  if (!ledger) throw new OpError("ledger is off: set CUTLOUPE_KEYPAIR to a Solana keypair JSON file (devnet) and restart the server");
  const p = session.project;
  const hash = await timelineHash(p);
  if (a.action === "status") {
    const r = await ledger.reel(p.id);
    return ok(r ? `Reel ${r.address}: version ${r.version}, ${r.exports} sealed exports, head ${r.head}\nLocal timeline hash ${hash} (${r.head === hash ? "matches" : "not committed yet"})` : `No reel on chain yet for ${p.id}. Local hash ${hash}.`);
  }
  if (a.action === "verify") {
    if (!a.file) throw new OpError("give file");
    const sha = await sha256File(path.resolve(a.file));
    const s = await ledger.verify(sha);
    return ok(s ? `Sealed. ${JSON.stringify(s, null, 2)}` : `No seal for sha256 ${sha}.`);
  }
  const actor = session.pending.agent && session.pending.human ? ACTOR.mixed : session.pending.human ? ACTOR.human : ACTOR.agent;
  const ops = session.pending.agent + session.pending.human;
  const c = await ledger.commitHead(p.id, p.name, hash, ops, actor);
  session.pending = { agent: 0, human: 0 };
  const lines = [`Head ${c.reel.head} at version ${c.reel.version} (${c.reel.address}).`, ...c.signatures.map((s) => explorer(s))];
  if (a.action === "seal") {
    if (!a.file) throw new OpError("give file (an exported video)");
    const file = path.resolve(a.file);
    const sha = await sha256File(file);
    let flags = FLAGS.aiEdited;
    if (a.aiGeneratedMedia) flags |= FLAGS.aiGeneratedMedia;
    if (a.syntheticVoice) flags |= FLAGS.syntheticVoice;
    const sig = await ledger.sealExport(p.id, sha, hash, flags, Math.round(projectDuration(p) * 1000));
    lines.push(`Sealed ${path.basename(file)} sha256 ${sha}`, explorer(sig));
  }
  broadcastActivity(session.log("agent", "ledger", lines[0]));
  return ok(lines.join("\n"));
}));

// ---------- start ----------
export async function main(opts: { stdio: boolean; open: boolean }) {
  // Resume the most recently saved project, if any.
  try {
    const dir = path.join(HOME, "projects");
    if (existsSync(dir)) {
      const files = (await readdir(dir)).map((id) => path.join(dir, id, "project.cutloupe.json")).filter(existsSync).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
      if (files[0]) session.project = JSON.parse(readFileSync(files[0], "utf8"));
    }
  } catch (e) { log("could not resume:", (e as Error).message); }
  await listen();
  log(`studio at ${baseUrl()}  (home ${HOME})${Ledger.enabled() ? `  ledger on ${CLUSTER}` : ""}`);
  if (opts.open) { opened = true; openBrowser(baseUrl()); }
  if (opts.stdio) await mcp.connect(new StdioServerTransport());
  const stop = async () => { await renderer.close(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.stdin.on("close", () => { if (opts.stdio) void stop(); });
}

export { baseUrl, run };
