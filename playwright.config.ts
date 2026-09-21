import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 2,
  use: { baseURL: "http://127.0.0.1:1421", channel: "msedge", viewport: { width: 1300, height: 920 }, trace: "retain-on-failure" },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 1421 --strictPort", url: "http://127.0.0.1:1421", reuseExistingServer: false },
});
