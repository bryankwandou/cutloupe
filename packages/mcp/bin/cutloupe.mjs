#!/usr/bin/env node
// cutloupe          MCP server on stdio + live studio (what an agent client runs)
// cutloupe studio   studio only, opens the browser (no MCP)
const arg = process.argv[2];
if (arg === "--help" || arg === "-h") {
  console.log(`cutloupe ${"0.1.0"}: a video editor your agent can see

  cutloupe            run the MCP server (stdio) and the live studio
  cutloupe studio     run only the studio and open it in the browser

Add to Claude Code:   claude mcp add cutloupe -- npx -y cutloupe
Environment:
  CUTLOUPE_PORT       studio port (default 4321, next free one is used)
  CUTLOUPE_HOME       projects, music and exports (default ~/.cutloupe)
  CUTLOUPE_NO_OPEN=1  never open the browser automatically
  CUTLOUPE_CHROME     Chrome/Edge executable used for rendering
  CUTLOUPE_KEYPAIR    Solana keypair file, turns on the devnet edit ledger`);
  process.exit(0);
}
const { main } = await import("../dist/server.mjs");
await main({ stdio: arg !== "studio", open: arg === "studio" });
