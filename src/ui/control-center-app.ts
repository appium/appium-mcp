/**
 * Static MCP App shared by Appium's smaller interactive tool results.
 *
 * The tool result selects a view and provides its data through
 * structuredContent. Keeping this HTML static lets MCP Apps clients cache the
 * UI instead of receiving another generated HTML document on every call.
 */
export function createControlCenterAppUI(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appium Control Center</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
      color: #1a1a1a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    .header { margin-bottom: 20px; }
    .header h1 { margin: 0 0 6px; font-size: 24px; }
    .subtitle, .status { margin: 0; color: #666; font-size: 14px; }
    .status { min-height: 20px; margin-top: 10px; }
    .status.error { color: #b42318; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 16px;
    }
    .card {
      padding: 16px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .card.active { border: 2px solid #007aff; background: #f0f7ff; }
    .card h2 { margin: 0 0 12px; font-size: 16px; overflow-wrap: anywhere; }
    .detail { margin: 6px 0; color: #666; font-size: 13px; overflow-wrap: anywhere; }
    .detail strong { color: #333; }
    .detail code { font: 12px Monaco, Menlo, monospace; }
    .badge {
      display: inline-block;
      margin-bottom: 10px;
      padding: 3px 8px;
      border-radius: 10px;
      background: #d4edda;
      color: #155724;
      font-size: 11px;
      font-weight: 600;
    }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
    button {
      padding: 8px 12px;
      border: 0;
      border-radius: 6px;
      background: #007aff;
      color: #fff;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    }
    button.secondary { background: #6c757d; }
    button.danger { background: #dc3545; }
    button:disabled { cursor: default; opacity: 0.6; }
    .search {
      width: min(100%, 360px);
      margin: 0 0 16px;
      padding: 9px 12px;
      border: 1px solid #ccc;
      border-radius: 6px;
      font-size: 14px;
    }
    .result {
      margin: 0;
      padding: 16px;
      border-radius: 8px;
      background: #fff;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      font: 13px Monaco, Menlo, monospace;
    }
    .hidden { display: none; }
  </style>
</head>
<body>
  <main class="container">
    <header class="header">
      <h1 id="title">Appium Control Center</h1>
      <p class="subtitle" id="subtitle">Waiting for a tool result…</p>
      <p class="status" id="status"></p>
    </header>
    <section id="content"></section>
  </main>
  <script>
    (() => {
      const title = document.getElementById('title');
      const subtitle = document.getElementById('subtitle');
      const status = document.getElementById('status');
      const content = document.getElementById('content');
      let nextRequestId = 1;
      const pendingRequests = new Map();

      function sendRequest(method, params) {
        const id = nextRequestId++;
        window.parent.postMessage({jsonrpc: '2.0', id, method, params}, '*');
        return new Promise((resolve, reject) => pendingRequests.set(id, {resolve, reject}));
      }

      function sendNotification(method, params) {
        window.parent.postMessage({jsonrpc: '2.0', method, params}, '*');
      }

      function clearView(viewTitle, viewSubtitle) {
        title.textContent = viewTitle;
        subtitle.textContent = viewSubtitle;
        status.textContent = '';
        status.className = 'status';
        content.textContent = '';
      }

      function setStatus(message, isError) {
        status.textContent = message || '';
        status.className = isError ? 'status error' : 'status';
      }

      function appendDetail(card, label, value, code) {
        if (value === undefined || value === null || value === '') return;
        const detail = document.createElement('p');
        detail.className = 'detail';
        const strong = document.createElement('strong');
        strong.textContent = label + ': ';
        const valueElement = document.createElement(code ? 'code' : 'span');
        valueElement.textContent = String(value);
        detail.append(strong, valueElement);
        card.appendChild(detail);
      }

      function button(label, className, onClick) {
        const element = document.createElement('button');
        element.textContent = label;
        if (className) element.className = className;
        element.addEventListener('click', () => onClick(element));
        return element;
      }

      async function callTool(name, args, sourceButton) {
        const previousLabel = sourceButton && sourceButton.textContent;
        if (sourceButton) {
          sourceButton.disabled = true;
          sourceButton.textContent = 'Working…';
        }
        setStatus('Running ' + name + '…', false);
        try {
          const result = await sendRequest('tools/call', {name, arguments: args});
          const text = resultText(result);
          setStatus(text || (result && result.isError ? 'Tool call failed.' : 'Tool call completed.'), Boolean(result && result.isError));
          return result;
        } catch (error) {
          setStatus(error instanceof Error ? error.message : 'Tool call failed.', true);
          return undefined;
        } finally {
          if (sourceButton) {
            sourceButton.disabled = false;
            sourceButton.textContent = previousLabel;
          }
        }
      }

      function resultText(result) {
        const textBlock = result && Array.isArray(result.content)
          ? result.content.find((item) => item && item.type === 'text' && typeof item.text === 'string')
          : undefined;
        return textBlock ? textBlock.text : '';
      }

      function createGrid() {
        const grid = document.createElement('div');
        grid.className = 'grid';
        content.appendChild(grid);
        return grid;
      }

      function renderDevicePicker(view) {
        const devices = Array.isArray(view.devices) ? view.devices : [];
        const deviceLabel = view.platform === 'ios'
          ? (view.iosDeviceType === 'real' ? 'iOS Devices' : 'iOS Simulators')
          : 'Android Devices';
        clearView('📱 Select ' + deviceLabel, 'Found ' + devices.length + ' device' + (devices.length === 1 ? '' : 's'));
        const grid = createGrid();
        devices.forEach((device) => {
          if (!device || typeof device.udid !== 'string') return;
          const card = document.createElement('article');
          card.className = 'card';
          const heading = document.createElement('h2');
          heading.textContent = typeof device.name === 'string' && device.name ? device.name : device.udid;
          card.appendChild(heading);
          appendDetail(card, 'UDID', device.udid, true);
          appendDetail(card, 'State', device.state, false);
          appendDetail(card, 'Type', device.type, false);
          const actions = document.createElement('div');
          actions.className = 'actions';
          actions.appendChild(button('Select Device', '', (source) => callTool('select_device', {
            platform: view.platform,
            ...(view.iosDeviceType ? {iosDeviceType: view.iosDeviceType} : {}),
            deviceUdid: device.udid,
          }, source)));
          card.appendChild(actions);
          grid.appendChild(card);
        });
      }

      function renderSessionDashboard(view) {
        const session = view.session && typeof view.session === 'object' ? view.session : {};
        clearView('📱 Appium Session Dashboard', 'Active session ' + (session.sessionId || ''));
        const grid = createGrid();
        const details = [
          ['Session ID', session.sessionId, true],
          ['Platform', session.platform, false],
          ['Automation', session.automationName, false],
          ['Device', session.deviceName, false],
          ['Platform Version', session.platformVersion, false],
          ['UDID', session.udid, true],
        ];
        details.forEach(([label, value, code]) => {
          if (value === undefined || value === null || value === '') return;
          const card = document.createElement('article');
          card.className = 'card';
          appendDetail(card, label, value, code);
          grid.appendChild(card);
        });

        const actions = document.createElement('div');
        actions.className = 'actions';
        const target = session.sessionId ? {sessionId: session.sessionId} : {};
        actions.append(
          button('📸 Screenshot', '', (source) => callTool('appium_screenshot', target, source)),
          button('📄 Page Source', '', (source) => callTool('appium_get_page_source', target, source)),
          button('🔍 Generate Locators', '', (source) => callTool('generate_locators', target, source)),
          button('🌐 Contexts', 'secondary', (source) => callTool('appium_context', {...target, action: 'list'}, source)),
          button('🗑️ End Session', 'danger', (source) => {
            if (window.confirm('Are you sure you want to end this session?')) {
              return callTool('appium_session_management', {...target, action: 'delete'}, source);
            }
          }),
        );
        content.appendChild(actions);
      }

      function renderContextSwitcher(view) {
        const contexts = Array.isArray(view.contexts) ? view.contexts.filter((item) => typeof item === 'string') : [];
        clearView('🌐 Context Switcher', 'Found ' + contexts.length + ' context' + (contexts.length === 1 ? '' : 's'));
        const grid = createGrid();
        contexts.forEach((contextName) => {
          const active = contextName === view.currentContext;
          const card = document.createElement('article');
          card.className = active ? 'card active' : 'card';
          const heading = document.createElement('h2');
          heading.textContent = contextName;
          card.appendChild(heading);
          if (active) {
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = 'Active';
            card.appendChild(badge);
          }
          appendDetail(card, 'Type', contextName === 'NATIVE_APP' ? 'Native App' : 'WebView', false);
          const actions = document.createElement('div');
          actions.className = 'actions';
          const switchButton = button(active ? 'Current' : 'Switch', active ? 'secondary' : '', async (source) => {
            const result = await callTool('appium_context', {
              action: 'switch',
              context: contextName,
              ...(view.sessionId ? {sessionId: view.sessionId} : {}),
            }, source);
            if (result && !result.isError) {
              view.currentContext = contextName;
              renderContextSwitcher(view);
              setStatus(resultText(result) || 'Context switched.', false);
            }
          });
          switchButton.disabled = active;
          actions.appendChild(switchButton);
          card.appendChild(actions);
          grid.appendChild(card);
        });
      }

      function renderAppList(view) {
        const apps = Array.isArray(view.apps) ? view.apps : [];
        clearView('📱 Installed Apps', 'Found ' + apps.length + ' app' + (apps.length === 1 ? '' : 's'));
        const search = document.createElement('input');
        search.className = 'search';
        search.placeholder = 'Search apps…';
        search.type = 'search';
        content.appendChild(search);
        const grid = createGrid();

        apps.forEach((app) => {
          if (!app || typeof app.packageName !== 'string') return;
          const card = document.createElement('article');
          card.className = 'card';
          const heading = document.createElement('h2');
          heading.textContent = typeof app.appName === 'string' && app.appName ? app.appName : app.packageName;
          card.appendChild(heading);
          appendDetail(card, 'Package', app.packageName, true);
          const target = {id: app.packageName, ...(view.sessionId ? {sessionId: view.sessionId} : {})};
          const actions = document.createElement('div');
          actions.className = 'actions';
          actions.append(
            button('Activate', '', (source) => callTool('appium_app_lifecycle', {...target, action: 'activate'}, source)),
            button('Terminate', 'secondary', (source) => {
              if (window.confirm('Are you sure you want to terminate this app?')) {
                return callTool('appium_app_lifecycle', {...target, action: 'terminate'}, source);
              }
            }),
            button('Uninstall', 'danger', (source) => {
              if (window.confirm('Are you sure you want to uninstall this app? This action cannot be undone.')) {
                return callTool('appium_app_lifecycle', {...target, action: 'uninstall'}, source);
              }
            }),
          );
          card.appendChild(actions);
          card.dataset.search = (heading.textContent + ' ' + app.packageName).toLowerCase();
          grid.appendChild(card);
        });

        search.addEventListener('input', () => {
          const query = search.value.toLowerCase();
          grid.querySelectorAll('.card').forEach((card) => {
            card.classList.toggle('hidden', !String(card.dataset.search || '').includes(query));
          });
        });
      }

      function renderGenericResult(result) {
        clearView('Appium Result', result && result.isError ? 'The tool call failed.' : 'Tool call completed.');
        const resultElement = document.createElement('pre');
        resultElement.className = 'result';
        resultElement.textContent = resultText(result) || 'No text result was returned.';
        content.appendChild(resultElement);
      }

      function setToolResult(result) {
        const view = result && result.structuredContent && result.structuredContent.appiumMcpView;
        if (!view || typeof view !== 'object') {
          renderGenericResult(result);
          return;
        }
        if (view.type === 'device-picker') return renderDevicePicker(view);
        if (view.type === 'session-dashboard') return renderSessionDashboard(view);
        if (view.type === 'context-switcher') return renderContextSwitcher(view);
        if (view.type === 'app-list') return renderAppList(view);
        renderGenericResult(result);
      }

      window.addEventListener('message', (event) => {
        if (event.source !== window.parent) return;
        const message = event.data;
        if (!message || message.jsonrpc !== '2.0') return;

        if (message.id !== undefined && pendingRequests.has(message.id)) {
          const pending = pendingRequests.get(message.id);
          pendingRequests.delete(message.id);
          if (message.error) {
            pending.reject(new Error(message.error.message || 'MCP App request failed'));
          } else {
            pending.resolve(message.result);
          }
          return;
        }

        if (message.method === 'ui/notifications/tool-result') {
          setToolResult(message.params);
        }
      });

      sendRequest('ui/initialize', {
        protocolVersion: '2026-01-26',
        appInfo: {name: 'Appium Control Center', version: '1.0.0'},
        appCapabilities: {availableDisplayModes: ['inline', 'fullscreen']},
      })
        .then(() => sendNotification('ui/notifications/initialized', {}))
        .catch(() => setStatus('Unable to initialize Appium Control Center.', true));
    })();
  </script>
</body>
</html>
  `;
}
