// Clip builders with sensible defaults, so a tool call can stay short:
// `add_text {text:"Launch day", preset:"title"}` is enough to get a good title.

import {
  type Anim,
  type AudioClip,
  type CaptionClip,
  type CaptionLook,
  type FillClip,
  type Key,
  type MediaClip,
  type ShapeClip,
  type ShapeKind,
  type TextClip,
  type TextReveal,
  type TextStyle,
  type Transform,
  type Transition,
  type Word,
  DEFAULT_TRANSFORM,
  newId,
} from "./schema";

export const TEXT_PRESETS = {
  title: {
    style: { font: "display", size: 128, weight: 700, color: "#ffffff", align: "center", tracking: -0.03, shadow: true },
    transform: { y: 0.5 },
    reveal: "rise",
  },
  subtitle: {
    style: { font: "sans", size: 54, weight: 500, color: "#e8e8ea", align: "center", tracking: -0.01, shadow: true },
    transform: { y: 0.62 },
    reveal: "words",
  },
  "lower-third": {
    style: { font: "sans", size: 46, weight: 600, color: "#0b0b0d", background: "#f4f4f2", align: "left", tracking: -0.01 },
    transform: { x: 0.24, y: 0.82 },
    reveal: "none",
  },
  kinetic: {
    style: { font: "display", size: 150, weight: 800, color: "#ffffff", align: "center", tracking: -0.04, shadow: true },
    transform: { y: 0.5 },
    reveal: "pop",
  },
  quote: {
    style: { font: "serif", size: 84, weight: 400, color: "#f6f1e8", align: "center", tracking: -0.01, shadow: true },
    transform: { y: 0.48 },
    reveal: "words",
  },
  label: {
    style: { font: "mono", size: 30, weight: 500, color: "#ffffff", background: "rgba(10,10,12,0.72)", align: "left", tracking: 0.04 },
    transform: { x: 0.14, y: 0.1 },
    reveal: "type",
  },
  "end-card": {
    style: { font: "display", size: 96, weight: 700, color: "#ffffff", align: "center", tracking: -0.03 },
    transform: { y: 0.46 },
    reveal: "rise",
  },
} as const satisfies Record<string, { style: TextStyle; transform: Partial<Transform>; reveal: TextReveal }>;
export type TextPreset = keyof typeof TEXT_PRESETS;

export const MOTION_PRESETS = [
  "none", "float", "bounce", "pulse", "spin", "drift-left", "drift-right", "ken-burns", "shake", "pop-in", "swing", "orbit",
] as const;
export type MotionPreset = (typeof MOTION_PRESETS)[number];

/** Keyframes for a named motion, sized to the clip length. Values are absolute, based on `base`. */
export function motion(preset: MotionPreset, duration: number, base: Transform = DEFAULT_TRANSFORM): Anim {
  const d = Math.max(0.2, duration);
  const loop = (period: number, f: (phase: number) => number, ease: Key[2] = "inOut"): Key[] => {
    const keys: Key[] = [];
    const steps = Math.max(2, Math.min(64, Math.round((d / period) * 4)));
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * d;
      keys.push([+t.toFixed(3), f((t / period) * Math.PI * 2), ease]);
    }
    return keys;
  };
  switch (preset) {
    case "none":
      return {};
    case "float":
      return { y: loop(2.4, (ph) => base.y + Math.sin(ph) * 0.015) };
    case "bounce": {
      const keys: Key[] = [];
      const hops = Math.max(1, Math.round(d / 0.7));
      for (let i = 0; i < hops; i++) {
        const t0 = (i / hops) * d, t1 = ((i + 0.5) / hops) * d, t2 = ((i + 1) / hops) * d;
        keys.push([t0, base.y, "in"], [t1, base.y - 0.08, "out"], [t2, base.y, "in"]);
      }
      return { y: keys, scale: loop(d / hops, (ph) => base.scale * (1 + 0.04 * Math.max(0, -Math.cos(ph)))) };
    }
    case "pulse":
      return { scale: loop(1.2, (ph) => base.scale * (1 + 0.05 * (0.5 + 0.5 * Math.sin(ph)))) };
    case "spin":
      return { rotation: [[0, base.rotation, "linear"], [d, base.rotation + 360 * Math.max(1, Math.round(d / 3)), "linear"]] };
    case "drift-left":
      return { x: [[0, base.x + 0.04, "linear"], [d, base.x - 0.04, "linear"]] };
    case "drift-right":
      return { x: [[0, base.x - 0.04, "linear"], [d, base.x + 0.04, "linear"]] };
    case "ken-burns":
      return { scale: [[0, base.scale, "linear"], [d, base.scale * 1.12, "linear"]], x: [[0, base.x, "linear"], [d, base.x + 0.02, "linear"]] };
    case "shake":
      return { x: loop(0.12, (ph) => base.x + Math.sin(ph) * 0.004, "linear").slice(0, 40), rotation: loop(0.18, (ph) => base.rotation + Math.sin(ph) * 0.8, "linear").slice(0, 40) };
    case "pop-in":
      return { scale: [[0, base.scale * 0.2, "linear"], [Math.min(0.45, d * 0.4), base.scale, "back"]], opacity: [[0, 0, "linear"], [Math.min(0.2, d * 0.2), base.opacity, "out"]] };
    case "swing":
      return { rotation: loop(1.6, (ph) => base.rotation + Math.sin(ph) * 8) };
    case "orbit":
      return {
        x: loop(3, (ph) => base.x + Math.cos(ph) * 0.06, "linear"),
        y: loop(3, (ph) => base.y + Math.sin(ph) * 0.06, "linear"),
      };
  }
}

function tf(t?: Partial<Transform>): Transform {
  return { ...DEFAULT_TRANSFORM, ...(t ?? {}) };
}

export function makeText(o: {
  text: string; start: number; duration: number; preset?: TextPreset; style?: Partial<TextStyle>;
  transform?: Partial<Transform>; reveal?: TextReveal; enter?: Transition; exit?: Transition; motion?: MotionPreset; id?: string;
}): TextClip {
  const pre = TEXT_PRESETS[o.preset ?? "title"];
  const transform = tf({ ...pre.transform, ...o.transform });
  return {
    id: o.id ?? newId("txt"),
    kind: "text",
    text: o.text,
    start: o.start,
    duration: o.duration,
    style: { ...(pre.style as TextStyle), ...(o.style ?? {}) },
    reveal: o.reveal ?? pre.reveal,
    transform,
    enter: o.enter ?? { type: "fade", duration: 0.25 },
    exit: o.exit ?? { type: "fade", duration: 0.25 },
    anim: o.motion ? motion(o.motion, o.duration, transform) : undefined,
  };
}

export function makeMedia(o: {
  assetId: string; start: number; duration: number; trimIn?: number; fit?: "cover" | "contain";
  transform?: Partial<Transform>; enter?: Transition; exit?: Transition; motion?: MotionPreset; volume?: number; id?: string;
}): MediaClip {
  const transform = tf(o.transform);
  return {
    id: o.id ?? newId("clip"),
    kind: "media",
    assetId: o.assetId,
    start: o.start,
    duration: o.duration,
    trimIn: o.trimIn ?? 0,
    fit: o.fit ?? "cover",
    volume: o.volume ?? 1,
    transform,
    enter: o.enter,
    exit: o.exit,
    anim: o.motion ? motion(o.motion, o.duration, transform) : undefined,
  };
}

export function makeShape(o: {
  shape: ShapeKind; start: number; duration: number; w?: number; h?: number; fill?: string; stroke?: string; strokeWidth?: number;
  radius?: number; transform?: Partial<Transform>; enter?: Transition; exit?: Transition; motion?: MotionPreset; id?: string;
}): ShapeClip {
  const transform = tf(o.transform);
  return {
    id: o.id ?? newId("shp"),
    kind: "shape",
    shape: o.shape,
    start: o.start,
    duration: o.duration,
    w: o.w ?? 0.2,
    h: o.h ?? (o.w ? o.w * (16 / 9) : 0.2 * (16 / 9)),
    fill: o.fill ?? "#ffffff",
    stroke: o.stroke,
    strokeWidth: o.strokeWidth,
    radius: o.radius,
    transform,
    enter: o.enter ?? { type: "zoom", duration: 0.3 },
    exit: o.exit ?? { type: "fade", duration: 0.2 },
    anim: o.motion ? motion(o.motion, o.duration, transform) : undefined,
  };
}

export function makeFill(o: { colors: string[]; angle?: number; start: number; duration: number; enter?: Transition; exit?: Transition; id?: string }): FillClip {
  return {
    id: o.id ?? newId("fill"),
    kind: "fill",
    colors: o.colors,
    angle: o.angle ?? 135,
    start: o.start,
    duration: o.duration,
    transform: tf(),
    enter: o.enter,
    exit: o.exit,
  };
}

export function makeCaptions(o: { words: Word[]; start: number; look?: CaptionLook; highlight?: string; size?: number; maxWords?: number; y?: number; id?: string }): CaptionClip {
  const end = o.words.length ? Math.max(...o.words.map((w) => w.t1)) : 1;
  return {
    id: o.id ?? newId("cap"),
    kind: "captions",
    words: o.words,
    start: o.start,
    duration: end + 0.3,
    look: o.look ?? "bold-pop",
    highlight: o.highlight ?? "#ffd23f",
    size: o.size ?? 76,
    maxWords: o.maxWords ?? 3,
    transform: tf({ y: o.y ?? 0.78 }),
  };
}

export function makeAudio(o: { assetId: string; start: number; duration: number; trimIn?: number; volume?: number; fadeIn?: number; fadeOut?: number; id?: string }): AudioClip {
  return {
    id: o.id ?? newId("aud"),
    kind: "audio",
    assetId: o.assetId,
    start: o.start,
    duration: o.duration,
    trimIn: o.trimIn ?? 0,
    volume: o.volume ?? 0.8,
    fadeIn: o.fadeIn ?? 0.5,
    fadeOut: o.fadeOut ?? 1,
    transform: tf(),
  };
}

/** Split plain text into evenly timed words. Used when no transcript exists (typed scripts, demos). */
export function wordsFromText(text: string, wordsPerSecond = 2.6, offset = 0): Word[] {
  const parts = text.split(/\s+/).filter(Boolean);
  return parts.map((w, i) => {
    const t0 = offset + i / wordsPerSecond;
    const t1 = t0 + Math.min(0.9, 0.85 / wordsPerSecond + w.length * 0.012);
    return { t0: +t0.toFixed(3), t1: +t1.toFixed(3), w };
  });
}
