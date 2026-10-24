// Where a clip sits on the frame at time t, in project pixels. Used by the
// overlay (selection and agent highlights) and by hit testing in the preview.

import {
  type Clip,
  type Project,
  activeClips,
  animatedTransform,
  captionPhrases,
  fontFor,
  FONT_STACK,
  transitionState,
  wrapLines,
} from "@cutloupe/core";

export interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number; // degrees
}

let measure: CanvasRenderingContext2D | null = null;
function mctx() {
  if (!measure) measure = document.createElement("canvas").getContext("2d")!;
  return measure;
}

export function clipBox(p: Project, clip: Clip, t: number): Box | null {
  const local = Math.max(0, Math.min(clip.duration, t - clip.start));
  const tr = animatedTransform(clip.transform, clip.anim, local);
  const ts = transitionState(clip, local);
  const W = p.width, H = p.height;
  const k = tr.scale * ts.scale;
  const cx = (tr.x + ts.dx) * W, cy = (tr.y + ts.dy) * H;
  let w = 0, h = 0;
  switch (clip.kind) {
    case "media":
    case "fill":
      w = W; h = H; break;
    case "shape":
      w = clip.w * W; h = clip.h * H;
      if (clip.shape === "circle" || clip.shape === "ring" || clip.shape === "star" || clip.shape === "blob") { const d = Math.min(w, h); w = d; h = d; }
      if (clip.shape === "line") h = Math.max(h, 8);
      break;
    case "text": {
      const px = clip.style.size * (H / 1080);
      const ctx = mctx();
      ctx.font = fontFor(clip.style, px);
      const lines = wrapLines(ctx, clip.text, W * 0.86);
      w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + (clip.style.background ? px * 0.9 : px * 0.2);
      h = lines.length * px * 1.15 + (clip.style.background ? px * 0.56 : px * 0.2);
      break;
    }
    case "captions": {
      const px = clip.size * (H / 1080);
      const ctx = mctx();
      ctx.font = `800 ${px}px ${FONT_STACK.sans}`;
      const phrases = captionPhrases(clip.words, Math.max(1, clip.maxWords));
      const ph = phrases.find((x) => local >= x[0].t0 - 0.05 && local < x[x.length - 1].t1 + 0.25) ?? phrases[0];
      const text = ph ? ph.map((x) => x.w).join(" ").toUpperCase() : "CAPTIONS";
      w = Math.min(W * 0.92, ctx.measureText(text).width + px);
      h = px * 1.6;
      break;
    }
    case "audio":
      return null;
  }
  return { cx, cy, w: w * k, h: h * k, rot: tr.rotation };
}

/** Topmost visible clip under a point (project pixels), skipping full-frame layers unless nothing else is hit. */
export function hitTest(p: Project, t: number, x: number, y: number): Clip | null {
  const act = activeClips(p, t).filter((a) => a.clip.kind !== "audio");
  let fallback: Clip | null = null;
  for (let i = act.length - 1; i >= 0; i--) {
    const c = act[i].clip;
    const b = clipBox(p, c, t);
    if (!b) continue;
    const r = (-b.rot * Math.PI) / 180;
    const dx = x - b.cx, dy = y - b.cy;
    const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r);
    if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) {
      if (c.kind === "media" || c.kind === "fill") { fallback ??= c; continue; }
      return c;
    }
  }
  return fallback;
}
