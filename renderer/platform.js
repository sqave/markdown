// Platform detection and conditional configuration
// Tauri handles native menus per-platform automatically
// This module provides frontend-specific platform adjustments

const isMac = navigator.platform.startsWith('Mac') || navigator.userAgent.includes('Macintosh');
const isWindows = navigator.platform.startsWith('Win');
const isLinux = !isMac && !isWindows;

export const platform = {
  isMac,
  isWindows,
  isLinux,

  // macOS: left padding for traffic lights. Windows/Linux: no offset needed.
  titlebarPaddingLeft: isMac ? '84px' : '16px',

  // macOS: Cmd key. Others: Ctrl key (for display in tooltips).
  modKey: isMac ? '\u2318' : 'Ctrl+',

  // Path separator for display purposes
  pathSep: isWindows ? '\\' : '/',
};
