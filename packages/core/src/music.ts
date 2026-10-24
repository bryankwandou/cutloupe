// The built-in music library. Every track is synthesised from the recipe below
// by a fixed-seed generator, so the library is original work, CC0, and anyone
// can rebuild the exact same audio from source.

export interface TrackRecipe {
  id: string;
  name: string;
  mood: string;
  bpm: number;
  seconds: number;
  root: number; // MIDI note of the key
  scale: "major" | "minor" | "dorian";
  progression: number[]; // scale degrees, one per bar
  drums: "none" | "soft" | "four" | "broken";
  bass: boolean;
  lead: "none" | "pluck" | "bell";
  pad: number; // 0..1 level
  seed: number;
}

export const LIBRARY: TrackRecipe[] = [
  { id: "glasshouse", name: "Glasshouse", mood: "calm, ambient, intro", bpm: 84, seconds: 32, root: 57, scale: "major", progression: [0, 4, 5, 3], drums: "none", bass: false, lead: "bell", pad: 0.9, seed: 11 },
  { id: "night-bus", name: "Night Bus", mood: "lo-fi, vlog, talking head", bpm: 86, seconds: 32, root: 50, scale: "dorian", progression: [0, 3, 6, 4], drums: "broken", bass: true, lead: "pluck", pad: 0.6, seed: 23 },
  { id: "tally", name: "Tally", mood: "upbeat, product launch", bpm: 120, seconds: 32, root: 55, scale: "major", progression: [0, 5, 3, 4], drums: "four", bass: true, lead: "pluck", pad: 0.45, seed: 37 },
  { id: "paper-kite", name: "Paper Kite", mood: "light, tutorial, kids", bpm: 104, seconds: 32, root: 60, scale: "major", progression: [0, 3, 4, 0], drums: "soft", bass: true, lead: "bell", pad: 0.35, seed: 41 },
  { id: "overpass", name: "Overpass", mood: "driving, sport, trailer", bpm: 128, seconds: 32, root: 45, scale: "minor", progression: [0, 5, 2, 6], drums: "four", bass: true, lead: "none", pad: 0.55, seed: 53 },
  { id: "quiet-room", name: "Quiet Room", mood: "reflective, story, documentary", bpm: 72, seconds: 32, root: 52, scale: "minor", progression: [0, 5, 3, 4], drums: "none", bass: true, lead: "pluck", pad: 0.75, seed: 67 },
];

const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function degree(r: TrackRecipe, deg: number, octave = 0): number {
  const sc = SCALES[r.scale];
  const o = Math.floor(deg / sc.length);
  return r.root + sc[((deg % sc.length) + sc.length) % sc.length] + 12 * (o + octave);
}

/** Render a recipe to interleaved stereo float PCM. Pure maths, runs in Node or a browser. */
export function synthesize(r: TrackRecipe, sampleRate = 44100): { left: Float32Array; right: Float32Array } {
  const n = Math.floor(r.seconds * sampleRate);
  const L = new Float32Array(n), R = new Float32Array(n);
  const rand = rng(r.seed);
  const beat = 60 / r.bpm;
  const bar = beat * 4;
  const add = (i: number, l: number, rr: number) => {
    if (i >= 0 && i < n) { L[i] += l; R[i] += rr; }
  };

  const bars = Math.ceil(r.seconds / bar);
  for (let b = 0; b < bars; b++) {
    const chordDeg = r.progression[b % r.progression.length];
    const t0 = b * bar;
    const fadeBar = Math.min(1, (b + 1) / 2);

    // Pad: three detuned sines per chord tone, slow attack.
    if (r.pad > 0) {
      for (const [k, d] of [[0, 0], [1, 2], [2, 4]] as const) {
        const f = hz(degree(r, chordDeg + d, k === 0 ? -1 : 0));
        const start = Math.floor(t0 * sampleRate), len = Math.floor(bar * sampleRate * 1.05);
        for (let i = 0; i < len; i++) {
          const t = i / sampleRate;
          const env = Math.min(1, t / 0.6) * Math.min(1, (bar * 1.05 - t) / 0.5);
          const v = (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 1.003 * t + 1) + 0.25 * Math.sin(2 * Math.PI * f * 2 * t)) * 0.035 * r.pad * env * fadeBar;
          add(start + i, v * (k === 1 ? 0.7 : 1), v * (k === 2 ? 0.7 : 1));
        }
      }
    }

    // Bass: root on the beat, sine plus a bit of second harmonic.
    if (r.bass) {
      const f = hz(degree(r, chordDeg, -2));
      const hits = r.drums === "four" ? [0, 1, 2, 3] : [0, 2.5];
      for (const h of hits) {
        const start = Math.floor((t0 + h * beat) * sampleRate), len = Math.floor(beat * 0.9 * sampleRate);
        for (let i = 0; i < len; i++) {
          const t = i / sampleRate;
          const env = Math.min(1, t / 0.01) * Math.exp(-t * 3.2);
          const v = (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * 0.16 * env;
          add(start + i, v, v);
        }
      }
    }

    // Drums.
    if (r.drums !== "none") {
      const kicks = r.drums === "four" ? [0, 1, 2, 3] : r.drums === "broken" ? [0, 1.75, 2.5] : [0, 2];
      const snares = r.drums === "soft" ? [] : [1, 3];
      for (const k of kicks) {
        const start = Math.floor((t0 + k * beat) * sampleRate);
        for (let i = 0; i < sampleRate * 0.35; i++) {
          const t = i / sampleRate;
          const f = 45 + 110 * Math.exp(-t * 30);
          const v = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9) * (r.drums === "soft" ? 0.22 : 0.42);
          add(start + i, v, v);
        }
      }
      for (const s of snares) {
        const start = Math.floor((t0 + s * beat) * sampleRate);
        for (let i = 0; i < sampleRate * 0.22; i++) {
          const t = i / sampleRate;
          const v = ((rand() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * 190 * t) * 0.4) * Math.exp(-t * 16) * (r.drums === "broken" ? 0.13 : 0.18);
          add(start + i, v, v * 0.9);
        }
      }
      for (let h = 0; h < 8; h++) {
        const start = Math.floor((t0 + h * beat * 0.5 + (r.drums === "broken" && h % 2 ? beat * 0.08 : 0)) * sampleRate);
        let prev = 0;
        for (let i = 0; i < sampleRate * 0.05; i++) {
          const t = i / sampleRate;
          const x = rand() * 2 - 1;
          const hp = x - prev; prev = x;
          const v = hp * Math.exp(-t * 70) * (h % 2 ? 0.035 : 0.05);
          add(start + i, v * 0.8, v);
        }
      }
    }

    // Lead: Karplus-Strong pluck or a two-partial bell, on a seeded rhythm.
    if (r.lead !== "none" && b % 4 !== 3) {
      const steps = 8;
      for (let s = 0; s < steps; s++) {
        if (rand() > (r.lead === "bell" ? 0.38 : 0.55)) continue;
        const deg = chordDeg + [0, 2, 4, 7][Math.floor(rand() * 4)];
        const f = hz(degree(r, deg, 1));
        const start = Math.floor((t0 + s * beat * 0.5) * sampleRate);
        const len = Math.floor(sampleRate * (r.lead === "bell" ? 1.6 : 0.9));
        const pan = 0.5 + (rand() - 0.5) * 0.6;
        if (r.lead === "pluck") {
          const period = Math.max(2, Math.round(sampleRate / f));
          const buf = new Float32Array(period);
          for (let i = 0; i < period; i++) buf[i] = rand() * 2 - 1;
          let idx = 0;
          for (let i = 0; i < len; i++) {
            const next = (idx + 1) % period;
            const v = buf[idx];
            buf[idx] = (buf[idx] + buf[next]) * 0.4985;
            idx = next;
            add(start + i, v * 0.09 * (1 - pan + 0.5), v * 0.09 * (pan + 0.5));
          }
        } else {
          for (let i = 0; i < len; i++) {
            const t = i / sampleRate;
            const env = Math.exp(-t * 2.6) * Math.min(1, t / 0.004);
            const v = (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2.76 * t) * Math.exp(-t * 6)) * 0.06 * env;
            add(start + i, v * (1.5 - pan), v * (0.5 + pan));
          }
        }
      }
    }
  }

  // Small stereo room: two feedback delays.
  const d1 = Math.floor(sampleRate * 0.113), d2 = Math.floor(sampleRate * 0.157);
  for (let i = 0; i < n; i++) {
    if (i >= d1) L[i] += R[i - d1] * 0.22;
    if (i >= d2) R[i] += L[i - d2] * 0.2;
  }
  // Fades and a soft limiter.
  const fadeIn = sampleRate * 0.4, fadeOut = sampleRate * 2.5;
  for (let i = 0; i < n; i++) {
    let g = 1;
    if (i < fadeIn) g = i / fadeIn;
    if (n - i < fadeOut) g = Math.min(g, (n - i) / fadeOut);
    L[i] = Math.tanh(L[i] * 1.4) * 0.85 * g;
    R[i] = Math.tanh(R[i] * 1.4) * 0.85 * g;
  }
  return { left: L, right: R };
}

/** 16-bit PCM WAV bytes. */
export function toWav({ left, right }: { left: Float32Array; right: Float32Array }, sampleRate = 44100): Uint8Array {
  const n = left.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, left[i])) * 32767, true);
    v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, right[i])) * 32767, true);
  }
  return new Uint8Array(buf);
}
