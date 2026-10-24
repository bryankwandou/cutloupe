import {
  type Asset,
  type Clip,
  type Marker,
  type Project,
  type Track,
  DEFAULT_TRANSFORM,
  findClip,
} from "./schema";

export type Actor = "agent" | "human";

export type Op =
  | { op: "set_project"; patch: Partial<Pick<Project, "name" | "width" | "height" | "fps" | "background">> }
  | { op: "add_asset"; asset: Asset }
  | { op: "add_track"; track: Track; index?: number }
  | { op: "update_track"; trackId: string; patch: Partial<Pick<Track, "name" | "hidden" | "muted">> }
  | { op: "add_clip"; trackId: string; clip: Clip }
  | { op: "update_clip"; clipId: string; patch: Record<string, unknown> }
  | { op: "remove_clip"; clipId: string }
  | { op: "move_clip"; clipId: string; start: number; trackId?: string }
  | { op: "split_clip"; clipId: string; at: number; newId: string }
  | { op: "add_marker"; marker: Marker }
  | { op: "clear_markers" };

export class OpError extends Error {}

function assertTime(n: unknown, name: string) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) throw new OpError(`${name} must be a number >= 0`);
}

function sortClips(track: Track) {
  track.clips.sort((a, b) => a.start - b.start);
}

/** Pure: returns a new project. Throws OpError with a message an agent can act on. */
export function applyOp(project: Project, op: Op): Project {
  const p: Project = structuredClone(project);
  switch (op.op) {
    case "set_project": {
      Object.assign(p, op.patch);
      return p;
    }
    case "add_asset": {
      p.assets[op.asset.id] = op.asset;
      return p;
    }
    case "add_track": {
      if (p.tracks.some((t) => t.id === op.track.id)) throw new OpError(`track ${op.track.id} already exists`);
      const idx = op.index ?? p.tracks.length;
      p.tracks.splice(idx, 0, { ...op.track, clips: op.track.clips ?? [] });
      return p;
    }
    case "update_track": {
      const t = p.tracks.find((x) => x.id === op.trackId);
      if (!t) throw new OpError(`no track ${op.trackId}; tracks are ${p.tracks.map((x) => x.id).join(", ")}`);
      Object.assign(t, op.patch);
      return p;
    }
    case "add_clip": {
      const t = p.tracks.find((x) => x.id === op.trackId);
      if (!t) throw new OpError(`no track ${op.trackId}; tracks are ${p.tracks.map((x) => x.id).join(", ")}`);
      assertTime(op.clip.start, "start");
      if (!(op.clip.duration > 0)) throw new OpError("duration must be > 0");
      if (findClip(p, op.clip.id)) throw new OpError(`clip id ${op.clip.id} already used`);
      if ((op.clip.kind === "media" || op.clip.kind === "audio") && !p.assets[op.clip.assetId])
        throw new OpError(`no asset ${op.clip.assetId}; import it first`);
      if (t.kind === "audio" && op.clip.kind !== "audio") throw new OpError("audio tracks only hold audio clips");
      if (t.kind !== "audio" && op.clip.kind === "audio") throw new OpError("audio clips go on an audio track");
      t.clips.push({ ...op.clip, transform: { ...DEFAULT_TRANSFORM, ...op.clip.transform } } as Clip);
      sortClips(t);
      return p;
    }
    case "update_clip": {
      const f = findClip(p, op.clipId);
      if (!f) throw new OpError(`no clip ${op.clipId}`);
      const patch = op.patch as Record<string, unknown>;
      if ("id" in patch || "kind" in patch) throw new OpError("id and kind cannot be changed");
      const merged: Record<string, unknown> = { ...f.clip, ...patch };
      for (const k of ["transform", "style", "grade"] as const) {
        if (patch[k] && typeof patch[k] === "object") {
          merged[k] = { ...((f.clip as unknown as Record<string, object>)[k] ?? {}), ...(patch[k] as object) };
        }
      }
      if ("start" in patch) assertTime(merged.start, "start");
      if ("duration" in patch && !((merged.duration as number) > 0)) throw new OpError("duration must be > 0");
      f.track.clips[f.index] = merged as unknown as Clip;
      sortClips(f.track);
      return p;
    }
    case "remove_clip": {
      const f = findClip(p, op.clipId);
      if (!f) throw new OpError(`no clip ${op.clipId}`);
      f.track.clips.splice(f.index, 1);
      return p;
    }
    case "move_clip": {
      const f = findClip(p, op.clipId);
      if (!f) throw new OpError(`no clip ${op.clipId}`);
      assertTime(op.start, "start");
      const clip = { ...f.clip, start: op.start };
      if (op.trackId && op.trackId !== f.track.id) {
        const dest = p.tracks.find((x) => x.id === op.trackId);
        if (!dest) throw new OpError(`no track ${op.trackId}`);
        if ((dest.kind === "audio") !== (clip.kind === "audio")) throw new OpError("audio and picture tracks cannot swap clips");
        f.track.clips.splice(f.index, 1);
        dest.clips.push(clip);
        sortClips(dest);
      } else {
        f.track.clips[f.index] = clip;
        sortClips(f.track);
      }
      return p;
    }
    case "split_clip": {
      const f = findClip(p, op.clipId);
      if (!f) throw new OpError(`no clip ${op.clipId}`);
      const c = f.clip;
      const local = op.at - c.start;
      if (local <= 0.02 || local >= c.duration - 0.02) throw new OpError(`split point ${op.at}s is outside clip ${c.id} (${c.start}s to ${c.start + c.duration}s)`);
      const left = { ...c, duration: local, exit: undefined } as Clip;
      const right = { ...structuredClone(c), id: op.newId, start: op.at, duration: c.duration - local, enter: undefined } as Clip;
      if (right.kind === "media" || right.kind === "audio") right.trimIn = (c as { trimIn: number }).trimIn + local;
      if (right.kind === "captions") right.words = right.words.filter((w) => w.t1 > local).map((w) => ({ ...w, t0: Math.max(0, w.t0 - local), t1: w.t1 - local }));
      if (left.kind === "captions") left.words = left.words.filter((w) => w.t0 < local);
      f.track.clips.splice(f.index, 1, left, right);
      return p;
    }
    case "add_marker": {
      p.markers.push(op.marker);
      p.markers.sort((a, b) => a.t - b.t);
      return p;
    }
    case "clear_markers": {
      p.markers = [];
      return p;
    }
  }
}

/** One short line for the activity feed. */
export function describeOp(op: Op, p?: Project): string {
  const t = (n: number) => `${n.toFixed(2)}s`;
  switch (op.op) {
    case "set_project":
      return `Project settings: ${Object.keys(op.patch).join(", ")}`;
    case "add_asset":
      return `Imported ${op.asset.kind} "${op.asset.name}"`;
    case "add_track":
      return `New ${op.track.kind} track "${op.track.name}"`;
    case "update_track":
      return `Track ${op.trackId}: ${Object.keys(op.patch).join(", ")}`;
    case "add_clip": {
      const c = op.clip;
      const what =
        c.kind === "text" ? `text "${c.text.slice(0, 32)}"` :
        c.kind === "media" ? `clip of ${p?.assets[c.assetId]?.name ?? c.assetId}` :
        c.kind === "audio" ? `audio ${p?.assets[c.assetId]?.name ?? c.assetId}` :
        c.kind === "captions" ? `${c.words.length} caption words` :
        c.kind === "shape" ? `${c.shape} shape` : "fill";
      return `Added ${what} at ${t(c.start)} for ${t(c.duration)}`;
    }
    case "update_clip":
      return `Changed ${op.clipId}: ${Object.keys(op.patch).join(", ")}`;
    case "remove_clip":
      return `Removed ${op.clipId}`;
    case "move_clip":
      return `Moved ${op.clipId} to ${t(op.start)}${op.trackId ? ` on ${op.trackId}` : ""}`;
    case "split_clip":
      return `Split ${op.clipId} at ${t(op.at)}`;
    case "add_marker":
      return `Marker at ${t(op.marker.t)}: ${op.marker.note}`;
    case "clear_markers":
      return "Cleared markers";
  }
}
