// Render one frame of a saved project through the MCP `look` tool.
//   node scripts/look-once.mjs <project.cutloupe.json> <t> <out.jpg>

import { writeFileSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const [file, t = "2", out = "look.jpg"] = process.argv.slice(2);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve("packages/mcp/bin/cutloupe.mjs")],
  env: { ...process.env, CUTLOUPE_NO_OPEN: "1" },
  stderr: "inherit",
});
const client = new Client({ name: "cutloupe-look", version: "0.0.0" });
await client.connect(transport);
const opts = { timeout: 600_000 };
await client.callTool({ name: "open_project", arguments: { path: path.resolve(file) } }, undefined, opts);
const r = await client.callTool({ name: "look", arguments: { t: Number(t), width: 1280 } }, undefined, opts);
const img = r.content.find((c) => c.type === "image");
if (!img) throw new Error(JSON.stringify(r.content));
writeFileSync(out, Buffer.from(img.data, "base64"));
console.log(r.content.find((c) => c.type === "text")?.text);
await client.close();
