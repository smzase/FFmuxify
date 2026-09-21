import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": new URL("./src", import.meta.url).pathname.replace(/^\/(\w:)/, "$1") } },
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**", "**/.qa/**", "**/test-results/**"] } },
  envPrefix: ["VITE_", "TAURI_"],
});
