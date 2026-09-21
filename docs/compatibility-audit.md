# Python compatibility and UI regression audit

Reference: `auto_encode_fluent.py` and the original encode/mux screenshots supplied on 2026-09-21.

## Layout and interaction contract

| Area | Reference behavior | Rewrite behavior |
| --- | --- | --- |
| Window | Profile panel stays in place; queue and log use remaining height | Fixed viewport shell; 1100 × 800 logical minimum window; only long profile lists, queues, logs, and settings contents scroll |
| Sidebar | Workflow switch, new profile, profile list, theme and settings | Same order; no branding block, extra page heading, or save controls |
| Profiles | Immediate edits; right-click rename/delete | Serialized automatic writes; Radix context menu; shadcn-style Radix dialogs with name validation |
| Dialogs | Batch popup dismisses outside | Name, batch, settings and confirmation dialogs dismiss outside or on Escape; focus stays inside and returns on close |
| Settings | Apply/OK commits; Cancel discards pending changes | Local draft; Apply keeps dialog open, OK saves and closes, Cancel/outside/Escape discard unapplied edits |
| Encode form | Source folder, subtitles folder, output folder, source template, SC/TC rows | Same field order; independent subtitle/no-subtitle folders, matrices, episodes, and suffix values |
| Encoder parameters | CRF or Pass 1/2 fields, depending on selected matrix entry | Conditional fields; hidden values retained across mode, codec, and hardware changes |
| Encode controls | Episode, batch, suffix switch, task buttons in one row | Same structure; start/stop in the execution panel beside the queue |
| Extraction | Source/output rows, episode and chapter row, options and right-aligned actions | Same structure, including chapter file picker |
| Only A/V | Checks and disables subtitle/font/chapter removal; track names remain independent | Same behavior; unchecking re-enables the three checked options |
| Font subset | Folder row, episode/SC/TC row, right-aligned actions | Same structure |
| Mux | Video, subset, output, SC, TC, episode/suffix rows | Same structure; suffix is disabled and excluded from output names until checked |
| Logs and queues | Encode queue/log separate from mux queue; separate mux/subset logs | Separate visible queues; output routed by task ID and type; custom remove/clear context menus |
| Themes | Application chrome follows theme | Exact requested background/accent colors; native Tauri window theme plus CSS color-scheme and themed scrollbars |
| Text and menus | Desktop-style selection and menus | Selection restricted to inputs/textareas/editable content, including read-only logs; browser context menu disabled |
| Encoding status | Progress dashboard updates separately from logs | FFmpeg frame/size status lines update FPS, speed, bitrate, video time and progress without log spam; diagnostic output remains visible |
| Queue ordering | Tasks can be dragged to change execution order | Pointer sorting works in Windows WebView2; a drag handle also supports Space, arrows and Escape; running tasks stay protected |
| Field editing | Native text editing commands | Shared Radix menu for cut, copy, paste, undo and select all; desktop uses the Tauri clipboard plugin and preserves native undo |
| Component styles | Desktop controls with the requested pink theme | shadcn/ui New York variants, Radix controls, Tailwind semantic theme tokens; compact desktop layout remains unchanged |
| Motion | Visible state changes | Dialog/menu entrance and exit, content fades, hover/focus transitions, queue movement and progress interpolation; reduced motion supported |
| Settings geometry | Stable settings window | Fixed 680px height, capped to the viewport; category changes do not resize the dialog; theme remains in the sidebar |

Parameter textareas are 84px for CRF and 88px per pass, including the settings dialog. At shorter supported viewports, each pass uses 80px and layout spacing tightens to preserve visible controls, queues and logs. Parameter text is 2px larger than the standard input text.

## Additional regressions corrected during the audit

- Restored default SC/TC filename templates on new profiles.
- Restored independent legacy hardware/codec selections, episode migration, and suffix defaults.
- Removed native prompt/confirm/alert UI and prevented duplicate profile names from overwriting a profile.
- Batch NO_SUB additions advance the NO_SUB episode even while the subtitle form is open.
- Queue completion updates the profile that created the task, with profile-specific completion history.
- Queue controls protect active tasks from removal or clearing. Task IDs prevent output from being assigned to a different task.
- A task error no longer prevents subsequent pending encode tasks from running.
- Tool paths are resolved from the current applied settings when a queued task starts.
- Pass flags and pass-log flags are detected independently; specifying a custom pass log no longer suppresses the required pass number.
- CR-only FFmpeg status updates are parsed immediately, and malformed UTF-8 does not terminate output collection.
- Windows shell command lines preserve quoted paths through Rust's raw argument API instead of C-runtime escaping; shell startup errors are retained in the task log.
- Empty subtitle templates are not passed as directory inputs to mkvmerge.
- Existing `output` subset folders are not incorrectly nested a second time.
- Stop is tracked across the gap between passes; partial output generated by a stopped encode is cleaned up. A pre-existing output untouched by that task is preserved.
- Window closing flushes configuration writes; closing/exiting during a task requires confirmation.
- Tray click/double-click restores the window. Window size, position, and maximization are remembered.
- The main window starts hidden while its geometry, theme, and React interface initialize. The frontend signals readiness after rendering (with a timer fallback for hidden WebView2 animation frames); only then is the window shown/maximized. Readiness is idempotent, tray/second-instance activation waits for readiness, and a configuration load failure displays a persistent retry screen.
- A custom configuration location remains discoverable after restarting.

## Deliberately preserved source semantics

The Python subset worker processes all `.ass` files in the resolved subtitle directory. The SC/TC template fields are saved, but do not filter that worker's input. Extraction's name cleanup and track order address tracks 0 and 1, matching the source. These semantics should only change after an explicit product decision.

The rewrite honors both subtitle default-track controls. The Python TC command calculated the selected value but then hard-coded `no`; that source bug is not reproduced.

## Verification

- `npm run build`: strict TypeScript and production frontend build.
- `npm run test:ui`: Edge interaction regression tests, including 1100 × 770 content viewport (allowing for native title bar), both themes and both parameter modes. Screenshots are written under `test-results/`.
- `cargo test --manifest-path src-tauri/Cargo.toml`: wildcard matching, command generation, migration, and streaming output tests.
- `node tests/native-smoke.mjs`: built EXE, real FFmpeg with generated media, native theme API, automatic saving and episode progression. It requires FFmpeg on PATH and uses a unique `.qa/native-*` directory.
- `node tests/native-startup.mjs`: built EXE with isolated light/dark settings, saved maximization, idempotent readiness, and second-instance activation. It refuses to run while another FFmuxify instance is open and writes screenshots under `.qa/startup-*`.
- `npm run tauri:build`: release EXE and NSIS package.

Browser preview stores only disposable browser-local data. Native smoke testing sets `FFMUXIFY_CONFIG_DIR` to isolate all application settings/profiles from the user's normal configuration.

Real MKVToolNix/AssFontSubset media integration must be validated on a machine with those external tools. Command construction is covered by Rust tests; that does not establish the behavior of every external tool/version or GPU encoder.
