---
name: release-routine
description: Run the standard CogMD release git flow: commit release-ready changes on develop, bump version files, push develop, merge develop into main, and push main so branches stay in sync.
---

# Release Routine

Use this workflow for every normal release.

## Steps

1. Start on `develop` and commit all release-ready work.
2. Bump version in all three files to the same `X.Y.Z`:
`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
3. Commit the version bump on `develop`.
4. Push `develop` to `origin`.
5. Merge `develop` into `main`.
6. Push `main` to `origin`.

## Commands

```sh
git checkout develop
git add -A
git commit -m "Release prep"

# edit version in:
# - package.json
# - src-tauri/tauri.conf.json
# - src-tauri/Cargo.toml
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "Bump version to vX.Y.Z"

git push origin develop

git checkout main
git merge --no-ff develop
git push origin main
```
