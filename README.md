<p align="center">
  <img src="build/icon.png" width="128" />
</p>

<h1 align="center">Cog</h1>

<p align="center">A fast, lightweight markdown editor for macOS. Opens instantly, stays out of your way.</p>

Cog is built for people who work with markdown files daily — project docs, CLAUDE.md files, notes, READMEs, anything `.md`. No accounts, no cloud, no bloat. Just open a file and start writing.

## Install

### 1. Download

Go to the [Releases page](https://github.com/sqave/markdown/releases) and download the latest `.dmg` file.

### 2. Install

Open the downloaded `.dmg` file and drag Cog into your Applications folder.

### 3. Allow the app to run

Cog isn't signed with an Apple Developer certificate yet, so macOS will block it the first time you open it. You might see a message saying the app is "damaged" or "can't be opened." This is normal for unsigned apps.

To fix this:

1. Open the Terminal app (find it in Applications > Utilities, or press `Cmd+Space` and search for "Terminal")
2. Paste this command and press Enter:

```sh
xattr -cr /Applications/Cog.app
```

3. If that doesn't work, try adding `sudo` in front (it will ask for your Mac password):

```sh
sudo xattr -cr /Applications/Cog.app
```

4. Open Cog from your Applications folder — it should launch normally from now on.

## Features

- Split, editor, or preview — toggle with `Cmd+1` / `2` / `3`
- Tabs in the titlebar, restored when you relaunch
- Syntax highlighting in editor (CodeMirror 6) and preview (Shiki)
- Light and dark themes — `Cmd+Shift+T`
- Adjustable font size — `Cmd+` / `Cmd-`
- Local-first — files stay on your disk, nothing phones home
- Native macOS — traffic lights, frameless titlebar, `.md` file associations
- Auto-updates from GitHub Releases

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

## License

MIT
