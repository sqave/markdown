# CogMD

A minimal markdown editor. Write, preview, done.

CogMD is a native desktop app that stays out of your way. No accounts, no cloud, no bloat — just a fast editor with live preview and syntax highlighting.

## Features

- **Split, editor, or preview** — toggle between views with one click or `Cmd+1/2/3`
- **Tabs** — Chrome-style tabs in the titlebar, session-restored on relaunch
- **Syntax highlighting** — for both the editor (CodeMirror) and preview (highlight.js)
- **Light and dark themes** — `Cmd+Shift+T` to toggle
- **Adjustable font size** — `Cmd+/Cmd-` to scale
- **Local-first** — files live on your disk, settings in localStorage, nothing phones home
- **macOS native** — traffic lights, frameless titlebar, `.md` file associations

## Install

### From source (one command)

```sh
git clone https://github.com/sqave/markdown.git && cd markdown && npm install && npm start
```

### Build a `.app` / `.dmg`

```sh
npm run build
```

This produces a distributable in the `dist/` folder via electron-builder. On macOS you get a `.dmg` with CogMD.app inside.

## Development

```sh
npm install     # install dependencies
npm start       # bundle + launch
npm run bundle  # rebuild renderer/bundle.js only
```

## Stack

| Layer | Tech |
|-------|------|
| Shell | Electron |
| Editor | CodeMirror 6 |
| Markdown | markdown-it |
| Highlighting | highlight.js |
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
