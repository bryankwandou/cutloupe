// Devnet checks for the cutloupe_ledger program, success and failure paths.
//   CUTLOUPE_KEYPAIR=<devnet keypair.json> node scripts/ledger-checks.mjs
// Prints signatures and a JSON summary. Never prints the key.

import { createHash, randomBytes } from "node:crypto";
import { Ledger, explorer } from "../packages/mcp/src/ledger.ts";

const ledger = await Ledger.fromEnv();
if (!ledger) { console.error("set CUTLOUPE_KEYPAIR"); process.exit(2); }
const h = (s) => createHash("sha256").update(s).digest("hex");
const project = `ledger_check_${randomBytes(4).toString("hex")}`;
const A = h(`${project}:a`), B = h(`${project}:b`), FILE = h(`${project}:file`);
const results = [];
let failed = 0;

async function expectOk(name, fn) {
  try { const sig = await fn(); results.push({ name, ok: true, sig }); console.log(`ok    ${name}  ${Array.isArray(sig) ? sig.map(explorer).join(" ") : explorer(sig)}`); }
  catch (e) { failed++; results.push({ name, ok: false, error: String(e.message).slice(0, 300) }); console.log(`FAIL  ${name}  ${e.message}`); }
}
async function expectErr(name, code, fn) {
  try { const sig = await fn(); failed++; results.push({ name, ok: false, unexpected: sig }); console.log(`FAIL  ${name} succeeded but should have failed with ${code}`); }
  catch (e) {
    const logs = (e.logs || e.transactionLogs || []).join("\n") + String(e.message);
    const hit = logs.includes(code);
    if (!hit) failed++;
    results.push({ name, ok: hit, rejectedWith: hit ? code : logs.slice(0, 300) });
    console.log(`${hit ? "ok   " : "FAIL "} ${name}  rejected${hit ? ` with ${code}` : `: ${logs.slice(0, 200)}`}`);
  }
}

console.log(`payer ${ledger.payer.publicKey.toBase58()}  project ${project}`);
await expectOk("open_reel + commit_cut to A", async () => (await ledger.commitHead(project, "ledger check", A, 3, 1)).signatures);
await expectErr("commit_cut with a stale prev", "StaleHead", () => ledger.commitCut(project, B, h("c"), 1, 1));
await expectErr("commit_cut to the same head", "NoChange", () => ledger.commitCut(project, A, A, 1, 1));
await expectErr("seal_export against a timeline that is not the head", "NotHead", () => ledger.sealExport(project, FILE, B, 1, 5000));
await expectOk("seal_export against the head", () => ledger.sealExport(project, FILE, A, 1 | 2, 5000));
await expectErr("seal the same file twice", "already in use", () => ledger.sealExport(project, FILE, A, 1, 5000));
await expectOk("commit_cut A -> B (human edit)", () => ledger.commitCut(project, A, B, 2, 0));
const reel = await ledger.reel(project);
const seal = await ledger.verify(FILE);
console.log(JSON.stringify({ project, reel, seal, failed }, null, 2));
process.exit(failed ? 1 : 0);
