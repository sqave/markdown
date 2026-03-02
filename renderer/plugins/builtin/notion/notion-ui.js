// Notion Plugin — all frontend logic extracted from app.js
import NOTION_CSS from './notion-ui.css.js';

const NOTION_LOGO_SVG = `<svg class="notion-logo" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path fill="currentColor" d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z"></path></svg>`;

const SYNC_ICON_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 5v5h-5"/><path d="M4 19v-5h5"/><path d="M18.2 8.8A7 7 0 0 0 6 10"/><path d="M5.8 15.2A7 7 0 0 0 18 14"/></svg>`;

const NOTION_MODAL_HTML = `<div class="notion-modal" id="notionModal">
  <div class="notion-panel">
    <div class="notion-head">
      <h2>Notion Plugin <span id="notionStatusDot" class="notion-status-dot" aria-hidden="true">\u2715</span></h2>
      <div class="notion-head-actions">
        <button id="notionDisconnectBtn" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M10 17l5-5-5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
            <path d="M15 12H4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            <path d="M20 4v16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
          </svg>
          Disconnect
        </button>
        <button id="notionCloseBtn" class="notion-close-btn" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
          </svg>
          Close
        </button>
      </div>
    </div>
    <div id="notionDisconnectedState" class="notion-disconnected-state">
      <p>
        Connect to Notion to start accessing pages directly and syncing remote edits.
        Set up your internal integration here:
        <a href="https://www.notion.so/profile/integrations/internal" target="_blank" rel="noreferrer">notion.so/profile/integrations/internal</a>
      </p>
      <button id="notionConnectCtaBtn" type="button">Connect</button>
    </div>
    <div id="notionConnectedState">
      <div class="notion-search-row">
        <input id="notionSearchInput" type="text" placeholder="Search pages by title or keyword">
        <button id="notionSearchBtn" type="button">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"></circle>
            <path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
          </svg>
          Search
        </button>
      </div>
      <div id="notionResults" class="notion-results"></div>
      <p class="notion-access-hint">
        If pages are missing, open that page in Notion, click the three dots (...) \u2192 Connections \u2192 select this integration. Access is not enabled for all pages by default.
      </p>
    </div>
  </div>
</div>`;

const NOTION_TOKEN_MODAL_HTML = `<div class="notion-modal" id="notionTokenModal">
  <div class="notion-panel notion-token-panel">
    <div class="notion-head">
      <h2>Connect Notion</h2>
      <button id="notionTokenCloseBtn" class="notion-close-btn" type="button">Close</button>
    </div>
    <div class="notion-search-row">
      <input id="notionTokenInput" type="password" placeholder="Paste internal integration secret">
      <button id="notionTokenConnectBtn" type="button">Connect</button>
    </div>
    <p class="notion-access-hint">
      Make sure to enable content access for each page you want to use: open the page in Notion, click ... \u2192 Connections \u2192 select this integration.
    </p>
  </div>
</div>`;

function createNotionIconSvg(className) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', 'M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z');
  svg.appendChild(path);
  return svg;
}

export class NotionUI {
  constructor(ctx) {
    this.ctx = ctx;
    this.notionAuth = { connected: false, workspaceName: null, botName: null };
    this.importInProgress = false;
    this.syncInProgress = false;
    this.connectInProgress = false;
    this.styleEl = null;
    this.notionBtnEl = null;
    this.notionSyncBtnEl = null;
    this._tokenConnectDefaultLabel = 'Connect';
  }

  init() {
    // Inject styles
    this.styleEl = this.ctx.ui.addStyles(NOTION_CSS);

    // Add toolbar buttons
    this.notionSyncBtnEl = this.ctx.ui.addToolbarButton({
      id: 'notionSyncBtn',
      icon: SYNC_ICON_SVG,
      title: 'Check Notion page changes and sync',
      onClick: () => this._handleNotionSync(),
      hidden: true,
    });

    this.notionBtnEl = this.ctx.ui.addToolbarButton({
      id: 'notionBtn',
      icon: NOTION_LOGO_SVG,
      title: 'Open Notion plugin',
      onClick: () => this._openNotionModal(),
    });

    // Add modals
    this.ctx.ui.addModal('notionModalWrapper', NOTION_MODAL_HTML + NOTION_TOKEN_MODAL_HTML);

    // Cache DOM refs
    this._cacheDomRefs();

    // Bind event listeners
    this._bindListeners();

    // Listen for plugin bus events
    this.ctx.on('tab:activated', () => this._updateButtons());
    this.ctx.on('tab:render', (data) => this._onTabRender(data));
    this.ctx.on('document:save', (data) => this._onDocumentSave(data));

    // Initial auth check
    this._refreshAuthStatus();
  }

  destroy() {
    // Styles and toolbar buttons are cleaned up by plugin-manager
    // Just clean up references
    this.notionBtnEl = null;
    this.notionSyncBtnEl = null;
  }

  _cacheDomRefs() {
    this.notionModal = document.getElementById('notionModal');
    this.notionTokenModal = document.getElementById('notionTokenModal');
    this.notionTokenInput = document.getElementById('notionTokenInput');
    this.notionStatusDot = document.getElementById('notionStatusDot');
    this.notionDisconnectBtn = document.getElementById('notionDisconnectBtn');
    this.notionConnectCtaBtn = document.getElementById('notionConnectCtaBtn');
    this.notionDisconnectedState = document.getElementById('notionDisconnectedState');
    this.notionConnectedState = document.getElementById('notionConnectedState');
    this.notionSearchInput = document.getElementById('notionSearchInput');
    this.notionSearchBtn = document.getElementById('notionSearchBtn');
    this.notionResults = document.getElementById('notionResults');
    this.notionCloseBtn = document.getElementById('notionCloseBtn');
    this.notionTokenCloseBtn = document.getElementById('notionTokenCloseBtn');
    this.notionTokenConnectBtn = document.getElementById('notionTokenConnectBtn');
    if (this.notionTokenConnectBtn) {
      this._tokenConnectDefaultLabel = this.notionTokenConnectBtn.textContent;
    }
  }

  _bindListeners() {
    if (this.notionCloseBtn) {
      this.notionCloseBtn.addEventListener('click', () => {
        if (this.importInProgress) return;
        this.notionModal.classList.remove('visible');
      });
    }
    if (this.notionModal) {
      this.notionModal.addEventListener('click', (e) => {
        if (this.importInProgress) return;
        if (e.target === this.notionModal) this.notionModal.classList.remove('visible');
      });
    }
    if (this.notionTokenCloseBtn) {
      this.notionTokenCloseBtn.addEventListener('click', () => {
        if (this.connectInProgress) return;
        this.notionTokenModal.classList.remove('visible');
      });
    }
    if (this.notionTokenModal) {
      this.notionTokenModal.addEventListener('click', (e) => {
        if (this.connectInProgress) return;
        if (e.target === this.notionTokenModal) this.notionTokenModal.classList.remove('visible');
      });
    }
    if (this.notionTokenConnectBtn) {
      this.notionTokenConnectBtn.addEventListener('click', () => this._handleTokenConnect());
    }
    if (this.notionConnectCtaBtn) {
      this.notionConnectCtaBtn.addEventListener('click', () => {
        if (this.connectInProgress) return;
        this._setConnectBusy(false);
        if (this.notionTokenInput) this.notionTokenInput.value = '';
        this.notionTokenModal.classList.add('visible');
        if (this.notionTokenInput) this.notionTokenInput.focus();
      });
    }
    if (this.notionDisconnectBtn) {
      this.notionDisconnectBtn.addEventListener('click', () => this._handleDisconnect());
    }
    if (this.notionSearchBtn) {
      this.notionSearchBtn.addEventListener('click', () => this._handleSearch());
    }
    if (this.notionSearchInput) {
      this.notionSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._handleSearch();
        }
      });
    }
  }

  _getPluginData(tabId) {
    return this.ctx.tabs.getPluginData(tabId) || {};
  }

  _setPluginData(tabId, data) {
    this.ctx.tabs.setPluginData(tabId, data);
  }

  _setImportBusy(isBusy) {
    this.importInProgress = isBusy;
    if (this.notionModal) this.notionModal.classList.toggle('busy', isBusy);
    if (this.notionSearchInput) this.notionSearchInput.disabled = isBusy;
    if (this.notionSearchBtn) this.notionSearchBtn.disabled = isBusy;
    if (this.notionDisconnectBtn) this.notionDisconnectBtn.disabled = isBusy;
    if (this.notionCloseBtn) this.notionCloseBtn.disabled = isBusy;
  }

  _setSyncBusy(isBusy) {
    this.syncInProgress = isBusy;
    if (this.notionSyncBtnEl) {
      this.notionSyncBtnEl.classList.toggle('syncing', isBusy);
      this.notionSyncBtnEl.disabled = isBusy;
      this.notionSyncBtnEl.title = isBusy ? 'Syncing Notion changes...' : 'Check Notion page changes and sync';
    }
  }

  _setConnectBusy(isBusy) {
    this.connectInProgress = isBusy;
    if (this.notionTokenInput) this.notionTokenInput.disabled = isBusy;
    if (this.notionTokenConnectBtn) {
      this.notionTokenConnectBtn.disabled = isBusy;
      this.notionTokenConnectBtn.textContent = isBusy ? 'Connecting...' : this._tokenConnectDefaultLabel;
    }
    if (this.notionTokenCloseBtn) this.notionTokenCloseBtn.disabled = isBusy;
  }

  _updateButtons() {
    const tab = this.ctx.tabs.getActive();
    if (this.notionBtnEl) {
      this.notionBtnEl.classList.toggle('connected', Boolean(this.notionAuth.connected));
    }
    if (tab && this.notionSyncBtnEl) {
      const nd = this._getPluginData(tab.id);
      const hasPage = Boolean(nd.pageId);
      const hasExtChange = Boolean(nd.hasExternalChange);
      this.notionSyncBtnEl.classList.toggle('hidden', !hasPage);
      this.notionSyncBtnEl.classList.toggle('warn', hasExtChange);
      this.notionSyncBtnEl.classList.toggle('syncing', this.syncInProgress);
      this.notionSyncBtnEl.disabled = this.syncInProgress;
    } else if (this.notionSyncBtnEl) {
      this.notionSyncBtnEl.classList.add('hidden');
    }
  }

  _onTabRender({ tab, element, nameSpan }) {
    const nd = this._getPluginData(tab.id);
    if (nd.pageId) {
      const icon = createNotionIconSvg('notion-logo tab-remote-icon');
      element.insertBefore(icon, nameSpan);
      // Add remote-dirty indicator for notion external changes
      if (nd.hasExternalChange) {
        element.classList.add('remote-dirty');
      }
    }
  }

  async _onDocumentSave({ tab, content }) {
    const nd = this._getPluginData(tab.id);
    if (nd.pageId) {
      await this._handleNotionSync();
    }
  }

  async _openNotionModal() {
    await this._refreshAuthStatus();
    if (this.notionModal) this.notionModal.classList.add('visible');
    if (this.notionAuth.connected) {
      await this._loadRecentPages();
    }
  }

  async _refreshAuthStatus() {
    try {
      this.notionAuth = await this.ctx.backend.invoke('notion_auth_status_command');
    } catch (_) {
      this.notionAuth = { connected: false, workspaceName: null, botName: null };
    }
    if (this.notionStatusDot) {
      this.notionStatusDot.textContent = this.notionAuth.connected ? '\u2713' : '\u2715';
      this.notionStatusDot.classList.toggle('connected', this.notionAuth.connected);
    }
    if (this.notionDisconnectedState) {
      this.notionDisconnectedState.classList.toggle('hidden', this.notionAuth.connected);
    }
    if (this.notionConnectedState) {
      this.notionConnectedState.classList.toggle('hidden', !this.notionAuth.connected);
    }
    if (this.notionDisconnectBtn) {
      this.notionDisconnectBtn.classList.toggle('hidden', !this.notionAuth.connected);
    }
    this._updateButtons();
  }

  _renderResults(items) {
    if (!this.notionResults) return;
    this.notionResults.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'notion-empty';
      empty.textContent = 'No pages found. Please make sure the integration connection is enabled for this page in Notion.';
      this.notionResults.appendChild(empty);
      return;
    }

    const tabsArr = this.ctx.tabs.getAll();

    items.forEach((item) => {
      const existingLinkedTab = tabsArr.find(t => {
        const nd = t.pluginData?.notion;
        return nd && nd.pageId === item.id;
      });
      const row = document.createElement('div');
      row.className = `notion-result-row${existingLinkedTab ? ' already-imported' : ''}`;
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label',
        existingLinkedTab
          ? `Open imported Notion page ${item.title || 'Untitled'}`
          : `Link Notion page ${item.title || 'Untitled'}`
      );

      const name = document.createElement('div');
      name.className = 'notion-result-title';
      name.textContent = item.title || 'Untitled';

      const meta = document.createElement('div');
      meta.className = 'notion-result-meta';
      if (item.lastEditedTime) {
        const dt = new Date(item.lastEditedTime);
        meta.textContent = Number.isNaN(dt.getTime())
          ? `Edited: ${item.lastEditedTime}`
          : `Edited ${dt.toLocaleString()}`;
      } else {
        meta.textContent = item.id;
      }

      const check = document.createElement('span');
      check.className = 'notion-result-check';
      check.textContent = '\u2713';
      check.setAttribute('aria-hidden', 'true');

      const handleLink = async () => {
        // Check if already linked to a tab
        const linkedTab = tabsArr.find(t => {
          const nd = t.pluginData?.notion;
          return nd && nd.pageId === item.id;
        });
        if (linkedTab) {
          this.ctx.tabs.activateTab(linkedTab.id);
          if (this.notionModal) this.notionModal.classList.remove('visible');
          return;
        }

        if (this.importInProgress) return;
        if (row.classList.contains('loading')) return;
        this._setImportBusy(true);
        if (this.notionResults) this.notionResults.classList.add('is-busy');
        row.classList.add('loading');
        row.setAttribute('aria-busy', 'true');
        const previousMeta = meta.textContent;
        meta.textContent = 'Importing...';

        try {
          const pulled = await this.ctx.backend.invoke('notion_pull_page', { pageId: item.id });
          const activeTab = this.ctx.tabs.getActive();
          if (!activeTab) return;

          const nd = this._getPluginData(activeTab.id);
          const isReusable = !activeTab.filePath && !nd.pageId && !activeTab.isDirty
            && this.ctx.document.getText().length === 0;

          let targetTab = activeTab;
          if (!isReusable) {
            targetTab = this.ctx.tabs.createNewTab();
          }
          if (!targetTab) return;

          // Set plugin data on the tab
          this._setPluginData(targetTab.id, {
            pageId: pulled.pageId,
            pageTitle: pulled.title || 'Untitled',
            lastSyncedContent: pulled.content || '',
            lastEditedTime: pulled.lastEditedTime || null,
            hasExternalChange: false,
          });

          // Update editor content
          this.ctx.document.setText(pulled.content || '');
          targetTab.isDirty = false;
          targetTab.filePath = null;
          this.ctx.app.scheduleSessionSave();
          this._updateButtons();
          if (this.notionModal) this.notionModal.classList.remove('visible');
        } catch (e) {
          console.error('Failed to link Notion page:', e);
          meta.textContent = previousMeta;
          await this.ctx.app.confirmAction(
            `Could not pull page from Notion: ${String(e)}`,
            { title: 'Notion Error', kind: 'warning', okLabel: 'OK', cancelLabel: 'Dismiss' }
          );
        } finally {
          if (this.notionResults) this.notionResults.classList.remove('is-busy');
          row.classList.remove('loading');
          row.removeAttribute('aria-busy');
          this._setImportBusy(false);
        }
      };

      row.addEventListener('click', handleLink);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleLink();
        }
      });

      row.appendChild(name);
      row.appendChild(meta);
      if (existingLinkedTab) {
        row.appendChild(check);
      }
      this.notionResults.appendChild(row);
    });
  }

  _renderLoading() {
    if (!this.notionResults) return;
    this.notionResults.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'notion-loading-state';
    const spinner = document.createElement('div');
    spinner.className = 'notion-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'notion-loading-label';
    label.textContent = 'Loading pages...';
    loading.appendChild(spinner);
    loading.appendChild(label);
    this.notionResults.appendChild(loading);
  }

  async _loadRecentPages() {
    this._renderLoading();
    try {
      const results = await this.ctx.backend.invoke('notion_search_pages', { query: '' });
      this._renderResults(results || []);
    } catch (e) {
      console.error('Notion recent pages load failed:', e);
      this._renderResults([]);
    }
  }

  async _handleSearch() {
    if (this.importInProgress) return;
    const query = this.notionSearchInput ? this.notionSearchInput.value.trim() : '';
    this._renderLoading();
    try {
      const results = await this.ctx.backend.invoke('notion_search_pages', { query });
      this._renderResults(results || []);
    } catch (e) {
      console.error('Notion search failed:', e);
      await this.ctx.app.confirmAction(
        `Search failed: ${String(e)}`,
        { title: 'Notion Error', kind: 'warning', okLabel: 'OK', cancelLabel: 'Dismiss' }
      );
    }
  }

  async _handleTokenConnect() {
    if (this.connectInProgress) return;
    const token = this.notionTokenInput ? this.notionTokenInput.value.trim() : '';
    if (!token) return;
    this._setConnectBusy(true);
    try {
      await this.ctx.backend.invoke('notion_connect', { token });
      if (this.notionTokenInput) this.notionTokenInput.value = '';
      if (this.notionTokenModal) this.notionTokenModal.classList.remove('visible');
      await this._refreshAuthStatus();
      await this._loadRecentPages();
    } catch (e) {
      console.error('Notion connect failed:', e);
      await this.ctx.app.confirmAction(
        `Connection failed: ${String(e)}`,
        { title: 'Notion Error', kind: 'warning', okLabel: 'OK', cancelLabel: 'Dismiss' }
      );
    } finally {
      this._setConnectBusy(false);
    }
  }

  async _handleDisconnect() {
    try {
      await this.ctx.backend.invoke('notion_disconnect');
      await this._refreshAuthStatus();
      this._renderResults([]);
    } catch (e) {
      console.error('Notion disconnect failed:', e);
    }
  }

  async _handleNotionSync() {
    const tab = this.ctx.tabs.getActive();
    if (!tab) return;
    const nd = this._getPluginData(tab.id);
    if (!nd.pageId) return;

    this._setSyncBusy(true);
    try {
      let remote;
      try {
        remote = await this.ctx.backend.invoke('notion_pull_page', { pageId: nd.pageId });
      } catch (e) {
        console.error('Notion pull failed:', e);
        await this.ctx.app.confirmAction(
          `Could not read remote Notion page for sync: ${String(e)}`,
          { title: 'Sync Failed', kind: 'warning', okLabel: 'OK', cancelLabel: 'Dismiss' }
        );
        return;
      }

      const remoteContent = remote.content || '';
      const baseContent = nd.lastSyncedContent || '';
      const mineContent = this.ctx.document.getText();
      const remoteChanged = remoteContent !== baseContent;
      const localChanged = mineContent !== baseContent;

      if (remoteChanged && !localChanged) {
        this.ctx.document.setText(remoteContent);
        tab.isDirty = false;
        this._setPluginData(tab.id, {
          ...nd,
          lastSyncedContent: remoteContent,
          hasExternalChange: false,
          lastEditedTime: remote.lastEditedTime || null,
          pageTitle: remote.title || nd.pageTitle || 'Untitled',
        });
        this.ctx.app.scheduleSessionSave();
        this._updateButtons();
        return;
      }

      if (!localChanged) {
        this._setPluginData(tab.id, { ...nd, hasExternalChange: false });
        this._updateButtons();
        this.ctx.app.scheduleSessionSave();
        return;
      }

      if (remoteChanged) {
        const merge = this.ctx.merge.threeWayMerge(baseContent, mineContent, remoteContent);
        this._setPluginData(tab.id, { ...nd, hasExternalChange: true });
        this._updateButtons();
        this.ctx.app.scheduleSessionSave();

        if (!merge.hasConflicts) {
          try {
            const pushed = await this.ctx.backend.invoke('notion_push_page', { pageId: nd.pageId, content: merge.mergedText });
            this.ctx.document.setText(merge.mergedText);
            tab.isDirty = false;
            this._setPluginData(tab.id, {
              ...nd,
              lastSyncedContent: merge.mergedText,
              hasExternalChange: false,
              lastEditedTime: pushed.lastEditedTime || null,
              pageTitle: pushed.title || remote.title || nd.pageTitle || 'Untitled',
            });
            this.ctx.app.scheduleSessionSave();
            this._updateButtons();
          } catch (e) {
            console.error('Notion push after auto-merge failed:', e);
            await this.ctx.app.confirmAction(
              `Could not push merged changes to Notion: ${String(e)}`,
              { title: 'Push Failed', kind: 'warning', okLabel: 'OK', cancelLabel: 'Dismiss' }
            );
          }
          return;
        }

        const doMerge = await this.ctx.app.confirmAction(
          'Conflicting changes were detected between local edits and Notion. Merge into the editor?',
          { title: 'External Changes Detected', kind: 'warning', okLabel: 'Merge Changes', cancelLabel: 'More Options' }
        );
        if (doMerge) {
          this.ctx.document.setText(merge.mergedText);
          tab.isDirty = true;
          this._setPluginData(tab.id, {
            ...nd,
            lastSyncedContent: remoteContent,
            hasExternalChange: false,
            lastEditedTime: remote.lastEditedTime || null,
            pageTitle: remote.title || nd.pageTitle || 'Untitled',
          });
          this.ctx.app.scheduleSessionSave();
          this._updateButtons();
          return;
        }

        const doOverwrite = await this.ctx.app.confirmAction(
          'Overwrite Notion changes with your current local content?',
          { title: 'Sync Options', kind: 'warning', okLabel: 'Overwrite', cancelLabel: 'Cancel' }
        );
        if (!doOverwrite) return;
      }

      // Push local content
      try {
        const pushed = await this.ctx.backend.invoke('notion_push_page', { pageId: nd.pageId, content: mineContent });
        tab.isDirty = false;
        this._setPluginData(tab.id, {
          ...nd,
          lastSyncedContent: mineContent,
          hasExternalChange: false,
          lastEditedTime: pushed.lastEditedTime || null,
          pageTitle: pushed.title || nd.pageTitle || 'Untitled',
        });
        this.ctx.app.scheduleSessionSave();
        this._updateButtons();
      } catch (e) {
        console.error('Notion push failed:', e);
        await this.ctx.app.confirmAction(
          `Could not push changes to Notion: ${String(e)}`,
          { title: 'Push Failed', kind: 'warning', okLabel: 'OK', cancelLabel: 'Dismiss' }
        );
      }
    } finally {
      this._setSyncBusy(false);
    }
  }
}
