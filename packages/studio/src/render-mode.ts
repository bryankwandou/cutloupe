// Headless render page. The MCP server opens /?render=1 in Chrome and calls
// window.__cutloupe to get exact frames: one for `look`, a grid for a contact
// sheet, or a run of JPEGs for MP4 export. Same renderFrame as the studio.

import { type Project, renderFrame } from "@cutloupe/core";
import { loadFonts } from "./fonts";
import { MediaPool } from "./media";

interface FrameOpts {
  maxWidth?: number;
  type?: "png" | "jpeg";
  quality?: number;
}

export function startRenderMode() {
  document.body.className = "render-mode";
  const pool = new MediaPool();
  const full = document.createElement("canvas");
  const out = document.createElement("canvas");
  const fctx = full.getContext("2d")!;
  const octx = out.getContext("2d")!;
  let project: Project | null = null;

  async function load(p: Project) {
    project = p;
    full.width = p.width;
    full.height = p.height;
    pool.sync(p);
    await pool.allLoaded();
    await loadFonts();
    return true;
  }

  async function draw(t: number) {
    if (!project) throw new Error("no project loaded");
    await pool.seekExact(project, t);
    renderFrame(fctx, project, t, pool);
  }

  function emit(opts: FrameOpts): string {
    const p = project!;
    const k = Math.min(1, (opts.maxWidth ?? p.width) / p.width);
    if (k === 1) return full.toDataURL(opts.type === "png" ? "image/png" : "image/jpeg", opts.quality ?? 0.9);
    out.width = Math.round(p.width * k);
    out.height = Math.round(p.height * k);
    octx.imageSmoothingQuality = "high";
    octx.drawImage(full, 0, 0, out.width, out.height);
    return out.toDataURL(opts.type === "png" ? "image/png" : "image/jpeg", opts.quality ?? 0.9);
  }

  async function frame(t: number, opts: FrameOpts = {}) {
    await draw(t);
    return emit(opts);
  }

  async function frames(ts: number[], opts: FrameOpts = {}) {
    const res: string[] = [];
    for (const t of ts) res.push(await frame(t, opts));
    return res;
  }

  /** A labelled grid of frames, so an agent can check pacing in one image. */
  async function sheet(ts: number[], opts: { cellWidth?: number } = {}) {
    const p = project!;
    const cw = opts.cellWidth ?? 480;
    const ch = Math.round((cw * p.height) / p.width);
    const cols = ts.length <= 4 ? ts.length : Math.ceil(Math.sqrt(ts.length));
    const rows = Math.ceil(ts.length / cols);
    const gap = 8, label = 26;
    out.width = cols * cw + (cols + 1) * gap;
    out.height = rows * (ch + label) + (rows + 1) * gap;
    const c = out.getContext("2d")!;
    c.fillStyle = "#0b0c0e";
    c.fillRect(0, 0, out.width, out.height);
    const tmp = document.createElement("canvas");
    tmp.width = cw;
    tmp.height = ch;
    const tctx = tmp.getContext("2d")!;
    for (let i = 0; i < ts.length; i++) {
      await draw(ts[i]);
      tctx.drawImage(full, 0, 0, cw, ch);
      const x = gap + (i % cols) * (cw + gap), y = gap + Math.floor(i / cols) * (ch + label + gap);
      c.drawImage(tmp, x, y + label);
      c.fillStyle = "#e9eaec";
      c.font = "500 15px 'JetBrains Mono', monospace";
      c.textBaseline = "middle";
      c.fillText(`${i + 1}  ${timecode(ts[i])}`, x + 2, y + label / 2);
    }
    return out.toDataURL("image/png");
  }

  (window as unknown as { __cutloupe: unknown }).__cutloupe = { load, frame, frames, sheet, ready: true };
}

function timecode(t: number) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`;
}
