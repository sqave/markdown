// Notion Plugin — entry point
import { NotionUI } from './notion-ui.js';

let notionUI = null;

export function activate(ctx) {
  notionUI = new NotionUI(ctx);
  notionUI.init();
}

export function deactivate() {
  if (notionUI) {
    notionUI.destroy();
    notionUI = null;
  }
}
