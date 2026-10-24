// Loads project assets into the page and keeps video and audio elements at the
// time the timeline asks for. The same pool drives live playback (loose sync,
// elements keep playing) and frame-exact rendering (seek, then wait).

import { type Asset, type Drawable, type MediaLookup, type Project, mediaTimes } from "@cutloupe/core";

type El = HTMLVideoElement | HTMLImageElement | HTMLAudioElement;

export class MediaPool implements MediaLookup {
  private els = new Map<string, El>();
  private srcs = new Map<string, string>();
  private ready = new Set<string>();
  onReady: () => void = () => {};

  sync(p: Project) {
    for (const a of Object.values(p.assets)) {
      if (this.srcs.get(a.id) === a.src) continue;
      this.els.get(a.id)?.remove();
      this.load(a);
    }
    for (const id of [...this.els.keys()]) {
      if (!p.assets[id]) {
        const el = this.els.get(id)!;
        if (el instanceof HTMLMediaElement) el.pause();
        this.els.delete(id);
        this.srcs.delete(id);
      }
    }
  }

  private load(a: Asset) {
    this.srcs.set(a.id, a.src);
    this.ready.delete(a.id);
    let el: El;
    if (a.kind === "image") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { this.ready.add(a.id); this.onReady(); };
      img.src = a.src;
      el = img;
    } else {
      const m = document.createElement(a.kind === "video" ? "video" : "audio") as HTMLVideoElement | HTMLAudioElement;
      m.crossOrigin = "anonymous";
      m.preload = "auto";
      if (m instanceof HTMLVideoElement) { m.muted = true; m.playsInline = true; }
      m.onloadeddata = () => { this.ready.add(a.id); this.onReady(); };
      m.src = a.src;
      el = m;
    }
    this.els.set(a.id, el);
  }

  get(assetId: string): Drawable | null {
    const el = this.els.get(assetId);
    if (!el || !this.ready.has(assetId) || el instanceof HTMLAudioElement) return null;
    return el as Drawable;
  }

  /** Live playback: start, stop and nudge elements so they follow the playhead. */
  follow(p: Project, t: number, playing: boolean, masterVolume: number) {
    const wanted = new Map<string, { time: number; volume: number }>();
    for (const m of mediaTimes(p, t)) wanted.set(m.assetId, { time: m.time, volume: 0 });
    for (const tr of p.tracks) {
      for (const c of tr.clips) {
        if (c.kind === "media") {
          const w = wanted.get(c.assetId);
          if (w && t >= c.start && t < c.start + c.duration && !tr.muted && p.assets[c.assetId]?.hasAudio) w.volume = Math.max(w.volume, c.volume);
        }
        if (c.kind !== "audio" || tr.muted || t < c.start || t >= c.start + c.duration) continue;
        const local = t - c.start;
        let g = c.volume;
        if (c.fadeIn > 0) g *= Math.min(1, local / c.fadeIn);
        if (c.fadeOut > 0) g *= Math.min(1, (c.duration - local) / c.fadeOut);
        wanted.set(c.assetId, { time: c.trimIn + local, volume: Math.max(0, Math.min(1, g)) });
      }
    }
    for (const [id, el] of this.els) {
      if (!(el instanceof HTMLMediaElement)) continue;
      const w = wanted.get(id);
      if (!w) { if (!el.paused) el.pause(); continue; }
      const drift = Math.abs(el.currentTime - w.time);
      if (drift > (playing ? 0.3 : 0.04)) el.currentTime = w.time;
      if (el instanceof HTMLAudioElement || !el.muted) el.volume = w.volume * masterVolume;
      if (el instanceof HTMLVideoElement) {
        el.muted = !playing || w.volume === 0;
        if (!el.muted) el.volume = w.volume * masterVolume;
      }
      if (playing && el.paused) el.play().catch(() => {});
      if (!playing && !el.paused) el.pause();
    }
  }

  /** Frame-exact: seek every visible video to its time and wait until each has the frame. */
  async seekExact(p: Project, t: number) {
    const jobs: Promise<void>[] = [];
    for (const m of mediaTimes(p, t)) {
      const el = this.els.get(m.assetId);
      if (!(el instanceof HTMLVideoElement)) continue;
      if (!el.paused) el.pause();
      jobs.push(waitLoaded(el).then(() => seek(el, m.time)));
    }
    for (const [id, el] of this.els) if (el instanceof HTMLImageElement && !this.ready.has(id)) jobs.push(el.decode().then(() => { this.ready.add(id); }).catch(() => {}));
    await Promise.all(jobs);
  }

  async allLoaded(timeoutMs = 15000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      let pending = 0;
      for (const [id, el] of this.els) if (!this.ready.has(id) && !(el instanceof HTMLAudioElement)) pending++;
      if (!pending) return;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

function waitLoaded(v: HTMLVideoElement): Promise<void> {
  if (v.readyState >= 2) return Promise.resolve();
  return new Promise((res) => {
    const done = () => { v.removeEventListener("loadeddata", done); res(); };
    v.addEventListener("loadeddata", done);
    setTimeout(done, 8000);
  });
}

function seek(v: HTMLVideoElement, time: number): Promise<void> {
  const target = Math.min(Math.max(0, time), Math.max(0, (v.duration || time) - 0.001));
  if (Math.abs(v.currentTime - target) < 0.0005 && v.readyState >= 2) return Promise.resolve();
  return new Promise((res) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      v.removeEventListener("seeked", onSeeked);
      res();
    };
    const onSeeked = () => {
      // requestVideoFrameCallback guarantees the decoded frame is the one we asked for.
      const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
      if (rvfc) { rvfc.call(v, finish); setTimeout(finish, 120); } else finish();
    };
    v.addEventListener("seeked", onSeeked);
    v.currentTime = target;
    setTimeout(finish, 4000);
  });
}
