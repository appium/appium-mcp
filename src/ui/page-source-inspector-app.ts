/**
 * Static MCP App used by appium_get_page_source.
 *
 * The page source is read from the tool's existing text result, so it is sent
 * to the client only once instead of being duplicated inside inline HTML.
 */
export function createPageSourceInspectorAppUI(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Source Inspector</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      overflow: hidden;
      background: #1e1e1e;
      color: #d4d4d4;
      font-family: Monaco, Menlo, "Courier New", monospace;
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid #3e3e3e;
      background: #2d2d2d;
    }
    .toolbar-left, .toolbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .title { font-size: 14px; font-weight: 500; }
    .info { color: #999; font-size: 12px; }
    .btn {
      padding: 6px 12px;
      border: 0;
      border-radius: 4px;
      background: #007aff;
      color: #fff;
      cursor: pointer;
      font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .btn:hover { background: #0056b3; }
    .btn-secondary { background: #444; }
    .btn-secondary:hover { background: #555; }
    .search-box {
      width: 200px;
      padding: 6px 12px;
      border: 1px solid #555;
      border-radius: 4px;
      outline: none;
      background: #3e3e3e;
      color: #d4d4d4;
      font-size: 13px;
    }
    .search-box:focus { border-color: #007aff; }
    .viewer {
      height: calc(100vh - 50px);
      overflow: auto;
      padding: 16px;
    }
    .xml-content {
      margin: 0;
      white-space: pre;
      color: #d4d4d4;
      font-size: 13px;
      line-height: 1.6;
    }
    mark {
      border-radius: 2px;
      background: #ffd54f;
      color: #1e1e1e;
    }
    .empty {
      color: #999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-left">
      <span class="title">📄 Page Source Inspector</span>
      <span class="info" id="sourceInfo">Waiting for page source…</span>
    </div>
    <div class="toolbar-right">
      <input type="text" class="search-box" id="searchBox" placeholder="Search…">
      <button class="btn btn-secondary" id="copyButton">Copy</button>
      <button class="btn btn-secondary" id="formatButton">Format</button>
      <button class="btn" id="generateButton">Generate Locators</button>
    </div>
  </div>
  <div class="viewer">
    <pre class="xml-content empty" id="xmlContent">Waiting for page source…</pre>
  </div>
  <script>
    (() => {
      const PAGE_SOURCE_PREFIX = 'Page source retrieved successfully: \\n\\\`\\\`\\\`xml ';
      const xmlContent = document.getElementById('xmlContent');
      const sourceInfo = document.getElementById('sourceInfo');
      const searchBox = document.getElementById('searchBox');
      let source = '';
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

      function sourceFromToolResult(result) {
        const textBlock = result && Array.isArray(result.content)
          ? result.content.find((item) => item && item.type === 'text' && typeof item.text === 'string')
          : undefined;
        if (!textBlock) {
          return '';
        }

        let text = textBlock.text;
        if (text.startsWith(PAGE_SOURCE_PREFIX) && text.endsWith('\`\`\`')) {
          text = text.slice(PAGE_SOURCE_PREFIX.length, -3);
        }
        return text;
      }

      function appendHighlightedText(container, text, query) {
        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();
        let position = 0;

        while (position < text.length) {
          const matchIndex = lowerText.indexOf(lowerQuery, position);
          if (matchIndex === -1) {
            container.appendChild(document.createTextNode(text.slice(position)));
            return;
          }
          if (matchIndex > position) {
            container.appendChild(document.createTextNode(text.slice(position, matchIndex)));
          }
          const mark = document.createElement('mark');
          mark.textContent = text.slice(matchIndex, matchIndex + query.length);
          container.appendChild(mark);
          position = matchIndex + query.length;
        }
      }

      function renderSource() {
        const query = searchBox.value.trim();
        xmlContent.textContent = '';
        xmlContent.classList.toggle('empty', source.length === 0);
        if (!source) {
          xmlContent.textContent = 'No page source was returned.';
        } else if (!query) {
          xmlContent.textContent = source;
        } else {
          appendHighlightedText(xmlContent, source, query);
        }
        sourceInfo.textContent = source.length + ' characters';
      }

      function setSource(nextSource) {
        source = nextSource;
        renderSource();
      }

      function formatXML() {
        if (!source) return;
        try {
          const parser = new DOMParser();
          const documentNode = parser.parseFromString(source, 'text/xml');
          if (documentNode.querySelector('parsererror')) {
            throw new Error('Invalid XML');
          }
          source = new XMLSerializer().serializeToString(documentNode);
          renderSource();
        } catch {
          window.alert('Failed to format XML');
        }
      }

      async function copyToClipboard() {
        if (!source) return;
        try {
          await navigator.clipboard.writeText(source);
        } catch {
          window.alert('Failed to copy page source');
        }
      }

      async function generateLocators() {
        try {
          await sendRequest('tools/call', {name: 'generate_locators', arguments: {}});
        } catch {
          window.alert('Failed to generate locators');
        }
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
          setSource(sourceFromToolResult(message.params));
        }
      });

      searchBox.addEventListener('input', renderSource);
      document.getElementById('copyButton').addEventListener('click', copyToClipboard);
      document.getElementById('formatButton').addEventListener('click', formatXML);
      document.getElementById('generateButton').addEventListener('click', generateLocators);

      sendRequest('ui/initialize', {
        protocolVersion: '2026-01-26',
        appInfo: {name: 'Appium Page Source Inspector', version: '1.0.0'},
        appCapabilities: {availableDisplayModes: ['inline', 'fullscreen']},
      })
        .then(() => sendNotification('ui/notifications/initialized', {}))
        .catch(() => {
          sourceInfo.textContent = 'Unable to initialize inspector';
        });
    })();
  </script>
</body>
</html>
  `;
}
