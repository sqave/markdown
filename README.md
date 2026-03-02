# Cog

A minimal markdown editor. Write, preview, done.

Cog is a native macOS app that stays out of your way. No accounts, no cloud, no bloat — just a fast editor with live preview and syntax highlighting.

## Install

1. Download the latest `.dmg` from [Releases](https://github.com/sqave/markdown/releases), open it, and drag Cog to Applications.

2. Since the app isn't signed with an Apple Developer certificate, macOS will block it on first launch (it will say its Broken or Damaged). To allow it, Open Terminal and then run:

```sh
xattr -cr /Applications/Cog.app
```

If that didn't work, you might need to add `sudo` in front of the command.

## Features

- **Split, editor, or preview** — toggle views with `Cmd+1/2/3`
- **Tabs** — Chrome-style tabs in the titlebar, session-restored on relaunch
- **Syntax highlighting** — CodeMirror 6 editor + Shiki preview
- **Light and dark themes** — `Cmd+Shift+T` to toggle
- **Adjustable font size** — `Cmd+/Cmd-` to scale
- **Local-first** — files live on your disk, nothing phones home
- **macOS native** — traffic lights, frameless titlebar, `.md` file associations
- **Auto-updates** — checks GitHub Releases on launch
- **Notion plugin (custom)** — connect via internal integration secret, search pages, link a page to a tab, and sync with merge checks

## Development

Requires [Rust](https://rustup.rs) and Node.js.

```sh
git clone https://github.com/sqave/markdown.git && cd markdown
npm install
npm run dev       # dev mode with hot reload
npm run build     # production .dmg
```

## Stack

| Layer | Tech |
|-------|------|
| Shell | Tauri v2 (Rust) |
| Editor | CodeMirror 6 |
| Markdown | markdown-it |
| Highlighting | Shiki |
| Sanitization | DOMPurify |
| Bundler | esbuild |

## Keyboard shortcuts

| Action | Shortcut |
|--------|----------|
| New tab | `Cmd+N` |
| Open file | `Cmd+O` |
| Save | `Cmd+S` |
| Save as | `Cmd+Shift+S` |
| Find | `Cmd+F` |
| Find & Replace | `Cmd+R` |
| Close tab | `Cmd+W` |
| Next / prev tab | `Cmd+Shift+]` / `[` |
| Editor only | `Cmd+1` |
| Split view | `Cmd+2` |
| Preview only | `Cmd+3` |
| Toggle theme | `Cmd+Shift+T` |
| Increase font | `Cmd+=` |
| Decrease font | `Cmd+-` |
| Reset font | `Cmd+0` |

## Plugins

Plugin support is a work in progress for generic VSIX plugins.

This build includes a first custom plugin for Notion:
- Open the Notion button in the titlebar.
- Use `NOTION_TOKEN` via environment variables (for example `NOTION_TOKEN=... npm run dev`).
- If you connect from the UI, the app stores `NOTION_TOKEN` in `~/.cogmd/.env`.
- Search pages and click `Link` to attach a page to the current tab.
- Use the Notion sync button (or `Cmd+S` on a linked tab) to sync.

Sync behavior uses the same three-way merge style as local disk sync:
- If Notion changed remotely since your last sync, you get a merge prompt.
- If only local changed, you can push local edits to Notion.

## License

MIT
