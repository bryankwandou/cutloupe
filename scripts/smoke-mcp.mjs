// End-to-end check: start the MCP server over stdio the way an agent client
// does, build a short reel with real media, look at it, export every format,
// and (when CUTLOUPE_KEYPAIR is set) commit and seal it on devnet.
//
//   node scripts/smoke-mcp.mjs <workdir>

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const work = path.resolve(process.argv[2] || ".smoke");
mkdirSync(work, { recursive: true });
const video = path.join(work, "clip #1.mp4");
const srt = path.join(work, "talk.srt");

if (!existsSync(video)) {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=6", "-f", "lavfi", "-i", "sine=frequency=330:duration=6", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", video]);
  if (r.status !== 0) throw new Error("ffmpeg could not make the test clip: " + r.stderr);
}
writeFileSync(srt, "1\n00:00:00,400 --> 00:00:02,200\nAn editor your agent can see\n\n2\n00:00:02,400 --> 00:00:04,800\nevery cut lands in the studio live\n");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve("packages/mcp/bin/cutloupe.mjs")],
  env: { ...process.env, CUTLOUPE_HOME: path.join(work, "home"), CUTLOUPE_NO_OPEN: "1" },
  stderr: "inherit",
});
const client = new Client({ name: "cutloupe-smoke", version: "0.0.0" });
await client.connect(transport);

let failures = 0;
const results = {};
async function call(name, args = {}) {
  const t0 = Date.now();
  const r = await client.callTool({ name, arguments: args }, undefined, { timeout: 600_000 });
  const text = r.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  const img = r.content.find((c) => c.type === "image");
  const tag = r.isError ? "FAIL" : "ok  ";
  if (r.isError) failures++;
  console.log(`${tag} ${name} (${Date.now() - t0} ms) ${text.split("\n")[0].slice(0, 140)}`);
  if (img) {
    const file = path.join(work, `${name}-${Object.keys(results).length}.${img.mimeType === "image/png" ? "png" : "jpg"}`);
    writeFileSync(file, Buffer.from(img.data, "base64"));
    console.log(`     image -> ${file}`);
  }
  results[`${name}#${Object.keys(results).length}`] = text;
  return text;
}
const id = (text, re = /Clip id (\w+)/) => text.match(re)?.[1];

const tools = await client.listTools();
console.log(`tools: ${tools.tools.length} (${tools.tools.map((t) => t.name).join(", ")})`);

await call("new_project", { name: "Smoke reel", format: "16:9", fps: 30 });
await call("add_background", { colors: ["#0b0d12", "#1d2433"], duration: 8 });
const imp = await call("import_media", { path: video, place: true, start: 1, duration: 5 });
const vclip = imp.match(/clip (\w+)/)?.[1];
const title = id(await call("add_text", { text: "Cutloupe", start: 0, duration: 3, preset: "title", reveal: "rise" }));
await call("add_captions", { file: srt, start: 1, look: "bold-pop" });
await call("extract_captions", { path: srt, add: false });
await call("list_music");
await call("add_music", { id: "night-bus", start: 0, duration: 8 });
await call("edit_clip", { clipId: title, patch: { transform: { y: 0.3 } } });
await call("keyframe", { clipId: title, prop: "scale", keys: [[0, 0.9, "out"], [1, 1]] });
await call("set_transition", { clipId: vclip, enter: "fade", exit: "zoom" });
const split = await call("split_clip", { clipId: vclip, at: 3.5 });
await call("add_marker", { t: 3.5, note: "check this cut" });
await call("history", { action: "undo" });
await call("history", { action: "redo" });
await call("get_project");
await call("look", { t: 2 });
await call("look", {});
const out = path.join(work, "exports");
for (const format of ["fcpxml", "xmeml", "otio", "capcut", "remotion", "srt", "vtt", "project", "mp4"]) await call("export", { format, out });
const mp4 = path.join(out, "smoke-reel.mp4");
if (existsSync(mp4)) {
  console.log(`     mp4 ${statSync(mp4).size} bytes`);
  const pr = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height:format=duration", "-of", "compact", mp4], { encoding: "utf8" });
  console.log(pr.stdout.trim().split("\n").map((l) => "     " + l).join("\n"));
}
if (process.env.CUTLOUPE_KEYPAIR) {
  await call("ledger", { action: "status" });
  await call("ledger", { action: "seal", file: mp4 });
  await call("ledger", { action: "verify", file: mp4 });
}
writeFileSync(path.join(work, "results.json"), JSON.stringify(results, null, 2));
await client.close();
console.log(failures ? `\n${failures} tool call(s) failed` : "\nall tool calls succeeded");
process.exit(failures ? 1 : 0);
