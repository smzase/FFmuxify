import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { defaultSettings, newProfile } from "./state";
import type { AppState, Profile, Settings, SystemFont } from "./types";

export const isDesktop = () => "__TAURI_INTERNALS__" in window;
const previewKey = "ffmuxify-preview";
let saveTail: Promise<unknown> = Promise.resolve();
let fontsRequest: Promise<SystemFont[]> | undefined;
let cachedFonts: SystemFont[] | null = null;
function normalizeProfileOrder(state: Omit<AppState, "profile_order"> & Partial<Pick<AppState, "profile_order">>): AppState {
  const names = Object.keys(state.profiles ?? {});
  const seen = new Set<string>();
  const order = [...(Array.isArray(state.profile_order) ? state.profile_order : []), ...names]
    .filter(name => names.includes(name) && !seen.has(name) && seen.add(name));
  return { ...state, profile_order: order } as AppState;
}
export const api = {
  loadState: async (): Promise<AppState> => {
    if (isDesktop()) return normalizeProfileOrder(await invoke<AppState>("load_state"));
    const stored = localStorage.getItem(previewKey);
    if (stored) {
      const loaded = JSON.parse(stored) as AppState;
      return normalizeProfileOrder({ ...loaded, settings: { ...defaultSettings(), ...loaded.settings } });
    }
    const settings = defaultSettings();
    const query = new URLSearchParams(location.search);
    settings.theme_mode = query.get("theme") === "dark" ? "dark" : "light";
    settings.last_workflow = query.get("view") === "mux" ? "mux" : "encode";
    return { settings, profiles: { "示例配置": newProfile() }, profile_order: ["示例配置"], config_dir: "Browser preview" };
  },
  // Serialize writes so an older edit cannot overwrite a newer one.
  saveState: (settings: Settings, profiles: Record<string, Profile>, profileOrder = Object.keys(profiles)): Promise<void> => {
    const snapshot = structuredClone({ settings, profiles, profile_order: profileOrder });
    const operation = saveTail.catch(() => undefined).then(async () => {
      if (isDesktop()) await invoke("save_state", snapshot);
      else localStorage.setItem(previewKey, JSON.stringify({ ...snapshot, config_dir: "Browser preview" }));
    });
    saveTail = operation;
    return operation;
  },
  flush: () => saveTail,
  cachedFonts: () => cachedFonts,
  listFonts: (): Promise<SystemFont[]> => {
    if (!fontsRequest) {
      fontsRequest = (isDesktop() ? invoke<SystemFont[]>("list_fonts") : Promise.resolve(
        ["Arial", "Consolas", "Microsoft YaHei", "Segoe UI"].map(family => ({ family, display_name: family, aliases: [family] }))
      )).then(fonts => { cachedFonts = fonts; return fonts; })
        .catch(error => { fontsRequest = undefined; throw error; });
    }
    return fontsRequest;
  },
  setTheme: async (dark: boolean) => { if (isDesktop()) await invoke("set_theme", { dark }); },
  frontendReady: async () => { if (isDesktop()) await invoke("frontend_ready"); },
  finishClose: async (exit: boolean) => { if (isDesktop()) await invoke("finish_close", { exit }); },
  runTask: (task: unknown) => isDesktop() ? invoke<string>("run_task", { task }) : Promise.reject("请在桌面客户端运行媒体任务"),
  stopTask: (workflow: "encode" | "mux") => invoke<boolean>("stop_task", { workflow }),
  pickFolder: async () => isDesktop() ? invoke<string | null>("pick_folder") : null,
  pickFile: async () => isDesktop() ? invoke<string | null>("pick_file") : null,
  on: <T,>(event: string, handler: (payload: T) => void): Promise<UnlistenFn> => isDesktop() ? listen<T>(event, e => handler(e.payload)) : Promise.resolve(() => {}),
};
