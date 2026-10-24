import type { Project } from "./schema";

/** JSON with sorted keys and no undefined values, so the same project always hashes the same. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v === undefined ? null : v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

export async function sha256(data: Uint8Array | string): Promise<Uint8Array> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const buf = await globalThis.crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return new Uint8Array(buf);
}

export function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function fromHex(h: string): Uint8Array {
  const clean = h.replace(/^0x/, "");
  if (!/^[0-9a-f]*$/i.test(clean) || clean.length % 2) throw new Error("bad hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * The timeline hash covers what the picture and sound are made of, not where
 * files live on one machine: asset paths and URLs are dropped, asset content
 * hashes are kept.
 */
export async function timelineHash(p: Project): Promise<string> {
  const assets: Record<string, unknown> = {};
  for (const [id, a] of Object.entries(p.assets)) {
    assets[id] = { kind: a.kind, duration: a.duration, sha256: a.sha256 ?? null, name: a.name };
  }
  const body = canonical({ ...p, assets, markers: undefined });
  return toHex(await sha256(body));
}
