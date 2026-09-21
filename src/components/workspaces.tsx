import { ListPlus, Play, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent } from "./ui/card";
import { Check, Field, Parameters, Segmented } from "./fields";
import { CODECS, HARDWARE, type Codec, type Hardware, type Profile, type QueueTask, type TaskType } from "../types";
import { emptyParams } from "../state";

type WorkspaceProps = { profile: Profile; update: (patch: Partial<Profile>) => void; browse: (key: keyof Profile, file?: boolean) => void };

export function EncodeWorkspace({ profile: p, update, browse, add, batch }: WorkspaceProps & {
  add: (kind: TaskType | "BOTH", ep: string, suffix: string) => void; batch: () => void;
}) {
  const mode = p.has_subtitle_mode ? "with_sub" : "no_sub";
  const hardware = p["selected_hw_" + mode] as Hardware;
  const codec = p["selected_codec_" + mode] as Codec;
  const matrixKey = p.has_subtitle_mode ? "param_matrix_with_sub" : "param_matrix_no_sub";
  const param = p[matrixKey][hardware]?.[codec] ?? emptyParams();
  const episodeKey = p.has_subtitle_mode ? "last_ep" : "last_ep_no_sub";
  const suffixEnabled = Boolean(p["suffix_enabled_" + mode]);
  const suffix = String(p["suffix_" + mode] ?? "[V2]");
  const setParam = (patch: Partial<typeof param>) => update({ [matrixKey]: { ...p[matrixKey], [hardware]: { ...p[matrixKey][hardware], [codec]: { ...param, ...patch } } } });
  const folder = (label: string, key: keyof Profile) => <Field label={label} value={String(p[key])} onChange={value => update({ [key]: value })} onBrowse={() => browse(key)} />;
  return <div className="workspace encode-workspace">
    <Card><CardContent className="encode-settings">
      <Segmented label="字幕模式" items={["with_sub", "no_sub"]} value={mode} onChange={value => update({ has_subtitle_mode: value === "with_sub" })} />
      {folder("源视频目录", p.has_subtitle_mode ? "source_dir_with_sub" : "source_dir_no_sub")}
      {!p.has_subtitle_mode && <Field label="源视频文件" value={p.source_no_sub} onChange={value => update({ source_no_sub: value })} placeholder="Title - S01E<ep>.mkv" />}
      {p.has_subtitle_mode && folder("字幕目录", "sub_dir")}
      {folder("输出目录", p.has_subtitle_mode ? "output_dir_with_sub" : "output_dir_no_sub")}
      {p.has_subtitle_mode ? <>
        <Field label="源视频文件" value={p.source_temp} onChange={value => update({ source_temp: value })} placeholder="Title - S01E<ep>.mkv" />
        <div className="encode-template-row"><Field label="简体字幕" value={p.sub_sc} onChange={value => update({ sub_sc: value })} /><Field label="输出名称" value={p.out_sc} onChange={value => update({ out_sc: value })} placeholder="Title - S01E<ep> - [CHS_JP].mp4" /></div>
        <div className="encode-template-row"><Field label="繁体字幕" value={p.sub_tc} onChange={value => update({ sub_tc: value })} /><Field label="输出名称" value={p.out_tc} onChange={value => update({ out_tc: value })} placeholder="Title - S01E<ep> - [CHT_JP].mp4" /></div>
      </> : <Field label="输出名称" value={p.out_no_sub} onChange={value => update({ out_no_sub: value })} placeholder="Title - S01E<ep>.mp4" />}
      <div className="params-head">
        <Segmented label="硬件" items={HARDWARE} value={hardware} onChange={value => update({ ["selected_hw_" + mode]: value })} />
        <Segmented label="编码器" items={CODECS} value={codec} onChange={value => update({ ["selected_codec_" + mode]: value })} />
        <span className="grow" /><Check label="启用 2-Pass Mode" checked={param.enable_2pass} onChange={value => setParam({ enable_2pass: value })} />
      </div>
      <Parameters value={param} onChange={setParam} />
    </CardContent></Card>
    <Card><CardContent className="encode-controls">
      <Field label="集数" className="episode-field" value={p[episodeKey]} onChange={value => update({ [episodeKey]: value })} />
      <Button variant="outline" onClick={batch}><ListPlus size={16} />批量多集</Button>
      <Check label="添加后缀" checked={suffixEnabled} onChange={value => update({ ["suffix_enabled_" + mode]: value })} />
      <Input className="suffix-input" aria-label="压制后缀" value={suffix} disabled={!suffixEnabled} onChange={event => update({ ["suffix_" + mode]: event.target.value })} />
      <span className="grow" />
      {p.has_subtitle_mode ? <>
        <Button variant="outline" onClick={() => add("SC", p[episodeKey], suffixEnabled ? suffix : "")}><Plus size={16} />简体</Button>
        <Button variant="outline" onClick={() => add("TC", p[episodeKey], suffixEnabled ? suffix : "")}><Plus size={16} />繁体</Button>
        <Button onClick={() => add("BOTH", p[episodeKey], suffixEnabled ? suffix : "")}><Plus size={16} />简繁</Button>
      </> : <Button onClick={() => add("NO_SUB", p[episodeKey], suffixEnabled ? suffix : "")}><Plus size={16} />添加任务</Button>}
    </CardContent></Card>
  </div>;
}

export function MuxWorkspace({ profile: p, update, browse, add, start, running }: WorkspaceProps & {
  add: (type: QueueTask["type"], ep: string, suffix?: string) => void;
  start: (type: QueueTask["type"], ep: string, suffix?: string) => void; running: boolean;
}) {
  const field = (label: string, key: keyof Profile, folder = false, placeholder = "") => <Field label={label} value={String(p[key])} onChange={value => update({ [key]: value })} onBrowse={folder ? () => browse(key) : undefined} compact placeholder={placeholder} />;
  const actions = (type: "extract" | "subset" | "mux") => {
    const ep = String(p[type + "_ep"]);
    const suffix = type === "mux" && p.mux_suffix_enabled ? p.mux_suffix.trim() : "";
    return <div className="section-actions"><Button variant="outline" onClick={() => add(type, ep, suffix)}><Plus size={16} />加入队列</Button><Button disabled={running} onClick={() => start(type, ep, suffix)}><Play size={16} />开始</Button></div>;
  };
  return <div className="workspace mux-workspace">
    <Card><CardContent className="mux-form" aria-label="提取轨道">
      <div className="two-col">{field("原视频", "extract_source_dir", true)}{field("视频名", "extract_source_name", false, "[Erai-raws] Title - <ep> <hash>.mkv")}</div>
      <div className="two-col">{field("输出", "extract_output_dir", true)}{field("输出名", "extract_output_name", false, "Title - S01E<ep>.mkv")}</div>
      <div className="chapter-row">
        <Field label="集数" className="episode-field" value={p.extract_ep} onChange={value => update({ extract_ep: value })} />
        <Field label="章节" value={p.extract_chapter_file} onChange={value => update({ extract_chapter_file: value })} compact onBrowse={() => browse("extract_chapter_file", true)} placeholder={"C:\\Folder\\<ep>\\CHAPTER<ep>.txt"} />
      </div>
      <div className="section-bottom">
        <div className="extract-options"><span className="field-label">去除</span>
          <Check label="字幕" checked={p.extract_keep_only_av || p.extract_no_subs} disabled={p.extract_keep_only_av} onChange={value => update({ extract_no_subs: value })} />
          <Check label="字体" checked={p.extract_keep_only_av || p.extract_no_fonts} disabled={p.extract_keep_only_av} onChange={value => update({ extract_no_fonts: value })} />
          <Check label="章节" checked={p.extract_keep_only_av || p.extract_no_chapters} disabled={p.extract_keep_only_av} onChange={value => update({ extract_no_chapters: value })} />
          <Check label="仅保留音视频" checked={p.extract_keep_only_av} onChange={value => update({ extract_keep_only_av: value, ...(value && { extract_no_subs: true, extract_no_fonts: true, extract_no_chapters: true }) })} />
          <Check label="清除轨道名称" checked={p.extract_remove_names} onChange={value => update({ extract_remove_names: value })} />
        </div>{actions("extract")}
      </div>
    </CardContent></Card>
    <Card><CardContent className="mux-form" aria-label="字体子集化">
      <div className="two-col">{field("字幕目录", "subset_sub_dir", true, "C:\\Folder\\<ep>")}{field("字体目录", "subset_font_dir", true)}</div>
      <div className="subset-row">
        <Field label="集数" className="episode-field" value={p.subset_ep} onChange={value => update({ subset_ep: value })} />
        {field("简体", "subset_sub_sc")}{field("繁体", "subset_sub_tc")}{actions("subset")}
      </div>
    </CardContent></Card>
    <Card><CardContent className="mux-form" aria-label="混流">
      <div className="two-col">{field("视频目录", "mux_video_dir", true)}{field("视频名", "mux_video_name", false, "Title - S01E<ep>.mkv")}</div>
      {field("子集目录", "mux_subset_dir", true, "C:\\Folder\\<ep>")}
      <div className="two-col">{field("输出目录", "mux_output_dir", true)}{field("输出名", "mux_output_name", false, "Title - S01E<ep>.mkv")}</div>
      <div className="subtitle-track">{field("简体", "mux_sub_sc")}{field("名称", "mux_sub_sc_name")}<Check label="简体默认轨" checked={p.mux_sub_sc_default} onChange={value => update({ mux_sub_sc_default: value })} /></div>
      <div className="subtitle-track">{field("繁体", "mux_sub_tc")}{field("名称", "mux_sub_tc_name")}<Check label="繁体默认轨" checked={p.mux_sub_tc_default} onChange={value => update({ mux_sub_tc_default: value })} /></div>
      <div className="section-bottom">
        <Field label="集数" className="episode-field" value={p.mux_ep} onChange={value => update({ mux_ep: value })} />
        <Check label="添加后缀" checked={p.mux_suffix_enabled} onChange={value => update({ mux_suffix_enabled: value })} />
        <Input className="suffix-input" aria-label="混流后缀" value={p.mux_suffix} disabled={!p.mux_suffix_enabled} onChange={event => update({ mux_suffix: event.target.value })} />
        {actions("mux")}
      </div>
    </CardContent></Card>
  </div>;
}
