// Sandboxed Plugin Runtime — hidden iframe with postMessage API
// Provides isolated execution for untrusted plugin code

export class PluginSandbox {
  constructor(pluginId, pluginCode) {
    this.pluginId = pluginId;
    this._iframe = null;
    this._ready = false;
    this._messageHandlers = new Map();
    this._nextCallId = 0;
    this._pendingCalls = new Map();
    this._pluginCode = pluginCode;
  }

  async start() {
    return new Promise((resolve) => {
      this._iframe = document.createElement('iframe');
      this._iframe.sandbox = 'allow-scripts';
      this._iframe.style.display = 'none';

      // Listen for messages from the sandbox
      this._onMessage = (e) => {
        if (e.source !== this._iframe.contentWindow) return;
        const { type, callId, method, args, result, error } = e.data || {};

        if (type === 'ready') {
          this._ready = true;
          resolve();
          return;
        }

        if (type === 'call') {
          // Plugin is calling a host method
          this._handlePluginCall(callId, method, args);
          return;
        }

        if (type === 'response') {
          // Response to a host->plugin call
          const pending = this._pendingCalls.get(callId);
          if (pending) {
            this._pendingCalls.delete(callId);
            if (error) pending.reject(new Error(error));
            else pending.resolve(result);
          }
        }
      };
      window.addEventListener('message', this._onMessage);

      // Build the sandbox HTML with the plugin API
      const html = `<!DOCTYPE html><html><head><script>
        const hostApi = {
          call(method, ...args) {
            return new Promise((resolve, reject) => {
              const callId = Math.random().toString(36).slice(2);
              const handler = (e) => {
                if (e.data && e.data.type === 'response' && e.data.callId === callId) {
                  window.removeEventListener('message', handler);
                  if (e.data.error) reject(new Error(e.data.error));
                  else resolve(e.data.result);
                }
              };
              window.addEventListener('message', handler);
              parent.postMessage({ type: 'call', callId, method, args }, '*');
            });
          }
        };

        const cogmd = {
          document: {
            getText: () => hostApi.call('document.getText'),
            setText: (text) => hostApi.call('document.setText', text),
          },
          toolbar: {
            addButton: (opts) => hostApi.call('toolbar.addButton', opts),
          },
          hooks: {
            on: (event, fn) => { /* stored locally */ },
            off: (event, fn) => { /* stored locally */ },
          },
        };

        parent.postMessage({ type: 'ready' }, '*');

        try {
          ${this._pluginCode}
        } catch (e) {
          parent.postMessage({ type: 'error', error: e.message }, '*');
        }
      <\/script></head><body></body></html>`;

      this._iframe.srcdoc = html;
      document.body.appendChild(this._iframe);
    });
  }

  _handlePluginCall(callId, method, args) {
    const handler = this._messageHandlers.get(method);
    if (!handler) {
      this._respond(callId, null, `Unknown method: ${method}`);
      return;
    }

    try {
      const result = handler(...(args || []));
      if (result && typeof result.then === 'function') {
        result
          .then(r => this._respond(callId, r))
          .catch(e => this._respond(callId, null, e.message));
      } else {
        this._respond(callId, result);
      }
    } catch (e) {
      this._respond(callId, null, e.message);
    }
  }

  _respond(callId, result, error) {
    if (!this._iframe || !this._iframe.contentWindow) return;
    this._iframe.contentWindow.postMessage({
      type: 'response',
      callId,
      result,
      error,
    }, '*');
  }

  /**
   * Register a host method that plugins can call.
   * @param {string} method - Method name (e.g., 'document.getText')
   * @param {Function} handler - Handler function
   */
  registerMethod(method, handler) {
    this._messageHandlers.set(method, handler);
  }

  destroy() {
    if (this._onMessage) {
      window.removeEventListener('message', this._onMessage);
    }
    if (this._iframe) {
      this._iframe.remove();
      this._iframe = null;
    }
    this._ready = false;
    this._messageHandlers.clear();
    this._pendingCalls.clear();
  }
}
