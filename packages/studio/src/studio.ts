// The studio: preview, timeline, inspector and activity feed. It shows every
// edit as it lands, marks which ones came from the agent, and shows where the
// agent looked. People edit here through the same ops the agent uses.

import {
  type Activity,
  type Clip,
  type ClientMsg,
  type MusicEntry,
  type Op,
  type Project,
  type ServerMsg,
  type TextPreset,
  type ShapeKind,
  LIBRARY,
  MOTION_PRESETS,
  Session,
  TEXT_PRESETS,
  activeClips,
  findClip,
  makeAudio,
  makeMedia,
  makeShape,
  makeText,
  motion,
  newId,
  projectDuration,
  renderFrame,
  timelineHash,
  toCapcutDraft,
  toFcpxml,
  toOtio,
  toRemotion,
  toSrt,
  toVtt,
  toXmeml,
} from "@cutloupe/core";
import { demoProject, demoScript, musicAsset, musicUrl } from "./demo";
import { type Box, clipBox, hitTest } from "./geometry";
import { MediaPool } from "./media";
import { zip } from "./zip";

interface Backend {
  send(msg: ClientMsg): void;
}

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

function tc(t: number, fps = 30) {
  const sign = t < 0 ? "-" : "";
  t = Math.abs(t);
  const m = Math.floor(t / 60), s = Math.floor(t % 60), f = Math.floor((t - Math.floor(t)) * fps + 1e-6);
  return `${sign}${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

const KIND_LABEL: Record<Clip["kind"], string> = { media: "Clip", text: "Text", shape: "Shape", fill: "Fill", captions: "Captions", audio: "Audio" };
const EXPORTS: { id: string; label: string; note: string; live?: boolean }[] = [
  { id: "mp4", label: "MP4 video", note: "H.264 + AAC, frame-exact", live: true },
  { id: "fcpxml", label: "DaVinci Resolve / Final Cut", note: "FCPXML 1.10 + SRT" },
  { id: "xmeml", label: "Adobe Premiere Pro", note: "FCP7 XML + SRT" },
  { id: "otio", label: "OpenTimelineIO", note: ".otio for any OTIO host" },
  { id: "capcut", label: "CapCut draft", note: "draft_content.json, experimental" },
  { id: "remotion", label: "Remotion project", note: "React composition" },
  { id: "srt", label: "Captions .srt", note: "SubRip" },
  { id: "vtt", label: "Captions .vtt", note: "WebVTT" },
  { id: "project", label: "Project file", note: ".cutloupe.json" },
];

export function startStudio(demo: boolean) {
  document.body.innerHTML = TEMPLATE;
  document.body.className = "studio";

  const pool = new MediaPool();
  const preview = $<HTMLCanvasElement>("#preview");
  const pctx = preview.getContext("2d")!;
  const overlay = $<HTMLCanvasElement>("#overlay");
  const octx = overlay.getContext("2d")!;
  const viewport = $("#viewport");

  const state = {
    project: demoProject() as Project,
    hash: "",
    t: 0,
    playing: false,
    loop: true,
    selected: null as string | null,
    activity: [] as Activity[],
    music: [] as MusicEntry[],
    canUndo: false,
    canRedo: false,
    pps: 60, // timeline pixels per second
    follow: true,
    volume: 0.9,
    connected: false,
    flashes: [] as { clipIds: string[]; text: string; until: number; start: number }[],
    looks: [] as { times: number[]; at: number }[],
    drag: null as null | { clipId: string; dx: number; dy: number; x: number; y: number },
  };
  let lastTick = performance.now();
  let dirtyTimeline = true;

  // ---------- backend ----------
  let backend: Backend;
  if (demo) backend = demoBackend();
  else backend = liveBackend();

  function demoBackend(): Backend {
    const s = new Session(demoProject());
    state.music = LIBRARY.map((r) => ({ id: r.id, name: r.name, mood: r.mood, bpm: r.bpm, seconds: r.seconds, src: "", license: "CC0" }));
    let runId = 0;
    const push = (a?: Activity) => setProject(s.project, s.canUndo, s.canRedo, a);
    const run = async () => {
      const id = ++runId;
      s.project = demoProject();
      s.activity = [];
      state.activity = [];
      state.looks = [];
      state.t = 0;
      state.selected = null;
      push();
      renderActivity();
      for (const step of demoScript()) {
        await sleep(step.wait);
        if (id !== runId) return;
        if (step.say) addActivity(s.log("agent", "note", step.say));
        if (step.ops) {
          const ops = await step.ops();
          if (id !== runId) return;
          try { push(s.apply(ops, "agent")); } catch (e) { addActivity(s.log("agent", "note", `Edit refused: ${(e as Error).message}`)); }
        }
        if (step.look) addActivity(s.log("agent", "look", `Looked at ${step.look.map((x) => tc(x)).join(", ")}`, [], step.look));
      }
    };
    $("#replay").hidden = false;
    $("#replay").onclick = () => run();
    setStatus("Demo: a scripted agent is editing", "demo");
    setTimeout(run, 400);
    return {
      send(msg) {
        try {
          if (msg.type === "ops") push(s.apply(msg.ops, "human", msg.label));
          else if (msg.type === "undo") { const a = s.undo("human"); if (a) push(a); }
          else if (msg.type === "redo") { const a = s.redo("human"); if (a) push(a); }
          else if (msg.type === "export") void exportInBrowser(msg.format);
        } catch (e) {
          toast((e as Error).message, true);
        }
      },
    };
  }

  function liveBackend(): Backend {
    let ws: WebSocket | null = null;
    let queue: ClientMsg[] = [];
    const connect = () => {
      ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
      ws.onopen = () => {
        state.connected = true;
        setStatus("Connected to your agent", "live");
        for (const m of queue) ws!.send(JSON.stringify(m));
        queue = [];
      };
      ws.onclose = () => {
        state.connected = false;
        setStatus("Reconnecting to the server…", "off");
        setTimeout(connect, 1200);
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as ServerMsg;
        if (msg.type === "hello") {
          state.activity = msg.activity;
          state.music = msg.music;
          renderActivity();
          setProject(msg.project, msg.canUndo, msg.canRedo, undefined, msg.hash);
          renderLibrary();
        } else if (msg.type === "state") setProject(msg.project, msg.canUndo, msg.canRedo, msg.activity, msg.hash);
        else if (msg.type === "activity") addActivity(msg.activity);
        else if (msg.type === "error") toast(msg.message, true);
      };
    };
    connect();
    return {
      send(msg) {
        if (msg.type === "ops") {
          // Optimistic: show the edit now; the server's state replaces it a moment later.
          try {
            const s = new Session(state.project);
            s.apply(msg.ops, "human");
            setProject(s.project, true, state.canRedo);
          } catch (e) {
            toast((e as Error).message, true);
            return;
          }
        }
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
        else queue.push(msg);
      },
    };
  }

  function setProject(p: Project, canUndo: boolean, canRedo: boolean, a?: Activity, hash?: string) {
    state.project = p;
    state.canUndo = canUndo;
    state.canRedo = canRedo;
    if (state.selected && !findClip(p, state.selected)) state.selected = null;
    pool.sync(p);
    if (a) addActivity(a);
    if (hash) setHash(hash);
    else void timelineHash(p).then((h) => { if (state.project === p) setHash(h); });
    $<HTMLInputElement>("#name").value = p.name;
    $("#format").textContent = `${p.width}×${p.height} · ${p.fps} fps`;
    $<HTMLButtonElement>("#undo").disabled = !canUndo;
    $<HTMLButtonElement>("#redo").disabled = !canRedo;
    preview.width = p.width;
    preview.height = p.height;
    viewport.style.setProperty("--ar", String(p.width / p.height));
    dirtyTimeline = true;
    renderInspector();
    if (!demo) renderLibrary();
  }

  function setHash(h: string) {
    state.hash = h;
    const e = $("#hash");
    e.textContent = h.slice(0, 10);
    e.title = `Timeline hash (SHA-256 of the canonical project):\n${h}`;
  }

  function setStatus(text: string, kind: "live" | "demo" | "off") {
    const s = $("#status");
    s.textContent = text;
    s.dataset.kind = kind;
  }

  // ---------- activity ----------
  function addActivity(a: Activity) {
    if (state.activity.some((x) => x.id === a.id && x.at === a.at)) return;
    state.activity.push(a);
    if (state.activity.length > 300) state.activity.shift();
    appendActivity(a);
    if (a.actor !== "agent") return;
    const now = performance.now();
    if (a.kind === "op" && a.clipIds.length) {
      state.flashes.push({ clipIds: a.clipIds, text: a.text, start: now, until: now + 2600 });
      const f = findClip(state.project, a.clipIds[0]);
      if (f && state.follow && !state.playing && f.clip.kind !== "audio") {
        const c = f.clip;
        const into = c.start + Math.min(Math.max(0.6, (c.enter?.duration ?? 0) + 0.3), c.duration / 2);
        if (state.t < c.start || state.t > c.start + c.duration) state.t = into;
      }
      dirtyTimeline = true;
    }
    if (a.kind === "look" && a.times?.length) {
      state.looks.push({ times: a.times, at: now });
      if (state.looks.length > 12) state.looks.shift();
      if (state.follow && !state.playing) state.t = a.times[a.times.length - 1];
      shutter();
      dirtyTimeline = true;
    }
  }

  function renderActivity() {
    const list = $("#activity");
    list.innerHTML = "";
    for (const a of state.activity) appendActivity(a, false);
    list.scrollTop = list.scrollHeight;
  }

  function appendActivity(a: Activity, scroll = true) {
    const list = $("#activity");
    const row = el("li", `act act-${a.actor} act-${a.kind}`);
    const head = el("div", "act-head");
    head.append(el("span", "act-who", a.actor === "agent" ? "Agent" : "You"), el("span", "act-kind", a.kind === "look" ? "looked" : a.kind === "note" ? "note" : a.kind), el("time", "act-time", new Date(a.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })));
    row.append(head, el("p", "act-text", a.text));
    if (a.clipIds.length || a.times?.length) {
      row.tabIndex = 0;
      row.onclick = () => {
        if (a.times?.length) state.t = a.times[0];
        const f = a.clipIds.length ? findClip(state.project, a.clipIds[0]) : null;
        if (f) { state.selected = f.clip.id; state.t = f.clip.start + Math.min(0.5, f.clip.duration / 2); renderInspector(); dirtyTimeline = true; }
      };
    }
    list.append(row);
    const n = $("#act-count");
    n.textContent = String(state.activity.length);
    if (scroll) list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
  }

  function shutter() {
    const s = $("#shutter");
    s.classList.remove("on");
    void s.offsetWidth;
    s.classList.add("on");
  }

  // ---------- preview + overlay ----------
  function sizeOverlay() {
    const r = viewport.getBoundingClientRect();
    const dpr = Math.min(2, devicePixelRatio || 1);
    overlay.width = Math.round(r.width * dpr);
    overlay.height = Math.round(r.height * dpr);
  }
  new ResizeObserver(() => { sizeOverlay(); dirtyTimeline = true; }).observe(viewport);

  function drawBox(b: Box, k: number, color: string, dash: number[] = [], lw = 1.5) {
    octx.save();
    octx.translate(b.cx * k, b.cy * k);
    octx.rotate((b.rot * Math.PI) / 180);
    octx.strokeStyle = color;
    octx.lineWidth = lw;
    octx.setLineDash(dash);
    octx.strokeRect((-b.w * k) / 2, (-b.h * k) / 2, b.w * k, b.h * k);
    octx.restore();
  }

  function drawOverlay(now: number) {
    const p = state.project;
    const dpr = overlay.width / Math.max(1, viewport.clientWidth);
    const k = overlay.width / p.width;
    octx.clearRect(0, 0, overlay.width, overlay.height);
    octx.font = `600 ${11 * dpr}px Inter, system-ui, sans-serif`;
    octx.textBaseline = "middle";
    // Agent highlights: what just changed, labelled with the edit.
    state.flashes = state.flashes.filter((f) => f.until > now);
    for (const f of state.flashes) {
      const life = (now - f.start) / (f.until - f.start);
      const alpha = life < 0.75 ? 1 : 1 - (life - 0.75) / 0.25;
      for (const id of f.clipIds) {
        const found = findClip(p, id);
        if (!found) continue;
        const c = found.clip;
        if (state.t < c.start - 0.001 || state.t > c.start + c.duration) continue;
        const b = clipBox(p, c, state.t);
        if (!b) continue;
        octx.globalAlpha = alpha;
        const grow = 1 + 0.06 * Math.max(0, 1 - life * 6);
        drawBox({ ...b, w: b.w * grow, h: b.h * grow }, k, "#ffb224", [], 2 * dpr);
        const label = f.text.length > 54 ? f.text.slice(0, 53) + "…" : f.text;
        const tw = octx.measureText(label).width + 16 * dpr;
        const x = Math.max(4, Math.min(overlay.width - tw - 4, (b.cx - b.w / 2) * k));
        const y = Math.max(4, (b.cy - b.h / 2) * k - 24 * dpr);
        octx.fillStyle = "#ffb224";
        octx.beginPath();
        octx.roundRect(x, y, tw, 20 * dpr, 4 * dpr);
        octx.fill();
        octx.fillStyle = "#1a1203";
        octx.fillText(label, x + 8 * dpr, y + 10 * dpr);
        octx.globalAlpha = 1;
      }
    }
    // Selection.
    if (state.selected) {
      const f = findClip(p, state.selected);
      if (f && state.t >= f.clip.start && state.t <= f.clip.start + f.clip.duration) {
        const b = clipBox(p, f.clip, state.t);
        if (b) {
          drawBox(b, k, "#e6e8eb", [5 * dpr, 4 * dpr], 1.25 * dpr);
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
            octx.save();
            octx.translate(b.cx * k, b.cy * k);
            octx.rotate((b.rot * Math.PI) / 180);
            octx.fillStyle = "#e6e8eb";
            octx.fillRect((sx * b.w * k) / 2 - 3 * dpr, (sy * b.h * k) / 2 - 3 * dpr, 6 * dpr, 6 * dpr);
            octx.restore();
          }
        }
      }
    }
    // The agent's viewfinder: brackets while it is looking at this frame.
    const look = state.looks[state.looks.length - 1];
    if (look && now - look.at < 2200) {
      const life = (now - look.at) / 2200;
      const a = life < 0.8 ? 1 : 1 - (life - 0.8) / 0.2;
      const inset = (14 + 10 * Math.max(0, 1 - life * 5)) * dpr, L = 28 * dpr;
      const W = overlay.width, H = overlay.height;
      octx.globalAlpha = a;
      octx.strokeStyle = "#ffb224";
      octx.lineWidth = 3 * dpr;
      octx.setLineDash([]);
      octx.beginPath();
      for (const [x, y, dx, dy] of [[inset, inset, 1, 1], [W - inset, inset, -1, 1], [W - inset, H - inset, -1, -1], [inset, H - inset, 1, -1]]) {
        octx.moveTo(x, y + dy * L); octx.lineTo(x, y); octx.lineTo(x + dx * L, y);
      }
      octx.stroke();
      const label = `AGENT LOOKING · ${look.times.map((x) => tc(x, p.fps)).join("  ")}`;
      octx.font = `600 ${11 * dpr}px "JetBrains Mono", monospace`;
      const tw = octx.measureText(label).width + 18 * dpr;
      octx.fillStyle = "rgba(10,10,12,0.78)";
      octx.beginPath();
      octx.roundRect(inset + 8 * dpr, inset + 8 * dpr, tw, 22 * dpr, 4 * dpr);
      octx.fill();
      octx.fillStyle = "#ffb224";
      octx.fillText(label, inset + 17 * dpr, inset + 19 * dpr);
      octx.globalAlpha = 1;
    }
  }

  function toProject(ev: PointerEvent) {
    const r = overlay.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * state.project.width, y: ((ev.clientY - r.top) / r.height) * state.project.height };
  }
  overlay.addEventListener("pointerdown", (ev) => {
    const pt = toProject(ev);
    const hit = hitTest(state.project, state.t, pt.x, pt.y);
    state.selected = hit?.id ?? null;
    renderInspector();
    dirtyTimeline = true;
    if (hit && hit.kind !== "media" && hit.kind !== "fill") {
      overlay.setPointerCapture(ev.pointerId);
      state.drag = { clipId: hit.id, dx: 0, dy: 0, x: pt.x, y: pt.y };
    }
  });
  overlay.addEventListener("pointermove", (ev) => {
    if (!state.drag) {
      const pt = toProject(ev);
      const hit = hitTest(state.project, state.t, pt.x, pt.y);
      overlay.style.cursor = hit && hit.kind !== "media" && hit.kind !== "fill" ? "move" : "default";
      return;
    }
    const pt = toProject(ev);
    state.drag.dx = pt.x - state.drag.x;
    state.drag.dy = pt.y - state.drag.y;
  });
  overlay.addEventListener("pointerup", () => {
    const d = state.drag;
    state.drag = null;
    if (!d || (Math.abs(d.dx) < 2 && Math.abs(d.dy) < 2)) return;
    const f = findClip(state.project, d.clipId);
    if (!f) return;
    const x = +(f.clip.transform.x + d.dx / state.project.width).toFixed(4);
    const y = +(f.clip.transform.y + d.dy / state.project.height).toFixed(4);
    const patch: Record<string, unknown> = { transform: { x, y } };
    if (f.clip.anim) patch.anim = shiftAnim(f.clip, d.dx / state.project.width, d.dy / state.project.height);
    backend.send({ type: "ops", ops: [{ op: "update_clip", clipId: d.clipId, patch }], label: `Moved ${KIND_LABEL[f.clip.kind].toLowerCase()} to ${x.toFixed(2)}, ${y.toFixed(2)}` });
  });

  function shiftAnim(c: Clip, dx: number, dy: number) {
    const a = structuredClone(c.anim!);
    if (a.x) a.x = a.x.map(([t, v, e]) => [t, v + dx, e]);
    if (a.y) a.y = a.y.map(([t, v, e]) => [t, v + dy, e]);
    return a;
  }

  /** Draw the frame, with the clip being dragged shown at its dragged position. */
  function drawFrame() {
    let p = state.project;
    if (state.drag) {
      const d = state.drag;
      const f = findClip(p, d.clipId);
      if (f) {
        p = structuredClone(p);
        const c = findClip(p, d.clipId)!.clip;
        c.transform = { ...c.transform, x: c.transform.x + d.dx / p.width, y: c.transform.y + d.dy / p.height };
        if (c.anim) c.anim = shiftAnim(c, d.dx / p.width, d.dy / p.height);
      }
    }
    renderFrame(pctx, p, state.t, pool);
  }

  // ---------- timeline ----------
  const tl = $("#tracks");
  const ruler = $<HTMLCanvasElement>("#ruler");
  const playhead = $("#playhead");

  function timelineLen() {
    return Math.max(10, projectDuration(state.project) + 4);
  }

  function renderTimeline() {
    dirtyTimeline = false;
    const p = state.project;
    const len = timelineLen();
    const width = len * state.pps;
    tl.innerHTML = "";
    $("#tl-inner").style.width = `${width + 140}px`;
    const now = performance.now();
    const flashed = new Set(state.flashes.flatMap((f) => f.clipIds));
    for (const track of p.tracks) {
      const row = el("div", `track track-${track.kind}`);
      row.dataset.track = track.id;
      const head = el("div", "track-head");
      const name = el("span", "track-name", track.name);
      const toggle = el("button", "track-toggle", track.kind === "audio" ? (track.muted ? "Muted" : "M") : track.hidden ? "Hidden" : "H");
      toggle.title = track.kind === "audio" ? "Mute track" : "Hide track";
      toggle.onclick = () => backend.send({ type: "ops", ops: [{ op: "update_track", trackId: track.id, patch: track.kind === "audio" ? { muted: !track.muted } : { hidden: !track.hidden } }] });
      head.append(name, toggle);
      const lane = el("div", "lane");
      lane.style.width = `${width}px`;
      for (const c of track.clips) {
        const node = el("div", `clip clip-${c.kind}${state.selected === c.id ? " selected" : ""}${flashed.has(c.id) ? " agent-flash" : ""}`);
        node.style.left = `${c.start * state.pps}px`;
        node.style.width = `${Math.max(4, c.duration * state.pps)}px`;
        node.dataset.clip = c.id;
        const label = c.kind === "text" ? c.text : c.kind === "media" || c.kind === "audio" ? p.assets[c.assetId]?.name ?? c.assetId : c.kind === "captions" ? c.words.map((w) => w.w).join(" ") : c.kind === "shape" ? c.shape : "gradient";
        node.append(el("span", "clip-kind", KIND_LABEL[c.kind]), el("span", "clip-label", label));
        if (c.kind === "fill") node.style.setProperty("--fill", `linear-gradient(90deg, ${c.colors.join(",")})`);
        if (c.kind === "audio") node.append(waveStrip(c.duration));
        const handle = el("span", "clip-trim");
        node.append(handle);
        node.addEventListener("pointerdown", (ev) => startClipDrag(ev, c, track.id, ev.target === handle));
        lane.append(node);
      }
      row.append(head, lane);
      tl.append(row);
    }
    void now;
    drawRuler();
  }

  function waveStrip(dur: number) {
    const s = el("span", "wave");
    s.style.setProperty("--bars", String(Math.round(dur * 6)));
    return s;
  }

  function drawRuler() {
    const len = timelineLen();
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = len * state.pps;
    ruler.width = Math.round(w * dpr);
    ruler.height = Math.round(26 * dpr);
    ruler.style.width = `${w}px`;
    const c = ruler.getContext("2d")!;
    c.scale(dpr, dpr);
    c.fillStyle = "#6f747c";
    c.font = "500 10px 'JetBrains Mono', monospace";
    c.textBaseline = "top";
    const step = state.pps >= 90 ? 0.5 : state.pps >= 40 ? 1 : state.pps >= 18 ? 2 : 5;
    // Index ticks by integer so the times never drift (adding 0.2 five times
    // gives 0.9999…, which the timecode would floor to the previous second).
    for (let i = 0; i * step / 5 <= len + 1e-6; i++) {
      const t = Math.round((i * step / 5) * 1000) / 1000;
      const x = Math.round(t * state.pps) + 0.5;
      const major = i % 5 === 0;
      c.fillStyle = major ? "#4a4e55" : "#2a2d32";
      c.fillRect(x, major ? 14 : 20, 1, major ? 12 : 6);
      if (major) { c.fillStyle = "#7d828a"; c.fillText(tc(t, state.project.fps).slice(0, 5) + (step < 1 ? `.${Math.round((t % 1) * 10)}` : ""), x + 4, 3); }
    }
    // Where the agent looked: small amber ticks.
    c.fillStyle = "#ffb224";
    for (const l of state.looks) for (const t of l.times) { const x = t * state.pps; c.beginPath(); c.moveTo(x - 4, 0); c.lineTo(x + 4, 0); c.lineTo(x, 7); c.fill(); }
    // Markers.
    for (const m of state.project.markers) { c.fillStyle = m.by === "agent" ? "#ffb224" : "#7aa7ff"; c.fillRect(m.t * state.pps - 1, 0, 2, 26); }
  }

  function startClipDrag(ev: PointerEvent, c: Clip, trackId: string, trim: boolean) {
    ev.preventDefault();
    ev.stopPropagation();
    state.selected = c.id;
    renderInspector();
    const node = ev.currentTarget as HTMLElement;
    node.setPointerCapture(ev.pointerId);
    tl.querySelectorAll(".clip.selected").forEach((n) => n.classList.remove("selected"));
    node.classList.add("selected");
    const x0 = ev.clientX;
    let start = c.start, dur = c.duration, target = trackId;
    const edges: number[] = [0, state.t];
    for (const tr of state.project.tracks) for (const o of tr.clips) if (o.id !== c.id) edges.push(o.start, o.start + o.duration);
    const snap = (t: number) => {
      const tol = 7 / state.pps;
      for (const e of edges) if (Math.abs(t - e) < tol) return e;
      return Math.round(t * state.project.fps) / state.project.fps;
    };
    const move = (e: PointerEvent) => {
      const dt = (e.clientX - x0) / state.pps;
      if (trim) {
        dur = Math.max(1 / state.project.fps, snap(c.start + c.duration + dt) - c.start);
        node.style.width = `${dur * state.pps}px`;
      } else {
        start = Math.max(0, c.start + dt);
        const s2 = snap(start), e2 = snap(start + c.duration) - c.duration;
        start = Math.abs(s2 - start) <= Math.abs(e2 - start) ? s2 : Math.max(0, e2);
        node.style.left = `${start * state.pps}px`;
        const under = document.elementsFromPoint(e.clientX, e.clientY).find((n) => (n as HTMLElement).dataset?.track) as HTMLElement | undefined;
        const kind = state.project.tracks.find((t) => t.id === under?.dataset.track)?.kind;
        if (under && kind && (kind === "audio") === (c.kind === "audio")) {
          target = under.dataset.track!;
          if (node.parentElement !== under.querySelector(".lane")) under.querySelector(".lane")!.append(node);
        }
      }
    };
    const up = () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up);
      if (trim && Math.abs(dur - c.duration) > 1e-4) backend.send({ type: "ops", ops: [{ op: "update_clip", clipId: c.id, patch: { duration: +dur.toFixed(3), ...(c.anim && c.kind !== "media" ? {} : {}) } }], label: `Trimmed ${KIND_LABEL[c.kind].toLowerCase()} to ${dur.toFixed(2)}s` });
      else if (!trim && (Math.abs(start - c.start) > 1e-4 || target !== trackId)) backend.send({ type: "ops", ops: [{ op: "move_clip", clipId: c.id, start: +start.toFixed(3), trackId: target !== trackId ? target : undefined }] });
      else dirtyTimeline = true;
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", up);
  }

  const scrubArea = $("#tl-scroll");
  function scrubTo(ev: PointerEvent) {
    const r = ruler.getBoundingClientRect();
    state.t = Math.max(0, Math.min(timelineLen(), (ev.clientX - r.left) / state.pps));
  }
  ruler.addEventListener("pointerdown", (ev) => {
    ruler.setPointerCapture(ev.pointerId);
    scrubTo(ev);
    const mv = (e: PointerEvent) => scrubTo(e);
    ruler.addEventListener("pointermove", mv);
    ruler.addEventListener("pointerup", () => ruler.removeEventListener("pointermove", mv), { once: true });
  });
  tl.addEventListener("pointerdown", (ev) => {
    if ((ev.target as HTMLElement).closest(".clip, .track-head")) return;
    state.selected = null;
    renderInspector();
    scrubTo(ev);
    dirtyTimeline = true;
  });
  scrubArea.addEventListener("wheel", (ev) => {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    setZoom(state.pps * (ev.deltaY < 0 ? 1.15 : 1 / 1.15));
  }, { passive: false });
  function setZoom(pps: number) {
    state.pps = Math.max(8, Math.min(240, pps));
    $<HTMLInputElement>("#zoom").value = String(state.pps);
    dirtyTimeline = true;
  }
  $<HTMLInputElement>("#zoom").oninput = (e) => setZoom(+(e.target as HTMLInputElement).value);

  // ---------- inspector ----------
  function renderInspector() {
    const box = $("#inspector");
    box.innerHTML = "";
    const f = state.selected ? findClip(state.project, state.selected) : null;
    if (!f) {
      box.append(el("p", "empty", "Select a clip on the timeline or in the preview. Drag in the preview to move it; drag its right edge on the timeline to trim."));
      const p = state.project;
      box.append(section("Project", [
        field("Name", input("text", p.name, (v) => send({ op: "set_project", patch: { name: v } }))),
        field("Format", select(["1920x1080", "1080x1920", "1080x1080", "1080x1350"], `${p.width}x${p.height}`, (v) => { const [w, h] = v.split("x").map(Number); send({ op: "set_project", patch: { width: w, height: h } }); })),
        field("Background", input("color", p.background, (v) => send({ op: "set_project", patch: { background: v } }))),
      ]));
      return;
    }
    const c = f.clip;
    const upd = (patch: Record<string, unknown>) => send({ op: "update_clip", clipId: c.id, patch });
    const head = el("div", "insp-head");
    head.append(el("span", `chip chip-${c.kind}`, KIND_LABEL[c.kind]), el("code", "insp-id", c.id));
    const del = el("button", "btn ghost danger", "Delete");
    del.onclick = () => send({ op: "remove_clip", clipId: c.id });
    head.append(del);
    box.append(head);
    box.append(section("Timing", [
      field("Start", num(c.start, 0.01, (v) => send({ op: "move_clip", clipId: c.id, start: v }))),
      field("Length", num(c.duration, 0.01, (v) => upd({ duration: v }))),
    ]));
    if (c.kind === "text") {
      box.append(section("Text", [
        field("Text", textarea(c.text, (v) => upd({ text: v })), true),
        field("Font", select(["sans", "display", "serif", "mono"], c.style.font, (v) => upd({ style: { font: v } }))),
        field("Size", num(c.style.size, 1, (v) => upd({ style: { size: v } }))),
        field("Weight", select(["400", "500", "600", "700", "800"], String(c.style.weight), (v) => upd({ style: { weight: +v } }))),
        field("Color", input("color", c.style.color, (v) => upd({ style: { color: v } }))),
        field("Reveal", select(["none", "type", "words", "rise", "pop"], c.reveal, (v) => upd({ reveal: v }))),
        field("Align", select(["left", "center", "right"], c.style.align, (v) => upd({ style: { align: v } }))),
      ]));
    }
    if (c.kind === "shape") {
      box.append(section("Shape", [
        field("Kind", select(["rect", "circle", "star", "blob", "line", "ring"], c.shape, (v) => upd({ shape: v }))),
        field("Fill", input("color", toHex6(c.fill), (v) => upd({ fill: v }))),
        field("Width", num(c.w, 0.01, (v) => upd({ w: v }))),
        field("Height", num(c.h, 0.01, (v) => upd({ h: v }))),
      ]));
    }
    if (c.kind === "fill") {
      box.append(section("Gradient", [
        ...c.colors.map((col, i) => field(`Stop ${i + 1}`, input("color", toHex6(col), (v) => { const colors = [...c.colors]; colors[i] = v; upd({ colors }); }))),
        field("Angle", num(c.angle, 1, (v) => upd({ angle: v }))),
      ]));
    }
    if (c.kind === "captions") {
      box.append(section("Captions", [
        field("Look", select(["bold-pop", "clean", "karaoke", "boxed"], c.look, (v) => upd({ look: v }))),
        field("Highlight", input("color", toHex6(c.highlight), (v) => upd({ highlight: v }))),
        field("Size", num(c.size, 1, (v) => upd({ size: v }))),
        field("Words/line", num(c.maxWords, 1, (v) => upd({ maxWords: Math.max(1, Math.round(v)) }))),
      ]));
    }
    if (c.kind === "media" || c.kind === "audio") {
      box.append(section("Source", [
        field("Asset", el("span", "ro", state.project.assets[c.assetId]?.name ?? c.assetId)),
        field("Trim in", num(c.trimIn, 0.01, (v) => upd({ trimIn: v }))),
        field("Volume", num(c.volume, 0.05, (v) => upd({ volume: v }))),
        ...(c.kind === "media" ? [field("Fit", select(["cover", "contain"], c.fit, (v) => upd({ fit: v })))] : [field("Fade in", num(c.fadeIn, 0.1, (v) => upd({ fadeIn: v }))), field("Fade out", num(c.fadeOut, 0.1, (v) => upd({ fadeOut: v })))]),
      ]));
    }
    if (c.kind !== "audio") {
      const tf = c.transform;
      box.append(section("Transform", [
        field("X", num(tf.x, 0.01, (v) => upd({ transform: { x: v } }))),
        field("Y", num(tf.y, 0.01, (v) => upd({ transform: { y: v } }))),
        field("Scale", num(tf.scale, 0.01, (v) => upd({ transform: { scale: v } }))),
        field("Rotate", num(tf.rotation, 1, (v) => upd({ transform: { rotation: v } }))),
        field("Opacity", num(tf.opacity, 0.05, (v) => upd({ transform: { opacity: Math.max(0, Math.min(1, v)) } }))),
      ]));
      const trs = ["none", "fade", "slide-left", "slide-right", "slide-up", "zoom", "wipe", "blur"];
      box.append(section("Motion", [
        field("Animate", select(["(keep)", ...MOTION_PRESETS], "(keep)", (v) => v !== "(keep)" && upd({ anim: v === "none" ? undefined : motion(v as (typeof MOTION_PRESETS)[number], c.duration, c.transform) }))),
        field("Enter", select(trs, c.enter?.type ?? "none", (v) => upd({ enter: v === "none" ? undefined : { type: v, duration: c.enter?.duration ?? 0.3 } }))),
        field("Exit", select(trs, c.exit?.type ?? "none", (v) => upd({ exit: v === "none" ? undefined : { type: v, duration: c.exit?.duration ?? 0.3 } }))),
      ]));
    }
    const split = el("button", "btn", "Split at playhead  S");
    split.onclick = splitSelected;
    box.append(split);
  }

  function send(op: Op) {
    backend.send({ type: "ops", ops: [op] });
  }

  function section(title: string, rows: HTMLElement[]) {
    const s = el("section", "insp-sec");
    s.append(el("h4", "", title), ...rows);
    return s;
  }
  function field(label: string, control: HTMLElement, wide = false) {
    const l = el("label", `fld${wide ? " wide" : ""}`);
    l.append(el("span", "", label), control);
    return l;
  }
  function input(type: string, value: string, on: (v: string) => void) {
    const i = el("input");
    i.type = type;
    i.value = value;
    i.onchange = () => on(i.value);
    return i;
  }
  function num(value: number, step: number, on: (v: number) => void) {
    const i = el("input");
    i.type = "number";
    i.step = String(step);
    i.value = String(+value.toFixed(3));
    i.onchange = () => { const v = parseFloat(i.value); if (Number.isFinite(v)) on(v); };
    return i;
  }
  function textarea(value: string, on: (v: string) => void) {
    const t = el("textarea");
    t.value = value;
    t.rows = 2;
    t.onchange = () => on(t.value);
    return t;
  }
  function select(opts: readonly string[], value: string, on: (v: string) => void) {
    const s = el("select");
    for (const o of opts) { const op = el("option", "", o); op.value = o; s.append(op); }
    s.value = value;
    s.onchange = () => on(s.value);
    return s;
  }

  function splitSelected() {
    const f = state.selected ? findClip(state.project, state.selected) : null;
    if (!f) return;
    if (state.t <= f.clip.start || state.t >= f.clip.start + f.clip.duration) return toast("Move the playhead inside the clip to split it");
    backend.send({ type: "ops", ops: [{ op: "split_clip", clipId: f.clip.id, at: +state.t.toFixed(3), newId: newId(f.clip.kind === "audio" ? "aud" : "clip") }] });
  }

  // ---------- library ----------
  let libTab = "text";
  $("#lib-tabs").addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest("button");
    if (!b) return;
    libTab = b.dataset.tab!;
    $("#lib-tabs").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    renderLibrary();
  });

  function at() { return +state.t.toFixed(2); }

  function renderLibrary() {
    const list = $("#lib-list");
    list.innerHTML = "";
    if (libTab === "text") {
      for (const k of Object.keys(TEXT_PRESETS) as TextPreset[]) {
        const pre = TEXT_PRESETS[k];
        const item = el("button", "lib-item lib-text");
        const sample = el("span", `lib-sample font-${pre.style.font}`, k === "lower-third" ? "Name Surname" : k === "label" ? "LIVE · 01" : k === "quote" ? "“Less, better.”" : k === "end-card" ? "Thanks" : "Headline");
        sample.style.fontWeight = String(pre.style.weight);
        item.append(sample, el("span", "lib-meta", k));
        item.onclick = () => backend.send({ type: "ops", ops: [{ op: "add_clip", trackId: "t1", clip: makeText({ text: k === "lower-third" ? "Name Surname" : k === "end-card" ? "Thanks for watching" : "Your headline", preset: k, start: at(), duration: 3 }) }] });
        list.append(item);
      }
    } else if (libTab === "shapes") {
      for (const s of ["rect", "circle", "star", "ring", "blob", "line"] as ShapeKind[]) {
        const item = el("button", "lib-item lib-shape");
        item.append(el("span", `shape-ico shape-${s}`), el("span", "lib-meta", s));
        item.onclick = () => backend.send({ type: "ops", ops: [{ op: "add_clip", trackId: "o1", clip: makeShape({ shape: s, start: at(), duration: 3, w: s === "line" ? 0.3 : 0.12, h: s === "line" ? 0.006 : undefined, fill: s === "ring" ? "rgba(0,0,0,0)" : "#ffb224", stroke: s === "ring" ? "#ffb224" : undefined, strokeWidth: s === "ring" ? 4 : undefined }) }] });
        list.append(item);
      }
    } else if (libTab === "music") {
      for (const m of state.music) {
        const item = el("div", "lib-item lib-music");
        const play = el("button", "mini", "▶");
        play.title = "Preview";
        play.onclick = async () => {
          const src = m.src || (await musicUrl(m.id));
          const a = $<HTMLAudioElement>("#cue");
          if (!a.paused && a.dataset.id === m.id) { a.pause(); play.textContent = "▶"; return; }
          a.src = src; a.dataset.id = m.id; a.currentTime = 0; void a.play();
          list.querySelectorAll(".mini").forEach((x) => (x.textContent = "▶"));
          play.textContent = "■";
        };
        const add = el("button", "mini add", "+");
        add.title = "Add at playhead";
        add.onclick = async () => {
          const asset = m.src ? { id: `music_${m.id}`, kind: "audio" as const, name: m.name, src: m.src, duration: m.seconds, hasAudio: true, license: m.license, bpm: m.bpm, mood: m.mood } : await musicAsset(m.id);
          const ops: Op[] = [];
          if (!state.project.assets[asset.id]) ops.push({ op: "add_asset", asset });
          const len = Math.min(m.seconds, Math.max(4, projectDuration(state.project) - at()) || m.seconds);
          ops.push({ op: "add_clip", trackId: state.project.tracks.find((t) => t.kind === "audio")?.id ?? "a1", clip: makeAudio({ assetId: asset.id, start: at(), duration: +len.toFixed(2) }) });
          backend.send({ type: "ops", ops, label: `Added music "${m.name}"` });
        };
        const txt = el("div", "lib-music-txt");
        txt.append(el("strong", "", m.name), el("span", "lib-meta", `${m.bpm} BPM · ${m.mood}`));
        item.append(play, txt, add);
        list.append(item);
      }
      list.append(el("p", "lib-note", "Original tracks synthesised from code. CC0: use them anywhere, no credit needed."));
    } else {
      const assets = Object.values(state.project.assets).filter((a) => a.kind !== "audio" || !a.id.startsWith("music_"));
      const drop = el("label", "dropzone");
      const file = el("input");
      file.type = "file";
      file.accept = "video/*,image/*,audio/*";
      file.multiple = true;
      file.onchange = () => { for (const f of file.files ?? []) void importFile(f); };
      drop.append(file, el("strong", "", "Drop video, image or audio"), el("span", "", demo ? "Stays in this tab; nothing is uploaded" : "Copied to the project folder on this machine"));
      list.append(drop);
      for (const a of assets) {
        const item = el("button", "lib-item lib-media");
        item.append(el("span", `chip chip-${a.kind === "audio" ? "audio" : "media"}`, a.kind), el("span", "lib-label", a.name), el("span", "lib-meta", `${a.duration ? a.duration.toFixed(1) + "s" : ""}`));
        item.onclick = () => {
          const track = a.kind === "audio" ? "a1" : "v1";
          const clip = a.kind === "audio" ? makeAudio({ assetId: a.id, start: at(), duration: a.duration || 5 }) : makeMedia({ assetId: a.id, start: at(), duration: a.kind === "image" ? 4 : Math.min(a.duration || 5, 30), motion: a.kind === "image" ? "ken-burns" : undefined });
          backend.send({ type: "ops", ops: [{ op: "add_clip", trackId: track, clip }] });
        };
        list.append(item);
      }
    }
  }

  async function importFile(f: File) {
    const kind = f.type.startsWith("video") ? "video" : f.type.startsWith("audio") ? "audio" : "image";
    if (!demo) {
      const res = await fetch(`/api/upload?name=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
      if (!res.ok) toast(`Upload failed: ${await res.text()}`, true);
      return;
    }
    const src = URL.createObjectURL(f);
    const meta = await probe(src, kind);
    backend.send({ type: "ops", ops: [{ op: "add_asset", asset: { id: newId("asset"), kind, name: f.name, src, duration: meta.duration, width: meta.width, height: meta.height, hasAudio: kind !== "image" } }] });
  }

  window.addEventListener("dragover", (e) => { e.preventDefault(); document.body.classList.add("dragging"); });
  window.addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("dragging"); });
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    document.body.classList.remove("dragging");
    for (const f of e.dataTransfer?.files ?? []) void importFile(f);
    libTab = "media";
    $("#lib-tabs").querySelectorAll("button").forEach((x) => x.classList.toggle("on", (x as HTMLElement).dataset.tab === "media"));
    renderLibrary();
  });

  // ---------- export ----------
  const exportMenu = $("#export-menu");
  for (const x of EXPORTS) {
    if (demo && x.id === "mp4") continue;
    const b = el("button", "menu-item");
    b.append(el("strong", "", x.label), el("span", "", x.note));
    b.onclick = () => { exportMenu.hidden = true; backend.send({ type: "export", format: x.id }); };
    exportMenu.append(b);
  }
  if (demo) {
    const b = el("button", "menu-item");
    b.append(el("strong", "", "WebM recording"), el("span", "", "Picture only, recorded in this tab. Run the MCP server for MP4 with sound."));
    b.onclick = () => { exportMenu.hidden = true; void recordWebm(); };
    exportMenu.prepend(b);
  }
  $("#export").onclick = (e) => { e.stopPropagation(); exportMenu.hidden = !exportMenu.hidden; };
  document.addEventListener("click", (e) => { if (!exportMenu.contains(e.target as Node)) exportMenu.hidden = true; });

  async function exportInBrowser(format: string) {
    const p = state.project;
    const base = (p.name || "reel").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "reel";
    let files: { path: string; content: string }[] = [];
    if (format === "srt") files = [{ path: `${base}.srt`, content: toSrt(p) }];
    else if (format === "vtt") files = [{ path: `${base}.vtt`, content: toVtt(p) }];
    else if (format === "project") files = [{ path: `${base}.cutloupe.json`, content: JSON.stringify(p, null, 2) }];
    else {
      const bundle = format === "fcpxml" ? toFcpxml(p) : format === "xmeml" ? toXmeml(p) : format === "otio" ? toOtio(p) : format === "capcut" ? toCapcutDraft(p) : toRemotion(p);
      files = bundle.files;
      if (bundle.notes.length) files.push({ path: "NOTES.txt", content: bundle.notes.join("\n") + "\n" });
    }
    if (files.length === 1) download(new Blob([files[0].content], { type: "text/plain" }), files[0].path);
    else download(zip(files.map((f) => ({ path: f.path, data: f.content }))), `${base}-${format}.zip`);
    addActivity({ id: Date.now(), actor: "human", kind: "export", text: `Exported ${format} (${files.length} file${files.length > 1 ? "s" : ""})`, at: Date.now(), clipIds: [] });
  }

  async function recordWebm() {
    const dur = projectDuration(state.project);
    if (!dur) return toast("Nothing to record yet");
    const stream = preview.captureStream(state.project.fps);
    const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm", videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => download(new Blob(chunks, { type: "video/webm" }), "reel.webm");
    state.t = 0;
    state.loop = false;
    state.playing = true;
    rec.start();
    toast(`Recording ${dur.toFixed(1)}s…`);
    await sleep(dur * 1000 + 200);
    rec.stop();
    state.playing = false;
    state.loop = true;
  }

  // ---------- transport + keys ----------
  const playBtn = $("#play");
  playBtn.onclick = () => togglePlay();
  function togglePlay() {
    const dur = projectDuration(state.project);
    if (!state.playing && dur && state.t >= dur - 0.01) state.t = 0;
    state.playing = !state.playing;
    lastTick = performance.now();
  }
  $("#undo").onclick = () => backend.send({ type: "undo" });
  $("#redo").onclick = () => backend.send({ type: "redo" });
  $<HTMLInputElement>("#follow").onchange = (e) => (state.follow = (e.target as HTMLInputElement).checked);
  $<HTMLInputElement>("#vol").oninput = (e) => (state.volume = +(e.target as HTMLInputElement).value);
  $<HTMLInputElement>("#name").onchange = (e) => send({ op: "set_project", patch: { name: (e.target as HTMLInputElement).value } });
  $("#side-tabs").addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest("button");
    if (!b) return;
    $("#side-tabs").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    $("#pane-inspector").hidden = b.dataset.tab !== "inspector";
    $("#pane-activity").hidden = b.dataset.tab !== "activity";
  });
  $("#to-start").onclick = () => (state.t = 0);
  $("#to-end").onclick = () => (state.t = projectDuration(state.project));

  window.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const frame = 1 / state.project.fps;
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); backend.send({ type: e.shiftKey ? "redo" : "undo" }); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); backend.send({ type: "redo" }); }
    else if ((e.key === "Delete" || e.key === "Backspace") && state.selected) send({ op: "remove_clip", clipId: state.selected });
    else if (e.key.toLowerCase() === "s" && !e.ctrlKey) splitSelected();
    else if (e.key === "ArrowLeft") state.t = Math.max(0, state.t - (e.shiftKey ? 1 : frame));
    else if (e.key === "ArrowRight") state.t += e.shiftKey ? 1 : frame;
    else if (e.key === "Home") state.t = 0;
    else if (e.key === "End") state.t = projectDuration(state.project);
    else if (e.key === "Escape") { state.selected = null; renderInspector(); dirtyTimeline = true; }
    else if (e.key === "+" || e.key === "=") setZoom(state.pps * 1.2);
    else if (e.key === "-") setZoom(state.pps / 1.2);
  });

  // ---------- loop ----------
  pool.onReady = () => {};
  function tick(now: number) {
    const dt = Math.min(0.1, (now - lastTick) / 1000);
    lastTick = now;
    const dur = projectDuration(state.project);
    if (state.playing) {
      state.t += dt;
      if (state.t >= dur) {
        if (state.loop && dur > 0) state.t = 0;
        else { state.t = dur; state.playing = false; }
      }
    }
    playBtn.textContent = state.playing ? "❚❚" : "▶";
    playBtn.setAttribute("aria-label", state.playing ? "Pause" : "Play");
    pool.follow(state.project, state.t, state.playing, state.volume);
    drawFrame();
    drawOverlay(now);
    if (dirtyTimeline || state.flashes.length) {
      if (dirtyTimeline) renderTimeline();
      else tl.querySelectorAll(".agent-flash").forEach((n) => { const id = (n as HTMLElement).dataset.clip!; if (!state.flashes.some((f) => f.clipIds.includes(id))) n.classList.remove("agent-flash"); });
    }
    playhead.style.transform = `translateX(${140 + state.t * state.pps}px)`;
    $("#tc").textContent = tc(state.t, state.project.fps);
    $("#dur").textContent = tc(dur, state.project.fps);
    const n = activeClips(state.project, state.t).length;
    $("#active").textContent = `${n} layer${n === 1 ? "" : "s"}`;
    if (state.playing) {
      const sc = $("#tl-scroll");
      const x = 140 + state.t * state.pps;
      if (x > sc.scrollLeft + sc.clientWidth - 60 || x < sc.scrollLeft + 140) sc.scrollLeft = x - 200;
    }
    requestAnimationFrame(tick);
  }

  sizeOverlay();
  renderLibrary();
  renderInspector();
  setProject(state.project, false, false);
  requestAnimationFrame(tick);
  if (demo) document.body.classList.add("is-demo");
}

function toHex6(c: string) {
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map((x) => x + x).join("");
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return "#" + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, "0")).join("");
  return "#ffffff";
}

function probe(src: string, kind: string): Promise<{ duration: number; width?: number; height?: number }> {
  return new Promise((res) => {
    if (kind === "image") {
      const i = new Image();
      i.onload = () => res({ duration: 0, width: i.naturalWidth, height: i.naturalHeight });
      i.onerror = () => res({ duration: 0 });
      i.src = src;
      return;
    }
    const m = document.createElement(kind === "video" ? "video" : "audio");
    m.preload = "metadata";
    m.onloadedmetadata = () => res({ duration: m.duration || 0, width: (m as HTMLVideoElement).videoWidth, height: (m as HTMLVideoElement).videoHeight });
    m.onerror = () => res({ duration: 0 });
    m.src = src;
  });
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function toast(text: string, bad = false) {
  const t = el("div", `toast${bad ? " bad" : ""}`, text);
  document.body.append(t);
  setTimeout(() => t.classList.add("out"), 2600);
  setTimeout(() => t.remove(), 3100);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TEMPLATE = `
<header class="bar">
  <a class="brand" href="./" aria-label="Cutloupe">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M14.8 14.8 20 20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M7.5 10h5M10 7.5v5" stroke="#ffb224" stroke-width="1.8" stroke-linecap="round"/></svg>
    <span>cutloupe</span>
  </a>
  <input id="name" class="name" aria-label="Project name" spellcheck="false" />
  <span id="format" class="meta"></span>
  <span class="grow"></span>
  <span id="status" class="status" data-kind="off">Connecting</span>
  <button id="replay" class="btn ghost" hidden>Replay agent</button>
  <code id="hash" class="hash" title="Timeline hash"></code>
  <button id="undo" class="btn ghost icon" title="Undo (Ctrl+Z)" aria-label="Undo">↶</button>
  <button id="redo" class="btn ghost icon" title="Redo (Ctrl+Shift+Z)" aria-label="Redo">↷</button>
  <div class="menu-wrap">
    <button id="export" class="btn primary">Export</button>
    <div id="export-menu" class="menu" hidden></div>
  </div>
</header>
<main class="work">
  <aside class="lib">
    <nav id="lib-tabs" class="tabs">
      <button data-tab="text" class="on">Text</button><button data-tab="shapes">Shapes</button><button data-tab="music">Music</button><button data-tab="media">Media</button>
    </nav>
    <div id="lib-list" class="lib-list"></div>
  </aside>
  <section class="stage">
    <div class="stage-inner">
      <div id="viewport" class="viewport">
        <canvas id="preview"></canvas>
        <canvas id="overlay"></canvas>
        <div id="shutter" class="shutter"></div>
      </div>
    </div>
    <div class="transport">
      <button id="to-start" class="btn ghost icon" aria-label="Go to start">⏮</button>
      <button id="play" class="btn play" aria-label="Play">▶</button>
      <button id="to-end" class="btn ghost icon" aria-label="Go to end">⏭</button>
      <span class="tc"><b id="tc">00:00:00</b> / <span id="dur">00:00:00</span></span>
      <span id="active" class="meta"></span>
      <span class="grow"></span>
      <label class="check"><input id="follow" type="checkbox" checked /> Follow agent</label>
      <label class="vol" title="Volume">Vol <input id="vol" type="range" min="0" max="1" step="0.05" value="0.9" /></label>
    </div>
  </section>
  <aside class="side">
    <nav id="side-tabs" class="tabs">
      <button data-tab="activity" class="on">Activity <span id="act-count" class="count">0</span></button><button data-tab="inspector">Inspector</button>
    </nav>
    <div id="pane-activity" class="pane"><ol id="activity" class="activity"></ol></div>
    <div id="pane-inspector" class="pane" hidden><div id="inspector" class="inspector"></div></div>
  </aside>
</main>
<section class="timeline">
  <div class="tl-bar">
    <span class="meta">Timeline</span>
    <span class="grow"></span>
    <span class="meta">Zoom</span><input id="zoom" type="range" min="8" max="240" value="60" />
  </div>
  <div id="tl-scroll" class="tl-scroll">
    <div id="tl-inner" class="tl-inner">
      <div class="ruler-row"><div class="ruler-pad"></div><canvas id="ruler"></canvas></div>
      <div id="tracks" class="tracks"></div>
      <div id="playhead" class="playhead"></div>
    </div>
  </div>
</section>
<audio id="cue" hidden></audio>
<div class="drop-hint">Drop to import</div>
`;
