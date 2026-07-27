/**
 * Static MCP App used by generate_locators.
 *
 * Locator data is read from the tool's existing JSON text result, avoiding a
 * second rendered copy of the same element and locator strings in inline HTML.
 */
export function createLocatorGeneratorAppUI(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Locator Generator</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      background: #f5f5f5;
      color: #222;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { margin-bottom: 24px; }
    .header h1 { margin: 0 0 8px; font-size: 24px; }
    .status { margin: 0; color: #666; }
    .grid { display: grid; gap: 16px; }
    .card {
      padding: 16px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }
    .card-header h2 { margin: 0; font-size: 16px; font-weight: 600; }
    .badges { display: flex; flex-wrap: wrap; gap: 6px; }
    .badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
    }
    .badge-clickable { background: #d4edda; color: #155724; }
    .badge-enabled { background: #d1ecf1; color: #0c5460; }
    .badge-displayed { background: #fff3cd; color: #856404; }
    .detail { margin: 0 0 8px; color: #666; font-size: 13px; }
    .detail code {
      padding: 2px 6px;
      border-radius: 3px;
      background: #f5f5f5;
      font-size: 12px;
    }
    .locator-list { margin-top: 12px; }
    .locator {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 6px;
      padding: 8px;
      border-radius: 4px;
      background: #f8f9fa;
    }
    .strategy {
      min-width: 120px;
      color: #007aff;
      font-size: 12px;
      font-weight: 600;
    }
    .selector {
      flex: 1;
      overflow-x: auto;
      padding: 4px 8px;
      border-radius: 3px;
      background: #fff;
      font: 12px Monaco, Menlo, monospace;
    }
    .test-button {
      padding: 4px 12px;
      border: 0;
      border-radius: 4px;
      background: #007aff;
      color: #fff;
      cursor: pointer;
      font-size: 12px;
    }
    .test-button:hover { background: #0056b3; }
  </style>
</head>
<body>
  <main class="container">
    <header class="header">
      <h1>🔍 Generated Locators</h1>
      <p class="status" id="status">Waiting for locators…</p>
    </header>
    <div class="grid" id="locatorGrid"></div>
  </main>
  <script>
    (() => {
      const locatorGrid = document.getElementById('locatorGrid');
      const status = document.getElementById('status');
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

      function locatorsFromToolResult(result) {
        const textBlock = result && Array.isArray(result.content)
          ? result.content.find((item) => item && item.type === 'text' && typeof item.text === 'string')
          : undefined;
        if (!textBlock) return undefined;

        try {
          const parsed = JSON.parse(textBlock.text);
          return Array.isArray(parsed.interactableElements) ? parsed.interactableElements : undefined;
        } catch {
          return undefined;
        }
      }

      function appendTextDetail(card, label, value, useCode) {
        if (typeof value !== 'string' || !value) return;
        const detail = document.createElement('p');
        detail.className = 'detail';
        const labelElement = document.createElement('strong');
        labelElement.textContent = label + ': ';
        detail.appendChild(labelElement);
        const valueElement = document.createElement(useCode ? 'code' : 'span');
        valueElement.textContent = value;
        detail.appendChild(valueElement);
        card.appendChild(detail);
      }

      function appendBadge(container, label, className) {
        const badge = document.createElement('span');
        badge.className = 'badge ' + className;
        badge.textContent = label;
        container.appendChild(badge);
      }

      async function testLocator(strategy, selector, button) {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Testing…';
        try {
          const result = await sendRequest('tools/call', {
            name: 'appium_find_element',
            arguments: {strategy, selector},
          });
          button.textContent = result && result.isError ? 'Failed' : 'Found';
        } catch {
          button.textContent = 'Failed';
        }
        window.setTimeout(() => {
          button.disabled = false;
          button.textContent = originalText;
        }, 1500);
      }

      function renderLocators(elements) {
        locatorGrid.textContent = '';
        status.textContent =
          'Found ' + elements.length + ' interactable element' + (elements.length === 1 ? '' : 's');

        if (elements.length === 0) {
          const empty = document.createElement('p');
          empty.textContent = 'No locators found.';
          locatorGrid.appendChild(empty);
          return;
        }

        elements.forEach((element) => {
          if (!element || typeof element !== 'object') return;
          const card = document.createElement('section');
          card.className = 'card';

          const header = document.createElement('div');
          header.className = 'card-header';
          const heading = document.createElement('h2');
          heading.textContent = typeof element.tagName === 'string' ? element.tagName : 'Element';
          const badges = document.createElement('div');
          badges.className = 'badges';
          if (element.clickable) appendBadge(badges, 'Clickable', 'badge-clickable');
          if (element.enabled) appendBadge(badges, 'Enabled', 'badge-enabled');
          if (element.displayed) appendBadge(badges, 'Displayed', 'badge-displayed');
          header.append(heading, badges);
          card.appendChild(header);

          appendTextDetail(card, 'Text', element.text, false);
          appendTextDetail(card, 'Content Desc', element.contentDesc, false);
          appendTextDetail(card, 'Resource ID', element.resourceId, true);

          const locatorList = document.createElement('div');
          locatorList.className = 'locator-list';
          const locators =
            element.locators && typeof element.locators === 'object' ? Object.entries(element.locators) : [];
          locators.forEach(([strategy, selector]) => {
            if (typeof selector !== 'string') return;
            const locator = document.createElement('div');
            locator.className = 'locator';
            const strategyElement = document.createElement('span');
            strategyElement.className = 'strategy';
            strategyElement.textContent = strategy;
            const selectorElement = document.createElement('code');
            selectorElement.className = 'selector';
            selectorElement.textContent = selector;
            const button = document.createElement('button');
            button.className = 'test-button';
            button.textContent = 'Test';
            button.addEventListener('click', () => testLocator(strategy, selector, button));
            locator.append(strategyElement, selectorElement, button);
            locatorList.appendChild(locator);
          });
          card.appendChild(locatorList);
          locatorGrid.appendChild(card);
        });
      }

      function setToolResult(result) {
        const elements = locatorsFromToolResult(result);
        if (!elements) {
          locatorGrid.textContent = '';
          status.textContent = result && result.isError
            ? 'Failed to generate locators.'
            : 'No locator data was returned.';
          return;
        }
        renderLocators(elements);
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
        appInfo: {name: 'Appium Locator Generator', version: '1.0.0'},
        appCapabilities: {availableDisplayModes: ['inline', 'fullscreen']},
      })
        .then(() => sendNotification('ui/notifications/initialized', {}))
        .catch(() => {
          status.textContent = 'Unable to initialize locator generator.';
        });
    })();
  </script>
</body>
</html>
  `;
}
