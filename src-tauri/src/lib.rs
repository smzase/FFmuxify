#![recursion_limit = "256"]
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::{json, Map, Value};
use std::{fs, io::{BufRead, BufReader}, path::{Path, PathBuf}, process::{Child, Command, Stdio}, sync::{atomic::{AtomicBool, Ordering}, Arc, Mutex}, thread, time::Instant};
use tauri::{menu::MenuBuilder, tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState}, AppHandle, Emitter, Manager, Theme, WindowEvent};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use tauri_plugin_dialog::DialogExt;

static PROCESS: Lazy<Arc<Mutex<Option<Child>>>> = Lazy::new(|| Arc::new(Mutex::new(None)));
static RUNNING: AtomicBool = AtomicBool::new(false);
static STOP_REQUESTED: AtomicBool = AtomicBool::new(false);
const HARDWARE: [&str; 4] = ["CPU", "QSV", "NVENC", "VCN"];
const CODECS: [&str; 4] = ["X264", "X265", "X266", "AV1"];

fn empty_params() -> Value { json!({"crf":"","pass1":"","pass2":"","enable_2pass":false}) }
fn default_matrix() -> Value {
    let mut outer = Map::new();
    for hw in HARDWARE { let mut inner = Map::new(); for codec in CODECS { inner.insert(codec.to_string(), empty_params()); } outer.insert(hw.to_string(), Value::Object(inner)); }
    Value::Object(outer)
}
fn default_profile() -> Value {
    json!({
      "has_subtitle_mode":true,"source_dir_with_sub":"","output_dir_with_sub":"","source_dir_no_sub":"","output_dir_no_sub":"","source_temp":"","sub_dir":"","sub_sc":"","sub_tc":"","out_sc":"","out_tc":"","source_no_sub":"","out_no_sub":"","last_ep":"01","last_ep_no_sub":"01","selected_hw_with_sub":"CPU","selected_codec_with_sub":"X264","selected_hw_no_sub":"CPU","selected_codec_no_sub":"X264","param_matrix_with_sub":default_matrix(),"param_matrix_no_sub":default_matrix(),
      "extract_source_dir":"","extract_source_name":"","extract_output_dir":"","extract_output_name":"","extract_ep":"01","extract_chapter_file":"","extract_no_subs":false,"extract_no_fonts":false,"extract_no_chapters":false,"extract_keep_only_av":false,"extract_remove_names":false,
      "subset_sub_dir":"","subset_font_dir":"","subset_ep":"01","subset_sub_sc":"<ep>.zh-hans.ass","subset_sub_tc":"<ep>.zh-hant.ass","mux_video_dir":"","mux_video_name":"","mux_subset_dir":"","mux_output_dir":"","mux_output_name":"","mux_ep":"01","mux_sub_sc":"<ep>.zh-hans.ass","mux_sub_sc_name":"简体中文&日语","mux_sub_sc_default":true,"mux_sub_tc":"<ep>.zh-hant.ass","mux_sub_tc_name":"繁體中文&日語","mux_sub_tc_default":false,"mux_suffix":"[V2]"
    })
}
fn default_settings() -> Value { json!({"base_path":"","use_sub_folder":true,"folder_name":"ffmpeg smzase","theme_mode":"light","mkvmerge_path":"","assfontsubset_path":"","auto_ep_encode":true,"auto_ep_mux":true,"ep_not_shared":true,"close_behavior":"tray","last_workflow":"encode","default_params_matrix":default_matrix()}) }
fn merge_profile_defaults(profile: &mut Value) {
    let defaults = default_profile();
    for suffix in ["with_sub", "no_sub"] {
        for selector in ["hw", "codec"] {
            let key = format!("selected_{selector}_{suffix}");
            if profile.get(&key).is_none() {
                let legacy = format!("selected_{selector}");
                profile[&key] = profile.get(&legacy).cloned().unwrap_or_else(|| json!(if selector == "hw" { "CPU" } else { "X264" }));
            }
        }
        let enabled = format!("suffix_enabled_{suffix}");
        let text = format!("suffix_{suffix}");
        if profile.get(&enabled).is_none() { profile[&enabled] = json!(false); }
        if profile.get(&text).is_none() { profile[&text] = json!("[V2]"); }
    }
    if profile.get("last_ep_no_sub").is_none() { profile["last_ep_no_sub"] = profile.get("last_ep").cloned().unwrap_or(json!("01")); }
    if profile.get("mux_suffix_enabled").is_none() { profile["mux_suffix_enabled"] = json!(false); }
    if profile.get("param_matrix_with_sub").is_none() {
        if let Some(old) = profile.get("param_matrix").cloned() {
            profile["param_matrix_with_sub"] = old.clone();
            profile["param_matrix_no_sub"] = old;
        } else {
            let mut matrix = default_matrix();
            if let Some(cpu_x264) = matrix.get_mut("CPU").and_then(|x| x.get_mut("X264")) {
                cpu_x264["crf"] = profile.get("params_crf").cloned().unwrap_or(json!(""));
                cpu_x264["pass1"] = profile.get("params_pass1").cloned().unwrap_or(json!(""));
                cpu_x264["pass2"] = profile.get("params_pass2").cloned().unwrap_or(json!(""));
                cpu_x264["enable_2pass"] = profile.get("enable_2pass").cloned().unwrap_or(json!(false));
            }
            profile["param_matrix_with_sub"] = matrix.clone();
            profile["param_matrix_no_sub"] = matrix;
        }
    }
    if let (Some(target), Some(source)) = (profile.as_object_mut(), defaults.as_object()) {
        for (key, value) in source { target.entry(key.clone()).or_insert_with(|| value.clone()); }
    }
    for matrix_key in ["param_matrix_with_sub", "param_matrix_no_sub"] {
        let defaults = default_matrix();
        for hw in HARDWARE { for codec in CODECS {
            if profile[matrix_key].get(hw).and_then(|x| x.get(codec)).is_none() { profile[matrix_key][hw][codec] = defaults[hw][codec].clone(); }
            if profile[matrix_key][hw][codec].get("enable_2pass").is_none() { profile[matrix_key][hw][codec]["enable_2pass"] = json!(false); }
        }}
    }
    if s(profile, "source_dir_with_sub").is_empty() { profile["source_dir_with_sub"] = profile.get("source_dir").cloned().unwrap_or(json!("")); }
    if s(profile, "source_dir_no_sub").is_empty() { profile["source_dir_no_sub"] = profile.get("source_dir").cloned().unwrap_or(json!("")); }
    if s(profile, "output_dir_with_sub").is_empty() { profile["output_dir_with_sub"] = profile.get("output_dir").cloned().unwrap_or(json!("")); }
    if s(profile, "output_dir_no_sub").is_empty() { profile["output_dir_no_sub"] = profile.get("output_dir").cloned().unwrap_or(json!("")); }
}
fn normalize_profiles(mut profiles: Value) -> Value {
    if let Some(items) = profiles.as_object_mut() { for profile in items.values_mut() { merge_profile_defaults(profile); } }
    profiles
}
fn documents_dir() -> PathBuf { std::env::var_os("USERPROFILE").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("." )).join("Documents") }
fn config_override() -> Option<PathBuf> { std::env::var_os("FFMUXIFY_CONFIG_DIR").filter(|value| !value.is_empty()).map(PathBuf::from) }
fn startup_dir() -> PathBuf { config_override().unwrap_or_else(|| documents_dir().join("ffmpeg smzase")) }
fn config_dir(settings: &Value) -> PathBuf { if let Some(path) = config_override() { return path; } let base = settings.get("base_path").and_then(Value::as_str).filter(|x| !x.is_empty()).map(PathBuf::from).unwrap_or_else(documents_dir); if settings.get("use_sub_folder").and_then(Value::as_bool).unwrap_or(true) { base.join(settings.get("folder_name").and_then(Value::as_str).unwrap_or("ffmpeg smzase")) } else { base } }
fn read_json(path: &Path, fallback: Value) -> Value { fs::read_to_string(path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(fallback) }
fn merge_defaults(mut defaults: Value, loaded: Value) -> Value { if let (Value::Object(dst), Value::Object(src)) = (&mut defaults, loaded) { for (k,v) in src { dst.insert(k,v); } } defaults }

#[tauri::command]
fn load_state() -> Value {
    let fallback = default_settings();
    let initial_path = startup_dir().join("app_settings.json");
    let settings = merge_defaults(fallback, read_json(&initial_path, read_json(Path::new("app_settings.json"), json!({}))));
    let dir = config_dir(&settings); let _ = fs::create_dir_all(&dir);
    let settings = merge_defaults(settings, read_json(&dir.join("app_settings.json"), json!({})));
    let profiles = normalize_profiles(read_json(&dir.join("profiles.json"), json!({})));
    json!({"settings":settings,"profiles":profiles,"config_dir":dir.to_string_lossy()})
}

#[tauri::command]
fn save_state(settings: Value, profiles: Value) -> Result<Value, String> {
    let dir = config_dir(&settings); fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("app_settings.json"), serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::write(dir.join("profiles.json"), serde_json::to_string_pretty(&profiles).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    // Keep the startup locator in the legacy default directory when storage moves.
    let initial = startup_dir();
    if initial != dir {
        fs::create_dir_all(&initial).map_err(|e| e.to_string())?;
        fs::write(initial.join("app_settings.json"), serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    }
    Ok(json!({"settings":settings,"profiles":profiles,"config_dir":dir.to_string_lossy()}))
}

#[tauri::command]
async fn pick_folder(app: AppHandle) -> Option<String> { app.dialog().file().blocking_pick_folder().map(|p| p.to_string()) }
#[tauri::command]
async fn pick_file(app: AppHandle) -> Option<String> { app.dialog().file().blocking_pick_file().map(|p| p.to_string()) }

fn s(profile: &Value, key: &str) -> String { profile.get(key).and_then(Value::as_str).unwrap_or("").to_string() }
fn b(profile: &Value, key: &str, default: bool) -> bool { profile.get(key).and_then(Value::as_bool).unwrap_or(default) }
fn replace_ep(input: &str, ep: &str) -> String { input.replace("<ep>", ep) }
fn resolve_file(directory: &str, template: &str, ep: &str) -> Option<String> {
    if directory.is_empty() || template.is_empty() { return None; }
    let name = replace_ep(template, ep); let dir = Path::new(directory);
    if !name.contains('*') && !name.contains("<hash>") { let p = dir.join(name); return p.exists().then(|| p.to_string_lossy().into_owned()); }
    let mut pattern = regex::escape(&name).replace("<hash>", r"(?:\[[^\]]+\])+").replace("\\*", ".*");
    pattern = format!("^(?i:{pattern})$"); let re = Regex::new(&pattern).ok()?;
    fs::read_dir(dir).ok()?.filter_map(Result::ok).find_map(|entry| { let f = entry.file_name().to_string_lossy().into_owned(); re.is_match(&f).then(|| entry.path().to_string_lossy().into_owned()) })
}
fn param_set(profile: &Value, task_type: &str) -> Value {
    let suffix = if task_type == "NO_SUB" { "no_sub" } else { "with_sub" }; let hw = profile.get(&format!("selected_hw_{suffix}")).and_then(Value::as_str).unwrap_or("CPU"); let codec = profile.get(&format!("selected_codec_{suffix}")).and_then(Value::as_str).unwrap_or("X264"); profile.get(&format!("param_matrix_{suffix}")).and_then(|m| m.get(hw)).and_then(|m| m.get(codec)).cloned().unwrap_or_else(empty_params)
}
fn param_text(params: &Value, key: &str) -> String { params.get(key).and_then(Value::as_str).unwrap_or("").replace(['\n','\r'], " ").trim().to_string() }
fn pass_params(params: &str, pass: usize, passlog: &str) -> String {
    let has_pass = Regex::new(&format!(r"(?:^|\s)-pass(?:\s+|=){pass}(?:\s|$)")).unwrap().is_match(params);
    let has_log = Regex::new(r"(?:^|\s)-passlogfile(?:\s|=)").unwrap().is_match(params);
    format!("{}{}{}", if has_log { String::new() } else { format!("-passlogfile \"{passlog}\" ") }, if has_pass { String::new() } else { format!("-pass {pass} ") }, params)
}
fn encode_commands(task: &Value) -> Result<(Vec<String>, String, String, Vec<String>), String> {
    let profile = task.get("profile").ok_or("missing profile")?; let ep = task.get("ep").and_then(Value::as_str).unwrap_or("01"); let kind = task.get("type").and_then(Value::as_str).unwrap_or("NO_SUB"); let suffix = task.get("suffix").and_then(Value::as_str).unwrap_or("").to_string();
    let (src_dir, out_dir, src_t, out_t, sub) = match kind { "NO_SUB" => (s(profile,"source_dir_no_sub"),s(profile,"output_dir_no_sub"),s(profile,"source_no_sub"),s(profile,"out_no_sub"),None), "SC" => (s(profile,"source_dir_with_sub"),s(profile,"output_dir_with_sub"),s(profile,"source_temp"),s(profile,"out_sc"),Some((s(profile,"sub_dir"),s(profile,"sub_sc")))), _ => (s(profile,"source_dir_with_sub"),s(profile,"output_dir_with_sub"),s(profile,"source_temp"),s(profile,"out_tc"),Some((s(profile,"sub_dir"),s(profile,"sub_tc")))) };
    let src = resolve_file(&src_dir, &src_t, ep).ok_or_else(|| format!("❌ 文件缺失: {}", replace_ep(&src_t,ep)))?; let sub_file = sub.as_ref().and_then(|(dir,t)| resolve_file(dir,t,ep)); if kind != "NO_SUB" && sub_file.is_none() { return Err(format!("❌ 字幕文件缺失: {}", replace_ep(&sub.as_ref().unwrap().1,ep))); }
    let mut output_name = replace_ep(&out_t,ep); if !suffix.is_empty() { let p = Path::new(&output_name); let stem = p.file_stem().and_then(|x|x.to_str()).unwrap_or(&output_name); let ext = p.extension().and_then(|x|x.to_str()).map(|x| format!(".{x}")).unwrap_or_default(); output_name = format!("{stem}{suffix}{ext}"); } if output_name.is_empty() { output_name = format!("output_{ep}.mp4"); }
    let output = Path::new(&out_dir).join(output_name).to_string_lossy().into_owned(); let params = param_set(profile,kind); let two = b(&params,"enable_2pass",false); let (p1,p2,crf) = (param_text(&params,"pass1"),param_text(&params,"pass2"),param_text(&params,"crf")); let work = sub.as_ref().map(|x| x.0.clone()).unwrap_or_else(|| out_dir.clone()); let passlog = Path::new(&work).join("ffmpeg2pass").to_string_lossy().into_owned();
    let filter = sub_file.as_ref().map(|p| format!(" -vf \"subtitles='{}'\"", Path::new(p).file_name().unwrap_or_default().to_string_lossy())).unwrap_or_default(); let mut commands = Vec::new();
    if two { let a = pass_params(&p1, 1, &passlog); let b2 = pass_params(&p2, 2, &passlog); commands.push(format!("ffmpeg -y -i \"{src}\"{filter} {a}")); commands.push(format!("ffmpeg -y -i \"{src}\"{filter} {b2} \"{output}\"")); } else { commands.push(format!("ffmpeg -y -i \"{src}\"{filter} {crf} \"{output}\"")); }
    let temps = if two { vec![format!("{passlog}-0.log"),format!("{passlog}-0.log.mbtree")] } else { vec![] }; Ok((commands,work,output,temps))
}
fn quote(value: impl AsRef<str>) -> String { format!("\"{}\"", value.as_ref().replace('"', "\\\"")) }
fn require_tool(path: &str, label: &str) -> Result<(), String> {
    if path.is_empty() || !Path::new(path).exists() { Err(format!("请先在设置中配置 {label} 路径")) } else { Ok(()) }
}
fn mux_commands(task: &Value) -> Result<(String, String), String> {
    let profile = task.get("profile").ok_or("missing profile")?;
    let ep = task.get("ep").and_then(Value::as_str).unwrap_or("01");
    match task.get("type").and_then(Value::as_str).unwrap_or("mux") {
        "extract" => {
            let mkvmerge = s(profile, "mkvmerge_path"); require_tool(&mkvmerge, "mkvmerge.exe")?;
            let source_dir = s(profile, "extract_source_dir");
            let source = resolve_file(&source_dir, &s(profile, "extract_source_name"), ep).ok_or_else(|| format!("源文件不存在: {}", replace_ep(&s(profile, "extract_source_name"), ep)))?;
            let output_dir = s(profile, "extract_output_dir");
            if output_dir.is_empty() { return Err("请配置输出目录".into()); }
            let output = Path::new(&output_dir).join(replace_ep(&s(profile, "extract_output_name"), ep));
            let mut args = vec!["-o".into(), quote(output.to_string_lossy())];
            if b(profile, "extract_keep_only_av", false) { args.extend(["--no-subtitles".into(), "--no-attachments".into(), "--no-chapters".into()]); }
            else {
                if b(profile, "extract_no_subs", false) { args.push("--no-subtitles".into()); }
                if b(profile, "extract_no_fonts", false) { args.push("--no-attachments".into()); }
                if b(profile, "extract_no_chapters", false) { args.push("--no-chapters".into()); }
            }
            if b(profile, "extract_remove_names", false) { args.extend(["--track-name".into(), "0:".into(), "--track-name".into(), "1:".into()]); }
            args.extend(["(".into(), quote(&source), ")".into()]);
            let chapter = replace_ep(&s(profile, "extract_chapter_file"), ep);
            if !chapter.is_empty() && Path::new(&chapter).exists() { args.extend(["--chapter-language".into(), "zh".into(), "--chapter-charset".into(), "UTF-8".into(), "--chapters".into(), quote(chapter)]); }
            args.extend(["--track-order".into(), "0:0,0:1".into()]);
            Ok((format!("{} {}", quote(mkvmerge), args.join(" ")), source_dir))
        }
        "subset" => {
            let executable = s(profile, "assfontsubset_path"); require_tool(&executable, "AssFontSubset.Console.exe")?;
            let subtitle_dir = replace_ep(&s(profile, "subset_sub_dir"), ep);
            let font_dir = s(profile, "subset_font_dir");
            if subtitle_dir.is_empty() || font_dir.is_empty() { return Err("请配置字幕目录和字体目录".into()); }
            let files: Vec<String> = fs::read_dir(&subtitle_dir).map_err(|e| e.to_string())?.filter_map(Result::ok).map(|x| x.path()).filter(|x| x.extension().and_then(|e| e.to_str()).map(|e| e.eq_ignore_ascii_case("ass")).unwrap_or(false)).map(|x| quote(x.to_string_lossy())).collect();
            if files.is_empty() { return Err("未找到 .ass 文件".into()); }
            Ok((format!("{} {} --fonts {}", quote(executable), files.join(" "), quote(font_dir)), subtitle_dir))
        }
        _ => {
            let mkvmerge = s(profile, "mkvmerge_path"); require_tool(&mkvmerge, "mkvmerge.exe")?;
            let video_dir = s(profile, "mux_video_dir");
            let video = Path::new(&video_dir).join(replace_ep(&s(profile, "mux_video_name"), ep));
            if !video.exists() { return Err(format!("视频文件不存在: {}", video.to_string_lossy())); }
            let output_dir = s(profile, "mux_output_dir");
            if video_dir.is_empty() || s(profile, "mux_video_name").is_empty() || output_dir.is_empty() {
                return Err("请配置视频目录、视频名和输出目录".into());
            }
            let mut output_name = replace_ep(&s(profile, "mux_output_name"), ep);
            let suffix = task.get("suffix").and_then(Value::as_str).unwrap_or("");
            if !suffix.is_empty() { let path = Path::new(&output_name); output_name = format!("{}{}{}", path.file_stem().unwrap_or_default().to_string_lossy(), suffix, path.extension().map(|x| format!(".{}", x.to_string_lossy())).unwrap_or_default()); }
            let output = Path::new(&output_dir).join(output_name);
            let subset_dir = replace_ep(&s(profile, "mux_subset_dir"), ep);
            let nested = Path::new(&subset_dir).join("output");
            let base = PathBuf::from(&subset_dir);
            let already_output = base.file_name().map(|name| name.to_string_lossy().eq_ignore_ascii_case("output")).unwrap_or(false);
            let actual = if !already_output && nested.is_dir() { nested } else { base };
            let mut args = vec!["-o".into(), quote(output.to_string_lossy()), quote(video.to_string_lossy())];
            let mut order = vec!["0:0".to_string(), "0:1".to_string()];
            let mut index = 1;
            for (template, name_key, language, default_key) in [(s(profile,"mux_sub_sc"),"mux_sub_sc_name","zh-Hans","mux_sub_sc_default"),(s(profile,"mux_sub_tc"),"mux_sub_tc_name","zh-Hant","mux_sub_tc_default")] {
                let subtitle = actual.join(replace_ep(&template, ep));
                if !subset_dir.is_empty() && !template.is_empty() && subtitle.is_file() {
                    let default = if b(profile, default_key, false) { "yes" } else { "no" };
                    args.extend(["--language".into(), format!("0:{language}"), "--track-name".into(), format!("0:{}", quote(s(profile, name_key))), "--default-track".into(), format!("0:{default}"), "(".into(), quote(subtitle.to_string_lossy()), ")".into()]);
                    order.push(format!("{index}:0")); index += 1;
                }
            }
            if !subset_dir.is_empty() && actual.is_dir() {
                for font in fs::read_dir(&actual).into_iter().flatten().filter_map(Result::ok).map(|x| x.path()).filter(|x| x.extension().and_then(|e| e.to_str()).map(|e| ["ttf","otf","ttc"].contains(&e.to_ascii_lowercase().as_str())).unwrap_or(false)) {
                    let filename = font.file_name().unwrap_or_default().to_string_lossy();
                    let mime = if font.extension().and_then(|e|e.to_str()).map(|e|e.eq_ignore_ascii_case("otf")).unwrap_or(false) { "application/vnd.ms-opentype" } else { "application/x-truetype-font" };
                    args.extend(["--attachment-name".into(), quote(filename), "--attachment-mime-type".into(), mime.into(), "--attach-file".into(), quote(font.to_string_lossy())]);
                }
            }
            args.extend(["--track-order".into(), order.join(",")]);
            Ok((format!("{} {}", quote(mkvmerge), args.join(" ")), video_dir))
        }
    }
}
fn emit(app: &AppHandle, event: &str, payload: Value) { let _ = app.emit(event, payload); }
fn timestamp_seconds(value: &str) -> Option<f64> {
    let parts: Vec<_> = value.split(':').collect();
    if parts.len() != 3 { return None; }
    Some(parts[0].parse::<f64>().ok()? * 3600.0 + parts[1].parse::<f64>().ok()? * 60.0 + parts[2].parse::<f64>().ok()?)
}
fn read_output(mut reader: impl BufRead, mut on_line: impl FnMut(String)) -> std::io::Result<()> {
    // FFmpeg's live status uses carriage returns without newlines.
    let mut pending = Vec::new();
    loop {
        let buffer = reader.fill_buf()?;
        if buffer.is_empty() { break; }
        for byte in buffer {
            if *byte == b'\r' || *byte == b'\n' {
                if !pending.is_empty() {
                    on_line(String::from_utf8_lossy(&pending).into_owned());
                    pending.clear();
                }
            } else { pending.push(*byte); }
        }
        let consumed = buffer.len();
        reader.consume(consumed);
    }
    if !pending.is_empty() { on_line(String::from_utf8_lossy(&pending).into_owned()); }
    Ok(())
}
fn shell_command(command: &str) -> Command {
    let mut builder = Command::new("cmd");
    builder.args(["/D", "/S", "/C"]);
    let redirected = format!("\"{command} 2>&1\"");
    // cmd.exe has different escaping rules from the C runtime used by Command::arg.
    #[cfg(windows)]
    { builder.raw_arg(&redirected).creation_flags(0x08000000); }
    #[cfg(not(windows))]
    builder.arg(&redirected);
    builder
}
fn execute(app: &AppHandle, id: &str, command: &str, work_dir: &str, pass: usize, steps: usize) -> bool {
    if STOP_REQUESTED.load(Ordering::SeqCst) { return false; }
    emit(app, "task-output", json!({"id":id,"line": format!("Working Directory: {work_dir}")}));
    if steps > 1 { emit(app, "task-output", json!({"id":id,"line": format!("正在执行 Step {pass}/{steps}: Pass {pass}")})); }
    emit(app, "task-output", json!({"id":id,"line": format!("Executing: {command}")}));
    let mut builder = shell_command(command);
    builder.current_dir(work_dir).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = match builder.spawn() {
        Ok(c) => c,
        Err(e) => { emit(app, "task-output", json!({"id":id,"line": format!("🔴 [系统异常] 无法启动进程: {e}")})); return false; }
    };
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let error_app = app.clone();
    let error_id = id.to_string();
    let error_reader = thread::spawn(move || {
        if let Some(stderr) = stderr {
            let _ = read_output(BufReader::new(stderr), |line| emit(&error_app, "task-output", json!({"id":error_id,"line":line})));
        }
    });
    if let Ok(mut lock) = PROCESS.lock() { *lock = Some(child); }
    if STOP_REQUESTED.load(Ordering::SeqCst) { stop_task(); }
    let duration_re = Regex::new(r"Duration: (\d+:\d+:\d+\.\d+)").expect("duration regex");
    let time_re = Regex::new(r"time=\s*(\d+:\d+:\d+\.\d+)").expect("progress regex");
    let mut duration = None;
    if let Some(out) = stdout {
        let _ = read_output(BufReader::new(out), |line| {
            if duration.is_none() { duration = duration_re.captures(&line).and_then(|c| timestamp_seconds(&c[1])); }
            let progress = time_re.captures(&line).and_then(|c| timestamp_seconds(&c[1])).zip(duration).map(|(current, total)| (current / total).clamp(0.0, 1.0));
            emit(app, "task-output", json!({"id":id,"line": line, "progress": progress, "pass": if steps > 1 { pass } else { 2 }}));
        });
    }
    let child = PROCESS.lock().ok().and_then(|mut lock| lock.take());
    let status = child.and_then(|mut child| child.wait().ok());
    let _ = error_reader.join();
    let success = status.map(|status| status.success()).unwrap_or(false);
    if !success && !STOP_REQUESTED.load(Ordering::SeqCst) {
        emit(app, "task-output", json!({"id":id,"line":format!("进程异常退出: {status:?}")}));
    }
    success && !STOP_REQUESTED.load(Ordering::SeqCst)
}
#[tauri::command]
fn run_task(app: AppHandle, task: Value) -> Result<String, String> {
    if RUNNING.load(Ordering::SeqCst) { return Err("已有任务正在运行".into()); }
    let kind = task.get("type").and_then(Value::as_str).unwrap_or("");
    let (commands, work, output, temps) = if ["NO_SUB", "SC", "TC"].contains(&kind) {
        let x = encode_commands(&task)?; (x.0, x.1, Some(x.2), x.3)
    } else {
        let x = mux_commands(&task)?; (vec![x.0], x.1, None, vec![])
    };
    let id = task.get("id").and_then(Value::as_str).unwrap_or("task").to_string();
    let event_id = id.clone();
    if RUNNING.swap(true, Ordering::SeqCst) { return Err("已有任务正在运行".into()); }
    STOP_REQUESTED.store(false, Ordering::SeqCst);
    thread::spawn(move || {
        let started = Instant::now();
        let mut success = true;
        let previous_output = output.as_ref().and_then(|path| fs::metadata(path).ok()).map(|meta| (meta.len(), meta.modified().ok()));
        for (index, command) in commands.iter().enumerate() { if !execute(&app, &event_id, command, &work, index + 1, commands.len()) { success = false; break; } }
        for temp in temps { let _ = fs::remove_file(temp); }
        let stopped = STOP_REQUESTED.load(Ordering::SeqCst);
        if stopped {
            if let Some(path) = &output {
                let current = fs::metadata(path).ok().map(|meta| (meta.len(), meta.modified().ok()));
                if current.is_some() && current != previous_output {
                    if fs::remove_file(path).is_ok() { emit(&app, "task-output", json!({"id":event_id,"line":format!("已删除未完成文件: {path}")})); }
                }
            }
        }
        RUNNING.store(false, Ordering::SeqCst);
        emit(&app, "task-finished", json!({"id":event_id,"success": success && !stopped,"stopped":stopped, "output_file": output, "duration": format!("{}s", started.elapsed().as_secs())}));
    });
    Ok(id)
}

#[tauri::command]
fn stop_task() -> bool {
    STOP_REQUESTED.store(true, Ordering::SeqCst);
    if let Ok(lock) = PROCESS.lock() {
        if let Some(child) = lock.as_ref() {
            let mut command = Command::new("taskkill");
            command.args(["/F", "/T", "/PID", &child.id().to_string()]).stdout(Stdio::null()).stderr(Stdio::null());
            #[cfg(windows)]
            command.creation_flags(0x08000000);
            let _ = command.status();
            return true;
        }
    }
    RUNNING.load(Ordering::SeqCst)
}

#[tauri::command]
fn set_theme(window: tauri::WebviewWindow, dark: bool) -> Result<(), String> {
    window.set_theme(Some(if dark { Theme::Dark } else { Theme::Light })).map_err(|error| error.to_string())
}

#[tauri::command]
async fn finish_close(app: AppHandle, window: tauri::WebviewWindow, exit: bool) -> Result<(), String> {
    let mut saved = load_state();
    let maximized = window.is_maximized().unwrap_or(false);
    saved["settings"]["window_maximized"] = json!(maximized);
    if !maximized && !window.is_minimized().unwrap_or(false) {
        if let (Ok(position), Ok(size), Ok(scale)) = (window.outer_position(), window.inner_size(), window.scale_factor()) {
            let position = position.to_logical::<f64>(scale);
            let size = size.to_logical::<f64>(scale);
            saved["settings"]["window_geometry"] = json!([position.x, position.y, size.width, size.height]);
        }
    }
    save_state(saved["settings"].clone(), saved["profiles"].clone())?;
    if exit {
        if RUNNING.load(Ordering::SeqCst) {
            stop_task();
            tauri::async_runtime::spawn_blocking(|| {
                while RUNNING.load(Ordering::SeqCst) { thread::sleep(std::time::Duration::from_millis(25)); }
            }).await.map_err(|error| error.to_string())?;
        }
        app.exit(0);
    } else { window.hide().map_err(|error| error.to_string())?; }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.unminimize(); let _ = window.set_focus(); }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(PROCESS.clone())
        .setup(|app| {
            let settings = load_state();
            if let Some(window) = app.get_webview_window("main") {
                let dark = settings["settings"]["theme_mode"].as_str() == Some("dark");
                let _ = window.set_theme(Some(if dark { Theme::Dark } else { Theme::Light }));
                if let Some(geometry) = settings["settings"]["window_geometry"].as_array().filter(|value| value.len() == 4) {
                    let width = geometry[2].as_f64().unwrap_or(1300.0).max(1100.0);
                    let height = geometry[3].as_f64().unwrap_or(950.0).max(800.0);
                    let _ = window.set_size(tauri::LogicalSize::new(width, height));
                    let x = geometry[0].as_f64().unwrap_or(0.0);
                    let y = geometry[1].as_f64().unwrap_or(0.0);
                    // Recenter windows whose saved display is no longer connected.
                    let visible = window.available_monitors().unwrap_or_default().iter().any(|monitor| {
                        let p = monitor.position().to_logical::<f64>(monitor.scale_factor());
                        let s = monitor.size().to_logical::<f64>(monitor.scale_factor());
                        x + width > p.x && x < p.x + s.width && y >= p.y && y + 40.0 < p.y + s.height
                    });
                    if visible { let _ = window.set_position(tauri::LogicalPosition::new(x, y)); }
                    else { let _ = window.center(); }
                }
                if settings["settings"]["window_maximized"].as_bool() == Some(true) { let _ = window.maximize(); }
            }
            let menu = MenuBuilder::new(app).text("show", "显示主窗口").separator().text("quit", "退出").build()?;
            let mut tray = TrayIconBuilder::new().menu(&menu).show_menu_on_left_click(false).tooltip("FFmuxify").on_tray_icon_event(|tray, event| {
                if matches!(event, TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } | TrayIconEvent::DoubleClick { button: MouseButton::Left, .. }) {
                    if let Some(window) = tray.app_handle().get_webview_window("main") { let _ = window.show(); let _ = window.unminimize(); let _ = window.set_focus(); }
                }
            });
            if let Some(icon) = app.default_window_icon() { tray = tray.icon(icon.clone()); }
            tray.build(app)?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.unminimize(); let _ = window.set_focus(); },
            "quit" => {
                if let Some(window) = app.get_webview_window("main") { let _ = window.show(); let _ = window.set_focus(); }
                emit(app, "close-requested", json!({"quit":true}));
            },
            _ => {}
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.emit("close-requested", json!({"quit":false}));
            }
        })
        .invoke_handler(tauri::generate_handler![load_state,save_state,pick_folder,pick_file,run_task,stop_task,set_theme,finish_close])
        .run(tauri::generate_context!())
        .expect("error while running FFmuxify");
}
#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("ffmuxify-{label}-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn resolves_episode_hash_and_star_templates() {
        let dir = temp_dir("resolve");
        let file = dir.join("Show - 03 [1080p][ABC123].mkv");
        fs::write(&file, b"").unwrap();
        let hash = resolve_file(dir.to_str().unwrap(), "Show - <ep> <hash>.mkv", "03");
        let star = resolve_file(dir.to_str().unwrap(), "Show - <ep> *.mkv", "03");
        assert_eq!(hash.as_deref(), file.to_str());
        assert_eq!(star.as_deref(), file.to_str());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn builds_two_pass_encode_commands_with_legacy_defaults() {
        let dir = temp_dir("encode");
        let source = dir.join("source-01.mkv");
        fs::write(&source, b"").unwrap();
        let mut profile = default_profile();
        profile["source_dir_no_sub"] = json!(dir.to_string_lossy());
        profile["output_dir_no_sub"] = json!(dir.to_string_lossy());
        profile["source_no_sub"] = json!("source-<ep>.mkv");
        profile["out_no_sub"] = json!("result-<ep>.mp4");
        profile["param_matrix_no_sub"]["CPU"]["X264"] = json!({"crf":"-c:v libx264 -crf 18","pass1":"-c:v libx264 -f null NUL","pass2":"-c:v libx264 -b:v 4M","enable_2pass":true});
        let task = json!({"type":"NO_SUB","ep":"01","profile":profile,"suffix":""});
        let (commands, _, output, _) = encode_commands(&task).unwrap();
        assert_eq!(commands.len(), 2);
        assert!(commands[0].contains("-pass 1"));
        assert!(commands[1].contains("-pass 2"));
        assert!(output.ends_with("result-01.mp4"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn detects_pass_and_passlog_options_independently() {
        let first = pass_params("-passlogfile \"custom log\" -b:v 4M -f null NUL", 1, "fallback");
        assert!(first.starts_with("-pass 1 "));
        assert!(!first.contains("fallback"));
        let second = pass_params("-pass=2 -b:v 4M", 2, "default log");
        assert!(second.contains("-passlogfile \"default log\""));
        assert!(!second.contains("-pass 2"));
    }

    #[cfg(windows)]
    #[test]
    fn windows_shell_preserves_quoted_arguments() {
        let output = shell_command(r#"echo "folder with spaces\source.mkv""#).output().unwrap();
        assert!(output.status.success());
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), r#""folder with spaces\source.mkv""#);
    }

    #[test]
    fn live_output_handles_cr_lf_unicode_and_invalid_bytes() {
        let bytes = b"frame=1 time=00:00:01.00\rframe=2 time=00:00:02.00\r\n\xe4\xb8\xad\xe6\x96\x87\nbad\xff\nlast";
        let mut lines = Vec::new();
        read_output(BufReader::with_capacity(2, bytes.as_slice()), |line| lines.push(line)).unwrap();
        assert_eq!(lines, ["frame=1 time=00:00:01.00", "frame=2 time=00:00:02.00", "中文", "bad\u{fffd}", "last"]);
    }

    #[test]
    fn legacy_migration_keeps_encoder_episode_and_suffix_defaults() {
        let mut profile = json!({"selected_hw":"NVENC","selected_codec":"AV1","last_ep":"07","param_matrix":{"NVENC":{"AV1":{"crf":"-cq 20"}}}});
        merge_profile_defaults(&mut profile);
        assert_eq!(profile["selected_hw_no_sub"], "NVENC");
        assert_eq!(profile["selected_codec_with_sub"], "AV1");
        assert_eq!(profile["last_ep_no_sub"], "07");
        assert_eq!(profile["mux_suffix_enabled"], false);
        assert_eq!(profile["param_matrix_with_sub"]["NVENC"]["AV1"]["crf"], "-cq 20");
    }

    #[test]
    fn extraction_and_mux_keep_legacy_options_without_blank_subtitle_inputs() {
        let dir = temp_dir("mux");
        let tool = dir.join("mkvmerge.exe");
        fs::write(&tool, b"").unwrap();
        fs::write(dir.join("source-01.mkv"), b"").unwrap();
        fs::write(dir.join("chapter-01.txt"), b"").unwrap();
        let profile = json!({
            "mkvmerge_path":tool.to_string_lossy(),
            "extract_source_dir":dir.to_string_lossy(),"extract_source_name":"source-<ep>.mkv",
            "extract_output_dir":dir.to_string_lossy(),"extract_output_name":"result-<ep>.mkv",
            "extract_keep_only_av":true,"extract_remove_names":true,
            "extract_chapter_file":dir.join("chapter-<ep>.txt").to_string_lossy(),
            "mux_video_dir":dir.to_string_lossy(),"mux_video_name":"source-<ep>.mkv",
            "mux_output_dir":dir.to_string_lossy(),"mux_output_name":"result-<ep>.mkv",
            "mux_subset_dir":dir.to_string_lossy(),"mux_sub_sc":"","mux_sub_tc":""
        });
        let (extract, _) = mux_commands(&json!({"profile":profile,"type":"extract","ep":"01"})).unwrap();
        for option in ["--no-subtitles", "--no-attachments", "--no-chapters", "--track-name 0:", "--chapters", "--track-order 0:0,0:1"] {
            assert!(extract.contains(option), "missing {option}");
        }
        let (mux, _) = mux_commands(&json!({"profile":profile,"type":"mux","ep":"01","suffix":"[V2]"})).unwrap();
        assert!(mux.contains("result-01[V2].mkv"));
        assert!(!mux.contains("--language"));
        fs::remove_dir_all(dir).unwrap();
    }
}
