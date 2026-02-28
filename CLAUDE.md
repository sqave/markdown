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

Follow this routine exactly so `develop` and `main` stay in sync:

```sh
# 1) On develop, commit all current release-ready work
git checkout develop
git add -A
git commit -m "Release prep"

# 2) Bump version in all three files (same X.Y.Z in each):
#    - package.json
#    - src-tauri/tauri.conf.json
#    - src-tauri/Cargo.toml
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "Bump version to vX.Y.Z"

# 3) Push develop to remote
git push origin develop

# 4) Merge develop into main, then push main
git checkout main
git merge --no-ff develop
git push origin main
```

- GitHub Actions (`.github/workflows/release.yml`) triggers on push to `main`
- Builds dual-arch `.dmg` + updater assets (`.app.tar.gz`, `.sig`, `latest.json`) via `tauri-action`
- The app checks for updates via `tauri-plugin-updater` against GitHub Releases
