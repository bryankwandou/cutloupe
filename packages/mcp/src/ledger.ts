// Client for the cutloupe_ledger Anchor program on Solana devnet. Optional:
// it only runs when CUTLOUPE_KEYPAIR points at a keypair file.
//
// open_reel   creates the Reel PDA  ["reel", authority, reel_id]
// commit_cut  moves the reel head from prev to next (fails with StaleHead if prev is old)
// seal_export creates a Seal PDA    ["seal", file_sha256], only for the current head
//
// @solana/web3.js is loaded on first use, not at startup: it is large and most
// sessions never touch the ledger.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Connection, Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";

type Web3 = typeof import("@solana/web3.js");

export const PROGRAM_ID = process.env.CUTLOUPE_PROGRAM_ID || "G6kWfHR1X2tHFgwHvrc5soiXwUF4bYXprv7YMTJnx5eY";
export const CLUSTER = process.env.CUTLOUPE_RPC || "https://api.devnet.solana.com";

export const FLAGS = { aiEdited: 1, aiGeneratedMedia: 2, syntheticVoice: 4, licensedMusic: 8 } as const;
export const ACTOR = { human: 0, agent: 1, mixed: 2 } as const;

const disc = (name: string) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
const hex = (h: string) => Buffer.from(h.replace(/^0x/, ""), "hex");

export interface ReelState {
  address: string;
  authority: string;
  version: number;
  exports: number;
  head: string;
}

export class Ledger {
  readonly conn: Connection;
  readonly payer: Keypair;
  private readonly program: PublicKey;
  private readonly w3: Web3;

  // Plain fields, no parameter properties: scripts load this file with
  // Node's type stripping, which does not support them.
  private constructor(w3: Web3, keypairPath: string) {
    this.w3 = w3;
    const raw = readFileSync(keypairPath, "utf8").replace(/^﻿/, "");
    this.payer = w3.Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    this.conn = new w3.Connection(CLUSTER, "confirmed");
    this.program = new w3.PublicKey(PROGRAM_ID);
  }

  static enabled(): boolean {
    return !!process.env.CUTLOUPE_KEYPAIR;
  }

  static async fromEnv(): Promise<Ledger | null> {
    const p = process.env.CUTLOUPE_KEYPAIR;
    if (!p) return null;
    return new Ledger(await import("@solana/web3.js"), p);
  }

  reelId(projectId: string): Buffer {
    return createHash("sha256").update(projectId).digest().subarray(0, 16);
  }

  reelPda(projectId: string): PublicKey {
    return this.w3.PublicKey.findProgramAddressSync([Buffer.from("reel"), this.payer.publicKey.toBuffer(), this.reelId(projectId)], this.program)[0];
  }

  sealPda(fileSha256: string): PublicKey {
    return this.w3.PublicKey.findProgramAddressSync([Buffer.from("seal"), hex(fileSha256)], this.program)[0];
  }

  async reel(projectId: string): Promise<ReelState | null> {
    const addr = this.reelPda(projectId);
    const info = await this.conn.getAccountInfo(addr);
    if (!info) return null;
    const d = info.data;
    // 8 discriminator | authority 32 | reel_id 16 | title_hash 32 | head 32 | version u32 | exports u32 | ...
    return {
      address: addr.toBase58(),
      authority: new this.w3.PublicKey(d.subarray(8, 40)).toBase58(),
      head: d.subarray(88, 120).toString("hex"),
      version: d.readUInt32LE(120),
      exports: d.readUInt32LE(124),
    };
  }

  private async send(ix: TransactionInstruction): Promise<string> {
    return this.w3.sendAndConfirmTransaction(this.conn, new this.w3.Transaction().add(ix), [this.payer], { commitment: "confirmed" });
  }

  private ix(keys: [PublicKey, boolean, boolean][], data: Buffer): TransactionInstruction {
    return new this.w3.TransactionInstruction({
      programId: this.program,
      keys: keys.map(([pubkey, isSigner, isWritable]) => ({ pubkey, isSigner, isWritable })),
      data,
    });
  }

  async openReel(projectId: string, title: string): Promise<string> {
    const data = Buffer.concat([disc("open_reel"), this.reelId(projectId), createHash("sha256").update(title).digest()]);
    return this.send(this.ix([
      [this.reelPda(projectId), false, true],
      [this.payer.publicKey, true, true],
      [this.w3.SystemProgram.programId, false, false],
    ], data));
  }

  async commitCut(projectId: string, prev: string, next: string, ops: number, actor: number): Promise<string> {
    const n = Buffer.alloc(5);
    n.writeUInt32LE(ops >>> 0, 0);
    n.writeUInt8(actor, 4);
    const data = Buffer.concat([disc("commit_cut"), hex(prev), hex(next), n]);
    return this.send(this.ix([
      [this.reelPda(projectId), false, true],
      [this.payer.publicKey, true, false],
    ], data));
  }

  async sealExport(projectId: string, fileSha256: string, timelineHash: string, flags: number, durationMs: number): Promise<string> {
    const tail = Buffer.alloc(5);
    tail.writeUInt8(flags, 0);
    tail.writeUInt32LE(durationMs >>> 0, 1);
    const data = Buffer.concat([disc("seal_export"), hex(fileSha256), hex(timelineHash), tail]);
    return this.send(this.ix([
      [this.reelPda(projectId), false, true],
      [this.sealPda(fileSha256), false, true],
      [this.payer.publicKey, true, true],
      [this.w3.SystemProgram.programId, false, false],
    ], data));
  }

  /** Make the on-chain head equal `hash`, opening the reel first if needed. */
  async commitHead(projectId: string, title: string, hash: string, ops: number, actor: number): Promise<{ reel: ReelState; signatures: string[] }> {
    const sigs: string[] = [];
    let r = await this.reel(projectId);
    if (!r) {
      sigs.push(await this.openReel(projectId, title));
      r = await this.reel(projectId);
    }
    if (r && r.head !== hash) sigs.push(await this.commitCut(projectId, r.head, hash, ops, actor));
    return { reel: (await this.reel(projectId))!, signatures: sigs };
  }

  async verify(fileSha256: string): Promise<null | { seal: string; reel: string; timelineHash: string; version: number; flags: number; durationMs: number; sealedAt: number }> {
    const addr = this.sealPda(fileSha256);
    const info = await this.conn.getAccountInfo(addr);
    if (!info) return null;
    const d = info.data;
    // 8 | reel 32 | authority 32 | file 32 | timeline 32 | version u32 | flags u8 | duration u32 | sealed_at i64
    return {
      seal: addr.toBase58(),
      reel: new this.w3.PublicKey(d.subarray(8, 40)).toBase58(),
      timelineHash: d.subarray(104, 136).toString("hex"),
      version: d.readUInt32LE(136),
      flags: d.readUInt8(140),
      durationMs: d.readUInt32LE(141),
      sealedAt: Number(d.readBigInt64LE(145)),
    };
  }
}

export const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
