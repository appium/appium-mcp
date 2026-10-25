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
    :root { color-scheme: dark; --bg: #17191d; --panel: #202329; --line: #343941; --text: #e5e8ee; --muted: #a3acba; --accent: #91baff; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body { margin: 0; overflow: auto; background: var(--bg); color: var(--text); font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    summary { cursor: pointer; padding: 16px 20px; }
    summary::marker { color: var(--muted); }
    .title { font-size: 15px; font-weight: 600; letter-spacing: -.2px; }
    .info { color: var(--muted); font-size: 12px; margin-left: 10px; }
    .toolbar, .section-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
    .toolbar { padding: 12px 20px; border-block: 1px solid var(--line); background: var(--panel); }
    .toolbar-right { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .btn { padding: 8px 12px; border: 1px solid transparent; border-radius: 7px; background: #a7c7ff; color: #14243d; cursor: pointer; font: inherit; font-weight: 600; }
    .btn:hover { background: #c2d8ff; }
    .btn:disabled { opacity: .55; cursor: wait; }
    .btn-secondary { background: transparent; border-color: #48505d; color: var(--text); }
    .btn-secondary:hover { background: #303641; }
    .btn:focus-visible, summary:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
    .search-box { width: min(240px, 100%); min-width: 0; padding: 8px 12px; border: 1px solid #48505d; border-radius: 7px; background: var(--bg); color: var(--text); font: inherit; }
    .search-box::placeholder { color: var(--muted); }
    .viewer { height: 320px; min-height: 160px; resize: vertical; overflow: auto; padding: 20px; }
    .xml-content, .selector { margin: 0; font: 12px/1.75 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .xml-content { white-space: pre; color: #c5d3e7; }
    mark { border-radius: 3px; background: #eac77a; color: #252019; }
    .empty, .hint { color: var(--muted); }
    .empty { font-family: inherit; }
    .hint { margin: 6px 0 0; font-size: 12px; }
    .locators { border-top: 1px solid var(--line); padding: 20px; }
    h2 { margin: 0; font-size: 14px; font-weight: 600; }
    #locatorStatus { margin: 16px 0 10px; color: var(--accent); font-size: 12px; }
    .locator-results { max-height: 480px; overflow: auto; }
    .locator-card { margin: 8px 0; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); overflow: hidden; }
    .locator-card summary { padding: 12px 14px; overflow-wrap: anywhere; }
    .element-type { margin-left: 8px; color: var(--muted); font-size: 11px; }
    .locator-row { margin: 0 14px 14px; }
    .strategy { display: block; margin-bottom: 5px; color: var(--muted); font-size: 11px; font-weight: 600; }
    .selector { padding: 10px 12px; background: var(--bg); border-radius: 5px; white-space: pre-wrap; overflow-wrap: anywhere; user-select: all; }
    @media (max-width: 420px) { .toolbar, .locators { padding: 12px; } .toolbar-right { width: 100%; } .search-box { width: 100%; } .info { display: block; margin: 4px 0 0 18px; } }
  </style>
</head>
<body>
  <details open>
    <summary>
      <span class="title">Page Source Inspector</span>
      <span class="info" id="sourceInfo">Waiting for page source…</span>
    </summary>
    <div class="toolbar">
      <input type="search" class="search-box" id="searchBox" placeholder="Search elements…" aria-label="Search elements" title="Highlight XML text and find locator candidates by element tag or attribute value">
      <div class="toolbar-right">
        <button class="btn btn-secondary" id="formatButton">Format XML</button>
        <button class="btn btn-secondary" id="copyButton">Copy XML</button>
      </div>
    </div>
    <div class="viewer" title="Drag the bottom-right corner to resize vertically">
      <pre class="xml-content empty" id="xmlContent">Waiting for page source…</pre>
    </div>
    <section class="locators" aria-labelledby="locatorsHeading">
      <div class="section-header">
        <h2 id="locatorsHeading">Locator candidates</h2>
        <button class="btn" id="generateButton">Find locators</button>
      </div>
      <p class="hint">Find locators for elements matching the search text in their type or attributes (name, label, text, ID, etc.). Matches ignore case and may include hidden elements. Fetches fresh XML; leave search blank for the default candidate list.</p>
      <div id="locatorResults" hidden>
        <p id="locatorStatus" role="status" aria-live="polite"></p>
        <div class="locator-results" id="locatorOutput"></div>
      </div>
    </section>
  </details>
  <script>
    (() => {
      const PAGE_SOURCE_PREFIX = 'Page source retrieved successfully: \\n\\\`\\\`\\\`xml ';
      const xmlContent = document.getElementById('xmlContent');
      const sourceInfo = document.getElementById('sourceInfo');
      const searchBox = document.getElementById('searchBox');
      const generateButton = document.getElementById('generateButton');
      const locatorResults = document.getElementById('locatorResults');
      const locatorStatus = document.getElementById('locatorStatus');
      const locatorOutput = document.getElementById('locatorOutput');
      let source = '';
      let savedFile;
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
        savedFile = undefined;
        const textBlock = result && Array.isArray(result.content)
          ? result.content.find((item) => item && item.type === 'text' && typeof item.text === 'string')
          : undefined;
        if (!textBlock) {
          return '';
        }

        let text = textBlock.text;
        try {
          const metadata = JSON.parse(text);
          if (typeof metadata.filepath === 'string' && typeof metadata.bytes === 'number') {
            savedFile = metadata;
            return '';
          }
        } catch { /* Inline XML is not JSON. */ }
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
        if (savedFile) {
          sourceInfo.textContent = savedFile.bytes + ' bytes saved';
          xmlContent.textContent = 'Saved on the MCP server: ' + savedFile.filepath + '\\nCall appium_get_page_source with saveToFile=false to inspect the XML here.';
          return;
        }
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
          if (!documentNode.documentElement || documentNode.getElementsByTagName('parsererror').length) {
            throw new Error('Invalid XML');
          }

          function indentElement(element, depth) {
            if (element.getAttribute('xml:space') === 'preserve') return;
            const children = Array.from(element.childNodes);
            const hasMixedContent = children.some((child) =>
              child.nodeType === 4 || (child.nodeType === 3 && (child.nodeValue || '').trim()),
            );
            if (hasMixedContent || !children.some((child) => child.nodeType === 1)) return;

            for (const child of children) {
              if (child.nodeType === 3) {
                element.removeChild(child);
                continue;
              }
              if (child.nodeType === 1) indentElement(child, depth + 1);
              element.insertBefore(documentNode.createTextNode('\\n' + '  '.repeat(depth + 1)), child);
            }
            element.appendChild(documentNode.createTextNode('\\n' + '  '.repeat(depth)));
          }

          indentElement(documentNode.documentElement, 0);
          const serializer = new XMLSerializer();
          let formattedSource = Array.from(documentNode.childNodes)
            .filter((node) => node.nodeType !== 3)
            .map((node) => serializer.serializeToString(node))
            .join('\\n');
          const declaration = source.match(/^\\s*(<\\?xml\\s[^?]*\\?>)/);
          if (declaration && !formattedSource.startsWith('<?xml ')) {
            formattedSource = declaration[1] + '\\n' + formattedSource;
          }

          source = formattedSource;
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

      function renderLocators(elements) {
        locatorOutput.textContent = '';
        elements.forEach((element, index) => {
          const card = document.createElement('details');
          card.className = 'locator-card';
          card.open = index === 0;
          const heading = document.createElement('summary');
          const label = element.text || element.contentDesc || element.resourceId;
          heading.textContent = (index + 1) + '. ' + (label || element.tagName || 'Element');
          if (label && element.tagName) {
            const type = document.createElement('span');
            type.className = 'element-type';
            type.textContent = element.tagName;
            heading.appendChild(type);
          }
          card.appendChild(heading);
          const entries = Object.entries(element.locators || {}).filter(([, value]) => typeof value === 'string');
          entries.forEach(([strategy, selector]) => {
            const row = document.createElement('div');
            row.className = 'locator-row';
            const name = document.createElement('span');
            name.className = 'strategy';
            name.textContent = strategy;
            const code = document.createElement('pre');
            code.className = 'selector';
            code.textContent = selector;
            row.appendChild(name);
            row.appendChild(code);
            card.appendChild(row);
          });
          if (!entries.length) {
            const empty = document.createElement('p');
            empty.className = 'locator-row hint';
            empty.textContent = 'No candidate selectors for this element.';
            card.appendChild(empty);
          }
          locatorOutput.appendChild(card);
        });
      }

      async function generateLocators() {
        if (generateButton.disabled) return;
        const query = searchBox.value.trim();
        generateButton.disabled = true;
        locatorResults.hidden = false;
        locatorStatus.textContent = 'Fetching XML and generating candidates…';
        locatorOutput.textContent = '';
        try {
          const result = await sendRequest('tools/call', {name: 'generate_locators', arguments: query ? {query} : {}});
          const text = (result?.content || []).filter((item) => item.type === 'text').map((item) => item.text).join('\\n');
          if (result?.isError) throw new Error(text || 'Tool returned an error');
          const data = JSON.parse(text);
          if (!Array.isArray(data.interactableElements)) throw new Error('No locator data returned');
          const elements = data.interactableElements;
          locatorStatus.textContent = query
            ? (elements.length ? elements.length + ' matching elements' : 'No matching elements') + ' for “' + query + '” in freshly fetched XML.'
            : elements.length
              ? 'Candidates generated for ' + elements.length + ' elements from freshly fetched XML.'
              : 'No supported elements found in the fetched XML.';
          renderLocators(elements);
        } catch (error) {
          locatorStatus.textContent = 'Failed to generate locators: ' + error.message;
        } finally {
          generateButton.disabled = false;
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
        .then(() => {
          sendNotification('ui/notifications/initialized', {});
          // Let flexible MCP App hosts follow resizing and details expansion.
          if (typeof ResizeObserver !== 'undefined') {
            let previousHeight;
            const observer = new ResizeObserver(() => {
              const height = Math.ceil(document.body.getBoundingClientRect().height);
              if (height !== previousHeight) {
                previousHeight = height;
                sendNotification('ui/notifications/size-changed', {height});
              }
            });
            observer.observe(document.body);
          }
        })
        .catch(() => {
          sourceInfo.textContent = 'Unable to initialize inspector';
        });
    })();
  </script>
</body>
</html>
  `;
}
