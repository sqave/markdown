## Local Skills

### Available skills
- release-routine: Standard CogMD release git flow. Use when asked to deploy/release a new version and keep `develop` and `main` in sync. (file: /Users/sxyz/dev/o/markdown/docs/skills/release-routine/SKILL.md)

## Release Rule

For normal releases, follow the `release-routine` skill:
1. On `develop`, bump version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
2. Version bump policy: use `MINOR` for new features and `PATCH` for bug fixes. Never bump `MAJOR` unless the user explicitly asks.
3. `git add -A && git commit -m "<description of changes>" && git push origin`
4. `git checkout main && git merge develop && git push origin`
