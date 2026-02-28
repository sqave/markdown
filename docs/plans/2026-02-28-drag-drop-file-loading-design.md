# Drag-and-Drop File Loading

## Summary

Add drag-and-drop support so users can drop `.md`, `.markdown`, or `.txt` files from Finder onto the app window to open them in new tabs.

## Approach

Backend-driven via Tauri's `DragDropEvent`. The Rust backend receives file paths, reads content, and emits `file-opened` events — reusing the existing event flow.

## Changes

### Backend (`src-tauri/src/lib.rs`)
- Add `DragDropEvent::Drop` handler in the `RunEvent` match block
- Filter to `.md`, `.markdown`, `.txt` extensions
- Read each valid file and emit `file-opened` event (same as `RunEvent::Opened`)

### Frontend (`renderer/index.html`)
- Add hidden drop overlay element

### Frontend (`renderer/styles.css`)
- Style the drop overlay (fullscreen, semi-transparent, centered text)

### Frontend (`renderer/app.js`)
- Listen for `dragover`/`dragleave`/`drop` on document to toggle overlay visibility
- Prevent default browser drag behavior

### No changes needed
- `renderer/api.js` — existing `onFileOpened` listener handles everything
- Tab management — existing `createTab`/`activateTab` logic is source-agnostic

## Accepted file types
- `.md`, `.markdown`, `.txt`

## Behavior
- Each dropped file opens in a new tab (or reuses empty tab, matching menu-open behavior)
- Multiple files dropped at once each get their own tab
- Non-matching file types are silently ignored
