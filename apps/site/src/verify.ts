// Check a file's seal on devnet from the browser: hash it locally, derive the
// Seal PDA ["seal", sha256] the same way the program does, and read the
// account over JSON-RPC. Only the hash leaves the page.

import { ed25519 } from "@noble/curves/ed25519";

export const PROGRAM_ID = "G6kWfHR1X2tHFgwHvrc5soiXwUF4bYXprv7YMTJnx5eY";
const RPC = "https://api.devnet.solana.com";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function b58encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = "";
  while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = "1" + out; }
  return out;
}

export function b58decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) { const i = B58.indexOf(c); if (i < 0) throw new Error("bad base58"); n = n * 58n + BigInt(i); }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of s) { if (c !== "1") break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}

const hexOf = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const fromHex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));

async function sha256(data: BufferSource): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

function onCurve(b: Uint8Array): boolean {
  try { ed25519.ExtendedPoint.fromHex(b); return true; } catch { return false; }
}

/** Same as PublicKey.findProgramAddressSync. */
export async function findPda(seeds: Uint8Array[], program: string): Promise<string> {
  const pid = b58decode(program);
  const tag = new TextEncoder().encode("ProgramDerivedAddress");
  for (let bump = 255; bump >= 0; bump--) {
    const parts = [...seeds, Uint8Array.of(bump), pid, tag];
    const buf = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) { buf.set(p, o); o += p.length; }
    const h = await sha256(buf);
    if (!onCurve(h)) return b58encode(h);
  }
  throw new Error("no bump");
}

export interface Seal { seal: string; reel: string; authority: string; file: string; timeline: string; version: number; flags: number; durationMs: number; sealedAt: number }

export async function hashFile(file: Blob): Promise<string> {
  return hexOf(await sha256(await file.arrayBuffer()));
}

export async function lookupSeal(fileSha: string): Promise<Seal | null> {
  const seal = await findPda([new TextEncoder().encode("seal"), fromHex(fileSha)], PROGRAM_ID);
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [seal, { encoding: "base64", commitment: "confirmed" }] }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  const v = j.result?.value;
  if (!v) return null;
  const d = Uint8Array.from(atob(v.data[0]), (c) => c.charCodeAt(0));
  const dv = new DataView(d.buffer);
  // 8 discriminator | reel 32 | authority 32 | file 32 | timeline 32 | version u32 | flags u8 | duration u32 | sealed_at i64
  return {
    seal,
    reel: b58encode(d.subarray(8, 40)),
    authority: b58encode(d.subarray(40, 72)),
    file: hexOf(d.subarray(72, 104)),
    timeline: hexOf(d.subarray(104, 136)),
    version: dv.getUint32(136, true),
    flags: d[140],
    durationMs: dv.getUint32(141, true),
    sealedAt: Number(dv.getBigInt64(145, true)),
  };
}

export function flagNames(f: number): string[] {
  const out: string[] = [];
  if (f & 1) out.push("ai-edited");
  if (f & 2) out.push("ai-generated-media");
  if (f & 4) out.push("synthetic-voice");
  if (f & 8) out.push("licensed-music");
  return out;
}
