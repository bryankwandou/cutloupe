// One compositor for every surface: the live studio, the agent's `look` tool,
// MP4 export and the website demo all call renderFrame. If the agent sees it,
// the person sees it, and the export contains it.

import type {
  Anim,
  CaptionClip,
  Clip,
  Ease,
  FillClip,
  Key,
  MediaClip,
  Project,
  ShapeClip,
  TextClip,
  Transform,
  Transition,
} from "./schema";

export type Drawable = CanvasImageSource & { videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number; width?: number | SVGAnimatedLength; height?: number | SVGAnimatedLength };

export interface MediaLookup {
  /** Return the image/video for an asset, already positioned at the needed source time. */
  get(assetId: string): Drawable | null;
}

export const FONT_STACK: Record<string, string> = {
  sans: '"Inter", "Segoe UI", system-ui, sans-serif',
  display: '"Instrument Sans", "Inter", "Segoe UI", system-ui, sans-serif',
  mono: '"JetBrains Mono", "Cascadia Mono", Consolas, monospace',
  serif: '"Instrument Serif", Georgia, "Times New Roman", serif',
};

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function ease(kind: Ease | undefined, x: number): number {
  const v = Math.min(1, Math.max(0, x));
  switch (kind) {
    case "in":
      return v * v * v;
    case "out":
      return 1 - Math.pow(1 - v, 3);
    case "inOut":
      return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
    case "back": {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(v - 1, 3) + c1 * Math.pow(v - 1, 2);
    }
    case "spring":
      return v === 0 || v === 1 ? v : 1 - Math.cos(v * Math.PI * 4.5) * Math.exp(-v * 6);
    default:
      return v;
  }
}

export function sampleKeys(keys: Key[], t: number): number {
  if (keys.length === 0) return NaN;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) {
      const span = t1 - t0 || 1e-6;
      return v0 + (v1 - v0) * ease(e ?? "inOut", (t - t0) / span);
    }
  }
  return keys[keys.length - 1][1];
}

export function animatedTransform(base: Transform, anim: Anim | undefined, local: number): Transform {
  const out = { ...base };
  if (!anim) return out;
  for (const prop of Object.keys(anim) as (keyof Transform)[]) {
    const keys = anim[prop];
    if (keys && keys.length) out[prop] = sampleKeys(keys, local);
  }
  return out;
}

interface TransitionState {
  alpha: number;
  dx: number;
  dy: number;
  scale: number;
  blur: number;
  wipe: number; // 1 = fully shown
}

export function transitionState(clip: Clip, local: number): TransitionState {
  const s: TransitionState = { alpha: 1, dx: 0, dy: 0, scale: 1, blur: 0, wipe: 1 };
  const apply = (tr: Transition | undefined, progress: number) => {
    if (!tr) return;
    const k = ease("out", progress);
    const inv = 1 - k;
    switch (tr.type) {
      case "fade": s.alpha *= k; break;
      case "slide-left": s.dx += inv * 0.35; s.alpha *= Math.min(1, k * 1.6); break;
      case "slide-right": s.dx -= inv * 0.35; s.alpha *= Math.min(1, k * 1.6); break;
      case "slide-up": s.dy += inv * 0.18; s.alpha *= Math.min(1, k * 1.6); break;
      case "zoom": s.scale *= 0.8 + 0.2 * k; s.alpha *= k; break;
      case "wipe": s.wipe = Math.min(s.wipe, k); break;
      case "blur": s.blur += inv * 24; s.alpha *= k; break;
    }
  };
  if (clip.enter && local < clip.enter.duration) apply(clip.enter, local / clip.enter.duration);
  const tail = clip.duration - local;
  if (clip.exit && tail < clip.exit.duration) apply(clip.exit, tail / clip.exit.duration);
  return s;
}

export function activeClips(p: Project, t: number): { clip: Clip; local: number; trackIndex: number }[] {
  const out: { clip: Clip; local: number; trackIndex: number }[] = [];
  p.tracks.forEach((tr, trackIndex) => {
    if (tr.hidden || tr.kind === "audio") return;
    for (const clip of tr.clips) {
      if (t >= clip.start && t < clip.start + clip.duration) out.push({ clip, local: t - clip.start, trackIndex });
    }
  });
  return out;
}

/** Which source time each visible media asset must show at timeline time t. */
export function mediaTimes(p: Project, t: number): { assetId: string; time: number; clipId: string }[] {
  return activeClips(p, t)
    .filter((a) => a.clip.kind === "media")
    .map((a) => ({ assetId: (a.clip as MediaClip).assetId, time: (a.clip as MediaClip).trimIn + a.local, clipId: a.clip.id }));
}

function sizeOf(d: Drawable): [number, number] {
  const w = (d.videoWidth || d.naturalWidth || (typeof d.width === "number" ? d.width : 0)) as number;
  const h = (d.videoHeight || d.naturalHeight || (typeof d.height === "number" ? d.height : 0)) as number;
  return [w || 1, h || 1];
}

export function renderFrame(ctx: Ctx, p: Project, t: number, media: MediaLookup): void {
  const W = p.width, H = p.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.fillStyle = p.background || "#000";
  ctx.fillRect(0, 0, W, H);
  for (const { clip, local } of activeClips(p, t)) {
    const tr = animatedTransform(clip.transform, clip.anim, local);
    const ts = transitionState(clip, local);
    const alpha = Math.max(0, Math.min(1, tr.opacity * ts.alpha));
    if (alpha <= 0.001) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    const cx = (tr.x + ts.dx) * W, cy = (tr.y + ts.dy) * H;
    ctx.translate(cx, cy);
    ctx.rotate((tr.rotation * Math.PI) / 180);
    ctx.scale(tr.scale * ts.scale, tr.scale * ts.scale);
    if (ts.wipe < 1) {
      ctx.beginPath();
      ctx.rect(-W / 2, -H / 2, W * ts.wipe, H);
      ctx.clip();
    }
    const blurPx = ts.blur * (H / 1080);
    switch (clip.kind) {
      case "media": drawMedia(ctx, p, clip, media, blurPx); break;
      case "fill": drawFill(ctx, p, clip, blurPx); break;
      case "shape": drawShape(ctx, p, clip, local, blurPx); break;
      case "text": drawText(ctx, p, clip, local, blurPx); break;
      case "captions": drawCaptions(ctx, p, clip, local); break;
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawMedia(ctx: Ctx, p: Project, clip: MediaClip, media: MediaLookup, blurPx: number) {
  const src = media.get(clip.assetId);
  const W = p.width, H = p.height;
  if (!src) {
    ctx.fillStyle = "#16181d";
    ctx.fillRect(-W / 2, -H / 2, W, H);
    return;
  }
  const [sw, sh] = sizeOf(src);
  const k = clip.fit === "contain" ? Math.min(W / sw, H / sh) : Math.max(W / sw, H / sh);
  const dw = sw * k, dh = sh * k;
  const g = clip.grade ?? {};
  const filters: string[] = [];
  if (g.brightness !== undefined && g.brightness !== 1) filters.push(`brightness(${g.brightness})`);
  if (g.contrast !== undefined && g.contrast !== 1) filters.push(`contrast(${g.contrast})`);
  if (g.saturation !== undefined && g.saturation !== 1) filters.push(`saturate(${g.saturation})`);
  const blur = (g.blur ?? 0) * (H / 1080) + blurPx;
  if (blur > 0.05) filters.push(`blur(${blur.toFixed(2)}px)`);
  ctx.filter = filters.length ? filters.join(" ") : "none";
  ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
  ctx.filter = "none";
  if (g.temperature) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha *= Math.min(1, Math.abs(g.temperature)) * 0.55;
    ctx.fillStyle = g.temperature > 0 ? "#ff9a3c" : "#3c8cff";
    ctx.fillRect(-dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
  if (g.vignette) {
    const r = Math.hypot(W, H) / 2;
    const grad = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${Math.min(1, g.vignette) * 0.85})`);
    ctx.fillStyle = grad;
    ctx.fillRect(-W / 2, -H / 2, W, H);
  }
}

function drawFill(ctx: Ctx, p: Project, clip: FillClip, blurPx: number) {
  const W = p.width, H = p.height;
  const colors = clip.colors.length ? clip.colors : ["#000"];
  if (colors.length === 1) {
    ctx.fillStyle = colors[0];
  } else {
    const a = (clip.angle * Math.PI) / 180;
    const len = Math.abs(W * Math.cos(a)) / 2 + Math.abs(H * Math.sin(a)) / 2;
    const g = ctx.createLinearGradient(-Math.cos(a) * len, -Math.sin(a) * len, Math.cos(a) * len, Math.sin(a) * len);
    colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
    ctx.fillStyle = g;
  }
  if (blurPx > 0.05) ctx.filter = `blur(${blurPx}px)`;
  ctx.fillRect(-W / 2, -H / 2, W, H);
  ctx.filter = "none";
}

function starPath(ctx: Ctx, r: number, points = 5, inner = 0.45) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function blobPath(ctx: Ctx, w: number, h: number, local: number) {
  const n = 8;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wob = 1 + 0.08 * Math.sin(a * 3 + local * 2.2) + 0.05 * Math.cos(a * 2 - local * 1.4);
    const x = Math.cos(a) * (w / 2) * wob, y = Math.sin(a) * (h / 2) * wob;
    if (i === 0) ctx.moveTo(x, y);
    else {
      const pa = ((i - 0.5) / n) * Math.PI * 2;
      ctx.quadraticCurveTo(Math.cos(pa) * (w / 2) * 1.08 * wob, Math.sin(pa) * (h / 2) * 1.08 * wob, x, y);
    }
  }
  ctx.closePath();
}

function drawShape(ctx: Ctx, p: Project, clip: ShapeClip, local: number, blurPx: number) {
  const w = clip.w * p.width, h = clip.h * p.height;
  const scale = p.height / 1080;
  if (blurPx > 0.05) ctx.filter = `blur(${blurPx}px)`;
  ctx.fillStyle = clip.fill;
  ctx.strokeStyle = clip.stroke ?? "transparent";
  ctx.lineWidth = (clip.strokeWidth ?? 0) * scale;
  ctx.beginPath();
  switch (clip.shape) {
    case "rect": {
      const r = Math.min((clip.radius ?? 0) * scale, w / 2, h / 2);
      ctx.roundRect(-w / 2, -h / 2, w, h, r);
      break;
    }
    case "circle":
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case "ring":
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(2, (clip.strokeWidth ?? 8) * scale);
      ctx.strokeStyle = clip.stroke ?? clip.fill;
      ctx.stroke();
      ctx.filter = "none";
      return;
    case "star":
      starPath(ctx, Math.min(w, h) / 2);
      break;
    case "blob":
      blobPath(ctx, w, h, local);
      break;
    case "line":
      ctx.rect(-w / 2, -Math.max(2, h) / 2, w, Math.max(2, h));
      break;
  }
  if (clip.fill && clip.fill !== "transparent") ctx.fill();
  if (clip.stroke && clip.strokeWidth) ctx.stroke();
  ctx.filter = "none";
}

export function fontFor(style: { font: string; weight: number }, px: number) {
  return `${style.weight} ${px}px ${FONT_STACK[style.font] ?? FONT_STACK.sans}`;
}

export function wrapLines(ctx: Ctx, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (ctx.measureText(next).width > maxW && line) {
        out.push(line);
        line = w;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

function drawText(ctx: Ctx, p: Project, clip: TextClip, local: number, blurPx: number) {
  const s = clip.style;
  const scale = p.height / 1080;
  const px = s.size * scale;
  ctx.font = fontFor(s, px);
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D).letterSpacing = `${s.tracking * px}px`;
  ctx.textBaseline = "middle";
  ctx.textAlign = s.align;
  if (blurPx > 0.05) ctx.filter = `blur(${blurPx}px)`;

  let text = clip.text;
  if (clip.reveal === "type") {
    const n = Math.floor(Math.min(1, local / Math.max(0.4, Math.min(clip.duration * 0.6, text.length * 0.045))) * text.length);
    text = text.slice(0, n);
  }
  const lines = wrapLines(ctx, clip.text, p.width * 0.86);
  const shown = clip.reveal === "type" ? wrapLines(ctx, text, p.width * 0.86) : lines;
  const lh = px * 1.15;
  const totalH = lines.length * lh;
  const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const anchorX = s.align === "left" ? -widest / 2 : s.align === "right" ? widest / 2 : 0;

  if (s.background) {
    const padX = px * 0.45, padY = px * 0.28;
    ctx.save();
    ctx.fillStyle = s.background;
    ctx.beginPath();
    ctx.roundRect(-widest / 2 - padX, -totalH / 2 - padY, widest + padX * 2, totalH + padY * 2, px * 0.22);
    ctx.fill();
    ctx.restore();
  }
  if (s.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = px * 0.25;
    ctx.shadowOffsetY = px * 0.06;
  }
  ctx.fillStyle = s.color;
  let wordIndex = 0;
  shown.forEach((line, i) => {
    const y = -totalH / 2 + lh * (i + 0.5);
    if (clip.reveal === "words" || clip.reveal === "rise" || clip.reveal === "pop") {
      // per-word stagger
      const words = line.split(" ");
      const full = ctx.measureText(line).width;
      let x = s.align === "left" ? anchorX : s.align === "right" ? anchorX - full : -full / 2;
      const space = ctx.measureText(" ").width;
      ctx.textAlign = "left";
      for (const w of words) {
        const delay = wordIndex * 0.07;
        const k = Math.max(0, Math.min(1, (local - delay) / 0.38));
        const e = ease(clip.reveal === "pop" ? "back" : "out", k);
        ctx.save();
        ctx.globalAlpha *= clip.reveal === "words" ? k : Math.min(1, k * 1.5);
        const ww = ctx.measureText(w).width;
        if (clip.reveal === "rise") ctx.translate(0, (1 - e) * px * 0.6);
        if (clip.reveal === "pop") {
          ctx.translate(x + ww / 2, y);
          ctx.scale(0.4 + 0.6 * e, 0.4 + 0.6 * e);
          ctx.translate(-(x + ww / 2), -y);
        }
        ctx.fillText(w, x, y);
        ctx.restore();
        x += ww + space;
        wordIndex++;
      }
      ctx.textAlign = s.align;
    } else {
      ctx.fillText(line, anchorX, y);
    }
  });
  ctx.filter = "none";
}

/** Group words into short phrases the way short-form captions are read. */
export function captionPhrases(words: CaptionClip["words"], maxWords: number): CaptionClip["words"][] {
  const phrases: CaptionClip["words"][] = [];
  let cur: CaptionClip["words"] = [];
  for (const w of words) {
    const gap = cur.length ? w.t0 - cur[cur.length - 1].t1 : 0;
    if (cur.length >= maxWords || gap > 0.6 || (cur.length && /[.!?]$/.test(cur[cur.length - 1].w))) {
      phrases.push(cur);
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) phrases.push(cur);
  return phrases;
}

function drawCaptions(ctx: Ctx, p: Project, clip: CaptionClip, local: number) {
  const phrases = captionPhrases(clip.words, Math.max(1, clip.maxWords));
  const phrase = phrases.find((ph) => local >= ph[0].t0 - 0.05 && local < ph[ph.length - 1].t1 + 0.25);
  if (!phrase) return;
  const scale = p.height / 1080;
  const px = clip.size * scale;
  const upper = clip.look === "bold-pop";
  ctx.font = `${upper ? 800 : 600} ${px}px ${FONT_STACK.sans}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const label = (w: string) => (upper ? w.toUpperCase() : w);
  const space = ctx.measureText(" ").width;
  const widths = phrase.map((w) => ctx.measureText(label(w.w)).width);
  const total = widths.reduce((a, b) => a + b, 0) + space * (phrase.length - 1);
  // wrap into at most two lines if too wide
  const maxW = p.width * 0.84;
  const lines: number[][] = [[]];
  let lw = 0;
  phrase.forEach((_, i) => {
    const add = widths[i] + (lines[lines.length - 1].length ? space : 0);
    if (lw + add > maxW && lines[lines.length - 1].length) {
      lines.push([]);
      lw = 0;
    }
    lines[lines.length - 1].push(i);
    lw += widths[i] + (lines[lines.length - 1].length > 1 ? space : 0);
  });
  const lh = px * 1.2;
  if (clip.look === "boxed") {
    const bw = Math.min(total, maxW) + px * 0.9;
    const bh = lines.length * lh + px * 0.5;
    ctx.fillStyle = "rgba(10,10,12,0.78)";
    ctx.beginPath();
    ctx.roundRect(-bw / 2, -bh / 2, bw, bh, px * 0.25);
    ctx.fill();
  }
  lines.forEach((idxs, li) => {
    const lineW = idxs.reduce((a, i) => a + widths[i], 0) + space * (idxs.length - 1);
    let x = -lineW / 2;
    const y = -((lines.length - 1) * lh) / 2 + li * lh;
    for (const i of idxs) {
      const w = phrase[i];
      const active = local >= w.t0 && local < w.t1 + 0.05;
      const spoken = local >= w.t0;
      ctx.save();
      let k = 1;
      if (clip.look === "bold-pop") {
        k = ease("back", Math.min(1, Math.max(0, (local - w.t0 + 0.05) / 0.18)));
        if (!spoken) ctx.globalAlpha *= 0.0;
      }
      const cx = x + widths[i] / 2;
      ctx.translate(cx, y);
      if (clip.look === "bold-pop") ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
      ctx.lineJoin = "round";
      if (clip.look !== "boxed") {
        ctx.lineWidth = px * 0.16;
        ctx.strokeStyle = "rgba(0,0,0,0.85)";
        ctx.strokeText(label(w.w), -widths[i] / 2, 0);
      }
      ctx.fillStyle =
        clip.look === "karaoke" ? (spoken ? clip.highlight : "rgba(255,255,255,0.55)") :
        active ? clip.highlight : "#ffffff";
      ctx.fillText(label(w.w), -widths[i] / 2, 0);
      ctx.restore();
      x += widths[i] + space;
    }
  });
}
