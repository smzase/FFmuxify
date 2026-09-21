import { expect, test, type Page } from "@playwright/test";

async function loaded(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "示例配置", exact: true })).toBeVisible();
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const selectors = ["html", "body", ".app-shell", ".sidebar", ".main-content", ".bottom-grid", ".workspace"];
    return selectors.flatMap(selector => {
      const node = document.querySelector(selector) as HTMLElement;
      return node && (node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1) ? [{ selector, height: [node.scrollHeight, node.clientHeight], width: [node.scrollWidth, node.clientWidth] }] : [];
    });
  });
  expect(overflow).toEqual([]);
  const bottomGap = await page.locator(".sidebar").evaluate(node => window.innerHeight - node.getBoundingClientRect().bottom);
  expect(bottomGap).toBe(10);
  for (const element of await page.locator(".workspace input, .workspace button, .workspace textarea").all()) {
    await expect(element).toBeInViewport({ ratio: 1 });
  }
}

test("minimum window fits both workflows and both parameter modes", async ({ page }, info) => {
  await loaded(page);
  await page.setViewportSize({ width: 1100, height: 770 });
  await noOverflow(page);
  await expect(page.getByLabel("CRF / 单次参数", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Pass 1 参数", { exact: true })).toHaveCount(0);
  await page.getByLabel("启用 2-Pass Mode", { exact: true }).check();
  await expect(page.getByLabel("CRF / 单次参数", { exact: true })).toHaveCount(0);
  await page.getByLabel("Pass 1 参数", { exact: true }).fill("-c:v libx264 -preset slow -b:v 4M -an -f null NUL");
  await page.getByLabel("Pass 2 参数", { exact: true }).fill("-c:v libx264 -preset slow -b:v 4M -c:a aac -b:a 192k");
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("encode-two-pass-min.png"), animations: "disabled" });
  await page.getByRole("radio", { name: "封装", exact: true }).click();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("mux-min.png"), animations: "disabled" });
  const actions = await page.locator(".section-actions").evaluateAll(nodes => nodes.map(node => {
    const card = node.closest(".mux-form")!;
    return Math.abs(card.getBoundingClientRect().right - node.getBoundingClientRect().right);
  }));
  expect(actions.every(distance => distance <= 15)).toBeTruthy();
});

test("light and dark layouts match the original panel structure", async ({ page }, info) => {
  await loaded(page);
  await noOverflow(page);
  await expect(page.getByText("Video workflow studio")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /保存/ })).toHaveCount(0);
  await page.getByLabel("CRF / 单次参数", { exact: true }).fill("-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p");
  await page.screenshot({ path: info.outputPath("encode-light.png"), animations: "disabled" });
  await page.getByRole("button", { name: "切换主题" }).click();
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(25, 26, 27)");
  await expect(page.locator(".profile-list")).toHaveCSS("scrollbar-color", "rgb(83, 84, 91) rgba(0, 0, 0, 0)");
  await page.getByRole("radio", { name: "封装", exact: true }).click();
  await noOverflow(page);
  await page.screenshot({ path: info.outputPath("mux-dark.png"), animations: "disabled" });
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByLabel("混流日志", { exact: true })).toBeVisible();
  await expect(page.getByLabel("子集日志", { exact: true })).toBeVisible();
});

test("edits save immediately and hidden parameters keep their values", async ({ page }) => {
  await loaded(page);
  await page.getByLabel("源视频目录", { exact: true }).fill("D:\\视频\\Source");
  await page.getByLabel("CRF / 单次参数", { exact: true }).fill("-c:v libx264 -crf 19");
  await page.getByLabel("启用 2-Pass Mode", { exact: true }).check();
  await page.getByLabel("Pass 1 参数", { exact: true }).fill("-b:v 4M -f null NUL");
  await page.reload();
  await expect(page.getByLabel("源视频目录", { exact: true })).toHaveValue("D:\\视频\\Source");
  await expect(page.getByLabel("Pass 1 参数", { exact: true })).toHaveValue("-b:v 4M -f null NUL");
  await page.getByLabel("启用 2-Pass Mode", { exact: true }).uncheck();
  await expect(page.getByLabel("CRF / 单次参数", { exact: true })).toHaveValue("-c:v libx264 -crf 19");
  await page.getByRole("radio", { name: "无字幕", exact: true }).click();
  await expect(page.getByLabel("源视频目录", { exact: true })).toHaveValue("");
  await page.getByRole("radio", { name: "有字幕", exact: true }).click();
  await expect(page.getByLabel("源视频目录", { exact: true })).toHaveValue("D:\\视频\\Source");
});

test("profile dialog supports outside close, validation, enter and context actions", async ({ page }) => {
  await loaded(page);
  await page.getByRole("button", { name: "新建配置" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "新建配置" }).click();
  await page.getByRole("textbox", { name: "配置名称" }).fill("示例配置");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("该配置名称已存在");
  await page.getByRole("textbox", { name: "配置名称" }).fill("新的配置");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "新的配置", exact: true }).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "重命名" })).toBeVisible();
  await page.getByRole("menuitem", { name: "重命名" }).click();
  await page.getByRole("textbox", { name: "配置名称" }).fill("重命名后");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "重命名后", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "删除配置" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "删除配置" }).click();
  await expect(page.getByRole("button", { name: "重命名后", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "示例配置", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("settings cancel and outside click discard drafts, apply saves", async ({ page }) => {
  await loaded(page);
  await page.getByRole("button", { name: "全局设置" }).click();
  await page.getByLabel("文件夹名称", { exact: true }).fill("discard-me");
  await page.mouse.click(10, 10);
  await page.getByRole("button", { name: "全局设置" }).click();
  await expect(page.getByLabel("文件夹名称", { exact: true })).toHaveValue("ffmpeg smzase");
  await page.getByLabel("文件夹名称", { exact: true }).fill("saved-folder");
  await page.getByRole("button", { name: "应用", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("设置已保存");
  await page.getByLabel("文件夹名称", { exact: true }).fill("cancel-me");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.getByRole("button", { name: "全局设置" }).click();
  await expect(page.getByLabel("文件夹名称", { exact: true })).toHaveValue("saved-folder");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("keep only AV checks and disables removals; suffix is opt in", async ({ page }) => {
  await loaded(page);
  await page.getByRole("radio", { name: "封装", exact: true }).click();
  await page.getByLabel("仅保留音视频", { exact: true }).check();
  for (const label of ["字幕", "字体", "章节"]) {
    await expect(page.getByRole("checkbox", { name: label, exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: label, exact: true })).toBeDisabled();
  }
  await expect(page.getByRole("checkbox", { name: "清除轨道名称" })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "字幕", exact: true })).toBeDisabled();
  await page.getByLabel("仅保留音视频", { exact: true }).uncheck();
  await expect(page.getByRole("checkbox", { name: "字幕", exact: true })).toBeEnabled();
  await expect(page.getByRole("checkbox", { name: "字幕", exact: true })).toBeChecked();
  await expect(page.getByLabel("混流后缀", { exact: true })).toBeDisabled();
  await page.locator('[aria-label="混流"]').getByRole("button", { name: "加入队列" }).click();
  await expect(page.locator(".queue-item").last()).not.toContainText("[V2]");
  await page.getByLabel("添加后缀", { exact: true }).check();
  await page.locator('[aria-label="混流"]').getByRole("button", { name: "加入队列" }).click();
  await expect(page.locator(".queue-item").last()).toContainText("[V2]");
});

test("batch modes update the right episode and queues stay separate", async ({ page }) => {
  await loaded(page);
  await page.getByRole("button", { name: "批量多集" }).click();
  await page.mouse.click(10, 10);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "批量多集" }).click();
  await page.getByLabel("起始集数").fill("03");
  await page.getByLabel("结束集数").fill("01");
  await page.getByRole("dialog").getByRole("button", { name: "无字幕", exact: true }).click();
  await expect(page.locator(".queue-item")).toHaveCount(3);
  await expect(page.getByLabel("集数", { exact: true })).toHaveValue("01");
  await page.getByRole("radio", { name: "无字幕", exact: true }).click();
  await expect(page.getByLabel("集数", { exact: true })).toHaveValue("04");
  await page.getByRole("radio", { name: "封装", exact: true }).click();
  await expect(page.locator(".queue-item")).toHaveCount(0);
  await page.getByRole("radio", { name: "压制", exact: true }).click();
  await expect(page.locator(".queue-item")).toHaveCount(3);
  await page.locator(".queue-item").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "移除任务" }).click();
  await expect(page.locator(".queue-item")).toHaveCount(2);
});

test("only editable text and logs can be selected; default context menu is prevented", async ({ page }) => {
  await loaded(page);
  await expect(page.getByText("右键可删除或重命名")).toHaveCount(0);
  await expect(page.locator(".sidebar")).toHaveCSS("user-select", "none");
  await expect(page.getByLabel("源视频目录", { exact: true })).toHaveCSS("user-select", "text");
  await expect(page.getByLabel("压制日志", { exact: true })).toHaveCSS("user-select", "text");
  expect(await page.locator(".main-content").evaluate(node => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    node.dispatchEvent(event); return event.defaultPrevented;
  })).toBeTruthy();
});

test("queue supports pointer reordering, keyboard reordering and drag cancellation", async ({ page }) => {
  await loaded(page);
  await page.getByRole("button", { name: "批量多集" }).click();
  await page.getByLabel("起始集数").fill("01");
  await page.getByLabel("结束集数").fill("03");
  await page.getByRole("dialog").getByRole("button", { name: "无字幕", exact: true }).click();
  const rows = page.locator(".queue-item");
  await expect(rows).toHaveCount(3);
  const from = await rows.first().boundingBox(), to = await rows.last().boundingBox();
  await page.mouse.move(from!.x + 90, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + 90, to!.y + to!.height / 2, { steps: 12 });
  await expect(page.locator(".queue-item.dragging")).toHaveCount(1);
  await page.mouse.up();
  await expect(rows.last()).toContainText("EP01");
  const grip = rows.last().getByRole("button", { name: /调整任务位置/ });
  await grip.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".queue-item.dragging")).toHaveCount(1);
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => page.locator(".queue-item.dragging").evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m42)).toBeLessThan(0);
  await page.keyboard.press("Space");
  await expect(rows.nth(1)).toContainText("EP01");
  await rows.first().getByRole("button", { name: /调整任务位置/ }).focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(rows.first()).toContainText("EP02");
});

test("text fields have working edit menus and undo preserves controlled state", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await loaded(page);
  const input = page.getByLabel("CRF / 单次参数", { exact: true });
  await input.fill("");
  await input.pressSequentially("test parameters");
  await input.press("Control+a");
  await input.click({ button: "right" });
  for (const name of ["剪切", "复制", "粘贴", "撤销", "全选"]) await expect(page.getByRole("menuitem", { name: new RegExp(name) })).toBeVisible();
  await page.getByRole("menuitem", { name: /复制/ }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("test parameters");
  await input.click({ button: "right" });
  await page.getByRole("menuitem", { name: /全选/ }).click();
  await input.click({ button: "right" });
  await page.getByRole("menuitem", { name: /剪切/ }).click();
  await expect(input).toHaveValue("");
  await input.click({ button: "right" });
  await page.getByRole("menuitem", { name: /撤销/ }).click();
  await expect(input).toHaveValue("test parameters");
  await input.press("Control+End");
  await input.click({ button: "right" });
  await page.getByRole("menuitem", { name: /粘贴/ }).click();
  await expect(input).toHaveValue("test parameterstest parameters");
  await page.reload();
  await expect(input).toHaveValue("test parameterstest parameters");
  await page.getByLabel("压制日志", { exact: true }).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: /粘贴/ })).toHaveAttribute("data-disabled", "");
  await expect(page.getByRole("menuitem", { name: "清空日志" })).toBeVisible();
});

test("settings keep their height and dialogs animate with compact parameter fields", async ({ page }, info) => {
  await loaded(page);
  expect((await page.getByLabel("CRF / 单次参数", { exact: true }).boundingBox())!.height).toBeCloseTo(84, 2);
  await page.getByLabel("启用 2-Pass Mode", { exact: true }).check();
  expect((await page.getByLabel("Pass 1 参数", { exact: true }).boundingBox())!.height).toBeCloseTo(88, 2);
  await page.getByRole("button", { name: "全局设置" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCSS("animation-name", "enter");
  await expect(page.getByText("深色模式", { exact: true })).toHaveCount(0);
  const height = await dialog.evaluate(node => node.clientHeight);
  await page.getByRole("button", { name: "CPU 默认参数" }).click();
  await dialog.getByLabel("启用 2-Pass Mode", { exact: true }).check();
  expect(await dialog.evaluate(node => node.clientHeight)).toBe(height);
  await page.screenshot({ path: info.outputPath("settings-fixed-height.png"), animations: "disabled" });
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.locator('.dialog-content[data-state="closed"]')).toHaveCount(1);
  await expect(dialog).toHaveCount(0);
});
