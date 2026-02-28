## Local Skills

### Available skills
- release-routine: Standard CogMD release git flow. Use when asked to deploy/release a new version and keep `develop` and `main` in sync. (file: /Users/sxyz/dev/o/markdown/docs/skills/release-routine/SKILL.md)

## Release Rule

For normal releases, follow the `release-routine` skill:
1. Commit release-ready work on `develop`.
2. Bump version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
3. Push `develop`.
4. Merge `develop` into `main`.
5. Push `main`.
