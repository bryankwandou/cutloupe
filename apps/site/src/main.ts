import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/instrument-sans/700.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./main.css";

import { LIBRARY, emptyProject, makeCaptions, makeFill, makeShape, makeText, renderFrame, synthesize, wordsFromText, type CaptionLook, type Project } from "@cutloupe/core";
import { initLang, lang, onLang, t } from "./i18n";
import { GROUPS, TOOLS } from "./tools";
import { flagNames, hashFile, lookupSeal } from "./verify";

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const $$ = <T extends HTMLElement = HTMLElement>(s: string) => Array.from(document.querySelectorAll<T>(s));
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, "0");

initLang($<HTMLSelectElement>("#lang"));

// ---------- hero title: words rise in one after another ----------
function splitTitle() {
  const h = $("#hero-title");
  let i = 0;
  const wrap = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        for (const part of child.textContent!.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(part); continue; }
          const s = document.createElement("span");
          s.className = /^[.,!?。、]+$/.test(part) ? "w p" : "w";
          s.style.animationDelay = `${80 + i++ * 70}ms`;
          s.textContent = part;
          frag.append(s);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === Node.ELEMENT_NODE) wrap(child);
    }
  };
  wrap(h);
}
splitTitle();
onLang(splitTitle);

// ---------- copy buttons ----------
async function copyText(text: string, btn: HTMLButtonElement) {
  try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked: still show state */ }
  btn.textContent = t("copied");
  btn.classList.add("done");
  setTimeout(() => { btn.textContent = t("copy"); btn.classList.remove("done"); }, 1600);
}
$$(".cmd").forEach((el) => {
  const btn = el.querySelector<HTMLButtonElement>(".copy")!;
  btn.addEventListener("click", () => copyText(el.dataset.copy!, btn));
});
$$("[data-copy-block]").forEach((pre) => {
  const btn = document.createElement("button");
  btn.className = "copy";
  btn.type = "button";
  btn.dataset.i18n = "copy";
  btn.textContent = t("copy");
  btn.addEventListener("click", () => {
    const text = Array.from(pre.childNodes).filter((n) => !(n instanceof HTMLElement && (n.classList.contains("c-dim") || n.classList.contains("copy")))).map((n) => n.textContent).join("").trim();
    copyText(text, btn);
  });
  pre.append(btn);
});

// ---------- header: the page is a timeline, scroll is the playhead ----------
const sections = $$<HTMLElement>("main > section[id]");
const marks = $("#ruler-marks");
function placeMarks() {
  marks.querySelectorAll("i").forEach((n) => n.remove());
  const max = document.documentElement.scrollHeight - innerHeight;
  for (const s of sections) {
    const i = document.createElement("i");
    i.style.left = `${Math.min(100, (s.offsetTop / Math.max(1, max)) * 100)}%`;
    marks.append(i);
  }
}
const navLinks = $$<HTMLAnchorElement>(".nav a");
function onScroll() {
  const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  const f = Math.min(1, scrollY / max);
  $("#playhead").style.transform = `translateX(${f * (innerWidth - 2)}px)`;
  // 2:24 of "page time" from top to bottom, at 30 fps.
  const secs = f * 144;
  $("#scroll-tc").textContent = `00:${pad(secs / 60)}:${pad(secs % 60)}:${pad((secs % 1) * 30)}`;
  let cur = "";
  for (const s of sections) if (s.getBoundingClientRect().top < innerHeight * 0.4) cur = s.id;
  navLinks.forEach((a) => a.setAttribute("aria-current", String(a.getAttribute("href") === `#${cur}`)));
}
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", () => { placeMarks(); onScroll(); });
addEventListener("load", () => { placeMarks(); onScroll(); });
placeMarks();
onScroll();

// ---------- reveal on scroll ----------
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
}, { rootMargin: "0px 0px -10% 0px" });
$$(".reveal").forEach((el) => io.observe(el));

// ---------- hero: the real studio, loaded on demand ----------
const heroBody = $("#hero-window .window-body");
const heroFrame = $<HTMLIFrameElement>("#hero-studio");
function startHero() {
  if (!heroFrame.src) heroFrame.src = heroFrame.dataset.src!;
  heroFrame.addEventListener("load", () => heroBody.classList.add("live"), { once: true });
}
$("#hero-start").addEventListener("click", startHero);
// On wide screens start it once the window is on screen; phones get the still and a button.
if (matchMedia("(min-width: 900px)").matches && !reduced) {
  const ho = new IntersectionObserver((e) => { if (e[0].isIntersecting) { startHero(); ho.disconnect(); } }, { threshold: 0.35 });
  ho.observe(heroBody);
}

// ---------- loop: a dot travels the four steps ----------
const steps = $$(".loop-step");
const dot = $("#loop-dot");
let loopStep = 0;
function showStep(i: number) {
  loopStep = i;
  steps.forEach((s, k) => s.classList.toggle("on", k === i));
  const card = steps[i];
  const track = $(".loop-track").getBoundingClientRect();
  const r = card.getBoundingClientRect();
  dot.style.left = `${r.left - track.left + r.width / 2}px`;
}
dot.style.transition = "left 0.9s cubic-bezier(0.22, 1, 0.36, 1)";
let loopTimer = 0;
const lo = new IntersectionObserver((e) => {
  clearInterval(loopTimer);
  if (e[0].isIntersecting) { showStep(loopStep); if (!reduced) loopTimer = window.setInterval(() => showStep((loopStep + 1) % steps.length), 2600); }
}, { threshold: 0.3 });
lo.observe($(".loop"));
steps.forEach((s, i) => s.addEventListener("mouseenter", () => { clearInterval(loopTimer); showStep(i); }));
addEventListener("resize", () => showStep(loopStep));

// ---------- "what it sees" tabs ----------
function tabs(group: HTMLElement, onPick: (btn: HTMLButtonElement) => void) {
  const btns = Array.from(group.querySelectorAll<HTMLButtonElement>("[role=tab]"));
  btns.forEach((b) => b.addEventListener("click", () => {
    btns.forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    onPick(b);
  }));
}
tabs($("#sees .tabs"), (b) => {
  $("#sees-sheet").hidden = b.id !== "tab-sheet";
  $("#sees-frame").hidden = b.id !== "tab-frame";
});
tabs($("#install-tabs"), (b) => {
  $$("#install [data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== b.dataset.tab));
});

// ---------- captions: drawn by the product's own renderer ----------
const capCanvas = $<HTMLCanvasElement>("#cap-canvas");
const capCtx = capCanvas.getContext("2d")!;
const noMedia = { get: () => null };
let capLook: CaptionLook = "bold-pop";
function captionProject(look: CaptionLook): Project {
  const p = emptyProject("Captions", "16:9", 30, "site_captions");
  p.width = 1280;
  p.height = 720;
  const words = wordsFromText("Every edit lands in the studio the moment your agent makes it", 2.6, 0.2);
  const v = p.tracks.find((tr) => tr.kind === "video")!;
  const o = p.tracks.find((tr) => tr.kind === "overlay")!;
  const tx = p.tracks.find((tr) => tr.kind === "text")!;
  v.clips.push(makeFill({ colors: ["#0b0d14", "#1a2140", "#3a1d3f"], angle: 120, start: 0, duration: 6 }));
  o.clips.push(makeShape({ shape: "ring", start: 0, duration: 6, w: 0.32, fill: "rgba(0,0,0,0)", stroke: "#ffb224", strokeWidth: 3, transform: { opacity: 0.35, y: 0.42 }, motion: "orbit" }));
  tx.clips.push(makeText({ text: "intro.mp4", preset: "label", start: 0, duration: 6 }));
  tx.clips.push(makeCaptions({ words, start: 0, look, y: 0.74 }));
  return p;
}
let capProject = captionProject(capLook);
let capVisible = false;
let capStart = performance.now();
function capTick(now: number) {
  if (capVisible) {
    const tt = reduced ? 1.6 : ((now - capStart) / 1000) % 6;
    renderFrame(capCtx, capProject, tt, noMedia);
    $("#cap-tc").textContent = `00:${pad(tt)}`;
  }
  requestAnimationFrame(capTick);
}
document.fonts.ready.then(() => requestAnimationFrame(capTick));
new IntersectionObserver((e) => { capVisible = e[0].isIntersecting; }).observe(capCanvas);
$$<HTMLButtonElement>("#cap-looks button").forEach((b) => b.addEventListener("click", () => {
  capLook = b.dataset.look as CaptionLook;
  $$("#cap-looks button").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  capProject = captionProject(capLook);
  capStart = performance.now();
}));

// ---------- music: synthesized in the browser, same code as the server ----------
const BARS = 48;
let audio: AudioContext | null = null;
let playing: { id: string; src: AudioBufferSourceNode; started: number; dur: number; li: HTMLElement } | null = null;
const buffers = new Map<string, AudioBuffer>();
const peaks = new Map<string, number[]>();
function renderTracks() {
  const ul = $("#tracks");
  ul.innerHTML = "";
  for (const r of LIBRARY) {
    const li = document.createElement("li");
    li.className = "track";
    li.dataset.id = r.id;
    li.innerHTML = `<button class="track-play" type="button" aria-label="Play ${r.name}"></button>
      <span class="track-name">${r.name}</span>
      <span class="track-meta">${r.bpm} BPM · ${r.seconds}s · ${r.mood}</span>
      <span class="track-bar" aria-hidden="true">${Array.from({ length: BARS }, (_, i) => `<i style="height:${peaks.get(r.id)?.[i] ?? 12 + ((i * 37 + r.bpm) % 13) * 1.4}%"></i>`).join("")}</span>`;
    li.querySelector("button")!.addEventListener("click", () => toggleTrack(r.id, li));
    ul.append(li);
  }
}
async function toggleTrack(id: string, li: HTMLElement) {
  if (playing) {
    const was = playing.id;
    playing.src.stop();
    playing.li.classList.remove("playing");
    playing = null;
    if (was === id) return;
  }
  audio ??= new AudioContext();
  await audio.resume();
  let buf = buffers.get(id);
  if (!buf) {
    li.classList.add("loading");
    li.querySelector(".track-meta")!.textContent = t("building");
    await new Promise((r) => setTimeout(r, 30));
    const recipe = LIBRARY.find((x) => x.id === id)!;
    const sr = 32000;
    const pcm = synthesize(recipe, sr);
    buf = audio.createBuffer(2, pcm.left.length, sr);
    buf.copyToChannel(pcm.left, 0);
    buf.copyToChannel(pcm.right, 1);
    buffers.set(id, buf);
    const step = Math.floor(pcm.left.length / BARS);
    const pk = Array.from({ length: BARS }, (_, i) => {
      let m = 0;
      for (let k = i * step; k < (i + 1) * step; k += 64) m = Math.max(m, Math.abs(pcm.left[k]));
      return m;
    });
    const top = Math.max(...pk, 1e-6);
    peaks.set(id, pk.map((m) => 8 + (m / top) * 92));
    li.querySelectorAll<HTMLElement>(".track-bar i").forEach((n, i) => (n.style.height = `${peaks.get(id)![i]}%`));
    li.querySelector(".track-meta")!.textContent = `${recipe.bpm} BPM · ${recipe.seconds}s · ${recipe.mood}`;
    li.classList.remove("loading");
  }
  const src = audio.createBufferSource();
  src.buffer = buf;
  src.connect(audio.destination);
  src.start();
  playing = { id, src, started: audio.currentTime, dur: buf.duration, li };
  li.classList.add("playing");
  src.onended = () => { if (playing?.src === src) { li.classList.remove("playing"); li.querySelectorAll(".track-bar i").forEach((n) => n.classList.remove("on")); playing = null; } };
}
function musicTick() {
  if (playing && audio) {
    const f = (audio.currentTime - playing.started) / playing.dur;
    playing.li.querySelectorAll(".track-bar i").forEach((n, i) => n.classList.toggle("on", i / BARS <= f));
  }
  requestAnimationFrame(musicTick);
}
renderTracks();
requestAnimationFrame(musicTick);

// ---------- tools ----------
function renderTools() {
  const q = $<HTMLInputElement>("#tool-search").value.trim().toLowerCase();
  const l = lang();
  const host = $("#tool-groups");
  host.innerHTML = "";
  let shown = 0;
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const mark = (s: string) => (q ? esc(s).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (m) => `<mark>${m}</mark>`) : esc(s));
  for (const g of GROUPS) {
    const list = TOOLS.filter((x) => x.group === g).filter((x) => !q || x.name.includes(q) || x[l].toLowerCase().includes(q) || x.en.toLowerCase().includes(q));
    shown += list.length;
    const div = document.createElement("div");
    div.className = `tool-group${list.length ? "" : " empty"}`;
    div.innerHTML = `<h3>${esc(t(`group.${g}`))}<span>${list.length}</span></h3>` + list.map((x) => `<div class="tool"><code>${mark(x.name)}</code><p>${mark(x[l])}</p></div>`).join("");
    host.append(div);
  }
  if (!shown) host.innerHTML = `<p class="tools-none">${t("tools.none")}</p>`;
}
$("#tool-search").addEventListener("input", renderTools);
renderTools();
onLang(renderTools);

// ---------- verify a seal ----------
const out = $("#verify-out");
async function verify(file: Blob, name: string) {
  out.innerHTML = `${t("v.hashing")}`;
  try {
    const sha = await hashFile(file);
    out.innerHTML = `${t("v.file")}  ${name}\nsha256 ${sha}\n${t("v.looking")}`;
    const s = await lookupSeal(sha);
    if (!s) { out.innerHTML = `${t("v.file")}  ${name}\nsha256 ${sha}\n<span class="no">${t("v.none")}</span>`; return; }
    const ex = (a: string) => `<a href="https://explorer.solana.com/address/${a}?cluster=devnet" target="_blank" rel="noopener">${a}</a>`;
    out.innerHTML = [
      `<span class="ok">${t("v.sealed")}</span>`,
      `${t("v.file")}      ${name}`,
      `sha256    ${sha}`,
      `${t("v.seal")}      ${ex(s.seal)}`,
      `${t("v.reel")}      ${ex(s.reel)}`,
      `${t("v.timeline")}  ${s.timeline}`,
      `${t("v.version")}   ${s.version} · ${(s.durationMs / 1000).toFixed(2)}s`,
      `${t("v.flags")}     ${flagNames(s.flags).join(", ") || "—"}`,
      `${t("v.when")}    ${new Date(s.sealedAt * 1000).toISOString().replace("T", " ").slice(0, 19)} UTC`,
    ].join("\n");
  } catch (e) {
    out.innerHTML = `<span class="no">${t("v.err")}</span> ${(e as Error).message}`;
  }
}
const drop = $("#drop");
const input = $<HTMLInputElement>("#verify-file");
input.addEventListener("change", () => { const f = input.files?.[0]; if (f) verify(f, f.name); });
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("over")));
drop.addEventListener("drop", (e) => { e.preventDefault(); const f = (e as DragEvent).dataTransfer?.files[0]; if (f) verify(f, f.name); });
$("#verify-sample").addEventListener("click", async () => {
  out.textContent = t("v.hashing");
  const res = await fetch("./media/sealed-demo.mp4");
  verify(await res.blob(), "sealed-demo.mp4");
});
