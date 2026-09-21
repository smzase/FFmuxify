import { expect, test, type Page } from "@playwright/test";

async function mockFonts(page: Page, failFirst = false) {
  await page.route("**/src/main.tsx", async route => {
    const response = await route.fetch();
    // Mock native enumeration at the IPC boundary, retaining the app's real caching.
    const bootstrap = `
      import { mockIPC } from "/node_modules/@tauri-apps/api/mocks.js";
      import { defaultSettings, newProfile } from "/src/state.ts";
      window.fontRequests = 0;
      const enumerateTestFonts = async () => {
        window.fontRequests++;
        if (${failFirst} && window.fontRequests === 1) throw new Error("font test failure");
        return Array.from({ length: 20000 }, (_, i) => ({
          family: "Test Font " + String(i).padStart(5, "0"),
          display_name: "测试字体 " + String(i).padStart(5, "0"),
          aliases: ["Alias " + String(i).padStart(5, "0")],
        }));
      };
      let state = { settings: defaultSettings(), profiles: { "示例配置": newProfile() }, config_dir: "Test" };
      mockIPC(async (cmd, args) => {
        if (cmd === "load_state") return state;
        if (cmd === "save_state") state = { ...state, ...args };
        if (cmd === "list_fonts") return enumerateTestFonts();
      }, { shouldMockEvents: true });
    `;
    await route.fulfill({ response, body: bootstrap + await response.text() });
  });
}

const openSettings = async (page: Page) => page.getByRole("button", { name: "全局设置" }).click();
const fontButton = (page: Page) => page.getByRole("combobox", { name: "字体", exact: true });
const search = (page: Page) => page.getByRole("combobox", { name: "搜索字体", exact: true });
const loaded = async (page: Page) => expect(page.getByRole("button", { name: "示例配置", exact: true })).toBeVisible();

test("20000 fonts stay virtualized and searchable, with cached enumeration and keyboard navigation", async ({ page }, info) => {
  await mockFonts(page);
  await page.goto("/");
  await loaded(page);
  await openSettings(page);
  await fontButton(page).click();
  await expect(page.locator(".font-list-footer")).toHaveText("可选字体：20001");
  expect(await page.getByRole("option").count()).toBeLessThan(25);
  const fontList = page.locator(".font-options");
  await fontList.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => fontList.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath("fonts-light.png"), animations: "disabled" });
  await search(page).press("End");
  await expect(page.getByRole("option", { name: /测试字体 19999/ })).toBeInViewport();
  await search(page).press("Home");
  await expect(page.getByRole("option", { name: "默认字体", exact: true })).toBeInViewport();
  await page.locator(".font-options").evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(page.getByRole("option", { name: /测试字体 19999/ })).toBeVisible();
  expect(await page.getByRole("option").count()).toBeLessThan(25);
  await search(page).fill("alias 17890");
  await expect(page.getByRole("option")).toHaveCount(1);
  await search(page).press("Enter");
  await expect(fontButton(page)).toContainText("测试字体 17890");
  await fontButton(page).click();
  await expect(search(page)).toHaveValue("");
  await search(page).fill("测试字体 01234");
  await expect(page.getByRole("option")).toHaveCount(1);
  await search(page).press("Escape");
  await expect(page.locator(".font-popover")).toHaveCount(0);
  await expect(page.locator(".settings-dialog")).toBeVisible();
  await fontButton(page).click();
  await search(page).fill("no-such-font");
  await expect(page.getByText("未找到匹配的字体")).toBeVisible();
  await page.locator(".settings-dialog").getByRole("heading", { name: "全局设置" }).click();
  await expect(page.locator(".font-popover")).toHaveCount(0);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await openSettings(page);
  await expect(page.getByLabel("系统原生字体渲染", { exact: true })).toBeChecked();
  await fontButton(page).click();
  expect(await page.evaluate(() => (window as unknown as { fontRequests: number }).fontRequests)).toBe(1);
});

test("font apply and OK persist while cancel, outside and Escape discard drafts", async ({ page }, info) => {
  await page.goto("/");
  await loaded(page);
  await openSettings(page);
  const original = await page.locator("body").evaluate(node => getComputedStyle(node).fontFamily);
  const choose = async (name: string) => {
    await fontButton(page).click();
    await search(page).fill(name);
    await page.getByRole("option", { name, exact: true }).click();
    await expect(page.locator(".font-popover")).toHaveCount(0);
  };
  await choose("Arial");
  await expect(page.locator("body")).toHaveCSS("font-family", original);
  await expect(page.getByLabel("字体预览")).toHaveCSS("font-family", /Arial/);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await openSettings(page);
  await expect(fontButton(page)).toContainText("默认字体");
  await choose("Consolas");
  await page.getByRole("button", { name: "应用", exact: true }).click();
  await expect(page.locator("body")).toHaveCSS("font-family", /^Consolas/);
  await choose("Arial");
  await page.mouse.click(10, 10);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openSettings(page);
  await expect(fontButton(page)).toContainText("Consolas");
  await choose("Arial");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await openSettings(page);
  await expect(fontButton(page)).toContainText("Consolas");
  await choose("Arial");
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await page.reload();
  await expect(page.locator("body")).toHaveCSS("font-family", /^Arial/);
  await expect(page.getByLabel("压制日志")).toHaveCSS("font-family", /^Arial/);
  await page.getByRole("button", { name: "切换主题" }).click();
  await page.setViewportSize({ width: 1100, height: 770 });
  await openSettings(page);
  await fontButton(page).click();
  await expect(page.getByRole("option", { name: "Arial", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.screenshot({ path: info.outputPath("fonts-dark-min.png"), animations: "disabled" });
  await search(page).fill("默认字体");
  await page.getByRole("option", { name: "默认字体", exact: true }).click();
  await page.getByRole("button", { name: "确定", exact: true }).click();
  await expect(page.locator("body")).toHaveCSS("font-family", original);
});

test("font enumeration failure allows retry", async ({ page }) => {
  await mockFonts(page, true);
  await page.goto("/");
  await loaded(page);
  await openSettings(page);
  await fontButton(page).click();
  await expect(page.getByRole("alert")).toContainText("font test failure");
  await page.getByRole("button", { name: "重试", exact: true }).click();
  await expect(page.locator(".font-list-footer")).toHaveText("可选字体：20001");
  expect(await page.getByRole("option").count()).toBeLessThan(25);
});
