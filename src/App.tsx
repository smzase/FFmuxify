import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Moon, Sun, Settings as SettingsIcon, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "./components/ui/button";
import { Segmented } from "./components/fields";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "./components/ui/context-menu";
import { BatchDialog, ConfirmDialog, NameDialog, SettingsDialog, type BatchKind } from "./components/dialogs";
import { EncodeWorkspace, MuxWorkspace } from "./components/workspaces";
import { EncodeLogPanel, MuxLogPanel, QueuePanel, emptyMetrics } from "./components/panels";
import { api } from "./api";
import { fontStack } from "./lib/fonts";
import { isEncode, newProfile } from "./state";
import type { AppState, Profile, QueueTask, Settings } from "./types";

type Workflow = "encode" | "mux";
type Output = { id: string; line: string; progress?: number | null; pass?: number };
type Finished = { id: string; success: boolean; stopped: boolean; duration: string };
type Confirmation = { title: string; description: string; action: string; confirm: () => void };
const workflowOf = (task: QueueTask): Workflow => isEncode(task.type) ? "encode" : "mux";
const nextEpisode = (ep: string) => /^\d+$/.test(ep) ? String(Number(ep) + 1).padStart(ep.length, "0") : ep;
const historyKey = (name: string, ep: string, type: string) => JSON.stringify([name, ep, type]);

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [startupError, setStartupError] = useState("");
  const startupShown = useRef(false);
  const [profileName, setProfileName] = useState("");
  const [tasks, setTasks] = useState<QueueTask[]>([]);
  const [queueMode, setQueueMode] = useState<Workflow | null>(null);
  const [active, setActive] = useState<QueueTask | null>(null);
  const [logs, setLogs] = useState({ encode: [] as string[], mux: [] as string[], subset: [] as string[] });
  const [metrics, setMetrics] = useState(emptyMetrics);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [nameDialog, setNameDialog] = useState<{ target: string | null } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [notice, setNotice] = useState("");
  const stateRef = useRef(state);
  const activeRef = useRef<QueueTask | null>(null);
  const startedAt = useRef(0);
  const completed = useRef(new Set<string>());
  const closeHandler = useRef<(quit: boolean) => void>(() => {});
  stateRef.current = state;
  const workflow = state?.settings.last_workflow ?? "encode";
  const dark = state?.settings.theme_mode === "dark";
  const startupSettled = !!state || !!startupError;
  const profile = state?.profiles[profileName];
  const running = !!active;
  const visibleTasks = tasks.filter(task => workflowOf(task) === workflow);
  const appendLog = (task: QueueTask, line: string) => {
    const key = isEncode(task.type) ? "encode" : task.type === "subset" ? "subset" : "mux";
    setLogs(previous => ({ ...previous, [key]: [...previous[key].slice(-4999), line] }));
  };

  useEffect(() => {
    let disposed = false;
    void api.loadState().then(loaded => {
      if (!disposed) { setState(loaded); setProfileName(Object.keys(loaded.profiles)[0] ?? ""); }
    }).catch(error => { if (!disposed) setStartupError("加载配置失败：" + String(error)); });
    const suppressMenu = (event: MouseEvent) => event.preventDefault();
    document.addEventListener("contextmenu", suppressMenu);
    return () => { disposed = true; document.removeEventListener("contextmenu", suppressMenu); };
  }, []);
  useEffect(() => {
    if (!state) return;
    void api.saveState(state.settings, state.profiles).catch(error => setNotice("自动保存失败：" + String(error)));
  }, [state]);
  useLayoutEffect(() => {
    document.documentElement.style.setProperty("--ui-font", fontStack(state?.settings.font_family));
    document.documentElement.style.setProperty("--log-font", fontStack(state?.settings.font_family, true));
  }, [state?.settings.font_family]);
  useEffect(() => {
    if (!startupSettled) return;
    let disposed = false;
    let frame = 0;
    let timer = 0;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    void api.setTheme(dark).catch(error => setNotice("窗口主题切换失败：" + String(error))).then(() => {
      if (disposed || startupShown.current) return;
      const show = () => {
        window.cancelAnimationFrame(frame);
        window.clearTimeout(timer);
        if (disposed || startupShown.current) return;
        startupShown.current = true;
        void api.frontendReady().catch(error => {
          startupShown.current = false;
          setStartupError("显示窗口失败：" + String(error));
          setNotice("显示窗口失败：" + String(error));
        });
      };
      // Allow the committed UI and its theme to paint before revealing the native window.
      frame = window.requestAnimationFrame(() => { frame = window.requestAnimationFrame(show); });
      // Hidden WebView2 windows can suspend animation frames; never wait for them forever.
      timer = window.setTimeout(show, 100);
    });
    return () => { disposed = true; window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [dark, startupSettled]);
  useEffect(() => {
    if (!notice) return;
    toast(notice);
    setNotice("");
  }, [notice]);
  useEffect(() => {
    let disposed = false;
    const subscriptions = [
      api.on<Output>("task-output", output => {
        const task = activeRef.current;
        if (!task || task.id !== output.id) return;
        // FFmpeg status still drives metrics/progress, but must not flood the log.
        if (!isEncode(task.type) || !/^\s*(?:frame|size)=.*\btime=/.test(output.line)) appendLog(task, output.line);
        if (isEncode(task.type)) {
          const time = output.line.match(/time=\s*(\d+:\d+:\d+\.\d+)/)?.[1];
          const speed = output.line.match(/speed=\s*([\d.]+x)/)?.[1];
          const fps = output.line.match(/fps=\s*([\d.]+)/)?.[1];
          const bitrate = output.line.match(/bitrate=\s*([\d.]+\s*kbits\/s)/)?.[1];
          setMetrics(previous => ({ ...previous, ...(time && { time }), ...(speed && { speed }), ...(fps && { fps }), ...(bitrate && { bitrate }) }));
        }
        if (typeof output.progress === "number") setTasks(previous => previous.map(item => item.id === task.id ? { ...item, progress: output.progress!, pass: output.pass ?? item.pass } : item));
      }),
      api.on<Finished>("task-finished", result => {
        const task = activeRef.current;
        if (!task || task.id !== result.id) return;
        appendLog(task, result.stopped ? "任务已停止" : (result.success ? "完成，用时 " : "失败，用时 ") + result.duration);
        if (result.stopped) {
          setQueueMode(null);
          setTasks(previous => isEncode(task.type) ? previous.filter(item => !isEncode(item.type)) : previous.map(item => item.id === task.id ? { ...item, status: "error" } : item));
        } else setTasks(previous => previous.map(item => item.id === task.id ? { ...item, status: result.success ? "done" : "error", progress: result.success ? 1 : item.progress } : item));
        if (result.success && !task.suffix) {
          completed.current.add(historyKey(task.profileName, task.ep, task.type));
          setState(previous => {
            if (!previous) return previous;
            const p = previous.profiles[task.profileName];
            if (!p) return previous;
            const encode = isEncode(task.type);
            if (encode ? !previous.settings.auto_ep_encode : !previous.settings.auto_ep_mux) return previous;
            if (encode && task.type !== "NO_SUB" && !["SC", "TC"].every(kind => completed.current.has(historyKey(task.profileName, task.ep, kind)))) return previous;
            const key = encode ? task.type === "NO_SUB" ? "last_ep_no_sub" : "last_ep" : task.type + "_ep";
            if (p[key] !== task.ep) return previous;
            const next = nextEpisode(task.ep);
            const patch = encode && !previous.settings.ep_not_shared ? { last_ep: next, last_ep_no_sub: next } : { [key]: next };
            return { ...previous, profiles: { ...previous.profiles, [task.profileName]: { ...p, ...patch } } };
          });
        }
        activeRef.current = null;
        setActive(null);
        setMetrics(emptyMetrics());
      }),
      api.on<{ quit: boolean }>("close-requested", event => closeHandler.current(event.quit)),
    ];
    const unlisteners: (() => void)[] = [];
    for (const subscription of subscriptions) void subscription.then(unlisten => disposed ? unlisten() : unlisteners.push(unlisten));
    return () => { disposed = true; unlisteners.forEach(unlisten => unlisten()); };
  }, []);
  useEffect(() => {
    if (!active || !isEncode(active.type)) return;
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt.current) / 1000);
      setMetrics(previous => ({ ...previous, elapsed: [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(part => String(part).padStart(2, "0")).join(":") }));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active?.id]);

  const updateProfile = (patch: Partial<Profile>) => setState(previous => {
    if (!previous?.profiles[profileName]) return previous;
    return { ...previous, profiles: { ...previous.profiles, [profileName]: { ...previous.profiles[profileName], ...patch } } };
  });
  const updateSettings = (patch: Partial<Settings>) => setState(previous => previous && ({ ...previous, settings: { ...previous.settings, ...patch } }));
  const saveSettings = async (settings: Settings) => {
    if (!stateRef.current) return;
    await api.saveState(settings, stateRef.current.profiles);
    updateSettings(settings);
  };
  const closeWindow = async (quit: boolean) => {
    const current = stateRef.current;
    try {
      if (!current) { await api.finishClose(true); return; }
      await api.saveState(current.settings, current.profiles); await api.flush(); await api.finishClose(quit);
    }
    catch (error) { setNotice("关闭前保存失败：" + String(error)); }
  };
  closeHandler.current = quit => {
    const exit = quit || stateRef.current?.settings.close_behavior === "exit";
    if (exit && activeRef.current) setConfirmation({ title: "退出程序", description: "任务仍在运行，退出会停止任务并清理未完成的压制文件。", action: "停止并退出", confirm: () => { setConfirmation(null); void closeWindow(true); } });
    else void closeWindow(exit);
  };
  const browse = async (key: keyof Profile, file = false) => {
    try {
      const value = file ? await api.pickFile() : await api.pickFolder();
      if (value) updateProfile({ [key]: value });
    } catch (error) { setNotice(String(error)); }
  };
  const makeTask = (type: QueueTask["type"], ep: string, suffix = ""): QueueTask | null => {
    if (!profile || !state) return null;
    if (!ep.trim()) { setNotice("请输入集数"); return null; }
    const p = structuredClone(profile);
    const mode = type === "NO_SUB" ? "no_sub" : "with_sub";
    const params = (mode === "no_sub" ? p.param_matrix_no_sub : p.param_matrix_with_sub)[String(p["selected_hw_" + mode])]?.[String(p["selected_codec_" + mode])];
    const labels = { extract: "提取", subset: "子集", mux: "混流", SC: "SC", TC: "TC", NO_SUB: "NO_SUB" };
    const tag = isEncode(type) && params?.enable_2pass ? " [2-Pass]" : "";
    if (!suffix) completed.current.delete(historyKey(profileName, ep.trim(), type));
    return { id: crypto.randomUUID(), type, ep: ep.trim(), suffix: suffix.trim(), profileName, profile: p, description: "[" + labels[type] + "] EP" + ep.trim() + (suffix ? " " + suffix : "") + tag + " - " + profileName, status: "pending", progress: 0, pass: 0 };
  };
  const add = (type: QueueTask["type"] | "BOTH", ep: string, suffix = "") => {
    const added = (type === "BOTH" ? ["SC", "TC"] as const : [type]).map(kind => makeTask(kind, ep, suffix)).filter((task): task is QueueTask => task !== null);
    setTasks(previous => [...previous, ...added]);
  };
  const startTask = (task: QueueTask) => {
    if (activeRef.current) return;
    const settings = stateRef.current?.settings;
    const launched = { ...task, profile: { ...task.profile, mkvmerge_path: settings?.mkvmerge_path ?? "", assfontsubset_path: settings?.assfontsubset_path ?? "" } };
    activeRef.current = launched;
    setActive(launched);
    startedAt.current = Date.now();
    setMetrics(emptyMetrics());
    setTasks(previous => previous.map(item => item.id === task.id ? { ...item, status: "running", progress: 0 } : item));
    void api.runTask(launched).catch(error => {
      if (activeRef.current?.id !== task.id) return;
      appendLog(task, "失败：" + String(error));
      setTasks(previous => previous.map(item => item.id === task.id ? { ...item, status: "error" } : item));
      activeRef.current = null;
      setActive(null);
    });
  };
  useEffect(() => {
    if (!queueMode || activeRef.current) return;
    const next = tasks.find(task => workflowOf(task) === queueMode && task.status === "pending");
    if (next) startTask(next);
    else { setQueueMode(null); setNotice("队列中的任务已结束"); }
  }, [queueMode, active, tasks]);
  const startDirect = (type: QueueTask["type"], ep: string, suffix = "") => {
    if (activeRef.current) return;
    const task = makeTask(type, ep, suffix);
    if (!task) return;
    setQueueMode(null);
    setTasks(previous => [...previous, task]);
    startTask(task);
  };
  const batch = (episodes: string[], kind: BatchKind, suffix: string) => {
    const kinds = kind === "BOTH" ? ["SC", "TC"] as const : [kind];
    const added = episodes.flatMap(ep => kinds.map(type => makeTask(type, ep, suffix))).filter((task): task is QueueTask => task !== null);
    setTasks(previous => [...previous, ...added]);
    updateProfile({ [kind === "NO_SUB" ? "last_ep_no_sub" : "last_ep"]: nextEpisode(episodes[episodes.length - 1]) });
    setBatchOpen(false);
  };
  const stop = () => setConfirmation({ title: "强制终止", description: "确定停止当前任务？未完成的压制输出会被清理，压制队列会被清空。", action: "确认终止", confirm: () => { setConfirmation(null); setQueueMode(null); void api.stopTask().catch(error => setNotice(String(error))); } });
  const remove = (id: string) => setTasks(previous => previous.filter(task => task.id !== id || task.status === "running"));
  const clear = () => { if (!visibleTasks.some(task => task.status === "running")) setTasks(previous => previous.filter(task => workflowOf(task) !== workflow)); };
  const reorder = (from: string, to: string) => setTasks(previous => {
    const next = [...previous], a = next.findIndex(task => task.id === from), b = next.findIndex(task => task.id === to);
    if (a < 0 || b < 0 || next[a].status === "running" || next[b].status === "running") return previous;
    const [item] = next.splice(a, 1); next.splice(b, 0, item); return next;
  });
  const submitName = (name: string) => {
    if (!state || !nameDialog) return;
    const target = nameDialog.target;
    if (target === null) {
      setState({ ...state, profiles: { ...state.profiles, [name]: newProfile(state.settings.default_params_matrix) } });
    } else {
      const profiles = Object.fromEntries(Object.entries(state.profiles).map(([key, value]) => [key === target ? name : key, value]));
      setState({ ...state, profiles });
      setTasks(previous => previous.map(task => task.profileName === target ? { ...task, profileName: name } : task));
      if (activeRef.current?.profileName === target) activeRef.current.profileName = name;
    }
    setProfileName(name); setNameDialog(null);
  };
  const deleteProfile = (name: string) => setConfirmation({ title: "删除配置", description: "确定删除配置「" + name + "」？", action: "删除配置", confirm: () => {
    setState(previous => { if (!previous) return previous; const profiles = { ...previous.profiles }; delete profiles[name]; return { ...previous, profiles }; });
    if (profileName === name) setProfileName(Object.keys(state?.profiles ?? {}).find(key => key !== name) ?? "");
    setConfirmation(null);
  } });
  const controls = { start: () => !activeRef.current && setQueueMode(workflow), stop, running, canStart: !running && visibleTasks.some(task => task.status === "pending") };

  if (!state) return <div className="loading"><div className="flex flex-col items-center gap-3">
    <p role={startupError ? "alert" : "status"}>{startupError || "正在加载配置…"}</p>
    {startupError && <Button variant="outline" onClick={() => window.location.reload()}>重新加载</Button>}
  </div></div>;
  return <><div className="app-shell">
    <aside className="sidebar">
      <div className="workflow-tabs"><Segmented items={["encode", "mux"]} value={workflow} onChange={value => updateSettings({ last_workflow: value as Workflow })} label="工作流程" /></div>
      <Button variant="outline" className="new-profile" onClick={() => setNameDialog({ target: null })}><Plus size={17} />新建配置</Button>
      <div className="profile-list" aria-label="配置列表">{Object.keys(state.profiles).map(name => <ContextMenu key={name}><ContextMenuTrigger asChild>
        <button className={name === profileName ? "profile active" : "profile"} aria-pressed={name === profileName} title={name} onClick={() => setProfileName(name)}>{name}</button>
      </ContextMenuTrigger><ContextMenuContent><ContextMenuItem onSelect={() => setNameDialog({ target: name })}><Pencil size={14} />重命名</ContextMenuItem><ContextMenuItem className="danger" onSelect={() => deleteProfile(name)}><Trash2 size={14} />删除配置</ContextMenuItem></ContextMenuContent></ContextMenu>)}</div>
      <div className="sidebar-bottom"><div className="sidebar-actions">
        <Button variant="outline" size="icon" aria-label="切换主题" title="切换深浅色模式" onClick={() => updateSettings({ theme_mode: dark ? "light" : "dark" })}>{dark ? <Sun size={17} /> : <Moon size={17} />}</Button>
        <Button variant="outline" size="icon" aria-label="全局设置" title="全局设置" onClick={() => setSettingsOpen(true)}><SettingsIcon size={17} /></Button>
      </div></div>
    </aside>
    <main className="main-content">
      {profile ? workflow === "encode" ? <EncodeWorkspace profile={profile} update={updateProfile} browse={browse} add={add} batch={() => setBatchOpen(true)} /> : <MuxWorkspace profile={profile} update={updateProfile} browse={browse} add={add} start={startDirect} running={running} /> : <div className="empty-state">从左侧新建配置，开始处理视频。</div>}
      <div className="bottom-grid"><QueuePanel queues={visibleTasks} reorder={reorder} remove={remove} clear={clear} controls={workflow === "mux" ? controls : undefined} />
        {workflow === "encode" ? <EncodeLogPanel metrics={metrics} log={logs.encode} clear={() => setLogs(previous => ({ ...previous, encode: [] }))} controls={controls} /> : <MuxLogPanel muxLog={logs.mux} subsetLog={logs.subset} clearMux={() => setLogs(previous => ({ ...previous, mux: [] }))} clearSubset={() => setLogs(previous => ({ ...previous, subset: [] }))} />}
      </div>
    </main>
    {nameDialog && <NameDialog target={nameDialog.target} names={Object.keys(state.profiles)} close={() => setNameDialog(null)} submit={submitName} />}
    {confirmation && <ConfirmDialog {...confirmation} close={() => setConfirmation(null)} />}
    {batchOpen && <BatchDialog close={() => setBatchOpen(false)} submit={batch} />}
    {settingsOpen && <SettingsDialog settings={state.settings} close={() => setSettingsOpen(false)} save={saveSettings} />}
  </div><Toaster theme={dark ? "dark" : "light"} position="bottom-center" closeButton /></>;
}
