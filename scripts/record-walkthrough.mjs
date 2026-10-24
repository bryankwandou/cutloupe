// Record the walkthrough video from the real site and studio demo.
//   node scripts/record-walkthrough.mjs [outDir]
//
// Chrome's screencast hands us frames with timestamps; we hold each one for
// its real duration and encode at a constant 30 fps, then lay a track from
// the built-in music library underneath. Captions are drawn into the page.

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { LIBRARY, synthesize, toWav } from "../packages/core/dist/index.mjs";
import { serve } from "./serve.mjs";

const out = path.resolve(process.argv[2] || "apps/site/public/media");
const work = path.join(out, ".walk-frames");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const PORT = 4411;
const BASE = `http://127.0.0.1:${PORT}`;
const W = 1600, H = 900;
const server = await serve(path.resolve("site"), PORT);

const browser = await puppeteer.launch({
  executablePath: process.env.CUTLOUPE_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio", "--hide-scrollbars", `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1.2 });
const cdp = await page.createCDPSession();

const frames = []; // { file, ts }
let n = 0;
cdp.on("Page.screencastFrame", async (f) => {
  const file = path.join(work, `f${String(n++).padStart(5, "0")}.jpg`);
  writeFileSync(file, Buffer.from(f.data, "base64"));
  frames.push({ file, ts: f.metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CAPTION_CSS = `#walk-cap{position:fixed;left:50%;bottom:44px;transform:translateX(-50%);z-index:99999;max-width:min(1100px,86vw);
  padding:14px 22px;border-radius:10px;background:rgba(8,9,10,.86);border:1px solid rgba(255,255,255,.14);color:#ecedee;
  font:500 24px/1.4 Inter,"Segoe UI",sans-serif;text-align:center;letter-spacing:-.01em;transition:opacity .35s;box-shadow:0 20px 60px rgba(0,0,0,.5)}
  #walk-cap b{color:#ffb224;font-weight:600}`;
async function caption(html) {
  await page.evaluate((h, css) => {
    let el = document.getElementById("walk-cap");
    if (!el) {
      const st = document.createElement("style"); st.textContent = css; document.head.append(st);
      el = document.createElement("div"); el.id = "walk-cap"; document.body.append(el);
    }
    el.style.opacity = h ? "1" : "0";
    if (h) el.innerHTML = h;
  }, html, CAPTION_CSS);
}
async function scrollTo(sel, ms = 1400) {
  await page.evaluate(async (s, d) => {
    const el = document.querySelector(s);
    const from = scrollY, to = el.getBoundingClientRect().top + scrollY - 90;
    const t0 = performance.now();
    await new Promise((res) => {
      const step = (now) => {
        const k = Math.min(1, (now - t0) / d);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        window.scrollTo(0, from + (to - from) * e);
        k < 1 ? requestAnimationFrame(step) : res();
      };
      requestAnimationFrame(step);
    });
  }, sel, ms);
}

async function start(url) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
}

// ---------- scenes ----------
await start(`${BASE}/?lang=en`);
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await sleep(2600);
await caption("Cutloupe is an MCP server that gives your agent a <b>real video timeline</b>.");
await sleep(3200);
await caption("The agent edits. You watch. Then the agent <b>looks at the frames</b> it made.");
await sleep(3200);

await caption("");
await start(`${BASE}/studio/`);
await caption("This is the studio. A scripted agent is editing, using the same operations as the MCP server.");
await sleep(5000);
await caption("Amber means <b>the agent did this</b>. Each change says what it was.");
await sleep(4500);
await caption("Here it looks at 1.5 s and 2.5 s, sees the subtitle sitting on the title, and moves it.");
await sleep(6500);
await caption("Captions, a lower third, an end card. Music from the built-in CC0 library.");
await sleep(5500);
await caption("You can edit at the same time. Undo covers both of you.");
await sleep(3500);

await caption("");
await start(`${BASE}/?lang=en`);
await page.evaluate(() => document.getElementById("hero-start")?.click());
await scrollTo("#loop");
await caption("Edit, show, look, fix. The loop that stops an agent from guessing.");
await sleep(4600);
await scrollTo("#sees");
await caption("What the agent gets back from <b>look</b>: real rendered frames, plus a list of what is on screen.");
await sleep(3000);
await page.click("#tab-frame");
await sleep(2400);
await scrollTo("#captions");
await caption("Captions from .srt, a subtitle track, or local Whisper. Drawn by the same renderer as the export.");
for (const look of ["clean", "karaoke", "boxed", "bold-pop"]) { await sleep(1500); await page.click(`#cap-looks [data-look="${look}"]`); }
await sleep(1500);
await scrollTo("#music");
await caption("Six original tracks, built from code in your browser. CC0.");
await page.click('.track[data-id="tally"] .track-play');
await sleep(4200);
await page.click('.track[data-id="tally"] .track-play');
await scrollTo("#tools");
await caption("28 tools, named the way editors talk.");
await sleep(900);
await page.type("#tool-search", "caption", { delay: 110 });
await sleep(2400);
await scrollTo("#exports");
await caption("Finish in DaVinci Resolve, Premiere Pro, CapCut or Remotion. Notes list what did not carry over.");
await sleep(4400);
await scrollTo("#ledger");
await caption("Optional: seal each export on Solana devnet against the exact cut that produced it.");
await sleep(1600);
await page.click("#verify-sample");
await page.waitForFunction(() => /Sealed on devnet|No seal|Could not/.test(document.getElementById("verify-out").textContent), { timeout: 30000 }).catch(() => {});
await sleep(4200);
await scrollTo("#install");
await caption("Build it once, register it with your agent, and ask for a video.");
await sleep(4200);
await caption("cutloupe · github.com/bryankwandou/cutloupe");
await sleep(3000);
await cdp.send("Page.stopScreencast");
await sleep(300);
await browser.close();
server.close();

// ---------- encode ----------
frames.sort((a, b) => a.ts - b.ts);
const end = frames[frames.length - 1].ts + 0.5;
const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, "/")}'\nduration ${Math.max(0.001, (frames[i + 1]?.ts ?? end) - f.ts).toFixed(4)}`).join("\n");
writeFileSync(path.join(work, "list.txt"), list + `\nfile '${frames[frames.length - 1].file.replace(/\\/g, "/")}'\n`);
const seconds = end - frames[0].ts;
console.log(`${frames.length} frames over ${seconds.toFixed(1)} s`);

const recipe = LIBRARY.find((r) => r.id === "glasshouse");
const pcm = synthesize(recipe, 44100);
const wav = path.join(work, "music.wav");
writeFileSync(wav, toWav(pcm, 44100));

const mp4 = path.join(out, "walkthrough.mp4");
const fade = Math.max(0, seconds - 3).toFixed(2);
const r = spawnSync("ffmpeg", [
  "-y", "-v", "error",
  "-f", "concat", "-safe", "0", "-i", path.join(work, "list.txt"),
  "-stream_loop", "-1", "-i", wav,
  "-filter_complex", `[0:v]scale=1920:1080:flags=lanczos,fps=30,format=yuv420p[v];[1:a]volume=0.55,afade=t=in:d=1.5,afade=t=out:st=${fade}:d=3[a]`,
  "-map", "[v]", "-map", "[a]", "-t", seconds.toFixed(2),
  "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "160k", mp4,
], { stdio: "inherit" });
if (r.status !== 0) process.exit(1);
spawnSync("ffmpeg", ["-y", "-v", "error", "-ss", "9", "-i", mp4, "-frames:v", "1", "-q:v", "3", path.join(out, "walkthrough-poster.jpg")], { stdio: "inherit" });
rmSync(work, { recursive: true, force: true });
console.log(`wrote ${mp4}`);
