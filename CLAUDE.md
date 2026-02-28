# CogMD

## Architecture

- Tauri v2 desktop app (Rust backend + vanilla JS frontend)
- Rust backend: `src-tauri/src/lib.rs` — file I/O, native menus, VSIX extraction
- Frontend: `renderer/app.js` — CodeMirror 6 editor, markdown-it preview, Shiki highlighting
- API shim: `renderer/api.js` — bridges `window.api` calls to Tauri `invoke()`/`listen()`
- Build: esbuild bundles renderer, Cargo builds Rust backend

## Release Process

- Bump `version` in both `package.json` and `src-tauri/tauri.conf.json` before merging to `main`
- GitHub Actions auto-publishes a release on push to `main` (builds dual-arch .dmg via `tauri-action`)
- The app checks for updates via `tauri-plugin-updater` against GitHub Releases
