// boot.js — show window before loading any heavy JS
const t = window.__TAURI_INTERNALS__;
const windowLabel = t.metadata.currentWindow.label;
const webviewLabel = t.metadata.currentWebview.label;

// Fire-and-forget zoom normalization (no await needed)
t.invoke('plugin:webview|set_webview_zoom', { label: webviewLabel, value: 1 });

// Show window immediately — user sees styled HTML shell (CSS already loaded)
t.invoke('plugin:window|show', { label: windowLabel });

// Load the full application asynchronously
import('./app.js');
