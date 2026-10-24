// Screenshot each landing-page section at viewport size, and report page
// errors, horizontal overflow and any .reveal element that never revealed.
//   node scripts/shoot-sections.mjs <outDir> <baseUrl> [width] [height] [lang]

import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const [outDir, base, w = "1440", h = "900", lang = "en"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CUTLOUPE_CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, args: ["--mute-audio"] });
const page = await browser.newPage();
await page.setViewport({ width: +w, height: +h });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text() + " " + (m.location()?.url ?? "")); });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("requestfailed", (r) => errors.push(`request failed ${r.url()}`));
page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
await page.goto(`${base}/?lang=${lang}`, { waitUntil: "networkidle2", timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: path.join(outDir, `${lang}-${w}-00-hero.png`) });
const ids = await page.$$eval("main > section[id]", (s) => s.map((x) => x.id));
let i = 1;
for (const id of ids) {
  await page.evaluate((s) => document.getElementById(s).scrollIntoView({ block: "start" }), id);
  await new Promise((r) => setTimeout(r, 1300));
  await page.screenshot({ path: path.join(outDir, `${lang}-${w}-${String(i++).padStart(2, "0")}-${id}.png`) });
}
const report = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - innerWidth,
  hidden: Array.from(document.querySelectorAll(".reveal:not(.in)")).map((e) => e.id || e.className),
  wide: Array.from(document.querySelectorAll("body *")).filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest(".table-wrap, pre, .ruler")).slice(0, 8).map((e) => `${e.tagName}.${e.className}`),
}));
console.log(JSON.stringify(report));
console.log(errors.length ? `errors:\n${errors.join("\n")}` : "no errors");
await browser.close();
