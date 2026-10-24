// One editing session: the current project, undo/redo, and the activity log.
// The MCP server runs one of these; the studio's offline demo runs another.

import { type Op, applyOp, describeOp } from "./ops";
import { type Activity, type ActivityKind, clipIdsOf } from "./protocol";
import type { Project } from "./schema";

export class Session {
  project: Project;
  activity: Activity[] = [];
  private undoStack: Project[] = [];
  private redoStack: Project[] = [];
  private seq = 0;
  /** Count of ops applied since the last ledger commit, by actor. */
  pending = { agent: 0, human: 0 };

  constructor(project: Project) {
    this.project = project;
  }

  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }

  /** Apply ops as one undoable step. All or nothing: if any op fails, nothing changes. */
  apply(ops: Op[], actor: "agent" | "human", label?: string): Activity {
    let next = this.project;
    for (const op of ops) next = applyOp(next, op);
    this.undoStack.push(this.project);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    const before = this.project;
    this.project = next;
    this.pending[actor] += ops.length;
    const text = label ?? (ops.length === 1 ? describeOp(ops[0], before) : `${ops.length} edits: ${ops.slice(0, 3).map((o) => describeOp(o, before)).join("; ")}${ops.length > 3 ? "; ..." : ""}`);
    return this.log(actor, "op", text, clipIdsOf(ops));
  }

  undo(actor: "agent" | "human"): Activity | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(this.project);
    this.project = prev;
    this.pending[actor]++;
    return this.log(actor, "op", "Undo", []);
  }

  redo(actor: "agent" | "human"): Activity | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(this.project);
    this.project = next;
    this.pending[actor]++;
    return this.log(actor, "op", "Redo", []);
  }

  replace(project: Project, actor: "agent" | "human", text: string): Activity {
    this.undoStack.push(this.project);
    this.redoStack = [];
    this.project = project;
    return this.log(actor, "op", text, []);
  }

  log(actor: "agent" | "human", kind: ActivityKind, text: string, clipIds: string[] = [], times?: number[]): Activity {
    const a: Activity = { id: ++this.seq, actor, kind, text, at: Date.now(), clipIds, times };
    this.activity.push(a);
    if (this.activity.length > 400) this.activity.shift();
    return a;
  }
}
