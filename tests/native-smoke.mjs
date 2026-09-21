// Run the built EXE against disposable profiles and generated media only.
import { chromium, expect } from "@playwright/test";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { once } from "node:events";
import assert from "node:assert/strict";

const root = path.resolve(".qa", "native-" + Date.now());
const config = path.join(root, "config");
const media = path.join(root, "media");
mkdirSync(config, { recursive: true });
mkdirSync(media, { recursive: true });
writeFileSync(path.join(config, "app_settings.json"), JSON.stringify({ close_behavior: "exit", theme_mode: "light" }));
writeFileSync(path.join(config, "profiles.json"), "{}");
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=24", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(media, "source.mkv")], { windowsHide: true });
const child = spawn(path.resolve("src-tauri/target/release/ffmuxify.exe"), [], {
  windowsHide: true,
  env: { ...process.env, FFMUXIFY_CONFIG_DIR: config, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9227" },
  stdio: "ignore",
});
let browser, page, clipboardBefore;
try {
  let endpoint;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { endpoint = await (await fetch("http://127.0.0.1:9227/json/version")).json(); break; } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  assert(endpoint, "WebView2 debugging endpoint did not start");
  browser = await chromium.connectOverCDP("http://127.0.0.1:9227");
  const context = browser.contexts()[0];
  page = context.pages()[0] ?? await context.waitForEvent("page");
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await expect(page.getByRole("button", { name: "新建配置" })).toBeVisible();
  await page.bringToFront();
  clipboardBefore = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:clipboard-manager|read_text"));
  await page.getByRole("button", { name: "新建配置" }).click();
  await page.getByLabel("配置名称", { exact: true }).fill("本地回归");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  const nameField = page.getByLabel("源视频目录", { exact: true });
  await nameField.fill("clipboard check");
  await nameField.press("Control+a");
  await nameField.click({ button: "right" });
  await page.getByRole("menuitem", { name: /剪切/ }).click();
  await expect(nameField).toHaveValue("");
  await nameField.click({ button: "right" });
  await page.getByRole("menuitem", { name: /粘贴/ }).click();
  await expect(nameField).toHaveValue("clipboard check");
  await nameField.click({ button: "right" });
  await page.getByRole("menuitem", { name: /撤销/ }).click();
  await expect(nameField).toHaveValue("");
  await page.evaluate(text => window.__TAURI_INTERNALS__.invoke("plugin:clipboard-manager|write_text", { text }), clipboardBefore);
  await page.getByRole("radio", { name: "无字幕", exact: true }).click();
  await page.getByLabel("源视频目录", { exact: true }).fill(media);
  await page.getByLabel("源视频文件", { exact: true }).fill("source.mkv");
  await page.getByLabel("输出目录", { exact: true }).fill(media);
  await page.getByLabel("输出名称", { exact: true }).fill("result-<ep>.mp4");
  await page.getByLabel("CRF / 单次参数", { exact: true }).fill("-c:v libx264 -preset ultrafast -crf 28 -an");
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  await page.getByRole("button", { name: "开始压制", exact: true }).click();
  await expect(page.locator(".queue-item.done")).toHaveCount(1, { timeout: 30000 });
  assert(existsSync(path.join(media, "result-01.mp4")));
  await expect(page.getByLabel("集数", { exact: true })).toHaveValue("02");
  await page.getByLabel("启用 2-Pass Mode", { exact: true }).check();
  await page.getByLabel("Pass 1 参数", { exact: true }).fill("-c:v libx264 -preset ultrafast -b:v 200k -passlogfile ffmpeg2pass -an -f null NUL");
  await page.getByLabel("Pass 2 参数", { exact: true }).fill("-c:v libx264 -preset ultrafast -b:v 200k -an");
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  await page.getByRole("button", { name: "开始压制", exact: true }).click();
  await expect(page.locator(".queue-item.done")).toHaveCount(2, { timeout: 30000 });
  assert(existsSync(path.join(media, "result-02.mp4")));
  await expect(page.getByLabel("集数", { exact: true })).toHaveValue("03");
  assert(!existsSync(path.join(media, "ffmpeg2pass-0.log")));
  await page.getByLabel("启用 2-Pass Mode", { exact: true }).uncheck();
  await page.getByLabel("CRF / 单次参数", { exact: true }).fill("-vf realtime=speed=0.2 -c:v libx264 -preset ultrafast -crf 28 -an");
  await page.getByRole("button", { name: "添加任务", exact: true }).click();
  await page.getByRole("button", { name: "开始压制", exact: true }).click();
  await expect(page.locator(".queue-item.running")).toHaveCount(1);
  await expect.poll(() => existsSync(path.join(media, "result-03.mp4")), { timeout: 10000 }).toBeTruthy();
  await expect.poll(async () => Number(await page.locator(".metric").filter({ hasText: "FPS" }).locator("strong").innerText()), { timeout: 10000 }).toBeGreaterThan(0);
  await expect.poll(async () => Number(await page.getByRole("progressbar").getAttribute("aria-valuenow")), { timeout: 10000 }).toBeGreaterThan(0);
  assert(!/^\s*frame=/m.test(await page.getByLabel("压制日志", { exact: true }).inputValue()), "FFmpeg status must not flood the log");
  await page.getByRole("button", { name: "强制终止", exact: true }).click();
  await page.getByRole("button", { name: "确认终止", exact: true }).click();
  await expect(page.locator(".queue-item")).toHaveCount(0, { timeout: 10000 });
  assert(!existsSync(path.join(media, "result-03.mp4")));
  for (const ep of ["03", "04", "05"]) {
    await page.getByLabel("集数", { exact: true }).fill(ep);
    await page.getByRole("button", { name: "添加任务", exact: true }).click();
  }
  const rows = page.locator(".queue-item");
  await expect(rows).toHaveCount(3);
  await page.bringToFront();
  const from = await rows.first().boundingBox(), to = await rows.last().boundingBox();
  await page.mouse.move(from.x + 90, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 100, from.y + from.height / 2);
  await expect(page.locator(".queue-item.dragging")).toHaveCount(1);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.mouse.move(to.x + 90, to.y + to.height / 2, { steps: 15 });
  await expect.poll(() => page.locator(".queue-item.dragging").evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m42)).toBeGreaterThan(0);
  await page.mouse.up();
  await expect(rows.last()).toContainText("EP03");
  await expect.poll(() => rows.evaluateAll(nodes => nodes.every(node => {
    const matrix = new DOMMatrix(getComputedStyle(node).transform);
    return Math.abs(matrix.m42) < 0.1;
  }))).toBeTruthy();
  await rows.last().getByRole("button", { name: /调整任务位置/ }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".queue-item.dragging")).toHaveCount(1);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => page.locator(".queue-item.dragging").evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m42)).toBeLessThan(0);
  await page.keyboard.press("Space");
  await expect(rows.nth(1)).toContainText("EP03");
  await page.getByRole("button", { name: "清空", exact: true }).click();
  await page.getByLabel("集数", { exact: true }).fill("03");
  await page.getByRole("button", { name: "切换主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const nativeTheme = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:window|theme", { label: "main" }));
  assert.equal(nativeTheme, "dark");
  await page.screenshot({ path: path.join(root, "native-encode-dark.png"), animations: "disabled" });
  await page.getByLabel("CRF / 单次参数", { exact: true }).click({ button: "right" });
  await page.screenshot({ path: path.join(root, "native-edit-menu-dark.png"), animations: "disabled" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "全局设置" }).click();
  await page.screenshot({ path: path.join(root, "native-settings-dark.png"), animations: "disabled" });
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("radio", { name: "封装", exact: true }).click();
  await expect(page.locator(".queue-item")).toHaveCount(0);
  await page.screenshot({ path: path.join(root, "native-mux-dark.png"), animations: "disabled" });
  await page.getByRole("button", { name: "切换主题" }).click();
  const lightTheme = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("plugin:window|theme", { label: "main" }));
  assert.equal(lightTheme, "light");
  await page.screenshot({ path: path.join(root, "native-mux-light.png"), animations: "disabled" });
  const saved = JSON.parse(readFileSync(path.join(config, "profiles.json"), "utf8"));
  assert.equal(saved["本地回归"].last_ep_no_sub, "03");
  assert.equal(saved["本地回归"].source_dir_no_sub, media);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ root, nativeTheme, lightTheme, singlePass: "passed", twoPass: "passed", stopCleanup: "passed", autoSave: "passed", pointerAndKeyboardSort: "passed", nativeClipboardAndUndo: "passed", progressWithoutLogSpam: "passed", errors }));
  await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("finish_close", { exit: true })).catch(() => {});
  await Promise.race([once(child, "exit"), new Promise(resolve => setTimeout(resolve, 5000))]);
} catch (error) {
  if (page) {
    console.error("Native UI log (tail):", await page.getByLabel("压制日志", { exact: true }).inputValue().then(text => text.split("\n").slice(-25).join("\n")).catch(() => "unavailable"));
    console.error("Native queue:", await page.locator(".queue-list").innerText().catch(() => "unavailable"));
    await page.screenshot({ path: path.join(root, "failure.png") }).catch(() => {});
  }
  throw error;
} finally {
  if (page && clipboardBefore !== undefined) await page.evaluate(text => window.__TAURI_INTERNALS__.invoke("plugin:clipboard-manager|write_text", { text }), clipboardBefore).catch(() => {});
  await browser?.close().catch(() => {});
  if (child.exitCode === null) child.kill();
}
