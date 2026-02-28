# CogMD

## Release Process

- Always bump `version` in `package.json` before merging to `main`
- GitHub Actions auto-publishes a release on push to `main` (builds .dmg + .zip, uploads to GitHub Releases)
- The app checks for updates via `electron-updater` against GitHub Releases
