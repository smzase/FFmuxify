// Startup-only native checks: no media, clipboard, or user configuration is touched.
import { chromium, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const executable = path.resolve("src-tauri/target/release/ffmuxify.exe");
const root = path.resolve(".qa", "startup-" + Date.now());
const processList = execFileSync("tasklist", ["/FI", "IMAGENAME eq ffmuxify.exe", "/FO", "CSV", "/NH"], { windowsHide: true, encoding: "utf8" });
assert(!processList.toLowerCase().includes('"ffmuxify.exe"'), "Close FFmuxify before running native startup tests; an existing instance must not be disturbed.");
mkdirSync(root, { recursive: true });
const results = [];

for (const [index, theme] of ["light", "dark"].entries()) {
  const config = path.join(root, theme);
  const maximized = theme === "dark";
  mkdirSync(config);
  writeFileSync(path.join(config, "app_settings.json"), JSON.stringify({
    close_behavior: "tray", theme_mode: theme,
    window_geometry: [40, 40, 1100, 800], window_maximized: maximized,
  }));
  writeFileSync(path.join(config, "profiles.json"), "{}");
  const port = 9247 + index;
  const env = { ...process.env, FFMUXIFY_CONFIG_DIR: config, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` };
  const launch = () => spawn(executable, [], { windowsHide: true, env, stdio: "ignore" });
  const child = launch();
  let browser, second, page;
  try {
    let connected = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      assert(child.exitCode === null, "Test instance exited before startup");
      try {
        await fetch(`http://127.0.0.1:${port}/json/version`).then(response => response.json());
        connected = true;
        break;
      } catch { await delay(100); }
    }
    assert(connected, "WebView2 debugging endpoint did not start");
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    page = context.pages()[0] ?? await context.waitForEvent("page");
    await expect(page.getByRole("button", { name: "新建配置", exact: true })).toBeVisible();
    const invoke = (cmd, args = {}) => page.evaluate(({ cmd, args }) => window.__TAURI_INTERNALS__.invoke(cmd, args), { cmd, args });
    const windowState = cmd => invoke("plugin:window|" + cmd, { label: "main" });
    await expect.poll(() => windowState("is_visible")).toBe(true);
    assert.equal(await windowState("is_maximized"), maximized);
    assert.equal(await windowState("theme"), theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("body")).toHaveCSS("background-color", theme === "dark" ? "rgb(25, 26, 27)" : "rgb(250, 250, 250)");
    await page.screenshot({ path: path.join(root, theme + "-startup.png"), animations: "disabled" });

    // A duplicate frontend signal must not undo the user's choice to hide to tray.
    await invoke("finish_close", { exit: false });
    await expect.poll(() => windowState("is_visible")).toBe(false);
    await invoke("frontend_ready");
    assert.equal(await windowState("is_visible"), false);
    second = launch();
    await expect.poll(() => windowState("is_visible")).toBe(true);
    await expect.poll(() => second.exitCode).not.toBeNull();
    await expect(page.getByRole("button", { name: "新建配置", exact: true })).toBeVisible();
    results.push({ theme, maximized, visible: true, repeatedReadyKeepsHidden: true, secondLaunchRestores: true });
    await invoke("finish_close", { exit: true }).catch(() => {});
    await expect.poll(() => child.exitCode).not.toBeNull();
  } finally {
    await browser?.close().catch(() => {});
    if (second && second.exitCode === null) second.kill();
    if (child.exitCode === null) child.kill();
  }
}
console.log(JSON.stringify({ root, results }, null, 2));
