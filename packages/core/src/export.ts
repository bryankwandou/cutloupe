// Hand-offs to other editors. Each format carries what that editor can read;
// what it cannot read is listed in `notes` instead of being silently dropped.

import { captionPhrases } from "./render";
import type { Asset, CaptionClip, Clip, MediaClip, Project, TextClip } from "./schema";
import { projectDuration } from "./schema";

export interface ExportFile {
  path: string;
  content: string;
}
export interface ExportBundle {
  format: string;
  files: ExportFile[];
  notes: string[];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function fileUrl(a: Asset): string {
  if (a.path) {
    const norm = a.path.replace(/\\/g, "/");
    return "file:///" + encodeURI(norm.replace(/^\/+/, "")).replace(/#/g, "%23");
  }
  return a.src;
}

function pad(n: number, w = 2) {
  return String(Math.floor(n)).padStart(w, "0");
}
function stamp(t: number, sep: "," | ".") {
  const ms = Math.round(t * 1000);
  return `${pad(ms / 3600000)}:${pad((ms / 60000) % 60)}:${pad((ms / 1000) % 60)}${sep}${pad(ms % 1000, 3)}`;
}

function cues(p: Project): { t0: number; t1: number; text: string }[] {
  const out: { t0: number; t1: number; text: string }[] = [];
  for (const tr of p.tracks) {
    if (tr.hidden) continue;
    for (const c of tr.clips) {
      if (c.kind !== "captions") continue;
      for (const ph of captionPhrases((c as CaptionClip).words, (c as CaptionClip).maxWords)) {
        out.push({ t0: c.start + ph[0].t0, t1: c.start + ph[ph.length - 1].t1, text: ph.map((w) => w.w).join(" ") });
      }
    }
  }
  return out.sort((a, b) => a.t0 - b.t0);
}

export function toSrt(p: Project): string {
  return cues(p).map((c, i) => `${i + 1}\n${stamp(c.t0, ",")} --> ${stamp(c.t1, ",")}\n${c.text}\n`).join("\n");
}

export function toVtt(p: Project): string {
  return "WEBVTT\n\n" + cues(p).map((c) => `${stamp(c.t0, ".")} --> ${stamp(c.t1, ".")}\n${c.text}\n`).join("\n");
}

// ---------- FCPXML (DaVinci Resolve, Premiere Pro, Final Cut Pro) ----------

export function toFcpxml(p: Project): ExportBundle {
  const fps = p.fps;
  const rt = (t: number) => `${Math.round(t * fps)}/${fps}s`;
  const total = Math.max(projectDuration(p), 1 / fps);
  const notes: string[] = [];
  const res: string[] = [`<format id="r0" name="Cutloupe ${p.width}x${p.height} ${fps}p" frameDuration="1/${fps}s" width="${p.width}" height="${p.height}"/>`];
  const ref: Record<string, string> = {};
  let n = 1;
  for (const a of Object.values(p.assets)) {
    const id = `r${n++}`;
    ref[a.id] = id;
    const hasVideo = a.kind !== "audio" ? 1 : 0;
    const hasAudio = a.kind === "audio" || a.hasAudio ? 1 : 0;
    const dur = a.kind === "image" ? total : a.duration;
    res.push(
      `<asset id="${id}" name="${esc(a.name)}" start="0s" duration="${rt(dur)}" hasVideo="${hasVideo}" hasAudio="${hasAudio}"${hasVideo ? ' format="r0"' : ""}>` +
        `<media-rep kind="original-media" src="${esc(fileUrl(a))}"/></asset>`,
    );
  }
  const titleId = `r${n++}`;
  res.push(`<effect id="${titleId}" name="Basic Title" uid=".../Titles.localized/Bumper:Opener.localized/Basic Title.localized/Basic Title.moti"/>`);

  const connected: string[] = [];
  let skippedShapes = 0;
  p.tracks.forEach((tr, i) => {
    if (tr.hidden) return;
    const lane = tr.kind === "audio" ? -(i + 1) : i + 1;
    for (const c of tr.clips) {
      if (c.kind === "media" || c.kind === "audio") {
        const a = p.assets[c.assetId];
        if (!a) continue;
        const vol = c.kind === "audio" ? c.volume : (c as MediaClip).volume;
        const db = vol > 0 ? (20 * Math.log10(vol)).toFixed(1) : "-96";
        connected.push(
          `<asset-clip ref="${ref[a.id]}" lane="${lane}" offset="${rt(c.start)}" start="${rt(c.trimIn)}" duration="${rt(c.duration)}" name="${esc(c.label ?? a.name)}">` +
            (vol !== 1 ? `<adjust-volume amount="${db}dB"/>` : "") +
            `</asset-clip>`,
        );
      } else if (c.kind === "text") {
        const t = c as TextClip;
        connected.push(
          `<title ref="${titleId}" lane="${lane}" offset="${rt(c.start)}" start="0s" duration="${rt(c.duration)}" name="${esc(t.text.slice(0, 40))}">` +
            `<text><text-style ref="ts${c.id}">${esc(t.text)}</text-style></text>` +
            `<text-style-def id="ts${c.id}"><text-style font="Helvetica" fontSize="${Math.round(t.style.size * 0.75)}" fontColor="${hexToFcp(t.style.color)}" bold="${t.style.weight >= 600 ? 1 : 0}" alignment="${t.style.align}"/></text-style-def>` +
            `</title>`,
        );
      } else if (c.kind !== "captions") skippedShapes++;
    }
  });
  if (skippedShapes) notes.push(`${skippedShapes} shape/fill clips have no FCPXML equivalent; render them into the MP4 or rebuild them as Fusion titles.`);
  if (cues(p).length) notes.push("Captions are in captions.srt; import it on a subtitle track.");
  notes.push("Text animations and grades are not carried over; positions and timing are.");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    ${res.join("\n    ")}
  </resources>
  <library>
    <event name="Cutloupe">
      <project name="${esc(p.name)}">
        <sequence format="r0" duration="${rt(total)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
            <gap name="Base" offset="0s" start="0s" duration="${rt(total)}">
              ${connected.join("\n              ")}
            </gap>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
  const files: ExportFile[] = [{ path: `${slug(p.name)}.fcpxml`, content: xml }];
  if (cues(p).length) files.push({ path: "captions.srt", content: toSrt(p) });
  return { format: "fcpxml", files, notes };
}

function hexToFcp(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  if (!m) return "1 1 1 1";
  return `${(parseInt(m[1], 16) / 255).toFixed(3)} ${(parseInt(m[2], 16) / 255).toFixed(3)} ${(parseInt(m[3], 16) / 255).toFixed(3)} 1`;
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "reel";
}

// ---------- OpenTimelineIO ----------

export function toOtio(p: Project): ExportBundle {
  const fps = p.fps;
  const RT = (t: number) => ({ OTIO_SCHEMA: "RationalTime.1", rate: fps, value: Math.round(t * fps) });
  const range = (s: number, d: number) => ({ OTIO_SCHEMA: "TimeRange.1", start_time: RT(s), duration: RT(d) });
  // clips that overlap on one Cutloupe track go to extra tracks, later clips stacked above
  const tracks = p.tracks
    .filter((tr) => !tr.hidden)
    .flatMap((tr) => lanes(tr.clips).map((clips, li) => ({ tr, clips, name: li ? `${tr.name} ${li + 1}` : tr.name })))
    .map(({ tr, clips, name }) => {
      const children: unknown[] = [];
      let cursor = 0;
      for (const c of [...clips].sort((a, b) => a.start - b.start)) {
        if (c.start > cursor + 1e-6) children.push({ OTIO_SCHEMA: "Gap.1", name: "", source_range: range(0, c.start - cursor) });
        const a = c.kind === "media" || c.kind === "audio" ? p.assets[c.assetId] : undefined;
        children.push({
          OTIO_SCHEMA: "Clip.2",
          name: c.label ?? a?.name ?? (c.kind === "text" ? (c as TextClip).text.slice(0, 40) : c.kind),
          source_range: range(c.kind === "media" || c.kind === "audio" ? c.trimIn : 0, c.duration),
          media_references: {
            DEFAULT_MEDIA: a
              ? { OTIO_SCHEMA: "ExternalReference.1", target_url: fileUrl(a), available_range: range(0, a.duration || c.duration) }
              : { OTIO_SCHEMA: "GeneratorReference.1", generator_kind: c.kind, parameters: stripForOtio(c) },
          },
          active_media_reference_key: "DEFAULT_MEDIA",
          metadata: { cutloupe: { id: c.id, kind: c.kind } },
        });
        cursor = c.start + c.duration;
      }
      return { OTIO_SCHEMA: "Track.1", name, kind: tr.kind === "audio" ? "Audio" : "Video", children };
    });
  const doc = {
    OTIO_SCHEMA: "Timeline.1",
    name: p.name,
    global_start_time: RT(0),
    metadata: { cutloupe: { id: p.id, width: p.width, height: p.height, fps } },
    tracks: { OTIO_SCHEMA: "Stack.1", name: "tracks", children: tracks },
  };
  return {
    format: "otio",
    files: [{ path: `${slug(p.name)}.otio`, content: JSON.stringify(doc, null, 2) }],
    notes: ["Clips that overlap on one track are spread over extra tracks (\"Video 2\", ...) because OTIO tracks are strictly sequential.", "Text, shapes and captions travel as GeneratorReference with their full parameters in metadata."],
  };
}

function stripForOtio(c: Clip): Record<string, unknown> {
  const { id: _id, start: _s, duration: _d, ...rest } = c as unknown as Record<string, unknown>;
  return rest;
}

// ---------- CapCut draft (experimental) ----------

// Field shapes follow drafts saved by CapCut desktop 9.x: every segment points
// at its own speed/placeholder/channel/vocal (+canvas/color for video) materials,
// and local media is registered in draft_meta_info.json's draft_materials.
export function toCapcutDraft(p: Project): ExportBundle {
  const us = (t: number) => Math.round(t * 1_000_000);
  // deterministic 128-bit ids, so re-exporting the same project yields the same draft
  const uuid = (seed: string) => {
    const hex = [0, 1, 2, 3].map((k) => {
      let h = 2166136261 ^ k;
      for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
      return (h >>> 0).toString(16).padStart(8, "0");
    }).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`.toUpperCase();
  };
  const now = Date.now() * 1000;
  const M: Record<string, unknown[]> = { videos: [], audios: [], texts: [], speeds: [], placeholder_infos: [], sound_channel_mappings: [], vocal_separations: [], canvases: [], material_colors: [] };
  const extras = (seed: string, video: boolean) => {
    const ids = ["speed", "ph", "ch", "voc", ...(video ? ["canvas", "color"] : [])].map((k) => uuid(seed + ":" + k));
    M.speeds.push({ id: ids[0], type: "speed", speed: 1, mode: 0, curve_speed: null });
    M.placeholder_infos.push({ id: ids[1], type: "placeholder_info", error_path: "", error_text: "", meta_type: "none", res_path: "", res_text: "" });
    M.sound_channel_mappings.push({ id: ids[2], type: "none", audio_channel_mapping: 0, is_config_open: false });
    M.vocal_separations.push({ id: ids[3], type: "vocal_separation", choice: 0, enter_from: "", final_algorithm: "", production_path: "", removed_sounds: [], time_range: null });
    if (video) {
      M.canvases.push({ id: ids[4], type: "canvas_color", album_image: "", blur: 0, color: "", image: "", image_id: "", image_name: "", source_platform: 0, team_id: "" });
      M.material_colors.push({ id: ids[5], type: "material_color", gradient_angle: 90, gradient_colors: [], gradient_percents: [], height: 0, is_color_clip: false, is_gradient: false, solid_color: "", width: 0 });
    }
    return ids;
  };
  const crop = { upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0, lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1 };
  const registered: unknown[] = [];
  const path = (a: Asset) => (a.path ?? a.src).replace(/\//g, "\\");
  for (const a of Object.values(p.assets)) {
    const local = uuid(a.id + ":local");
    registered.push({ ai_group_type: "", create_time: -1, duration: us(a.duration || 10), enter_from: 0, extra_info: a.name, file_Path: path(a), height: a.height ?? 0, id: local, import_time: -1, import_time_ms: -1, item_source: 1, material_color_tag: "", md5: "", metetype: a.kind === "audio" ? "music" : a.kind === "image" ? "photo" : "video", roughcut_time_range: { duration: -1, start: -1 }, sub_time_range: { duration: -1, start: -1 }, type: 0, width: a.width ?? 0 });
    if (a.kind === "audio") M.audios.push({ id: uuid(a.id), path: path(a), name: a.name, duration: us(a.duration), type: "extract_music", category_id: "", category_name: "local", check_flag: 1, music_id: "", source_platform: 0, wave_points: [], local_material_id: local });
    else M.videos.push({ id: uuid(a.id), path: path(a), material_name: a.name, type: a.kind === "image" ? "photo" : "video", duration: us(a.kind === "image" ? 10800 : a.duration), width: a.width ?? p.width, height: a.height ?? p.height, category_id: "", category_name: "local", check_flag: 7, crop, crop_ratio: "free", crop_scale: 1, has_audio: !!a.hasAudio, extra_type_option: 0, formula_id: "", local_material_id: local, source_platform: 0 });
  }
  const textMaterial = (id: string, text: string, size: number, color: string, bold: boolean, align: string) =>
    M.texts.push({
      id, type: "text",
      content: JSON.stringify({ styles: [{ range: [0, text.length], size, bold, italic: false, underline: false, fill: { alpha: 1, content: { render_type: "solid", solid: { alpha: 1, color: hexToRgb01(color) } } } }], text }),
      alignment: align === "left" ? 0 : align === "right" ? 2 : 1, font_size: size, text_color: color.toUpperCase(), typesetting: 0, letter_spacing: 0, line_spacing: 0.02, line_feed: 1, line_max_width: 0.82, force_apply_line_max_width: false, check_flag: 7, fixed_width: -1, fixed_height: -1,
    });

  type Seg = { seed: string; start: number; duration: number; tf: Clip["transform"]; material: string; source: [number, number]; volume: number; video: boolean };
  const groups: { type: "video" | "audio" | "text"; name: string; segs: Seg[] }[] = [];
  let skipped = 0;
  for (const tr of p.tracks) {
    if (tr.hidden) continue;
    const media: Seg[] = [], text: Seg[] = [];
    for (const c of tr.clips) {
      if (c.kind === "media" || c.kind === "audio") {
        if (!p.assets[c.assetId]) continue;
        const video = c.kind === "media";
        media.push({ seed: c.id, start: c.start, duration: c.duration, tf: c.transform, material: uuid(c.assetId), source: [c.trimIn, c.duration], volume: tr.muted ? 0 : c.volume, video });
      } else if (c.kind === "text") {
        const t = c as TextClip;
        const mid = uuid(c.id + ":text");
        textMaterial(mid, t.text, Math.round(t.style.size / 6), t.style.color, t.style.weight >= 600, t.style.align);
        text.push({ seed: c.id, start: c.start, duration: c.duration, tf: c.transform, material: mid, source: [0, c.duration], volume: 1, video: false });
      } else if (c.kind === "captions") {
        const cc = c as CaptionClip;
        captionPhrases(cc.words, cc.maxWords).forEach((ph, i) => {
          const mid = uuid(`${c.id}:cap${i}`);
          const t0 = c.start + ph[0].t0, d = ph[ph.length - 1].t1 - ph[0].t0;
          textMaterial(mid, ph.map((w) => w.w).join(" "), Math.round(cc.size / 6), "#ffffff", true, "center");
          text.push({ seed: `${c.id}:cap${i}`, start: t0, duration: d, tf: c.transform, material: mid, source: [0, d], volume: 1, video: false });
        });
      } else skipped++;
    }
    if (media.length) groups.push({ type: tr.kind === "audio" ? "audio" : "video", name: tr.name, segs: media });
    if (text.length) groups.push({ type: "text", name: tr.name, segs: text });
  }
  const renderBase = { audio: 11000, video: 14000, text: 15000 };
  const tracks = groups.flatMap((g) => lanes(g.segs).map((segs, li) => ({ g, segs, name: li ? `${g.name} ${li + 1}` : g.name }))).map(({ g, segs, name }, ti) => {
    const trackId = uuid(`track:${ti}:${name}`);
    return {
      id: trackId, type: g.type, name, attribute: 0, is_default_name: false, flag: 0,
      segments: [...segs].sort((a, b) => a.start - b.start).map((s, si) => ({
        id: uuid(s.seed + ":seg"), material_id: s.material, raw_segment_id: trackId,
        target_timerange: { start: us(s.start), duration: us(s.duration) },
        source_timerange: { start: us(s.source[0]), duration: us(s.source[1]) },
        speed: 1, volume: s.volume, visible: true, reverse: false,
        clip: { alpha: s.tf.opacity, rotation: s.tf.rotation, scale: { x: s.tf.scale, y: s.tf.scale }, transform: { x: (s.tf.x - 0.5) * 2, y: (0.5 - s.tf.y) * 2 }, flip: { horizontal: false, vertical: false } },
        render_index: renderBase[g.type] + ti * 100 + si, track_render_index: ti, track_attribute: 0,
        extra_material_refs: extras(s.seed, s.video), common_keyframes: [], keyframe_refs: [],
      })),
    };
  });
  const duration = us(projectDuration(p));
  const ratio = p.width === p.height ? "1:1" : p.width * 9 === p.height * 16 ? "16:9" : p.width * 16 === p.height * 9 ? "9:16" : "original";
  const draft = {
    id: uuid(p.id), version: 360000, new_version: "110.0.0", name: p.name, duration, fps: p.fps,
    canvas_config: { width: p.width, height: p.height, ratio },
    platform: { app_source: "cc", app_version: "9.5.0", os: "windows" },
    tracks, materials: M, extra_info: { created_via: "cutloupe" },
  };
  const meta = {
    draft_cover: "draft_cover.jpg", draft_fold_path: "", draft_id: uuid(p.id), draft_is_ai_shorts: false, draft_is_invisible: false,
    draft_json_file: "", draft_name: p.name, draft_new_version: "", draft_root_path: "", draft_timeline_materials_size: 0,
    tm_draft_create: now, tm_draft_modified: now, tm_draft_removed: 0, tm_duration: duration,
    draft_materials: [{ type: 0, value: registered }],
  };
  const content = JSON.stringify(draft);
  const notes = [
    "CapCut has no public editing API. This draft mirrors the unencrypted layout CapCut desktop 9.x saves (draft_content.json and draft_info.json).",
    "Copy the folder into CapCut's drafts folder (Windows: %LOCALAPPDATA%\\CapCut\\User Data\\Projects\\com.lveditor.draft) and restart CapCut. Builds that encrypt drafts may refuse it; then import the MP4 and captions.srt.",
    "Captions arrive as plain white text segments; text styling is approximate.",
  ];
  if (skipped) notes.push(`${skipped} shape/fill clips and all keyframe motion are not mapped; render them into the MP4 first.`);
  return {
    format: "capcut",
    files: [
      { path: "draft_content.json", content },
      { path: "draft_info.json", content },
      { path: "draft_meta_info.json", content: JSON.stringify(meta) },
      ...(cues(p).length ? [{ path: "captions.srt", content: toSrt(p) }] : []),
    ],
    notes,
  };
}

// First-fit packing of possibly overlapping items into non-overlapping lanes,
// for formats whose tracks are strictly sequential (OTIO, CapCut).
function lanes<T extends { start: number; duration: number }>(items: T[]): T[][] {
  const out: T[][] = [];
  for (const c of items) {
    const lane = out.find((l) => l.every((o) => o.start + o.duration <= c.start + 1e-6 || c.start + c.duration <= o.start + 1e-6));
    if (lane) lane.push(c); else out.push([c]);
  }
  return out;
}

function hexToRgb01(hex: string): number[] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex);
  return m ? [1, 2, 3].map((i) => +(parseInt(m[i], 16) / 255).toFixed(4)) : [1, 1, 1];
}

// ---------- Remotion project ----------

export function toRemotion(p: Project): ExportBundle {
  const fps = p.fps;
  const durationInFrames = Math.max(1, Math.round(projectDuration(p) * fps));
  const timeline = structuredClone(p);
  for (const a of Object.values(timeline.assets)) {
    // Remotion serves local media from public/; the CLI copies them there.
    a.src = a.path ? `media/${a.id}${extOf(a.path)}` : a.src;
    delete a.path;
  }
  const pkg = {
    name: slug(p.name) + "-remotion",
    private: true,
    scripts: { studio: "remotion studio", render: `remotion render Reel out/${slug(p.name)}.mp4` },
    dependencies: { "@remotion/cli": "4.0.290", remotion: "4.0.290", react: "18.3.1", "react-dom": "18.3.1" },
    devDependencies: { typescript: "5.6.3", "@types/react": "18.3.12" },
  };
  const root = `import { Composition } from "remotion";
import { Reel } from "./Reel";
import timeline from "./timeline.json";

export const RemotionRoot = () => (
  <Composition id="Reel" component={Reel} defaultProps={{ timeline }} durationInFrames={${durationInFrames}} fps={${fps}} width={${p.width}} height={${p.height}} />
);
`;
  const index = `import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";
registerRoot(RemotionRoot);
`;
  const reel = REEL_TSX;
  const missing = Object.values(p.assets).filter((a) => a.path).map((a) => `public/media/${a.id}${extOf(a.path!)}  <-  ${a.path}`);
  return {
    format: "remotion",
    files: [
      { path: "package.json", content: JSON.stringify(pkg, null, 2) },
      { path: "src/index.ts", content: index },
      { path: "src/Root.tsx", content: root },
      { path: "src/Reel.tsx", content: reel },
      { path: "src/timeline.json", content: JSON.stringify(timeline, null, 2) },
      { path: "tsconfig.json", content: JSON.stringify({ compilerOptions: { jsx: "react-jsx", module: "esnext", moduleResolution: "bundler", target: "es2020", strict: false, resolveJsonModule: true, esModuleInterop: true, skipLibCheck: true } }, null, 2) },
      { path: "README.md", content: `# ${p.name}\n\nExported from Cutloupe. Every clip is a plain React element in src/Reel.tsx, driven by src/timeline.json.\n\n    npm install\n    npm run studio\n    npm run render\n\nMedia files map:\n\n${missing.map((m) => "    " + m).join("\n") || "    (none)"}\n` },
    ],
    notes: ["The exporter copies media into public/media when it runs locally.", "Remotion needs a company license above three people; check remotion.dev/license."],
  };
}

function extOf(path: string) {
  const m = /\.[a-z0-9]+$/i.exec(path);
  return m ? m[0].toLowerCase() : "";
}

const REEL_TSX = `import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

// Generated by Cutloupe. Edit freely: timeline.json is the source, this file maps it to Remotion.
const ease = (k: string | undefined, x: number) => {
  const v = Math.min(1, Math.max(0, x));
  if (k === "linear") return v;
  if (k === "in") return v * v * v;
  if (k === "out") return 1 - Math.pow(1 - v, 3);
  if (k === "back") return 1 + 2.70158 * Math.pow(v - 1, 3) + 1.70158 * Math.pow(v - 1, 2);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};
const sampleKeys = (keys: [number, number, string?][], t: number) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) return v0 + (v1 - v0) * ease(e ?? "inOut", (t - t0) / (t1 - t0 || 1e-6));
  }
  return keys[keys.length - 1][1];
};

const FONTS: Record<string, string> = {
  sans: "Inter, Segoe UI, sans-serif",
  display: "Inter, Segoe UI, sans-serif",
  mono: "JetBrains Mono, Consolas, monospace",
  serif: "Georgia, serif",
};

function useT(clip: any) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = frame / fps;
  const tf = { ...clip.transform };
  for (const k of Object.keys(clip.anim ?? {})) tf[k] = sampleKeys(clip.anim[k], local);
  let alpha = tf.opacity;
  if (clip.enter && local < clip.enter.duration) alpha *= local / clip.enter.duration;
  const tail = clip.duration - local;
  if (clip.exit && tail < clip.exit.duration) alpha *= Math.max(0, tail / clip.exit.duration);
  return { tf, alpha, local };
}

function Layer({ clip, timeline }: { clip: any; timeline: any }) {
  const { tf, alpha, local } = useT(clip);
  const style: React.CSSProperties = {
    position: "absolute",
    left: \`\${tf.x * 100}%\`,
    top: \`\${tf.y * 100}%\`,
    transform: \`translate(-50%, -50%) rotate(\${tf.rotation}deg) scale(\${tf.scale})\`,
    opacity: alpha,
  };
  const src = (a: any) => (/^https?:/.test(a.src) ? a.src : staticFile(a.src));
  if (clip.kind === "media") {
    const a = timeline.assets[clip.assetId];
    const fill: React.CSSProperties = { ...style, width: "100%", height: "100%", objectFit: clip.fit };
    return a.kind === "image" ? <Img src={src(a)} style={fill} /> : <OffthreadVideo src={src(a)} startFrom={Math.round(clip.trimIn * timeline.fps)} volume={clip.volume} style={fill} />;
  }
  if (clip.kind === "fill") return <AbsoluteFill style={{ opacity: alpha, background: clip.colors.length > 1 ? \`linear-gradient(\${clip.angle + 90}deg, \${clip.colors.join(",")})\` : clip.colors[0] }} />;
  if (clip.kind === "shape") {
    const r = clip.shape === "circle" || clip.shape === "ring" ? "50%" : (clip.radius ?? 0);
    return <div style={{ ...style, width: \`\${clip.w * 100}%\`, height: \`\${clip.h * 100}%\`, borderRadius: r, background: clip.shape === "ring" ? "transparent" : clip.fill, border: clip.stroke ? \`\${clip.strokeWidth ?? 4}px solid \${clip.stroke}\` : undefined }} />;
  }
  if (clip.kind === "text") {
    const s = clip.style;
    return <div style={{ ...style, whiteSpace: "pre-wrap", textAlign: s.align, maxWidth: "86%", font: \`\${s.weight} \${s.size}px \${FONTS[s.font]}\`, letterSpacing: \`\${s.tracking}em\`, color: s.color, background: s.background, padding: s.background ? "0.25em 0.45em" : 0, borderRadius: 8 }}>{clip.text}</div>;
  }
  if (clip.kind === "captions") {
    const words = clip.words.filter((w: any) => local >= w.t0 - 0.05 && local < w.t1 + 0.6).slice(-clip.maxWords);
    return <div style={{ ...style, font: \`800 \${clip.size}px \${FONTS.sans}\`, color: "#fff", WebkitTextStroke: "2px #000", textAlign: "center", width: "86%" }}>{words.map((w: any, i: number) => <span key={i} style={{ color: local < w.t1 ? clip.highlight : "#fff", marginRight: "0.25em" }}>{w.w}</span>)}</div>;
  }
  return null;
}

export const Reel = ({ timeline }: { timeline: any }) => {
  const { fps } = useVideoConfig();
  const f = (t: number) => Math.round(t * fps);
  return (
    <AbsoluteFill style={{ background: timeline.background }}>
      {timeline.tracks.filter((t: any) => !t.hidden).map((track: any) =>
        track.clips.map((clip: any) =>
          clip.kind === "audio" ? (
            <Sequence key={clip.id} from={f(clip.start)} durationInFrames={f(clip.duration)}>
              <Audio src={/^https?:/.test(timeline.assets[clip.assetId].src) ? timeline.assets[clip.assetId].src : staticFile(timeline.assets[clip.assetId].src)} startFrom={f(clip.trimIn)} volume={clip.volume} />
            </Sequence>
          ) : (
            <Sequence key={clip.id} from={f(clip.start)} durationInFrames={Math.max(1, f(clip.duration))}>
              <Layer clip={clip} timeline={timeline} />
            </Sequence>
          ),
        ),
      )}
    </AbsoluteFill>
  );
};
`;

/**
 * Final Cut Pro 7 XML (xmeml v5). Premiere Pro imports this format natively
 * (File > Import); it does not read FCPXML. Media and audio clips carry over;
 * clips that overlap on one Cutloupe track are spread over extra tracks.
 */
export function toXmeml(p: Project): ExportBundle {
  const fps = p.fps;
  const fr = (t: number) => Math.round(t * fps);
  const total = Math.max(fr(projectDuration(p)), 1);
  const rate = `<rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>`;
  const notes: string[] = [];
  const seen = new Set<string>();
  const fileEl = (a: Asset) => {
    if (seen.has(a.id)) return `<file id="file-${esc(a.id)}"/>`;
    seen.add(a.id);
    const dur = a.kind === "image" ? total : fr(a.duration);
    const media =
      (a.kind !== "audio" ? `<video><samplecharacteristics><width>${a.width ?? p.width}</width><height>${a.height ?? p.height}</height></samplecharacteristics></video>` : "") +
      (a.kind === "audio" || a.hasAudio ? `<audio><channelcount>2</channelcount></audio>` : "");
    return `<file id="file-${esc(a.id)}"><name>${esc(a.name)}</name><pathurl>${esc(fileUrl(a))}</pathurl>${rate}<duration>${dur}</duration><media>${media}</media></file>`;
  };
  const lanes = (clips: (MediaClip | Extract<Clip, { kind: "audio" }>)[]) => {
    const out: (typeof clips)[] = [];
    for (const c of [...clips].sort((a, b) => a.start - b.start)) {
      const lane = out.find((l) => { const last = l[l.length - 1]; return fr(last.start + last.duration) <= fr(c.start); });
      if (lane) lane.push(c); else out.push([c]);
    }
    return out;
  };
  const item = (c: MediaClip | Extract<Clip, { kind: "audio" }>, kind: "video" | "audio") => {
    const a = p.assets[c.assetId];
    const start = fr(c.start), end = fr(c.start + c.duration), inP = fr(c.trimIn), outP = inP + (end - start);
    const vol = c.volume;
    const filter = kind === "audio" && vol !== 1
      ? `<filter><effect><name>Audio Levels</name><effectid>audiolevels</effectid><effecttype>audiolevels</effecttype><mediatype>audio</mediatype><parameter><parameterid>level</parameterid><name>Level</name><value>${vol.toFixed(3)}</value></parameter></effect></filter>`
      : "";
    return `<clipitem id="${kind}-${esc(c.id)}"><name>${esc(c.label ?? a.name)}</name><enabled>TRUE</enabled><duration>${a.kind === "image" ? total : fr(a.duration)}</duration>${rate}<start>${start}</start><end>${end}</end><in>${inP}</in><out>${outP}</out>${fileEl(a)}${kind === "audio" ? "<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>" : ""}${filter}</clipitem>`;
  };
  const vClips: MediaClip[] = [];
  const aClips: (MediaClip | Extract<Clip, { kind: "audio" }>)[] = [];
  let skipped = 0;
  for (const tr of p.tracks) {
    if (tr.hidden && tr.kind !== "audio") continue;
    for (const c of tr.clips) {
      if (c.kind === "media" && p.assets[c.assetId]) {
        vClips.push(c);
        if (p.assets[c.assetId].hasAudio && !tr.muted) aClips.push(c);
      } else if (c.kind === "audio" && p.assets[c.assetId] && !tr.muted) aClips.push(c);
      else if (c.kind !== "captions") skipped++;
    }
  }
  const vTracks = lanes(vClips).map((l) => `<track>${l.map((c) => item(c, "video")).join("")}</track>`);
  const aTracks = lanes(aClips).map((l) => `<track>${l.map((c) => item(c, "audio")).join("")}</track>`);
  if (skipped) notes.push(`${skipped} text/shape/fill clips are not in the XML; Premiere titles cannot be described in FCP7 XML. Render them into the MP4, or export a transparent overlay.`);
  if (cues(p).length) notes.push("Captions are in captions.srt; in Premiere use File > Import, then drag onto the timeline as a caption track.");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">
  <sequence id="seq-${esc(p.id)}">
    <name>${esc(p.name)}</name>
    <duration>${total}</duration>
    ${rate}
    <timecode>${rate}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>
    <media>
      <video>
        <format><samplecharacteristics>${rate}<width>${p.width}</width><height>${p.height}</height><pixelaspectratio>square</pixelaspectratio></samplecharacteristics></format>
        ${vTracks.join("\n        ") || "<track/>"}
      </video>
      <audio>
        ${aTracks.join("\n        ") || "<track/>"}
      </audio>
    </media>
  </sequence>
</xmeml>
`;
  const files: ExportFile[] = [{ path: `${slug(p.name)}.xml`, content: xml }];
  if (cues(p).length) files.push({ path: "captions.srt", content: toSrt(p) });
  return { format: "xmeml", files, notes };
}
