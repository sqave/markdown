// VS Code Theme Adapter — converts VS Code theme JSON to CogMD formats
// Supports: CodeMirror HighlightStyle, Shiki theme, CSS custom properties

import { tags } from '@lezer/highlight';

// TextMate scope -> Lezer highlight tag mapping
const SCOPE_TO_TAG = {
  'comment': tags.comment,
  'comment.line': tags.lineComment,
  'comment.block': tags.blockComment,
  'string': tags.string,
  'string.quoted': tags.string,
  'constant.numeric': tags.number,
  'constant.language': tags.bool,
  'keyword': tags.keyword,
  'keyword.control': tags.controlKeyword,
  'keyword.operator': tags.operator,
  'storage.type': tags.typeName,
  'storage.modifier': tags.modifier,
  'entity.name.function': tags.function(tags.variableName),
  'entity.name.type': tags.typeName,
  'entity.name.class': tags.className,
  'entity.name.tag': tags.tagName,
  'entity.other.attribute-name': tags.attributeName,
  'variable': tags.variableName,
  'variable.parameter': tags.variableName,
  'variable.language': tags.special(tags.variableName),
  'support.function': tags.function(tags.variableName),
  'support.type': tags.typeName,
  'punctuation': tags.punctuation,
  'markup.heading': tags.heading,
  'markup.bold': tags.strong,
  'markup.italic': tags.emphasis,
  'markup.underline.link': tags.link,
  'meta.separator': tags.separator,
};

// VS Code editor color -> CSS custom property mapping
const COLOR_MAP = {
  'editor.background': '--bg-editor',
  'editor.foreground': '--text-primary',
  'editor.selectionBackground': '--selection',
  'editor.lineHighlightBackground': '--cursor-line',
  'editorCursor.foreground': '--accent',
  'sideBar.background': '--bg-secondary',
  'titleBar.activeBackground': '--bg-titlebar',
  'tab.activeBackground': '--bg-primary',
  'tab.inactiveBackground': '--bg-secondary',
  'editorWidget.background': '--bg-code',
  'editorGroupHeader.tabsBackground': '--bg-secondary',
  'scrollbarSlider.background': '--scrollbar',
  'scrollbarSlider.hoverBackground': '--scrollbar-hover',
};

/**
 * Parse a VS Code theme JSON and produce CogMD-compatible outputs.
 * @param {object} themeJson - Parsed VS Code theme JSON (with tokenColors + colors)
 * @returns {{ highlightStyles: Array, cssVars: object, shikiTheme: object, name: string }}
 */
export function adaptVSCodeTheme(themeJson) {
  const name = themeJson.name || 'Custom Theme';
  const isDark = (themeJson.type || '').includes('dark');
  const tokenColors = themeJson.tokenColors || [];
  const colors = themeJson.colors || {};

  // 1. Build CodeMirror HighlightStyle specs
  const highlightStyles = [];
  for (const rule of tokenColors) {
    const scopes = Array.isArray(rule.scope) ? rule.scope : [rule.scope];
    const settings = rule.settings || {};

    for (const scope of scopes) {
      if (!scope) continue;
      const tag = findBestTag(scope);
      if (!tag) continue;

      const spec = { tag };
      if (settings.foreground) spec.color = settings.foreground;
      if (settings.fontStyle) {
        if (settings.fontStyle.includes('italic')) spec.fontStyle = 'italic';
        if (settings.fontStyle.includes('bold')) spec.fontWeight = 'bold';
        if (settings.fontStyle.includes('underline')) spec.textDecoration = 'underline';
      }
      highlightStyles.push(spec);
    }
  }

  // 2. Extract CSS custom properties from editor colors
  const cssVars = {};
  for (const [vsKey, cssVar] of Object.entries(COLOR_MAP)) {
    if (colors[vsKey]) {
      cssVars[cssVar] = colors[vsKey];
    }
  }

  // 3. Build Shiki-compatible theme (subset)
  const shikiTheme = {
    name: name.toLowerCase().replace(/\s+/g, '-'),
    type: isDark ? 'dark' : 'light',
    colors,
    tokenColors,
  };

  return { name, isDark, highlightStyles, cssVars, shikiTheme };
}

function findBestTag(scope) {
  // Try exact match first, then progressively shorter prefixes
  if (SCOPE_TO_TAG[scope]) return SCOPE_TO_TAG[scope];

  const parts = scope.split('.');
  while (parts.length > 1) {
    parts.pop();
    const prefix = parts.join('.');
    if (SCOPE_TO_TAG[prefix]) return SCOPE_TO_TAG[prefix];
  }

  return null;
}

/**
 * Apply CSS custom properties from a theme to the document.
 * @param {object} cssVars - Map of CSS variable name to value
 */
export function applyCSSVars(cssVars) {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(cssVars)) {
    root.style.setProperty(prop, value);
  }
}

/**
 * Remove applied CSS custom properties.
 * @param {object} cssVars - Map of CSS variable names to remove
 */
export function removeCSSVars(cssVars) {
  const root = document.documentElement;
  for (const prop of Object.keys(cssVars)) {
    root.style.removeProperty(prop);
  }
}
