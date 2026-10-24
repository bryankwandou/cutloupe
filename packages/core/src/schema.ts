// The project file. Everything an agent or a person changes goes through an Op
// (see ops.ts), so every edit can be counted, replayed, broadcast and hashed.

export type Ease = "linear" | "in" | "out" | "inOut" | "back" | "spring";

/** A keyframe: time in seconds relative to the clip start, value, easing into this key. */
export type Key = [number, number, Ease?];

export type AnimProp = "x" | "y" | "scale" | "rotation" | "opacity";
export type Anim = Partial<Record<AnimProp, Key[]>>;

/** Position is the clip centre as a fraction of the frame (0..1). */
export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export type TransitionType = "fade" | "slide-left" | "slide-right" | "slide-up" | "zoom" | "wipe" | "blur";
export interface Transition {
  type: TransitionType;
  duration: number;
}

export interface Grade {
  brightness: number; // 1 = unchanged
  contrast: number; // 1 = unchanged
  saturation: number; // 1 = unchanged
  temperature: number; // -1 cool .. 1 warm
  vignette: number; // 0..1
  blur: number; // px at 1080p
}

interface ClipBase {
  id: string;
  start: number;
  duration: number;
  transform: Transform;
  anim?: Anim;
  enter?: Transition;
  exit?: Transition;
  label?: string;
}

export interface MediaClip extends ClipBase {
  kind: "media";
  assetId: string;
  trimIn: number;
  fit: "cover" | "contain";
  grade?: Partial<Grade>;
  volume: number;
}

export type TextReveal = "none" | "type" | "words" | "rise" | "pop";
export interface TextStyle {
  font: "sans" | "display" | "mono" | "serif";
  size: number; // px on a 1080-tall frame
  weight: number;
  color: string;
  background?: string;
  align: "left" | "center" | "right";
  tracking: number; // em
  shadow?: boolean;
}

export interface TextClip extends ClipBase {
  kind: "text";
  text: string;
  style: TextStyle;
  reveal: TextReveal;
}

export type ShapeKind = "rect" | "circle" | "star" | "blob" | "line" | "ring";
export interface ShapeClip extends ClipBase {
  kind: "shape";
  shape: ShapeKind;
  w: number; // fraction of frame width
  h: number; // fraction of frame height
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number; // px at 1080p
}

export interface FillClip extends ClipBase {
  kind: "fill";
  colors: string[];
  angle: number; // degrees, gradient direction
}

export interface Word {
  t0: number; // seconds relative to clip start
  t1: number;
  w: string;
}
export type CaptionLook = "bold-pop" | "clean" | "karaoke" | "boxed";
export interface CaptionClip extends ClipBase {
  kind: "captions";
  words: Word[];
  look: CaptionLook;
  highlight: string;
  size: number;
  maxWords: number;
}

export interface AudioClip extends ClipBase {
  kind: "audio";
  assetId: string;
  trimIn: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export type Clip = MediaClip | TextClip | ShapeClip | FillClip | CaptionClip | AudioClip;
export type ClipKind = Clip["kind"];

export type TrackKind = "video" | "overlay" | "text" | "audio";
export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  clips: Clip[];
  hidden?: boolean;
  muted?: boolean;
}

export type AssetKind = "video" | "image" | "audio";
export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  /** URL the studio loads the asset from. */
  src: string;
  /** Absolute path on disk; only the local MCP server fills this. */
  path?: string;
  duration: number;
  width?: number;
  height?: number;
  hasAudio?: boolean;
  sha256?: string;
  license?: string;
  bpm?: number;
  mood?: string;
}

export interface Marker {
  t: number;
  note: string;
  by: "agent" | "human";
}

export interface Project {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  background: string;
  tracks: Track[];
  assets: Record<string, Asset>;
  markers: Marker[];
}

export const DEFAULT_TRANSFORM: Transform = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 };

export const FORMATS = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
} as const;
export type FormatName = keyof typeof FORMATS;

export function emptyProject(name = "Untitled reel", format: FormatName = "16:9", fps = 30, id?: string): Project {
  const { width, height } = FORMATS[format];
  return {
    id: id ?? newId("reel"),
    name,
    width,
    height,
    fps,
    background: "#000000",
    tracks: [
      { id: "v1", name: "Video", kind: "video", clips: [] },
      { id: "o1", name: "Overlay", kind: "overlay", clips: [] },
      { id: "t1", name: "Text", kind: "text", clips: [] },
      { id: "a1", name: "Music", kind: "audio", clips: [] },
    ],
    assets: {},
    markers: [],
  };
}

let counter = 0;
export function newId(prefix: string): string {
  counter = (counter + 1) % 1296;
  const rand = Math.floor(Math.random() * 36 ** 4).toString(36).padStart(4, "0");
  return `${prefix}_${Date.now().toString(36).slice(-5)}${counter.toString(36).padStart(2, "0")}${rand}`;
}

export function projectDuration(p: Project): number {
  let end = 0;
  for (const tr of p.tracks) for (const c of tr.clips) end = Math.max(end, c.start + c.duration);
  return Math.round(end * 1000) / 1000;
}

export function findClip(p: Project, clipId: string): { track: Track; clip: Clip; index: number } | null {
  for (const track of p.tracks) {
    const index = track.clips.findIndex((c) => c.id === clipId);
    if (index >= 0) return { track, clip: track.clips[index], index };
  }
  return null;
}
