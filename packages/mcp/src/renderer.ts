// A headless Chrome page running the studio in render mode. `look` and MP4
// export both go through it, so the agent sees exactly what the export will be.

import { existsSync } from "node:fs";
import path from "node:path";
import type { Project } from "@cutloupe/core";
import type { Browser, Page } from "puppeteer-core";

function findBrowser(): string {
  const env = process.env.CUTLOUPE_CHROME || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (env && existsSync(env)) return env;
  const pf = process.env["PROGRAMFILES"] || "C:\\Program Files";
  const pf86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
  const local = process.env.LOCALAPPDATA || "";
  const candidates = [
    path.join(pf, "Google/Chrome/Application/chrome.exe"),
    path.join(pf86, "Google/Chrome/Application/chrome.exe"),
    path.join(local, "Google/Chrome/Application/chrome.exe"),
    path.join(pf86, "Microsoft/Edge/Application/msedge.exe"),
    path.join(pf, "Microsoft/Edge/Application/msedge.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  const hit = candidates.find((c) => existsSync(c));
  if (!hit) throw new Error("No Chrome or Edge found. Install Chrome, or set CUTLOUPE_CHROME to a Chromium-based browser executable.");
  return hit;
}

export class Renderer {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private loadedKey = "";
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private baseUrl: () => string) {}

  private async ensure(): Promise<Page> {
    if (this.page && !this.page.isClosed() && this.browser?.connected) return this.page;
    // Loaded on first render rather than at startup; it is slow to import.
    const { default: puppeteer } = await import("puppeteer-core");
    this.browser = await puppeteer.launch({
      executablePath: findBrowser(),
      headless: true,
      args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio", "--hide-scrollbars", "--disable-background-timer-throttling"],
    });
    try {
      const page = await this.browser.newPage();
      await page.setViewport({ width: 800, height: 600 });
      // A cold start on a slow or busy disk can take well over 30 s.
      await page.goto(`${this.baseUrl()}/?render=1`, { waitUntil: "load", timeout: 120_000 });
      await page.waitForFunction("window.__cutloupe && window.__cutloupe.ready", { timeout: 60_000 });
      this.page = page;
    } catch (e) {
      // never hand a half-loaded page to the next call
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.page = null;
      throw e;
    }
    this.loadedKey = "";
    return this.page;
  }

  /** Serialise all render work: one page, one frame at a time. */
  private run<T>(job: (page: Page) => Promise<T>): Promise<T> {
    const next = this.queue.then(async () => job(await this.ensure()));
    this.queue = next.catch(() => {});
    return next;
  }

  private async load(page: Page, p: Project) {
    const key = JSON.stringify(p);
    if (key === this.loadedKey) return;
    await page.evaluate((proj) => (window as any).__cutloupe.load(proj), p as any);
    this.loadedKey = key;
  }

  frame(p: Project, t: number, maxWidth = 960, type: "png" | "jpeg" = "jpeg"): Promise<Buffer> {
    return this.run(async (page) => {
      await this.load(page, p);
      const url = (await page.evaluate((tt, mw, ty) => (window as any).__cutloupe.frame(tt, { maxWidth: mw, type: ty, quality: 0.86 }), t, maxWidth, type)) as string;
      return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    });
  }

  sheet(p: Project, times: number[], cellWidth = 480): Promise<Buffer> {
    return this.run(async (page) => {
      await this.load(page, p);
      const url = (await page.evaluate((ts, cw) => (window as any).__cutloupe.sheet(ts, { cellWidth: cw }), times, cellWidth)) as string;
      return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    });
  }

  /** Full-resolution JPEG frames in batches, handed to `sink` in order. */
  frames(p: Project, times: number[], sink: (jpeg: Buffer, index: number) => Promise<void> | void, onProgress?: (done: number) => void): Promise<void> {
    return this.run(async (page) => {
      await this.load(page, p);
      const batch = 8;
      for (let i = 0; i < times.length; i += batch) {
        const urls = (await page.evaluate((ts) => (window as any).__cutloupe.frames(ts, { type: "jpeg", quality: 0.92 }), times.slice(i, i + batch))) as string[];
        for (let k = 0; k < urls.length; k++) await sink(Buffer.from(urls[k].slice(urls[k].indexOf(",") + 1), "base64"), i + k);
        onProgress?.(Math.min(times.length, i + batch));
      }
    });
  }

  async close() {
    await this.browser?.close().catch(() => {});
    this.browser = null;
    this.page = null;
  }
}
