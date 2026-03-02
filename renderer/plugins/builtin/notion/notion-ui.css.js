// Notion plugin CSS — injected at runtime via ctx.ui.addStyles()
export default `
.notion-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 100;
  display: none;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.notion-modal.visible {
  display: flex;
}

.notion-modal.busy .notion-panel button,
.notion-modal.busy .notion-panel input,
.notion-modal.busy .notion-panel .notion-result-row {
  pointer-events: none;
}

.notion-modal.busy .notion-panel .notion-result-row.loading {
  pointer-events: auto;
}

.notion-panel {
  width: min(760px, 100%);
  max-height: 82vh;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-preview);
  box-shadow: 0 12px 40px var(--shadow);
  padding: 16px;
}

.notion-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.notion-head-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.notion-head h2 {
  font-size: 16px;
  font-weight: 600;
}

.notion-status-dot {
  margin-left: 6px;
  font-size: 13px;
  color: #cc4444;
}

.notion-status-dot.connected {
  color: var(--accent);
}

.notion-close-btn {
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}

.notion-search-row {
  display: grid;
  gap: 8px;
  margin-bottom: 10px;
  grid-template-columns: 1fr auto;
}

.notion-search-row input {
  border: 1px solid var(--border);
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: 7px;
  padding: 8px 10px;
  min-width: 0;
}

.notion-search-row button,
.notion-link-btn,
#notionDisconnectBtn,
#notionConnectCtaBtn {
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 7px;
  padding: 8px 12px;
  cursor: pointer;
}

#notionDisconnectBtn,
#notionCloseBtn,
#notionSearchBtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.notion-disconnected-state {
  min-height: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 14px;
  color: var(--text-secondary);
  font-size: 14px;
  padding: 16px;
}

.notion-token-panel {
  width: min(620px, 100%);
}

.notion-disconnected-state a {
  color: var(--accent);
}

.notion-access-hint {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.4;
  margin: 10px 0 2px;
}

.notion-results {
  --notion-row-height: 44px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  height: calc(var(--notion-row-height) * 5);
  overflow-y: auto;
  overflow-x: hidden;
}

.notion-results.is-busy .notion-result-row {
  pointer-events: none;
}

.notion-empty {
  color: var(--text-muted);
  height: 100%;
  padding: 12px 16px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-size: 12px;
  line-height: 1.45;
}

.notion-result-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: transparent;
  border-bottom: 1px solid var(--border-subtle);
  padding: 8px 12px;
  height: var(--notion-row-height);
  box-sizing: border-box;
  cursor: pointer;
  transition: background-color 150ms ease;
}

.notion-result-row:hover {
  background: var(--selection);
}

.notion-result-row:last-child {
  border-bottom: none;
}

.notion-result-title {
  min-width: 0;
  flex: 1;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notion-result-meta {
  flex-shrink: 0;
  text-align: right;
  color: var(--text-muted);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notion-result-check {
  flex-shrink: 0;
  color: var(--accent);
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}

.notion-loading-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 12px;
}

.notion-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  animation: notion-spin 700ms linear infinite;
}

.notion-loading-label {
  white-space: nowrap;
}

@keyframes notion-spin {
  to {
    transform: rotate(360deg);
  }
}

.notion-link-btn {
  flex-shrink: 0;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--bg-primary);
  border-color: var(--border-subtle);
  font-size: 12px;
  font-weight: 600;
  transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
}

.notion-link-btn:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.notion-logo {
  width: 13px;
  height: 13px;
  display: block;
  opacity: 0.9;
}
`;
