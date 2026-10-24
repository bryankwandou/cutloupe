// Messages between the MCP server and the studio page, over one WebSocket.

import type { Op } from "./ops";
import type { Project } from "./schema";

export type ActivityKind = "op" | "look" | "export" | "ledger" | "note";

export interface Activity {
  id: number;
  actor: "agent" | "human";
  kind: ActivityKind;
  text: string;
  at: number; // epoch ms
  clipIds: string[];
  /** For "look": the times the agent rendered. */
  times?: number[];
}

export interface MusicEntry {
  id: string;
  name: string;
  mood: string;
  bpm: number;
  seconds: number;
  src: string;
  license: string;
}

export interface LedgerInfo {
  cluster: string;
  programId: string;
  reel?: string;
  version?: number;
  head?: string;
  lastSignature?: string;
}

export type ServerMsg =
  | { type: "hello"; project: Project; activity: Activity[]; music: MusicEntry[]; hash: string; canUndo: boolean; canRedo: boolean; ledger?: LedgerInfo }
  | { type: "state"; project: Project; hash: string; activity?: Activity; canUndo: boolean; canRedo: boolean }
  | { type: "activity"; activity: Activity }
  | { type: "ledger"; ledger: LedgerInfo }
  | { type: "error"; message: string };

export type ClientMsg =
  | { type: "ops"; ops: Op[]; label?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "export"; format: string };

export function clipIdsOf(ops: Op[]): string[] {
  const ids: string[] = [];
  for (const o of ops) {
    if (o.op === "add_clip") ids.push(o.clip.id);
    else if ("clipId" in o) ids.push(o.clipId);
    if (o.op === "split_clip") ids.push(o.newId);
  }
  return ids;
}
