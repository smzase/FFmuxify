import { CODECS, HARDWARE, type ParamMatrix, type ParamSet, type Profile, type Settings } from "./types";

export const emptyParams = (): ParamSet => ({ crf: "", pass1: "", pass2: "", enable_2pass: false });
export const matrix = (): ParamMatrix => Object.fromEntries(HARDWARE.map(hardware => [hardware, Object.fromEntries(CODECS.map(codec => [codec, emptyParams()]))]));
export function newProfile(defaults = matrix()): Profile {
  return {
    has_subtitle_mode: true, source_dir_with_sub: "", output_dir_with_sub: "", source_dir_no_sub: "", output_dir_no_sub: "",
    source_temp: "", sub_dir: "", sub_sc: "<ep>.zh-hans.ass", sub_tc: "<ep>.zh-hant.ass", out_sc: "", out_tc: "", source_no_sub: "", out_no_sub: "",
    last_ep: "01", last_ep_no_sub: "01", selected_hw_with_sub: "CPU", selected_codec_with_sub: "X264", selected_hw_no_sub: "CPU", selected_codec_no_sub: "X264",
    suffix_enabled_with_sub: false, suffix_enabled_no_sub: false, suffix_with_sub: "[V2]", suffix_no_sub: "[V2]",
    param_matrix_with_sub: structuredClone(defaults), param_matrix_no_sub: structuredClone(defaults),
    extract_source_dir: "", extract_source_name: "", extract_output_dir: "", extract_output_name: "", extract_ep: "01", extract_chapter_file: "",
    extract_no_subs: false, extract_no_fonts: false, extract_no_chapters: false, extract_keep_only_av: false, extract_remove_names: false,
    subset_sub_dir: "", subset_font_dir: "", subset_ep: "01", subset_sub_sc: "<ep>.zh-hans.ass", subset_sub_tc: "<ep>.zh-hant.ass",
    mux_video_dir: "", mux_video_name: "", mux_subset_dir: "", mux_output_dir: "", mux_output_name: "", mux_ep: "01",
    mux_sub_sc: "<ep>.zh-hans.ass", mux_sub_sc_name: "简体中文&日语", mux_sub_sc_default: true,
    mux_sub_tc: "<ep>.zh-hant.ass", mux_sub_tc_name: "繁體中文&日語", mux_sub_tc_default: false, mux_suffix_enabled: false, mux_suffix: "[V2]",
  };
}
export const defaultSettings = (): Settings => ({ base_path: "", use_sub_folder: true, folder_name: "ffmpeg smzase", theme_mode: "light", font_family: "", use_native_font_rendering: true, mkvmerge_path: "", assfontsubset_path: "", auto_ep_encode: true, auto_ep_mux: true, ep_not_shared: true, close_behavior: "tray", last_workflow: "encode", default_params_matrix: matrix() });
export const isEncode = (type: string) => ["SC", "TC", "NO_SUB"].includes(type);
