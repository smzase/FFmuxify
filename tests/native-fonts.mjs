// Validate real Windows font enumeration and persistence against disposable settings.
import { chromium, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const processes = execFileSync("tasklist", ["/FI", "IMAGENAME eq ffmuxify.exe", "/FO", "CSV", "/NH"], { windowsHide: true, encoding: "utf8" });
assert(!processes.toLowerCase().includes('"ffmuxify.exe"'), "Close FFmuxify before native font testing; never attach to a user's instance.");
const root = path.resolve(".qa", "fonts-" + Date.now());
mkdirSync(root, { recursive: true });
writeFileSync(path.join(root, "app_settings.json"), JSON.stringify({ close_behavior: "exit", theme_mode: "dark", window_geometry: [40, 40, 1100, 800] }));
writeFileSync(path.join(root, "profiles.json"), "{}");
const results = [];
for (const phase of ["select", "restart"]) {
  const child = spawn(path.resolve("src-tauri/target/release/ffmuxify.exe"), [], {
    windowsHide: true, stdio: "ignore",
    env: { ...process.env, FFMUXIFY_CONFIG_DIR: root, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9249" },
  });
  let browser;
  try {
    let connected = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      assert(child.exitCode === null, "Test EXE exited before initialization");
      try { await fetch("http://127.0.0.1:9249/json/version").then(r => r.json()); connected = true; break; }
      catch { await delay(100); }
    }
    assert(connected, "WebView2 endpoint unavailable");
    browser = await chromium.connectOverCDP("http://127.0.0.1:9249");
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? await context.waitForEvent("page");
    await expect(page.getByRole("button", { name: "全局设置" })).toBeVisible();
    if (phase === "select") {
      const started = performance.now();
      const fonts = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("list_fonts"));
      const firstReadMs = Math.round(performance.now() - started);
      assert(fonts.length > 0);
      assert(fonts.some(font => font.family === "Consolas"));
      assert.equal(new Set(fonts.map(font => font.family.toLowerCase())).size, fonts.length);
      const cacheStarted = performance.now();
      const cached = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("list_fonts"));
      assert.deepEqual(cached, fonts);
      const cachedReadMs = Math.round(performance.now() - cacheStarted);
      await page.getByRole("button", { name: "全局设置" }).click();
      await page.getByRole("combobox", { name: "字体", exact: true }).click();
      await expect(page.locator(".font-list-footer")).toHaveText("可选字体：" + (fonts.length + 1));
      assert(await page.getByRole("option").count() < 25);
      await page.getByRole("combobox", { name: "搜索字体" }).fill("Consolas");
      await page.getByRole("option", { name: "Consolas", exact: true }).click();
      await page.getByRole("button", { name: "确定", exact: true }).click();
      await expect(page.locator("body")).toHaveCSS("font-family", /^Consolas/);
      await expect.poll(() => JSON.parse(readFileSync(path.join(root, "app_settings.json"), "utf8")).font_family).toBe("Consolas");
      results.push({ fonts: fonts.length, firstReadMs, cachedReadMs, persisted: true });
    } else {
      await expect(page.locator("body")).toHaveCSS("font-family", /^Consolas/);
      await page.getByRole("button", { name: "全局设置" }).click();
      await expect(page.getByRole("combobox", { name: "字体", exact: true })).toContainText("Consolas");
      await page.getByRole("combobox", { name: "字体", exact: true }).click();
      await page.getByRole("combobox", { name: "搜索字体" }).fill("微软雅黑");
      await expect(page.getByRole("option")).not.toHaveCount(0);
      await page.screenshot({ path: path.join(root, "native-fonts-dark.png"), animations: "disabled" });
      results.push({ restartRestored: true, localizedSearch: true });
    }
    await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("finish_close", { exit: true })).catch(() => {});
    await expect.poll(() => child.exitCode).not.toBeNull();
  } finally {
    await browser?.close().catch(() => {});
    if (child.exitCode === null) child.kill();
  }
}
console.log(JSON.stringify({ root, results }, null, 2));
