import { useState } from "react";
import { api } from "../api";
import { CODECS, HARDWARE, type Settings } from "../types";
import { emptyParams } from "../state";
import { Check, Field, Parameters, Segmented } from "./fields";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { FontPicker } from "./font-picker";
import { Dialog, DialogContent, DialogDescription, DialogTitle, useDialogMotion } from "./ui/dialog";

export function NameDialog({ target, names, close, submit }: { target: string | null; names: string[]; close: () => void; submit: (name: string) => void }) {
  const { open, dismiss } = useDialogMotion(close);
  const [name, setName] = useState(target ?? "");
  const [error, setError] = useState("");
  return <Dialog open={open} onOpenChange={value => !value && dismiss()}><DialogContent className="name-dialog">
    <DialogTitle>{target === null ? "新建配置" : "重命名配置"}</DialogTitle>
    <DialogDescription>请输入配置名称。</DialogDescription>
    <form onSubmit={event => {
      event.preventDefault();
      const next = name.trim();
      if (!next) return setError("请输入配置名称");
      if (next !== target && names.includes(next)) return setError("该配置名称已存在");
      dismiss(() => submit(next));
    }}>
      <Input autoFocus aria-label="配置名称" value={name} onChange={event => { setName(event.target.value); setError(""); }} aria-invalid={!!error} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><Button type="button" variant="outline" onClick={() => dismiss()}>取消</Button><Button type="submit">{target === null ? "创建" : "确定"}</Button></div>
    </form>
  </DialogContent></Dialog>;
}

export function ConfirmDialog({ title, description, action, close, confirm }: { title: string; description: string; action: string; close: () => void; confirm: () => void }) {
  const { open, dismiss } = useDialogMotion(close);
  return <Dialog open={open} onOpenChange={value => !value && dismiss()}><DialogContent className="name-dialog">
    <DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription>
    <div className="dialog-actions"><Button variant="outline" onClick={() => dismiss()} autoFocus>取消</Button><Button variant="destructive" onClick={() => dismiss(confirm)}>{action}</Button></div>
  </DialogContent></Dialog>;
}

export type BatchKind = "SC" | "TC" | "BOTH" | "NO_SUB";
export function BatchDialog({ close, submit }: { close: () => void; submit: (episodes: string[], kind: BatchKind, suffix: string) => void }) {
  const { open, dismiss } = useDialogMotion(close);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [suffix, setSuffix] = useState("");
  const [error, setError] = useState("");
  const add = (kind: BatchKind) => {
    const s = start.trim(), e = end.trim();
    if (!s || !e) return setError("请输入起始和结束集数");
    if (!/^\d+$/.test(s) || !/^\d+$/.test(e)) return setError("集数必须为非负整数");
    const a = Number(s), b = Number(e), count = Math.abs(b - a) + 1;
    if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || count > 10000) return setError("每次最多添加 10000 集");
    const width = Math.max(s.length, e.length);
    dismiss(() => submit(Array.from({ length: count }, (_, i) => String(Math.min(a, b) + i).padStart(width, "0")), kind, suffix.trim()));
  };
  return <Dialog open={open} onOpenChange={value => !value && dismiss()}><DialogContent className="batch-dialog">
    <DialogTitle>批量添加多集</DialogTitle><DialogDescription className="sr-only">设置集数范围，选择要加入队列的字幕类型。</DialogDescription>
    <div className="range-fields"><Input aria-label="起始集数" value={start} onChange={event => setStart(event.target.value)} placeholder="01" /><span>~</span><Input aria-label="结束集数" value={end} onChange={event => setEnd(event.target.value)} placeholder="12" /></div>
    <Field label="后缀（可选）" value={suffix} onChange={setSuffix} placeholder="[V2]" />
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions"><Button variant="outline" onClick={() => add("SC")}>简体</Button><Button variant="outline" onClick={() => add("TC")}>繁体</Button><Button onClick={() => add("BOTH")}>简繁</Button><Button variant="outline" onClick={() => add("NO_SUB")}>无字幕</Button></div>
  </DialogContent></Dialog>;
}

export function SettingsDialog({ settings, close, save }: { settings: Settings; close: () => void; save: (settings: Settings) => Promise<void> }) {
  const { open, dismiss } = useDialogMotion(close);
  const [draft, setDraft] = useState(() => structuredClone(settings));
  const [page, setPage] = useState("常规");
  const [codec, setCodec] = useState("X264");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const update = (patch: Partial<Settings>) => { setDraft(current => ({ ...current, ...patch })); setMessage(""); };
  const current = draft.default_params_matrix[page]?.[codec] ?? emptyParams();
  const pick = async (key: keyof Settings, file = false) => {
    try { const value = file ? await api.pickFile() : await api.pickFolder(); if (value) update({ [key]: value }); }
    catch (error) { setMessage(String(error)); }
  };
  const apply = async (exit: boolean) => {
    setSaving(true);
    try { await save(draft); setMessage("设置已保存"); if (exit) dismiss(); }
    catch (error) { setMessage("保存失败：" + String(error)); }
    finally { setSaving(false); }
  };
  return <Dialog open={open} onOpenChange={value => !value && !saving && dismiss()}><DialogContent className="settings-dialog">
    <DialogTitle>全局设置</DialogTitle><DialogDescription className="sr-only">设置界面字体、工具路径、自动化行为和新配置的默认编码参数。点击应用或确定后保存。</DialogDescription>
    <div className="settings-layout">
      <nav className="settings-nav" aria-label="设置分类">{["常规", ...HARDWARE].map(item => <Button variant={item === page ? "secondary" : "ghost"} aria-pressed={item === page} key={item} onClick={() => setPage(item)}>{item === "常规" ? item : item + " 默认参数"}</Button>)}</nav>
      <div className="settings-scroll" key={page}>
        {page === "常规" ? <div className="setting-stack">
          <h3>界面</h3><FontPicker value={draft.font_family ?? ""} onChange={font_family => update({ font_family })} disabled={saving} />
          <h3>存储路径配置</h3><Field label="配置根目录" value={draft.base_path} onChange={value => update({ base_path: value })} onBrowse={() => pick("base_path")} compact />
          <Check label="在目录下创建独立文件夹" checked={draft.use_sub_folder} onChange={value => update({ use_sub_folder: value })} />
          <Field label="文件夹名称" value={draft.folder_name} disabled={!draft.use_sub_folder} onChange={value => update({ folder_name: value })} />
          <h3>工具路径配置</h3><Field label="MKVToolNix" value={draft.mkvmerge_path} onChange={value => update({ mkvmerge_path: value })} onBrowse={() => pick("mkvmerge_path", true)} compact />
          <Field label="AssFontSubset" value={draft.assfontsubset_path} onChange={value => update({ assfontsubset_path: value })} onBrowse={() => pick("assfontsubset_path", true)} compact />
          <h3>自动化设置</h3>
          <Check label="压制完成后集数自动 +1" checked={draft.auto_ep_encode} onChange={value => update({ auto_ep_encode: value })} />
          <Check label="封装完成后集数自动 +1" checked={draft.auto_ep_mux} onChange={value => update({ auto_ep_mux: value })} />
          <Check label="有字幕和无字幕集数独立计数" checked={draft.ep_not_shared} onChange={value => update({ ep_not_shared: value })} />
          <h3>关闭行为</h3><Segmented label="关闭行为" items={["tray", "exit"]} value={draft.close_behavior} onChange={value => update({ close_behavior: value as Settings["close_behavior"] })} />
        </div> : <div className="setting-stack">
          <h3>{page} 新配置默认参数</h3>
          <Segmented label="默认编码器" items={CODECS} value={codec} onChange={setCodec} />
          <Check label="启用 2-Pass Mode" checked={current.enable_2pass} onChange={value => update({ default_params_matrix: { ...draft.default_params_matrix, [page]: { ...draft.default_params_matrix[page], [codec]: { ...current, enable_2pass: value } } } })} />
          <Parameters value={current} onChange={patch => update({ default_params_matrix: { ...draft.default_params_matrix, [page]: { ...draft.default_params_matrix[page], [codec]: { ...current, ...patch } } } })} />
        </div>}
      </div>
    </div>
    <div className="dialog-actions"><span className="save-message" role="status">{message}</span><Button variant="outline" disabled={saving} onClick={() => dismiss()}>取消</Button><Button variant="outline" disabled={saving} onClick={() => void apply(false)}>应用</Button><Button disabled={saving} onClick={() => void apply(true)}>确定</Button></div>
  </DialogContent></Dialog>;
}
