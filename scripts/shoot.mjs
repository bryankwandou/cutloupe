// Screenshot pages in headless Chrome and report console errors.
//   node scripts/shoot.mjs <outDir> <url> [width] [height] [waits ms, comma separated]
// Exits 1 if the page logs an error or throws.

import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const [outDir, url, w = "1440", h = "900", waits = "1500"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const exe = process.env.CUTLOUPE_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
const page = await browser.newPage();
await page.setViewport({ width: +w, height: +h, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
let elapsed = 0;
for (const ms of waits.split(",").map(Number)) {
  await new Promise((r) => setTimeout(r, ms - elapsed));
  elapsed = ms;
  const file = path.join(outDir, `shot-${w}x${h}-${ms}.png`);
  if (process.env.FULL) {
    // Scroll through once so lazy and on-scroll content has rendered.
    await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
    await new Promise((r) => setTimeout(r, 1200));
  }
  await page.screenshot({ path: file, fullPage: !!process.env.FULL });
  console.log(file);
}
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
console.log(`horizontal overflow: ${overflow}px`);
console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no console errors");
await browser.close();
process.exit(errors.length ? 1 : 0);
