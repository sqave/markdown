---
name: release-routine
description: Run the standard CogMD release git flow: commit release-ready changes on develop, bump version files, push develop, merge develop into main, push main, then merge main back into develop and push develop so branches stay in sync.
---

# Release Routine

Use this workflow for every normal release.

## Steps

1. Start on `develop` and commit all release-ready work.
2. Bump version in all three files to the same `X.Y.Z`:
`package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
3. Version policy: use `MINOR` for new features, `PATCH` for bug fixes, and `MAJOR` only when explicitly requested by the user.
4. Commit the version bump on `develop`.
5. Push `develop` to `origin`.
6. Merge `develop` into `main`.
7. Push `main` to `origin`.
8. Merge `main` back into `develop`.
9. Push `develop` again to keep both branches fully aligned.

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

git checkout develop
git merge --no-ff main
git push origin develop
```
