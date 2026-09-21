# CLAUDE.md

## Mission

Maintain FFmuxify as a faithful Tauri rewrite of the legacy PyQt encoder/muxer. The target is a single Windows executable with the original workflow and a pink-accented interface.

## Important Files

- `auto_encode_fluent.py`: authoritative legacy behavior and persisted profile fields.
- `src/App.tsx`: current workflow composition and UI state.
- `src/components/workspaces.tsx`: reference-compatible encode/mux form layouts.
- `src/components/dialogs.tsx`: profile dialogs, batch inputs, and settings drafts.
- `docs/compatibility-audit.md`: layout and behavior comparison against Python, corrected regressions, and validation limits.
- `src/types.ts`: shared profile, settings, and queue contracts.
- `src-tauri/src/lib.rs`: persistence, wildcard resolution, command construction, and process execution.

## Working Rules

1. Read the relevant legacy function before changing a command, setting, or profile field.
2. Keep the public JSON keys stable so existing `profiles.json` files remain usable.
3. Run `npm run build` and `cargo check --manifest-path src-tauri/Cargo.toml` after implementation changes.
4. Verify both light and dark themes when changing styles. The required colors are `#fb7299`, `#fafafa`, and `#191a1b`.
5. Avoid broad refactors while fixing a workflow. Small, explicit changes are easier to compare with the Python reference.
6. Keep the app shell fixed to the viewport. Test both workflows and 2-pass mode at the minimum window size; do not conceal clipped controls with overflow rules.
7. Autosave profile changes. Only settings require Apply/OK, and cancelling a settings draft must not write it.
8. Use Radix-backed dialogs and context menus, and keep native window chrome in sync with the CSS theme.
9. Use the shadcn/ui New York component variants and semantic Tailwind colors. Preserve menu/dialog transitions and honor reduced-motion preferences.
10. Queue sorting uses dnd-kit pointer and keyboard sensors, not HTML native drag events. Keep active jobs protected.
11. FFmpeg status lines update the dashboard and progress bar without being appended to the log.
12. All editable fields need the shared text-edit context menu, native clipboard support, and working undo. Settings retain a fixed height and do not duplicate the sidebar theme control.
13. Font selection in General settings must remain searchable and virtualized. Enumerate Windows font families on a background worker, cache the result, and preview only the selected font. Apply/OK persists the choice; cancellation discards the draft.

## Release

The supported release target is Windows x64. Use `npm run tauri:build:exe` for the directly runnable `src-tauri/target/release/ffmuxify.exe`. The GitHub Actions workflow at `.github/workflows/build-windows.yml` uses the same command and uploads the EXE as an artifact. Use `npm run tauri:build` only when an NSIS installer is needed; it is produced below `src-tauri/target/release/bundle/nsis/`.
