## Local Skills

### Available skills
- release-routine: Standard CogMD release git flow. Use when asked to deploy/release a new version and keep `develop` and `main` in sync. (file: /Users/sxyz/dev/o/markdown/docs/skills/release-routine/SKILL.md)

## Release Rule

For normal releases, follow the `release-routine` skill:
1. Commit release-ready work on `develop`.
2. Bump version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
3. Version bump policy: use `MINOR` for new features and `PATCH` for bug fixes. Never bump `MAJOR` unless the user explicitly asks.
4. Release commit messages must be informative and include a concise summary of what shipped. Do not use only the version number as the message.
5. Push `develop`.
6. Merge `develop` into `main`.
7. Push `main`.
8. Merge `main` back into `develop`.
9. Push `develop` again so both branches are fully in sync.
