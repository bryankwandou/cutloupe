import assert from "node:assert/strict";
import { test } from "node:test";
import {
  OpError, Session, applyOp, emptyProject, makeText, makeShape, makeCaptions, makeFill, wordsFromText,
  projectDuration, timelineHash, toSrt, toVtt, toFcpxml, toXmeml, toOtio, toCapcutDraft, toRemotion,
  LIBRARY, synthesize, toWav, sampleKeys, motion, MOTION_PRESETS, captionPhrases, canonical,
} from "../dist/index.mjs";

const base = () => {
  let p = emptyProject("Test reel", "16:9", 30, "reel_test");
  p = applyOp(p, { op: "add_clip", trackId: "v1", clip: makeFill({ id: "bg", colors: ["#000", "#123"], start: 0, duration: 6 }) });
  p = applyOp(p, { op: "add_clip", trackId: "t1", clip: makeText({ id: "title", text: "Hello & <world>", start: 0.5, duration: 3 }) });
  p = applyOp(p, { op: "add_clip", trackId: "t1", clip: makeCaptions({ id: "cap", words: wordsFromText("one two three four five six", 2), start: 2 }) });
  return p;
};

test("applyOp is pure and validates", () => {
  const p = base();
  const q = applyOp(p, { op: "move_clip", clipId: "title", start: 2 });
  assert.equal(p.tracks[2].clips.find((c) => c.id === "title").start, 0.5);
  assert.equal(q.tracks[2].clips.find((c) => c.id === "title").start, 2);
  assert.throws(() => applyOp(p, { op: "remove_clip", clipId: "nope" }), OpError);
  assert.throws(() => applyOp(p, { op: "add_clip", trackId: "a1", clip: makeText({ text: "x", start: 0, duration: 1 }) }), /audio tracks/);
  assert.throws(() => applyOp(p, { op: "add_clip", trackId: "t1", clip: makeText({ id: "title", text: "dup", start: 0, duration: 1 }) }), /already used/);
  assert.throws(() => applyOp(p, { op: "update_clip", clipId: "title", patch: { duration: 0 } }), /duration/);
});

test("update_clip merges nested transform and style", () => {
  const q = applyOp(base(), { op: "update_clip", clipId: "title", patch: { transform: { y: 0.7 }, style: { color: "#ff0000" } } });
  const c = q.tracks[2].clips.find((c) => c.id === "title");
  assert.equal(c.transform.y, 0.7);
  assert.equal(c.transform.x, 0.5);
  assert.equal(c.style.color, "#ff0000");
  assert.equal(c.style.font, "display");
});

test("split keeps total length and shifts caption words", () => {
  const q = applyOp(base(), { op: "split_clip", clipId: "cap", at: 3.2, newId: "cap2" });
  const caps = q.tracks[2].clips.filter((c) => c.kind === "captions");
  assert.equal(caps.length, 2);
  const [l, r] = caps.sort((a, b) => a.start - b.start);
  assert.ok(Math.abs(l.duration + r.duration - base().tracks[2].clips.find((c) => c.id === "cap").duration) < 1e-9);
  assert.ok(r.words.every((w) => w.t0 >= 0));
  assert.throws(() => applyOp(base(), { op: "split_clip", clipId: "cap", at: 0.1, newId: "z" }), /outside/);
});

test("session undo/redo and atomic batches", () => {
  const s = new Session(base());
  const before = s.project;
  assert.throws(() => s.apply([{ op: "remove_clip", clipId: "title" }, { op: "remove_clip", clipId: "missing" }], "agent"));
  assert.equal(s.project, before, "failed batch must not change the project");
  s.apply([{ op: "remove_clip", clipId: "title" }], "agent");
  assert.equal(s.project.tracks[2].clips.some((c) => c.id === "title"), false);
  s.undo("human");
  assert.equal(s.project.tracks[2].clips.some((c) => c.id === "title"), true);
  s.redo("human");
  assert.equal(s.project.tracks[2].clips.some((c) => c.id === "title"), false);
  assert.deepEqual(s.pending, { agent: 1, human: 2 });
});

test("timeline hash ignores paths and key order, tracks content", async () => {
  const p = base();
  const h1 = await timelineHash(p);
  const q = structuredClone(p);
  q.assets.a = { id: "a", kind: "video", name: "x.mp4", src: "/media/a", path: "C:/one/x.mp4", duration: 3, sha256: "ab" };
  const r = structuredClone(q);
  r.assets.a.path = "D:/two/x.mp4";
  r.assets.a.src = "/other";
  assert.equal(await timelineHash(q), await timelineHash(r));
  assert.notEqual(await timelineHash(q), h1);
  assert.equal(canonical({ b: 1, a: [1, { d: 2, c: 3 }] }), canonical({ a: [1, { c: 3, d: 2 }], b: 1 }));
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test("keyframes and motion presets", () => {
  assert.equal(sampleKeys([[0, 0, "linear"], [1, 10, "linear"]], 0.5), 5);
  assert.equal(sampleKeys([[0, 0], [1, 10]], 5), 10);
  for (const m of MOTION_PRESETS) {
    const a = motion(m, 3, { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 });
    for (const keys of Object.values(a)) for (const k of keys) assert.ok(Number.isFinite(k[0]) && Number.isFinite(k[1]), m);
  }
});

test("captions: phrases, srt and vtt", () => {
  const p = base();
  const phrases = captionPhrases(p.tracks[2].clips.find((c) => c.id === "cap").words, 3);
  assert.equal(phrases.flat().length, 6);
  const srt = toSrt(p);
  assert.match(srt, /^1\r?\n00:00:02,000 --> /);
  assert.match(toVtt(p), /^WEBVTT/);
});

test("exports are well formed", () => {
  const p = base();
  p.assets.v = { id: "v", kind: "video", name: "clip #1.mp4", src: "/media/v.mp4", path: "C:\\media\\clip #1.mp4", duration: 10, width: 1920, height: 1080, hasAudio: true };
  p.tracks[0].clips.push({ id: "m1", kind: "media", assetId: "v", start: 1, duration: 4, trimIn: 2, fit: "cover", volume: 0.5, transform: { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 } });
  const fcp = toFcpxml(p).files[0].content;
  assert.match(fcp, /<fcpxml version="1.10">/);
  assert.match(fcp, /Hello &amp; &lt;world&gt;/);
  assert.match(fcp, /file:\/\/\/C:\/media\/clip%20%231\.mp4/);
  const xm = toXmeml(p).files[0].content;
  assert.match(xm, /<xmeml version="5">/);
  assert.match(xm, /<start>30<\/start><end>150<\/end><in>60<\/in><out>180<\/out>/);
  const otio = JSON.parse(toOtio(p).files[0].content);
  assert.equal(otio.OTIO_SCHEMA, "Timeline.1");
  JSON.parse(toCapcutDraft(p).files.find((f) => f.path.endsWith(".json")).content);
  const rem = toRemotion(p);
  const tl = JSON.parse(rem.files.find((f) => f.path.endsWith("timeline.json")).content);
  assert.equal(tl.assets.v.src, "media/v.mp4");
  assert.ok(rem.files.some((f) => f.path.endsWith("Reel.tsx")));
});

test("music library renders valid, bounded audio", () => {
  assert.equal(LIBRARY.length, 6);
  const r = { ...LIBRARY[2], seconds: 4 };
  const pcm = synthesize(r, 8000);
  let peak = 0;
  for (const v of pcm.left) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
  assert.ok(peak > 0.05 && peak <= 0.86, `peak ${peak}`);
  const wav = toWav(pcm, 8000);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), "RIFF");
  assert.equal(wav.length, 44 + pcm.left.length * 4);
  const again = synthesize(r, 8000);
  assert.deepEqual(again.left.slice(0, 2000), pcm.left.slice(0, 2000), "same seed, same audio");
});

test("projectDuration", () => {
  assert.equal(projectDuration(emptyProject()), 0);
  assert.equal(projectDuration(base()), 6);
});
