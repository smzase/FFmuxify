# AGENTS.md

## Project Overview

FFmuxify is a Windows-first Tauri desktop client for the original `auto_encode_fluent.py` workflow. The application uses a Rust process runner and a React/TypeScript interface with shadcn/ui New York primitives, Radix, and Tailwind.

## Repository Layout

- `src/`: React/TypeScript application, state model, and UI components.
- `src-tauri/`: Tauri configuration and Rust commands for persistence, file dialogs, and external media tools.
- `auto_encode_fluent.py`: the behavior reference. Keep its JSON field names and command semantics compatible when extending the rewrite.

## Development Commands

- `npm install`: install frontend and Tauri dependencies.
- `npm run dev`: start the Vite frontend.
- `npm run build`: run TypeScript checks and create `dist/`.
- `npm run tauri:build`: create the Windows NSIS bundle.
- `npm run tauri:build:exe`: create the directly runnable Windows EXE using the Cargo lockfile; the GitHub Actions workflow uses the same command.
- `cargo check --manifest-path src-tauri/Cargo.toml`: validate the Rust backend.

## Behavioral Requirements

- Preserve the profile JSON shape used by the Python implementation.
- Preserve `<ep>`, `<hash>`, and `*` filename matching behavior.
- Encoding tasks must support CRF/single-pass and two-pass modes for CPU, QSV, NVENC, and VCN with X264, X265, X266, and AV1.
- Mux workflows must keep extract, subtitle font subsetting, subtitle track selection, attachments, and track order behavior.
- Keep single-instance/tray behavior and automatic episode increment behavior in sync when those features are extended.
- Do not hard-code tool paths; expose them in global settings.

## UI Conventions

- Primary accent is `#fb7299`.
- Light application background is `#fafafa`; dark application background is `#191a1b`.
- Keep the existing information architecture: profile sidebar, workflow switcher, settings card, controls, queue, and log.
- Use the local shadcn/ui primitives in `src/components/ui/` for new controls. `components.json`, `tailwind.config.js`, and the semantic CSS variables define the component theme; keep layout-specific density in `src/styles.css`.
- Preserve the fixed-height desktop layout. Do not make the document or entire sidebar scroll; only bounded content lists and logs may overflow.
- Profile and workflow edits autosave. Only the settings dialog has Apply/OK actions and a draft that Cancel/outside/Escape can discard.
- Use the Radix-backed Dialog and ContextMenu primitives for overlays; do not introduce native browser prompt, confirm, alert, or context menus.
- Keep CRF and Pass 1/2 visibility mutually exclusive without clearing hidden values.
- Suppress repetitive FFmpeg status lines in the log while continuing to update metrics and task progress.
- Use pointer/keyboard sorting for queues; HTML native drag events conflict with the Windows webview's file drop handler. Running tasks cannot be dragged or removed.
- Editable fields share the custom cut/copy/paste/undo/select-all menu. Preserve browser undo history and controlled React updates; use the native clipboard plugin on desktop.
- Keep settings at a fixed height across categories; the sidebar is the sole theme control.
- Settings font selection uses a cached background Windows font enumeration and a searchable virtual list. Render only visible font names and preview only the selected font; preserve Apply/OK/Cancel draft behavior and default font fallbacks.
- Keep open/close and sorting animations, with reduced-motion support. Notifications must remain outside the app's two-column grid.
- Read `docs/compatibility-audit.md` for the verified reference layout and behavior.

## Code Quality

- Use TypeScript strict mode and Rust `cargo check` before delivery.
- Treat the Python file as a compatibility reference, not as a place to add new UI code.
- Keep platform-specific behavior behind Rust commands rather than browser-only workarounds.
- Run `npm run test:ui` for interaction/layout changes. Inspect the generated screenshots at both normal and minimum window sizes.
- Use `FFMUXIFY_CONFIG_DIR` for isolated native testing; never run test jobs against the user's profiles or media.
