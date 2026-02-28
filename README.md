# CogMD

A minimal markdown editor. Write, preview, done.

CogMD is a native macOS app that stays out of your way. No accounts, no cloud, no bloat — just a fast editor with live preview and syntax highlighting.

## Install

Download the latest `.dmg` from [Releases](https://github.com/sqave/markdown/releases), open it, and drag CogMD to Applications.

## Features

- **Split, editor, or preview** — toggle views with `Cmd+1/2/3`
- **Tabs** — Chrome-style tabs in the titlebar, session-restored on relaunch
- **Syntax highlighting** — CodeMirror 6 editor + Shiki preview
- **Light and dark themes** — `Cmd+Shift+T` to toggle
- **Adjustable font size** — `Cmd+/Cmd-` to scale
- **Local-first** — files live on your disk, nothing phones home
- **macOS native** — traffic lights, frameless titlebar, `.md` file associations
- **Auto-updates** — checks GitHub Releases on launch

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
| Close tab | `Cmd+W` |
| Next / prev tab | `Cmd+Shift+]` / `[` |
| Editor only | `Cmd+1` |
| Split view | `Cmd+2` |
| Preview only | `Cmd+3` |
| Toggle theme | `Cmd+Shift+T` |
| Increase font | `Cmd+=` |
| Decrease font | `Cmd+-` |
| Reset font | `Cmd+0` |

## License

MIT
