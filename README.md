# FFmuxify

FFmuxify is a Windows desktop client for the `auto_encode_fluent.py` video encoding and MKV workflow. It keeps the legacy profile format while moving the UI to Tauri, Rust, TypeScript, and shadcn/ui New York components with Radix and Tailwind.

## Features

- Profile-based encode presets with subtitle and no-subtitle modes.
- CPU, QSV, NVENC, and VCN hardware choices with X264, X265, X266, and AV1 parameter matrices.
- CRF/single-pass and two-pass FFmpeg command generation.
- Batch episode queue with SC, TC, BOTH, and NO_SUB task modes.
- MKV extraction, ASS font subsetting, subtitle track muxing, attachments, and track order.
- Persistent settings and profiles in the same `Documents/ffmpeg smzase` layout as the legacy app.
- Light/dark themes using `#fb7299`, `#fafafa`, and `#191a1b`.

## Development

```powershell
npm install
npm run dev
```

For the directly runnable Windows executable (Node.js 24, Rust 1.97.1 MSVC, and Visual Studio C++ Build Tools):

```powershell
npm ci
npm run tauri:build:exe
```

The build uses the committed npm and Cargo lockfiles and writes `src-tauri/target/release/ffmuxify.exe`.

For an optional Windows installer:

```powershell
npm run tauri:build
```

See [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md) for compatibility and maintenance rules.

## GitHub Actions

[Build Windows EXE](.github/workflows/build-windows.yml) runs on pushes, pull requests, and manual dispatch. It builds a Windows x64 EXE on `windows-2022` using Node.js 24, Rust 1.97.1, `npm ci`, and the same `npm run tauri:build:exe` command as local builds.

After a successful run, open its **Artifacts** section and download **FFmuxify-windows-x64**. Extract the archive to get `ffmuxify.exe`. Artifacts are retained for 14 days. The workflow only uploads build artifacts; it does not publish GitHub Releases or require signing secrets.

## Behavior and validation

Profile changes save automatically. Global settings use an editable draft with Apply, OK and Cancel. The fixed desktop layout supports light/dark native window themes, custom profile context menus, and separate encode/mux queues and logs.

See [the compatibility audit](docs/compatibility-audit.md) for the Python behavior comparison and remaining external-tool validation limits.

Run `npm run test:ui` for Edge interaction and layout tests, and `cargo test --manifest-path src-tauri/Cargo.toml` for backend regressions. After building, `node tests/native-smoke.mjs` exercises the real EXE with generated FFmpeg media and isolated profiles.

`FFMUXIFY_CONFIG_DIR` optionally overrides the entire configuration directory for isolated runs. Normal runs retain the legacy Documents configuration location.

The directly runnable executable is `src-tauri/target/release/ffmuxify.exe`. It uses the Windows WebView2 runtime; FFmpeg, MKVToolNix, and AssFontSubset remain external media tools.
