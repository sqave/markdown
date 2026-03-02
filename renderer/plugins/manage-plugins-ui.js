// Manage Plugins UI — core app module (not a plugin)
import { pluginManager } from './plugin-manager.js';

let modalEl = null;

function createModal() {
  if (modalEl) return modalEl;

  modalEl = document.createElement('div');
  modalEl.className = 'manage-plugins-modal';
  modalEl.id = 'managePluginsModal';

  const panel = document.createElement('div');
  panel.className = 'manage-plugins-panel';

  const head = document.createElement('div');
  head.className = 'manage-plugins-head';

  const title = document.createElement('h2');
  title.textContent = 'Plugins';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'manage-plugins-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '\u00d7';
  closeBtn.addEventListener('click', hideModal);

  head.appendChild(title);
  head.appendChild(closeBtn);
  panel.appendChild(head);

  const list = document.createElement('div');
  list.className = 'manage-plugins-list';
  list.id = 'managePluginsList';
  panel.appendChild(list);

  modalEl.appendChild(panel);
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) hideModal();
  });

  document.body.appendChild(modalEl);
  return modalEl;
}

function renderPluginList() {
  const list = document.getElementById('managePluginsList');
  if (!list) return;
  list.replaceChildren();

  const plugins = pluginManager.getAll();

  if (!plugins.length) {
    const empty = document.createElement('div');
    empty.className = 'manage-plugins-empty';
    empty.textContent = 'No plugins available.';
    list.appendChild(empty);
    return;
  }

  plugins.forEach(plugin => {
    const row = document.createElement('div');
    row.className = 'manage-plugins-row';

    const info = document.createElement('div');
    info.className = 'manage-plugins-info';

    const nameRow = document.createElement('div');
    nameRow.className = 'manage-plugins-name-row';

    const name = document.createElement('span');
    name.className = 'manage-plugins-name';
    name.textContent = plugin.name;

    const version = document.createElement('span');
    version.className = 'manage-plugins-version';
    version.textContent = `v${plugin.version}`;

    nameRow.appendChild(name);
    nameRow.appendChild(version);

    if (plugin.beta) {
      const badge = document.createElement('span');
      badge.className = 'manage-plugins-badge-beta';
      badge.textContent = 'beta';
      nameRow.appendChild(badge);
    }

    const desc = document.createElement('div');
    desc.className = 'manage-plugins-desc';
    desc.textContent = plugin.description || '';

    info.appendChild(nameRow);
    info.appendChild(desc);

    const actionBtn = document.createElement('button');
    actionBtn.className = 'manage-plugins-action';

    if (plugin.enabled) {
      actionBtn.textContent = 'Uninstall';
      actionBtn.addEventListener('click', async () => {
        actionBtn.disabled = true;
        actionBtn.textContent = 'Removing...';
        await pluginManager.uninstallPlugin(plugin.id);
        renderPluginList();
      });
    } else {
      actionBtn.textContent = 'Install';
      actionBtn.classList.add('install');
      actionBtn.addEventListener('click', async () => {
        actionBtn.disabled = true;
        actionBtn.textContent = 'Installing...';
        await pluginManager.installPlugin(plugin.id);
        renderPluginList();
      });
    }

    row.appendChild(info);
    row.appendChild(actionBtn);
    list.appendChild(row);
  });
}

export function showManagePlugins() {
  createModal();
  renderPluginList();
  modalEl.classList.add('visible');
}

function hideModal() {
  if (modalEl) modalEl.classList.remove('visible');
}

export function initManagePluginsButton() {
  // Add button to display menu popover
  const popover = document.getElementById('displayMenuPopover');
  if (!popover) return;

  const btn = document.createElement('button');
  btn.className = 'font-btn';
  btn.id = 'managePluginsBtn';
  btn.title = 'Manage plugins';
  // Puzzle piece icon
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4c-1.1 0-2 .9-2 2v3.8h1.5a2.7 2.7 0 0 1 0 5.4H2V20c0 1.1.9 2 2 2h3.8v-1.5a2.7 2.7 0 0 1 5.4 0V22H17c1.1 0 2-.9 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z');
  svg.appendChild(path);
  btn.appendChild(svg);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    showManagePlugins();
  });

  popover.appendChild(btn);
}
