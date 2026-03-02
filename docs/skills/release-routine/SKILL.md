---
name: release-routine
description: Run the standard CogMD release git flow: bump version on develop, commit, push, then merge into main and push.
---

# Release Routine

Use this workflow for every normal release.

## Steps

1. On `develop`, bump version in all three files to the same `X.Y.Z`:
   `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
2. Version policy: use `MINOR` for new features, `PATCH` for bug fixes, and `MAJOR` only when explicitly requested by the user.
3. Commit everything and push develop.
4. Merge develop into main and push.

## Commands

```sh
# 1) On develop, bump version then:
git add -A
git commit -m "<description of changes>"
git push origin

# 2) Merge into main
git checkout main
git merge develop
git push origin
```
