export const HARDWARE = ["CPU", "QSV", "NVENC", "VCN"] as const;
export const CODECS = ["X264", "X265", "X266", "AV1"] as const;
export type Hardware = typeof HARDWARE[number];
export type Codec = typeof CODECS[number];
export type TaskType = "NO_SUB" | "SC" | "TC";

export interface ParamSet { crf: string; pass1: string; pass2: string; enable_2pass: boolean }
export type ParamMatrix = Record<string, Record<string, ParamSet>>;
export interface Profile {
  has_subtitle_mode: boolean;
  source_dir_with_sub: string; output_dir_with_sub: string; source_dir_no_sub: string; output_dir_no_sub: string;
  source_temp: string; sub_dir: string; sub_sc: string; sub_tc: string; out_sc: string; out_tc: string;
  source_no_sub: string; out_no_sub: string; last_ep: string; last_ep_no_sub: string;
  selected_hw_with_sub: Hardware; selected_codec_with_sub: Codec; selected_hw_no_sub: Hardware; selected_codec_no_sub: Codec;
  param_matrix_with_sub: ParamMatrix; param_matrix_no_sub: ParamMatrix;
  extract_source_dir: string; extract_source_name: string; extract_output_dir: string; extract_output_name: string; extract_ep: string; extract_chapter_file: string;
  extract_no_subs: boolean; extract_no_fonts: boolean; extract_no_chapters: boolean; extract_keep_only_av: boolean; extract_remove_names: boolean;
  subset_sub_dir: string; subset_font_dir: string; subset_ep: string; subset_sub_sc: string; subset_sub_tc: string;
  mux_video_dir: string; mux_video_name: string; mux_subset_dir: string; mux_output_dir: string; mux_output_name: string; mux_ep: string;
  mux_sub_sc: string; mux_sub_sc_name: string; mux_sub_sc_default: boolean; mux_sub_tc: string; mux_sub_tc_name: string; mux_sub_tc_default: boolean; mux_suffix: string;
  mux_suffix_enabled: boolean;
  suffix_enabled_with_sub: boolean; suffix_enabled_no_sub: boolean; suffix_with_sub: string; suffix_no_sub: string;
  [key: string]: unknown;
}
export interface Settings { base_path: string; use_sub_folder: boolean; folder_name: string; theme_mode: "light" | "dark"; mkvmerge_path: string; assfontsubset_path: string; auto_ep_encode: boolean; auto_ep_mux: boolean; ep_not_shared: boolean; close_behavior: "tray" | "exit"; last_workflow: "encode" | "mux"; default_params_matrix: ParamMatrix; }
export interface AppState { settings: Settings; profiles: Record<string, Profile>; config_dir: string }
export interface QueueTask { id: string; type: TaskType | "extract" | "subset" | "mux"; ep: string; profileName: string; profile: Profile; suffix?: string; description: string; status: "pending" | "running" | "done" | "error"; progress: number; pass: number; }
