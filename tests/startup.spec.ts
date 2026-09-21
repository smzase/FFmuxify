import { expect, test, type Page } from "@playwright/test";
import { defaultSettings, newProfile } from "../src/state";

type StartupProbe = {
  finishLoad: () => void;
  finishTheme: () => void;
  themeRequests: number;
  shows: { theme?: string; background: string; workspace: boolean; error: string | null }[];
};
declare global { interface Window { startupProbe: StartupProbe } }

async function mockStartup(page: Page, options: { failLoad?: boolean; suspendFrames?: boolean } = {}) {
  const state = { settings: { ...defaultSettings(), theme_mode: "dark" }, profiles: { "启动测试": newProfile() }, config_dir: "Test" };
  await page.route("**/src/main.tsx", async route => {
    const response = await route.fetch();
    // Use Tauri's official IPC/event mocks before React mounts, leaving the real app intact.
    const bootstrap = `
      import { mockIPC } from "/node_modules/@tauri-apps/api/mocks.js";
      const probe = window.startupProbe = { themeRequests: 0, shows: [] };
      const load = new Promise(resolve => { probe.finishLoad = resolve; });
      const theme = new Promise(resolve => { probe.finishTheme = resolve; });
      if (${options.suspendFrames === true}) {
        window.requestAnimationFrame = () => 1;
        window.cancelAnimationFrame = () => {};
      }
      mockIPC(async cmd => {
        if (cmd === "load_state") {
          await load;
          if (${options.failLoad === true}) throw new Error("test configuration unavailable");
          return ${JSON.stringify(state)};
        }
        if (cmd === "set_theme") { probe.themeRequests++; await theme; }
        if (cmd === "frontend_ready") probe.shows.push({
          theme: document.documentElement.dataset.theme,
          background: getComputedStyle(document.body).backgroundColor,
          workspace: !!document.querySelector(".app-shell"),
          error: document.querySelector('[role="alert"]')?.textContent ?? null,
        });
      }, { shouldMockEvents: true });
    `;
    await route.fulfill({ response, body: bootstrap + await response.text() });
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("正在加载配置…");
}

for (const suspendFrames of [false, true]) {
  test(`startup waits for configuration, rendered UI and native theme${suspendFrames ? " with suspended frames" : ""}`, async ({ page }) => {
    await mockStartup(page, { suspendFrames });
    expect(await page.evaluate(() => window.startupProbe.shows)).toEqual([]);
    await page.evaluate(() => window.startupProbe.finishLoad());
    await expect(page.getByRole("button", { name: "启动测试", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.startupProbe.themeRequests)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.startupProbe.shows)).toEqual([]);
    await page.evaluate(() => window.startupProbe.finishTheme());
    await expect.poll(() => page.evaluate(() => window.startupProbe.shows)).toEqual([
      { theme: "dark", background: "rgb(25, 26, 27)", workspace: true, error: null },
    ]);
    await page.getByRole("button", { name: "切换主题" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => page.evaluate(() => window.startupProbe.themeRequests)).toBe(2);
    expect(await page.evaluate(() => window.startupProbe.shows.length)).toBe(1);
  });
}

test("configuration failure reveals a persistent retry screen", async ({ page }) => {
  await mockStartup(page, { failLoad: true });
  await page.evaluate(() => { window.startupProbe.finishTheme(); window.startupProbe.finishLoad(); });
  await expect(page.getByRole("alert")).toContainText("加载配置失败：");
  await expect(page.getByRole("button", { name: "重新加载" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.startupProbe.shows.length)).toBe(1);
  expect(await page.evaluate(() => window.startupProbe.shows[0])).toMatchObject({ workspace: false, error: "加载配置失败：Error: test configuration unavailable" });
  await expect(page.getByRole("alert")).toContainText("test configuration unavailable");
});
