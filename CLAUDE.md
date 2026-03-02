# CogMD

## Architecture

- Tauri v2 desktop app (Rust backend + vanilla JS frontend)
- Rust backend: `src-tauri/src/lib.rs` — file I/O, native menus, VSIX extraction
- Frontend: `renderer/app.js` — CodeMirror 6 editor, markdown-it preview, Shiki highlighting
- API shim: `renderer/api.js` — bridges `window.api` calls to Tauri `invoke()`/`listen()`
- Build: esbuild bundles renderer, Cargo builds Rust backend

## Versioning (Semver: MAJOR.MINOR.PATCH)

- **PATCH (Z):** Bug fixes — bump for any fix (e.g. 0.16.0 → 0.16.1)
- **MINOR (Y):** New features — bump for any new functionality (e.g. 0.16.1 → 0.17.0)
- **MAJOR (X):** Only on major refactors, and only when the user explicitly confirms. Never bump on your own.

## Release Process

```sh
# 1) Run tests before releasing:
npm test

# 2) On develop, bump version in all three files (same X.Y.Z in each):
#    - package.json
#    - src-tauri/tauri.conf.json
#    - src-tauri/Cargo.toml
# Then commit and push:
git add -A
git commit -m "<description of changes>"
git push origin

# 3) Merge develop into main, then push
git checkout main
git merge develop
git push origin
```

- GitHub Actions (`.github/workflows/release.yml`) triggers on push to `main`
- Builds dual-arch `.dmg` + updater assets (`.app.tar.gz`, `.sig`, `latest.json`) via `tauri-action`
- The app checks for updates via `tauri-plugin-updater` against GitHub Releases
