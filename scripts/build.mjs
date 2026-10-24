// Builds the studio bundle (used by the MCP server and by the website demo)
// and the MCP server bundle.
import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const r = (...p) => path.join(root, ...p);

const studioOut = r("packages/studio/dist");
await rm(studioOut, { recursive: true, force: true });
await build({
  entryPoints: { app: r("packages/studio/src/main.ts") },
  bundle: true, format: "esm", target: "es2022", minify: true, sourcemap: false,
  outdir: studioOut, loader: { ".woff2": "file", ".woff": "file" }, assetNames: "fonts/[name]-[hash]",
  logLevel: "warning",
});
const html = (demo) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Cutloupe Studio</title>
<meta name="description" content="A video editor your agent can see." />
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#0e0f11"/><circle cx="10" cy="10" r="5.5" fill="none" stroke="#ecedee" stroke-width="2"/><path d="M14 14l5 5" stroke="#ecedee" stroke-width="2.4" stroke-linecap="round"/><path d="M8 10h4M10 8v4" stroke="#ffb224" stroke-width="1.6" stroke-linecap="round"/></svg>')}" />
<link rel="stylesheet" href="./app.css" />
${demo ? "<script>window.CUTLOUPE_DEMO = true</script>" : ""}
</head>
<body><script type="module" src="./app.js"></script></body>
</html>
`;
await writeFile(path.join(studioOut, "index.html"), html(false));

// The MCP package serves its own copy of the studio.
await rm(r("packages/mcp/studio"), { recursive: true, force: true });
await cp(studioOut, r("packages/mcp/studio"), { recursive: true });

// The website gets a demo-mode copy.
await rm(r("site/studio"), { recursive: true, force: true });
await cp(studioOut, r("site/studio"), { recursive: true });
await writeFile(r("site/studio/index.html"), html(true));

await build({
  entryPoints: [r("packages/mcp/src/server.ts")],
  bundle: true, platform: "node", format: "esm", target: "node20",
  outfile: r("packages/mcp/dist/server.mjs"),
  external: ["@modelcontextprotocol/sdk", "@solana/web3.js", "puppeteer-core", "ws", "zod"],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});
// The landing page: apps/site -> site/ (static, deployable as is).
await rm(r("site/assets"), { recursive: true, force: true });
await build({
  entryPoints: { main: r("apps/site/src/main.ts") },
  bundle: true, format: "esm", target: "es2022", minify: true, sourcemap: false,
  outdir: r("site/assets"), loader: { ".woff2": "file", ".woff": "file" }, assetNames: "fonts/[name]-[hash]",
  logLevel: "warning",
});
await cp(r("apps/site/public"), r("site"), { recursive: true });
await cp(r("apps/site/index.html"), r("site/index.html"));

// Bundle core for the tests.
await build({ entryPoints: [r("packages/core/src/index.ts")], bundle: true, platform: "neutral", format: "esm", outfile: r("packages/core/dist/index.mjs"), logLevel: "warning" });
console.log("built studio, site, mcp server, core");
