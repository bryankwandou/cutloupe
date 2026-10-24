// The offline demo: a scripted agent session that edits a reel step by step,
// looks at its own frames, finds a problem, and fixes it. It runs against the
// same Session and ops the MCP server uses, so what you watch is the real path.

import {
  type Asset,
  type Op,
  LIBRARY,
  emptyProject,
  makeAudio,
  makeCaptions,
  makeFill,
  makeShape,
  makeText,
  synthesize,
  toWav,
  wordsFromText,
} from "@cutloupe/core";

export interface Step {
  wait: number; // ms before this step
  say?: string; // what the agent "thinks", shown in the activity feed
  ops?: () => Promise<Op[]> | Op[];
  look?: number[];
}

const wavCache = new Map<string, string>();
export async function musicUrl(id: string): Promise<string> {
  const hit = wavCache.get(id);
  if (hit) return hit;
  const r = LIBRARY.find((x) => x.id === id)!;
  await new Promise((res) => setTimeout(res, 0));
  const pcm = synthesize(r, 32000);
  const url = URL.createObjectURL(new Blob([toWav(pcm, 32000) as BlobPart], { type: "audio/wav" }));
  wavCache.set(id, url);
  return url;
}

export async function musicAsset(id: string): Promise<Asset> {
  const r = LIBRARY.find((x) => x.id === id)!;
  return { id: `music_${id}`, kind: "audio", name: r.name, src: await musicUrl(id), duration: r.seconds, hasAudio: true, license: "CC0, Cutloupe library", bpm: r.bpm, mood: r.mood };
}

export function demoProject() {
  return emptyProject("Launch reel", "16:9", 30, "reel_demo");
}

export function demoScript(): Step[] {
  const sub = "sub_demo";
  return [
    { wait: 700, say: "Plan: 14-second launch reel. Background, title, subtitle, captions, music, end card." },
    { wait: 900, ops: () => [{ op: "add_clip", trackId: "v1", clip: makeFill({ id: "bg_demo", colors: ["#07080c", "#18213d", "#3b1c47"], angle: 135, start: 0, duration: 14 }) }] },
    {
      wait: 900,
      ops: () => [
        { op: "add_clip", trackId: "o1", clip: makeShape({ id: "ring_demo", shape: "ring", start: 0.2, duration: 13.8, w: 0.36, fill: "rgba(255,178,36,0.0)", stroke: "#ffb224", strokeWidth: 3, transform: { opacity: 0.55 }, motion: "orbit" }) },
        { op: "add_clip", trackId: "o1", clip: makeShape({ id: "dot_demo", shape: "circle", start: 0.6, duration: 13.4, w: 0.02, fill: "#ffb224", transform: { x: 0.72, y: 0.3 }, motion: "float" }) },
      ],
    },
    { wait: 1000, ops: () => [{ op: "add_clip", trackId: "t1", clip: makeText({ id: "title_demo", text: "Cutloupe", preset: "kinetic", start: 0.4, duration: 4.2 }) }] },
    // First pass places the subtitle too high on purpose: the agent should catch it when it looks.
    { wait: 1000, ops: () => [{ op: "add_clip", trackId: "t1", clip: makeText({ id: sub, text: "the video editor your agent can see", preset: "subtitle", start: 1.1, duration: 3.5, transform: { y: 0.55 } }) }] },
    { wait: 900, say: "Adding music from the built-in library: Tally, 120 BPM, CC0.", ops: async () => [{ op: "add_asset", asset: await musicAsset("tally") }, { op: "add_clip", trackId: "a1", clip: makeAudio({ id: "music_demo", assetId: "music_tally", start: 0, duration: 14, volume: 0.7, fadeOut: 2 }) }] },
    { wait: 1100, say: "Looking at 1.5s and 2.5s before going further.", look: [1.5, 2.5] },
    { wait: 1400, say: "The subtitle overlaps the title at 2.5s. Moving it down to y 0.68." },
    { wait: 700, ops: () => [{ op: "update_clip", clipId: sub, patch: { transform: { y: 0.68 } } }] },
    { wait: 900, say: "Checking again.", look: [2.5] },
    { wait: 1200, say: "Clear now. On to captions." },
    {
      wait: 700,
      ops: () => [{ op: "add_clip", trackId: "t1", clip: makeCaptions({ id: "cap_demo", words: wordsFromText("Every edit shows up in the studio the moment the agent makes it", 2.8), start: 4.8, look: "bold-pop", y: 0.8 }) }],
    },
    {
      wait: 900,
      ops: () => [
        { op: "add_clip", trackId: "t1", clip: makeText({ id: "lt_demo", text: "Remotion · CapCut · Premiere · Resolve", preset: "lower-third", start: 9.2, duration: 2.6, transform: { x: 0.3, y: 0.16 }, enter: { type: "slide-right", duration: 0.35 } }) },
        { op: "add_clip", trackId: "o1", clip: makeShape({ id: "star_demo", shape: "star", start: 9.4, duration: 2.4, w: 0.05, fill: "#ffb224", transform: { x: 0.86, y: 0.2 }, motion: "spin" }) },
      ],
    },
    { wait: 900, ops: () => [{ op: "add_clip", trackId: "t1", clip: makeText({ id: "end_demo", text: "npx cutloupe", preset: "end-card", start: 11.8, duration: 2.2, style: { font: "mono", size: 88 } }) }] },
    { wait: 1000, say: "Contact sheet across the whole reel.", look: [2.5, 6, 10, 12.8] },
    { wait: 1600, say: "Done. Every frame checked. Export when you are ready: MP4, FCPXML, Premiere XML, OTIO, CapCut, Remotion." },
  ];
}
